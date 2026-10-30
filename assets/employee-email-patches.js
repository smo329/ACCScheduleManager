/*
 * ACC Schedule Manager - Employee email notification preferences
 * Lets employees opt in or out of Mailjet emails: scheduling opens, trade
 * updates, and the end-of-day additional-shift digest. Emails go to the
 * employee's login email. Preferences live in notification_preferences
 * (own-row RLS already allows select/insert/update).
 *
 * The section renders in the Notifications tab of Account Settings, only
 * for employees viewing their own account (never in view-as mode, never
 * for admins/managers, who have their own sections).
 */
(function () {
    "use strict";

    function isOwnEmployee() {
        try {
            if (typeof window !== "undefined" && window.viewAsActive) return false;
            if (typeof currentUser === "undefined" || !currentUser) return false;
            if (typeof currentProfile === "undefined" || !currentProfile) return false;
            if (currentProfile.id !== currentUser.id) return false;
            return currentProfile.role === "employee";
        } catch (e) {
            return false;
        }
    }

    function showOk(message) {
        if (typeof showAccountMessage === "function") {
            showAccountMessage(message);
            return;
        }
        const help = document.getElementById("employeeEmailHelp");
        if (help) help.textContent = message;
    }

    function showErr(message) {
        if (typeof showAccountError === "function") {
            showAccountError(message);
            return;
        }
        const help = document.getElementById("employeeEmailHelp");
        if (help) help.textContent = message;
    }

    function ensureEmployeeEmailUi() {
        if (!isOwnEmployee()) return null;
        if (typeof supabaseClient === "undefined") return null;

        const panel = document.querySelector(
            '#accountSettingsShell .account-settings-tab[data-tab="notifications"]'
        );
        if (!panel) return null;

        Array.from(panel.children).forEach(child => {
            if (
                child.classList &&
                child.classList.contains("account-settings-help") &&
                child.textContent.toLowerCase().includes("loading")
            ) {
                child.remove();
            }
        });

        let section = document.getElementById("employeeEmailNotificationSettings");
        if (section) return section;

        section = document.createElement("div");
        section.id = "employeeEmailNotificationSettings";
        section.innerHTML =
            '<label style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;margin-bottom:14px;">' +
                '<input id="employeeEmailScheduleOpen" type="checkbox" style="width:auto;margin-top:3px;">' +
                '<span><strong>Email me when scheduling opens for me</strong>' +
                '<span style="display:block;color:#64748b;font-size:12px;margin-top:3px;">Sent when your scheduling access opens for a quarter.</span></span>' +
            "</label>" +
            '<label style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;margin-bottom:14px;">' +
                '<input id="employeeEmailTrades" type="checkbox" style="width:auto;margin-top:3px;">' +
                '<span><strong>Email me about trades</strong>' +
                '<span style="display:block;color:#64748b;font-size:12px;margin-top:3px;">Sent when you receive a trade request, and when a trade you proposed is accepted or declined. Covers regular, Critical Labs, and holiday trades.</span></span>' +
            "</label>" +
            '<label style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;margin-bottom:14px;">' +
                '<input id="employeeEmailDigest" type="checkbox" style="width:auto;margin-top:3px;">' +
                '<span><strong>Email me a digest of new additional shifts</strong>' +
                '<span style="display:block;color:#64748b;font-size:12px;margin-top:3px;">One email at the end of the day, only on days when new additional shifts were added.</span></span>' +
            "</label>" +
            '<div id="employeeEmailHelp" class="account-settings-help"></div>' +
            '<button id="saveEmployeeEmailButton" class="modal-button save-button" type="button">Save Notification Settings</button>';
        panel.appendChild(section);

        section.querySelector("#saveEmployeeEmailButton").onclick = saveEmployeeEmailPrefs;
        loadEmployeeEmailPrefs().catch(error => {
            console.warn("Unable to load employee email preferences:", error);
        });
        return section;
    }

    async function loadEmployeeEmailPrefs() {
        const section = document.getElementById("employeeEmailNotificationSettings");
        if (!section || typeof currentUser === "undefined" || !currentUser) return;

        const loginEmail = currentUser.email || "";
        const help = section.querySelector("#employeeEmailHelp");
        if (help) {
            help.textContent = loginEmail
                ? "Emails will be sent to your login email: " + loginEmail
                : "Emails will be sent to your login email.";
        }

        const { data, error } = await supabaseClient
            .from("notification_preferences")
            .select("schedule_open_email_enabled, trade_email_enabled, open_shift_digest_enabled")
            .eq("user_id", currentUser.id)
            .maybeSingle();
        if (error) {
            console.warn("Unable to load employee email preferences:", error);
            return;
        }
        section.querySelector("#employeeEmailScheduleOpen").checked =
            Boolean(data && data.schedule_open_email_enabled);
        section.querySelector("#employeeEmailTrades").checked =
            Boolean(data && data.trade_email_enabled);
        section.querySelector("#employeeEmailDigest").checked =
            Boolean(data && data.open_shift_digest_enabled);
    }

    async function saveEmployeeEmailPrefs() {
        if (typeof clearAccountMessages === "function") clearAccountMessages();
        if (!isOwnEmployee() || typeof currentUser === "undefined" || !currentUser) return;

        const scheduleOpen = document.getElementById("employeeEmailScheduleOpen");
        const trades = document.getElementById("employeeEmailTrades");
        const digest = document.getElementById("employeeEmailDigest");
        const button = document.getElementById("saveEmployeeEmailButton");
        if (!scheduleOpen || !trades || !digest || !button) return;

        button.disabled = true;
        button.textContent = "Saving...";
        try {
            const { error } = await supabaseClient
                .from("notification_preferences")
                .upsert({
                    user_id: currentUser.id,
                    schedule_open_email_enabled: scheduleOpen.checked,
                    trade_email_enabled: trades.checked,
                    open_shift_digest_enabled: digest.checked,
                    updated_at: new Date().toISOString()
                }, { onConflict: "user_id" });
            if (error) throw new Error(error.message);
            showOk("Email notification settings saved.");
        } catch (error) {
            console.error(error);
            showErr("Unable to save notification settings: " + (error.message || "Unknown error"));
        } finally {
            button.disabled = false;
            button.textContent = "Save Notification Settings";
        }
    }

    if (typeof updateUserHeader === "function" && !window.__employeeEmailUiWrapped) {
        window.__employeeEmailUiWrapped = true;
        const originalUpdateUserHeader = updateUserHeader;
        updateUserHeader = function (...args) {
            const result = originalUpdateUserHeader.apply(this, args);
            setTimeout(ensureEmployeeEmailUi, 0);
            return result;
        };
    }

    const observer = new MutationObserver(() => {
        ensureEmployeeEmailUi();
    });

    function beginObserving() {
        const modal = document.getElementById("accountModal");
        if (!modal) {
            setTimeout(beginObserving, 100);
            return;
        }
        observer.observe(modal, { childList: true, subtree: true });
        ensureEmployeeEmailUi();
    }

    beginObserving();
})();
