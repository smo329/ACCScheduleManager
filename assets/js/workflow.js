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


let quarterAccessPickerUserId = null;
let quarterAccessPickerPeriodId = null;
let quarterAccessPickerCurrentOpen = false;
let quarterAccessPickerHasRow = false;
let quarterAccessPickerExistingOverride = null;


function ensureQuarterAccessPicker() {

    let overlay =
        document.getElementById(
            "quarterAccessPickerOverlay"
        );

    if (overlay) {
        return overlay;
    }

    overlay =
        document.createElement(
            "div"
        );

    overlay.id =
        "quarterAccessPickerOverlay";

    overlay.className =
        "modal-overlay";

    overlay.innerHTML =
        `
        <div class="modal">
            <div class="modal-header">
                <div class="modal-title" id="quarterAccessPickerTitle">
                    Change scheduling picks
                </div>
                <button class="modal-close" type="button" onclick="closeQuarterAccessPicker()">\u00d7</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="quarterAccessPickerSelect">Scheduling quarter</label>
                    <select id="quarterAccessPickerSelect"></select>
                </div>
                <div id="quarterAccessPickerState" style="color:#475569;font-size:13px;"></div>
            </div>
            <div class="modal-footer">
                <button class="modal-button cancel-button" type="button" onclick="closeQuarterAccessPicker()">Cancel</button>
                <button class="modal-button save-button" type="button" id="quarterAccessPickerAction" onclick="applyQuarterAccess()"></button>
            </div>
        </div>
        `;

    document.body.appendChild(
        overlay
    );

    document
        .getElementById(
            "quarterAccessPickerSelect"
        )
        .addEventListener(
            "change",
            refreshQuarterAccessPickerState
        );

    return overlay;
}


function closeQuarterAccessPicker() {

    const overlay =
        document.getElementById(
            "quarterAccessPickerOverlay"
        );

    if (overlay) {
        overlay.classList.remove(
            "show"
        );
    }

    quarterAccessPickerUserId = null;
    quarterAccessPickerPeriodId = null;
}


async function refreshQuarterAccessPickerState() {

    const select =
        document.getElementById(
            "quarterAccessPickerSelect"
        );

    const state =
        document.getElementById(
            "quarterAccessPickerState"
        );

    const action =
        document.getElementById(
            "quarterAccessPickerAction"
        );

    if (!select || !state || !action) {
        return;
    }

    quarterAccessPickerPeriodId =
        select.value || null;

    const period =
        allSchedulingPeriods.find(
            item =>
                item.id ===
                quarterAccessPickerPeriodId
        );

    const profile =
        profiles.find(
            item =>
                item.id ===
                quarterAccessPickerUserId
        );

    if (!period || !profile) {
        state.textContent =
            "Select a scheduling quarter.";
        action.textContent = "";
        action.disabled = true;
        return;
    }

    action.disabled = false;

    const {
        data,
        error
    } =
        await supabaseClient
            .from(
                "scheduling_period_access"
            )
            .select(
                "is_open, weekend_target_override"
            )
            .eq(
                "period_id",
                period.id
            )
            .eq(
                "user_id",
                profile.id
            )
            .maybeSingle();

    if (error) {
        state.textContent =
            `Could not load the current picks state for ${period.name}.`;
        action.textContent = "";
        action.disabled = true;
        return;
    }

    quarterAccessPickerHasRow =
        Boolean(data);

    quarterAccessPickerCurrentOpen =
        Boolean(
            data &&
            data.is_open
        );

    quarterAccessPickerExistingOverride =
        data
            ? data.weekend_target_override
            : null;

    state.textContent =
        quarterAccessPickerHasRow
            ? `Picks for ${getProfileName(profile)} are currently ${quarterAccessPickerCurrentOpen ? "open" : "closed"} for ${period.name}.`
            : `No picks row exists yet for ${getProfileName(profile)} in ${period.name}. This action will create one.`;

    action.textContent =
        quarterAccessPickerCurrentOpen
            ? `Close picks for ${period.name}`
            : `Open picks for ${period.name}`;
}


async function toggleQuarterAccess(
    userId
) {

    if (
        !currentProfile ||
        currentProfile.role !==
            "admin"
    ) {
        return;
    }

    if (window.viewAsActive) {
        return;
    }

    const overlay =
        ensureQuarterAccessPicker();

    quarterAccessPickerUserId =
        userId;

    const profile =
        profiles.find(
            item =>
                item.id === userId
        );

    document
        .getElementById(
            "quarterAccessPickerTitle"
        )
        .textContent =
            `Change scheduling picks for ${getProfileName(profile)}`;

    const select =
        document.getElementById(
            "quarterAccessPickerSelect"
        );

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

            if (
                adminSchedulingPeriod &&
                period.id ===
                    adminSchedulingPeriod.id
            ) {
                option.selected = true;
            }

            select.appendChild(
                option
            );
        }
    );

    overlay.classList.add(
        "show"
    );

    await refreshQuarterAccessPickerState();
}


