/* =========================================================
   RENDERING
========================================================= */

function renderLoading() {

    document
        .getElementById(
            "turflandHeader"
        )
        .innerHTML = "";

    document
        .getElementById(
            "fountainHeader"
        )
        .innerHTML = "";

    document
        .getElementById(
            "turflandBody"
        )
        .innerHTML =
            `
            <tr>
                <td class="loading-cell">
                    Loading schedule...
                </td>
            </tr>
            `;

    document
        .getElementById(
            "fountainBody"
        )
        .innerHTML =
            `
            <tr>
                <td class="loading-cell">
                    Loading schedule...
                </td>
            </tr>
            `;
}


function renderSchedule() {

    updateWeekTitle();

    /*
     * If Previous/Next Week enters another existing quarter,
     * move the quarter/month selectors with the displayed week.
     * Weeks outside every existing quarter leave the current
     * quarter selection unchanged.
     */
    syncQuarterSelectionToCurrentWeek();

    renderQuarterNavigator();
    renderWorkflowPanel();

    renderClinicHeader(
        "turflandHeader"
    );

    renderClinicHeader(
        "fountainHeader"
    );

    renderClinicBody(
        "Turfland",
        "turflandBody"
    );

    renderClinicBody(
        "Fountain Court",
        "fountainBody"
    );
}


function updateWeekTitle() {

    const dates =
        getWeekDates();

    const start =
        dates[0];

    const end =
        dates[6];

    const startFormatter =
        new Intl.DateTimeFormat(
            "en-US",
            {
                month: "short",
                day: "numeric",
                year:
                    start.getFullYear() !==
                    end.getFullYear()
                        ? "numeric"
                        : undefined
            }
        );

    const endFormatter =
        new Intl.DateTimeFormat(
            "en-US",
            {
                month: "short",
                day: "numeric",
                year: "numeric"
            }
        );

    document
        .getElementById(
            "weekTitle"
        )
        .textContent =
            `${startFormatter.format(start)} – ${endFormatter.format(end)}`;
}


function renderClinicHeader(
    elementId
) {

    const header =
        document.getElementById(
            elementId
        );

    header.innerHTML = "";

    const row =
        document.createElement(
            "tr"
        );

    const nameHeader =
        document.createElement(
            "th"
        );

    nameHeader.className =
        "name-column";

    nameHeader.textContent =
        "Employee";

    row.appendChild(
        nameHeader
    );

    getWeekDates().forEach(
        date => {

            const th =
                document.createElement(
                    "th"
                );

            th.className =
                "date-header";

            if (
                date.getDay() === 0 ||
                date.getDay() === 6
            ) {
                th.classList.add(
                    "weekend-header"
                );
            }

            th.innerHTML =
                `
                <span class="date-number">
                    ${date.getMonth() + 1}/${date.getDate()}
                </span>

                <span class="day-name">
                    ${getDayName(date)}
                </span>
                `;

            row.appendChild(th);
        }
    );

    const vacation =
        document.createElement(
            "th"
        );

    vacation.className =
        "hours-column";

    vacation.innerHTML =
        "Vacation<br>Hours";

    row.appendChild(vacation);

    const other =
        document.createElement(
            "th"
        );

    other.className =
        "hours-column";

    other.innerHTML =
        "Other Leave<br>Hours";

    row.appendChild(other);

    const total =
        document.createElement(
            "th"
        );

    total.className =
        "hours-column";

    total.innerHTML =
        "Weekly<br>Total";

    row.appendChild(total);

    const weekendCounter =
        document.createElement(
            "th"
        );

    weekendCounter.className =
        "weekend-counter-cell";

    weekendCounter.innerHTML =
        "Weekend<br>Month";

    row.appendChild(
        weekendCounter
    );

    if (
        currentProfile.role ===
        "admin"
    ) {

        const status =
            document.createElement(
                "th"
            );

        status.className =
            "submission-cell";

        status.innerHTML =
            "Submission<br>Status";

        row.appendChild(
            status
        );
    }

    header.appendChild(row);
}


