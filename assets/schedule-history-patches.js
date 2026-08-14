/*
 * ACC Schedule Manager - Schedule audit history
 * Admin-only viewer for immutable database audit records.
 */
(function () {
  "use strict";

  const VERSION = "2026.08.14.1";
  const MAX_ROWS = 500;
  console.info(`[ACC Schedule Manager] schedule history patch loaded: ${VERSION}`);

  function isAdmin() {
    return Boolean(currentProfile && currentProfile.role === "admin");
  }

  function profileNameById(id) {
    if (!id) return "System";
    const profile = (window.profiles || []).find(p => p.id === id);
    if (!profile) return "Unknown user";
    if (typeof getProfileName === "function") return getProfileName(profile);
    return `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Unknown user";
  }

  function esc(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value ?? "");
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function dateKey(date) {
    if (typeof getDateKey === "function") return getDateKey(date);
    return date.toISOString().slice(0, 10);
  }

  function dateFromKey(key) {
    if (typeof getDateFromKey === "function") return getDateFromKey(key);
    const [y,m,d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function getWeekStarts(period) {
    if (!period) return [];
    if (typeof getWeekStartDatesForPeriod === "function") {
      return getWeekStartDatesForPeriod(period);
    }
    const result = [];
    const cursor = dateFromKey(period.period_start);
    cursor.setDate(cursor.getDate() - cursor.getDay());
    const end = dateFromKey(period.period_end);
    while (cursor <= end) {
      result.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return result;
  }

  function fmtDate(key) {
    const d = dateFromKey(key);
    return new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", year: "numeric"
    }).format(d);
  }

  function fmtWhen(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit"
    }).format(new Date(value));
  }

  function ensureStyles() {
    if (document.getElementById("scheduleHistoryStyles")) return;
    const style = document.createElement("style");
    style.id = "scheduleHistoryStyles";
    style.textContent = `
      #scheduleHistoryModal .history-controls {
        display:grid; grid-template-columns:1.1fr 1fr 1fr auto;
        gap:10px; align-items:end; margin-bottom:14px;
      }
      #scheduleHistoryModal .history-controls .form-group { margin:0; }
      .history-summary { color:#64748b; font-size:12px; margin:4px 0 12px; }
      .history-table-wrap { width:100%; overflow:auto; -webkit-overflow-scrolling:touch; }
      .history-table { width:100%; min-width:850px; border-collapse:collapse; }
      .history-table th,.history-table td {
        padding:8px 9px; border-bottom:1px solid #e5e7eb; border-right:1px solid #e5e7eb;
        height:auto; font-size:12px; text-align:left; vertical-align:top;
      }
      .history-table th { background:#f8fafc; color:#17365d; position:sticky; top:0; z-index:1; }
      .history-change { font-weight:600; }
      .history-old { color:#991b1b; text-decoration:line-through; }
      .history-arrow { color:#64748b; padding:0 5px; }
      .history-new { color:#166534; }
      .history-badge { display:inline-block; padding:3px 7px; border-radius:999px; font-size:10px; font-weight:700; }
      .history-insert { background:#dcfce7; color:#166534; }
      .history-update { background:#dbeafe; color:#1e40af; }
      .history-delete { background:#fee2e2; color:#991b1b; }
      @media (max-width:760px) {
        #scheduleHistoryModal .history-controls { grid-template-columns:1fr; }
        #scheduleHistoryModal .history-controls button { width:100%; }
        .history-table { min-width:720px; }
        .history-table th:first-child,.history-table td:first-child {
          position:sticky; left:0; background:white; z-index:2;
        }
        .history-table th:first-child { background:#f8fafc; z-index:3; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    let modal = document.getElementById("scheduleHistoryModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "scheduleHistoryModal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal modal-wide">
        <div class="modal-header">
          <div class="modal-title">Schedule History</div>
          <button class="modal-close" type="button" id="closeScheduleHistory">×</button>
        </div>
        <div class="modal-body modal-scroll">
          <div class="history-controls">
            <div class="form-group">
              <label for="historyQuarterSelect">Quarter</label>
              <select id="historyQuarterSelect"></select>
            </div>
            <div class="form-group">
              <label for="historyEmployeeSelect">Employee</label>
              <select id="historyEmployeeSelect"></select>
            </div>
            <div class="form-group">
              <label for="historyWeekSelect">Week</label>
              <select id="historyWeekSelect"></select>
            </div>
            <button id="refreshScheduleHistory" class="modal-button save-button" type="button">Refresh</button>
          </div>
          <div id="historySummary" class="history-summary"></div>
          <div id="historyContent" class="history-table-wrap">
            <div style="padding:20px;color:#64748b;">Loading history...</div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="closeScheduleHistoryFooter" class="modal-button cancel-button" type="button">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("#closeScheduleHistory").onclick = closeHistory;
    modal.querySelector("#closeScheduleHistoryFooter").onclick = closeHistory;
    modal.querySelector("#refreshScheduleHistory").onclick = loadHistory;
    modal.querySelector("#historyQuarterSelect").addEventListener("change", () => {
      populateWeekFilter();
      loadHistory();
    });
    modal.querySelector("#historyEmployeeSelect").addEventListener("change", loadHistory);
    modal.querySelector("#historyWeekSelect").addEventListener("change", loadHistory);
    return modal;
  }

  function closeHistory() {
    document.getElementById("scheduleHistoryModal")?.classList.remove("show");
  }

  function populateFilters() {
    const quarter = document.getElementById("historyQuarterSelect");
    const employee = document.getElementById("historyEmployeeSelect");
    if (!quarter || !employee) return;

    quarter.innerHTML = "";
    (window.allSchedulingPeriods || []).forEach(period => {
      const option = document.createElement("option");
      option.value = period.id;
      option.textContent = period.name;
      if (window.adminSchedulingPeriod && period.id === adminSchedulingPeriod.id) option.selected = true;
      quarter.appendChild(option);
    });

    employee.innerHTML = `<option value="">All employees</option>`;
    [...(window.profiles || [])]
      .filter(p => p.role !== "admin")
      .sort((a,b) => profileNameById(a.id).localeCompare(profileNameById(b.id)))
      .forEach(profile => {
        const option = document.createElement("option");
        option.value = profile.id;
        option.textContent = profileNameById(profile.id) + (profile.active ? "" : " (inactive)");
        employee.appendChild(option);
      });

    populateWeekFilter();
  }

  function selectedPeriod() {
    const id = document.getElementById("historyQuarterSelect")?.value;
    return (window.allSchedulingPeriods || []).find(p => p.id === id) || null;
  }

  function populateWeekFilter() {
    const week = document.getElementById("historyWeekSelect");
    if (!week) return;
    week.innerHTML = `<option value="">All weeks</option>`;
    const period = selectedPeriod();
    getWeekStarts(period).forEach(start => {
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const option = document.createElement("option");
      option.value = dateKey(start);
      option.textContent = `${new Intl.DateTimeFormat("en-US", {month:"short",day:"numeric"}).format(start)} – ${new Intl.DateTimeFormat("en-US", {month:"short",day:"numeric"}).format(end)}`;
      week.appendChild(option);
    });
  }

  function describeChange(row) {
    const oldCode = row.old_schedule_code ?? "—";
    const newCode = row.new_schedule_code ?? "—";
    const oldSite = row.old_work_site ?? "—";
    const newSite = row.new_work_site ?? "—";

    if (row.action === "insert") {
      return `<span class="history-new">${esc(newCode)}</span>${newSite !== "—" ? ` · ${esc(newSite)}` : ""}`;
    }
    if (row.action === "delete") {
      return `<span class="history-old">${esc(oldCode)}</span>${oldSite !== "—" ? ` · ${esc(oldSite)}` : ""}`;
    }

    const pieces = [];
    if (oldCode !== newCode) {
      pieces.push(`<span class="history-old">${esc(oldCode)}</span><span class="history-arrow">→</span><span class="history-new">${esc(newCode)}</span>`);
    }
    if (oldSite !== newSite) {
      pieces.push(`Location: <span class="history-old">${esc(oldSite)}</span><span class="history-arrow">→</span><span class="history-new">${esc(newSite)}</span>`);
    }
    return pieces.join("<br>") || "No visible schedule-field change";
  }

  async function loadHistory() {
    if (!isAdmin()) return;
    const content = document.getElementById("historyContent");
    const summary = document.getElementById("historySummary");
    const period = selectedPeriod();
    if (!content || !summary || !period) return;

    content.innerHTML = `<div style="padding:20px;color:#64748b;">Loading history...</div>`;

    let start = period.period_start;
    let end = period.period_end;
    const weekKey = document.getElementById("historyWeekSelect")?.value;
    if (weekKey) {
      start = weekKey;
      const endDate = dateFromKey(weekKey);
      endDate.setDate(endDate.getDate() + 6);
      end = dateKey(endDate);
    }

    let query = supabaseClient
      .from("schedule_audit_log")
      .select("id,actor_user_id,target_user_id,schedule_date,action,old_schedule_code,new_schedule_code,old_work_site,new_work_site,changed_at")
      .gte("schedule_date", start)
      .lte("schedule_date", end)
      .order("changed_at", { ascending: false })
      .limit(MAX_ROWS);

    const employeeId = document.getElementById("historyEmployeeSelect")?.value;
    if (employeeId) query = query.eq("target_user_id", employeeId);

    const { data, error } = await query;
    if (error) {
      console.error("Unable to load schedule history:", error);
      content.innerHTML = `<div style="padding:16px;color:#991b1b;">Unable to load schedule history: ${esc(error.message)}</div>`;
      summary.textContent = "";
      return;
    }

    const rows = data || [];
    summary.textContent = rows.length === MAX_ROWS
      ? `Showing the newest ${MAX_ROWS} changes for this filter.`
      : `${rows.length} change${rows.length === 1 ? "" : "s"} found.`;

    if (!rows.length) {
      content.innerHTML = `<div style="padding:22px;color:#64748b;text-align:center;">No schedule changes found for this selection.</div>`;
      return;
    }

    content.innerHTML = `
      <table class="history-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Changed By</th>
            <th>Employee</th>
            <th>Schedule Date</th>
            <th>Action</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${esc(fmtWhen(row.changed_at))}</td>
              <td>${esc(profileNameById(row.actor_user_id))}</td>
              <td>${esc(profileNameById(row.target_user_id))}</td>
              <td>${esc(fmtDate(row.schedule_date))}</td>
              <td><span class="history-badge history-${esc(row.action)}">${esc(row.action.toUpperCase())}</span></td>
              <td class="history-change">${describeChange(row)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  window.openScheduleHistory = async function () {
    if (!isAdmin()) return;
    ensureStyles();
    const modal = ensureModal();
    populateFilters();
    modal.classList.add("show");
    await loadHistory();
  };

  function installButton() {
    if (!isAdmin()) return;
    if (document.getElementById("scheduleHistoryTopButton")) return;

    const anchor = document.getElementById("quarterDashboardTopButton") || document.getElementById("managePeopleTopButton") || document.getElementById("adminButton");
    if (!anchor) return;

    const button = document.createElement("button");
    button.id = "scheduleHistoryTopButton";
    button.className = anchor.className || "admin-button";
    button.type = "button";
    button.textContent = "History";
    button.onclick = window.openScheduleHistory;
    anchor.insertAdjacentElement("afterend", button);
  }

  if (typeof updateUserHeader === "function") {
    const original = updateUserHeader;
    updateUserHeader = function (...args) {
      const result = original.apply(this, args);
      setTimeout(installButton, 0);
      return result;
    };
  }

  ensureStyles();
  setTimeout(installButton, 0);
})();
