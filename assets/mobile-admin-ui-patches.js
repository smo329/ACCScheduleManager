/* ACC Schedule Manager - mobile admin toolbar colors + reliable History button */
(function () {
  "use strict";

  const VERSION = "2026.08.14.1";
  console.info(`[ACC Schedule Manager] mobile admin UI patch loaded: ${VERSION}`);

  function isAdmin() {
    return Boolean(typeof currentProfile !== "undefined" && currentProfile && currentProfile.role === "admin");
  }

  function installStyles() {
    if (document.getElementById("mobileAdminActionColors")) return;
    const style = document.createElement("style");
    style.id = "mobileAdminActionColors";
    style.textContent = `
      /* Action colors are intentionally role-based instead of making all admin actions orange. */
      #openShiftsTopButton {
        background:#0f766e !important;
        border-color:#14b8a6 !important;
        color:#fff !important;
        font-weight:700;
      }
      #openShiftsTopButton:hover { background:#115e59 !important; }

      #accountTopButton {
        background:#334155 !important;
        border-color:#64748b !important;
        color:#fff !important;
      }
      #accountTopButton:hover { background:#1e293b !important; }

      #managePeopleTopButton {
        background:#2563eb !important;
        border-color:#3b82f6 !important;
        color:#fff !important;
        font-weight:700;
      }
      #managePeopleTopButton:hover { background:#1d4ed8 !important; }

      #quarterDashboardTopButton {
        background:#7c3aed !important;
        border-color:#8b5cf6 !important;
        color:#fff !important;
        font-weight:700;
      }
      #quarterDashboardTopButton:hover { background:#6d28d9 !important; }

      #scheduleHistoryTopButton {
        background:#0369a1 !important;
        border-color:#0ea5e9 !important;
        color:#fff !important;
        font-weight:700;
      }
      #scheduleHistoryTopButton:hover { background:#075985 !important; }

      #signOutTopButton {
        background:#991b1b !important;
        border-color:#dc2626 !important;
        color:#fff !important;
      }
      #signOutTopButton:hover { background:#7f1d1d !important; }

      #accountRequestBell {
        background:#a16207 !important;
        border-color:#eab308 !important;
        color:#fff !important;
      }

      @media (max-width:760px) {
        .topbar-user {
          display:grid !important;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:7px !important;
          width:100%;
        }
        .topbar-user > button {
          width:100% !important;
          min-width:0 !important;
          min-height:50px !important;
          font-size:13px !important;
          padding:9px 7px !important;
          border-radius:7px !important;
        }
        #accountRequestBell {
          grid-column:auto;
          min-width:0 !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function labelStandardButtons() {
    const buttons = [...document.querySelectorAll(".topbar-user button")];
    buttons.forEach(button => {
      const text = button.textContent.trim().toLowerCase();
      if (text === "account" && !button.id) button.id = "accountTopButton";
      if (text === "sign out" && !button.id) button.id = "signOutTopButton";
    });
  }

  function ensureHistoryButton() {
    if (!isAdmin()) {
      const existing = document.getElementById("scheduleHistoryTopButton");
      if (existing) existing.remove();
      return;
    }

    let button = document.getElementById("scheduleHistoryTopButton");
    if (!button) {
      const anchor = document.getElementById("quarterDashboardTopButton") ||
        document.getElementById("managePeopleTopButton") ||
        document.getElementById("accountTopButton");
      if (!anchor) return;

      button = document.createElement("button");
      button.id = "scheduleHistoryTopButton";
      button.className = "topbar-button";
      button.type = "button";
      button.textContent = "History";
      anchor.insertAdjacentElement("afterend", button);
    }

    button.style.display = "";
    button.onclick = function () {
      if (typeof window.openScheduleHistory === "function") {
        window.openScheduleHistory();
      } else {
        console.error("Schedule History module is not loaded.");
        alert("Schedule History is still loading. Please refresh the page and try again.");
      }
    };
  }

  function refreshToolbar() {
    labelStandardButtons();
    ensureHistoryButton();
  }

  installStyles();
  setTimeout(refreshToolbar, 0);
  setTimeout(refreshToolbar, 300);
  setTimeout(refreshToolbar, 1000);

  if (typeof updateUserHeader === "function") {
    const original = updateUserHeader;
    updateUserHeader = function (...args) {
      const result = original.apply(this, args);
      setTimeout(refreshToolbar, 0);
      return result;
    };
  }

  const observer = new MutationObserver(() => refreshToolbar());
  const topbar = document.querySelector(".topbar-user");
  if (topbar) observer.observe(topbar, { childList:true });
})();
