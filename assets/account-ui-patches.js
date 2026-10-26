/*
 * ACC Schedule Manager - Account settings UI patch
 * Adds tabbed settings navigation and local dark mode.
 */
(function () {
    "use strict";

    const ACCOUNT_UI_VERSION = "2026.08.14.1";
    const THEME_KEY = "acc_schedule_theme";
    const THEME_KEY_PREFIX = "acc_schedule_theme:";

    function themeKeyForUser() {
        const user =
            typeof currentUser !== "undefined" ? currentUser : null;
        return user && user.id
            ? THEME_KEY_PREFIX + user.id
            : null;
    }

    let lastSyncedTheme = null;

    function getAccountTheme() {
        try {
            const user =
                typeof currentUser !== "undefined" ? currentUser : null;
            const meta =
                user && user.user_metadata
                    ? user.user_metadata.theme
                    : null;
            return THEMES.includes(meta) ? meta : null;
        } catch (_) {
            return null;
        }
    }

    function getSavedTheme() {
        const accountTheme = getAccountTheme();
        if (accountTheme) {
            lastSyncedTheme = accountTheme;
            return accountTheme;
        }
        const key = themeKeyForUser();
        const saved = key ? localStorage.getItem(key) : null;
        return THEMES.includes(saved) ? saved : "default";
    }

    function syncThemeToAccount(theme) {
        const user =
            typeof currentUser !== "undefined" ? currentUser : null;
        if (!user || theme === lastSyncedTheme) {
            return;
        }
        lastSyncedTheme = theme;
        try {
            if (
                typeof supabaseClient === "undefined" ||
                !supabaseClient.auth
            ) {
                lastSyncedTheme = null;
                return;
            }
            const result =
                supabaseClient.auth.updateUser({ data: { theme } });
            if (result && typeof result.then === "function") {
                result.then(({ error }) => {
                    if (error) {
                        console.warn(
                            "Theme sync failed:",
                            error.message || error
                        );
                        lastSyncedTheme = null;
                        return;
                    }
                    if (theme !== lastSyncedTheme) {
                        return;
                    }
                    try {
                        const current =
                            typeof currentUser !== "undefined"
                                ? currentUser
                                : null;
                        if (current) {
                            current.user_metadata = Object.assign(
                                {},
                                current.user_metadata,
                                { theme }
                            );
                        }
                    } catch (_) {}
                }).catch(() => {
                    lastSyncedTheme = null;
                });
            }
        } catch (_) {
            lastSyncedTheme = null;
        }
    }

    console.info(
        `[ACC Schedule Manager] account UI patch loaded: ${ACCOUNT_UI_VERSION}`
    );

    const THEMES = [
        "default",
        "dark",
        "forest",
        "plum",
        "teal",
        "cotton",
        "sunset",
        "bubblegum",
        "ocean",
        "cherry",
        "lime",
        "lemonade"
    ];

    const THEME_CLASSES = [
        "acc-dark",
        "acc-theme-forest",
        "acc-theme-plum",
        "acc-theme-teal",
        "acc-theme-cotton",
        "acc-theme-sunset",
        "acc-theme-bubblegum",
        "acc-theme-ocean",
        "acc-theme-cherry",
        "acc-theme-lime",
        "acc-theme-lemonade"
    ];

    function applyThemeClasses(theme) {
        if (!THEMES.includes(theme)) {
            theme = "default";
        }

        THEME_CLASSES.forEach(
            cls => {
                document.documentElement.classList.remove(cls);
                document.body.classList.remove(cls);
            }
        );

        const cls =
            theme === "dark"
                ? "acc-dark"
                : theme === "default"
                    ? null
                    : "acc-theme-" + theme;

        if (cls) {
            document.documentElement.classList.add(cls);
            document.body.classList.add(cls);
        }

        document
            .querySelectorAll(
                'input[name="accountThemeChoice"]'
            )
            .forEach(
                radio => {
                    radio.checked =
                        radio.value === theme;
                }
            );
    }

    function applyTheme(theme) {
        if (!THEMES.includes(theme)) {
            theme = "default";
        }

        applyThemeClasses(theme);

        const key = themeKeyForUser();
        if (key) {
            localStorage.setItem(key, theme);
        }

        syncThemeToAccount(theme);
    }


    function initializeTheme() {
        applyThemeClasses("default");
    }

    if (typeof window.showApp === "function") {
        const originalShowApp = window.showApp;
        window.showApp = function (...args) {
            const result = originalShowApp.apply(this, args);
            applyTheme(getSavedTheme());
            return result;
        };
    }

    if (typeof window.updateUserHeader === "function") {
        const originalUpdateUserHeader = window.updateUserHeader;
        window.updateUserHeader = function (...args) {
            const result = originalUpdateUserHeader.apply(this, args);
            applyTheme(getSavedTheme());
            return result;
        };
    }

    if (typeof window.showLogin === "function") {
        const originalShowLogin = window.showLogin;
        window.showLogin = function (...args) {
            const result = originalShowLogin.apply(this, args);
            applyThemeClasses("default");
            return result;
        };
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

        const options = [
            ["default", "Default", "linear-gradient(135deg,#2563eb,#0d2b5b)"],
            ["dark", "Dark", "linear-gradient(135deg,#334155,#0f172a)"],
            ["forest", "Forest", "linear-gradient(135deg,#22c55e,#14532d)"],
            ["plum", "Plum", "linear-gradient(135deg,#a78bfa,#5b21b6)"],
            ["teal", "Teal", "linear-gradient(135deg,#5eead4,#0f766e)"],
            ["cotton", "Cotton Candy", "linear-gradient(135deg,#f9a8d4,#7dd3fc)"],
            ["sunset", "Sunset", "linear-gradient(135deg,#fdba74,#f472b6)"],
            ["bubblegum", "Bubblegum", "linear-gradient(135deg,#f9a8d4,#c4b5fd)"],
            ["ocean", "Ocean", "linear-gradient(135deg,#7dd3fc,#22d3ee)"],
            ["cherry", "Cherry", "linear-gradient(135deg,#fca5a5,#ef4444)"],
            ["lime", "Lime", "linear-gradient(135deg,#bef264,#84cc16)"],
            ["lemonade", "Lemonade", "linear-gradient(135deg,#fde047,#f59e0b)"]
        ];

        const saved = getSavedTheme();

        const current =
            THEMES.includes(saved)
                ? saved
                : "default";

        card.innerHTML =
            `
            <div>
                <strong>
                    Color Theme
                </strong>

                <div class="account-settings-help">
                    Pick a look for your account. Each person keeps their own theme.
                </div>
            </div>

            <div class="account-theme-options">
                ${options.map(([value, label, swatch]) => `
                    <label class="account-theme-option">
                        <input
                            type="radio"
                            name="accountThemeChoice"
                            value="${value}"
                            ${value === current ? "checked" : ""}
                        >
                        <span
                            class="account-theme-swatch"
                            style="background:${swatch};"
                        ></span>
                        <span class="account-theme-name">
                            ${label}
                        </span>
                    </label>
                `).join("")}
            </div>
            `;

        card
            .querySelectorAll(
                'input[name="accountThemeChoice"]'
            )
            .forEach(
                radio => {
                    radio.addEventListener(
                        "change",
                        function () {
                            if (radio.checked) {
                                applyTheme(
                                    radio.value
                                );
                            }
                        }
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
                "Email, username, password and security"
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
                Update your email, username, password and account security.
            </div>
            `;

        [
            getFormGroupFor(
                "accountEmail"
            ),
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
                flex-direction:column;
                align-items:stretch;
                gap:12px;
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

            .account-theme-options {
                display:grid;
                grid-template-columns:repeat(3,1fr);
                gap:8px;
                margin-top:12px;
            }

            .account-theme-option {
                display:flex;
                flex-direction:column;
                align-items:center;
                text-align:center;
                gap:8px;
                border:1px solid #e2e8f0;
                border-radius:10px;
                padding:12px 8px;
                cursor:pointer;
                background:#fff;
            }

            .account-theme-option:has(input:checked) {
                border-color:#5b8def;
                box-shadow:0 0 0 3px rgba(59,130,246,.12);
            }

            .account-theme-option:has(input:focus-visible) {
                outline:2px solid #5b8def;
                outline-offset:2px;
            }

            .account-theme-option input {
                position:absolute;
                opacity:0;
                pointer-events:none;
            }

            .account-theme-swatch {
                width:32px;
                height:32px;
                border-radius:50%;
                flex:none;
                border:1px solid rgba(0,0,0,.08);
            }

            .account-theme-name {
                font-weight:700;
                font-size:12px;
                color:#18365f;
            }

            @media (max-width:480px) {
                .account-theme-options {
                    grid-template-columns:repeat(2,1fr);
                }
            }

            .acc-theme-forest .topbar {
                background:linear-gradient(110deg,#052e16 0%,#14532d 56%,#166534 100%) !important;
            }

            .acc-theme-forest .topbar-title:before {
                background:linear-gradient(135deg,#22c55e,#15803d) !important;
            }

            .acc-theme-forest .clinic-title {
                background:linear-gradient(110deg,#052e16,#14532d) !important;
            }

            .acc-theme-forest .workflow-button.primary,
            .acc-theme-forest .save-button,
            .acc-theme-forest .login-button,
            .acc-theme-forest .rail-primary {
                background:linear-gradient(135deg,#15803d,#14532d) !important;
                border-color:#15803d !important;
            }

            .acc-theme-forest .quarter-week-button.active {
                background:linear-gradient(135deg,#15803d,#14532d) !important;
                border-color:#15803d !important;
            }

            .acc-theme-forest .premium-avatar {
                background:linear-gradient(135deg,#16a34a,#14532d) !important;
            }

            .acc-theme-plum .topbar {
                background:linear-gradient(110deg,#2e1065 0%,#4c1d95 56%,#6d28d9 100%) !important;
            }

            .acc-theme-plum .topbar-title:before {
                background:linear-gradient(135deg,#a78bfa,#7c3aed) !important;
            }

            .acc-theme-plum .clinic-title {
                background:linear-gradient(110deg,#2e1065,#5b21b6) !important;
            }

            .acc-theme-plum .workflow-button.primary,
            .acc-theme-plum .save-button,
            .acc-theme-plum .login-button,
            .acc-theme-plum .rail-primary {
                background:linear-gradient(135deg,#7c3aed,#5b21b6) !important;
                border-color:#7c3aed !important;
            }

            .acc-theme-plum .quarter-week-button.active {
                background:linear-gradient(135deg,#7c3aed,#5b21b6) !important;
                border-color:#7c3aed !important;
            }

            .acc-theme-plum .premium-avatar {
                background:linear-gradient(135deg,#8b5cf6,#5b21b6) !important;
            }

            .acc-theme-teal .topbar {
                background:linear-gradient(110deg,#042f2e 0%,#0f766e 56%,#14b8a6 100%) !important;
            }

            .acc-theme-teal .topbar-title:before {
                background:linear-gradient(135deg,#5eead4,#14b8a6) !important;
            }

            .acc-theme-teal .clinic-title {
                background:linear-gradient(110deg,#042f2e,#0f766e) !important;
            }

            .acc-theme-teal .workflow-button.primary,
            .acc-theme-teal .save-button,
            .acc-theme-teal .login-button,
            .acc-theme-teal .rail-primary {
                background:linear-gradient(135deg,#14b8a6,#0f766e) !important;
                border-color:#0d9488 !important;
            }

            .acc-theme-teal .quarter-week-button.active {
                background:linear-gradient(135deg,#14b8a6,#0f766e) !important;
                border-color:#0d9488 !important;
            }

            .acc-theme-teal .premium-avatar {
                background:linear-gradient(135deg,#2dd4bf,#0f766e) !important;
            }

            .acc-theme-cotton .topbar {
                background:linear-gradient(110deg,#9d174d 0%,#db2777 50%,#0284c7 100%) !important;
            }

            .acc-theme-cotton .topbar-title:before {
                background:linear-gradient(135deg,#f9a8d4,#7dd3fc) !important;
            }

            .acc-theme-cotton .clinic-title {
                background:linear-gradient(110deg,#9d174d,#0369a1) !important;
            }

            .acc-theme-cotton .workflow-button.primary,
            .acc-theme-cotton .save-button,
            .acc-theme-cotton .login-button,
            .acc-theme-cotton .rail-primary {
                background:linear-gradient(135deg,#ec4899,#0284c7) !important;
                border-color:#ec4899 !important;
            }

            .acc-theme-cotton .quarter-week-button.active {
                background:linear-gradient(135deg,#ec4899,#0284c7) !important;
                border-color:#ec4899 !important;
            }

            .acc-theme-cotton .premium-avatar {
                background:linear-gradient(135deg,#f472b6,#38bdf8) !important;
            }

            .acc-theme-sunset .topbar {
                background:linear-gradient(110deg,#9a3412 0%,#db2777 100%) !important;
            }

            .acc-theme-sunset .topbar-title:before {
                background:linear-gradient(135deg,#fdba74,#f472b6) !important;
            }

            .acc-theme-sunset .clinic-title {
                background:linear-gradient(110deg,#7c2d12,#9d174d) !important;
            }

            .acc-theme-sunset .workflow-button.primary,
            .acc-theme-sunset .save-button,
            .acc-theme-sunset .login-button,
            .acc-theme-sunset .rail-primary {
                background:linear-gradient(135deg,#f97316,#db2777) !important;
                border-color:#ea580c !important;
            }

            .acc-theme-sunset .quarter-week-button.active {
                background:linear-gradient(135deg,#f97316,#db2777) !important;
                border-color:#ea580c !important;
            }

            .acc-theme-sunset .premium-avatar {
                background:linear-gradient(135deg,#fb923c,#ec4899) !important;
            }

            .acc-theme-bubblegum .topbar {
                background:linear-gradient(110deg,#be185d 0%,#7c3aed 100%) !important;
            }

            .acc-theme-bubblegum .topbar-title:before {
                background:linear-gradient(135deg,#f9a8d4,#c4b5fd) !important;
            }

            .acc-theme-bubblegum .clinic-title {
                background:linear-gradient(110deg,#831843,#5b21b6) !important;
            }

            .acc-theme-bubblegum .workflow-button.primary,
            .acc-theme-bubblegum .save-button,
            .acc-theme-bubblegum .login-button,
            .acc-theme-bubblegum .rail-primary {
                background:linear-gradient(135deg,#ec4899,#8b5cf6) !important;
                border-color:#db2777 !important;
            }

            .acc-theme-bubblegum .quarter-week-button.active {
                background:linear-gradient(135deg,#ec4899,#8b5cf6) !important;
                border-color:#db2777 !important;
            }

            .acc-theme-bubblegum .premium-avatar {
                background:linear-gradient(135deg,#f472b6,#a78bfa) !important;
            }

            .acc-theme-ocean .topbar {
                background:linear-gradient(110deg,#0c4a6e 0%,#0891b2 100%) !important;
            }

            .acc-theme-ocean .topbar-title:before {
                background:linear-gradient(135deg,#7dd3fc,#22d3ee) !important;
            }

            .acc-theme-ocean .clinic-title {
                background:linear-gradient(110deg,#082f49,#155e75) !important;
            }

            .acc-theme-ocean .workflow-button.primary,
            .acc-theme-ocean .save-button,
            .acc-theme-ocean .login-button,
            .acc-theme-ocean .rail-primary {
                background:linear-gradient(135deg,#0284c7,#06b6d4) !important;
                border-color:#0284c7 !important;
            }

            .acc-theme-ocean .quarter-week-button.active {
                background:linear-gradient(135deg,#0284c7,#06b6d4) !important;
                border-color:#0284c7 !important;
            }

            .acc-theme-ocean .premium-avatar {
                background:linear-gradient(135deg,#38bdf8,#22d3ee) !important;
            }

            .acc-theme-forest .acc-sidebar {
                background:linear-gradient(180deg,#052e16 0%,#14532d 66%,#166534 100%) !important;
            }

            .acc-theme-forest .acc-sidebar-label {
                color:#8fd6a8 !important;
            }

            .acc-theme-forest .acc-nav-item.active {
                background:linear-gradient(135deg,#15803d,#22c55e) !important;
                box-shadow:0 8px 18px rgba(21,128,61,.35) !important;
            }

            .acc-theme-forest .acc-sidebar-footer {
                color:#a7c4b0 !important;
            }

            .acc-theme-plum .acc-sidebar {
                background:linear-gradient(180deg,#2e1065 0%,#4c1d95 66%,#5b21b6 100%) !important;
            }

            .acc-theme-plum .acc-sidebar-label {
                color:#c4b5fd !important;
            }

            .acc-theme-plum .acc-nav-item.active {
                background:linear-gradient(135deg,#7c3aed,#a78bfa) !important;
                box-shadow:0 8px 18px rgba(124,58,237,.35) !important;
            }

            .acc-theme-plum .acc-sidebar-footer {
                color:#d8d0f0 !important;
            }

            .acc-theme-teal .acc-sidebar {
                background:linear-gradient(180deg,#042f2e 0%,#0f766e 66%,#115e59 100%) !important;
            }

            .acc-theme-teal .acc-sidebar-label {
                color:#99f6e4 !important;
            }

            .acc-theme-teal .acc-nav-item.active {
                background:linear-gradient(135deg,#14b8a6,#2dd4bf) !important;
                box-shadow:0 8px 18px rgba(20,184,166,.35) !important;
            }

            .acc-theme-teal .acc-sidebar-footer {
                color:#b8e0dc !important;
            }

            .acc-theme-cotton .acc-sidebar {
                background:linear-gradient(180deg,#4a044e 0%,#9d174d 55%,#0c4a6e 100%) !important;
            }

            .acc-theme-cotton .acc-sidebar-label {
                color:#fbcfe8 !important;
            }

            .acc-theme-cotton .acc-nav-item.active {
                background:linear-gradient(135deg,#ec4899,#38bdf8) !important;
                box-shadow:0 8px 18px rgba(236,72,153,.35) !important;
            }

            .acc-theme-cotton .acc-sidebar-footer {
                color:#e8d0e0 !important;
            }

            .acc-theme-sunset .acc-sidebar {
                background:linear-gradient(180deg,#431407 0%,#9a3412 60%,#9d174d 100%) !important;
            }

            .acc-theme-sunset .acc-sidebar-label {
                color:#fed7aa !important;
            }

            .acc-theme-sunset .acc-nav-item.active {
                background:linear-gradient(135deg,#f97316,#ec4899) !important;
                box-shadow:0 8px 18px rgba(249,115,22,.35) !important;
            }

            .acc-theme-sunset .acc-sidebar-footer {
                color:#f0d5c0 !important;
            }

            .acc-theme-bubblegum .acc-sidebar {
                background:linear-gradient(180deg,#4a044e 0%,#86198f 55%,#6d28d9 100%) !important;
            }

            .acc-theme-bubblegum .acc-sidebar-label {
                color:#f5d0fe !important;
            }

            .acc-theme-bubblegum .acc-nav-item.active {
                background:linear-gradient(135deg,#ec4899,#a78bfa) !important;
                box-shadow:0 8px 18px rgba(236,72,153,.35) !important;
            }

            .acc-theme-bubblegum .acc-sidebar-footer {
                color:#e8d0f0 !important;
            }

            .acc-theme-ocean .acc-sidebar {
                background:linear-gradient(180deg,#082f49 0%,#0c4a6e 60%,#0891b2 100%) !important;
            }

            .acc-theme-ocean .acc-sidebar-label {
                color:#bae6fd !important;
            }

            .acc-theme-ocean .acc-nav-item.active {
                background:linear-gradient(135deg,#0284c7,#22d3ee) !important;
                box-shadow:0 8px 18px rgba(2,132,199,.35) !important;
            }

            .acc-theme-ocean .acc-sidebar-footer {
                color:#c0d8e4 !important;
            }

            .acc-theme-cherry .topbar {
                background:linear-gradient(110deg,#7f1d1d 0%,#dc2626 100%) !important;
            }

            .acc-theme-cherry .topbar-title:before {
                background:linear-gradient(135deg,#fca5a5,#f87171) !important;
            }

            .acc-theme-cherry .clinic-title {
                background:linear-gradient(110deg,#450a0a,#991b1b) !important;
            }

            .acc-theme-cherry .workflow-button.primary,
            .acc-theme-cherry .save-button,
            .acc-theme-cherry .login-button,
            .acc-theme-cherry .rail-primary {
                background:linear-gradient(135deg,#dc2626,#ef4444) !important;
                border-color:#b91c1c !important;
            }

            .acc-theme-cherry .quarter-week-button.active {
                background:linear-gradient(135deg,#dc2626,#ef4444) !important;
                border-color:#b91c1c !important;
            }

            .acc-theme-cherry .premium-avatar {
                background:linear-gradient(135deg,#fca5a5,#ef4444) !important;
            }

            .acc-theme-cherry .acc-sidebar {
                background:linear-gradient(180deg,#450a0a 0%,#7f1d1d 60%,#991b1b 100%) !important;
            }

            .acc-theme-cherry .acc-sidebar-label {
                color:#fecaca !important;
            }

            .acc-theme-cherry .acc-nav-item.active {
                background:linear-gradient(135deg,#dc2626,#f87171) !important;
                box-shadow:0 8px 18px rgba(220,38,38,.35) !important;
            }

            .acc-theme-cherry .acc-sidebar-footer {
                color:#f0c8c0 !important;
            }

            .acc-theme-lime .topbar {
                background:linear-gradient(110deg,#365314 0%,#65a30d 100%) !important;
            }

            .acc-theme-lime .topbar-title:before {
                background:linear-gradient(135deg,#bef264,#a3e635) !important;
            }

            .acc-theme-lime .clinic-title {
                background:linear-gradient(110deg,#1a2e05,#3f6212) !important;
            }

            .acc-theme-lime .workflow-button.primary,
            .acc-theme-lime .save-button,
            .acc-theme-lime .login-button,
            .acc-theme-lime .rail-primary {
                background:linear-gradient(135deg,#65a30d,#84cc16) !important;
                border-color:#4d7c0f !important;
            }

            .acc-theme-lime .quarter-week-button.active {
                background:linear-gradient(135deg,#65a30d,#84cc16) !important;
                border-color:#4d7c0f !important;
            }

            .acc-theme-lime .premium-avatar {
                background:linear-gradient(135deg,#bef264,#a3e635) !important;
            }

            .acc-theme-lime .acc-sidebar {
                background:linear-gradient(180deg,#1a2e05 0%,#365314 60%,#4d7c0f 100%) !important;
            }

            .acc-theme-lime .acc-sidebar-label {
                color:#d9f99d !important;
            }

            .acc-theme-lime .acc-nav-item.active {
                background:linear-gradient(135deg,#65a30d,#a3e635) !important;
                box-shadow:0 8px 18px rgba(101,163,13,.35) !important;
            }

            .acc-theme-lime .acc-sidebar-footer {
                color:#d8e4c0 !important;
            }

            .acc-theme-lemonade .topbar {
                background:linear-gradient(110deg,#78350f 0%,#b45309 100%) !important;
            }

            .acc-theme-lemonade .topbar-title:before {
                background:linear-gradient(135deg,#fcd34d,#fbbf24) !important;
            }

            .acc-theme-lemonade .clinic-title {
                background:linear-gradient(110deg,#451a03,#92400e) !important;
            }

            .acc-theme-lemonade .workflow-button.primary,
            .acc-theme-lemonade .save-button,
            .acc-theme-lemonade .login-button,
            .acc-theme-lemonade .rail-primary {
                background:linear-gradient(135deg,#d97706,#b45309) !important;
                border-color:#92400e !important;
            }

            .acc-theme-lemonade .quarter-week-button.active {
                background:linear-gradient(135deg,#d97706,#b45309) !important;
                border-color:#92400e !important;
            }

            .acc-theme-lemonade .premium-avatar {
                background:linear-gradient(135deg,#fcd34d,#f59e0b) !important;
            }

            .acc-theme-lemonade .acc-sidebar {
                background:linear-gradient(180deg,#451a03 0%,#78350f 60%,#92400e 100%) !important;
            }

            .acc-theme-lemonade .acc-sidebar-label {
                color:#fde68a !important;
            }

            .acc-theme-lemonade .acc-nav-item.active {
                background:linear-gradient(135deg,#d97706,#f59e0b) !important;
                box-shadow:0 8px 18px rgba(217,119,6,.35) !important;
            }

            .acc-theme-lemonade .acc-sidebar-footer {
                color:#f0e0c0 !important;
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
