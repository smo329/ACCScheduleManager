/* =========================================================
   WEEK SUBMISSION / LOCKING
========================================================= */

function getCurrentWeekStartKey() {

    return getDateKey(
        currentWeekStart
    );
}


function getSubmissionStatusLabel(
    submission
) {

    if (
        submission &&
        submission.status ===
        "submitted"
    ) {
        return "Submitted";
    }

    if (
        submission &&
        submission.status ===
        "needs_resubmission"
    ) {
        return "Needs Resubmission";
    }

    return "Not Submitted";
}


function getAssignedMonthKeyForWeekDate(
    date
) {
    const sunday =
        getSunday(date);

    /*
     * Assign the Sunday-Saturday week to the month
     * containing the majority of its 7 days.
     *
     * The deciding day is Wednesday (the 4th day):
     * Sun, Mon, Tue, Wed = 4 days in that month.
     *
     * Example:
     * Mar 28-Apr 3 => March (4 March days, 3 April days)
     */
    const majorityDay =
        new Date(sunday);

    majorityDay.setDate(
        sunday.getDate() + 3
    );

    return `${majorityDay.getFullYear()}-${String(
        majorityDay.getMonth() + 1
    ).padStart(2, "0")}`;
}


function getWeekendMonthLabel(
    monthKey
) {
    const [
        year,
        month
    ] =
        monthKey
            .split("-")
            .map(Number);

    return new Intl.DateTimeFormat(
        "en-US",
        { month: "short" }
    ).format(
        new Date(
            year,
            month - 1,
            1
        )
    );
}


function getPeriodMonthKeys(
    period =
        activeSchedulingPeriod
) {

    if (
        !period
    ) {
        return [];
    }

    const keys = [];

    const cursor =
        getSunday(
            getDateFromKey(
                period.period_start
            )
        );

    const end =
        getDateFromKey(
            period.period_end
        );

    while (
        cursor <= end
    ) {

        const key =
            getAssignedMonthKeyForWeekDate(
                cursor
            );

        if (
            !keys.includes(
                key
            )
        ) {
            keys.push(
                key
            );
        }

        cursor.setDate(
            cursor.getDate() + 7
        );
    }

    return keys;
}


function getWeekendRowsForPeriod(
    period
) {

    if (!period) {
        return [];
    }

    if (
        adminSchedulingPeriod &&
        period.id ===
            adminSchedulingPeriod.id
    ) {
        return quarterWeekendScheduleRows;
    }

    if (
        activeSchedulingPeriod &&
        period.id ===
            activeSchedulingPeriod.id
    ) {
        return activeWeekendScheduleRows;
    }

    return [];
}


function getWeekendDateCountForUser(
    userId,
    monthKey,
    period =
        activeSchedulingPeriod
) {

    const profile =
        profiles.find(
            item =>
                item.id ===
                userId
        );

    if (
        !profile ||
        profile.clinic_site !==
            "Turfland"
    ) {
        return 0;
    }

    return getWeekendRowsForPeriod(
        period
    ).filter(
        row => {

            if (
                row.user_id !== userId ||
                row.schedule_code !== "12"
            ) {
                return false;
            }

            const date =
                getDateFromKey(
                    row.schedule_date
                );

            const day =
                date.getDay();

            if (
                day !== 0 &&
                day !== 6
            ) {
                return false;
            }

            return (
                getAssignedMonthKeyForWeekDate(
                    date
                ) === monthKey
            );
        }
    ).length;
}


function getWeekendTargetForUser(
    userId,
    period =
        activeSchedulingPeriod
) {

    if (!period) {
        return 3;
    }

    let access =
        null;

    if (
        adminSchedulingPeriod &&
        period.id ===
            adminSchedulingPeriod.id
    ) {
        access =
            adminSchedulingAccess[
                userId
            ];
    } else if (
        activeSchedulingPeriod &&
        period.id ===
            activeSchedulingPeriod.id
    ) {
        access =
            schedulingAccess[
                userId
            ];
    }

    if (
        access &&
        access.weekend_target_override !==
            null &&
        access.weekend_target_override !==
            undefined
    ) {
        return Number(
            access.weekend_target_override
        );
    }

    return Number(
        period.weekend_target ?? 3
    );
}


function getWeekendTarget() {

    return getWeekendTargetForUser(
        currentUser.id,
        activeSchedulingPeriod
    );
}


function getQuarterAccessStatusForUser(
    userId
) {

    if (
        !adminSchedulingPeriod
    ) {
        return null;
    }

    const access =
        adminSchedulingAccess[
            userId
        ];

    return Boolean(
        access &&
        access.is_open
    );
}


