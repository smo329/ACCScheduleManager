/* =========================================================
   SUPABASE
========================================================= */

const SUPABASE_URL =
    "https://jtxndcvsnnnzfixpbeff.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_96HFFcvqRmAham3zRid0Mw_vqDZQoCc";

const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentProfile = null;

let profiles = [];
let scheduleData = {};
let comments = {};
let clinicCapacityData = {};

let weeklySubmissions = {};
let currentWeekLocked = false;
let currentWeekLockData = null;

let allSchedulingPeriods = [];

let activeSchedulingPeriod = null;
let schedulingAccess = {};
let activeWeekendScheduleRows = [];

let adminSchedulingPeriodId = null;
let adminSchedulingPeriod = null;
let adminSchedulingAccess = {};
let quarterWeekendScheduleRows = [];

let viewSchedulingPeriodId = null;
let viewMonthKey = null;
let monthlyWeekendTargets = {};

let currentWeekStart =
    getSunday(new Date());

let activeCommentUserId = null;
let activeCommentDate = null;


/* =========================================================
   SCHEDULE CODES
========================================================= */

const scheduleCodes = [
    "0",
    "12",
    "A4",
    "VL12",
    "VL4",
    "PL12",
    "PL4"
];

const codeHours = {
    "0": 0,
    "12": 12,
    "A4": 4,
    "VL12": 12,
    "VL4": 4,
    "PL12": 12,
    "PL4": 4
};

const vacationCodes = [
    "VL12",
    "VL4"
];

const otherLeaveCodes = [
    "PL12",
    "PL4"
];


/* =========================================================
   STARTUP
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async function () {

        document
            .getElementById("password")
            .addEventListener(
                "keydown",
                function(event) {
                    if (event.key === "Enter") {
                        login();
                    }
                }
            );

        await checkExistingSession();
    }
);


/* =========================================================
   AUTH
========================================================= */

async function checkExistingSession() {

    const {
        data,
        error
    } =
        await supabaseClient.auth.getSession();

    if (error) {
        console.error(error);
        showLogin();
        return;
    }

    if (
        data.session &&
        data.session.user
    ) {
        await startApplication(
            data.session.user
        );
    } else {
        showLogin();
    }
}


async function login() {

    const email =
        document
            .getElementById("email")
            .value
            .trim();

    const password =
        document
            .getElementById("password")
            .value;

    const button =
        document.getElementById(
            "loginButton"
        );

    const errorBox =
        document.getElementById(
            "loginError"
        );

    errorBox.style.display =
        "none";

    if (!email || !password) {
        errorBox.textContent =
            "Please enter your email and password.";

        errorBox.style.display =
            "block";

        return;
    }

    button.disabled = true;
    button.textContent = "Signing In...";

    const {
        data,
        error
    } =
        await supabaseClient
            .auth
            .signInWithPassword({
                email,
                password
            });

    button.disabled = false;
    button.textContent = "Sign In";

    if (error) {
        console.error(error);

        errorBox.textContent =
            error.message ||
            "Unable to sign in.";

        errorBox.style.display =
            "block";

        return;
    }

    if (!data.user) {
        errorBox.textContent =
            "Unable to load your user account.";

        errorBox.style.display =
            "block";

        return;
    }

    await startApplication(
        data.user
    );
}


async function logout() {

    await supabaseClient.auth.signOut();

    currentUser = null;
    currentProfile = null;

    profiles = [];
    scheduleData = {};
    comments = {};
    clinicCapacityData = {};
    weeklySubmissions = {};
    currentWeekLocked = false;
    currentWeekLockData = null;

    allSchedulingPeriods = [];

    activeSchedulingPeriod = null;
    schedulingAccess = {};
    activeWeekendScheduleRows = [];

    adminSchedulingPeriodId = null;
    adminSchedulingPeriod = null;
    adminSchedulingAccess = {};
    quarterWeekendScheduleRows = [];

    viewSchedulingPeriodId = null;
    viewMonthKey = null;
    monthlyWeekendTargets = {};

    document
        .getElementById("password")
        .value = "";

    showLogin();
}


function showLogin() {

    document
        .getElementById("app")
        .style.display =
            "none";

    document
        .getElementById("loginScreen")
        .style.display =
            "flex";
}


