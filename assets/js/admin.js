/* =========================================================
   ACCOUNT MANAGER
========================================================= */

function openAccountManager() {

    if (
        !currentUser ||
        !currentProfile
    ) {
        return;
    }

    clearAccountMessages();

    document
        .getElementById(
            "accountFirstName"
        )
        .value =
            currentProfile.first_name || "";

    document
        .getElementById(
            "accountLastName"
        )
        .value =
            currentProfile.last_name || "";

    document
        .getElementById(
            "accountEmail"
        )
        .value =
            currentUser.email || "";

    document
        .getElementById(
            "accountNewPassword"
        )
        .value = "";

    document
        .getElementById(
            "accountConfirmPassword"
        )
        .value = "";

    document
        .getElementById(
            "accountModal"
        )
        .classList.add(
            "show"
        );
}


function closeAccountManager() {

    document
        .getElementById(
            "accountModal"
        )
        .classList.remove(
            "show"
        );
}


function clearAccountMessages() {

    const errorBox =
        document.getElementById(
            "accountError"
        );

    const messageBox =
        document.getElementById(
            "accountMessage"
        );

    errorBox.textContent = "";
    errorBox.style.display =
        "none";

    messageBox.textContent = "";
    messageBox.style.display =
        "none";
}


function showAccountError(
    message
) {

    const errorBox =
        document.getElementById(
            "accountError"
        );

    errorBox.textContent =
        message;

    errorBox.style.display =
        "block";
}


function showAccountMessage(
    message
) {

    const messageBox =
        document.getElementById(
            "accountMessage"
        );

    messageBox.textContent =
        message;

    messageBox.style.display =
        "block";
}


async function saveAccountInfo() {

    clearAccountMessages();

    const firstName =
        document
            .getElementById(
                "accountFirstName"
            )
            .value
            .trim();

    const lastName =
        document
            .getElementById(
                "accountLastName"
            )
            .value
            .trim();

    const email =
        document
            .getElementById(
                "accountEmail"
            )
            .value
            .trim();

    const button =
        document.getElementById(
            "saveAccountInfoButton"
        );

    if (
        !firstName ||
        !lastName ||
        !email
    ) {
        showAccountError(
            "First name, last name, and email are required."
        );

        return;
    }

    button.disabled =
        true;

    button.textContent =
        "Saving...";

    try {

        /*
         * Update first/last name through a tightly-scoped
         * Postgres RPC function. This avoids exposing broad
         * UPDATE permission on profiles and avoids relying
         * on an Edge Function for this simple database change.
         */
        const {
            error: profileError
        } =
            await supabaseClient
                .rpc(
                    "update_my_profile",
                    {
                        p_first_name:
                            firstName,

                        p_last_name:
                            lastName
                    }
                );

        if (
            profileError
        ) {
            throw new Error(
                profileError.message ||
                "Unable to update your name."
            );
        }


        let emailChanged =
            false;

        if (
            email.toLowerCase() !==
            String(
                currentUser.email || ""
            ).toLowerCase()
        ) {

            const {
                error: emailError
            } =
                await supabaseClient
                    .auth
                    .updateUser({
                        email
                    });

            if (
                emailError
            ) {
                throw new Error(
                    emailError.message
                );
            }

            emailChanged =
                true;
        }


        currentProfile.first_name =
            firstName;

        currentProfile.last_name =
            lastName;

        /*
         * Also update the in-memory profiles list so
         * the schedule immediately reflects the new name.
         */
        const profileIndex =
            profiles.findIndex(
                profile =>
                    profile.id ===
                    currentUser.id
            );

        if (
            profileIndex !== -1
        ) {
            profiles[
                profileIndex
            ].first_name =
                firstName;

            profiles[
                profileIndex
            ].last_name =
                lastName;
        }

        updateUserHeader();

        /*
         * Redraw the current week's schedule immediately
         * so the updated name appears in the clinic table.
         */
        renderSchedule();

        /*
         * Refresh Auth state. If Secure Email Change
         * is enabled, the old email can remain here
         * until the confirmation process is completed.
         */
        const {
            data: userData
        } =
            await supabaseClient
                .auth
                .getUser();

        if (
            userData &&
            userData.user
        ) {
            currentUser =
                userData.user;
        }

        document
            .getElementById(
                "accountEmail"
            )
            .value =
                currentUser.email ||
                email;

        if (
            emailChanged
        ) {
            showAccountMessage(
                "Your name was updated. Supabase may require confirmation of the email change. Check your current and new email inboxes for confirmation messages."
            );
        } else {
            showAccountMessage(
                "Your account information was updated."
            );
        }

    } catch (
        error
    ) {

        console.error(
            error
        );

        showAccountError(
            error.message ||
            "Unable to update your account."
        );

    } finally {

        button.disabled =
            false;

        button.textContent =
            "Save Account Information";
    }
}