function renderClinicBody(
    clinicSite,
    bodyId
) {

    const body =
        document.getElementById(
            bodyId
        );

    body.innerHTML = "";

    const clinicProfiles =
        profiles.filter(
            profile =>
                profile.active &&
                profile.clinic_site ===
                    clinicSite
        );

    if (
        clinicProfiles.length === 0
    ) {

        const emptyRow =
            document.createElement(
                "tr"
            );

        const emptyCell =
            document.createElement(
                "td"
            );

        emptyCell.colSpan =
            currentProfile.role === "admin"
                ? 13
                : 12;
        emptyCell.className =
            "empty-cell";

        emptyCell.textContent =
            "No active employees assigned to this clinic.";

        emptyRow.appendChild(
            emptyCell
        );

        body.appendChild(
            emptyRow
        );

    } else {

        clinicProfiles.forEach(
            profile => {

                body.appendChild(
                    createWeeklyEmployeeRow(
                        profile
                    )
                );
            }
        );
    }

    /*
     * Only administrators can see and edit
     * the Shift Capacity row.
     */
    if (
        currentProfile.role ===
        "admin"
    ) {
        body.appendChild(
            createClinicCapacityRow(
                clinicSite
            )
        );
    }

    /*
     * Everyone can still see the calculated
     * Shift Availability row.
     */
    body.appendChild(
        createClinicAvailabilityRow(
            clinicSite,
            clinicProfiles
        )
    );
}


/* =========================================================
   EMPLOYEE ROW
========================================================= */