function showApp() {

    document
        .getElementById("loginScreen")
        .style.display =
            "none";

    document
        .getElementById("app")
        .style.display =
            "block";
}


/* =========================================================
   START APP / PROFILE
========================================================= */

async function startApplication(
    user
) {

    currentUser = user;

    const loaded =
        await loadCurrentProfile();

    if (!loaded) {
        await supabaseClient
            .auth
            .signOut();

        showLogin();
        return;
    }

    showApp();
    updateUserHeader();

    await loadWeek();
}


async function loadCurrentProfile() {

    clearError();

    const {
        data,
        error
    } =
        await supabaseClient
            .from("profiles")
            .select(`
                id,
                first_name,
                last_name,
                role,
                active,
                clinic_site
            `)
            .eq(
                "id",
                currentUser.id
            )
            .single();

    if (error) {
        console.error(error);

        showError(
            "Your login worked, but your profile could not be loaded."
        );

        return false;
    }

    if (!data || !data.active) {
        showError(
            "Your account is not active."
        );

        return false;
    }

    currentProfile = data;

    return true;
}


function updateUserHeader() {

    const fullName =
        getProfileName(
            currentProfile
        );

    document
        .getElementById("loggedInUser")
        .textContent =
            fullName;

    document
        .getElementById("roleBadge")
        .textContent =
            currentProfile.role === "admin"
                ? "Administrator"
                : "Employee";

    document
        .getElementById("adminButton")
        .style.display =
            currentProfile.role === "admin"
                ? "inline-block"
                : "none";

    const site =
        currentProfile.clinic_site
            ? ` — ${currentProfile.clinic_site}`
            : "";

    document
        .getElementById("permissionNotice")
        .innerHTML =
            currentProfile.role === "admin"
                ? `
                    <strong>Administrator:</strong>
                    You can edit any employee's schedule${site}.
                    You can also change daily Shift Capacity from 0–4 and override a full clinic when necessary.
                  `
                : `
                    <strong>Your schedule:</strong>
                    You can edit only your own schedule.
                    Other employees' schedules are read-only${site}.
                  `;
}


/* =========================================================
   DATE HELPERS
========================================================= */

function getSunday(date) {

    const result =
        new Date(date);

    result.setHours(
        0,
        0,
        0,
        0
    );

    result.setDate(
        result.getDate()
        -
        result.getDay()
    );

    return result;
}


function getWeekDates() {

    const dates = [];

    for (
        let i = 0;
        i < 7;
        i++
    ) {

        const date =
            new Date(
                currentWeekStart
            );

        date.setDate(
            currentWeekStart.getDate()
            +
            i
        );

        dates.push(date);
    }

    return dates;
}


function getDateKey(date) {

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            "0"
        );

    const day =
        String(
            date.getDate()
        ).padStart(
            2,
            "0"
        );

    return `${year}-${month}-${day}`;
}


function getDayName(date) {

    return date.toLocaleString(
        "en-US",
        {
            weekday: "short"
        }
    );
}


/* =========================================================
   DEFAULT CLINIC CAPACITY
========================================================= */

function getDefaultClinicCapacity(
    clinicSite,
    date
) {

    const day =
        date.getDay();

    /*
     * 0 Sun
     * 1 Mon
     * 2 Tue
     * 3 Wed
     * 4 Thu
     * 5 Fri
     * 6 Sat
     */

    if (
        clinicSite ===
        "Turfland"
    ) {

        /*
         * Mon–Thu = 3
         * Fri/Sat/Sun = 2
         */

        if (
            day >= 1 &&
            day <= 4
        ) {
            return 3;
        }

        return 2;
    }

    if (
        clinicSite ===
        "Fountain Court"
    ) {

        /*
         * Tue/Wed = 2
         * all other days = 1
         */

        if (
            day === 2 ||
            day === 3
        ) {
            return 2;
        }

        return 1;
    }

    return 0;
}


function getClinicCapacity(
    clinicSite,
    date
) {

    const dateKey =
        getDateKey(date);

    const key =
        `${clinicSite}_${dateKey}`;

    if (
        clinicCapacityData[key] !==
        undefined
    ) {
        return clinicCapacityData[key];
    }

    return getDefaultClinicCapacity(
        clinicSite,
        date
    );
}