async function applyQuarterAccess() {

    if (
        !currentProfile ||
        currentProfile.role !==
            "admin" ||
        !quarterAccessPickerUserId ||
        !quarterAccessPickerPeriodId
    ) {
        return;
    }

    if (window.viewAsActive) {
        closeQuarterAccessPicker();
        return;
    }

    if (
        currentUser &&
        currentProfile.id !==
            currentUser.id
    ) {
        closeQuarterAccessPicker();

        showError(
            "Your session does not match the account shown. Please sign out and sign back in, then try again."
        );

        return;
    }

    const nextOpen =
        !quarterAccessPickerCurrentOpen;

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
                        quarterAccessPickerPeriodId,

                    user_id:
                        quarterAccessPickerUserId,

                    is_open:
                        nextOpen,

                    weekend_target_override:
                        quarterAccessPickerHasRow
                            ? quarterAccessPickerExistingOverride
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

    if (
        adminSchedulingPeriod &&
        adminSchedulingPeriod.id ===
            quarterAccessPickerPeriodId
    ) {
        adminSchedulingAccess[
            quarterAccessPickerUserId
        ] = data;
    }

    if (
        activeSchedulingPeriod &&
        activeSchedulingPeriod.id ===
            quarterAccessPickerPeriodId
    ) {
        schedulingAccess[
            quarterAccessPickerUserId
        ] = data;
    }

    closeQuarterAccessPicker();

    renderPeopleList();
    renderSchedule();
}


