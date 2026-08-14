/*
 * ACC Schedule Manager - Account settings UI patch
 * Adds tabbed settings navigation and local dark mode.
 */
(function () {
    "use strict";

    const ACCOUNT_UI_VERSION = "2026.08.14.1";
    const THEME_KEY = "acc_schedule_theme";

    console.info(
        `[ACC Schedule Manager] account UI patch loaded: ${ACCOUNT_UI_VERSION}`
    );

    function applyTheme(theme) {
        const dark = theme === "dark";

        document.documentElement.classList.toggle(
            "acc-dark",
            dark
        );

        document.body.classList.toggle(
            "acc-dark",
            dark
        );

        localStorage.setItem(
            THEME_KEY,
            dark ? "dark" : "light"
        );

        const toggle =
            document.getElementById(
                "accountDarkModeToggle"
            );

        if (toggle) {
            toggle.checked = dark;
        }
    }


    function initializeTheme() {
        const saved =
            localStorage.getItem(
                THEME_KEY
            );

        applyTheme(
            saved === "dark"
                ? "dark"
                : "light"
        );
    }


    function getFormGroupFor(
        elementId
    ) {
        const element =
            document.getElementById(
                elementId
            );

        return element
            ? element.closest(
                ".form-group"
            )
            : null;
    }


    function showAccountSettingsTab(
        tabName
    ) {
        document
            .querySelectorAll(
                "#accountSettingsShell .account-settings-tab"
            )
            .forEach(
                panel => {
                    panel.classList.toggle(
                        "active",
                        panel.dataset.tab ===
                            tabName
                    );
                }
            );

        document
            .querySelectorAll(
                "#accountSettingsShell .account-settings-nav-button"
            )
            .forEach(
                button => {
                    button.classList.toggle(
                        "active",
                        button.dataset.tab ===
                            tabName
                    );
                }
            );

        const content =
            document.querySelector(
                "#accountSettingsShell .account-settings-content"
            );

        if (content) {
            content.scrollTop =
                0;
        }
    }


    function createAppearanceCard() {
        const card =
            document.createElement(
                "div"
            );

        card.className =
            "account-appearance-card";

        card.innerHTML =
            `
            <div>
                <strong>
                    Dark Mode
                </strong>

                <div class="account-settings-help">
                    Use a darker appearance for the scheduling site on this browser.
                </div>
            </div>

            <label class="account-theme-switch">
                <input
                    id="accountDarkModeToggle"
                    type="checkbox"
                >
                <span class="account-theme-slider"></span>
            </label>
            `;

        const toggle =
            card.querySelector(
                "#accountDarkModeToggle"
            );

        toggle.checked =
            localStorage.getItem(
                THEME_KEY
            ) === "dark";

        toggle.addEventListener(
            "change",
            function () {
                applyTheme(
                    toggle.checked
                        ? "dark"
                        : "light"
                );
            }
        );

        return card;
    }


    function buildAccountSettingsShell() {
        const modal =
            document.getElementById(
                "accountModal"
            );

        if (!modal) {
            return;
        }

        const modalBox =
            modal.querySelector(
                ".modal"
            );

        const body =
            modal.querySelector(
                ".modal-body"
            );

        if (
            !modalBox ||
            !body
        ) {
            return;
        }

        let shell =
            document.getElementById(
                "accountSettingsShell"
            );

        if (shell) {
            const notificationSection =
                document.getElementById(
                    "scheduleNotificationSettings"
                );

            const notificationPanel =
                document.querySelector(
                    '#accountSettingsShell .account-settings-tab[data-tab="notifications"]'
                );

            if (
                notificationSection &&
                notificationPanel &&
                notificationSection.parentElement !==
                    notificationPanel
            ) {
                notificationPanel.appendChild(
                    notificationSection
                );
            }

            return;
        }

        modalBox.classList.add(
            "account-settings-modal"
        );

        const message =
            document.getElementById(
                "accountMessage"
            );

        const error =
            document.getElementById(
                "accountError"
            );

        shell =
            document.createElement(
                "div"
            );

        shell.id =
            "accountSettingsShell";

        shell.className =
            "account-settings-shell";

        const nav =
            document.createElement(
                "nav"
            );

        nav.className =
            "account-settings-nav";

        [
            [
                "general",
                "General",
                "Personal details and appearance"
            ],
            [
                "notifications",
                "Notifications",
                "Scheduling alerts"
            ],
            [
                "account",
                "Account Settings",
                "Password and security"
            ]
        ].forEach(
            (
                [
                    key,
                    label,
                    description
                ]
            ) => {
                const button =
                    document.createElement(
                        "button"
                    );

                button.type =
                    "button";

                button.className =
                    "account-settings-nav-button";

                button.dataset.tab =
                    key;

                button.innerHTML =
                    `
                    <span>
                        ${label}
                    </span>

                    <small>
                        ${description}
                    </small>
                    `;

                button.addEventListener(
                    "click",
                    () =>
                        showAccountSettingsTab(
                            key
                        )
                );

                nav.appendChild(
                    button
                );
            }
        );

        const content =
            document.createElement(
                "div"
            );

        content.className =
            "account-settings-content";

        const general =
            document.createElement(
                "section"
            );

        general.className =
            "account-settings-tab";

        general.dataset.tab =
            "general";

        general.innerHTML =
            `
            <div class="account-settings-section-title">
                General
            </div>

            <div class="account-settings-section-subtitle">
                Manage your personal information and appearance.
            </div>
            `;

        [
            getFormGroupFor(
                "accountFirstName"
            ),
            getFormGroupFor(
                "accountLastName"
            ),
            getFormGroupFor(
                "accountEmail"
            ),
            document.getElementById(
                "saveAccountInfoButton"
            )
        ]
            .filter(Boolean)
            .forEach(
                node =>
                    general.appendChild(
                        node
                    )
            );

        const appearanceTitle =
            document.createElement(
                "div"
            );

        appearanceTitle.className =
            "account-settings-subheading";

        appearanceTitle.textContent =
            "Appearance";

        general.appendChild(
            appearanceTitle
        );

        general.appendChild(
            createAppearanceCard()
        );

        const notifications =
            document.createElement(
                "section"
            );

        notifications.className =
            "account-settings-tab";

        notifications.dataset.tab =
            "notifications";

        notifications.innerHTML =
            `
            <div class="account-settings-section-title">
                Notifications
            </div>

            <div class="account-settings-section-subtitle">
                Choose how you want to be notified when scheduling opens.
            </div>
            `;

        const notificationSection =
            document.getElementById(
                "scheduleNotificationSettings"
            );

        if (notificationSection) {
            notifications.appendChild(
                notificationSection
            );
        } else {
            const loading =
                document.createElement(
                    "div"
                );

            loading.className =
                "account-settings-help";

            loading.textContent =
                "Notification settings are loading...";

            notifications.appendChild(
                loading
            );
        }

        const account =
            document.createElement(
                "section"
            );

        account.className =
            "account-settings-tab";

        account.dataset.tab =
            "account";

        account.innerHTML =
            `
            <div class="account-settings-section-title">
                Account Settings
            </div>

            <div class="account-settings-section-subtitle">
                Update your password and account security.
            </div>
            `;

        [
            getFormGroupFor(
                "accountNewPassword"
            ),
            getFormGroupFor(
                "accountConfirmPassword"
            ),
            document.getElementById(
                "changePasswordButton"
            )
        ]
            .filter(Boolean)
            .forEach(
                node =>
                    account.appendChild(
                        node
                    )
            );

        content.appendChild(
            general
        );

        content.appendChild(
            notifications
        );

        content.appendChild(
            account
        );

        Array.from(
            body.children
        ).forEach(
            child => {
                if (
                    child !== message &&
                    child !== error &&
                    child.tagName !==
                        "SCRIPT"
                ) {
                    child.remove();
                }
            }
        );

        if (message) {
            body.appendChild(
                message
            );
        }

        if (error) {
            body.appendChild(
                error
            );
        }

        shell.appendChild(
            nav
        );

        shell.appendChild(
            content
        );

        body.appendChild(
            shell
        );

        showAccountSettingsTab(
            "general"
        );
    }


    function injectAccountSettingsStyles() {
        if (
            document.getElementById(
                "accountSettingsStyles"
            )
        ) {
            return;
        }

        const style =
            document.createElement(
                "style"
            );

        style.id =
            "accountSettingsStyles";

        style.textContent =
            `
            #accountModal {
                align-items:center;
            }

            #accountModal .account-settings-modal {
                width:min(860px, calc(100vw - 32px));
                max-width:860px;
                height:min(620px, calc(100vh - 32px));
                max-height:calc(100vh - 32px);
                display:flex;
                flex-direction:column;
                overflow:hidden;
            }

            #accountModal .modal-header {
                flex:0 0 auto;
                position:relative;
                z-index:4;
            }

            #accountModal .modal-body {
                flex:1 1 auto;
                min-height:0;
                overflow:hidden;
                padding:0;
            }

            #accountModal .modal-footer {
                flex:0 0 auto;
                position:relative;
                z-index:4;
                background:white;
            }

            .account-settings-shell {
                display:grid;
                grid-template-columns:220px minmax(0,1fr);
                height:100%;
                min-height:0;
            }

            .account-settings-nav {
                padding:14px 10px;
                border-right:1px solid #e5e7eb;
                background:#f8fafc;
                overflow-y:auto;
            }

            .account-settings-nav-button {
                display:block;
                width:100%;
                text-align:left;
                border:0;
                border-radius:7px;
                background:transparent;
                padding:10px 11px;
                margin:0 0 5px;
                cursor:pointer;
                color:#334155;
            }

            .account-settings-nav-button span {
                display:block;
                font-size:14px;
                font-weight:700;
            }

            .account-settings-nav-button small {
                display:block;
                margin-top:2px;
                color:#64748b;
                font-size:11px;
                line-height:1.25;
            }

            .account-settings-nav-button:hover {
                background:#eaf1f8;
            }

            .account-settings-nav-button.active {
                background:#17365d;
                color:white;
            }

            .account-settings-nav-button.active small {
                color:#dbeafe;
            }

            .account-settings-content {
                min-width:0;
                min-height:0;
                overflow-y:auto;
                padding:22px 26px 28px;
                background:white;
            }

            .account-settings-tab {
                display:none;
                max-width:560px;
            }

            .account-settings-tab.active {
                display:block;
            }

            .account-settings-section-title {
                font-size:21px;
                font-weight:700;
                color:#1e293b;
                margin-bottom:4px;
            }

            .account-settings-section-subtitle {
                color:#64748b;
                font-size:13px;
                margin-bottom:22px;
            }

            .account-settings-subheading {
                margin:26px 0 10px;
                padding-top:18px;
                border-top:1px solid #e5e7eb;
                color:#1e293b;
                font-size:15px;
                font-weight:700;
            }

            .account-settings-help {
                color:#64748b;
                font-size:12px;
                line-height:1.4;
                margin-top:3px;
            }

            .account-appearance-card {
                display:flex;
                justify-content:space-between;
                align-items:center;
                gap:16px;
                padding:14px;
                border:1px solid #e2e8f0;
                border-radius:8px;
                background:#f8fafc;
            }

            .account-theme-switch {
                position:relative;
                width:46px;
                height:26px;
                flex:0 0 auto;
            }

            .account-theme-switch input {
                opacity:0;
                width:0;
                height:0;
            }

            .account-theme-slider {
                position:absolute;
                inset:0;
                border-radius:999px;
                background:#cbd5e1;
                cursor:pointer;
                transition:.18s;
            }

            .account-theme-slider::before {
                content:"";
                position:absolute;
                width:20px;
                height:20px;
                left:3px;
                top:3px;
                border-radius:50%;
                background:white;
                box-shadow:0 1px 3px rgba(0,0,0,.25);
                transition:.18s;
            }

            .account-theme-switch input:checked + .account-theme-slider {
                background:#17365d;
            }

            .account-theme-switch input:checked + .account-theme-slider::before {
                transform:translateX(20px);
            }

            #scheduleNotificationSettings {
                margin-top:0 !important;
                padding-top:0 !important;
                border-top:0 !important;
            }

            #scheduleNotificationSettings > h3 {
                display:none;
            }

            .acc-dark body,
            body.acc-dark {
                background:#0f172a !important;
                color:#e5e7eb;
            }

            .acc-dark .main-content,
            .acc-dark .schedule-header,
            .acc-dark .quarter-nav,
            .acc-dark .workflow-panel,
            .acc-dark .clinic-panel,
            .acc-dark .legend,
            .acc-dark .modal,
            .acc-dark .quarter-dashboard,
            .acc-dark .person-card,
            .acc-dark .add-person-section {
                background:#111827 !important;
                color:#e5e7eb !important;
                border-color:#334155 !important;
            }

            .acc-dark .topbar,
            .acc-dark .clinic-title,
            .acc-dark .modal-header {
                background:#0b2545 !important;
            }

            .acc-dark table,
            .acc-dark thead,
            .acc-dark tbody,
            .acc-dark tr,
            .acc-dark td,
            .acc-dark th {
                border-color:#334155 !important;
            }

            .acc-dark th,
            .acc-dark .name-column {
                background:#1e293b !important;
                color:#e5e7eb !important;
            }

            .acc-dark .schedule-cell,
            .acc-dark .hours-cell {
                color:#e5e7eb;
            }

            .acc-dark input,
            .acc-dark select,
            .acc-dark textarea {
                background:#0f172a !important;
                color:#f8fafc !important;
                border-color:#475569 !important;
            }

            .acc-dark .modal-footer,
            .acc-dark .account-settings-content {
                background:#111827 !important;
                color:#e5e7eb !important;
            }

            .acc-dark .account-settings-nav {
                background:#0f172a !important;
                border-color:#334155 !important;
            }

            .acc-dark .account-settings-nav-button {
                color:#cbd5e1;
            }

            .acc-dark .account-settings-nav-button:hover {
                background:#1e293b;
            }

            .acc-dark .account-settings-nav-button.active {
                background:#2563eb;
                color:white;
            }

            .acc-dark .account-settings-section-title,
            .acc-dark .account-settings-subheading,
            .acc-dark label,
            .acc-dark h1,
            .acc-dark h2,
            .acc-dark h3,
            .acc-dark strong {
                color:#f8fafc !important;
            }

            .acc-dark .account-settings-section-subtitle,
            .acc-dark .account-settings-help,
            .acc-dark .person-site {
                color:#94a3b8 !important;
            }

            .acc-dark .account-appearance-card {
                background:#0f172a;
                border-color:#334155;
            }

            .acc-dark .notice {
                background:#172554 !important;
                border-color:#2563eb !important;
                color:#dbeafe !important;
            }

            @media (max-width:700px) {
                #accountModal .account-settings-modal {
                    width:calc(100vw - 16px);
                    height:calc(100vh - 16px);
                    max-height:calc(100vh - 16px);
                }

                .account-settings-shell {
                    grid-template-columns:1fr;
                    grid-template-rows:auto minmax(0,1fr);
                }

                .account-settings-nav {
                    display:flex;
                    gap:6px;
                    overflow-x:auto;
                    border-right:0;
                    border-bottom:1px solid #e5e7eb;
                    padding:8px;
                }

                .account-settings-nav-button {
                    flex:0 0 auto;
                    width:auto;
                    margin:0;
                    padding:8px 10px;
                }

                .account-settings-nav-button small {
                    display:none;
                }

                .account-settings-content {
                    padding:18px;
                }
            }
            `;

        document.head.appendChild(
            style
        );
    }


    initializeTheme();
    injectAccountSettingsStyles();

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

                buildAccountSettingsShell();

                setTimeout(
                    buildAccountSettingsShell,
                    0
                );

                return result;
            };
    }

})();