/* =========================================================
   LOAD WEEK
========================================================= */

async function loadWeek() {

    clearError();
    renderLoading();

    const weekDates =
        getWeekDates();

    const startKey =
        getDateKey(
            weekDates[0]
        );

    const endKey =
        getDateKey(
            weekDates[6]
        );

    const [
        profilesResult,
        schedulesResult,
        commentsResult,
        capacityResult,
        submissionsResult,
        lockResult,
        periodResult
    ] =
        await Promise.all([

            supabaseClient
                .from("profiles")
                .select(`
                    id,
                    first_name,
                    last_name,
                    role,
                    active,
                    clinic_site
                `)
                .order("last_name")
                .order("first_name"),

            supabaseClient
                .from("schedules")
                .select(`
                    id,
                    user_id,
                    schedule_date,
                    schedule_code,
                    work_site
                `)
                .gte(
                    "schedule_date",
                    startKey
                )
                .lte(
                    "schedule_date",
                    endKey
                ),

            supabaseClient
                .from("schedule_comments")
                .select(`
                    id,
                    user_id,
                    schedule_date,
                    comment
                `)
                .gte(
                    "schedule_date",
                    startKey
                )
                .lte(
                    "schedule_date",
                    endKey
                ),

            supabaseClient
                .from("clinic_capacity")
                .select(`
                    id,
                    clinic_site,
                    capacity_date,
                    shift_capacity
                `)
                .gte(
                    "capacity_date",
                    startKey
                )
                .lte(
                    "capacity_date",
                    endKey
                ),

            supabaseClient
                .from("week_submissions")
                .select(`
                    id,
                    user_id,
                    week_start,
                    status,
                    submitted_at,
                    updated_at
                `)
                .eq(
                    "week_start",
                    startKey
                ),

            supabaseClient
                .from("weekly_locks")
                .select(`
                    week_start,
                    locked,
                    locked_at,
                    locked_by,
                    updated_at
                `)
                .eq(
                    "week_start",
                    startKey
                )
                .maybeSingle(),

            supabaseClient
                .from("scheduling_periods")
                .select(`
                    id,
                    name,
                    period_start,
                    period_end,
                    weekend_target,
                    active
                `)
                .order(
                    "period_start",
                    {
                        ascending: true
                    }
                )

        ]);

    if (profilesResult.error) {
        console.error(
            profilesResult.error
        );

        showError(
            "Unable to load employees: "
            +
            profilesResult.error.message
        );

        return;
    }

    if (schedulesResult.error) {
        console.error(
            schedulesResult.error
        );

        showError(
            "Unable to load schedules: "
            +
            schedulesResult.error.message
        );

        return;
    }

    if (commentsResult.error) {
        console.error(
            commentsResult.error
        );

        showError(
            "Unable to load schedule comments: "
            +
            commentsResult.error.message
        );

        return;
    }

    if (capacityResult.error) {
        console.error(
            capacityResult.error
        );

        showError(
            "Unable to load clinic shift capacities: "
            +
            capacityResult.error.message
        );

        return;
    }

    if (submissionsResult.error) {
        console.error(
            submissionsResult.error
        );

        showError(
            "Unable to load weekly submissions: "
            +
            submissionsResult.error.message
        );

        return;
    }

    if (lockResult.error) {
        console.error(
            lockResult.error
        );

        showError(
            "Unable to load weekly lock status: "
            +
            lockResult.error.message
        );

        return;
    }

    if (periodResult.error) {
        console.warn(
            "Unable to load scheduling periods:",
            periodResult.error
        );

        /*
         * Scheduling periods are an enhancement. Fall back to
         * the normal weekly scheduler if they cannot be loaded.
         */
        periodResult.data = [];

        if (
            currentProfile.role ===
            "admin"
        ) {
            showError(
                "The weekly schedule loaded, but scheduling-quarter settings could not be loaded. "
                +
                periodResult.error.message
            );
        }
    }

    profiles =
        profilesResult.data || [];

    scheduleData = {};

    (
        schedulesResult.data || []
    ).forEach(
        row => {

            if (
                !scheduleData[
                    row.user_id
                ]
            ) {
                scheduleData[
                    row.user_id
                ] = {};
            }

            scheduleData[
                row.user_id
            ][
                row.schedule_date
            ] = {
                code:
                    row.schedule_code,

                work_site:
                    row.work_site
            };
        }
    );

    comments = {};

    (
        commentsResult.data || []
    ).forEach(
        row => {

            comments[
                makeCommentKey(
                    row.user_id,
                    row.schedule_date
                )
            ] =
                row.comment;
        }
    );

    clinicCapacityData = {};

    (
        capacityResult.data || []
    ).forEach(
        row => {

            clinicCapacityData[
                `${row.clinic_site}_${row.capacity_date}`
            ] =
                row.shift_capacity;
        }
    );

    weeklySubmissions = {};

    (
        submissionsResult.data || []
    ).forEach(
        row => {

            weeklySubmissions[
                row.user_id
            ] =
                row;
        }
    );

    currentWeekLockData =
        lockResult.data || null;

    currentWeekLocked =
        Boolean(
            currentWeekLockData &&
            currentWeekLockData.locked
        );

    allSchedulingPeriods =
        periodResult.data || [];

    /*
     * Employee editing uses the scheduling period that
     * overlaps the currently displayed Sunday-Saturday week.
     */
    activeSchedulingPeriod =
        allSchedulingPeriods.find(
            period =>
                period.active &&
                startKey <=
                    period.period_end &&
                endKey >=
                    period.period_start
        )
        || null;

    /*
     * Admin quarter selection is independent of the week
     * currently visible on the schedule.
     */
    if (
        adminSchedulingPeriodId
    ) {
        adminSchedulingPeriod =
            allSchedulingPeriods.find(
                period =>
                    period.id ===
                    adminSchedulingPeriodId
            )
            || null;
    }

    if (
        !adminSchedulingPeriod
    ) {
        const todayKey =
            getDateKey(
                new Date()
            );

        adminSchedulingPeriod =
            allSchedulingPeriods.find(
                period =>
                    period.active &&
                    period.period_end >=
                        todayKey
            )
            ||
            allSchedulingPeriods[
                allSchedulingPeriods.length - 1
            ]
            ||
            null;

        adminSchedulingPeriodId =
            adminSchedulingPeriod
                ? adminSchedulingPeriod.id
                : null;
    }

    schedulingAccess = {};
    adminSchedulingAccess = {};
    activeWeekendScheduleRows = [];
    quarterWeekendScheduleRows = [];

    const periodIds =
        [
            activeSchedulingPeriod
                ? activeSchedulingPeriod.id
                : null,
            adminSchedulingPeriod
                ? adminSchedulingPeriod.id
                : null
        ]
        .filter(
            (value, index, array) =>
                value &&
                array.indexOf(value) === index
        );

    if (
        periodIds.length > 0
    ) {
        const {
            data: accessRows,
            error: accessError
        } =
            await supabaseClient
                .from(
                    "scheduling_period_access"
                )
                .select(`
                    id,
                    period_id,
                    user_id,
                    is_open,
                    weekend_target_override,
                    opened_at,
                    closed_at,
                    updated_at
                `)
                .in(
                    "period_id",
                    periodIds
                );

        if (
            accessError
        ) {

            console.warn(
                "Unable to load scheduling access:",
                accessError
            );

            /*
             * Quarter-management features should never prevent
             * the normal weekly schedule from rendering.
             *
             * The most common cause here is that the newest
             * weekend_target_override migration has not been
             * run yet. Keep the weekly schedule working while
             * surfacing a useful warning to the administrator.
             */
            if (
                currentProfile.role ===
                "admin"
            ) {
                showError(
                    "The weekly schedule loaded, but quarter access settings could not be loaded. Make sure the latest Supabase SQL migration has been run. "
                    +
                    accessError.message
                );
            }

        } else {

            (
                accessRows || []
            ).forEach(
                row => {
                    if (
                        activeSchedulingPeriod &&
                        row.period_id ===
                            activeSchedulingPeriod.id
                    ) {
                        schedulingAccess[
                            row.user_id
                        ] = row;
                    }

                    if (
                        adminSchedulingPeriod &&
                        row.period_id ===
                            adminSchedulingPeriod.id
                    ) {
                        adminSchedulingAccess[
                            row.user_id
                        ] = row;
                    }
                }
            );
        }
    }

    monthlyWeekendTargets = {};

    if (
        periodIds.length > 0
    ) {

        const {
            data: monthTargetRows,
            error: monthTargetError
        } =
            await supabaseClient
                .from(
                    "scheduling_month_weekend_targets"
                )
                .select(`
                    id,
                    period_id,
                    user_id,
                    month_key,
                    target,
                    updated_at
                `)
                .in(
                    "period_id",
                    periodIds
                );

        if (
            monthTargetError
        ) {
            console.warn(
                "Unable to load monthly weekend targets:",
                monthTargetError
            );
        } else {

            (
                monthTargetRows || []
            ).forEach(
                row => {
                    monthlyWeekendTargets[
                        `${row.period_id}_${row.user_id}_${row.month_key}`
                    ] =
                        row;
                }
            );
        }
    }

    const periodsToLoad =
        [
            activeSchedulingPeriod,
            adminSchedulingPeriod
        ]
        .filter(
            (period, index, array) =>
                period &&
                array.findIndex(
                    item =>
                        item &&
                        item.id === period.id
                ) === index
        );

    for (
        const period of periodsToLoad
    ) {
        const {
            data: weekendRows,
            error: weekendError
        } =
            await supabaseClient
                .from(
                    "schedules"
                )
                .select(`
                    user_id,
                    schedule_date,
                    schedule_code,
                    work_site
                `)
                .gte(
                    "schedule_date",
                    period.period_start
                )
                .lte(
                    "schedule_date",
                    period.period_end
                )
                .eq(
                    "schedule_code",
                    "12"
                );

        if (
            weekendError
        ) {

            console.warn(
                "Unable to load quarter weekend totals:",
                weekendError
            );

            /*
             * Weekend statistics are supplemental. A failure
             * here must not blank out the main weekly schedule.
             */
            if (
                currentProfile.role ===
                "admin"
            ) {
                showError(
                    "The weekly schedule loaded, but quarter weekend totals could not be loaded. "
                    +
                    weekendError.message
                );
            }

        } else {

            if (
                activeSchedulingPeriod &&
                period.id ===
                    activeSchedulingPeriod.id
            ) {
                activeWeekendScheduleRows =
                    weekendRows || [];
            }

            if (
                adminSchedulingPeriod &&
                period.id ===
                    adminSchedulingPeriod.id
            ) {
                quarterWeekendScheduleRows =
                    weekendRows || [];
            }
        }
    }

    renderSchedule();
}