async function ensureAccessRowsForPeriod(
    periodId
) {

    if (
        !currentProfile ||
        currentProfile.role !==
            "admin" ||
        !periodId ||
        window.viewAsActive
    ) {
        return false;
    }

    if (
        currentUser &&
        currentProfile.id !==
            currentUser.id
    ) {
        return false;
    }

    const {
        data: existingRows,
        error: existingError
    } =
        await supabaseClient
            .from(
                "scheduling_period_access"
            )
            .select(
                "user_id"
            )
            .eq(
                "period_id",
                periodId
            );

    if (existingError) {
        console.warn(
            "Could not check scheduling access rows for backfill:",
            existingError
        );
        return false;
    }

    const existingIds =
        new Set(
            (existingRows || []).map(
                row => row.user_id
            )
        );

    const missing =
        profiles.filter(
            profile =>
                profile.active &&
                profile.role !==
                    "admin" &&
                !existingIds.has(
                    profile.id
                )
        );

    if (missing.length === 0) {
        return true;
    }

    const {
        data: inserted,
        error: insertError
    } =
        await supabaseClient
            .from(
                "scheduling_period_access"
            )
            .insert(
                missing.map(
                    profile => ({
                        period_id:
                            periodId,
                        user_id:
                            profile.id,
                        is_open:
                            false,
                        weekend_target_override:
                            null
                    })
                )
            )
            .select();

    if (insertError) {
        console.warn(
            "Could not backfill missing scheduling access rows:",
            insertError
        );
        return false;
    }

    if (
        adminSchedulingPeriod &&
        adminSchedulingPeriod.id ===
            periodId
    ) {
        (inserted || []).forEach(
            row => {
                adminSchedulingAccess[
                    row.user_id
                ] = row;
            }
        );
    }

    return true;
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


// Set when the admin changes the scheduling quarter while the Quarter
// Dashboard modal is open. closeAdmin() consumes it with a single
// loadWeek() so the main grid refreshes once the modal is gone, instead
// of flashing behind the modal's blurred backdrop.
let adminQuarterChangedWhileOpen = false;


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

    if (
        adminSchedulingPeriod
    ) {
        await ensureAccessRowsForPeriod(
            adminSchedulingPeriod.id
        );
    }

    const adminModal =
        document.getElementById(
            "adminModal"
        );

    if (
        adminModal &&
        adminModal.classList.contains(
            "show"
        )
    ) {
        // The modal covers the main schedule with a blurred backdrop:
        // rebuilding the grid now would only flash behind it. Defer the
        // refresh until the modal closes.
        adminQuarterChangedWhileOpen = true;
    } else {
        await loadWeek();
    }

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
        capacityResult,
        adminResult,
        leaveResult
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
                ),

            supabaseClient
                .from("schedule_admin_hours")
                .select(`
                    user_id,
                    admin_date,
                    admin_hours
                `)
                .gte(
                    "admin_date",
                    adminSchedulingPeriod.period_start
                )
                .lte(
                    "admin_date",
                    adminSchedulingPeriod.period_end
                ),

            supabaseClient
                .from("schedule_leave_hours")
                .select(`
                    user_id,
                    leave_date,
                    vacation_hours,
                    professional_leave_hours,
                    tdl_hours
                `)
                .gte(
                    "leave_date",
                    adminSchedulingPeriod.period_start
                )
                .lte(
                    "leave_date",
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

    /* Admin pieces and leave hours per user+date, so the
       40-hour counter credits the same hours the submit
       gate does. A failed extra query degrades to the old
       worked-hours-only count, like the capacity fallback. */
    const adminHoursByUserDate =
        new Map();

    (
        adminResult.error
            ? []
            : (adminResult.data || [])
    ).forEach(
        row =>
            adminHoursByUserDate.set(
                row.user_id +
                    "|" +
                    row.admin_date,
                Number(
                    row.admin_hours || 0
                )
            )
    );

    const leaveHoursByUserDate =
        new Map();

    (
        leaveResult.error
            ? []
            : (leaveResult.data || [])
    ).forEach(
        row =>
            leaveHoursByUserDate.set(
                row.user_id +
                    "|" +
                    row.leave_date,
                Number(
                    row.vacation_hours || 0
                ) +
                Number(
                    row.professional_leave_hours || 0
                ) +
                Number(
                    row.tdl_hours || 0
                )
            )
    );

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

        /* Same credited total the submit gate uses: worked
           hours plus the Admin piece plus leave hours, with
           each day capped at 12. */
        let total = 0;

        for (
            let i = 0;
            i < 7;
            i++
        ) {

            const date =
                new Date(
                    weekStart
                );

            date.setDate(
                date.getDate() + i
            );

            const dateKey =
                getDateKey(
                    date
                );

            const row =
                rowsForUser(
                    userId
                ).find(
                    item =>
                        item.schedule_date ===
                            dateKey
                );

            total +=
                quarterDayCreditedHours(
                    row
                        ? row.schedule_code
                        : "0",
                    adminHoursByUserDate.get(
                        userId +
                            "|" +
                            dateKey
                    ) || 0,
                    leaveHoursByUserDate.get(
                        userId +
                            "|" +
                            dateKey
                    ) || 0
                );
        }

        return total;
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

    // Who currently holds quarter access, for the Locked badge below.
    // schedulingAccess already holds every user's row for the active
    // period, so this needs no extra query. Empty when the viewer themself
    // holds it (the badge then says Open) or when nobody at the viewer's
    // clinic holds it (the badge then says no one has access open).
    const currentQuarterHolderName = (() => {
        if (!activeSchedulingPeriod || ownQuarterOpen) return "";
        try {
            // Clinics pick independently, so name the holder at the
            // viewer's own clinic, not the first open person in the
            // whole quarter (which could be another clinic's holder).
            const viewerClinic =
                currentProfile &&
                currentProfile.clinic_site;
            const openRow = Object.values(schedulingAccess || {}).find(
                row => {
                    if (!row || !row.is_open) return false;
                    if (!viewerClinic) return true;
                    const holder = (profiles || []).find(
                        profile => profile.id === row.user_id
                    );
                    return Boolean(
                        holder &&
                        holder.clinic_site === viewerClinic
                    );
                }
            );
            if (!openRow) return "";
            const holder = (profiles || []).find(
                profile => profile.id === openRow.user_id
            );
            if (!holder) return "";
            try { return getProfileName(holder); } catch (_) {
                return [holder.first_name, holder.last_name]
                    .filter(Boolean).join(" ");
            }
        } catch (_) { return ""; }
    })();

    const weekendMonthKeys =
        getPeriodMonthKeys();

    const ownWeekendSummary =
        currentProfile.role !== "admin" &&
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
                                    : currentQuarterHolderName
                                        ? "Quarter Access Locked — currently open for " + escapeHtml(currentQuarterHolderName)
                                        : "Quarter Access Locked — no one currently has access open"
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
                id="submitQuarterButton"
                class="workflow-button primary"
                type="button"
                ${
                    currentProfile.role === "admin" ||
                    !activeSchedulingPeriod ||
                    (
                        isCurrentWeekInActiveSchedulingPeriod() &&
                        !ownQuarterOpen
                    )
                        ? "disabled"
                        : ""
                }
            >
                ${
                    ownSubmission &&
                    ownSubmission.status ===
                        "needs_resubmission"
                        ? "Resubmit Quarter"
                        : "Submit Quarter"
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
            "submitQuarterButton"
        );

    if (
        submitButton
    ) {
        submitButton.addEventListener(
            "click",
            submitQuarter
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


function getQuarterWeekStarts(period) {

    const starts = [];

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

        starts.push(
            getDateKey(cursor)
        );

        cursor.setDate(
            cursor.getDate() + 7
        );
    }

    return starts;
}


function quarterDayCreditedHours(
    code,
    adminHours,
    leaveHours
) {

    let worked = 0;

    if (
        codeHours[code] !==
            undefined
    ) {

        worked =
            codeHours[code];
    } else if (
        Number.isFinite(
            Number(code)
        )
    ) {

        worked =
            Number(code);
    }

    /* A day never credits more than 12 hours, matching the
       cap the week totals already use. */
    return Math.min(
        12,
        worked +
            Number(adminHours || 0) +
            Number(leaveHours || 0)
    );
}


function formatQuarterWeek(
    weekStartKey
) {

    return "Week of " +
        new Intl.DateTimeFormat(
            "en-US",
            {
                month: "short",
                day: "numeric"
            }
        ).format(
            getDateFromKey(
                weekStartKey
            )
        );
}


function formatQuarterDate(
    dateKey
) {

    return new Intl.DateTimeFormat(
        "en-US",
        {
            weekday: "short",
            month: "short",
            day: "numeric"
        }
    ).format(
        getDateFromKey(
            dateKey
        )
    );
}


function quarterWeekStartForDate(
    dateKey
) {

    return getDateKey(
        getSunday(
            getDateFromKey(
                dateKey
            )
        )
    );
}


function firstQuarterWeekForMonth(
    monthKey,
    weekStarts
) {

    for (
        const weekStart
        of weekStarts
    ) {

        for (
            let i = 0;
            i < 7;
            i++
        ) {

            const date =
                getDateFromKey(
                    weekStart
                );

            date.setDate(
                date.getDate() + i
            );

            const day =
                date.getDay();

            if (
                day !== 0 &&
                day !== 6
            ) {

                continue;
            }

            if (
                getAssignedMonthKeyForWeekDate(
                    date
                ) === monthKey
            ) {

                return weekStart;
            }
        }
    }

    return null;
}


function closeQuarterModal() {

    const existing =
        document.getElementById(
            "quarterSubmitModal"
        );

    if (
        existing
    ) {

        existing.remove();
    }
}


function openQuarterModal(
    title,
    bodyHtml,
    footerHtml
) {

    closeQuarterModal();

    const overlay =
        document.createElement(
            "div"
        );

    overlay.id =
        "quarterSubmitModal";

    overlay.className =
        "modal-overlay show";

    overlay.innerHTML =
        `
        <div class="modal modal-wide">
            <div class="modal-header">
                <div class="modal-title">
                    ${escapeHtml(title)}
                </div>
                <button
                    class="modal-close"
                    type="button"
                    data-quarter-close
                >×</button>
            </div>
            <div class="modal-body modal-scroll">
                ${bodyHtml}
            </div>
            <div class="modal-footer">
                ${footerHtml}
            </div>
        </div>`;

    overlay
        .querySelectorAll(
            "[data-quarter-close]"
        )
        .forEach(
            button =>
                button.addEventListener(
                    "click",
                    closeQuarterModal
                )
        );

    overlay
        .querySelectorAll(
            "[data-go-week]"
        )
        .forEach(
            button =>
                button.addEventListener(
                    "click",
                    async () => {

                        const weekStart =
                            button.dataset.goWeek;

                        closeQuarterModal();

                        currentWeekStart =
                            getSunday(
                                getDateFromKey(
                                    weekStart
                                )
                            );

                        syncQuarterSelectionToCurrentWeek();

                        await loadWeek();
                    }
                )
        );

    document.body.appendChild(
        overlay
    );

    return overlay;
}


async function doQuarterSubmit(
    period,
    weekStarts,
    ownAccess,
    nextPicker,
    nextAccess
) {

    const now =
        new Date()
            .toISOString();

    const {
        error: submitError
    } =
        await supabaseClient
            .from(
                "week_submissions"
            )
            .upsert(
                weekStarts.map(
                    weekStart => (
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
                        }
                    )
                ),
                {
                    onConflict:
                        "user_id,week_start"
                }
            );

    if (
        submitError
    ) {

        throw new Error(
            "Your weeks could not be submitted: " +
                submitError.message
        );
    }

    /*
     * Close + advance through the database function: employees
     * have no direct write permission on scheduling_period_access,
     * so the direct upserts below always failed RLS at submit.
     * The function verifies the caller, closes their row, and
     * opens the next waiting picker in their clinic (same queue
     * order the app computes above), preserving overrides. It
     * returns the next picker's id, or null when nobody waits.
     */
    const {
        error: advanceError
    } =
        await supabaseClient
            .rpc(
                "submit_quarter_close_and_advance",
                {
                    p_period_id:
                        period.id
                }
            );

    if (
        advanceError
    ) {

        throw new Error(
            "Your weeks were submitted, but your access " +
                "could not be closed: " +
                advanceError.message +
                " Your access is still open, so you can " +
                "try submitting again."
        );
    }

    if (
        schedulingAccess[
            currentUser.id
        ]
    ) {

        schedulingAccess[
            currentUser.id
        ].is_open = false;

        schedulingAccess[
            currentUser.id
        ].opened_at = null;

        schedulingAccess[
            currentUser.id
        ].closed_at = now;
    }

    if (
        nextPicker
    ) {

        /* Opening the next picker fires the existing
           quarter-access-moved notification trigger, so
           employees and managers are notified. */
        if (
            schedulingAccess[
                nextPicker.id
            ]
        ) {

            schedulingAccess[
                nextPicker.id
            ].is_open = true;

            schedulingAccess[
                nextPicker.id
            ].opened_at = now;

            schedulingAccess[
                nextPicker.id
            ].closed_at = null;
        }
    }
}


async function submitQuarter() {

    clearError();

    const period =
        activeSchedulingPeriod;

    if (
        !period
    ) {

        showError(
            "There is no active scheduling quarter to submit."
        );

        return;
    }

    if (
        currentProfile.role ===
            "admin"
    ) {

        showError(
            "Administrators do not submit quarters."
        );

        return;
    }

    /*
     * Gate on access for the quarter being submitted
     * (activeSchedulingPeriod), not the admin-selected quarter:
     * getQuarterAccessStatusForUser reads adminSchedulingAccess,
     * which for an employee defaults to the current quarter, so
     * submitting any other quarter always reported locked.
     * schedulingAccess already holds every user's row for the
     * active period (same map the Quarter Access badge reads).
     */
    const ownSubmitAccess =
        schedulingAccess[
            currentUser.id
        ];

    if (
        !ownSubmitAccess ||
        !ownSubmitAccess.is_open
    ) {

        showError(
            "Your scheduling access for this quarter is currently locked."
        );

        return;
    }

    const weekStarts =
        getQuarterWeekStarts(
            period
        );

    const firstKey =
        weekStarts[0];

    const lastDate =
        getDateFromKey(
            weekStarts[
                weekStarts.length - 1
            ]
        );

    lastDate.setDate(
        lastDate.getDate() + 6
    );

    const lastKey =
        getDateKey(lastDate);

    const [
        accessResult,
        schedulesResult,
        leaveResult,
        adminResult,
        targetResult,
        capacityResult,
        allSchedulesResult,
        allLeaveResult
    ] = await Promise.all([

        supabaseClient
            .from(
                "scheduling_period_access"
            )
            .select(
                "user_id,is_open,opened_at,closed_at,pick_order,weekend_target_override"
            )
            .eq(
                "period_id",
                period.id
            ),

        supabaseClient
            .from(
                "schedules"
            )
            .select(
                "schedule_date,schedule_code,work_site"
            )
            .eq(
                "user_id",
                currentUser.id
            )
            .gte(
                "schedule_date",
                firstKey
            )
            .lte(
                "schedule_date",
                lastKey
            ),

        supabaseClient
            .from(
                "schedule_leave_hours"
            )
            .select(
                "leave_date,vacation_hours,professional_leave_hours,tdl_hours"
            )
            .eq(
                "user_id",
                currentUser.id
            )
            .gte(
                "leave_date",
                firstKey
            )
            .lte(
                "leave_date",
                lastKey
            ),

        supabaseClient
            .from(
                "schedule_admin_hours"
            )
            .select(
                "admin_date,admin_hours"
            )
            .eq(
                "user_id",
                currentUser.id
            )
            .gte(
                "admin_date",
                firstKey
            )
            .lte(
                "admin_date",
                lastKey
            ),

        supabaseClient
            .from(
                "scheduling_month_weekend_targets"
            )
            .select(
                "month_key,target"
            )
            .eq(
                "period_id",
                period.id
            )
            .eq(
                "user_id",
                currentUser.id
            ),

        supabaseClient
            .from(
                "clinic_capacity"
            )
            .select(
                "clinic_site,capacity_date,shift_capacity"
            )
            .gte(
                "capacity_date",
                period.period_start
            )
            .lte(
                "capacity_date",
                period.period_end
            ),

        supabaseClient
            .from(
                "schedules"
            )
            .select(
                "user_id,schedule_date,schedule_code,work_site"
            )
            .gte(
                "schedule_date",
                period.period_start
            )
            .lte(
                "schedule_date",
                period.period_end
            ),

        supabaseClient
            .from(
                "schedule_leave_hours"
            )
            .select(
                "user_id,leave_date,vacation_hours,professional_leave_hours,tdl_hours"
            )
            .gte(
                "leave_date",
                period.period_start
            )
            .lte(
                "leave_date",
                period.period_end
            )
    ]);

    const loadError =
        accessResult.error ||
        schedulesResult.error ||
        leaveResult.error ||
        adminResult.error ||
        targetResult.error ||
        capacityResult.error ||
        allSchedulesResult.error ||
        allLeaveResult.error;

    if (
        loadError
    ) {

        showError(
            "Your quarter could not be checked: " +
                loadError.message
        );

        return;
    }

    const scheduleByDate = new Map(
        (schedulesResult.data || [])
            .map(
                row => [
                    row.schedule_date,
                    row.schedule_code
                ]
            )
    );

    const leaveByDate = new Map();

    (leaveResult.data || [])
        .forEach(
            row =>
                leaveByDate.set(
                    row.leave_date,
                    Number(
                        row.vacation_hours || 0
                    ) +
                    Number(
                        row.professional_leave_hours || 0
                    ) +
                    Number(
                        row.tdl_hours || 0
                    )
                )
        );

    const adminByDate = new Map(
        (adminResult.data || [])
            .map(
                row => [
                    row.admin_date,
                    Number(
                        row.admin_hours || 0
                    )
                ]
            )
    );

    /* A week's credited total is worked hours plus the Admin
       piece plus leave hours. A full 40-hour leave week
       therefore counts as complete. */
    const weekTotals =
        weekStarts.map(
            weekStart => {

                let total = 0;

                for (
                    let i = 0;
                    i < 7;
                    i++
                ) {

                    const date =
                        getDateFromKey(
                            weekStart
                        );

                    date.setDate(
                        date.getDate() + i
                    );

                    const dateKey =
                        getDateKey(date);

                    total +=
                        quarterDayCreditedHours(
                            scheduleByDate.get(
                                dateKey
                            ) || "0",
                            adminByDate.get(
                                dateKey
                            ) || 0,
                            leaveByDate.get(
                                dateKey
                            ) || 0
                        );
                }

                return {
                    weekStart,
                    total
                };
            }
        );

    const incompleteWeeks =
        weekTotals.filter(
            week =>
                week.total !== 40
        );

    const holderClinic =
        currentProfile.clinic_site;

    const accessById = new Map(
        (accessResult.data || [])
            .map(
                row => [
                    row.user_id,
                    row
                ]
            )
    );

    const ownAccess =
        accessById.get(
            currentUser.id
        ) || null;

    /* Weekend targets only exist for Turfland: the weekend
       count itself returns 0 for every other clinic. */
    let weekendShort = [];

    if (
        holderClinic === "Turfland"
    ) {

        const targetByMonth = new Map(
            (targetResult.data || [])
                .map(
                    row => [
                        row.month_key,
                        Number(row.target)
                    ]
                )
        );

        weekendShort =
            getPeriodMonthKeys(
                period
            )
            .map(
                monthKey => {

                    const count =
                        (schedulesResult.data || [])
                            .filter(
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

                                    return getAssignedMonthKeyForWeekDate(
                                        date
                                    ) === monthKey;
                                }
                            )
                            .length;

                    const target =
                        targetByMonth.has(
                            monthKey
                        )
                            ? targetByMonth.get(
                                monthKey
                            )
                            : (
                                ownAccess &&
                                ownAccess.weekend_target_override !==
                                    null &&
                                ownAccess.weekend_target_override !==
                                    undefined
                                    ? Number(
                                        ownAccess.weekend_target_override
                                    )
                                    : Number(
                                        period.weekend_target ?? 3
                                    )
                            );

                    return {
                        monthKey,
                        count,
                        target
                    };
                }
            )
            .filter(
                month =>
                    month.count <
                        month.target
            );
    }

    /* The picking queue is active employees at the holder's
       clinic, in the same order the Picking Status card
       shows: manual pick order when anyone has one, names
       otherwise. Managers and external workers do not pick. */
    const profileById = new Map(
        (profiles || [])
            .map(
                profile => [
                    profile.id,
                    profile
                ]
            )
    );

    const waiting =
        (profiles || [])
            .filter(
                profile => {

                    if (
                        !profile.active ||
                        profile.role !==
                            "employee" ||
                        profile.clinic_site !==
                            holderClinic ||
                        profile.id ===
                            currentUser.id
                    ) {

                        return false;
                    }

                    const access =
                        accessById.get(
                            profile.id
                        );

                    return Boolean(
                        access &&
                        !access.is_open &&
                        !access.closed_at
                    );
                }
            );

    const hasManualOrder =
        waiting.some(
            profile =>
                accessById.get(
                    profile.id
                ).pick_order !==
                    null &&
                accessById.get(
                    profile.id
                ).pick_order !==
                    undefined
        );

    waiting.sort(
        (a, b) => {

            if (
                hasManualOrder
            ) {

                const aOrder =
                    accessById.get(
                        a.id
                    ).pick_order;

                const bOrder =
                    accessById.get(
                        b.id
                    ).pick_order;

                if (
                    aOrder === null ||
                    aOrder === undefined
                ) {

                    if (
                        bOrder === null ||
                        bOrder === undefined
                    ) {

                        return getProfileName(a)
                            .localeCompare(
                                getProfileName(b)
                            );
                    }

                    return 1;
                }

                if (
                    bOrder === null ||
                    bOrder === undefined
                ) {

                    return -1;
                }

                if (
                    aOrder !== bOrder
                ) {

                    return aOrder - bOrder;
                }
            }

            return getProfileName(a)
                .localeCompare(
                    getProfileName(b)
                );
        }
    );

    const nextPicker =
        waiting.length > 0
            ? waiting[0]
            : null;

    /* Turfland queue rule: only the first two pickers may be
       open together; otherwise one picker at a time. When
       another Turfland picker is still open, this submit
       closes the submitter without opening anyone new, so
       the confirm modal must not name a next picker. */
    const anotherPickerOpen =
        holderClinic === "Turfland" &&
        (accessResult.data || []).some(
            row =>
                row.user_id !== currentUser.id &&
                row.is_open &&
                profileById.get(row.user_id) &&
                profileById.get(row.user_id).clinic_site === holderClinic
        );

    /* Coverage gate: a day is at risk when its unfilled
       12-hour slots outnumber the remaining pickers at this
       clinic who could still fill that day (not already on a
       12 that day, and with no leave that day). This only
       applies while pickers remain: the last picker is never
       blocked by unfilled slots. */
    let coverageRisks = [];

    if (
        waiting.length > 0
    ) {

        const capacityByDate = new Map(
            (capacityResult.data || [])
                .filter(
                    row =>
                        row.clinic_site ===
                            holderClinic
                )
                .map(
                    row => [
                        row.capacity_date,
                        Number(
                            row.shift_capacity
                        )
                    ]
                )
        );

        const leaveByUserDate = new Map();

        (allLeaveResult.data || [])
            .forEach(
                row =>
                    leaveByUserDate.set(
                        row.user_id +
                            "|" +
                            row.leave_date,
                        Number(
                            row.vacation_hours || 0
                        ) +
                        Number(
                            row.professional_leave_hours || 0
                        ) +
                        Number(
                            row.tdl_hours || 0
                        )
                    )
            );

        const allSchedules =
            allSchedulesResult.data || [];

        const dayCursor =
            getDateFromKey(
                period.period_start
            );

        const periodEnd =
            getDateFromKey(
                period.period_end
            );

        while (
            dayCursor <= periodEnd
        ) {

            const dateKey =
                getDateKey(dayCursor);

            const capacity =
                capacityByDate.has(
                    dateKey
                )
                    ? capacityByDate.get(
                        dateKey
                    )
                    : getDefaultClinicCapacity(
                        holderClinic,
                        dayCursor
                    );

            const scheduled12 =
                allSchedules.filter(
                    row => {

                        if (
                            row.schedule_date !==
                                dateKey ||
                            row.schedule_code !==
                                "12"
                        ) {

                            return false;
                        }

                        const owner =
                            profileById.get(
                                row.user_id
                            );

                        const site =
                            row.work_site ||
                            (
                                owner &&
                                owner.clinic_site
                            ) ||
                            null;

                        return site ===
                            holderClinic;
                    }
                ).length;

            const remaining =
                capacity - scheduled12;

            if (
                remaining > 0
            ) {

                const available =
                    waiting.filter(
                        profile => {

                            const row =
                                allSchedules.find(
                                    item =>
                                        item.user_id ===
                                            profile.id &&
                                        item.schedule_date ===
                                            dateKey
                                );

                            if (
                                row &&
                                row.schedule_code ===
                                    "12"
                            ) {

                                return false;
                            }

                            return (
                                leaveByUserDate.get(
                                    profile.id +
                                        "|" +
                                        dateKey
                                ) || 0
                            ) === 0;
                        }
                    ).length;

                if (
                    remaining > available
                ) {

                    coverageRisks.push(
                        {
                            dateKey,
                            remaining,
                            available
                        }
                    );
                }
            }

            dayCursor.setDate(
                dayCursor.getDate() + 1
            );
        }
    }

    if (
        incompleteWeeks.length > 0 ||
        weekendShort.length > 0 ||
        coverageRisks.length > 0
    ) {

        let body =
            "<p>Your quarter is not ready to submit yet. " +
                "Fix the items below, then try again.</p>";

        if (
            incompleteWeeks.length > 0
        ) {

            body +=
                "<h3>Weeks needing hours</h3><ul>" +
                incompleteWeeks
                    .map(
                        week =>
                            `<li>${escapeHtml(formatQuarterWeek(week.weekStart))}: ` +
                            `${week.total}/40 hours ` +
                            `<button type="button" class="modal-button cancel-button" data-go-week="${week.weekStart}">Go to week</button></li>`
                    )
                    .join("") +
                "</ul>";
        }

        if (
            weekendShort.length > 0
        ) {

            body +=
                "<h3>Weekend dates still needed</h3><ul>" +
                weekendShort
                    .map(
                        month => {

                            const goWeek =
                                firstQuarterWeekForMonth(
                                    month.monthKey,
                                    weekStarts
                                );

                            return `<li>${escapeHtml(getWeekendMonthLabel(month.monthKey))}: ` +
                                `${month.count}/${month.target} weekend dates` +
                                (
                                    goWeek
                                        ? ` <button type="button" class="modal-button cancel-button" data-go-week="${goWeek}">Go to week</button>`
                                        : ""
                                ) +
                                "</li>";
                        }
                    )
                    .join("") +
                "</ul>";
        }

        if (
            coverageRisks.length > 0
        ) {

            body +=
                "<h3>Days later pickers could not cover</h3>" +
                "<p>These days would be left with more open " +
                "12-hour shifts than the remaining pickers could " +
                "fill. Adjust your schedule so no day is left short.</p><ul>" +
                coverageRisks
                    .map(
                        risk =>
                            `<li>${escapeHtml(formatQuarterDate(risk.dateKey))}: ` +
                            `${risk.remaining} open shifts, only ` +
                            `${risk.available} picker${risk.available === 1 ? "" : "s"} left ` +
                            `<button type="button" class="modal-button cancel-button" data-go-week="${quarterWeekStartForDate(risk.dateKey)}">Go to week</button></li>`
                    )
                    .join("") +
                "</ul>";
        }

        openQuarterModal(
            "Quarter not ready yet",
            body,
            `<button type="button" class="modal-button cancel-button" data-quarter-close>Close</button>`
        );

        return;
    }

    const nextName =
        nextPicker && !anotherPickerOpen
            ? getProfileName(nextPicker)
            : null;

    let confirmBody =
        `<p>Every week in ${escapeHtml(period.name || "this quarter")} ` +
        "totals 40 credited hours";

    if (
        holderClinic === "Turfland"
    ) {

        confirmBody +=
            " and every month meets its weekend target";
    }

    confirmBody +=
        ", and no day is left short for the remaining pickers.</p>";

    if (
        nextName
    ) {

        confirmBody +=
            `<p>When you submit, your scheduling access will close ` +
            `and scheduling will move to <strong>${escapeHtml(nextName)}</strong>.</p>`;
    } else if (
        anotherPickerOpen
    ) {

        confirmBody +=
            "<p>When you submit, your scheduling access will close. " +
            "Another picker at your clinic is still picking, so no new picker opens.</p>";
    } else {

        confirmBody +=
            "<p>You are the last picker in your clinic's queue. " +
            "When you submit, your scheduling access will close.</p>";
    }

    confirmBody +=
        "<p>Are you sure you want to submit your full quarter?</p>";

    const overlay =
        openQuarterModal(
            "Submit your full quarter?",
            confirmBody,
            `<button type="button" class="modal-button cancel-button" data-quarter-close>Cancel</button>` +
            `<button type="button" class="modal-button save-button" id="confirmQuarterSubmitButton">Yes, submit quarter</button>`
        );

    overlay
        .querySelector(
            "#confirmQuarterSubmitButton"
        )
        .addEventListener(
            "click",
            async () => {

                const button =
                    overlay.querySelector(
                        "#confirmQuarterSubmitButton"
                    );

                button.disabled = true;
                button.textContent = "Submitting...";

                try {

                    await doQuarterSubmit(
                        period,
                        weekStarts,
                        ownAccess,
                        nextPicker,
                        nextPicker
                            ? accessById.get(
                                nextPicker.id
                            )
                            : null
                    );

                    closeQuarterModal();

                    await loadWeek();

                    alert(
                        nextName
                            ? "Your quarter has been submitted. Scheduling has moved to " + nextName + "."
                            : "Your quarter has been submitted. Your scheduling access is now closed."
                    );
                } catch (
                    error
                ) {

                    console.error(
                        error
                    );

                    closeQuarterModal();

                    showError(
                        error.message ||
                            "Your quarter could not be submitted."
                    );
                }
            }
        );
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

    syncQuarterSelectionToCurrentWeek();

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

    syncQuarterSelectionToCurrentWeek();

    await loadWeek();
}


async function goToCurrentWeek() {

    currentWeekStart =
        getSunday(
            new Date()
        );

    syncQuarterSelectionToCurrentWeek();

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
