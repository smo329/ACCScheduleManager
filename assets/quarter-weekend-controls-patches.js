/*
 * ACC Schedule Manager - Quarter weekend requirement controls
 * Moves monthly Turfland weekend overrides out of Manage People
 * and into the selected Quarter Dashboard.
 */
(function () {
  "use strict";

  const VERSION = "2026.08.14.1";
  console.info(`[ACC Schedule Manager] quarter weekend controls loaded: ${VERSION}`);

  function removeWeekendControlsFromPeople() {
    const peopleList = document.getElementById("peopleList");
    if (!peopleList) return;

    peopleList.querySelectorAll(".person-card").forEach(card => {
      Array.from(card.children).forEach(child => {
        const text = String(child.textContent || "").trim();
        if (text.startsWith("Weekend requirements:")) {
          child.remove();
        }
      });
    });
  }

  function createTargetSelect(profile, monthKey, count, target) {
    const wrap = document.createElement("div");
    wrap.className = "quarter-weekend-target-control";

    const countText = document.createElement("span");
    countText.className = count >= target
      ? "quarter-weekend-count met"
      : "quarter-weekend-count pending";
    countText.textContent = `${count} worked /`;

    const select = document.createElement("select");
    select.className = "quarter-weekend-target-select";
    select.setAttribute(
      "aria-label",
      `${getProfileName(profile)} ${getWeekendMonthLabel(monthKey)} weekend requirement`
    );

    for (let amount = 0; amount <= 10; amount++) {
      const option = document.createElement("option");
      option.value = String(amount);
      option.textContent = String(amount);
      option.selected = amount === Number(target);
      select.appendChild(option);
    }

    const suffix = document.createElement("span");
    suffix.className = "quarter-weekend-target-label";
    suffix.textContent = "required";

    select.addEventListener("change", async () => {
      select.disabled = true;

      try {
        await setMonthlyWeekendTargetForUser(
          profile.id,
          monthKey,
          select.value
        );

        /*
         * The existing save routine refreshes state in most paths.
         * Re-rendering here also keeps the count/target status color
         * synchronized immediately after an override is changed.
         */
        await renderQuarterDashboard();
        renderSchedule();
      } catch (error) {
        console.error(error);
        showError(
          error?.message ||
          "Unable to update the weekend requirement."
        );
        select.disabled = false;
      }
    });

    wrap.appendChild(countText);
    wrap.appendChild(select);
    wrap.appendChild(suffix);

    return wrap;
  }

  function renderQuarterWeekendRequirements() {
    const dashboard = document.getElementById("quarterDashboardContent");

    if (
      !dashboard ||
      !adminSchedulingPeriod ||
      !currentProfile ||
      currentProfile.role !== "admin"
    ) {
      return;
    }

    dashboard.querySelector("#quarterWeekendRequirementManager")?.remove();

    const turflandProfiles = profiles.filter(profile =>
      profile &&
      profile.active &&
      profile.role === "employee" &&
      profile.clinic_site === "Turfland"
    );

    const monthKeys = getPeriodMonthKeys(adminSchedulingPeriod);

    const section = document.createElement("section");
    section.id = "quarterWeekendRequirementManager";
    section.className = "quarter-weekend-manager";

    const header = document.createElement("div");
    header.className = "quarter-weekend-manager-header";
    header.innerHTML = `
      <div>
        <div class="quarter-weekend-manager-title">Weekend Requirements</div>
        <div class="quarter-weekend-manager-help">
          Turfland only · Edit the monthly weekend-date requirement for the selected quarter.
          Each Saturday or Sunday worked counts as one weekend date.
        </div>
      </div>
      <div class="quarter-weekend-manager-quarter">
        ${escapeHtml(adminSchedulingPeriod.name || "Selected Quarter")}
      </div>
    `;

    section.appendChild(header);

    if (!turflandProfiles.length || !monthKeys.length) {
      const empty = document.createElement("div");
      empty.className = "quarter-weekend-manager-empty";
      empty.textContent = "No active Turfland employees are available for this quarter.";
      section.appendChild(empty);
      dashboard.appendChild(section);
      return;
    }

    const tableWrap = document.createElement("div");
    tableWrap.className = "quarter-weekend-manager-table-wrap";

    const table = document.createElement("table");
    table.className = "quarter-weekend-manager-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    const employeeHeader = document.createElement("th");
    employeeHeader.textContent = "Employee";
    headerRow.appendChild(employeeHeader);

    monthKeys.forEach(monthKey => {
      const th = document.createElement("th");
      th.textContent = getWeekendMonthLabel(monthKey);
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    turflandProfiles.forEach(profile => {
      const row = document.createElement("tr");

      const employeeCell = document.createElement("td");
      employeeCell.className = "quarter-weekend-employee";
      employeeCell.textContent = getProfileName(profile);
      row.appendChild(employeeCell);

      monthKeys.forEach(monthKey => {
        const cell = document.createElement("td");

        const count = getWeekendDateCountForUser(
          profile.id,
          monthKey,
          adminSchedulingPeriod
        );

        const target = getMonthlyWeekendTargetForUser(
          profile.id,
          monthKey,
          adminSchedulingPeriod
        );

        cell.appendChild(
          createTargetSelect(
            profile,
            monthKey,
            count,
            target
          )
        );

        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    section.appendChild(tableWrap);
    dashboard.appendChild(section);
  }

  if (typeof renderPeopleList === "function") {
    const originalRenderPeopleList = renderPeopleList;

    renderPeopleList = function (...args) {
      const result = originalRenderPeopleList.apply(this, args);
      removeWeekendControlsFromPeople();
      return result;
    };
  }

  if (typeof renderQuarterDashboard === "function") {
    const originalRenderQuarterDashboard = renderQuarterDashboard;

    renderQuarterDashboard = async function (...args) {
      const result = await originalRenderQuarterDashboard.apply(this, args);
      renderQuarterWeekendRequirements();
      return result;
    };
  }

  const style = document.createElement("style");
  style.id = "quarterWeekendRequirementStyles";
  style.textContent = `
    .quarter-weekend-manager {
      margin:18px 0 0;
      padding:16px;
      border-top:1px solid #e2e8f0;
      background:#fff;
    }

    .quarter-weekend-manager-header {
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:16px;
      margin-bottom:12px;
    }

    .quarter-weekend-manager-title {
      color:#17365d;
      font-size:16px;
      font-weight:800;
    }

    .quarter-weekend-manager-help {
      margin-top:4px;
      color:#64748b;
      font-size:12px;
      line-height:1.45;
    }

    .quarter-weekend-manager-quarter {
      flex:0 0 auto;
      padding:5px 8px;
      border-radius:6px;
      background:#f1f5f9;
      color:#475569;
      font-size:12px;
      font-weight:700;
    }

    .quarter-weekend-manager-table-wrap {
      overflow-x:auto;
      border:1px solid #e2e8f0;
      border-radius:8px;
    }

    .quarter-weekend-manager-table {
      width:100%;
      border-collapse:collapse;
      min-width:560px;
    }

    .quarter-weekend-manager-table th,
    .quarter-weekend-manager-table td {
      padding:9px 10px;
      border-bottom:1px solid #e2e8f0;
      text-align:left;
      vertical-align:middle;
      font-size:12px;
    }

    .quarter-weekend-manager-table th {
      background:#f8fafc;
      color:#475569;
      font-weight:800;
    }

    .quarter-weekend-manager-table tbody tr:last-child td {
      border-bottom:0;
    }

    .quarter-weekend-employee {
      min-width:140px;
      color:#1e293b;
      font-weight:700;
    }

    .quarter-weekend-target-control {
      display:flex;
      align-items:center;
      gap:5px;
      white-space:nowrap;
    }

    .quarter-weekend-count.met {
      color:#166534;
      font-weight:700;
    }

    .quarter-weekend-count.pending {
      color:#92400e;
      font-weight:700;
    }

    .quarter-weekend-target-select {
      min-width:52px;
      padding:4px 6px;
      border:1px solid #cbd5e1;
      border-radius:5px;
      background:#fff;
    }

    .quarter-weekend-target-label {
      color:#64748b;
    }

    .quarter-weekend-manager-empty {
      padding:14px;
      border:1px dashed #cbd5e1;
      border-radius:7px;
      color:#64748b;
      font-size:13px;
    }

    .acc-dark .quarter-weekend-manager {
      background:#111827;
      border-color:#334155;
    }

    .acc-dark .quarter-weekend-manager-title,
    .acc-dark .quarter-weekend-employee {
      color:#f8fafc;
    }

    .acc-dark .quarter-weekend-manager-quarter,
    .acc-dark .quarter-weekend-manager-table th {
      background:#1e293b;
      color:#cbd5e1;
    }

    .acc-dark .quarter-weekend-manager-table-wrap,
    .acc-dark .quarter-weekend-manager-table th,
    .acc-dark .quarter-weekend-manager-table td,
    .acc-dark .quarter-weekend-manager-empty {
      border-color:#334155;
    }

    .acc-dark .quarter-weekend-target-select {
      background:#0f172a;
      color:#f8fafc;
      border-color:#475569;
    }
  `;

  document.head.appendChild(style);
})();