/* =========================================================
   DISPLAY HELPERS
========================================================= */

function getSelectedViewPeriod() {

    if (
        viewSchedulingPeriodId
    ) {
        const selected =
            allSchedulingPeriods.find(
                period =>
                    period.id ===
                    viewSchedulingPeriodId
            );

        if (
            selected
        ) {
            return selected;
        }
    }

    if (
        activeSchedulingPeriod
    ) {
        return activeSchedulingPeriod;
    }

    return (
        allSchedulingPeriods.find(
            period =>
                period.active
        )
        ||
        allSchedulingPeriods[0]
        ||
        null
    );
}


function getWeekStartDatesForPeriod(
    period
) {

    if (!period) {
        return [];
    }

    const weeks = [];

    let cursor =
        getSunday(
            getDateFromKey(
                period.period_start
            )
        );

    const periodEnd =
        getDateFromKey(
            period.period_end
        );

    while (
        cursor <= periodEnd
    ) {

        weeks.push(
            new Date(cursor)
        );

        cursor =
            new Date(cursor);

        cursor.setDate(
            cursor.getDate() + 7
        );
    }

    return weeks;
}


function getWeekStartDatesForAssignedMonth(
    period,
    monthKey
) {

    return getWeekStartDatesForPeriod(
        period
    ).filter(
        weekStart =>
            getAssignedMonthKeyForWeekDate(
                weekStart
            ) ===
            monthKey
    );
}