async function changeOwnPassword() {

    clearAccountMessages();

    const password =
        document
            .getElementById(
                "accountNewPassword"
            )
            .value;

    const confirmation =
        document
            .getElementById(
                "accountConfirmPassword"
            )
            .value;

    const button =
        document.getElementById(
            "changePasswordButton"
        );

    if (
        password.length <
        8
    ) {
        showAccountError(
            "Your new password must be at least 8 characters."
        );

        return;
    }

    if (
        password !==
        confirmation
    ) {
        showAccountError(
            "The passwords do not match."
        );

        return;
    }

    button.disabled =
        true;

    button.textContent =
        "Changing...";

    const {
        error
    } =
        await supabaseClient
            .auth
            .updateUser({
                password
            });

    button.disabled =
        false;

    button.textContent =
        "Change Password";

    if (
        error
    ) {
        console.error(
            error
        );

        showAccountError(
            error.message ||
            "Unable to change your password."
        );

        return;
    }

    document
        .getElementById(
            "accountNewPassword"
        )
        .value = "";

    document
        .getElementById(
            "accountConfirmPassword"
        )
        .value = "";

    showAccountMessage(
        "Your password was changed successfully."
    );
}


/* =========================================================
   ADMIN
========================================================= */

function openAdmin() {

    if (
        !currentProfile ||
        currentProfile.role !==
        "admin"
    ) {
        return;
    }

    document
        .getElementById(
            "adminModal"
        )
        .classList.add(
            "show"
        );

    closeAddEmployeeSection();
    renderAdminQuarterControls();
    renderPeopleList();
}


function closeAdmin() {

    document
        .getElementById(
            "adminModal"
        )
        .classList.remove(
            "show"
        );
}


function openAddEmployeeSection() {

    document
        .getElementById(
            "addEmployeeSection"
        )
        .style.display =
            "block";

    document
        .getElementById(
            "adminError"
        )
        .style.display =
            "none";
}


function closeAddEmployeeSection() {

    document
        .getElementById(
            "addEmployeeSection"
        )
        .style.display =
            "none";
}


/* =========================================================
   PEOPLE LIST
========================================================= */

