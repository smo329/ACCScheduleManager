/*
 * ACC Schedule Manager - Admin experience patch
 * Premium navigation owns all top-level navigation.
 * This file retains Manage People / Quarter Dashboard behavior
 * and admin daily-digest notification settings.
 */
(function () {
  "use strict";

  const VERSION = "2026.08.14.2";
  console.info(`[ACC Schedule Manager] admin experience patch loaded: ${VERSION}`);

  function isAdmin() {
    return Boolean(currentProfile && currentProfile.role === "admin");
  }

  function getAdminParts() {
    const modal = document.getElementById("adminModal");
    const quarterSelect = document.getElementById("adminQuarterSelect");

    return {
      modal,
      title: modal?.querySelector(".modal-title") || null,
      adminTop: modal?.querySelector(".admin-top") || null,
      addPerson: document.getElementById("addEmployeeSection"),
      peopleList: document.getElementById("peopleList"),
      quarterControls: quarterSelect
        ? quarterSelect.closest('div[style*="border:1px solid #e5e7eb"]')
        : null,
      quarterDashboard: modal?.querySelector(".quarter-dashboard") || null
    };
  }

  function showAdminSection(mode) {
    const parts = getAdminParts();
    if (!parts.modal) return;

    const peopleMode = mode === "people";

    if (parts.title) {
      parts.title.textContent = peopleMode ? "Manage People" : "Quarter Dashboard";
    }
    if (parts.adminTop) parts.adminTop.style.display = peopleMode ? "" : "none";
    if (parts.addPerson && !peopleMode) parts.addPerson.style.display = "none";
    if (parts.peopleList) parts.peopleList.style.display = peopleMode ? "" : "none";
    if (parts.quarterControls) parts.quarterControls.style.display = peopleMode ? "none" : "";
    if (parts.quarterDashboard) parts.quarterDashboard.style.display = peopleMode ? "none" : "";

    if (!peopleMode) {
      if (typeof closeAddEmployeeSection === "function") closeAddEmployeeSection();
      if (typeof renderAdminQuarterControls === "function") renderAdminQuarterControls();
      if (typeof renderQuarterDashboard === "function") renderQuarterDashboard();
    } else if (typeof renderPeopleList === "function") {
      renderPeopleList();
    }
  }

  window.openPeopleManagement = function () {
    if (!isAdmin()) return;
    openAdmin();
    showAdminSection("people");
  };

  window.openQuarterDashboardPanel = function () {
    if (!isAdmin()) return;
    openAdmin();
    showAdminSection("quarter");
  };

  // Legacy topbar navigation is retired. Keep the functions above for sidebar use,
  // but proactively remove any old controls created by cached/older modules.
  function retireLegacyAdminTopButtons() {
    ["adminButton","managePeopleTopButton","quarterDashboardTopButton","scheduleHistoryTopButton","archiveCenterTopButton","compactAdminMenuWrap"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    document.querySelectorAll('.topbar-user button').forEach(button => {
      const label = (button.textContent || '').trim().toLowerCase();
      if (["admin","admin ▾","manage people","quarter dashboard","history","archive","issues"].includes(label)) {
        button.remove();
      }
    });
  }

  function ensureAdminDigestUi() {
    if (!isAdmin()) {
      document.getElementById("adminDailyDigestSettings")?.remove();
      return null;
    }

    const employeeSection = document.getElementById("scheduleNotificationSettings");
    if (employeeSection) employeeSection.style.display = "none";
    const managerSection = document.getElementById("managerScheduleNotificationSettings");
    if (managerSection) managerSection.style.display = "none";

    const panel = document.querySelector('#accountSettingsShell .account-settings-tab[data-tab="notifications"]');
    if (!panel) return null;

    [...panel.children].forEach(child => {
      if (child.classList?.contains("account-settings-help") && child.textContent.includes("loading")) child.remove();
    });

    let section = document.getElementById("adminDailyDigestSettings");
    if (section) return section;

    section = document.createElement("div");
    section.id = "adminDailyDigestSettings";
    section.innerHTML = `
      <label style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;margin-bottom:14px;">
        <input id="adminDailyDigestEnabled" type="checkbox" style="width:auto;margin-top:3px;">
        <span><strong>Email me a daily summary when schedules are updated</strong>
        <span style="display:block;color:#64748b;font-size:12px;margin-top:3px;">One end-of-day email summarizes schedule, leave, and comment changes across both clinics.</span></span>
      </label>
      <div class="form-group"><label for="adminDailyDigestEmail">Notification Email</label><input id="adminDailyDigestEmail" type="email"><div id="adminDailyDigestHelp" class="account-settings-help"></div></div>
      <button id="saveAdminDailyDigestButton" class="modal-button save-button" type="button">Save Notification Settings</button>`;
    panel.appendChild(section);

    const enabled = section.querySelector("#adminDailyDigestEnabled");
    const email = section.querySelector("#adminDailyDigestEmail");
    enabled.addEventListener("change", () => { email.disabled = !enabled.checked; });
    section.querySelector("#saveAdminDailyDigestButton").onclick = saveAdminDigestPreferences;
    return section;
  }

  async function loadAdminDigestPreferences() {
    const section = ensureAdminDigestUi();
    if (!section || !currentUser) return;
    const enabled = section.querySelector("#adminDailyDigestEnabled");
    const email = section.querySelector("#adminDailyDigestEmail");
    const help = section.querySelector("#adminDailyDigestHelp");
    const loginEmail = currentUser.email || "";
    email.placeholder = loginEmail || "Your login email";
    help.textContent = loginEmail ? `Leave blank to use your login email: ${loginEmail}` : "Leave blank to use your login email.";

    const { data, error } = await supabaseClient.from("notification_preferences")
      .select(`manager_schedule_update_email_enabled,manager_schedule_update_email`)
      .eq("user_id", currentUser.id).maybeSingle();
    if (error) { console.warn("Unable to load admin daily digest preferences:", error); return; }
    enabled.checked = Boolean(data?.manager_schedule_update_email_enabled);
    email.value = data?.manager_schedule_update_email || "";
    email.disabled = !enabled.checked;
  }

  async function saveAdminDigestPreferences() {
    if (!isAdmin() || !currentUser) return;
    if (typeof clearAccountMessages === "function") clearAccountMessages();
    const enabled = document.getElementById("adminDailyDigestEnabled");
    const email = document.getElementById("adminDailyDigestEmail");
    const button = document.getElementById("saveAdminDailyDigestButton");
    if (!enabled || !email || !button) return;
    const alternateEmail = email.value.trim();
    if (alternateEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alternateEmail)) {
      if (typeof showAccountError === "function") showAccountError("Enter a valid notification email or leave it blank to use your login email.");
      return;
    }
    button.disabled = true; button.textContent = "Saving...";
    try {
      const { error } = await supabaseClient.from("notification_preferences").upsert({
        user_id: currentUser.id,
        manager_schedule_update_email_enabled: enabled.checked,
        manager_schedule_update_email: alternateEmail || null,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      const destination = alternateEmail || currentUser.email || "your login email";
      if (typeof showAccountMessage === "function") showAccountMessage(enabled.checked ? `Daily schedule summaries are on. The digest will be sent to ${destination}.` : "Daily schedule summary emails are off.");
    } catch (error) {
      console.error(error);
      if (typeof showAccountError === "function") showAccountError("Unable to save notification settings: " + (error.message || "Unknown error"));
    } finally {
      button.disabled = false; button.textContent = "Save Notification Settings";
    }
  }

  if (typeof updateUserHeader === "function") {
    const originalUpdateUserHeader = updateUserHeader;
    updateUserHeader = function (...args) {
      const result = originalUpdateUserHeader.apply(this, args);
      setTimeout(retireLegacyAdminTopButtons, 0);
      setTimeout(retireLegacyAdminTopButtons, 100);
      return result;
    };
  }

  if (typeof openAccountManager === "function") {
    const originalOpenAccountManager = openAccountManager;
    openAccountManager = function (...args) {
      const result = originalOpenAccountManager.apply(this, args);
      if (isAdmin()) setTimeout(() => { ensureAdminDigestUi(); loadAdminDigestPreferences().catch(error => console.warn("Admin daily digest settings load failed:", error)); }, 0);
      return result;
    };
  }

  retireLegacyAdminTopButtons();
  setTimeout(retireLegacyAdminTopButtons, 300);
  setTimeout(retireLegacyAdminTopButtons, 1200);
})();

(function () {
  if (!document.querySelector('script[src="assets/employment-history-patches.js"]')) {
    const script = document.createElement("script"); script.src = "assets/employment-history-patches.js"; script.defer = false; document.body.appendChild(script);
  }
})();
(function () {
  if (!document.querySelector('script[src="assets/account-request-patches.js"]')) {
    const script = document.createElement("script"); script.src = "assets/account-request-patches.js"; script.defer = false; document.body.appendChild(script);
  }
})();
(function () {
  if (!document.querySelector('script[src="assets/quarter-weekend-controls-patches.js"]')) {
    const script = document.createElement("script"); script.src = "assets/quarter-weekend-controls-patches.js"; script.defer = false; document.body.appendChild(script);
  }
})();
(function () {
  if (!document.querySelector('script[src="assets/schedule-history-patches.js"]')) {
    const script = document.createElement("script"); script.src = "assets/schedule-history-patches.js"; script.defer = false; document.body.appendChild(script);
  }
})();