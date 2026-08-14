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
          clinicProfiles.filter(profile => profile.active === true)
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

  async function editEmploymentHistory(profile) {
    if (!profile || profile.role !== "employee") return;

    await loadEmploymentPeriods();

    const periods = employmentPeriodsByUser[profile.id] || [];
    const latest = periods.length ? periods[periods.length - 1] : null;

    const startDate = prompt(
      "Employment start date (YYYY-MM-DD):",
      latest?.start_date || todayKey()
    );

    if (startDate === null) return;

    const endDate = prompt(
      "Employment end date (YYYY-MM-DD), or leave blank if currently employed:",
      latest?.end_date || ""
    );

    if (endDate === null) return;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
      alert("Please enter a valid start date as YYYY-MM-DD.");
      return;
    }

    if (
      endDate.trim() &&
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())
    ) {
      alert("Please enter a valid end date as YYYY-MM-DD or leave it blank.");
      return;
    }

    const success = await invokeManageUser({
      action: "set_employment_period",
      user_id: profile.id,
      period_id: latest?.id || null,
      start_date: startDate.trim(),
      end_date: endDate.trim() || null
    });

    if (!success) return;

    await loadWeek();
    renderPeopleList();

    alert("Employment dates updated.");
  }

  function addEmploymentButtons() {
    if (!currentProfile || currentProfile.role !== "admin") return;

    const container = document.getElementById("peopleList");
    if (!container) return;

    const cards = [...container.children];

    profiles.forEach((profile, index) => {
      if (profile.role !== "employee") return;

      const card = cards[index];
      if (!card || card.querySelector(".employment-dates-button")) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "person-action employment-dates-button";
      button.textContent = "Employment Dates";
      button.onclick = () => editEmploymentHistory(profile);

      card.appendChild(button);
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
  `;
  document.head.appendChild(style);

  loadEmploymentPeriods().catch(error =>
    console.warn("Employment history initialization failed:", error)
  );
})();
