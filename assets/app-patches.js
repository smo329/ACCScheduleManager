/*
 * ACC Schedule Manager - Post-load patches
 * Loaded after the modular application scripts.
 */
(function () {
    "use strict";

    const PATCH_VERSION = "2026.08.14.6";
    // Flexible worked hours: the cell control is a text input with a
    // datalist of common values (whole hours, 12, A4) that also accepts
    // typed quarter-hour values such as 0.5 or 7.5. Leave codes
    // (VL/PL/TDL) are no longer schedule codes: leave is entered with
    // the + Leave button below the cell.
    const LEAVE_CODES = ["VL", "PL", "TDL"];

    // What a schedule code is shown as in the UI. The stored code stays
    // "A4" (all hour-counting code maps A4 to 4); only the label changes.
    function displayCode(code) {
        return code === "A4" ? "Admin" : code;
    }

    // Worked hours a schedule code represents, or null if it is not a
    // worked-hours code (legacy leave codes return null).
    function parseWorkedHours(code) {
        if (code === "A4") return 4;
        if (code === "12") return 12;
        if (typeof code !== "string" || code.trim() === "") return null;
        const n = Number(code);
        if (!Number.isFinite(n) || n < 0 || n > 12) return null;
        if (Math.abs(n * 4 - Math.round(n * 4)) > 0.000001) return null;
        return Math.round(n * 100) / 100;
    }

    // Worked hours credited for a day, after leave. A 12-hour shift is
    // reduced by leave taken that day; a partial shift (including A4)
    // keeps its hours and leave tops the day up to 12.
    function workedHoursForCode(code, leaveHours) {
        if (code === "12") return Math.max(0, 12 - Number(leaveHours || 0));
        const parsed = parseWorkedHours(code);
        return parsed === null ? 0 : parsed;
    }

    function leaveTypesFor(userId, dateKey) {
        const l = getLeave(userId, dateKey);
        const types = [];
        if (l.vacation > 0) types.push({ code: "VL", hours: l.vacation });
        if (l.professional > 0) types.push({ code: "PL", hours: l.professional });
        if (l.tdl > 0) types.push({ code: "TDL", hours: l.tdl });
        return types;
    }

    // "VL", or "VL \u00b7 PL" when more than one leave type was entered.
    function leaveDisplayFor(userId, dateKey) {
        const types = leaveTypesFor(userId, dateKey);
        if (!types.length) return null;
        return types.map(t => t.code).join(" \u00b7 ");
    }


    let leavePatchData = {};
    let periodLeavePatchData = {};

    console.info(`[ACC Schedule Manager] patches loaded: ${PATCH_VERSION}`);

    function leaveKey(userId, dateKey) {
        return `${userId}_${dateKey}`;
    }

    function getLeave(userId, dateKey) {
        return leavePatchData[leaveKey(userId, dateKey)] || {
            vacation: 0,
            professional: 0,
            tdl: 0
        };
    }

    function totalLeave(userId, dateKey) {
        const l = getLeave(userId, dateKey);
        return Number(l.vacation || 0) +
            Number(l.professional || 0) +
            Number(l.tdl || 0);
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

        const worked = parseWorkedHours(scheduleCode);
        const adminPiece = (typeof window.getAdminHours === "function" ? window.getAdminHours(userId, dateKey) : 0);
        const effectiveWorked = (worked === null ? 0 : worked) + adminPiece;
        if (scheduleCode !== "12" && leaveHours > 12 - effectiveWorked) {
            showError(`Worked hours plus Admin plus leave cannot exceed 12 credited hours for the day. Maximum leave here is ${12 - effectiveWorked} hours.`);
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
            }, {
                onConflict: "user_id,leave_date"
            });

        if (error) {
            console.error(error);
            showError("Leave hours could not be saved: " + error.message);
            return false;
        }

        leavePatchData[leaveKey(userId, dateKey)] = {
            vacation: values[0],
            professional: values[1],
            tdl: values[2]
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

        overlay.querySelector("#flexLeaveTitle").textContent =
            `${getProfileName(profile)} — ${dateKey}`;

        vl.value = l.vacation;
        pl.value = l.professional;
        tdl.value = l.tdl;

        const update = () => {
            const sum = Number(vl.value || 0) +
                Number(pl.value || 0) +
                Number(tdl.value || 0);
            total.textContent = `Leave entered: ${sum} / 12 hours`;
        };

        [vl, pl, tdl].forEach(input => input.oninput = update);
        update();

        overlay.querySelector("#flexLeaveCancel").onclick =
            () => overlay.classList.remove("show");

        overlay.querySelector("#flexLeaveSave").onclick = async () => {
            if (await saveLeave(
                profile.id,
                dateKey,
                vl.value,
                pl.value,
                tdl.value
            )) {
                overlay.classList.remove("show");
                renderSchedule();
            }
        };

        overlay.classList.add("show");
    }

    function addLeaveBadge(cell, profile, dateKey, canEdit) {
        // Shift Capacity and Shift Availability are not people: they
        // never get a + Leave button (or + Admin, below).
        if (!cell.classList.contains("schedule-cell")) return;
        const badgeRow = cell.closest ? cell.closest("tr") : null;
        if (badgeRow && (badgeRow.classList.contains("capacity-row") || badgeRow.classList.contains("availability-row"))) return;
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

    // + Admin button under the cell, next to + Leave. On an A4 day
    // it toggles that code back to 0; on a numeric day it toggles a
    // separate 4-hour Admin piece in schedule_admin_hours, so worked
    // hours are kept and Admin is added on top of them.
    function addAdminButton(cell, profile, dateKey, currentValue) {
        if (!cell.classList.contains("schedule-cell")) return;
        const adminRow = cell.closest ? cell.closest("tr") : null;
        if (adminRow && (adminRow.classList.contains("capacity-row") || adminRow.classList.contains("availability-row"))) return;
        if (cell.querySelector(".flex-admin-button")) return;

        // A4 days keep their old behaviour (Admin is the whole day,
        // clicking toggles back to 0). On numeric days the button
        // toggles a separate 4-hour Admin piece, so 8 worked hours
        // plus Admin stays 8 worked plus Admin, totalling 12,
        // instead of the 8 being replaced.
        const adminPiece = (typeof window.getAdminHours === "function" ? window.getAdminHours(profile.id, dateKey) : 0);
        const isLegacyAdminDay = currentValue === "A4";
        const isAdminDay = isLegacyAdminDay || adminPiece > 0;
        const button = document.createElement("button");
        button.className = "flex-admin-button" + (isAdminDay ? " is-admin" : "");
        button.type = "button";
        button.textContent = isAdminDay ? "Admin \u2713" : "+ Admin";
        button.title = isAdminDay
            ? "Admin time is set for this day. Click to remove it."
            : "Add 4-hour Admin time to this day, on top of its worked hours.";

        button.onclick = async event => {
            event.stopPropagation();
            if (isLegacyAdminDay) {
                button.disabled = true;
                cell.classList.add("saving");
                const success = await saveScheduleValue(profile.id, dateKey, "0", null);
                if (!success) {
                    button.disabled = false;
                    cell.classList.remove("saving");
                    return;
                }
                if (!scheduleData[profile.id]) {
                    scheduleData[profile.id] = {};
                }
                scheduleData[profile.id][dateKey] = { code: "0", work_site: null };
                renderSchedule();
                return;
            }
            if (adminPiece > 0) {
                button.disabled = true;
                cell.classList.add("saving");
                const ok = (typeof window.saveAdminHours === "function") ? await window.saveAdminHours(profile.id, dateKey, 0) : false;
                button.disabled = false;
                cell.classList.remove("saving");
                if (!ok) return;
                renderSchedule();
                return;
            }
            const worked = parseWorkedHours(currentValue) || 0;
            const leave = totalLeave(profile.id, dateKey);
            if (worked + leave + 4 > 12) {
                showError(`Admin time cannot be added: ${worked} worked hours plus ${leave} leave hours already leave only ${Math.max(0, 12 - worked - leave)} hours before the 12-hour day cap.`);
                return;
            }
            button.disabled = true;
            cell.classList.add("saving");
            const ok = (typeof window.saveAdminHours === "function") ? await window.saveAdminHours(profile.id, dateKey, 4) : false;
            button.disabled = false;
            cell.classList.remove("saving");
            if (!ok) return;
            renderSchedule();
        };

        cell.appendChild(button);
    }

    function injectStyles() {
        if (document.getElementById("flexLeaveStyles")) return;

        const style = document.createElement("style");
        style.id = "flexLeaveStyles";
        style.textContent = `
            .flex-leave-badge{display:block;width:100%;margin-top:3px;padding:2px 3px;border:0;border-radius:4px;background:transparent;color:#64748b;font-size:10px;line-height:1.15;cursor:pointer;white-space:normal}
            .flex-leave-badge.has-leave{background:#fef3c7;color:#92400e;font-weight:700}
            #flexLeaveModal,#completeLeaveWeekModal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.55);z-index:4000}
            #flexLeaveModal.show,#completeLeaveWeekModal.show{display:flex}
            .flex-leave-card{width:min(520px,100%);background:#fff;border-radius:10px;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.2)}
            .flex-leave-card h3{margin:0 0 14px;color:#17365d}
            .flex-leave-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
            .flex-leave-grid label{font-size:12px;font-weight:700;color:#475569}
            .flex-leave-grid input,.flex-leave-grid select{width:100%;margin-top:5px;padding:8px;border:1px solid #cbd5e1;border-radius:6px;background:#fff}
            .flex-leave-total{margin-top:12px;font-weight:700;color:#475569}
            .flex-leave-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
            .leave-week-warning{display:inline-flex;align-items:center;gap:8px;padding:4px 8px;border-radius:6px;background:#fef3c7;color:#92400e;font-weight:700;font-size:12px}
            .leave-week-warning button{border:1px solid #d97706;background:#fff7ed;color:#9a3412;border-radius:5px;padding:3px 7px;cursor:pointer;font-weight:700}
            .schedule-cell{min-width:66px!important}.hours-column,.hours-cell{min-width:62px!important;width:62px!important}
            .schedule-hours-input{width:100%;text-align:center}.schedule-leave-display,.schedule-leave-value{background:#fef3c7!important;color:#92400e!important;font-weight:700}
            .flex-admin-button{display:block;width:100%;margin-top:3px;padding:2px 3px;border:0;border-radius:4px;background:transparent;color:#64748b;font-size:10px;line-height:1.15;cursor:pointer}.flex-admin-button.is-admin{background:#dbeafe;color:#1e40af;font-weight:700}.schedule-admin-value{background:#dbeafe!important;color:#1e40af!important;font-weight:700}
            @media(max-width:650px){.flex-leave-grid{grid-template-columns:1fr}}
        `;
        document.head.appendChild(style);
    }

    function getWeekLeaveStats(userId) {
        let leaveHours = 0;
        let fullLeaveCodeDays = 0;
        let workedOrAdminHours = 0;

        getWeekDates().forEach(date => {
            const dateKey = getDateKey(date);
            const code = getScheduleValue(userId, dateKey);
            const dayLeave = totalLeave(userId, dateKey);

            leaveHours += dayLeave;

            if (
                ["VL", "PL", "TDL"].includes(code) ||
                (parseWorkedHours(code) === 0 && dayLeave > 0)
            ) {
                fullLeaveCodeDays++;
            }

            workedOrAdminHours += workedHoursForCode(code, dayLeave);
        });

        const looksLikeFullLeaveWeek =
            fullLeaveCodeDays >= 3 &&
            workedOrAdminHours === 0 &&
            leaveHours > 0;

        return {
            leaveHours,
            fullLeaveCodeDays,
            workedOrAdminHours,
            looksLikeFullLeaveWeek,
            remaining: Math.max(0, 40 - leaveHours)
        };
    }

    function ensureCompleteLeaveWeekModal() {
        let overlay = document.getElementById("completeLeaveWeekModal");
        if (overlay) return overlay;

        overlay = document.createElement("div");
        overlay.id = "completeLeaveWeekModal";
        overlay.innerHTML = `
            <div class="flex-leave-card">
                <h3>Complete Full-Week Leave</h3>
                <p id="completeLeaveWeekText" style="margin:0 0 14px;color:#475569;"></p>
                <div class="flex-leave-grid" style="grid-template-columns:1fr;">
                    <label>
                        Leave type for remaining hours
                        <select id="completeLeaveWeekType">
                            <option value="VL">Vacation</option>
                            <option value="PL">Professional Leave</option>
                            <option value="TDL">TDL</option>
                        </select>
                    </label>
                </div>
                <div class="flex-leave-actions">
                    <button id="completeLeaveWeekCancel" class="modal-button cancel-button" type="button">Cancel</button>
                    <button id="completeLeaveWeekSave" class="modal-button save-button" type="button">Add Remaining Hours</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        return overlay;
    }

    async function completeLeaveWeek() {
        if (!currentUser) return;

        const stats = getWeekLeaveStats(currentUser.id);

        if (!stats.looksLikeFullLeaveWeek || stats.remaining <= 0) {
            return;
        }

        const overlay = ensureCompleteLeaveWeekModal();
        const typeSelect = overlay.querySelector("#completeLeaveWeekType");
        const text = overlay.querySelector("#completeLeaveWeekText");

        text.textContent =
            `You currently have ${stats.leaveHours} leave hours. A full leave week requires 40, so ${stats.remaining} more hour${stats.remaining === 1 ? "" : "s"} must be added.`;

        overlay.querySelector("#completeLeaveWeekCancel").onclick =
            () => overlay.classList.remove("show");

        overlay.querySelector("#completeLeaveWeekSave").onclick = async () => {
            let remaining = stats.remaining;
            const type = typeSelect.value;

            const candidateDates = getWeekDates()
                .map(date => getDateKey(date))
                .filter(dateKey => totalLeave(currentUser.id, dateKey) < 12);

            for (const dateKey of candidateDates) {
                if (remaining <= 0) break;

                const current = getLeave(currentUser.id, dateKey);
                const available = 12 - totalLeave(currentUser.id, dateKey);
                const chunk = Math.min(available, remaining);

                if (chunk <= 0) continue;

                const next = {
                    vacation: current.vacation,
                    professional: current.professional,
                    tdl: current.tdl
                };

                if (type === "VL") next.vacation += chunk;
                if (type === "PL") next.professional += chunk;
                if (type === "TDL") next.tdl += chunk;

                const ok = await saveLeave(
                    currentUser.id,
                    dateKey,
                    next.vacation,
                    next.professional,
                    next.tdl
                );

                if (!ok) return;

                if (getScheduleValue(currentUser.id, dateKey) === "0") {
                    const okSchedule = await saveScheduleValue(
                        currentUser.id,
                        dateKey,
                        type,
                        null
                    );

                    if (!okSchedule) return;

                    if (!scheduleData[currentUser.id]) {
                        scheduleData[currentUser.id] = {};
                    }

                    scheduleData[currentUser.id][dateKey] = {
                        code: type,
                        work_site: null
                    };
                }

                remaining -= chunk;
            }

            overlay.classList.remove("show");

            if (remaining > 0) {
                showError(
                    `Could not place all remaining leave hours. ${remaining} hour${remaining === 1 ? "" : "s"} still need to be entered.`
                );
                return;
            }

            await loadWeek();
        };

        overlay.classList.add("show");
    }

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

                if (!error) {
                    mapLeaveRows(data);
                } else {
                    console.warn("Leave hours unavailable; run the leave migration.", error);
                }

                periodLeavePatchData = {};

                const periods = [activeSchedulingPeriod, adminSchedulingPeriod]
                    .filter((p, i, a) =>
                        p && a.findIndex(x => x && x.id === p.id) === i
                    );

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

    createScheduleSelect = function (
        profile,
        dateKey,
        currentValue,
        currentWorkSite,
        cell
    ) {
        const input = document.createElement("input");
        input.className = "schedule-select schedule-hours-input";
        input.setAttribute("inputmode", "decimal");
        input.setAttribute("autocomplete", "off");
        input.setAttribute("placeholder", "Type hours");
        input.spellcheck = false;

        // A day with no worked hours but leave entered below the cell
        // displays as its leave type (e.g. VL) instead of just 0, so it
        // is visible at a glance that leave was entered for that date.
        const isZero = currentValue === "0" || parseWorkedHours(currentValue) === 0;
        const leaveDisplay = isZero ? leaveDisplayFor(profile.id, dateKey) : null;
        const displayValue = leaveDisplay || (isZero ? "" : displayCode(currentValue));
        input.value = displayValue;

        if (leaveDisplay) {
            input.classList.add("schedule-leave-display");
            input.title = `Leave entered: ${leaveSummary(profile.id, dateKey)} \u2014 type hours to change worked hours, or edit leave with + Leave below.`;
        } else {
            input.title = "Type worked hours (0\u201312, quarter-hour steps, e.g. 7.5). Admin time is set with + Admin below. Leave is entered with + Leave below.";
        }

        const revert = () => { input.value = displayValue; };

        input.addEventListener("change", async function () {
            const raw = input.value.trim().toUpperCase();
            const originalValue = currentValue;

            // Leave codes are no longer schedule codes: leave is edited
            // with the + Leave button below the cell, not here.
            if (LEAVE_CODES.includes(raw)) {
                if (raw !== leaveDisplay) {
                    showError("Leave is entered with + Leave below the cell \u2014 the hours box no longer takes VL, PL or TDL.");
                }
                revert();
                return;
            }

            // A blank box means 0 hours, not an error. This is
            // how a 0 day is entered now that 0 days display blank.
            if (raw === "") {
                if (originalValue === "0" || parseWorkedHours(originalValue) === 0) {
                    revert();
                    return;
                }
                selectedValue = "0";
            } else if (raw === "A4" || raw === "ADMIN") {
                // On a worked day, typing Admin adds the separate
                // Admin piece instead of replacing the worked hours.
                const workedNow = parseWorkedHours(originalValue);
                if (workedNow !== null && workedNow > 0 && originalValue !== "A4") {
                    const adminNow = (typeof window.getAdminHours === "function" ? window.getAdminHours(profile.id, dateKey) : 0);
                    const leaveNow = totalLeave(profile.id, dateKey);
                    if (workedNow + leaveNow + 4 > 12) {
                        showError(`Admin time cannot be added: ${workedNow} worked hours plus ${leaveNow} leave hours already leave only ${Math.max(0, 12 - workedNow - leaveNow)} hours before the 12-hour day cap.`);
                        revert();
                        return;
                    }
                    input.disabled = true;
                    cell.classList.add("saving");
                    const ok = (typeof window.saveAdminHours === "function") ? await window.saveAdminHours(profile.id, dateKey, 4) : false;
                    input.disabled = false;
                    cell.classList.remove("saving");
                    if (!ok) { showError("Admin time could not be saved."); revert(); return; }
                    renderSchedule();
                    return;
                }
                selectedValue = "A4";
            } else {
                const hours = parseWorkedHours(raw);
                if (hours === null) {
                    showError("Enter hours from 0 to 12, in quarter-hour steps (for example 0.5, 2.25 or 7.5). Admin time is set with + Admin below.");
                    revert();
                    return;
                }
                selectedValue = String(hours);
            }

            if (selectedValue === originalValue) {
                revert();
                return;
            }

            let newWorkSite = null;

            if (selectedValue === "12") {
                newWorkSite = currentWorkSite || profile.clinic_site;

                if (!newWorkSite) {
                    alert("This employee needs a primary clinic before a 12-hour shift can be scheduled.");
                    revert();
                    return;
                }

                if (originalValue !== "12") {
                    const allowed = await confirmCapacityFor12Shift(
                        profile,
                        dateKey,
                        newWorkSite
                    );

                    if (!allowed) {
                        revert();
                        return;
                    }
                }
            }

            input.disabled = true;
            cell.classList.add("saving");

            const success = await saveScheduleValue(
                profile.id,
                dateKey,
                selectedValue,
                newWorkSite
            );

            if (!success) {
                input.value = originalValue;
                input.disabled = false;
                cell.classList.remove("saving");
                return;
            }

            if (!scheduleData[profile.id]) {
                scheduleData[profile.id] = {};
            }

            scheduleData[profile.id][dateKey] = {
                code: selectedValue,
                work_site: selectedValue === "12" ? newWorkSite : null
            };

            renderSchedule();
        });

        return input;
    };

    const originalEditableCell = renderEditableScheduleCell;

    renderEditableScheduleCell = function (
        cell,
        profile,
        dateKey,
        currentValue,
        currentWorkSite
    ) {
        originalEditableCell(
            cell,
            profile,
            dateKey,
            currentValue,
            currentWorkSite
        );

        addLeaveBadge(cell, profile, dateKey, true);
        addAdminButton(cell, profile, dateKey, currentValue);
    };

    calculateWeeklyHours = function (userId) {
        let vacation = 0;
        let otherLeave = 0;
        let total = 0;
        let worked = 0;
        let tdl = 0;
        let professionalLeave = 0;

        getWeekDates().forEach(date => {
            const dateKey = getDateKey(date);
            const code = getScheduleValue(userId, dateKey);
            const l = getLeave(userId, dateKey);

            const leaveHours =
                Number(l.vacation || 0) +
                Number(l.professional || 0) +
                Number(l.tdl || 0);

            const adminPiece = (typeof window.getAdminHours === "function" ? window.getAdminHours(userId, dateKey) : 0);
            const workedHours = workedHoursForCode(code, leaveHours) + adminPiece;

            vacation += Number(l.vacation || 0);
            professionalLeave += Number(l.professional || 0);
            tdl += Number(l.tdl || 0);
            otherLeave +=
                Number(l.professional || 0) +
                Number(l.tdl || 0);

            worked += workedHours;
            total += Math.min(12, workedHours + leaveHours);
        });

        return {
            vacation,
            professionalLeave,
            tdl,
            otherLeave,
            worked,
            total
        };
    };

    getScheduled12Count = function (
        clinicSite,
        dateKey,
        excludeUserId = null
    ) {
        let scheduled = 0;

        getActiveProfiles().forEach(profile => {
            if (excludeUserId && profile.id === excludeUserId) return;

            const entry = getScheduleEntry(profile.id, dateKey);

            if (
                entry.code !== "12" ||
                totalLeave(profile.id, dateKey) >= 12
            ) {
                return;
            }

            const actualSite =
                entry.work_site ||
                profile.clinic_site ||
                null;

            if (actualSite === clinicSite) {
                scheduled++;
            }
        });

        return scheduled;
    };

    function compactTablesAndAddBadges() {
        [
            ["turflandHeader", "turflandBody", "Turfland"],
            ["fountainHeader", "fountainBody", "Fountain Court"]
        ].forEach(([headerId, bodyId, clinic]) => {
            const headerRow = document.querySelector(`#${headerId} tr`);
            const body = document.getElementById(bodyId);

            if (!headerRow || !body) return;

            const headers = Array.from(headerRow.children);
            const weekendIndex = headers.findIndex(th =>
                th.textContent.replace(/\s/g, "").includes("WeekendMonth")
            );

            if (weekendIndex >= 0) {
                headers[weekendIndex].remove();

                Array.from(body.rows).forEach(row => {
                    if (row.cells[weekendIndex]) {
                        row.cells[weekendIndex].remove();
                    }
                });
            }

            const clinicProfiles = profiles.filter(
                p => p.active && p.clinic_site === clinic
            );

            clinicProfiles.forEach((profile, rowIndex) => {
                const row = body.rows[rowIndex];
                if (!row) return;

                getWeekDates().forEach((date, dayIndex) => {
                    const cell = row.cells[dayIndex + 1];
                    if (!cell) return;

                    addLeaveBadge(
                        cell,
                        profile,
                        getDateKey(date),
                        canEditProfile(profile)
                    );

                    // Read-only cells show the stored code as plain text;
                    // a 0 day with leave entered shows its leave type
                    // instead of just 0. Editable cells are handled by
                    // createScheduleSelect, which shows the same display
                    // in the hours box.
                    if (!cell.querySelector("input.schedule-hours-input")) {
                        const stored = getScheduleValue(profile.id, getDateKey(date));
                        if (stored === "A4") {
                            const adminSpan = Array.from(cell.querySelectorAll("span"))
                                .find(el => el.textContent === stored);
                            if (adminSpan) {
                                adminSpan.textContent = "Admin";
                                adminSpan.classList.add("schedule-admin-value");
                            }
                        }
                        const adminPieceLocked = (typeof window.getAdminHours === "function" ? window.getAdminHours(profile.id, getDateKey(date)) : 0);
                        if (adminPieceLocked > 0 && stored !== "A4") {
                            const span = Array.from(cell.querySelectorAll("span"))
                                .find(el => el.textContent === stored);
                            if (span) {
                                span.textContent = `${stored} + Admin`;
                                span.classList.add("schedule-admin-value");
                            }
                        }
                        const isZero = stored === "0" || parseWorkedHours(stored) === 0;
                        const display = isZero ? leaveDisplayFor(profile.id, getDateKey(date)) : null;
                        if (display) {
                            const span = Array.from(cell.querySelectorAll("span"))
                                .find(el => el.textContent === stored);
                            if (span) {
                                span.textContent = display;
                                span.classList.add("schedule-leave-value");
                                span.title = `Leave entered: ${leaveSummary(profile.id, getDateKey(date))}`;
                            }
                        }
                    }
                });
            });
        });
    }

    function syncQuarterSelectionToCurrentWeekPatch() {
        if (
            !Array.isArray(allSchedulingPeriods) ||
            !allSchedulingPeriods.length ||
            !currentWeekStart
        ) {
            return;
        }

        const weekStart = getDateKey(currentWeekStart);
        const weekEndDate = new Date(currentWeekStart);
        weekEndDate.setDate(weekEndDate.getDate() + 6);
        const weekEnd = getDateKey(weekEndDate);

        const matchingPeriod = allSchedulingPeriods.find(
            period =>
                period &&
                period.active &&
                weekStart <= period.period_end &&
                weekEnd >= period.period_start
        );

        if (!matchingPeriod) return;

        viewSchedulingPeriodId = matchingPeriod.id;

        const monthKeys = getPeriodMonthKeys(matchingPeriod);
        const assignedMonth = getAssignedMonthKeyForWeekDate(currentWeekStart);

        if (monthKeys.includes(assignedMonth)) {
            viewMonthKey = assignedMonth;
        } else if (!viewMonthKey || !monthKeys.includes(viewMonthKey)) {
            viewMonthKey = monthKeys[0] || null;
        }
    }

    if (typeof renderSchedule === "function") {
        const originalRenderSchedule = renderSchedule;

        renderSchedule = function (...args) {
            try {
                syncQuarterSelectionToCurrentWeekPatch();
            } catch (error) {
                console.warn(error);
            }

            const result = originalRenderSchedule.apply(this, args);
            compactTablesAndAddBadges();
            return result;
        };
    }

    async function applyFullWeekLeavePlan() {
        if (
            !currentUser ||
            !currentProfile ||
            currentProfile.role === "admin"
        ) {
            return;
        }

        const vl = Number(prompt(
            "Full-week Vacation hours (whole hours):",
            "0"
        ));
        if (Number.isNaN(vl)) return;

        const pl = Number(prompt(
            "Full-week Professional Leave hours (whole hours):",
            "0"
        ));
        if (Number.isNaN(pl)) return;

        const tdl = Number(prompt(
            "Full-week TDL hours (whole hours):",
            "0"
        ));
        if (Number.isNaN(tdl)) return;

        if (
            [vl, pl, tdl].some(
                v => !Number.isInteger(v) || v < 0 || v > 40
            )
        ) {
            showError("Full-week leave must use whole-hour amounts.");
            return;
        }

        if (vl + pl + tdl !== 40) {
            showError(
                `Full-week leave must total exactly 40 hours. Current total: ${vl + pl + tdl}.`
            );
            return;
        }

        if (!confirm(
            `Replace this entire week with leave?\n\nVacation: ${vl}\nProfessional Leave: ${pl}\nTDL: ${tdl}\nTotal: 40`
        )) {
            return;
        }

        const dates = getWeekDates();
        const ordered = [...dates.slice(1), dates[0]];

        const plans = ordered.map(date => ({
            dateKey: getDateKey(date),
            vacation: 0,
            professional: 0,
            tdl: 0,
            code: "0"
        }));

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

        allocate("vacation", vl, "VL");
        allocate("professional", pl, "PL");
        allocate("tdl", tdl, "TDL");

        const scheduleRows = dates.map(date => {
            const dateKey = getDateKey(date);
            const plan = plans.find(p => p.dateKey === dateKey);

            return {
                user_id: currentUser.id,
                schedule_date: dateKey,
                schedule_code: plan ? plan.code : "0",
                work_site: null,
                updated_at: new Date().toISOString()
            };
        });

        const leaveRows = dates.map(date => {
            const dateKey = getDateKey(date);
            const plan = plans.find(p => p.dateKey === dateKey);

            return {
                user_id: currentUser.id,
                leave_date: dateKey,
                vacation_hours: plan ? plan.vacation : 0,
                professional_leave_hours: plan ? plan.professional : 0,
                tdl_hours: plan ? plan.tdl : 0,
                updated_at: new Date().toISOString()
            };
        });

        const [scheduleResult, leaveResult] = await Promise.all([
            supabaseClient
                .from("schedules")
                .upsert(scheduleRows, {
                    onConflict: "user_id,schedule_date"
                }),

            supabaseClient
                .from("schedule_leave_hours")
                .upsert(leaveRows, {
                    onConflict: "user_id,leave_date"
                })
        ]);

        if (scheduleResult.error || leaveResult.error) {
            showError(
                "Full-week leave could not be saved: " +
                (
                    scheduleResult.error
                        ? scheduleResult.error.message
                        : leaveResult.error.message
                )
            );
            return;
        }

        await markCurrentUserNeedsResubmission();
        await loadWeek();
    }

    if (typeof renderWorkflowPanel === "function") {
        const originalRenderWorkflowPanel = renderWorkflowPanel;

        renderWorkflowPanel = function (...args) {
            const originalProfiles = profiles;

            try {
                profiles = originalProfiles.filter(
                    profile =>
                        profile &&
                        profile.role !== "admin"
                );

                originalRenderWorkflowPanel.apply(this, args);
            } finally {
                profiles = originalProfiles;
            }

            const actions = document.querySelector(
                "#workflowPanel .workflow-actions"
            );

            if (
                actions &&
                currentProfile &&
                currentProfile.role !== "admin" &&
                !currentWeekLocked &&
                !document.getElementById("fullWeekLeaveButton")
            ) {
                const button = document.createElement("button");
                button.id = "fullWeekLeaveButton";
                button.className = "workflow-button";
                button.type = "button";
                button.textContent = "Full Week Leave";
                button.onclick = applyFullWeekLeavePlan;
                actions.appendChild(button);
            }

            const left = document.querySelector(
                "#workflowPanel .workflow-left"
            );

            if (
                left &&
                currentUser &&
                currentProfile &&
                currentProfile.role !== "admin"
            ) {
                const stats = getWeekLeaveStats(currentUser.id);

                if (
                    stats.looksLikeFullLeaveWeek &&
                    stats.leaveHours < 40
                ) {
                    const warning = document.createElement("span");
                    warning.className = "leave-week-warning";
                    warning.innerHTML =
                        `<span>Full-week leave: ${stats.leaveHours}/40 (${stats.remaining} remaining)</span>`;

                    const fixButton = document.createElement("button");
                    fixButton.type = "button";
                    fixButton.textContent = `Add ${stats.remaining}h`;
                    fixButton.onclick = completeLeaveWeek;

                    warning.appendChild(fixButton);
                    left.appendChild(warning);
                }
            }
        };
    }

    if (typeof getWeekendDateCountForUser === "function") {
        getWeekendDateCountForUser = function (
            userId,
            monthKey,
            period = activeSchedulingPeriod
        ) {
            const profile = profiles.find(item => item.id === userId);

            if (
                !profile ||
                profile.clinic_site !== "Turfland" ||
                !period
            ) {
                return 0;
            }

            const leaveRows =
                periodLeavePatchData[period.id] ||
                [];

            const rows =
                getWeekendRowsForPeriod(period);

            return rows.filter(row => {
                if (
                    row.user_id !== userId ||
                    row.schedule_code !== "12"
                ) {
                    return false;
                }

                const date = getDateFromKey(row.schedule_date);

                if (
                    date.getDay() !== 0 &&
                    date.getDay() !== 6
                ) {
                    return false;
                }

                const l = leaveRows.find(
                    x =>
                        x.user_id === userId &&
                        x.leave_date === row.schedule_date
                );

                const leaveHours = l
                    ? Number(l.vacation_hours || 0) +
                      Number(l.professional_leave_hours || 0) +
                      Number(l.tdl_hours || 0)
                    : 0;

                return (
                    leaveHours < 12 &&
                    getAssignedMonthKeyForWeekDate(date) === monthKey
                );
            }).length;
        };
    }

    injectStyles();
})();