function renderPeopleList() {

    renderQuarterDashboard();

    const container =
        document.getElementById(
            "peopleList"
        );

    container.innerHTML = "";

    if (
        profiles.length === 0
    ) {

        container.innerHTML =
            "<p>No people found.</p>";

        return;
    }

    profiles.forEach(
        profile => {

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "person-card";

            const name =
                document.createElement(
                    "div"
                );

            name.innerHTML =
                `
                <strong>
                    ${
                        escapeHtml(
                            getProfileName(
                                profile
                            )
                        )
                    }
                </strong>

                ${
                    profile.id ===
                    currentUser.id
                        ? `
                            <div
                                style="
                                    font-size:11px;
                                    color:#64748b;
                                    margin-top:3px;
                                "
                            >
                                Your account
                            </div>
                          `
                        : ""
                }
                `;

            const site =
                document.createElement(
                    "div"
                );

            site.className =
                "person-site";

            site.textContent =
                profile.clinic_site
                    ? `Primary: ${profile.clinic_site}`
                    : "Primary: No clinic";

            const role =
                document.createElement(
                    "div"
                );

            role.textContent =
                profile.role === "admin"
                    ? "Administrator"
                    : "Employee";

            const status =
                document.createElement(
                    "div"
                );

            status.innerHTML =
                profile.active
                    ? `
                        <span class="status-active">
                            Active
                        </span>
                      `
                    : `
                        <span class="status-inactive">
                            Inactive
                        </span>
                      `;

            const buttons =
                document.createElement(
                    "div"
                );

            buttons.className =
                "person-buttons";

            const editButton =
                document.createElement(
                    "button"
                );

            editButton.className =
                "modal-button cancel-button";

            editButton.textContent =
                "Edit";

            editButton.onclick =
                function() {
                    editPerson(
                        profile
                    );
                };

            const passwordButton =
                document.createElement(
                    "button"
                );

            passwordButton.className =
                "modal-button cancel-button";

            passwordButton.textContent =
                "Password";

            passwordButton.onclick =
                function() {
                    changePersonPassword(
                        profile
                    );
                };

            buttons.appendChild(
                editButton
            );

            buttons.appendChild(
                passwordButton
            );

            if (
                profile.id !==
                currentUser.id
            ) {

                const activeButton =
                    document.createElement(
                        "button"
                    );

                activeButton.className =
                    "modal-button";

                if (profile.active) {

                    activeButton.classList.add(
                        "cancel-button"
                    );

                    activeButton.textContent =
                        "Deactivate";

                    activeButton.onclick =
                        function() {
                            setPersonActive(
                                profile,
                                false
                            );
                        };

                } else {

                    activeButton.classList.add(
                        "save-button"
                    );

                    activeButton.textContent =
                        "Activate";

                    activeButton.onclick =
                        function() {
                            setPersonActive(
                                profile,
                                true
                            );
                        };
                }

                buttons.appendChild(
                    activeButton
                );
            }

            if (
                adminSchedulingPeriod &&
                profile.active
            ) {
                const accessButton =
                    document.createElement(
                        "button"
                    );

                const isOpen =
                    getQuarterAccessStatusForUser(
                        profile.id
                    );

                accessButton.className =
                    "modal-button";

                accessButton.classList.add(
                    isOpen
                        ? "cancel-button"
                        : "save-button"
                );

                accessButton.textContent =
                    isOpen
                        ? "Close Picks"
                        : "Open Picks";

                accessButton.onclick =
                    function() {
                        toggleQuarterAccess(
                            profile.id
                        );
                    };

                buttons.appendChild(
                    accessButton
                );
            }

            row.appendChild(name);
            row.appendChild(site);
            row.appendChild(role);
            row.appendChild(status);
            row.appendChild(buttons);

            if (
                adminSchedulingPeriod &&
                profile.clinic_site ===
                    "Turfland"
            ) {

                const monthKeys =
                    getPeriodMonthKeys(
                        adminSchedulingPeriod
                    );

                const weekendInfo =
                    document.createElement(
                        "div"
                    );

                weekendInfo.style.cssText =
                    `
                    grid-column: 1 / -1;
                    display:flex;
                    align-items:center;
                    gap:12px;
                    flex-wrap:wrap;
                    font-size:12px;
                    color:#475569;
                    margin-top:-4px;
                    padding-top:6px;
                    border-top:1px solid #f1f5f9;
                    `;

                const title =
                    document.createElement(
                        "strong"
                    );

                title.textContent =
                    "Weekend requirements:";

                weekendInfo.appendChild(
                    title
                );

                monthKeys.forEach(
                    monthKey => {

                        const count =
                            getWeekendDateCountForUser(
                                profile.id,
                                monthKey,
                                adminSchedulingPeriod
                            );

                        const target =
                            getMonthlyWeekendTargetForUser(
                                profile.id,
                                monthKey,
                                adminSchedulingPeriod
                            );

                        const monthWrap =
                            document.createElement(
                                "span"
                            );

                        monthWrap.style.cssText =
                            `
                            display:inline-flex;
                            align-items:center;
                            gap:5px;
                            `;

                        const label =
                            document.createElement(
                                "span"
                            );

                        label.textContent =
                            `${getWeekendMonthLabel(monthKey)} ${count}/`;

                        const select =
                            document.createElement(
                                "select"
                            );

                        select.style.cssText =
                            `
                            padding:3px 6px;
                            border:1px solid #cbd5e1;
                            border-radius:5px;
                            background:white;
                            `;

                        for (
                            let amount = 0;
                            amount <= 10;
                            amount++
                        ) {

                            const option =
                                document.createElement(
                                    "option"
                                );

                            option.value =
                                amount;

                            option.textContent =
                                amount;

                            option.selected =
                                amount === target;

                            select.appendChild(
                                option
                            );
                        }

                        select.addEventListener(
                            "change",
                            function() {

                                setMonthlyWeekendTargetForUser(
                                    profile.id,
                                    monthKey,
                                    select.value
                                );
                            }
                        );

                        monthWrap.appendChild(
                            label
                        );

                        monthWrap.appendChild(
                            select
                        );

                        weekendInfo.appendChild(
                            monthWrap
                        );
                    }
                );

                row.appendChild(
                    weekendInfo
                );
            }

            container.appendChild(row);
        }
    );
}


/* =========================================================
   EDIT PERSON
========================================================= */

async function editPerson(
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
                "Role: employee or admin",
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
            role !== "employee" &&
            role !== "admin"
        ) {

            alert(
                "Role must be employee or admin."
            );

            return;
        }
    }

    const clinicInput =
        prompt(
            "Primary clinic: Turfland or Fountain Court",
            profile.clinic_site || "Turfland"
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
        normalizedClinic === "turfland"
    ) {

        clinicSite =
            "Turfland";

    } else if (
        normalizedClinic === "fountain court" ||
        normalizedClinic === "fountaincourt" ||
        normalizedClinic === "fc"
    ) {

        clinicSite =
            "Fountain Court";

    } else {

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

    if (!success) {
        return;
    }

    /*
     * Changing the primary clinic does not rewrite
     * existing schedules.work_site values.
     */
    await loadWeek();
    renderPeopleList();
}