async function toggleQuarterAccess(
    userId
) {

    if (
        !currentProfile ||
        currentProfile.role !==
            "admin" ||
        !adminSchedulingPeriod
    ) {
        return;
    }

    const currentlyOpen =
        getQuarterAccessStatusForUser(
            userId
        );

    const nextOpen =
        !currentlyOpen;

    const profile =
        profiles.find(
            item =>
                item.id === userId
        );

    const confirmed =
        confirm(
            nextOpen
                ? `Open ${adminSchedulingPeriod.name} scheduling for ${getProfileName(profile)}?`
                : `Close ${adminSchedulingPeriod.name} scheduling for ${getProfileName(profile)}?`
        );

    if (!confirmed) {
        return;
    }

    const existing =
        adminSchedulingAccess[
            userId
        ];

    const now =
        new Date().toISOString();

    const {
        data,
        error
    } =
        await supabaseClient
            .from(
                "scheduling_period_access"
            )
            .upsert(
                {
                    period_id:
                        adminSchedulingPeriod.id,

                    user_id:
                        userId,

                    is_open:
                        nextOpen,

                    weekend_target_override:
                        existing &&
                        existing.weekend_target_override !==
                            undefined
                            ? existing.weekend_target_override
                            : null,

                    opened_at:
                        nextOpen
                            ? now
                            : null,

                    closed_at:
                        nextOpen
                            ? null
                            : now,

                    updated_at:
                        now
                },
                {
                    onConflict:
                        "period_id,user_id"
                }
            )
            .select()
            .single();

    if (error) {
        showError(
            "Scheduling access could not be changed: "
            +
            error.message
        );
        return;
    }

    adminSchedulingAccess[
        userId
    ] = data;

    if (
        activeSchedulingPeriod &&
        activeSchedulingPeriod.id ===
            adminSchedulingPeriod.id
    ) {
        schedulingAccess[
            userId
        ] = data;
    }

    renderPeopleList();
    renderSchedule();
}


function formatPeriodName(
    startDate,
    endDate
) {

    const formatter =
        new Intl.DateTimeFormat(
            "en-US",
            {
                month: "short",
                day: "numeric",
                year: "numeric"
            }
        );

    return (
        `${formatter.format(startDate)} - ${formatter.format(endDate)}`
    );
}


async function changeAdminQuarter() {

    const select =
        document.getElementById(
            "adminQuarterSelect"
        );

    if (!select) {
        return;
    }

    adminSchedulingPeriodId =
        select.value || null;

    adminSchedulingPeriod =
        allSchedulingPeriods.find(
            period =>
                period.id ===
                adminSchedulingPeriodId
        )
        || null;

    await loadWeek();

    renderAdminQuarterControls();
    renderPeopleList();
}