function createWeeklyEmployeeRow(
    profile
) {

    const row =
        document.createElement(
            "tr"
        );

    if (
        profile.id ===
        currentUser.id
    ) {
        row.classList.add(
            "current-user-row"
        );
    }

    const nameCell =
        document.createElement(
            "td"
        );

    nameCell.className =
        "name-column employee-name";

    nameCell.textContent =
        getProfileName(
            profile
        );

    row.appendChild(nameCell);

    getWeekDates().forEach(
        date => {

            const dateKey =
                getDateKey(date);

            const cell =
                document.createElement(
                    "td"
                );

            cell.className =
                "schedule-cell";

            if (
                date.getDay() === 0 ||
                date.getDay() === 6
            ) {
                cell.classList.add(
                    "weekend-cell"
                );
            }

            const canEdit =
                canEditProfile(
                    profile
                );

            const value =
                getScheduleValue(
                    profile.id,
                    dateKey
                );

            const workSite =
                getScheduleWorkSite(
                    profile,
                    dateKey
                );

            if (canEdit) {

                cell.classList.add(
                    "editable"
                );

                renderEditableScheduleCell(
                    cell,
                    profile,
                    dateKey,
                    value,
                    workSite
                );

            } else {

                cell.classList.add(
                    "locked"
                );

                const valueSpan =
                    document.createElement(
                        "span"
                    );

                valueSpan.textContent =
                    value;

                cell.appendChild(
                    valueSpan
                );

                if (
                    value === "12" &&
                    workSite
                ) {

                    const siteSpan =
                        document.createElement(
                            "span"
                        );

                    siteSpan.className =
                        "shift-site-display";

                    siteSpan.textContent =
                        getClinicAbbreviation(
                            workSite
                        );

                    siteSpan.title =
                        workSite;

                    cell.appendChild(
                        siteSpan
                    );
                }
            }

            const comment =
                comments[
                    makeCommentKey(
                        profile.id,
                        dateKey
                    )
                ];

            if (canEdit) {

                const commentButton =
                    document.createElement(
                        "button"
                    );

                commentButton.className =
                    "comment-button";

                commentButton.textContent =
                    comment
                        ? "🗨"
                        : "💬";

                commentButton.title =
                    comment ||
                    "Add comment";

                commentButton.onclick =
                    function(event) {

                        event.stopPropagation();

                        openCommentModal(
                            profile.id,
                            getProfileName(
                                profile
                            ),
                            dateKey
                        );
                    };

                cell.appendChild(
                    commentButton
                );

            } else if (comment) {

                const indicator =
                    document.createElement(
                        "span"
                    );

                indicator.className =
                    "comment-indicator";

                indicator.textContent =
                    "💬";

                indicator.title =
                    comment;

                cell.appendChild(
                    indicator
                );
            }

            row.appendChild(cell);
        }
    );

    const hours =
        calculateWeeklyHours(
            profile.id
        );

    const vacationCell =
        document.createElement(
            "td"
        );

    vacationCell.className =
        "hours-cell";

    vacationCell.textContent =
        hours.vacation;

    row.appendChild(
        vacationCell
    );

    const otherCell =
        document.createElement(
            "td"
        );

    otherCell.className =
        "hours-cell";

    otherCell.textContent =
        hours.otherLeave;

    row.appendChild(
        otherCell
    );

    const totalCell =
        document.createElement(
            "td"
        );

    totalCell.className =
        "hours-cell";

    totalCell.textContent =
        hours.total;

    if (
        hours.total === 40
    ) {
        totalCell.classList.add(
            "week-hours-good"
        );
    } else if (
        hours.total < 40
    ) {
        totalCell.classList.add(
            "week-hours-low"
        );
    } else {
        totalCell.classList.add(
            "week-hours-high"
        );
    }

    row.appendChild(
        totalCell
    );

    const weekendCounterCell =
        document.createElement(
            "td"
        );

    weekendCounterCell.className =
        "weekend-counter-cell";

    if (
        profile.clinic_site ===
            "Turfland" &&
        activeSchedulingPeriod
    ) {

        const monthKey =
            getAssignedMonthKeyForWeekDate(
                currentWeekStart
            );

        const weekendCount =
            getWeekendDateCountForUser(
                profile.id,
                monthKey,
                activeSchedulingPeriod
            );

        const weekendTarget =
            getMonthlyWeekendTargetForUser(
                profile.id,
                monthKey,
                activeSchedulingPeriod
            );

        weekendCounterCell.textContent =
            `${weekendCount}/${weekendTarget}`;

        weekendCounterCell.title =
            `${getWeekendMonthLabel(monthKey)} weekend dates`;

        weekendCounterCell.classList.add(
            weekendCount >=
                weekendTarget
                ? "weekend-counter-good"
                : "weekend-counter-low"
        );

    } else {

        weekendCounterCell.textContent =
            "—";
    }

    row.appendChild(
        weekendCounterCell
    );

    if (
        currentProfile.role ===
        "admin"
    ) {

        const submissionCell =
            document.createElement(
                "td"
            );

        submissionCell.className =
            "submission-cell";

        const submission =
            weeklySubmissions[
                profile.id
            ];

        if (
            submission &&
            submission.status ===
            "submitted"
        ) {

            submissionCell.textContent =
                "Submitted";

            submissionCell.classList.add(
                "week-hours-good"
            );

        } else if (
            submission &&
            submission.status ===
            "needs_resubmission"
        ) {

            submissionCell.textContent =
                "Needs Resubmit";

            submissionCell.classList.add(
                "week-hours-low"
            );

        } else {

            submissionCell.textContent =
                "Not Submitted";
        }

        row.appendChild(
            submissionCell
        );
    }

    return row;
}


/* =========================================================
   DAILY WORK SITE / CAPACITY ENFORCEMENT
========================================================= */

function getClinicAbbreviation(
    clinicSite
) {

    if (
        clinicSite ===
        "Turfland"
    ) {
        return "T";
    }

    if (
        clinicSite ===
        "Fountain Court"
    ) {
        return "FC";
    }

    return "";
}


function getActiveProfiles() {

    return profiles.filter(
        profile =>
            profile.active
    );
}


function getDateFromKey(
    dateKey
) {

    const [
        year,
        month,
        day
    ] =
        dateKey
            .split("-")
            .map(Number);

    return new Date(
        year,
        month - 1,
        day
    );
}


