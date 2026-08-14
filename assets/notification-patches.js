/*
 * ACC Schedule Manager - Scheduling notification patch
 * Loaded after app-patches.js.
 */
(function () {
    "use strict";

    const NOTIFICATION_PATCH_VERSION = "2026.08.14.1";

    console.info(
        `[ACC Schedule Manager] notification patch loaded: ${NOTIFICATION_PATCH_VERSION}`
    );

    /* ---------------------------------------------------------
       OPT-IN EMAIL NOTIFICATIONS FOR QUARTER ACCESS
       --------------------------------------------------------- */

    function ensureNotificationSettingsUi() {
        if (
            !currentProfile ||
            currentProfile.role === "admin"
        ) {
            const old =
                document.getElementById(
                    "scheduleNotificationSettings"
                );

            if (old) {
                old.remove();
            }

            return null;
        }

        let section =
            document.getElementById(
                "scheduleNotificationSettings"
            );

        if (section) {
            return section;
        }

        const saveAccountButton =
            document.getElementById(
                "saveAccountInfoButton"
            );

        if (!saveAccountButton) {
            return null;
        }

        section =
            document.createElement(
                "div"
            );

        section.id =
            "scheduleNotificationSettings";

        section.style.cssText =
            `
            margin-top:22px;
            padding-top:18px;
            border-top:1px solid #e5e7eb;
            `;

        section.innerHTML =
            `
            <h3 style="margin:0 0 10px;">
                Scheduling Notifications
            </h3>

            <label
                style="
                    display:flex;
                    align-items:flex-start;
                    gap:9px;
                    cursor:pointer;
                    margin-bottom:12px;
                "
            >
                <input
                    id="scheduleOpenEmailEnabled"
                    type="checkbox"
                    style="
                        width:auto;
                        margin-top:3px;
                    "
                >

                <span>
                    <strong>
                        Email me when my scheduling quarter is opened
                    </strong>

                    <span
                        style="
                            display:block;
                            color:#64748b;
                            font-size:12px;
                            margin-top:3px;
                        "
                    >
                        You will receive an email when an administrator opens your picks for a scheduling quarter.
                    </span>
                </span>
            </label>

            <div class="form-group">
                <label for="scheduleNotificationEmail">
                    Notification Email
                </label>

                <input
                    id="scheduleNotificationEmail"
                    type="email"
                    placeholder=""
                >

                <div
                    id="scheduleNotificationEmailHelp"
                    style="
                        color:#64748b;
                        font-size:12px;
                        margin-top:5px;
                    "
                ></div>
            </div>

            <button
                id="saveScheduleNotificationButton"
                class="modal-button save-button"
                type="button"
            >
                Save Notification Settings
            </button>
            `;

        saveAccountButton.insertAdjacentElement(
            "afterend",
            section
        );

        const enabled =
            section.querySelector(
                "#scheduleOpenEmailEnabled"
            );

        const emailInput =
            section.querySelector(
                "#scheduleNotificationEmail"
            );

        function refreshDisabledState() {
            emailInput.disabled =
                !enabled.checked;
        }

        enabled.addEventListener(
            "change",
            refreshDisabledState
        );

        refreshDisabledState();

        section.querySelector(
            "#saveScheduleNotificationButton"
        ).onclick =
            saveScheduleNotificationPreferences;

        return section;
    }


    async function loadScheduleNotificationPreferences() {
        const section =
            ensureNotificationSettingsUi();

        if (
            !section ||
            !currentUser
        ) {
            return;
        }

        const enabled =
            section.querySelector(
                "#scheduleOpenEmailEnabled"
            );

        const emailInput =
            section.querySelector(
                "#scheduleNotificationEmail"
            );

        const help =
            section.querySelector(
                "#scheduleNotificationEmailHelp"
            );

        const loginEmail =
            currentUser.email || "";

        emailInput.placeholder =
            loginEmail ||
            "Your login email";

        help.textContent =
            loginEmail
                ? `Leave this blank to send notifications to your login email: ${loginEmail}`
                : "Leave this blank to use your login email.";

        const {
            data,
            error
        } =
            await supabaseClient
                .from(
                    "notification_preferences"
                )
                .select(`
                    schedule_open_email_enabled,
                    schedule_open_email
                `)
                .eq(
                    "user_id",
                    currentUser.id
                )
                .maybeSingle();

        if (
            error
        ) {
            console.warn(
                "Unable to load notification preferences:",
                error
            );

            return;
        }

        enabled.checked =
            Boolean(
                data &&
                data.schedule_open_email_enabled
            );

        emailInput.value =
            data &&
            data.schedule_open_email
                ? data.schedule_open_email
                : "";

        emailInput.disabled =
            !enabled.checked;
    }


    async function saveScheduleNotificationPreferences() {
        clearAccountMessages();

        if (
            !currentUser ||
            !currentProfile ||
            currentProfile.role === "admin"
        ) {
            return;
        }

        const enabled =
            document.getElementById(
                "scheduleOpenEmailEnabled"
            );

        const emailInput =
            document.getElementById(
                "scheduleNotificationEmail"
            );

        const button =
            document.getElementById(
                "saveScheduleNotificationButton"
            );

        if (
            !enabled ||
            !emailInput ||
            !button
        ) {
            return;
        }

        const alternateEmail =
            emailInput.value.trim();

        if (
            alternateEmail &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                alternateEmail
            )
        ) {
            showAccountError(
                "Enter a valid notification email address or leave it blank to use your login email."
            );

            return;
        }

        button.disabled =
            true;

        button.textContent =
            "Saving...";

        try {
            const {
                error
            } =
                await supabaseClient
                    .from(
                        "notification_preferences"
                    )
                    .upsert(
                        {
                            user_id:
                                currentUser.id,

                            schedule_open_email_enabled:
                                enabled.checked,

                            schedule_open_email:
                                alternateEmail ||
                                null,

                            updated_at:
                                new Date()
                                    .toISOString()
                        },
                        {
                            onConflict:
                                "user_id"
                        }
                    );

            if (
                error
            ) {
                throw new Error(
                    error.message
                );
            }

            const destination =
                alternateEmail ||
                currentUser.email ||
                "your login email";

            showAccountMessage(
                enabled.checked
                    ? `Scheduling notifications are on. Alerts will be sent to ${destination}.`
                    : "Scheduling email notifications are off."
            );

        } catch (
            error
        ) {
            console.error(
                error
            );

            showAccountError(
                "Unable to save notification settings: "
                +
                (
                    error.message ||
                    "Unknown error"
                )
            );

        } finally {
            button.disabled =
                false;

            button.textContent =
                "Save Notification Settings";
        }
    }


    if (
        typeof openAccountManager ===
        "function"
    ) {
        const originalOpenAccountManager =
            openAccountManager;

        openAccountManager =
            function (...args) {
                const result =
                    originalOpenAccountManager.apply(
                        this,
                        args
                    );

                ensureNotificationSettingsUi();

                loadScheduleNotificationPreferences()
                    .catch(
                        error =>
                            console.warn(
                                "Notification settings load failed:",
                                error
                            )
                    );

                return result;
            };
    }


    async function sendQuarterOpenNotification(
        userId,
        periodId
    ) {
        try {
            const {
                data,
                error
            } =
                await supabaseClient
                    .functions
                    .invoke(
                        "send-schedule-open-notification",
                        {
                            body: {
                                user_id:
                                    userId,

                                period_id:
                                    periodId
                            }
                        }
                    );

            if (
                error
            ) {
                console.warn(
                    "Scheduling notification failed:",
                    error
                );

                showError(
                    "Scheduling access was opened, but the email notification could not be sent. "
                    +
                    (
                        error.message ||
                        ""
                    )
                );

                return;
            }

            if (
                data &&
                data.sent
            ) {
                console.info(
                    "Scheduling-open notification sent."
                );
            } else if (
                data &&
                data.skipped
            ) {
                console.info(
                    "Scheduling-open notification skipped:",
                    data.reason
                );
            }

        } catch (
            error
        ) {
            console.warn(
                "Scheduling notification failed:",
                error
            );

            showError(
                "Scheduling access was opened, but the email notification could not be sent."
            );
        }
    }


    if (
        typeof toggleQuarterAccess ===
        "function"
    ) {
        const originalToggleQuarterAccess =
            toggleQuarterAccess;

        toggleQuarterAccess =
            async function (
                userId
            ) {
                const periodBefore =
                    adminSchedulingPeriod;

                const wasOpen =
                    getQuarterAccessStatusForUser(
                        userId
                    );

                const result =
                    await originalToggleQuarterAccess.apply(
                        this,
                        arguments
                    );

                const isOpenNow =
                    getQuarterAccessStatusForUser(
                        userId
                    );

                if (
                    !wasOpen &&
                    isOpenNow &&
                    periodBefore
                ) {
                    await sendQuarterOpenNotification(
                        userId,
                        periodBefore.id
                    );
                }

                return result;
            };
    }


})();
