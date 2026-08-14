/*
 * ACC Schedule Manager - Email notification availability patch
 * Email delivery remains implemented, but user-facing email notification
 * enrollment is temporarily unavailable until a production sender is ready.
 */
(function () {
    "use strict";

    const VERSION = "2026.08.14.4";

    console.info(
        `[ACC Schedule Manager] email availability patch loaded: ${VERSION}`
    );

    function renderEmailUnavailable() {
        const panel = document.querySelector(
            '#accountSettingsShell .account-settings-tab[data-tab="notifications"]'
        );

        if (!panel) {
            return;
        }

        [
            "scheduleNotificationSettings",
            "managerScheduleNotificationSettings",
            "adminDailyDigestSettings",
            "dailyDigestNotificationSettings"
        ].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.remove();
        });

        Array.from(panel.children).forEach(child => {
            if (
                child.classList &&
                child.classList.contains("account-settings-help") &&
                child.textContent.toLowerCase().includes("loading")
            ) {
                child.remove();
            }
        });

        let unavailable = document.getElementById(
            "emailNotificationsUnavailable"
        );

        if (!unavailable) {
            unavailable = document.createElement("div");
            unavailable.id = "emailNotificationsUnavailable";
            unavailable.className = "email-notifications-unavailable";
            unavailable.innerHTML = `
                <div class="email-unavailable-icon" aria-hidden="true">✉</div>
                <div>
                    <strong>Email Notifications</strong>
                    <p>
                        Email notifications are currently unavailable.
                        Please check back later.
                    </p>
                </div>
            `;

            panel.appendChild(unavailable);
        }
    }

    function installStyles() {
        if (document.getElementById("emailUnavailableStyles")) return;

        const style = document.createElement("style");
        style.id = "emailUnavailableStyles";
        style.textContent = `
            .email-notifications-unavailable {
                display:flex;
                align-items:flex-start;
                gap:12px;
                padding:16px;
                border:1px solid #e2e8f0;
                border-radius:8px;
                background:#f8fafc;
                color:#475569;
            }

            .email-notifications-unavailable strong {
                display:block;
                margin-bottom:4px;
                color:#1e293b;
                font-size:15px;
            }

            .email-notifications-unavailable p {
                margin:0;
                font-size:13px;
                line-height:1.45;
            }

            .email-unavailable-icon {
                flex:0 0 auto;
                width:32px;
                height:32px;
                display:flex;
                align-items:center;
                justify-content:center;
                border-radius:50%;
                background:#e2e8f0;
                color:#475569;
                font-size:16px;
            }

            .acc-dark .email-notifications-unavailable {
                background:#0f172a;
                border-color:#334155;
                color:#94a3b8;
            }

            .acc-dark .email-notifications-unavailable strong {
                color:#f8fafc !important;
            }

            .acc-dark .email-unavailable-icon {
                background:#1e293b;
                color:#cbd5e1;
            }
        `;

        document.head.appendChild(style);
    }

    installStyles();

    const observer = new MutationObserver(() => {
        renderEmailUnavailable();
    });

    function beginObserving() {
        const modal = document.getElementById("accountModal");

        if (!modal) {
            setTimeout(beginObserving, 100);
            return;
        }

        observer.observe(modal, {
            childList: true,
            subtree: true
        });

        renderEmailUnavailable();
    }

    beginObserving();
})();

/* Load username-or-email login and username account settings. */
(function () {
    if (document.querySelector('script[src="assets/username-login-patches.js"]')) {
        return;
    }

    const script = document.createElement("script");
    script.src = "assets/username-login-patches.js";
    script.defer = false;
    document.body.appendChild(script);
})();

/* Load admin schedule audit history. */
(function () {
    if (document.querySelector('script[src="assets/schedule-history-patches.js"]')) {
        return;
    }

    const script = document.createElement("script");
    script.src = "assets/schedule-history-patches.js";
    script.defer = false;
    document.body.appendChild(script);
})();