async function renderQuarterDashboard() {

    const container =
        document.getElementById(
            "quarterDashboardContent"
        );

    if (!container) {
        return;
    }

    if (
        !adminSchedulingPeriod
    ) {
        container.innerHTML =
            "Select or create a scheduling quarter to view the dashboard.";

        return;
    }

    container.style.padding =
        "0";

    container.innerHTML =
        `
        <div style="padding:16px;color:#64748b;">
            Loading quarter dashboard...
        </div>
        `;

    const [
        schedulesResult,
        capacityResult
    ] =
        await Promise.all([

            supabaseClient
                .from("schedules")
                .select(`
                    user_id,
                    schedule_date,
                    schedule_code,
                    work_site
                `)
                .gte(
                    "schedule_date",
                    adminSchedulingPeriod.period_start
                )
                .lte(
                    "schedule_date",
                    adminSchedulingPeriod.period_end
                ),

            supabaseClient
                .from("clinic_capacity")
                .select(`
                    clinic_site,
                    capacity_date,
                    shift_capacity
                `)
                .gte(
                    "capacity_date",
                    adminSchedulingPeriod.period_start
                )
                .lte(
                    "capacity_date",
                    adminSchedulingPeriod.period_end
                )
        ]);

    if (
        schedulesResult.error
    ) {
        container.innerHTML =
            `
            <div style="padding:16px;color:#991b1b;">
                Could not load quarter schedules:
                ${escapeHtml(
                    schedulesResult.error.message
                )}
            </div>
            `;
        return;
    }

    const quarterRows =
        schedulesResult.data || [];

    const capacityRows =
        capacityResult.error
            ? []
            : (
                capacityResult.data || []
            );

    const activeProfiles =
        profiles.filter(
            profile =>
                profile.active &&
                profile.role !== "admin"
        );

    const monthKeys =
        getPeriodMonthKeys(
            adminSchedulingPeriod
        );

    const weekStarts =
        getWeekStartDatesForPeriod(
            adminSchedulingPeriod
        );

    function rowsForUser(
        userId
    ) {
        return quarterRows.filter(
            row =>
                row.user_id ===
                userId
        );
    }

    function getWeekHours(
        userId,
        weekStart
    ) {

        const startKey =
            getDateKey(
                weekStart
            );

        const endDate =
            new Date(
                weekStart
            );

        endDate.setDate(
            endDate.getDate() + 6
        );

        const endKey =
            getDateKey(
                endDate
            );

        return rowsForUser(
            userId
        )
        .filter(
            row =>
                row.schedule_date >=
                    startKey &&
                row.schedule_date <=
                    endKey
        )
        .reduce(
            (sum, row) =>
                sum +
                (
                    codeHours[
                        row.schedule_code
                    ] || 0
                ),
            0
        );
    }

    function weekendCount(
        profile,
        monthKey
    ) {

        if (
            profile.clinic_site !==
                "Turfland"
        ) {
            return 0;
        }

        return rowsForUser(
            profile.id
        ).filter(
            row => {

                if (
                    row.schedule_code !==
                        "12"
                ) {
                    return false;
                }

                const date =
                    getDateFromKey(
                        row.schedule_date
                    );

                const day =
                    date.getDay();

                if (
                    day !== 0 &&
                    day !== 6
                ) {
                    return false;
                }

                return (
                    getAssignedMonthKeyForWeekDate(
                        date
                    ) === monthKey
                );
            }
        ).length;
    }

    function capacityFor(
        clinicSite,
        dateKey
    ) {

        const override =
            capacityRows.find(
                row =>
                    row.clinic_site ===
                        clinicSite &&
                    row.capacity_date ===
                        dateKey
            );

        if (
            override
        ) {
            return Number(
                override.shift_capacity
            );
        }

        return getDefaultClinicCapacity(
            clinicSite,
            getDateFromKey(
                dateKey
            )
        );
    }

    function scheduled12For(
        clinicSite,
        dateKey
    ) {

        return quarterRows.filter(
            row => {

                if (
                    row.schedule_date !==
                        dateKey ||
                    row.schedule_code !==
                        "12"
                ) {
                    return false;
                }

                const profile =
                    profiles.find(
                        item =>
                            item.id ===
                                row.user_id
                    );

                const actualSite =
                    row.work_site ||
                    (
                        profile
                            ? profile.clinic_site
                            : null
                    );

                return (
                    actualSite ===
                    clinicSite
                );
            }
        ).length;
    }

    const capacityAlerts =
        [];

    let cursor =
        getDateFromKey(
            adminSchedulingPeriod.period_start
        );

    const periodEnd =
        getDateFromKey(
            adminSchedulingPeriod.period_end
        );

    while (
        cursor <= periodEnd
    ) {

        const dateKey =
            getDateKey(
                cursor
            );

        [
            "Turfland",
            "Fountain Court"
        ].forEach(
            clinicSite => {

                const capacity =
                    capacityFor(
                        clinicSite,
                        dateKey
                    );

                const scheduled =
                    scheduled12For(
                        clinicSite,
                        dateKey
                    );

                if (
                    scheduled > capacity
                ) {
                    capacityAlerts.push({
                        date:
                            dateKey,
                        clinic:
                            clinicSite,
                        capacity,
                        scheduled
                    });
                }
            }
        );

        cursor =
            new Date(
                cursor
            );

        cursor.setDate(
            cursor.getDate() + 1
        );
    }

    const openCount =
        activeProfiles.filter(
            profile =>
                getQuarterAccessStatusForUser(
                    profile.id
                )
        ).length;

    let weeksOff40 =
        0;

    activeProfiles.forEach(
        profile => {
            weekStarts.forEach(
                weekStart => {
                    if (
                        getWeekHours(
                            profile.id,
                            weekStart
                        ) !== 40
                    ) {
                        weeksOff40++;
                    }
                }
            );
        }
    );

    let dashboardHtml =
        `
        <div class="quarter-dashboard-cards">
            <div class="quarter-dashboard-card">
                <div class="quarter-dashboard-card-label">
                    Active Employees
                </div>
                <div class="quarter-dashboard-card-value">
                    ${activeProfiles.length}
                </div>
            </div>

            <div class="quarter-dashboard-card">
                <div class="quarter-dashboard-card-label">
                    Open for Picks
                </div>
                <div class="quarter-dashboard-card-value">
                    ${openCount}
                </div>
            </div>

            <div class="quarter-dashboard-card">
                <div class="quarter-dashboard-card-label">
                    Weeks Not at 40 Hours
                </div>
                <div class="quarter-dashboard-card-value">
                    ${weeksOff40}
                </div>
            </div>

            <div class="quarter-dashboard-card">
                <div class="quarter-dashboard-card-label">
                    Over-Capacity Dates
                </div>
                <div class="quarter-dashboard-card-value">
                    ${capacityAlerts.length}
                </div>
            </div>
        </div>

        <div class="quarter-dashboard-table-wrap">
            <table class="quarter-dashboard-table">
                <thead>
                    <tr>
                        <th>Employee</th>
                        <th>Clinic</th>
                        <th>Pick Access</th>
                        <th>12h Shifts</th>
                        <th>40h Weeks</th>
        `;

    monthKeys.forEach(
        monthKey => {
            dashboardHtml +=
                `
                <th>
                    ${escapeHtml(
                        getWeekendMonthLabel(
                            monthKey
                        )
                    )}
                    Weekends
                </th>
                `;
        }
    );

    dashboardHtml +=
        `
                    </tr>
                </thead>
                <tbody>
        `;

    activeProfiles.forEach(
        profile => {

            const userRows =
                rowsForUser(
                    profile.id
                );

            const shifts12 =
                userRows.filter(
                    row =>
                        row.schedule_code ===
                            "12"
                ).length;

            const goodWeeks =
                weekStarts.filter(
                    weekStart =>
                        getWeekHours(
                            profile.id,
                            weekStart
                        ) === 40
                ).length;

            const accessOpen =
                getQuarterAccessStatusForUser(
                    profile.id
                );

            dashboardHtml +=
                `
                <tr>
                    <td>
                        ${escapeHtml(
                            getProfileName(
                                profile
                            )
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            profile.clinic_site ||
                            ""
                        )}
                    </td>

                    <td class="${
                        accessOpen
                            ? "dashboard-good"
                            : "dashboard-muted"
                    }">
                        ${
                            accessOpen
                                ? "Open"
                                : "Locked"
                        }
                    </td>

                    <td>
                        ${shifts12}
                    </td>

                    <td class="${
                        goodWeeks ===
                            weekStarts.length
                            ? "dashboard-good"
                            : goodWeeks === 0
                              ? "dashboard-bad"
                              : "dashboard-warn"
                    }">
                        ${goodWeeks}/${weekStarts.length}
                    </td>
                `;

            monthKeys.forEach(
                monthKey => {

                    if (
                        profile.clinic_site !==
                            "Turfland"
                    ) {
                        dashboardHtml +=
                            `
                            <td class="dashboard-muted">
                                —
                            </td>
                            `;
                        return;
                    }

                    const count =
                        weekendCount(
                            profile,
                            monthKey
                        );

                    const target =
                        getMonthlyWeekendTargetForUser(
                            profile.id,
                            monthKey,
                            adminSchedulingPeriod
                        );

                    dashboardHtml +=
                        `
                        <td class="${
                            count >= target
                                ? "dashboard-good"
                                : "dashboard-warn"
                        }">
                            ${count}/${target}
                        </td>
                        `;
                }
            );

            dashboardHtml +=
                `
                </tr>
                `;
        }
    );

    dashboardHtml +=
        `
                </tbody>
            </table>
        </div>
        `;

    if (
        capacityAlerts.length > 0
    ) {
        dashboardHtml +=
            `
            <div class="dashboard-alert-list">
                <strong>
                    Capacity alerts
                </strong>
                <ul>
            `;

        capacityAlerts.forEach(
            alert => {
                dashboardHtml +=
                    `
                    <li>
                        ${escapeHtml(alert.date)}
                        —
                        ${escapeHtml(alert.clinic)}:
                        ${alert.scheduled}
                        scheduled /
                        ${alert.capacity}
                        capacity
                    </li>
                    `;
            }
        );

        dashboardHtml +=
            `
                </ul>
            </div>
            `;
    }

    container.innerHTML =
        dashboardHtml;
}