function getScheduled12Count(
    clinicSite,
    dateKey,
    excludeUserId = null
) {

    let scheduled = 0;

    getActiveProfiles().forEach(
        profile => {

            if (
                excludeUserId &&
                profile.id ===
                    excludeUserId
            ) {
                return;
            }

            const entry =
                getScheduleEntry(
                    profile.id,
                    dateKey
                );

            if (
                entry.code !== "12"
            ) {
                return;
            }

            const actualSite =
                entry.work_site ||
                profile.clinic_site ||
                null;

            if (
                actualSite ===
                clinicSite
            ) {
                scheduled++;
            }
        }
    );

    return scheduled;
}


function getRemainingShiftAvailability(
    clinicSite,
    dateKey,
    excludeUserId = null
) {

    const date =
        getDateFromKey(
            dateKey
        );

    const capacity =
        getClinicCapacity(
            clinicSite,
            date
        );

    const scheduled =
        getScheduled12Count(
            clinicSite,
            dateKey,
            excludeUserId
        );

    return (
        capacity -
        scheduled
    );
}


async function confirmCapacityFor12Shift(
    profile,
    dateKey,
    workSite
) {

    if (!workSite) {
        showError(
            "Choose a clinic site for this 12-hour shift."
        );

        return false;
    }

    /*
     * Exclude this employee from the count so moving an
     * existing 12-hour shift between sites does not count
     * the same person twice.
     */
    const remaining =
        getRemainingShiftAvailability(
            workSite,
            dateKey,
            profile.id
        );

    if (
        remaining > 0
    ) {
        return true;
    }

    if (
        currentProfile.role !==
        "admin"
    ) {

        alert(
            `${workSite} has no 12-hour shifts available on ${dateKey}. Please choose another clinic/day or contact an administrator.`
        );

        return false;
    }

    return confirm(
        `${workSite} is already at capacity on ${dateKey}. Do you want to override the limit and schedule this 12-hour shift anyway?`
    );
}


function renderEditableScheduleCell(
    cell,
    profile,
    dateKey,
    currentValue,
    currentWorkSite
) {

    cell.innerHTML = "";

    const scheduleSelect =
        createScheduleSelect(
            profile,
            dateKey,
            currentValue,
            currentWorkSite,
            cell
        );

    cell.appendChild(
        scheduleSelect
    );

    if (
        currentValue === "12"
    ) {

        const siteSelect =
            createWorkSiteSelect(
                profile,
                dateKey,
                currentWorkSite ||
                    profile.clinic_site,
                cell
            );

        cell.appendChild(
            siteSelect
        );
    }
}


function createWorkSiteSelect(
    profile,
    dateKey,
    currentWorkSite,
    cell
) {

    const select =
        document.createElement(
            "select"
        );

    select.className =
        "work-site-select";

    [
        "Turfland",
        "Fountain Court"
    ].forEach(
        site => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                site;

            option.textContent =
                site === "Turfland"
                    ? "Turfland"
                    : "Fountain Ct.";

            if (
                site ===
                (
                    currentWorkSite ||
                    profile.clinic_site
                )
            ) {
                option.selected =
                    true;
            }

            select.appendChild(
                option
            );
        }
    );

    select.addEventListener(
        "change",
        async function () {

            const oldSite =
                currentWorkSite ||
                profile.clinic_site;

            const newSite =
                select.value;

            if (
                newSite ===
                oldSite
            ) {
                return;
            }

            const allowed =
                await confirmCapacityFor12Shift(
                    profile,
                    dateKey,
                    newSite
                );

            if (!allowed) {
                select.value =
                    oldSite;

                return;
            }

            select.disabled =
                true;

            cell.classList.add(
                "saving"
            );

            const success =
                await saveScheduleValue(
                    profile.id,
                    dateKey,
                    "12",
                    newSite
                );

            if (!success) {
                select.value =
                    oldSite;

                select.disabled =
                    false;

                cell.classList.remove(
                    "saving"
                );

                return;
            }

            if (
                !scheduleData[
                    profile.id
                ]
            ) {
                scheduleData[
                    profile.id
                ] = {};
            }

            scheduleData[
                profile.id
            ][
                dateKey
            ] = {
                code: "12",
                work_site: newSite
            };

            renderSchedule();
        }
    );

    return select;
}


/* =========================================================
   SCHEDULE SELECT / SAVE
========================================================= */