/* =========================================================
   ACTIVATE / DEACTIVATE
========================================================= */

async function setPersonActive(
    profile,
    active
) {

    const action =
        active
            ? "activate"
            : "deactivate";

    const confirmed =
        confirm(
            active
                ? `Activate ${getProfileName(profile)}?`
                : `Deactivate ${getProfileName(profile)}? They will no longer appear on the schedule.`
        );

    if (!confirmed) {
        return;
    }

    const success =
        await invokeManageUser({
            action,
            user_id:
                profile.id
        });

    if (!success) {
        return;
    }

    await loadWeek();
    renderPeopleList();
}


/* =========================================================
   CHANGE PASSWORD
========================================================= */

async function changePersonPassword(
    profile
) {

    const password =
        prompt(
            `Enter a new temporary password for ${getProfileName(profile)}:`
        );

    if (
        password === null
    ) {
        return;
    }

    if (
        password.length < 8
    ) {

        alert(
            "Password must be at least 8 characters."
        );

        return;
    }

    const success =
        await invokeManageUser({
            action:
                "set_password",

            user_id:
                profile.id,

            password
        });

    if (!success) {
        return;
    }

    alert(
        "Password updated successfully."
    );
}


/* =========================================================
   EDGE FUNCTION
========================================================= */

async function invokeManageUser(
    body
) {

    clearError();

    const {
        data,
        error
    } =
        await supabaseClient
            .functions
            .invoke(
                "manage-user",
                {
                    body
                }
            );

    if (error) {

        console.error(error);

        alert(
            error.message ||
            "Unable to update user."
        );

        return false;
    }

    if (
        data &&
        data.error
    ) {

        alert(
            data.error
        );

        return false;
    }

    return true;
}


/* =========================================================
   ADD PERSON
========================================================= */

async function addEmployee() {

    const firstName =
        document
            .getElementById(
                "newFirstName"
            )
            .value
            .trim();

    const lastName =
        document
            .getElementById(
                "newLastName"
            )
            .value
            .trim();

    const email =
        document
            .getElementById(
                "newEmail"
            )
            .value
            .trim();

    const password =
        document
            .getElementById(
                "newPassword"
            )
            .value;

    const role =
        document
            .getElementById(
                "newRole"
            )
            .value;

    const clinicSite =
        document
            .getElementById(
                "newClinicSite"
            )
            .value;

    const errorBox =
        document.getElementById(
            "adminError"
        );

    const button =
        document.getElementById(
            "addEmployeeButton"
        );

    errorBox.style.display =
        "none";

    if (
        !firstName ||
        !lastName ||
        !email ||
        !password ||
        !clinicSite
    ) {

        errorBox.textContent =
            "Please complete all fields.";

        errorBox.style.display =
            "block";

        return;
    }

    if (
        password.length < 8
    ) {

        errorBox.textContent =
            "Temporary password must be at least 8 characters.";

        errorBox.style.display =
            "block";

        return;
    }

    button.disabled = true;
    button.textContent =
        "Adding...";

    const {
        data,
        error
    } =
        await supabaseClient
            .functions
            .invoke(
                "create-user",
                {
                    body: {
                        email,
                        password,

                        first_name:
                            firstName,

                        last_name:
                            lastName,

                        role,

                        clinic_site:
                            clinicSite
                    }
                }
            );

    button.disabled = false;
    button.textContent =
        "Add Employee";

    if (error) {

        console.error(error);

        errorBox.textContent =
            error.message ||
            "Unable to add employee.";

        errorBox.style.display =
            "block";

        return;
    }

    if (
        data &&
        data.error
    ) {

        errorBox.textContent =
            data.error;

        errorBox.style.display =
            "block";

        return;
    }

    clearAddEmployeeForm();
    closeAddEmployeeSection();

    await loadWeek();
    renderPeopleList();

    alert(
        `${firstName} ${lastName} was added successfully.`
    );
}


function clearAddEmployeeForm() {

    document
        .getElementById(
            "newFirstName"
        )
        .value = "";

    document
        .getElementById(
            "newLastName"
        )
        .value = "";

    document
        .getElementById(
            "newEmail"
        )
        .value = "";

    document
        .getElementById(
            "newPassword"
        )
        .value = "";

    document
        .getElementById(
            "newRole"
        )
        .value =
            "employee";

    document
        .getElementById(
            "newClinicSite"
        )
        .value =
            "Turfland";
}


/* =========================================================
   HTML ESCAPING
========================================================= */

function escapeHtml(value) {

    return String(value)
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}
