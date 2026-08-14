/* ACC Schedule Manager - External Shift Worker support */
(function () {
  "use strict";

  const VERSION = "2026.08.14.2";
  console.info(`[ACC Schedule Manager] external shift worker patch loaded: ${VERSION}`);

  function isExternal() {
    return Boolean(currentProfile && currentProfile.role === "external" && currentProfile.active !== false);
  }

  function labelForRole(role) {
    if (role === "admin") return "Administrator";
    if (role === "manager") return "Clinic Manager";
    if (role === "external") return "External Shift Worker";
    return "Employee";
  }

  function fmtHour(value) {
    const h = Number(value);
    if (!Number.isFinite(h)) return "—";
    if (h === 12) return "12 PM";
    if (h === 0 || h === 24) return "12 AM";
    return h < 12 ? `${h} AM` : `${h - 12} PM`;
  }

  function options(from, to, selected) {
    let html = "";
    for (let h = from; h <= to; h++) {
      html += `<option value="${h}" ${h === selected ? "selected" : ""}>${fmtHour(h)}</option>`;
    }
    return html;
  }

  function ensureRoleOptions() {
    const roleSelect = document.getElementById("newRole");
    const clinicSelect = document.getElementById("newClinicSite");
    if (!roleSelect || !clinicSelect) return;

    if (![...roleSelect.options].some(o => o.value === "manager")) {
      const option = document.createElement("option");
      option.value = "manager";
      option.textContent = "Clinic Manager";
      roleSelect.appendChild(option);
    }

    if (![...roleSelect.options].some(o => o.value === "external")) {
      const option = document.createElement("option");
      option.value = "external";
      option.textContent = "External Shift Worker";
      roleSelect.appendChild(option);
    }

    if (![...clinicSelect.options].some(o => o.value === "")) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Not applicable";
      clinicSelect.insertBefore(option, clinicSelect.firstChild);
    }

    const sync = () => {
      const external = roleSelect.value === "external";
      clinicSelect.disabled = external;
      if (external) {
        if (clinicSelect.value !== "") clinicSelect.value = "";
      } else if (!clinicSelect.value) {
        clinicSelect.value = "Turfland";
      }
    };

    if (!roleSelect.dataset.externalRoleBound) {
      roleSelect.dataset.externalRoleBound = "1";
      roleSelect.addEventListener("change", sync);
    }
    sync();
  }

  const originalAddEmployee = typeof addEmployee === "function" ? addEmployee : null;
  if (originalAddEmployee) {
    window.addEmployee = async function () {
      const role = document.getElementById("newRole")?.value;
      if (role !== "external") return originalAddEmployee.apply(this, arguments);

      const firstName = document.getElementById("newFirstName")?.value.trim() || "";
      const lastName = document.getElementById("newLastName")?.value.trim() || "";
      const email = document.getElementById("newEmail")?.value.trim() || "";
      const password = document.getElementById("newPassword")?.value || "";
      const errorBox = document.getElementById("adminError");
      const button = document.getElementById("addEmployeeButton");

      if (errorBox) errorBox.style.display = "none";
      if (!firstName || !lastName || !email || !password) {
        if (errorBox) {
          errorBox.textContent = "First name, last name, email, and temporary password are required.";
          errorBox.style.display = "block";
        }
        return;
      }
      if (password.length < 8) {
        if (errorBox) {
          errorBox.textContent = "Temporary password must be at least 8 characters.";
          errorBox.style.display = "block";
        }
        return;
      }

      if (button) { button.disabled = true; button.textContent = "Adding..."; }
      try {
        const { data, error } = await supabaseClient.functions.invoke("create-user", {
          body: {
            email,
            password,
            first_name: firstName,
            last_name: lastName,
            role: "external",
            clinic_site: null
          }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (typeof clearAddEmployeeForm === "function") clearAddEmployeeForm();
        if (typeof closeAddEmployeeSection === "function") closeAddEmployeeSection();
        if (typeof loadWeek === "function") await loadWeek();
        if (typeof renderPeopleList === "function") renderPeopleList();
        alert(`${firstName} ${lastName} was added as an External Shift Worker.`);
      } catch (error) {
        console.error(error);
        if (errorBox) {
          errorBox.textContent = error.message || "Unable to add external shift worker.";
          errorBox.style.display = "block";
        }
      } finally {
        if (button) { button.disabled = false; button.textContent = "Add Person"; }
      }
    };
  }

  function polishPeopleList() {
    const cards = [...document.querySelectorAll("#peopleList .person-card")];
    if (!cards.length || typeof profiles === "undefined") return;

    cards.forEach((card, index) => {
      const profile = profiles[index];
      if (!profile) return;
      const children = [...card.children];

      if (children[1] && profile.role === "external") {
        const desired = "Open shifts only · No primary clinic";
        if (children[1].textContent !== desired) children[1].textContent = desired;
      }

      if (children[2]) {
        const desiredRole = labelForRole(profile.role);
        if (children[2].textContent !== desiredRole) children[2].textContent = desiredRole;
      }

      if (profile.role !== "employee") {
        card.querySelectorAll("button").forEach(button => {
          if (["Open Picks", "Close Picks"].includes(button.textContent.trim())) button.remove();
        });
      }
    });
  }

  async function fetchExternalShiftData(periodId) {
    const { data: opps, error: oppError } = await supabaseClient
      .from("open_shift_opportunities")
      .select("id,shift_date,clinic_site,slot_number,start_hour,end_hour")
      .eq("period_id", periodId)
      .eq("status", "published")
      .order("shift_date", { ascending: true })
      .order("clinic_site", { ascending: true })
      .order("slot_number", { ascending: true });
    if (oppError) throw oppError;

    const ids = (opps || []).map(o => o.id);
    let claims = [];
    if (ids.length) {
      const { data, error } = await supabaseClient
        .from("open_shift_claims")
        .select("id,opportunity_id,user_id,start_hour,end_hour")
        .in("opportunity_id", ids)
        .order("start_hour", { ascending: true });
      if (error) throw error;
      claims = data || [];
    }
    return { opps: opps || [], claims };
  }

  function gapsFor(op, claims) {
    const rows = claims
      .filter(c => c.opportunity_id === op.id)
      .sort((a, b) => Number(a.start_hour) - Number(b.start_hour));
    const gaps = [];
    let cursor = Number(op.start_hour);
    rows.forEach(c => {
      const start = Number(c.start_hour);
      const end = Number(c.end_hour);
      if (start > cursor) gaps.push([cursor, start]);
      cursor = Math.max(cursor, end);
    });
    if (cursor < Number(op.end_hour)) gaps.push([cursor, Number(op.end_hour)]);
    return gaps;
  }

  let augmenting = false;
  async function augmentExternalSignups() {
    if (!isExternal() || augmenting) return;
    const modal = document.getElementById("openShiftsModal");
    if (!modal?.classList.contains("show")) return;
    const periodId = document.getElementById("openShiftPeriodSelect")?.value;
    const cards = [...document.querySelectorAll("#openShiftContent .open-shift-card")];
    if (!periodId || !cards.length) return;

    augmenting = true;
    try {
      const { opps, claims } = await fetchExternalShiftData(periodId);
      cards.forEach((card, index) => {
        const op = opps[index];
        if (!op || card.querySelector(".external-shift-signups")) return;

        const gaps = gapsFor(op, claims).filter(g => g[1] - g[0] >= 2);
        if (!gaps.length) return;

        const wrap = document.createElement("div");
        wrap.className = "external-shift-signups";
        wrap.innerHTML = `<div class="external-shift-note"><strong>External Shift Worker:</strong> choose any available block of at least 2 hours. The department employee 40-hour/leave rule does not apply to this account.</div>`;

        gaps.forEach(gap => {
          const box = document.createElement("div");
          box.className = "open-shift-signup external-open-shift-signup";
          box.dataset.opp = op.id;
          box.dataset.max = String(gap[1]);
          box.innerHTML = `
            <div><label>Start</label><select class="open-start">${options(gap[0], gap[1] - 2, gap[0])}</select></div>
            <div><label>End</label><select class="open-end">${options(gap[0] + 2, gap[1], gap[1])}</select></div>
            <button class="modal-button save-button external-claim-open-shift" type="button">Sign Up</button>`;

          const start = box.querySelector(".open-start");
          const end = box.querySelector(".open-end");
          start.addEventListener("change", () => {
            const minEnd = Number(start.value) + 2;
            const max = Number(box.dataset.max);
            const previous = Number(end.value);
            end.innerHTML = options(minEnd, max, Math.max(previous, minEnd));
          });

          box.querySelector(".external-claim-open-shift").onclick = async function () {
            const selectedStart = Number(start.value);
            const selectedEnd = Number(end.value);
            if (selectedEnd - selectedStart < 2) return;
            this.disabled = true;
            try {
              const { error } = await supabaseClient.from("open_shift_claims").insert({
                opportunity_id: op.id,
                user_id: currentUser.id,
                start_hour: selectedStart,
                end_hour: selectedEnd
              });
              if (error) throw error;
              const success = document.getElementById("openShiftSuccess");
              if (success) {
                success.textContent = `Signed up for ${fmtHour(selectedStart)}–${fmtHour(selectedEnd)}.`;
                success.style.display = "block";
              }
              document.getElementById("refreshOpenShifts")?.click();
            } catch (error) {
              console.error(error);
              const errorBox = document.getElementById("openShiftError");
              if (errorBox) {
                errorBox.textContent = error.message || "Unable to claim those hours. They may have just been taken.";
                errorBox.style.display = "block";
              }
              this.disabled = false;
            }
          };

          wrap.appendChild(box);
        });
        card.appendChild(wrap);
      });
    } catch (error) {
      console.error("Unable to add external shift signup controls:", error);
    } finally {
      augmenting = false;
    }
  }

  function ensureStyles() {
    if (document.getElementById("externalShiftWorkerStyles")) return;
    const style = document.createElement("style");
    style.id = "externalShiftWorkerStyles";
    style.textContent = `
      .external-shift-signups{margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0}
      .external-shift-note{margin-bottom:8px;padding:8px 10px;border-radius:7px;background:#ecfeff;border:1px solid #a5f3fc;color:#155e75;font-size:11px;line-height:1.4}
      .external-open-shift-signup{margin-top:7px}
      .acc-dark .external-shift-note{background:#083344;border-color:#155e75;color:#cffafe}
    `;
    document.head.appendChild(style);
  }

  /* Only polish immediately after the people list is deliberately rendered. */
  const originalRenderPeopleList = typeof renderPeopleList === "function" ? renderPeopleList : null;
  if (originalRenderPeopleList) {
    window.renderPeopleList = function () {
      const result = originalRenderPeopleList.apply(this, arguments);
      setTimeout(polishPeopleList, 0);
      return result;
    };
  }

  const originalOpenAdmin = typeof openAdmin === "function" ? openAdmin : null;
  if (originalOpenAdmin) {
    window.openAdmin = function () {
      const result = originalOpenAdmin.apply(this, arguments);
      setTimeout(() => {
        ensureRoleOptions();
        polishPeopleList();
      }, 0);
      return result;
    };
  }

  const originalOpenOpenShifts = window.openOpenShifts;
  if (typeof originalOpenOpenShifts === "function") {
    window.openOpenShifts = async function () {
      const result = await originalOpenOpenShifts.apply(this, arguments);
      if (isExternal()) setTimeout(augmentExternalSignups, 0);
      return result;
    };
  }

  /*
   * Observe only Open Shifts content for external signup cards.
   * Do NOT observe the whole document or Manage People; doing so creates
   * a feedback loop when role/site labels are polished.
   */
  let openShiftObserver = null;
  function attachOpenShiftObserver() {
    const content = document.getElementById("openShiftContent");
    if (!content || openShiftObserver) return;
    openShiftObserver = new MutationObserver(() => {
      if (isExternal()) setTimeout(augmentExternalSignups, 40);
    });
    openShiftObserver.observe(content, { childList: true, subtree: true });
  }

  ensureStyles();
  setTimeout(() => {
    ensureRoleOptions();
    polishPeopleList();
    attachOpenShiftObserver();
    const button = document.getElementById("openShiftsTopButton");
    if (button) button.onclick = window.openOpenShifts;
  }, 0);

  /* Open Shifts modal is created lazily, so retry observer attachment briefly. */
  setTimeout(attachOpenShiftObserver, 500);
  setTimeout(attachOpenShiftObserver, 1500);
})();
