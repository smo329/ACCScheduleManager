/*
 * ACC Schedule Manager - Post-load patches
 *
 * Loaded AFTER the main application scripts so targeted fixes and
 * enhancements can be pushed directly without replacing index.html.
 */

(function () {
    "use strict";

    const PATCH_VERSION = "2026.08.14.4";

    console.info(
        `[ACC Schedule Manager] patches loaded: ${PATCH_VERSION}`
    );

    /* ---------------------------------------------------------
       AUTO-SWITCH QUARTER WHEN WEEK NAVIGATION ENTERS ONE
       --------------------------------------------------------- */

    function syncQuarterSelectionToCurrentWeekPatch() {
        if (
            !Array.isArray(allSchedulingPeriods) ||
            allSchedulingPeriods.length === 0 ||
            !currentWeekStart
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

        const matchingPeriod =
            allSchedulingPeriods.find(
                period =>
                    period &&
                    period.active &&
                    weekStart <= period.period_end &&
                    weekEnd >= period.period_start
            );

        // If this week is outside every defined quarter, keep the
        // currently selected quarter unchanged.
        if (!matchingPeriod) {
            return;
        }

        viewSchedulingPeriodId =
            matchingPeriod.id;

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

    if (
        typeof renderSchedule === "function"
    ) {
        const originalRenderSchedule =
            renderSchedule;

        renderSchedule = function (...args) {
            try {
                syncQuarterSelectionToCurrentWeekPatch();
            } catch (error) {
                console.warn(
                    "Quarter auto-switch patch failed:",
                    error
                );
            }

            return originalRenderSchedule.apply(
                this,
                args
            );
        };
    }

    /* ---------------------------------------------------------
       EXCLUDE ADMINS FROM WEEKLY SUBMISSION COUNTS
       --------------------------------------------------------- */

    if (
        typeof renderWorkflowPanel === "function"
    ) {
        const originalRenderWorkflowPanel =
            renderWorkflowPanel;

        renderWorkflowPanel = function (...args) {
            const originalProfiles =
                profiles;

            try {
                profiles =
                    originalProfiles.filter(
                        profile =>
                            profile &&
                            profile.role !== "admin"
                    );

                return originalRenderWorkflowPanel.apply(
                    this,
                    args
                );
            } finally {
                profiles =
                    originalProfiles;
            }
        };
    }
})();