function getMonthlyWeekendTargetForUser(
    userId,
    monthKey,
    period =
        activeSchedulingPeriod
) {

    if (
        !period
    ) {
        return 3;
    }

    const saved =
        monthlyWeekendTargets[
            `${period.id}_${userId}_${monthKey}`
        ];

    if (
        saved
    ) {
        return Number(
            saved.target
        );
    }

    return getWeekendTargetForUser(
        userId,
        period
    );
}


function syncQuarterSelectionToCurrentWeek() {

    if (
        !allSchedulingPeriods ||
        allSchedulingPeriods.length === 0
    ) {
        return;
    }

    const weekStart =
        getDateKey(
            currentWeekStart
        );

    const weekEndDate =
        new Date(
            currentWeekStart
        );

    weekEndDate.setDate(
        weekEndDate.getDate() + 6
    );

    const weekEnd =
        getDateKey(
            weekEndDate
        );

    /*
     * Automatically switch the quarter selector when the
     * displayed Sunday-Saturday week falls into another
     * existing scheduling quarter.
     *
     * If no scheduling quarter contains/overlaps this week,
     * keep the user's currently selected quarter unchanged.
     */
    const matchingPeriod =
        allSchedulingPeriods.find(
            period =>
                period.active &&
                weekStart <=
                    period.period_end &&
                weekEnd >=
                    period.period_start
        );

    if (
        !matchingPeriod
    ) {
        return;
    }

    if (
        viewSchedulingPeriodId !==
            matchingPeriod.id
    ) {
        viewSchedulingPeriodId =
            matchingPeriod.id;
    }

    const monthKeys =
        getPeriodMonthKeys(
            matchingPeriod
        );

    const assignedMonth =
        getAssignedMonthKeyForWeekDate(
            currentWeekStart
        );

    if (
        monthKeys.includes(
            assignedMonth
        )
    ) {
        viewMonthKey =
            assignedMonth;
    } else if (
        !viewMonthKey ||
        !monthKeys.includes(
            viewMonthKey
        )
    ) {
        viewMonthKey =
            monthKeys[0] || null;
    }
}