function renderAdminQuarterControls() {

    const select =
        document.getElementById(
            "adminQuarterSelect"
        );

    const summary =
        document.getElementById(
            "adminQuarterSummary"
        );

    if (
        !select ||
        !summary
    ) {
        return;
    }

    select.innerHTML = "";

    allSchedulingPeriods.forEach(
        period => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                period.id;

            option.textContent =
                period.name;

            option.selected =
                adminSchedulingPeriod &&
                period.id ===
                    adminSchedulingPeriod.id;

            select.appendChild(
                option
            );
        }
    );

    if (
        adminSchedulingPeriod
    ) {
        summary.textContent =
            `${adminSchedulingPeriod.period_start} through ${adminSchedulingPeriod.period_end} · Default Turfland weekend requirement: ${adminSchedulingPeriod.weekend_target} dates per assigned month. Individual monthly overrides can be changed below.`;
    } else {
        summary.textContent =
            "No scheduling quarters have been created yet.";
    }
}


async function createCustomQuarter() {

    clearError();

    if (
        !currentProfile ||
        currentProfile.role !==
            "admin"
    ) {
        showError(
            "Administrator access is required to create a scheduling quarter."
        );
        return;
    }

    const nameInput =
        document.getElementById(
            "newQuarterName"
        );

    const startInput =
        document.getElementById(
            "newQuarterStart"
        );

    const endInput =
        document.getElementById(
            "newQuarterEnd"
        );

    const button =
        document.getElementById(
            "createQuarterButton"
        );

    const periodStart =
        startInput
            ? startInput.value
            : "";

    const periodEnd =
        endInput
            ? endInput.value
            : "";

    let name =
        nameInput
            ? nameInput.value.trim()
            : "";

    if (
        !periodStart ||
        !periodEnd
    ) {
        showError(
            "Choose both a start date and an end date."
        );
        return;
    }

    if (
        periodEnd <
        periodStart
    ) {
        showError(
            "The quarter end date cannot be before the start date."
        );
        return;
    }

    const duplicate =
        allSchedulingPeriods.find(
            period =>
                period.period_start ===
                    periodStart &&
                period.period_end ===
                    periodEnd
        );

    if (
        duplicate
    ) {
        showError(
            "A scheduling quarter with those exact dates already exists."
        );
        return;
    }

    /*
     * Do not allow overlapping active scheduling periods.
     * This keeps pick-access rules unambiguous.
     */
    const overlapping =
        allSchedulingPeriods.find(
            period =>
                period.active &&
                periodStart <=
                    period.period_end &&
                periodEnd >=
                    period.period_start
        );

    if (
        overlapping
    ) {
        showError(
            `Those dates overlap the existing quarter "${overlapping.name}". Delete or change that quarter first.`
        );
        return;
    }

    if (
        !name
    ) {
        name =
            formatPeriodName(
                getDateFromKey(
                    periodStart
                ),
                getDateFromKey(
                    periodEnd
                )
            );
    }

    const confirmed =
        confirm(
            `Create this scheduling quarter?\n\n${name}\n${periodStart} through ${periodEnd}\n\nAll employee pick access will begin locked.`
        );

    if (
        !confirmed
    ) {
        return;
    }

    if (
        button
    ) {
        button.disabled =
            true;

        button.textContent =
            "Creating...";
    }

    try {

        const {
            data: period,
            error
        } =
            await supabaseClient
                .from(
                    "scheduling_periods"
                )
                .insert(
                    {
                        name,
                        period_start:
                            periodStart,
                        period_end:
                            periodEnd,
                        weekend_target:
                            3,
                        active:
                            true,
                        updated_at:
                            new Date()
                                .toISOString()
                    }
                )
                .select()
                .single();

        if (
            error
        ) {
            throw new Error(
                error.message
            );
        }

        const accessRows =
            profiles
                .filter(
                    profile =>
                        profile.active &&
                        profile.role !==
                            "admin"
                )
                .map(
                    profile => ({
                        period_id:
                            period.id,
                        user_id:
                            profile.id,
                        is_open:
                            false,
                        weekend_target_override:
                            null
                    })
                );

        if (
            accessRows.length > 0
        ) {

            const {
                error: accessError
            } =
                await supabaseClient
                    .from(
                        "scheduling_period_access"
                    )
                    .upsert(
                        accessRows,
                        {
                            onConflict:
                                "period_id,user_id"
                        }
                    );

            if (
                accessError
            ) {
                console.warn(
                    "Quarter created, but employee access rows could not be created:",
                    accessError
                );

                showError(
                    "The quarter was created, but employee pick-access rows could not be created: "
                    +
                    accessError.message
                );
            }
        }

        adminSchedulingPeriodId =
            period.id;

        adminSchedulingPeriod =
            period;

        if (
            nameInput
        ) {
            nameInput.value =
                "";
        }

        if (
            startInput
        ) {
            startInput.value =
                "";
        }

        if (
            endInput
        ) {
            endInput.value =
                "";
        }

        await loadWeek();

        renderAdminQuarterControls();
        renderQuarterDashboard();
        renderPeopleList();

        alert(
            `Scheduling quarter created:\n${name}`
        );

    } catch (
        error
    ) {

        console.error(
            "Create quarter error:",
            error
        );

        showError(
            "Unable to create the scheduling quarter: "
            +
            (
                error.message ||
                "Unknown error"
            )
        );

    } finally {

        if (
            button
        ) {
            button.disabled =
                false;

            button.textContent =
                "Create Quarter";
        }
    }
}