function createScheduleSelect(
    profile,
    dateKey,
    currentValue,
    currentWorkSite,
    cell
) {

    const select =
        document.createElement(
            "select"
        );

    select.className =
        "schedule-select";

    scheduleCodes.forEach(
        code => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                code;

            option.textContent =
                code;

            if (
                code ===
                currentValue
            ) {
                option.selected =
                    true;
            }

            select.appendChild(
                option
            );
        }
    );

    select.addEventListener(
        "change",
        async function () {

            const originalValue =
                currentValue;

            const originalWorkSite =
                currentWorkSite ||
                (
                    originalValue === "12"
                        ? profile.clinic_site
                        : null
                );

            const selectedValue =
                select.value;

            let newWorkSite =
                null;

            if (
                selectedValue ===
                "12"
            ) {

                /*
                 * When changing into a 12-hour shift,
                 * default to the saved work site, or
                 * otherwise the employee's primary site.
                 */
                newWorkSite =
                    originalWorkSite ||
                    profile.clinic_site;

                if (!newWorkSite) {
                    alert(
                        "This employee does not have a primary clinic. An administrator must assign one before scheduling a 12-hour shift."
                    );

                    select.value =
                        originalValue;

                    return;
                }

                /*
                 * If this wasn't already the same 12-hour
                 * assignment, check capacity before saving.
                 */
                const changingIntoNew12 =
                    originalValue !== "12";

                if (
                    changingIntoNew12
                ) {

                    const allowed =
                        await confirmCapacityFor12Shift(
                            profile,
                            dateKey,
                            newWorkSite
                        );

                    if (!allowed) {
                        select.value =
                            originalValue;

                        return;
                    }
                }
            }

            select.disabled =
                true;

            cell.classList.add(
                "saving"
            );

            const success =
                await saveScheduleValue(
                    profile.id,
                    dateKey,
                    selectedValue,
                    newWorkSite
                );

            if (!success) {

                select.value =
                    originalValue;

                select.disabled =
                    false;

                cell.classList.remove(
                    "saving"
                );

                return;
            }

            if (
                !scheduleData[
                    profile.id
                ]
            ) {
                scheduleData[
                    profile.id
                ] = {};
            }

            scheduleData[
                profile.id
            ][
                dateKey
            ] = {
                code:
                    selectedValue,

                work_site:
                    selectedValue === "12"
                        ? newWorkSite
                        : null
            };

            renderSchedule();
        }
    );

    return select;
}


async function saveScheduleValue(
    userId,
    dateKey,
    scheduleCode,
    workSite = null
) {

    clearError();

    const {
        error
    } =
        await supabaseClient
            .from("schedules")
            .upsert(
                {
                    user_id:
                        userId,

                    schedule_date:
                        dateKey,

                    schedule_code:
                        scheduleCode,

                    /*
                     * Only a working 12-hour shift needs
                     * a clinic assignment.
                     */
                    work_site:
                        scheduleCode === "12"
                            ? workSite
                            : null,

                    updated_at:
                        new Date()
                            .toISOString()
                },
                {
                    onConflict:
                        "user_id,schedule_date"
                }
            );

    if (error) {

        console.error(error);

        showError(
            "Schedule could not be saved: "
            +
            error.message
        );

        return false;
    }

    /*
     * If the employee changes their own schedule
     * after submitting, require them to submit again.
     */
    if (
        userId ===
        currentUser.id
    ) {
        await markCurrentUserNeedsResubmission();
    }

    return true;
}


/* =========================================================
   HOURS
========================================================= */

function calculateWeeklyHours(
    userId
) {

    let vacation = 0;
    let otherLeave = 0;
    let total = 0;

    getWeekDates().forEach(
        date => {

            const value =
                getScheduleValue(
                    userId,
                    getDateKey(date)
                );

            const hours =
                codeHours[value] ||
                0;

            total += hours;

            if (
                vacationCodes.includes(
                    value
                )
            ) {
                vacation += hours;
            }

            if (
                otherLeaveCodes.includes(
                    value
                )
            ) {
                otherLeave += hours;
            }
        }
    );

    return {
        vacation,
        otherLeave,
        total
    };
}


