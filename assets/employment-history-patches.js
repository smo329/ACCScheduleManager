/*
 * ACC Schedule Manager - Employment history / historical schedule visibility
 */
(function () {
  "use strict";

  const VERSION = "2026.08.14.1";
  let employmentPeriodsByUser = {};

  console.info(`[ACC Schedule Manager] employment history patch loaded: ${VERSION}`);

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function currentWeekRange() {
    const dates = getWeekDates();
    return {
      start: getDateKey(dates[0]),
      end: getDateKey(dates[6])
    };
  }

  function periodOverlapsWeek(period, weekStart, weekEnd) {
    return (
      period.start_date <= weekEnd &&
      (!period.end_date || period.end_date >= weekStart)
    );
  }

  function employeeVisibleThisWeek(profile) {
    if (!profile || profile.role !== "employee") return false;

    const { start, end } = currentWeekRange();
    const periods = employmentPeriodsByUser[profile.id] || [];

    if (!periods.length) {
      return profile.active === true;
    }

    return periods.some(period =>
      periodOverlapsWeek(period, start, end)
    );
  }

  async function loadEmploymentPeriods() {
    const { data, error } = await supabaseClient
      .from("employment_periods")
      .select("id,user_id,start_date,end_date")
      .order("start_date", { ascending: true });

    if (error) {
      console.warn("Unable to load employment history:", error);
      return;
    }

    employmentPeriodsByUser = {};

    (data || []).forEach(period => {
      if (!employmentPeriodsByUser[period.user_id]) {
        employmentPeriodsByUser[period.user_id] = [];
      }
      employmentPeriodsByUser[period.user_id].push(period);
    });
  }

  if (typeof loadWeek === "function") {
    const originalLoadWeek = loadWeek;

    loadWeek = async function (...args) {
      const result = await originalLoadWeek.apply(this, args);
      await loadEmploymentPeriods();
      renderSchedule();
      return result;
    };
  }

  if (typeof canEditProfile === "function") {
    const originalCanEditProfile = canEditProfile;

    canEditProfile = function (profile) {
      if (profile && profile.role === "employee" && profile.active !== true) {
        return false;
      }

      return originalCanEditProfile(profile);
    };
  }

  if (typeof renderClinicBody === "function") {
    renderClinicBody = function (clinicSite, bodyId) {
      const body = document.getElementById(bodyId);
      body.innerHTML = "";

      const clinicProfiles = profiles.filter(
        profile =>
          profile.clinic_site === clinicSite &&
          employeeVisibleThisWeek(profile)
      );

      if (!clinicProfiles.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = currentProfile.role === "admin" ? 13 : 12;
        cell.className = "empty-cell";
        cell.textContent = "No employees assigned to this clinic for this week.";

        row.appendChild(cell);
        body.appendChild(row);
      } else {
        clinicProfiles.forEach(profile => {
          const row = createWeeklyEmployeeRow(profile);

          if (profile.active !== true) {
            row.classList.add("historical-employee-row");

            const nameCell = row.querySelector(".employee-name");
            if (nameCell) {
              nameCell.title =
                "Former employee — shown because this week falls within their employment history.";
            }
          }

          body.appendChild(row);
        });
      }

      if (currentProfile.role === "admin") {
        body.appendChild(createClinicCapacityRow(clinicSite));
      }

      body.appendChild(
        createClinicAvailabilityRow(
          clinicSite,
          clinicProfiles
        )
      );
    };
  }

  function ensureEmploymentStartField() {
    const clinicSelect = document.getElementById("newClinicSite");
    if (!clinicSelect) return null;

    if (document.getElementById("newEmploymentStartDate")) {
      return document.getElementById("newEmploymentStartDate");
    }

    const clinicGroup = clinicSelect.closest(".form-group");
    if (!clinicGroup) return null;

    const group = document.createElement("div");
    group.className = "form-group";
    group.id = "newEmploymentStartDateGroup";

    group.innerHTML = `
      <label for="newEmploymentStartDate">Employment Start Date</label>
      <input id="newEmploymentStartDate" type="date" value="${todayKey()}">
      <div style="font-size:12px;color:#64748b;margin-top:4px;">
        Used for Employee accounts so mid-period starts display correctly.
      </div>
    `;

    clinicGroup.insertAdjacentElement("afterend", group);
    return group.querySelector("input");
  }

  if (typeof openAddEmployeeSection === "function") {
    const originalOpenAddEmployeeSection = openAddEmployeeSection;

    openAddEmployeeSection = function (...args) {
      const result = originalOpenAddEmployeeSection.apply(this, args);
      ensureEmploymentStartField();
      return result;
    };
  }

  if (typeof clearAddEmployeeForm === "function") {
    const originalClearAddEmployeeForm = clearAddEmployeeForm;

    clearAddEmployeeForm = function (...args) {
      const result = originalClearAddEmployeeForm.apply(this, args);
      const start = document.getElementById("newEmploymentStartDate");
      if (start) start.value = todayKey();
      return result;
    };
  }

  if (typeof addEmployee === "function") {
    addEmployee = async function () {
      const firstName = document.getElementById("newFirstName").value.trim();
      const lastName = document.getElementById("newLastName").value.trim();
      const email = document.getElementById("newEmail").value.trim();
      const password = document.getElementById("newPassword").value;
      const role = document.getElementById("newRole").value;
      const clinicSite = document.getElementById("newClinicSite").value;
      const startDate =
        document.getElementById("newEmploymentStartDate")?.value ||
        todayKey();

      const errorBox = document.getElementById("adminError");
      const button = document.getElementById("addEmployeeButton");

      errorBox.style.display = "none";

      if (!firstName || !lastName || !email || !password || !clinicSite) {
        errorBox.textContent = "Please complete all fields.";
        errorBox.style.display = "block";
        return;
      }

      if (role === "employee" && !startDate) {
        errorBox.textContent = "Employment start date is required for employees.";
        errorBox.style.display = "block";
        return;
      }

      if (password.length < 8) {
        errorBox.textContent =
          "Temporary password must be at least 8 characters.";
        errorBox.style.display = "block";
        return;
      }

      button.disabled = true;
      button.textContent = "Adding...";

      const { data, error } =
        await supabaseClient.functions.invoke(
          "create-user",
          {
            body: {
              email,
              password,
              first_name: firstName,
              last_name: lastName,
              role,
              clinic_site: clinicSite,
              employment_start_date: startDate
            }
          }
        );

      button.disabled = false;
      button.textContent = "Add Employee";

      if (error || data?.error) {
        errorBox.textContent =
          data?.error ||
          error?.message ||
          "Unable to add employee.";
        errorBox.style.display = "block";
        return;
      }

      clearAddEmployeeForm();
      closeAddEmployeeSection();

      await loadWeek();
      renderPeopleList();

      alert(`${firstName} ${lastName} was added successfully.`);
    };
  }

  if (typeof setPersonActive === "function") {
    setPersonActive = async function (profile, active) {
      let dateValue;

      if (profile.role === "employee") {
        dateValue = prompt(
          active
            ? "Employment start date for this active period (YYYY-MM-DD):"
            : "Last active employment date (YYYY-MM-DD):",
          todayKey()
        );

        if (dateValue === null) return;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim())) {
          alert("Please enter the date as YYYY-MM-DD.");
          return;
        }

        dateValue = dateValue.trim();
      }

      const confirmed = confirm(
        active
          ? `Activate ${getProfileName(profile)}?`
          : `Deactivate ${getProfileName(profile)}? Their historical schedule will remain visible for their employment dates.`
      );

      if (!confirmed) return;

      const body = {
        action: active ? "activate" : "deactivate",
        user_id: profile.id
      };

      if (profile.role === "employee") {
        if (active) {
          body.employment_start_date = dateValue;
        } else {
          body.employment_end_date = dateValue;
        }
      }

      const success = await invokeManageUser(body);
      if (!success) return;

      await loadWeek();
      renderPeopleList();
    };
  }

  // Employment Dates editor, Oct 21 2026: previously this used two successive
  // browser prompt() dialogs (start date, then end date, typed as YYYY-MM-DD
  // with no calendar picker). It now expands inline in the person's card with
  // two separate <input type="date"> fields — start and end — so the browser's
  // native calendar picker is available for quick dates, and no prompt/alert
  // is used for entering the dates. End date left blank means currently
  // employed. The save payload (set_employment_period, latest period id) is
  // unchanged from the prompt version.
  async function editEmploymentHistory(profile, button) {
    if (!profile || profile.role !== "employee") return;

    // Toggle: clicking Employment Dates again closes an already-open editor.
    const card = button?.closest(".person-card")
      || document.getElementById("peopleList")?.children[
        profiles.findIndex(p => p.id === profile.id)
      ] || null;
    const existing = card?.querySelector(".employment-dates-editor");
    if (existing) {
      existing.remove();
      return;
    }

    await loadEmploymentPeriods();

    const periods = employmentPeriodsByUser[profile.id] || [];
    const latest = periods.length ? periods[periods.length - 1] : null;

    const editor = document.createElement("div");
    editor.className = "employment-dates-editor";
    editor.innerHTML = `
      <div class="form-group" style="margin:0;">
        <label>Start date</label>
        <input class="employment-start-input" type="date" value="${latest?.start_date || todayKey()}">
      </div>
      <div class="form-group" style="margin:0;">
        <label>End date</label>
        <input class="employment-end-input" type="date" value="${latest?.end_date || ""}">
      </div>
      <div class="employment-dates-note" style="grid-column:1 / -1;font-size:12px;color:#64748b;">
        Leave the end date blank if currently employed.
      </div>
      <div class="employment-dates-error" style="display:none;grid-column:1 / -1;font-size:12px;color:#b91c1c;"></div>
      <div style="grid-column:1 / -1;display:flex;gap:8px;">
        <button type="button" class="modal-button save-button employment-dates-save">Save Dates</button>
        <button type="button" class="modal-button cancel-button employment-dates-cancel">Cancel</button>
      </div>
    `;

    const host = card || document.getElementById("peopleList");
    if (!host) return;
    host.appendChild(editor);

    const startInput = editor.querySelector(".employment-start-input");
    const endInput = editor.querySelector(".employment-end-input");
    const errorBox = editor.querySelector(".employment-dates-error");
    const saveButton = editor.querySelector(".employment-dates-save");

    const showError = (message) => {
      errorBox.textContent = message;
      errorBox.style.display = "block";
    };

    editor.querySelector(".employment-dates-cancel").onclick = () => editor.remove();

    saveButton.onclick = async () => {
      const startDate = startInput.value;
      const endDate = endInput.value;
      errorBox.style.display = "none";

      if (!startDate) {
        showError("Please choose a start date.");
        return;
      }
      if (endDate && endDate < startDate) {
        showError("End date must be on or after the start date.");
        return;
      }

      saveButton.disabled = true;
      saveButton.textContent = "Saving...";

      const success = await invokeManageUser({
        action: "set_employment_period",
        user_id: profile.id,
        period_id: latest?.id || null,
        start_date: startDate,
        end_date: endDate || null
      });

      if (!success) {
        saveButton.disabled = false;
        saveButton.textContent = "Save Dates";
        showError("Unable to save employment dates. Please try again.");
        return;
      }

      await loadWeek();
      renderPeopleList();
    };
  }

  function addEmploymentButtons() {
    if (!currentProfile || currentProfile.role !== "admin") return;

    const container = document.getElementById("peopleList");
    if (!container) return;

    profiles.forEach((profile) => {
      if (profile.role !== "employee") return;

      const card = container.querySelector(`.person-card[data-user-id="${profile.id}"]`);
      if (!card || card.querySelector(".employment-dates-button")) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "modal-button cancel-button employment-dates-button";
      button.textContent = "Employment Dates";
      button.onclick = () => editEmploymentHistory(profile, button);

      const buttons = card.querySelector(".person-buttons");
      if (buttons) {
        /* Keep Employment Dates on the same row as Change Picks: the two
           together are just wide enough to wrap in the 300px buttons
           column, so wrap them in one nowrap flex item instead of
           appending the dates button after it. */
        const changePicks = Array.from(buttons.querySelectorAll("button")).find(
          (b) => b.textContent.trim() === "Change Picks"
        );
        if (changePicks) {
          const pair = document.createElement("span");
          pair.style.cssText = "display:inline-flex;gap:6px;align-items:center;";
          changePicks.replaceWith(pair);
          pair.appendChild(changePicks);
          pair.appendChild(button);
        } else {
          buttons.appendChild(button);
        }
      } else {
        card.appendChild(button);
      }
    });
  }

  if (typeof renderPeopleList === "function") {
    const originalRenderPeopleList = renderPeopleList;

    renderPeopleList = function (...args) {
      const result = originalRenderPeopleList.apply(this, args);
      addEmploymentButtons();
      return result;
    };
  }

  const style = document.createElement("style");
  style.textContent = `
    .historical-employee-row .employee-name::after {
      content: " • Former";
      display:block;
      margin-top:2px;
      font-size:10px;
      font-weight:600;
      color:#64748b;
    }

    .acc-dark .historical-employee-row .employee-name::after {
      color:#94a3b8;
    }

    .employment-dates-editor {
      grid-column: 1 / -1;
      margin-top: 10px;
      padding: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .employment-dates-editor .form-group label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 4px;
    }
    .employment-dates-editor input[type="date"] {
      width: 100%;
      padding: 8px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 14px;
    }
  `;
  document.head.appendChild(style);

  loadEmploymentPeriods().catch(error =>
    console.warn("Employment history initialization failed:", error)
  );
})();
