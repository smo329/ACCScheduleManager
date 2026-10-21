/*
 * ACC Schedule Manager - Separate Admin hours piece
 *
 * Admin time is no longer only a whole-day code (A4). A day can now
 * be, for example, 8 worked hours plus a separate 4-hour Admin piece,
 * totalling 12. The piece is stored in public.schedule_admin_hours
 * (one row per person per day, admin_hours 0 or 4), mirroring the
 * schedule_leave_hours pattern: it is loaded with the week/period,
 * upserted on (user_id, admin_date), and counted as worked time
 * wherever worked hours are totalled.
 *
 * Legacy A4 days are untouched: their Admin time still lives in the
 * schedule code, and the + Admin button on an A4 day still toggles
 * that code back to 0. The new piece is only used on days whose
 * schedule code is numeric (including 0).
 */
(function () {
    "use strict";

    let adminPatchData = {};

    function adminKey(userId, dateKey) {
        return `${userId}_${dateKey}`;
    }

    function getAdminHours(userId, dateKey) {
        if (!userId || !dateKey) return 0;
        return Number(adminPatchData[adminKey(userId, dateKey)] || 0);
    }

    window.getAdminHours = getAdminHours;

    // Total worked hours for a day: the schedule code's worked hours
    // (A4 counts as 4, numeric codes count as themselves, 12 counts
    // as 12) plus the separate Admin piece, if any. For an A4 day
    // the piece is always 0, so there is no double count.
    window.adminWorkedHours = function (userId, dateKey, code) {
        let worked = 0;
        if (code === "A4") worked = 4;
        else if (code === "12") worked = 12;
        else {
            const n = Number(code);
            worked = Number.isFinite(n) && n >= 0 && n <= 12 ? n : 0;
        }
        return worked + getAdminHours(userId, dateKey);
    };

    async function saveAdminHours(userId, dateKey, hours) {
        const value = Number(hours) || 0;
        if (value !== 0 && value !== 4) return false;
        const { error } = await supabaseClient
            .from("schedule_admin_hours")
            .upsert({
                user_id: userId,
                admin_date: dateKey,
                admin_hours: value,
                updated_at: new Date().toISOString()
            }, {
                onConflict: "user_id,admin_date"
            });
        if (error) {
            console.error(error);
            return false;
        }
        adminPatchData[adminKey(userId, dateKey)] = value;
        return true;
    }

    window.saveAdminHours = saveAdminHours;

    function mapAdminRows(rows) {
        (rows || []).forEach(row => {
            adminPatchData[adminKey(row.user_id, row.admin_date)] =
                Number(row.admin_hours || 0);
        });
    }

    // Load Admin hours with the week and the period, mirroring the
    // leave load in app-patches.js, then re-render so the grid,
    // totals and + Admin buttons reflect the piece.
    if (typeof loadWeek === "function") {
        const originalLoadWeek = loadWeek;
        loadWeek = async function (...args) {
            const result = await originalLoadWeek.apply(this, args);
            try {
                const dates = getWeekDates();
                const startKey = getDateKey(dates[0]);
                const endKey = getDateKey(dates[6]);
                const week = await supabaseClient
                    .from("schedule_admin_hours")
                    .select("user_id,admin_date,admin_hours")
                    .gte("admin_date", startKey)
                    .lte("admin_date", endKey);
                if (!week.error) mapAdminRows(week.data);
                else console.warn("Admin hours unavailable.", week.error);

                const periods = [activeSchedulingPeriod, adminSchedulingPeriod]
                    .filter((p, i, a) =>
                        p && a.findIndex(x => x && x.id === p.id) === i
                    );
                for (const period of periods) {
                    const q = await supabaseClient
                        .from("schedule_admin_hours")
                        .select("user_id,admin_date,admin_hours")
                        .gte("admin_date", period.period_start)
                        .lte("admin_date", period.period_end);
                    if (!q.error) mapAdminRows(q.data);
                }
                renderSchedule();
            } catch (error) {
                console.warn("Admin hours load failed.", error);
            }
            return result;
        };
    }

    // Quarter-dashboard week totals (workflow.js getWeekHours) count
    // only schedule codes. Add the Admin piece for that week when
    // the patch data for it has been loaded.
    if (typeof getWeekHours === "function") {
        const originalGetWeekHours = getWeekHours;
        getWeekHours = function (userId, weekStart) {
            let total = originalGetWeekHours(userId, weekStart);
            try {
                const start = new Date(weekStart);
                for (let i = 0; i < 7; i++) {
                    const d = new Date(start);
                    d.setDate(d.getDate() + i);
                    total += getAdminHours(userId, getDateKey(d));
                }
            } catch (_) {}
            return total;
        };
    }
})();