async function deleteSelectedQuarter() {

    clearError();

    if (
        !currentProfile ||
        currentProfile.role !==
            "admin"
    ) {
        showError(
            "Administrator access is required to delete a scheduling quarter."
        );
        return;
    }

    if (
        !adminSchedulingPeriod
    ) {
        showError(
            "Select a scheduling quarter to delete."
        );
        return;
    }

    const period =
        adminSchedulingPeriod;

    const confirmationText =
        `DELETE ${period.name}`;

    const firstConfirm =
        confirm(
            `Delete "${period.name}"?\n\nThis will permanently clear ALL scheduling data for ${period.period_start} through ${period.period_end}, including:\n\n• employee schedules\n• comments\n• weekly submissions\n• weekly locks\n• clinic capacity overrides\n• pick-access settings\n• monthly weekend requirements\n\nThis cannot be undone.`
        );

    if (
        !firstConfirm
    ) {
        return;
    }

    const typed =
        prompt(
            `Type exactly:\n${confirmationText}`
        );

    if (
        typed !==
        confirmationText
    ) {
        showError(
            "Quarter deletion cancelled because the confirmation text did not match."
        );
        return;
    }

    const button =
        document.getElementById(
            "deleteQuarterButton"
        );

    if (
        button
    ) {
        button.disabled =
            true;

        button.textContent =
            "Deleting...";
    }

    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .rpc(
                    "delete_scheduling_period_and_data",
                    {
                        p_period_id:
                            period.id
                    }
                );

        if (
            error
        ) {
            throw new Error(
                error.message
            );
        }

        adminSchedulingPeriodId =
            null;

        adminSchedulingPeriod =
            null;

        viewSchedulingPeriodId =
            null;

        viewMonthKey =
            null;

        await loadWeek();

        renderAdminQuarterControls();
        renderQuarterDashboard();
        renderPeopleList();
        renderQuarterNavigator();

        alert(
            `Deleted "${period.name}" and cleared its scheduling data.`
        );

    } catch (
        error
    ) {

        console.error(
            "Delete quarter error:",
            error
        );

        showError(
            "Unable to delete the scheduling quarter: "
            +
            (
                error.message ||
                "Unknown error"
            )
        );

    } finally {

        if (
            button
        ) {
            button.disabled =
                false;

            button.textContent =
                "Delete Selected Quarter";
        }
    }
}




