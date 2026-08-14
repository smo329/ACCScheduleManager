/*
 * ACC Schedule Manager - Post-load patches
 *
 * This file is intentionally loaded AFTER the main inline application code.
 * Future fixes and enhancements can be pushed here directly from ChatGPT
 * without replacing the large index.html file.
 *
 * Once index.html includes:
 *   <script src="assets/app-patches.js"></script>
 * immediately before </body>, keep that line permanently.
 */

(function () {
    "use strict";

    const PATCH_VERSION = "2026.08.14.1";

    console.info(
        `[ACC Schedule Manager] patches loaded: ${PATCH_VERSION}`
    );

    /* ---------------------------------------------------------
       AUTO-SWITCH QUARTER WHEN WEEK NAVIGATION ENTERS ONE
       --------------------------------------------------------- */

    window.syncQuarterSelectionToCurrentWeek = function () {
        if (
            !Array.isArray(window.allSchedulingPeriods) ||
            window.allSchedulingPeriods.length === 0 ||
            !window.currentWeekStart
        ) {
            return;
        }

        const weekStart =
            window.getDateKey(
                window.currentWeekStart
            );

        const weekEndDate =
            new Date(
                window.currentWeekStart
            );

        weekEndDate.setDate(
            weekEndDate.getDate() + 6
        );

        const weekEnd =
            window.getDateKey(
                weekEndDate
            );

        const matchingPeriod =
            window.allSchedulingPeriods.find(
                period =>
                    period &&
                    period.active &&
                    weekStart <= period.period_end &&
                    weekEnd >= period.period_start
            );

        /*
         * If this week is outside every defined quarter,
         * intentionally leave the current quarter selection alone.
         */
        if (!matchingPeriod) {
            return;
        }

        window.viewSchedulingPeriodId =
            matchingPeriod.id;

        const monthKeys =
            window.getPeriodMonthKeys(
                matchingPeriod
            );

        const assignedMonth =
            window.getAssignedMonthKeyForWeekDate(
                window.currentWeekStart
            );

        if (
            monthKeys.includes(
                assignedMonth
            )
        ) {
            window.viewMonthKey =
                assignedMonth;
        } else if (
            !window.viewMonthKey ||
            !monthKeys.includes(
                window.viewMonthKey
            )
        ) {
            window.viewMonthKey =
                monthKeys[0] || null;
        }
    };

    /*
     * Wrap renderSchedule rather than replacing its implementation.
     * This keeps the patch resilient as the main scheduler evolves.
     */
    if (
        typeof window.renderSchedule === "function"
    ) {
        const originalRenderSchedule =
            window.renderSchedule;

        window.renderSchedule = function (...args) {
            try {
                window.syncQuarterSelectionToCurrentWeek();
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
})();
