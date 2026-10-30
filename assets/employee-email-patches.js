/*
 * ACC Schedule Manager - Email notification preferences
 * Lets any signed-in user opt in or out of Mailjet emails: scheduling
 * opens, trade updates, and the end-of-day additional-shift digest.
 * Which toggles appear depends on the role: admins and managers get
 * trade updates; employees get all three; external workers get only the
 * digest. Emails go to the user's verified notification email when one
 * is set, otherwise to the login email; @uky.edu addresses are never
 * emailed (UKY mail quarantines these at the admin level). The email
 * address itself is set through a verification-code flow, never saved
 * unverified.
 * Preferences live in notification_preferences
 * (own-row RLS already allows select/insert/update); verification codes
 * live in notification_email_verifications and are only touched through
 * the send-user-notification Edge Function.
 *
 * The section renders in the Notifications tab of Account Settings, only
 * for users viewing their own account (never in view-as mode).
 */
(function () {
    "use strict";

    function isOwnAccount() {
        try {
            if (typeof window !== "undefined" && window.viewAsActive) return false;
            if (typeof currentUser === "undefined" || !currentUser) return false;
            if (typeof currentProfile === "undefined" || !currentProfile) return false;
            return currentProfile.id === currentUser.id;
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
        if (!isOwnAccount()) return null;
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
            '<label id="employeeEmailScheduleOpenRow" style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;margin-bottom:14px;">' +
                '<input id="employeeEmailScheduleOpen" type="checkbox" style="width:auto;margin-top:3px;">' +
                '<span><strong>Email me when scheduling opens for me</strong>' +
                '<span style="display:block;color:#64748b;font-size:12px;margin-top:3px;">Sent when your scheduling access opens for a quarter.</span></span>' +
            "</label>" +
            '<label id="employeeEmailTradesRow" style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;margin-bottom:14px;">' +
                '<input id="employeeEmailTrades" type="checkbox" style="width:auto;margin-top:3px;">' +
                '<span><strong>Email me about trades</strong>' +
                '<span style="display:block;color:#64748b;font-size:12px;margin-top:3px;">Sent when you receive a trade request, and when a trade you proposed is accepted or declined. Covers regular, Critical Labs, and holiday trades.</span></span>' +
            "</label>" +
            '<label id="employeeEmailDigestRow" style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;margin-bottom:14px;">' +
                '<input id="employeeEmailDigest" type="checkbox" style="width:auto;margin-top:3px;">' +
                '<span><strong>Email me a digest of new additional shifts</strong>' +
                '<span style="display:block;color:#64748b;font-size:12px;margin-top:3px;">One email at the end of the day, only on days when new additional shifts were added.</span></span>' +
            "</label>" +
            '<div id="employeeEmailUkyNotice" class="account-settings-help" style="display:none;"></div>' +
            '<div style="margin-bottom:14px;">' +
                '<label style="display:block;margin-bottom:6px;"><strong>Notification email</strong>' +
                '<span style="display:block;color:#64748b;font-size:12px;margin-top:3px;">Optional. Use a personal email address. @uky.edu addresses cannot receive these notifications, because UKY mail quarantines them.</span></label>' +
                '<input id="employeeEmailAddress" type="email" style="width:100%;margin-bottom:8px;" placeholder="you@example.com">' +
                '<button id="employeeEmailSendCodeButton" class="modal-button" type="button">Send verification code</button>' +
                '<div style="display:flex;gap:8px;margin-top:8px;">' +
                    '<input id="employeeEmailCode" type="text" inputmode="numeric" maxlength="6" style="flex:1;" placeholder="6-digit code">' +
                    '<button id="employeeEmailVerifyButton" class="modal-button save-button" type="button">Verify</button>' +
                '</div>' +
                '<div id="employeeEmailVerifyStatus" class="account-settings-help"></div>' +
                '<div class="account-settings-help">If the verification email lands in spam, mark ACC Schedule Manager as not spam so future notifications reach your inbox.</div>' +
            '</div>' +
            '<div id="employeeEmailHelp" class="account-settings-help"></div>' +
            '<button id="saveEmployeeEmailButton" class="modal-button save-button" type="button">Save Notification Settings</button>';
        panel.appendChild(section);

        // Which toggles appear follows the in-app notifications each role
        // actually receives: schedule opens go to employees only, trades
        // to admins/managers/employees, and the additional-shift digest
        // to employees/externals. Hidden toggles stay in the DOM (unchecked)
        // so saving still writes all three columns.
        const accountRole = (typeof currentProfile !== "undefined" && currentProfile) ? currentProfile.role : null;
        const scheduleOpenRow = section.querySelector("#employeeEmailScheduleOpenRow");
        const tradesRow = section.querySelector("#employeeEmailTradesRow");
        const digestRow = section.querySelector("#employeeEmailDigestRow");
        if (scheduleOpenRow) scheduleOpenRow.style.display = accountRole === "employee" ? "flex" : "none";
        if (tradesRow) tradesRow.style.display = (accountRole === "admin" || accountRole === "manager" || accountRole === "employee") ? "flex" : "none";
        if (digestRow) digestRow.style.display = (accountRole === "employee" || accountRole === "external") ? "flex" : "none";

        section.querySelector("#saveEmployeeEmailButton").onclick = saveEmployeeEmailPrefs;
        section.querySelector("#employeeEmailSendCodeButton").onclick = sendVerificationCode;
        section.querySelector("#employeeEmailVerifyButton").onclick = confirmVerificationCode;
        loadEmployeeEmailPrefs().catch(error => {
            console.warn("Unable to load employee email preferences:", error);
        });
        return section;
    }

    async function loadEmployeeEmailPrefs() {
        const section = document.getElementById("employeeEmailNotificationSettings");
        if (!section || typeof currentUser === "undefined" || !currentUser) return;

        const loginEmail = currentUser.email || "";
        const { data, error } = await supabaseClient
            .from("notification_preferences")
            .select("schedule_open_email_enabled, trade_email_enabled, open_shift_digest_enabled, notification_email, notification_email_verified")
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

        const verifiedEmail = data && data.notification_email_verified ? (data.notification_email || "") : "";
        const addressInput = section.querySelector("#employeeEmailAddress");
        if (addressInput) addressInput.value = (data && data.notification_email) || "";
        const verifyStatus = section.querySelector("#employeeEmailVerifyStatus");
        if (verifyStatus) {
            verifyStatus.textContent = verifiedEmail
                ? "Verified: notifications will be sent to " + verifiedEmail
                : "";
        }
        const ukyNotice = section.querySelector("#employeeEmailUkyNotice");
        if (ukyNotice) {
            const loginIsUky = loginEmail.trim().toLowerCase().endsWith("@uky.edu");
            if (loginIsUky && !verifiedEmail) {
                ukyNotice.style.display = "block";
                ukyNotice.textContent = "Your login email is a @uky.edu address, which cannot receive these notifications (UKY quarantines them). Add a personal email below and verify it.";
            } else {
                ukyNotice.style.display = "none";
                ukyNotice.textContent = "";
            }
        }
        const help = section.querySelector("#employeeEmailHelp");
        if (help) {
            help.textContent = verifiedEmail
                ? "Emails will be sent to your verified notification email: " + verifiedEmail
                : (loginEmail
                    ? "Emails will be sent to your login email: " + loginEmail
                    : "Emails will be sent to your login email.");
        }
    }

    function employeeEmailErrorText(error, data) {
        if (data && data.error) return data.error;
        if (error && error.message) return error.message;
        return "Unknown error";
    }

    function validNotificationEmail(email) {
        return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    }

    async function sendVerificationCode() {
        if (typeof clearAccountMessages === "function") clearAccountMessages();
        if (!isOwnAccount() || typeof currentUser === "undefined" || !currentUser) return;
        const addressInput = document.getElementById("employeeEmailAddress");
        const status = document.getElementById("employeeEmailVerifyStatus");
        const button = document.getElementById("employeeEmailSendCodeButton");
        if (!addressInput || !button) return;
        const email = addressInput.value.trim().toLowerCase();
        if (!validNotificationEmail(email)) {
            showErr("Enter a valid email address.");
            return;
        }
        if (email.endsWith("@uky.edu")) {
            showErr("Notifications cannot be sent to @uky.edu addresses: UKY mail quarantines them. Use a personal email address.");
            return;
        }
        button.disabled = true;
        button.textContent = "Sending...";
        try {
            const { data, error } = await supabaseClient.functions.invoke("send-user-notification", {
                body: { mode: "request_verification", email: email }
            });
            if (error || (data && data.error)) throw new Error(employeeEmailErrorText(error, data));
            if (status) status.textContent = "Verification code sent to " + email + ". It expires in 30 minutes.";
            showOk("Verification code sent. Check spam if you do not see it, and mark ACC Schedule Manager as not spam.");
        } catch (error) {
            console.error(error);
            showErr("Unable to send verification code: " + (error.message || "Unknown error"));
        } finally {
            button.disabled = false;
            button.textContent = "Send verification code";
        }
    }

    async function confirmVerificationCode() {
        if (typeof clearAccountMessages === "function") clearAccountMessages();
        if (!isOwnAccount() || typeof currentUser === "undefined" || !currentUser) return;
        const addressInput = document.getElementById("employeeEmailAddress");
        const codeInput = document.getElementById("employeeEmailCode");
        const status = document.getElementById("employeeEmailVerifyStatus");
        const button = document.getElementById("employeeEmailVerifyButton");
        if (!addressInput || !codeInput || !button) return;
        const email = addressInput.value.trim().toLowerCase();
        const code = codeInput.value.trim();
        if (!validNotificationEmail(email) || !/^\d{6}$/.test(code)) {
            showErr("Enter the email address and the 6-digit code.");
            return;
        }
        button.disabled = true;
        button.textContent = "Verifying...";
        try {
            const { data, error } = await supabaseClient.functions.invoke("send-user-notification", {
                body: { mode: "confirm_verification", email: email, code: code }
            });
            if (error || (data && data.error)) throw new Error(employeeEmailErrorText(error, data));
            if (!data || data.verified !== true) throw new Error("Verification did not complete. Request a new code.");
            if (status) status.textContent = "Verified: notifications will be sent to " + email;
            showOk("Notification email verified.");
            loadEmployeeEmailPrefs().catch(error => {
                console.warn("Unable to reload employee email preferences:", error);
            });
        } catch (error) {
            console.error(error);
            showErr("Unable to verify: " + (error.message || "Unknown error"));
        } finally {
            button.disabled = false;
            button.textContent = "Verify";
        }
    }

    async function saveEmployeeEmailPrefs() {
        if (typeof clearAccountMessages === "function") clearAccountMessages();
        if (!isOwnAccount() || typeof currentUser === "undefined" || !currentUser) return;

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