async function setWeekendTargetForUser(
    userId,
    target
) {

    if (
        !adminSchedulingPeriod ||
        !currentProfile ||
        currentProfile.role !==
            "admin"
    ) {
        return;
    }

    const numericTarget =
        Number(
            target
        );

    if (
        !Number.isInteger(
            numericTarget
        ) ||
        numericTarget < 0 ||
        numericTarget > 10
    ) {
        showError(
            "Weekend requirement must be between 0 and 10."
        );
        return;
    }

    const existing =
        adminSchedulingAccess[
            userId
        ];

    const {
        data,
        error
    } =
        await supabaseClient
            .from(
                "scheduling_period_access"
            )
            .upsert(
                {
                    period_id:
                        adminSchedulingPeriod.id,

                    user_id:
                        userId,

                    is_open:
                        existing
                            ? existing.is_open
                            : false,

                    weekend_target_override:
                        numericTarget,

                    opened_at:
                        existing
                            ? existing.opened_at
                            : null,

                    closed_at:
                        existing
                            ? existing.closed_at
                            : null,

                    updated_at:
                        new Date()
                            .toISOString()
                },
                {
                    onConflict:
                        "period_id,user_id"
                }
            )
            .select()
            .single();

    if (error) {
        showError(
            "Weekend requirement could not be saved: "
            +
            error.message
        );
        return;
    }

    adminSchedulingAccess[
        userId
    ] = data;

    if (
        activeSchedulingPeriod &&
        activeSchedulingPeriod.id ===
            adminSchedulingPeriod.id
    ) {
        schedulingAccess[
            userId
        ] = data;
    }

    renderPeopleList();
    renderWorkflowPanel();
}


async function setMonthlyWeekendTargetForUser(
    userId,
    monthKey,
    target
) {

    if (
        !adminSchedulingPeriod ||
        !currentProfile ||
        currentProfile.role !==
            "admin"
    ) {
        return;
    }

    const numericTarget =
        Number(
            target
        );

    if (
        !Number.isInteger(
            numericTarget
        ) ||
        numericTarget < 0 ||
        numericTarget > 10
    ) {
        showError(
            "Weekend requirement must be between 0 and 10."
        );

        return;
    }

    const {
        data,
        error
    } =
        await supabaseClient
            .from(
                "scheduling_month_weekend_targets"
            )
            .upsert(
                {
                    period_id:
                        adminSchedulingPeriod.id,

                    user_id:
                        userId,

                    month_key:
                        monthKey,

                    target:
                        numericTarget,

                    updated_at:
                        new Date()
                            .toISOString()
                },
                {
                    onConflict:
                        "period_id,user_id,month_key"
                }
            )
            .select()
            .single();

    if (
        error
    ) {
        showError(
            "Monthly weekend requirement could not be saved: "
            +
            error.message
        );

        return;
    }

    monthlyWeekendTargets[
        `${adminSchedulingPeriod.id}_${userId}_${monthKey}`
    ] =
        data;

    renderPeopleList();
    renderSchedule();
}