function renderQuarterNavigator() {

    const quarterSelect =
        document.getElementById(
            "viewQuarterSelect"
        );

    const monthSelect =
        document.getElementById(
            "viewMonthSelect"
        );

    const weekList =
        document.getElementById(
            "quarterWeekList"
        );

    if (
        !quarterSelect ||
        !monthSelect ||
        !weekList
    ) {
        return;
    }

    quarterSelect.innerHTML =
        "";

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

            quarterSelect.appendChild(
                option
            );
        }
    );

    let selectedPeriod =
        getSelectedViewPeriod();

    if (
        !selectedPeriod
    ) {
        quarterSelect.innerHTML =
            `<option>No quarters created</option>`;

        monthSelect.innerHTML =
            `<option>No month</option>`;

        weekList.innerHTML =
            "";

        return;
    }

    if (
        !viewSchedulingPeriodId
    ) {
        viewSchedulingPeriodId =
            selectedPeriod.id;
    }

    quarterSelect.value =
        viewSchedulingPeriodId;

    selectedPeriod =
        getSelectedViewPeriod();

    const monthKeys =
        getPeriodMonthKeys(
            selectedPeriod
        );

    const currentAssignedMonth =
        getAssignedMonthKeyForWeekDate(
            currentWeekStart
        );

    if (
        !viewMonthKey ||
        !monthKeys.includes(
            viewMonthKey
        )
    ) {

        viewMonthKey =
            monthKeys.includes(
                currentAssignedMonth
            )
                ? currentAssignedMonth
                : monthKeys[0]
                  || null;
    }

    monthSelect.innerHTML =
        "";

    monthKeys.forEach(
        monthKey => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                monthKey;

            option.textContent =
                getWeekendMonthLabel(
                    monthKey
                );

            monthSelect.appendChild(
                option
            );
        }
    );

    if (
        viewMonthKey
    ) {
        monthSelect.value =
            viewMonthKey;
    }

    weekList.innerHTML =
        "";

    getWeekStartDatesForAssignedMonth(
        selectedPeriod,
        viewMonthKey
    ).forEach(
        weekStart => {

            const weekEnd =
                new Date(
                    weekStart
                );

            weekEnd.setDate(
                weekEnd.getDate() + 6
            );

            const button =
                document.createElement(
                    "button"
                );

            button.type =
                "button";

            button.className =
                "quarter-week-button";

            if (
                getDateKey(
                    weekStart
                ) ===
                getDateKey(
                    currentWeekStart
                )
            ) {
                button.classList.add(
                    "active"
                );
            }

            button.textContent =
                `${weekStart.getMonth() + 1}/${weekStart.getDate()}–${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;

            button.onclick =
                async function() {

                    currentWeekStart =
                        getSunday(
                            weekStart
                        );

                    await loadWeek();
                };

            weekList.appendChild(
                button
            );
        }
    );
}


async function changeViewQuarter() {

    const select =
        document.getElementById(
            "viewQuarterSelect"
        );

    viewSchedulingPeriodId =
        select.value || null;

    const period =
        getSelectedViewPeriod();

    if (!period) {
        return;
    }

    const monthKeys =
        getPeriodMonthKeys(
            period
        );

    viewMonthKey =
        monthKeys[0]
        || null;

    const firstWeek =
        getWeekStartDatesForAssignedMonth(
            period,
            viewMonthKey
        )[0];

    if (
        firstWeek
    ) {
        currentWeekStart =
            getSunday(
                firstWeek
            );

        await loadWeek();
    } else {
        renderQuarterNavigator();
    }
}


async function changeViewMonth() {

    const select =
        document.getElementById(
            "viewMonthSelect"
        );

    viewMonthKey =
        select.value || null;

    const period =
        getSelectedViewPeriod();

    const firstWeek =
        getWeekStartDatesForAssignedMonth(
            period,
            viewMonthKey
        )[0];

    if (
        firstWeek
    ) {
        currentWeekStart =
            getSunday(
                firstWeek
            );

        await loadWeek();
    } else {
        renderQuarterNavigator();
    }
}


function getProfileName(profile) {

    return [
        profile.first_name,
        profile.last_name
    ]
    .filter(Boolean)
    .join(" ");
}


function isCurrentWeekInActiveSchedulingPeriod() {

    if (
        !activeSchedulingPeriod
    ) {
        return false;
    }

    const weekDates =
        getWeekDates();

    const weekStart =
        getDateKey(
            weekDates[0]
        );

    const weekEnd =
        getDateKey(
            weekDates[6]
        );

    return (
        weekStart <=
            activeSchedulingPeriod.period_end
        &&
        weekEnd >=
            activeSchedulingPeriod.period_start
    );
}


function canEditProfile(profile) {

    if (
        currentProfile.role ===
        "admin"
    ) {
        return true;
    }

    if (
        currentUser.id !==
        profile.id
    ) {
        return false;
    }

    if (
        currentWeekLocked
    ) {
        return false;
    }

    if (
        isCurrentWeekInActiveSchedulingPeriod()
    ) {
        const access =
            schedulingAccess[
                currentUser.id
            ];

        return Boolean(
            access &&
            access.is_open
        );
    }

    return true;
}


function getScheduleEntry(
    userId,
    dateKey
) {

    if (
        !scheduleData[userId] ||
        !scheduleData[userId][dateKey]
    ) {
        return {
            code: "0",
            work_site: null
        };
    }

    /*
     * Backward compatibility in case an older
     * in-memory value is still a plain string.
     */
    const entry =
        scheduleData[
            userId
        ][
            dateKey
        ];

    if (
        typeof entry ===
        "string"
    ) {
        return {
            code: entry,
            work_site: null
        };
    }

    return {
        code:
            entry.code || "0",

        work_site:
            entry.work_site || null
    };
}


function getScheduleValue(
    userId,
    dateKey
) {

    return getScheduleEntry(
        userId,
        dateKey
    ).code;
}


function getScheduleWorkSite(
    profile,
    dateKey
) {

    const entry =
        getScheduleEntry(
            profile.id,
            dateKey
        );

    /*
     * Existing 12-hour shifts created before the
     * work_site column was added automatically count
     * at the person's primary clinic.
     */
    if (
        entry.code === "12"
    ) {
        return (
            entry.work_site ||
            profile.clinic_site ||
            null
        );
    }

    return null;
}
