/*
 * ACC Schedule Manager - Clinic Manager role + update notifications
 */
(function () {
    "use strict";

    const MANAGER_PATCH_VERSION = "2026.08.14.1";

    console.info(
        `[ACC Schedule Manager] manager patch loaded: ${MANAGER_PATCH_VERSION}`
    );

    function isClinicManager(profile = currentProfile) {
        return Boolean(
            profile &&
            profile.role === "manager"
        );
    }

    function addManagerRoleOption() {
        const select =
            document.getElementById(
                "newRole"
            );

        if (
            !select ||
            Array.from(select.options).some(
                option =>
                    option.value === "manager"
            )
        ) {
            return;
        }

        const option =
            document.createElement(
                "option"
            );

        option.value =
            "manager";

        option.textContent =
            "Clinic Manager";

        const adminOption =
            Array.from(
                select.options
            ).find(
                item =>
                    item.value === "admin"
            );

        if (
            adminOption
        ) {
            select.insertBefore(
                option,
                adminOption
            );
        } else {
            select.appendChild(
                option
            );
        }
    }

    if (
        typeof getActiveProfiles ===
        "function"
    ) {
        const originalGetActiveProfiles =
            getActiveProfiles;

        getActiveProfiles =
            function (...args) {
                return originalGetActiveProfiles
                    .apply(
                        this,
                        args
                    )
                    .filter(
                        profile =>
                            profile &&
                            profile.role !==
                                "manager"
                    );
            };
    }

    if (
        typeof canEditProfile ===
        "function"
    ) {
        const originalCanEditProfile =
            canEditProfile;

        canEditProfile =
            function (
                profile
            ) {
                if (
                    isClinicManager()
                ) {
                    return false;
                }

                return originalCanEditProfile(
                    profile
                );
            };
    }

    if (
        typeof updateUserHeader ===
        "function"
    ) {
        const originalUpdateUserHeader =
            updateUserHeader;

        updateUserHeader =
            function (...args) {
                const result =
                    originalUpdateUserHeader.apply(
                        this,
                        args
                    );

                if (
                    isClinicManager()
                ) {
                    const badge =
                        document.getElementById(
                            "roleBadge"
                        );

                    const adminButton =
                        document.getElementById(
                            "adminButton"
                        );

                    const notice =
                        document.getElementById(
                            "permissionNotice"
                        );

                    if (
                        badge
                    ) {
                        badge.textContent =
                            "Clinic Manager";
                    }

                    if (
                        adminButton
                    ) {
                        adminButton.style.display =
                            "none";
                    }

                    if (
                        notice
                    ) {
                        const site =
                            currentProfile.clinic_site
                                ? ` — ${currentProfile.clinic_site}`
                                : "";

                        notice.innerHTML =
                            `
                            <strong>Clinic Manager:</strong>
                            Read-only schedule and comment access${site}.
                            You cannot modify schedules, leave, comments, capacity, or submissions.
                            `;
                    }
                }

                return result;
            };
    }

    if (
        typeof renderWorkflowPanel ===
        "function"
    ) {
        const originalRenderWorkflowPanel =
            renderWorkflowPanel;

        renderWorkflowPanel =
            function (...args) {
                if (
                    isClinicManager()
                ) {
                    const panel =
                        document.getElementById(
                            "workflowPanel"
                        );

                    if (
                        panel
                    ) {
                        panel.innerHTML =
                            `
                            <div class="workflow-left">
                                <strong>
                                    Read-only manager view
                                </strong>
                                <span>
                                    Schedule and comments are visible; editing is disabled.
                                </span>
                            </div>
                            `;
                    }

                    return;
                }

                return originalRenderWorkflowPanel
                    .apply(
                        this,
                        args
                    );
            };
    }

    if (
        typeof saveScheduleValue ===
        "function"
    ) {
        const originalSaveScheduleValue =
            saveScheduleValue;

        saveScheduleValue =
            async function (
                userId,
                dateKey,
                scheduleCode,
                workSite = null
            ) {
                if (
                    isClinicManager()
                ) {
                    showError(
                        "Clinic Manager accounts are read-only."
                    );

                    return false;
                }

                const success =
                    await originalSaveScheduleValue.apply(
                        this,
                        arguments
                    );

                if (
                    success &&
                    typeof window.notifyClinicManagersOfScheduleChange ===
                        "function"
                ) {
                    window
                        .notifyClinicManagersOfScheduleChange(
                            userId,
                            dateKey,
                            "schedule"
                        )
                        .catch(
                            error =>
                                console.warn(
                                    "Manager schedule-update notification failed:",
                                    error
                                )
                        );
                }

                return success;
            };
    }

    if (
        typeof saveComment ===
        "function"
    ) {
        const originalSaveComment =
            saveComment;

        saveComment =
            async function (...args) {
                if (
                    isClinicManager()
                ) {
                    showError(
                        "Clinic Manager accounts can view comments but cannot add or edit them."
                    );

                    return;
                }

                return originalSaveComment.apply(
                    this,
                    args
                );
            };
    }

    if (
        typeof openAddEmployeeSection ===
        "function"
    ) {
        const originalOpenAddEmployeeSection =
            openAddEmployeeSection;

        openAddEmployeeSection =
            function (...args) {
                const result =
                    originalOpenAddEmployeeSection
                        .apply(
                            this,
                            args
                        );

                addManagerRoleOption();

                return result;
            };
    }

    if (
        typeof openAdmin ===
        "function"
    ) {
        const originalOpenAdmin =
            openAdmin;

        openAdmin =
            function (...args) {
                const result =
                    originalOpenAdmin.apply(
                        this,
                        args
                    );

                addManagerRoleOption();

                return result;
            };
    }

    if (
        typeof editPerson ===
        "function"
    ) {
        editPerson =
            async function (
                profile
            ) {
                const firstName =
                    prompt(
                        "First name:",
                        profile.first_name
                    );

                if (
                    firstName === null
                ) {
                    return;
                }

                const lastName =
                    prompt(
                        "Last name:",
                        profile.last_name
                    );

                if (
                    lastName === null
                ) {
                    return;
                }

                let role =
                    profile.role;

                if (
                    profile.id !==
                    currentUser.id
                ) {
                    const roleInput =
                        prompt(
                            "Role: employee, manager, or admin",
                            profile.role
                        );

                    if (
                        roleInput === null
                    ) {
                        return;
                    }

                    role =
                        roleInput
                            .trim()
                            .toLowerCase();

                    if (
                        ![
                            "employee",
                            "manager",
                            "admin"
                        ].includes(
                            role
                        )
                    ) {
                        alert(
                            "Role must be employee, manager, or admin."
                        );

                        return;
                    }
                }

                const clinicInput =
                    prompt(
                        "Primary clinic: Turfland or Fountain Court",
                        profile.clinic_site ||
                        "Turfland"
                    );

                if (
                    clinicInput === null
                ) {
                    return;
                }

                const normalizedClinic =
                    clinicInput
                        .trim()
                        .toLowerCase();

                let clinicSite =
                    null;

                if (
                    normalizedClinic ===
                    "turfland"
                ) {
                    clinicSite =
                        "Turfland";

                } else if (
                    [
                        "fountain court",
                        "fountaincourt",
                        "fc"
                    ].includes(
                        normalizedClinic
                    )
                ) {
                    clinicSite =
                        "Fountain Court";
                }

                if (
                    !clinicSite
                ) {
                    alert(
                        "Primary clinic must be Turfland or Fountain Court."
                    );

                    return;
                }

                const success =
                    await invokeManageUser({
                        action:
                            "update_profile",

                        user_id:
                            profile.id,

                        first_name:
                            firstName.trim(),

                        last_name:
                            lastName.trim(),

                        role,

                        clinic_site:
                            clinicSite
                    });

                if (
                    !success
                ) {
                    return;
                }

                await loadWeek();

                renderPeopleList();
            };
    }

    function postProcessPeopleList() {
        const container =
            document.getElementById(
                "peopleList"
            );

        if (
            !container
        ) {
            return;
        }

        const cards =
            Array.from(
                container.children
            );

        profiles.forEach(
            (
                profile,
                index
            ) => {
                if (
                    profile.role !==
                        "manager"
                ) {
                    return;
                }

                const card =
                    cards[
                        index
                    ];

                if (
                    !card
                ) {
                    return;
                }

                if (
                    card.children[
                        2
                    ]
                ) {
                    card.children[
                        2
                    ].textContent =
                        "Clinic Manager";
                }

                card.querySelectorAll(
                    "button"
                ).forEach(
                    button => {
                        if (
                            [
                                "Open Picks",
                                "Close Picks"
                            ].includes(
                                button.textContent.trim()
                            )
                        ) {
                            button.remove();
                        }
                    }
                );

                Array.from(
                    card.children
                )
                    .slice(
                        5
                    )
                    .forEach(
                        child =>
                            child.remove()
                    );
            }
        );
    }

    if (
        typeof renderPeopleList ===
        "function"
    ) {
        const originalRenderPeopleList =
            renderPeopleList;

        renderPeopleList =
            function (...args) {
                const result =
                    originalRenderPeopleList.apply(
                        this,
                        args
                    );

                postProcessPeopleList();

                return result;
            };
    }

    if (
        typeof renderQuarterDashboard ===
        "function"
    ) {
        const originalRenderQuarterDashboard =
            renderQuarterDashboard;

        renderQuarterDashboard =
            async function (...args) {
                const originalProfiles =
                    profiles;

                try {
                    profiles =
                        originalProfiles.filter(
                            profile =>
                                profile &&
                                profile.role !==
                                    "manager"
                        );

                    return await originalRenderQuarterDashboard
                        .apply(
                            this,
                            args
                        );

                } finally {
                    profiles =
                        originalProfiles;
                }
            };
    }

    function ensureManagerNotificationUi() {
        if (
            !isClinicManager()
        ) {
            const existing =
                document.getElementById(
                    "managerScheduleNotificationSettings"
                );

            if (
                existing
            ) {
                existing.remove();
            }

            return null;
        }

        const employeeSection =
            document.getElementById(
                "scheduleNotificationSettings"
            );

        if (
            employeeSection
        ) {
            employeeSection.style.display =
                "none";
        }

        const panel =
            document.querySelector(
                '#accountSettingsShell .account-settings-tab[data-tab="notifications"]'
            );

        if (
            !panel
        ) {
            return null;
        }

        const loadingText =
            Array.from(
                panel.children
            ).find(
                child =>
                    child.classList &&
                    child.classList.contains(
                        "account-settings-help"
                    ) &&
                    child.textContent.includes(
                        "loading"
                    )
            );

        if (
            loadingText
        ) {
            loadingText.remove();
        }

        let section =
            document.getElementById(
                "managerScheduleNotificationSettings"
            );

        if (
            section
        ) {
            return section;
        }

        section =
            document.createElement(
                "div"
            );

        section.id =
            "managerScheduleNotificationSettings";

        section.innerHTML =
            `
            <label
                style="
                    display:flex;
                    align-items:flex-start;
                    gap:9px;
                    cursor:pointer;
                    margin-bottom:14px;
                "
            >
                <input
                    id="managerScheduleUpdateEmailEnabled"
                    type="checkbox"
                    style="
                        width:auto;
                        margin-top:3px;
                    "
                >

                <span>
                    <strong>
                        Email me when schedules are updated
                    </strong>

                    <span
                        style="
                            display:block;
                            color:#64748b;
                            font-size:12px;
                            margin-top:3px;
                        "
                    >
                        Alerts are grouped to avoid sending an email for every individual schedule edit.
                    </span>
                </span>
            </label>

            <div class="form-group">
                <label for="managerScheduleNotificationEmail">
                    Notification Email
                </label>

                <input
                    id="managerScheduleNotificationEmail"
                    type="email"
                >

                <div
                    id="managerScheduleNotificationHelp"
                    class="account-settings-help"
                ></div>
            </div>

            <button
                id="saveManagerScheduleNotificationButton"
                class="modal-button save-button"
                type="button"
            >
                Save Notification Settings
            </button>
            `;

        panel.appendChild(
            section
        );

        section.querySelector(
            "#saveManagerScheduleNotificationButton"
        ).onclick =
            saveManagerNotificationPreferences;

        const enabled =
            section.querySelector(
                "#managerScheduleUpdateEmailEnabled"
            );

        const email =
            section.querySelector(
                "#managerScheduleNotificationEmail"
            );

        enabled.addEventListener(
            "change",
            function () {
                email.disabled =
                    !enabled.checked;
            }
        );

        return section;
    }

    async function loadManagerNotificationPreferences() {
        const section =
            ensureManagerNotificationUi();

        if (
            !section ||
            !currentUser
        ) {
            return;
        }

        const enabled =
            section.querySelector(
                "#managerScheduleUpdateEmailEnabled"
            );

        const email =
            section.querySelector(
                "#managerScheduleNotificationEmail"
            );

        const help =
            section.querySelector(
                "#managerScheduleNotificationHelp"
            );

        const loginEmail =
            currentUser.email ||
            "";

        email.placeholder =
            loginEmail ||
            "Your login email";

        help.textContent =
            loginEmail
                ? `Leave blank to use your login email: ${loginEmail}`
                : "Leave blank to use your login email.";

        const {
            data,
            error
        } =
            await supabaseClient
                .from(
                    "notification_preferences"
                )
                .select(`
                    manager_schedule_update_email_enabled,
                    manager_schedule_update_email
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
                "Unable to load manager notification preferences:",
                error
            );

            return;
        }

        enabled.checked =
            Boolean(
                data &&
                data.manager_schedule_update_email_enabled
            );

        email.value =
            data &&
            data.manager_schedule_update_email
                ? data.manager_schedule_update_email
                : "";

        email.disabled =
            !enabled.checked;
    }

    async function saveManagerNotificationPreferences() {
        clearAccountMessages();

        if (
            !isClinicManager() ||
            !currentUser
        ) {
            return;
        }

        const enabled =
            document.getElementById(
                "managerScheduleUpdateEmailEnabled"
            );

        const email =
            document.getElementById(
                "managerScheduleNotificationEmail"
            );

        const button =
            document.getElementById(
                "saveManagerScheduleNotificationButton"
            );

        if (
            !enabled ||
            !email ||
            !button
        ) {
            return;
        }

        const alternateEmail =
            email.value.trim();

        if (
            alternateEmail &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                alternateEmail
            )
        ) {
            showAccountError(
                "Enter a valid notification email or leave it blank to use your login email."
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

                            manager_schedule_update_email_enabled:
                                enabled.checked,

                            manager_schedule_update_email:
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
                    ? `Schedule-update notifications are on. Alerts will be sent to ${destination}.`
                    : "Schedule-update email notifications are off."
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

                if (
                    isClinicManager()
                ) {
                    setTimeout(
                        function () {
                            ensureManagerNotificationUi();

                            loadManagerNotificationPreferences()
                                .catch(
                                    error =>
                                        console.warn(
                                            "Manager notification settings load failed:",
                                            error
                                        )
                                );
                        },
                        0
                    );
                }

                return result;
            };
    }

    window.notifyClinicManagersOfScheduleChange =
        async function (
            employeeId,
            scheduleDate,
            changeType =
                "schedule"
        ) {
            if (
                !currentUser ||
                isClinicManager()
            ) {
                return;
            }

            const {
                data,
                error
            } =
                await supabaseClient
                    .functions
                    .invoke(
                        "send-manager-schedule-update",
                        {
                            body: {
                                employee_id:
                                    employeeId,

                                schedule_date:
                                    scheduleDate,

                                change_type:
                                    changeType
                            }
                        }
                    );

            if (
                error
            ) {
                console.warn(
                    "Manager notification function failed:",
                    error
                );

                return;
            }

            if (
                data &&
                data.error
            ) {
                console.warn(
                    "Manager notification function returned an error:",
                    data.error
                );
            }
        };

    addManagerRoleOption();

})();