/* =========================================================
   CAPACITY ROW
========================================================= */

function createClinicCapacityRow(
    clinicSite
) {

    const row =
        document.createElement(
            "tr"
        );

    row.className =
        "capacity-row";

    const label =
        document.createElement(
            "td"
        );

    label.className =
        "name-column";

    label.textContent =
        "Shift Capacity";

    row.appendChild(label);

    getWeekDates().forEach(
        date => {

            const cell =
                document.createElement(
                    "td"
                );

            const capacity =
                getClinicCapacity(
                    clinicSite,
                    date
                );

            if (
                currentProfile.role ===
                "admin"
            ) {

                const select =
                    document.createElement(
                        "select"
                    );

                select.className =
                    "capacity-select";

                for (
                    let number = 0;
                    number <= 4;
                    number++
                ) {

                    const option =
                        document.createElement(
                            "option"
                        );

                    option.value =
                        String(number);

                    option.textContent =
                        String(number);

                    if (
                        number ===
                        capacity
                    ) {
                        option.selected =
                            true;
                    }

                    select.appendChild(
                        option
                    );
                }

                select.addEventListener(
                    "change",
                    async function () {

                        const oldValue =
                            capacity;

                        const newValue =
                            Number(
                                select.value
                            );

                        select.disabled =
                            true;

                        cell.classList.add(
                            "saving"
                        );

                        const success =
                            await saveClinicCapacity(
                                clinicSite,
                                date,
                                newValue
                            );

                        if (!success) {

                            select.value =
                                String(
                                    oldValue
                                );

                            select.disabled =
                                false;

                            cell.classList.remove(
                                "saving"
                            );

                            return;
                        }

                        renderSchedule();
                    }
                );

                cell.appendChild(
                    select
                );

            } else {

                cell.textContent =
                    String(capacity);
            }

            row.appendChild(cell);
        }
    );

    row.appendChild(
        document.createElement(
            "td"
        )
    );

    row.appendChild(
        document.createElement(
            "td"
        )
    );

    row.appendChild(
        document.createElement(
            "td"
        )
    );

    /*
     * Blank Weekend Month column.
     */
    row.appendChild(
        document.createElement(
            "td"
        )
    );

    /*
     * Capacity row is admin-only, so include the
     * blank Submission Status column too.
     */
    row.appendChild(
        document.createElement(
            "td"
        )
    );

    return row;
}


async function saveClinicCapacity(
    clinicSite,
    date,
    capacity
) {

    clearError();

    if (
        !Number.isInteger(
            capacity
        )
        ||
        capacity < 0
        ||
        capacity > 4
    ) {

        showError(
            "Shift capacity must be a whole number between 0 and 4."
        );

        return false;
    }

    const dateKey =
        getDateKey(date);

    const {
        error
    } =
        await supabaseClient
            .from("clinic_capacity")
            .upsert(
                {
                    clinic_site:
                        clinicSite,

                    capacity_date:
                        dateKey,

                    shift_capacity:
                        capacity,

                    updated_at:
                        new Date()
                            .toISOString()
                },
                {
                    onConflict:
                        "clinic_site,capacity_date"
                }
            );

    if (error) {

        console.error(error);

        showError(
            "Shift capacity could not be saved: "
            +
            error.message
        );

        return false;
    }

    clinicCapacityData[
        `${clinicSite}_${dateKey}`
    ] =
        capacity;

    return true;
}


/* =========================================================
   SHIFT AVAILABILITY
========================================================= */

