/*
 * ACC Schedule Manager - Post-load patches
 * Loaded after the modular application scripts.
 */
(function () {
    "use strict";

    const PATCH_VERSION = "2026.08.14.5";
    const FLEX_CODES = ["0", "12", "A4", "VL", "PL", "TDL"];
    let leavePatchData = {};
    let periodLeavePatchData = {};

    console.info(`[ACC Schedule Manager] patches loaded: ${PATCH_VERSION}`);

    function leaveKey(userId, dateKey) {
        return `${userId}_${dateKey}`;
    }

    function getLeave(userId, dateKey) {
        const row = leavePatchData[leaveKey(userId, dateKey)];
        return row || { vacation: 0, professional: 0, tdl: 0 };
    }

    function totalLeave(userId, dateKey) {
        const l = getLeave(userId, dateKey);
        return Number(l.vacation || 0) + Number(l.professional || 0) + Number(l.tdl || 0);
    }

    function leaveSummary(userId, dateKey) {
        const l = getLeave(userId, dateKey);
        const parts = [];
        if (l.vacation > 0) parts.push(`VL ${l.vacation}`);
        if (l.professional > 0) parts.push(`PL ${l.professional}`);
        if (l.tdl > 0) parts.push(`TDL ${l.tdl}`);
        return parts.join(" · ");
    }

    function mapLeaveRows(rows) {
        (rows || []).forEach(row => {
            leavePatchData[leaveKey(row.user_id, row.leave_date)] = {
                vacation: Number(row.vacation_hours || 0),
                professional: Number(row.professional_leave_hours || 0),
                tdl: Number(row.tdl_hours || 0)
            };
        });
    }

    async function saveLeave(userId, dateKey, vacation, professional, tdl) {
        const values = [vacation, professional, tdl].map(Number);
        if (values.some(v => !Number.isInteger(v) || v < 0 || v > 12)) {
            showError("Leave must be entered in whole hours from 0–12.");
            return false;
        }

        const leaveHours = values.reduce((a, b) => a + b, 0);
        if (leaveHours > 12) {
            showError("Total leave for one day cannot exceed 12 hours.");
            return false;
        }

        const scheduleCode = getScheduleValue(userId, dateKey);
        if (scheduleCode === "A4" && leaveHours > 8) {
            showError("A4 plus leave cannot exceed 12 credited hours for the day. Maximum leave with A4 is 8 hours.");
            return false;
        }

        const { error } = await supabaseClient
            .from("schedule_leave_hours")
            .upsert({
                user_id: userId,
                leave_date: dateKey,
                vacation_hours: values[0],
                professional_leave_hours: values[1],
                tdl_hours: values[2],
                updated_at: new Date().toISOString()
            }, { onConflict: "user_id,leave_date" });

        if (error) {
            console.error(error);
            showError("Leave hours could not be saved: " + error.message);
            return false;
        }

        leavePatchData[leaveKey(userId, dateKey)] = {
            vacation: values[0], professional: values[1], tdl: values[2]
        };

        if (userId === currentUser.id) {
            await markCurrentUserNeedsResubmission();
        }
        return true;
    }

    function ensureLeaveModal() {
        let overlay = document.getElementById("flexLeaveModal");
        if (overlay) return overlay;

        overlay = document.createElement("div");
        overlay.id = "flexLeaveModal";
        overlay.innerHTML = `
            <div class="flex-leave-card">
                <h3 id="flexLeaveTitle">Leave Hours</h3>
                <div class="flex-leave-grid">
                    <label>Vacation<input id="flexVl" type="number" min="0" max="12" step="1"></label>
                    <label>Professional Leave<input id="flexPl" type="number" min="0" max="12" step="1"></label>
                    <label>TDL<input id="flexTdl" type="number" min="0" max="12" step="1"></label>
                </div>
                <div id="flexLeaveTotal" class="flex-leave-total"></div>
                <div class="flex-leave-actions">
                    <button id="flexLeaveCancel" class="modal-button cancel-button" type="button">Cancel</button>
                    <button id="flexLeaveSave" class="modal-button save-button" type="button">Save Leave</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        return overlay;
    }

    function openLeaveEditor(profile, dateKey) {
        const overlay = ensureLeaveModal();
        const l = getLeave(profile.id, dateKey);
        const vl = overlay.querySelector("#flexVl");
        const pl = overlay.querySelector("#flexPl");
        const tdl = overlay.querySelector("#flexTdl");
        const total = overlay.querySelector("#flexLeaveTotal");
        overlay.querySelector("#flexLeaveTitle").textContent = `${getProfileName(profile)} — ${dateKey}`;
        vl.value = l.vacation;
        pl.value = l.professional;
        tdl.value = l.tdl;

        const update = () => {
            const sum = Number(vl.value || 0) + Number(pl.value || 0) + Number(tdl.value || 0);
            total.textContent = `Leave entered: ${sum} / 12 hours`;
        };
        [vl, pl, tdl].forEach(input => input.oninput = update);
        update();

        overlay.querySelector("#flexLeaveCancel").onclick = () => overlay.classList.remove("show");
        overlay.querySelector("#flexLeaveSave").onclick = async () => {
            if (await saveLeave(profile.id, dateKey, vl.value, pl.value, tdl.value)) {
                overlay.classList.remove("show");
                renderSchedule();
            }
        };
        overlay.classList.add("show");
    }

    function addLeaveBadge(cell, profile, dateKey, canEdit) {
        if (cell.querySelector(".flex-leave-badge")) return;
        const summary = leaveSummary(profile.id, dateKey);
        if (!summary && !canEdit) return;
        const item = document.createElement(canEdit ? "button" : "span");
        item.className = "flex-leave-badge" + (summary ? " has-leave" : "");
        item.textContent = summary || "+ Leave";
        if (canEdit) {
            item.type = "button";
            item.onclick = event => {
                event.stopPropagation();
                openLeaveEditor(profile, dateKey);
            };
        }
        cell.appendChild(item);
    }

    function injectStyles() {
        if (document.getElementById("flexLeaveStyles")) return;
        const style = document.createElement("style");
        style.id = "flexLeaveStyles";
        style.textContent = `
            .flex-leave-badge{display:block;width:100%;margin-top:3px;padding:2px 3px;border:0;border-radius:4px;background:transparent;color:#64748b;font-size:10px;line-height:1.15;cursor:pointer;white-space:normal}
            .flex-leave-badge.has-leave{background:#fef3c7;color:#92400e;font-weight:700}
            #flexLeaveModal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.55);z-index:4000}
            #flexLeaveModal.show{display:flex}.flex-leave-card{width:min(520px,100%);background:#fff;border-radius:10px;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.2)}
            .flex-leave-card h3{margin:0 0 14px;color:#17365d}.flex-leave-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.flex-leave-grid label{font-size:12px;font-weight:700;color:#475569}.flex-leave-grid input{width:100%;margin-top:5px;padding:8px;border:1px solid #cbd5e1;border-radius:6px}.flex-leave-total{margin-top:12px;font-weight:700;color:#475569}.flex-leave-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
            .schedule-cell{min-width:66px!important}.hours-column,.hours-cell{min-width:62px!important;width:62px!important}
            @media(max-width:650px){.flex-leave-grid{grid-template-columns:1fr}}
        `;
        document.head.appendChild(style);
    }

    /* Load current-week and relevant-quarter leave rows after the normal load. */
    if (typeof loadWeek === "function") {
        const originalLoadWeek = loadWeek;
        loadWeek = async function (...args) {
            const result = await originalLoadWeek.apply(this, args);
            try {
                const dates = getWeekDates();
                const startKey = getDateKey(dates[0]);
                const endKey = getDateKey(dates[6]);
                const { data, error } = await supabaseClient
                    .from("schedule_leave_hours")
                    .select("user_id,leave_date,vacation_hours,professional_leave_hours,tdl_hours")
                    .gte("leave_date", startKey)
                    .lte("leave_date", endKey);
                if (!error) mapLeaveRows(data);
                else console.warn("Leave hours unavailable; run the leave migration.", error);

                periodLeavePatchData = {};
                const periods = [activeSchedulingPeriod, adminSchedulingPeriod]
                    .filter((p, i, a) => p && a.findIndex(x => x && x.id === p.id) === i);
                for (const period of periods) {
                    const q = await supabaseClient
                        .from("schedule_leave_hours")
                        .select("user_id,leave_date,vacation_hours,professional_leave_hours,tdl_hours")
                        .gte("leave_date", period.period_start)
                        .lte("leave_date", period.period_end);
                    if (!q.error) {
                        periodLeavePatchData[period.id] = q.data || [];
                        mapLeaveRows(q.data);
                    }
                }
                renderSchedule();
            } catch (error) {
                console.warn("Flexible leave load failed:", error);
            }
            return result;
        };
    }

    /* New compact schedule-code selector with full-day VL / PL / TDL choices. */
    createScheduleSelect = function (profile, dateKey, currentValue, currentWorkSite, cell) {
        const select = document.createElement("select");
        select.className = "schedule-select";
        FLEX_CODES.forEach(code => {
            const option = document.createElement("option");
            option.value = code;
            option.textContent = code;
            option.selected = code === currentValue;
            select.appendChild(option);
        });

        select.addEventListener("change", async function () {
            const originalValue = currentValue;
            const selectedValue = select.value;
            let newWorkSite = null;

            if (selectedValue === "12") {
                newWorkSite = currentWorkSite || profile.clinic_site;
                if (!newWorkSite) {
                    alert("This employee needs a primary clinic before a 12-hour shift can be scheduled.");
                    select.value = originalValue;
                    return;
                }
                if (originalValue !== "12") {
                    const allowed = await confirmCapacityFor12Shift(profile, dateKey, newWorkSite);
                    if (!allowed) { select.value = originalValue; return; }
                }
            }

            if (["VL", "PL", "TDL"].includes(selectedValue) && totalLeave(profile.id, dateKey) === 0) {
                const ok = await saveLeave(
                    profile.id,
                    dateKey,
                    selectedValue === "VL" ? 12 : 0,
                    selectedValue === "PL" ? 12 : 0,
                    selectedValue === "TDL" ? 12 : 0
                );
                if (!ok) { select.value = originalValue; return; }
            }

            select.disabled = true;
            cell.classList.add("saving");
            const success = await saveScheduleValue(profile.id, dateKey, selectedValue, newWorkSite);
            if (!success) {
                select.value = originalValue;
                select.disabled = false;
                cell.classList.remove("saving");
                return;
            }
            if (!scheduleData[profile.id]) scheduleData[profile.id] = {};
            scheduleData[profile.id][dateKey] = {
                code: selectedValue,
                work_site: selectedValue === "12" ? newWorkSite : null
            };
            renderSchedule();
        });
        return select;
    };

    const originalEditableCell = renderEditableScheduleCell;
    renderEditableScheduleCell = function (cell, profile, dateKey, currentValue, currentWorkSite) {
        originalEditableCell(cell, profile, dateKey, currentValue, currentWorkSite);
        addLeaveBadge(cell, profile, dateKey, true);
    };

    /* Leave fills the unpaid part of a day; total credited hours are capped at 12. */
    calculateWeeklyHours = function (userId) {
        let vacation = 0, otherLeave = 0, total = 0, worked = 0, tdl = 0, professionalLeave = 0;
        getWeekDates().forEach(date => {
            const dateKey = getDateKey(date);
            const code = getScheduleValue(userId, dateKey);
            const l = getLeave(userId, dateKey);
            const leaveHours = Number(l.vacation || 0) + Number(l.professional || 0) + Number(l.tdl || 0);
            let workedHours = 0;
            if (code === "12") workedHours = Math.max(0, 12 - leaveHours);
            else if (code === "A4") workedHours = 4;
            vacation += Number(l.vacation || 0);
            professionalLeave += Number(l.professional || 0);
            tdl += Number(l.tdl || 0);
            otherLeave += Number(l.professional || 0) + Number(l.tdl || 0);
            worked += workedHours;
            total += Math.min(12, workedHours + leaveHours);
        });
        return { vacation, professionalLeave, tdl, otherLeave, worked, total };
    };

    /* A completely leave-covered 12-hour day does not consume clinic capacity. */
    getScheduled12Count = function (clinicSite, dateKey, excludeUserId = null) {
        let scheduled = 0;
        getActiveProfiles().forEach(profile => {
            if (excludeUserId && profile.id === excludeUserId) return;
            const entry = getScheduleEntry(profile.id, dateKey);
            if (entry.code !== "12" || totalLeave(profile.id, dateKey) >= 12) return;
            const actualSite = entry.work_site || profile.clinic_site || null;
            if (actualSite === clinicSite) scheduled++;
        });
        return scheduled;
    };

    /* Remove Weekend Month from the weekly tables and add leave badges to read-only cells. */
    function compactTablesAndAddBadges() {
        [["turflandHeader", "turflandBody", "Turfland"], ["fountainHeader", "fountainBody", "Fountain Court"]]
            .forEach(([headerId, bodyId, clinic]) => {
                const headerRow = document.querySelector(`#${headerId} tr`);
                const body = document.getElementById(bodyId);
                if (!headerRow || !body) return;
                const headers = Array.from(headerRow.children);
                const weekendIndex = headers.findIndex(th => th.textContent.replace(/\s/g, "").includes("WeekendMonth"));
                if (weekendIndex >= 0) {
                    headers[weekendIndex].remove();
                    Array.from(body.rows).forEach(row => {
                        if (row.cells[weekendIndex]) row.cells[weekendIndex].remove();
                    });
                }

                const clinicProfiles = profiles.filter(p => p.active && p.clinic_site === clinic);
                clinicProfiles.forEach((profile, rowIndex) => {
                    const row = body.rows[rowIndex];
                    if (!row) return;
                    getWeekDates().forEach((date, dayIndex) => {
                        const cell = row.cells[dayIndex + 1];
                        if (!cell) return;
                        addLeaveBadge(cell, profile, getDateKey(date), canEditProfile(profile));
                    });
                });
            });
    }

    /* Auto-switch quarter, compact layout, and leave badge post-processing. */
    function syncQuarterSelectionToCurrentWeekPatch() {
        if (!Array.isArray(allSchedulingPeriods) || !allSchedulingPeriods.length || !currentWeekStart) return;
        const weekStart = getDateKey(currentWeekStart);
        const weekEndDate = new Date(currentWeekStart);
        weekEndDate.setDate(weekEndDate.getDate() + 6);
        const weekEnd = getDateKey(weekEndDate);
        const matchingPeriod = allSchedulingPeriods.find(period => period && period.active && weekStart <= period.period_end && weekEnd >= period.period_start);
        if (!matchingPeriod) return;
        viewSchedulingPeriodId = matchingPeriod.id;
        const monthKeys = getPeriodMonthKeys(matchingPeriod);
        const assignedMonth = getAssignedMonthKeyForWeekDate(currentWeekStart);
        if (monthKeys.includes(assignedMonth)) viewMonthKey = assignedMonth;
        else if (!viewMonthKey || !monthKeys.includes(viewMonthKey)) viewMonthKey = monthKeys[0] || null;
    }

    if (typeof renderSchedule === "function") {
        const originalRenderSchedule = renderSchedule;
        renderSchedule = function (...args) {
            try { syncQuarterSelectionToCurrentWeekPatch(); } catch (e) { console.warn(e); }
            const result = originalRenderSchedule.apply(this, args);
            compactTablesAndAddBadges();
            return result;
        };
    }

    /* Full-week leave: VL + PL + TDL must equal exactly 40 hours; no A4/work remains. */
    async function applyFullWeekLeavePlan() {
        if (!currentUser || !currentProfile || currentProfile.role === "admin") return;
        const vl = Number(prompt("Full-week Vacation hours (whole hours):", "0"));
        if (Number.isNaN(vl)) return;
        const pl = Number(prompt("Full-week Professional Leave hours (whole hours):", "0"));
        if (Number.isNaN(pl)) return;
        const tdl = Number(prompt("Full-week TDL hours (whole hours):", "0"));
        if (Number.isNaN(tdl)) return;
        if ([vl, pl, tdl].some(v => !Number.isInteger(v) || v < 0 || v > 40)) {
            showError("Full-week leave must use whole-hour amounts."); return;
        }
        if (vl + pl + tdl !== 40) {
            showError(`Full-week leave must total exactly 40 hours. Current total: ${vl + pl + tdl}.`); return;
        }
        if (!confirm(`Replace this entire week with leave?\n\nVacation: ${vl}\nProfessional Leave: ${pl}\nTDL: ${tdl}\nTotal: 40`)) return;

        const dates = getWeekDates();
        const ordered = [...dates.slice(1), dates[0]];
        const plans = ordered.map(date => ({ dateKey: getDateKey(date), vacation: 0, professional: 0, tdl: 0, code: "0" }));
        let index = 0;
        function allocate(type, amount, code) {
            let remaining = amount;
            while (remaining > 0) {
                const chunk = Math.min(12, remaining);
                plans[index][type] = chunk;
                plans[index].code = code;
                remaining -= chunk;
                index++;
            }
        }
        allocate("vacation", vl, "VL"); allocate("professional", pl, "PL"); allocate("tdl", tdl, "TDL");

        const scheduleRows = dates.map(date => {
            const dateKey = getDateKey(date);
            const plan = plans.find(p => p.dateKey === dateKey);
            return { user_id: currentUser.id, schedule_date: dateKey, schedule_code: plan ? plan.code : "0", work_site: null, updated_at: new Date().toISOString() };
        });
        const leaveRows = dates.map(date => {
            const dateKey = getDateKey(date);
            const plan = plans.find(p => p.dateKey === dateKey);
            return {
                user_id: currentUser.id, leave_date: dateKey,
                vacation_hours: plan ? plan.vacation : 0,
                professional_leave_hours: plan ? plan.professional : 0,
                tdl_hours: plan ? plan.tdl : 0,
                updated_at: new Date().toISOString()
            };
        });

        const [s, l] = await Promise.all([
            supabaseClient.from("schedules").upsert(scheduleRows, { onConflict: "user_id,schedule_date" }),
            supabaseClient.from("schedule_leave_hours").upsert(leaveRows, { onConflict: "user_id,leave_date" })
        ]);
        if (s.error || l.error) {
            showError("Full-week leave could not be saved: " + (s.error ? s.error.message : l.error.message)); return;
        }
        await markCurrentUserNeedsResubmission();
        await loadWeek();
    }

    /* Exclude admins from submission counts and add Full Week Leave action. */
    if (typeof renderWorkflowPanel === "function") {
        const originalRenderWorkflowPanel = renderWorkflowPanel;
        renderWorkflowPanel = function (...args) {
            const originalProfiles = profiles;
            try {
                profiles = originalProfiles.filter(profile => profile && profile.role !== "admin");
                originalRenderWorkflowPanel.apply(this, args);
            } finally {
                profiles = originalProfiles;
            }

            const actions = document.querySelector("#workflowPanel .workflow-actions");
            if (actions && currentProfile && currentProfile.role !== "admin" && !currentWeekLocked && !document.getElementById("fullWeekLeaveButton")) {
                const button = document.createElement("button");
                button.id = "fullWeekLeaveButton";
                button.className = "workflow-button";
                button.type = "button";
                button.textContent = "Full Week Leave";
                button.onclick = applyFullWeekLeavePlan;
                actions.appendChild(button);
            }
        };
    }

    /* Weekend worked-date count: a 12-hour day fully covered by leave is not worked. */
    if (typeof getWeekendDateCountForUser === "function") {
        getWeekendDateCountForUser = function (userId, monthKey, period = activeSchedulingPeriod) {
            const profile = profiles.find(item => item.id === userId);
            if (!profile || profile.clinic_site !== "Turfland" || !period) return 0;
            const leaveRows = periodLeavePatchData[period.id] || [];
            const rows = getWeekendRowsForPeriod(period);
            return rows.filter(row => {
                if (row.user_id !== userId || row.schedule_code !== "12") return false;
                const date = getDateFromKey(row.schedule_date);
                if (date.getDay() !== 0 && date.getDay() !== 6) return false;
                const l = leaveRows.find(x => x.user_id === userId && x.leave_date === row.schedule_date);
                const leaveHours = l ? Number(l.vacation_hours || 0) + Number(l.professional_leave_hours || 0) + Number(l.tdl_hours || 0) : 0;
                return leaveHours < 12 && getAssignedMonthKeyForWeekDate(date) === monthKey;
            }).length;
        };
    }

    injectStyles();
})();