function renderWorkflowPanel() {

    const panel =
        document.getElementById(
            "workflowPanel"
        );

    if (
        !panel ||
        !currentProfile ||
        !currentUser
    ) {
        return;
    }

    const ownHours =
        calculateWeeklyHours(
            currentUser.id
        ).total;

    const ownSubmission =
        weeklySubmissions[
            currentUser.id
        ];

    const statusLabel =
        getSubmissionStatusLabel(
            ownSubmission
        );

    let statusClass =
        "status-draft";

    if (
        ownSubmission &&
        ownSubmission.status ===
        "submitted"
    ) {
        statusClass =
            "status-submitted";
    } else if (
        ownSubmission &&
        ownSubmission.status ===
        "needs_resubmission"
    ) {
        statusClass =
            "status-resubmit";
    }

    const activeProfiles =
        profiles.filter(
            profile =>
                profile.active
        );

    const submittedCount =
        activeProfiles.filter(
            profile =>
                weeklySubmissions[
                    profile.id
                ] &&
                weeklySubmissions[
                    profile.id
                ].status ===
                    "submitted"
        ).length;

    const ownQuarterAccess =
        activeSchedulingPeriod
            ? schedulingAccess[
                currentUser.id
              ]
            : null;

    const ownQuarterOpen =
        Boolean(
            ownQuarterAccess &&
            ownQuarterAccess.is_open
        );

    const weekendMonthKeys =
        getPeriodMonthKeys();

    const ownWeekendSummary =
        currentProfile.clinic_site ===
            "Turfland" &&
        activeSchedulingPeriod
            ? weekendMonthKeys
                .map(
                    monthKey => {
                        const count =
                            getWeekendDateCountForUser(
                                currentUser.id,
                                monthKey
                            );

                        const target =
                            getMonthlyWeekendTargetForUser(
                                currentUser.id,
                                monthKey,
                                activeSchedulingPeriod
                            );

                        return `${getWeekendMonthLabel(monthKey)} ${count}/${target}`;
                    }
                )
                .join(" · ")
            : "";

    panel.innerHTML =
        `
        <div class="workflow-left">
            <strong>
                ${ownHours} / 40 hours
            </strong>

            <span class="workflow-status ${statusClass}">
                ${escapeHtml(statusLabel)}
            </span>

            ${
                currentWeekLocked
                    ? `
                        <span class="workflow-status status-locked">
                            Week Locked
                        </span>
                      `
                    : ""
            }

            ${
                isCurrentWeekInActiveSchedulingPeriod() &&
                currentProfile.role !== "admin"
                    ? `
                        <span class="workflow-status ${
                            ownQuarterOpen
                                ? "status-submitted"
                                : "status-locked"
                        }">
                            ${
                                ownQuarterOpen
                                    ? "Quarter Access Open"
                                    : "Quarter Access Locked"
                            }
                        </span>
                      `
                    : ""
            }

            ${
                ownWeekendSummary
                    ? `
                        <span class="workflow-summary">
                            Weekend dates: ${escapeHtml(ownWeekendSummary)}
                        </span>
                      `
                    : ""
            }

            ${
                currentProfile.role === "admin"
                    ? `
                        <span class="workflow-summary">
                            ${submittedCount} of ${activeProfiles.length}
                            active employees submitted
                        </span>
                      `
                    : ""
            }
        </div>

        <div class="workflow-actions">
            <button
                id="submitWeekButton"
                class="workflow-button primary"
                type="button"
                ${
                    currentWeekLocked ||
                    (
                        isCurrentWeekInActiveSchedulingPeriod() &&
                        currentProfile.role !== "admin" &&
                        !ownQuarterOpen
                    ) ||
                    ownHours !== 40 ||
                    (
                        ownSubmission &&
                        ownSubmission.status ===
                            "submitted"
                    )
                        ? "disabled"
                        : ""
                }
            >
                ${
                    ownSubmission &&
                    ownSubmission.status ===
                        "needs_resubmission"
                        ? "Resubmit Week"
                        : "Submit Week"
                }
            </button>

            ${
                currentProfile.role === "admin"
                    ? `
                        <button
                            id="toggleWeekLockButton"
                            class="workflow-button ${
                                currentWeekLocked
                                    ? "unlock"
                                    : "lock"
                            }"
                            type="button"
                        >
                            ${
                                currentWeekLocked
                                    ? "Unlock Week"
                                    : "Lock Week"
                            }
                        </button>
                      `
                    : ""
            }
        </div>
        `;

    const submitButton =
        document.getElementById(
            "submitWeekButton"
        );

    if (
        submitButton
    ) {
        submitButton.addEventListener(
            "click",
            submitWeek
        );
    }

    const lockButton =
        document.getElementById(
            "toggleWeekLockButton"
        );

    if (
        lockButton
    ) {
        lockButton.addEventListener(
            "click",
            toggleWeekLock
        );
    }
}