function createClinicAvailabilityRow(
    clinicSite,
    clinicProfiles
) {

    const row =
        document.createElement(
            "tr"
        );

    row.className =
        "availability-row";

    const label =
        document.createElement(
            "td"
        );

    label.className =
        "name-column";

    label.textContent =
        "Shift Availability";

    row.appendChild(label);

    getWeekDates().forEach(
        date => {

            const cell =
                document.createElement(
                    "td"
                );

            const availability =
                calculateClinicAvailability(
                    clinicSite,
                    clinicProfiles,
                    date
                );

            cell.textContent =
                String(
                    availability
                );

            if (
                availability > 0
            ) {

                cell.classList.add(
                    "availability-open"
                );

                cell.title =
                    `${availability} shift(s) still available`;

            } else if (
                availability === 0
            ) {

                cell.classList.add(
                    "availability-full"
                );

                cell.title =
                    "No shifts remaining";

            } else {

                cell.classList.add(
                    "availability-over"
                );

                cell.title =
                    `${Math.abs(availability)} shift(s) over capacity`;
            }

            row.appendChild(cell);
        }
    );

    row.appendChild(
        document.createElement(
            "td"
        )
    );

    row.appendChild(
        document.createElement(
            "td"
        )
    );

    row.appendChild(
        document.createElement(
            "td"
        )
    );

    /*
     * Blank Weekend Month column.
     */
    row.appendChild(
        document.createElement(
            "td"
        )
    );

    if (
        currentProfile.role ===
        "admin"
    ) {
        row.appendChild(
            document.createElement(
                "td"
            )
        );
    }

    return row;
}


function calculateClinicAvailability(
    clinicSite,
    clinicProfiles,
    date
) {

    const capacity =
        getClinicCapacity(
            clinicSite,
            date
        );

    const dateKey =
        getDateKey(date);

    /*
     * Count every active employee whose actual
     * work_site for this date is this clinic,
     * regardless of their primary clinic.
     */
    const scheduled =
        getScheduled12Count(
            clinicSite,
            dateKey
        );

    return (
        capacity -
        scheduled
    );
}


/* =========================================================
   COMMENTS
========================================================= */

function makeCommentKey(
    userId,
    dateKey
) {

    return `${userId}_${dateKey}`;
}


function openCommentModal(
    userId,
    name,
    dateKey
) {

    activeCommentUserId =
        userId;

    activeCommentDate =
        dateKey;

    document
        .getElementById(
            "commentModalTitle"
        )
        .textContent =
            `Comment — ${name} — ${dateKey}`;

    document
        .getElementById(
            "commentText"
        )
        .value =
            comments[
                makeCommentKey(
                    userId,
                    dateKey
                )
            ]
            ||
            "";

    document
        .getElementById(
            "commentModal"
        )
        .classList.add(
            "show"
        );

    document
        .getElementById(
            "commentText"
        )
        .focus();
}


function closeCommentModal() {

    document
        .getElementById(
            "commentModal"
        )
        .classList.remove(
            "show"
        );

    activeCommentUserId =
        null;

    activeCommentDate =
        null;
}


async function saveComment() {

    if (
        !activeCommentUserId ||
        !activeCommentDate
    ) {
        return;
    }

    const userId =
        activeCommentUserId;

    const dateKey =
        activeCommentDate;

    const text =
        document
            .getElementById(
                "commentText"
            )
            .value
            .trim();

    clearError();

    if (!text) {

        const {
            error
        } =
            await supabaseClient
                .from("schedule_comments")
                .delete()
                .eq(
                    "user_id",
                    userId
                )
                .eq(
                    "schedule_date",
                    dateKey
                );

        if (error) {

            console.error(error);

            showError(
                "Comment could not be removed: "
                +
                error.message
            );

            return;
        }

        delete comments[
            makeCommentKey(
                userId,
                dateKey
            )
        ];

    } else {

        const {
            error
        } =
            await supabaseClient
                .from("schedule_comments")
                .upsert(
                    {
                        user_id:
                            userId,

                        schedule_date:
                            dateKey,

                        comment:
                            text,

                        updated_at:
                            new Date()
                                .toISOString()
                    },
                    {
                        onConflict:
                            "user_id,schedule_date"
                    }
                );

        if (error) {

            console.error(error);

            showError(
                "Comment could not be saved: "
                +
                error.message
            );

            return;
        }

        comments[
            makeCommentKey(
                userId,
                dateKey
            )
        ] =
            text;
    }

    if (
        userId ===
        currentUser.id
    ) {
        await markCurrentUserNeedsResubmission();
    }

    closeCommentModal();
    renderSchedule();
}