async function submitWeek() {

    clearError();

    if (
        currentWeekLocked
    ) {
        showError(
            "This week is locked and cannot be submitted."
        );

        return;
    }

    if (
        isCurrentWeekInActiveSchedulingPeriod() &&
        currentProfile.role !== "admin" &&
        !getQuarterAccessStatusForUser(
            currentUser.id
        )
    ) {
        showError(
            "Your scheduling access for this quarter is currently locked."
        );

        return;
    }

    const total =
        calculateWeeklyHours(
            currentUser.id
        ).total;

    if (
        total !== 40
    ) {
        showError(
            `Your weekly total must be exactly 40 hours before submitting. Current total: ${total}.`
        );

        return;
    }

    const weekStart =
        getCurrentWeekStartKey();

    const now =
        new Date()
            .toISOString();

    const {
        data,
        error
    } =
        await supabaseClient
            .from(
                "week_submissions"
            )
            .upsert(
                {
                    user_id:
                        currentUser.id,

                    week_start:
                        weekStart,

                    status:
                        "submitted",

                    submitted_at:
                        now,

                    updated_at:
                        now
                },
                {
                    onConflict:
                        "user_id,week_start"
                }
            )
            .select()
            .single();

    if (
        error
    ) {

        console.error(
            error
        );

        showError(
            "Your week could not be submitted: "
            +
            error.message
        );

        return;
    }

    weeklySubmissions[
        currentUser.id
    ] =
        data;

    renderSchedule();
}


async function markCurrentUserNeedsResubmission() {

    const submission =
        weeklySubmissions[
            currentUser.id
        ];

    if (
        !submission ||
        submission.status !==
            "submitted"
    ) {
        return;
    }

    if (
        currentWeekLocked
    ) {
        return;
    }

    const {
        data,
        error
    } =
        await supabaseClient
            .from(
                "week_submissions"
            )
            .update(
                {
                    status:
                        "needs_resubmission",

                    submitted_at:
                        null,

                    updated_at:
                        new Date()
                            .toISOString()
                }
            )
            .eq(
                "id",
                submission.id
            )
            .select()
            .single();

    if (
        error
    ) {

        console.error(
            "Unable to mark week for resubmission:",
            error
        );

        return;
    }

    weeklySubmissions[
        currentUser.id
    ] =
        data;
}


async function toggleWeekLock() {

    if (
        !currentProfile ||
        currentProfile.role !==
            "admin"
    ) {
        return;
    }

    const nextLocked =
        !currentWeekLocked;

    const confirmed =
        confirm(
            nextLocked
                ? "Lock this Sunday–Saturday week? Employees will no longer be able to edit schedules, work sites, or comments."
                : "Unlock this week and allow employees to edit again?"
        );

    if (
        !confirmed
    ) {
        return;
    }

    clearError();

    const weekStart =
        getCurrentWeekStartKey();

    const now =
        new Date()
            .toISOString();

    const {
        data,
        error
    } =
        await supabaseClient
            .from(
                "weekly_locks"
            )
            .upsert(
                {
                    week_start:
                        weekStart,

                    locked:
                        nextLocked,

                    locked_at:
                        nextLocked
                            ? now
                            : null,

                    locked_by:
                        nextLocked
                            ? currentUser.id
                            : null,

                    updated_at:
                        now
                },
                {
                    onConflict:
                        "week_start"
                }
            )
            .select()
            .single();

    if (
        error
    ) {

        console.error(
            error
        );

        showError(
            "Week lock status could not be changed: "
            +
            error.message
        );

        return;
    }

    currentWeekLockData =
        data;

    currentWeekLocked =
        Boolean(
            data.locked
        );

    renderSchedule();
}


/* =========================================================
   WEEK NAVIGATION
========================================================= */

async function previousWeek() {

    const newDate =
        new Date(
            currentWeekStart
        );

    newDate.setDate(
        newDate.getDate()
        -
        7
    );

    currentWeekStart =
        getSunday(
            newDate
        );

    await loadWeek();
}


async function nextWeek() {

    const newDate =
        new Date(
            currentWeekStart
        );

    newDate.setDate(
        newDate.getDate()
        +
        7
    );

    currentWeekStart =
        getSunday(
            newDate
        );

    await loadWeek();
}


async function goToCurrentWeek() {

    currentWeekStart =
        getSunday(
            new Date()
        );

    await loadWeek();
}


/* =========================================================
   ERRORS
========================================================= */

function showError(message) {

    const banner =
        document.getElementById(
            "errorBanner"
        );

    banner.textContent =
        message;

    banner.style.display =
        "block";
}


function clearError() {

    const banner =
        document.getElementById(
            "errorBanner"
        );

    banner.textContent = "";
    banner.style.display =
        "none";
}
