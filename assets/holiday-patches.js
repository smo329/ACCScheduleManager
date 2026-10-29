/* ============================================================================
 * ACC Schedule Manager - Holiday groups (Turfland)
 * Loaded last, after the core scripts and the other patches.
 *
 * Settled rules (Skyler, Oct 29 2026):
 *   * 6 Turfland groups x 4 holidays each. Groups are Turfland-only, but the
 *     history view covers Fountain Court too (from actual schedules).
 *   * Rotation every Jan 1: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 1.
 *   * Assignment determines work BEFORE scheduling. Official holiday =
 *     8-hour shift + 4 hours leave; non-official = straight 12-hour shift.
 *   * Holiday trades are 1:1 swaps for one year.
 *   * Assigned holidays are pre-filled (real schedules + leave rows, written
 *     by the apply RPC) and LOCKED. The lock below keys off the prefill
 *     records: a cell with a prefill record renders locked and refuses
 *     grid saves. The database triggers are the backstop for every other
 *     write path (leave editor, known leave); they reject with the same
 *     message. Until the first apply runs, no prefill records exist, so
 *     the lock is a no-op for every existing row.
 *   * The 4 holiday-leave hours live in the vacation_hours bucket (the
 *     week-total math already sums that bucket). The cell label says
 *     "Holiday", not "Vacation", so the distinction stays visible.
 * ========================================================================== */
(function () {

    var esc = function (v) {
        return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
            return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
        });
    };

    function isAdmin() {
        try { return currentProfile && currentProfile.role === "admin" && currentProfile.active !== false; }
        catch (_) { return false; }
    }

    /* ------------------------------------------------------------------
       Holiday dates. Definitions (name + official flag) come from the
       database so a correction is data, not code; the FALLBACKS below
       match the seeded rows exactly and cover a failed load.
       ------------------------------------------------------------------ */
    var FALLBACK_DEFS = {
        new_years_day: { name: "New Years Day", isOfficial: true },
        mlk: { name: "MLK", isOfficial: true },
        easter: { name: "Easter", isOfficial: false },
        mothers_day: { name: "Mothers Day", isOfficial: false },
        memorial_day: { name: "Memorial Day", isOfficial: true },
        fathers_day: { name: "Fathers Day", isOfficial: true },
        july_4: { name: "4th of July", isOfficial: true },
        labor_day: { name: "Labor Day", isOfficial: true },
        halloween: { name: "Halloween", isOfficial: false },
        black_friday: { name: "Black Friday", isOfficial: false },
        christmas_eve: { name: "Christmas Eve", isOfficial: false },
        new_years_eve: { name: "New Years Eve", isOfficial: false }
    };

    var FALLBACK_MEMBERS = {
        1: ["memorial_day", "christmas_eve", "fathers_day", "mlk"],
        2: ["new_years_eve", "july_4", "easter", "black_friday"],
        3: ["labor_day", "new_years_day", "mothers_day", "halloween"],
        4: ["christmas_eve", "memorial_day", "easter", "mlk"],
        5: ["july_4", "new_years_eve", "fathers_day", "black_friday"],
        6: ["new_years_day", "labor_day", "mothers_day", "halloween"]
    };

    function pad(n) { return (n < 10 ? "0" : "") + n; }
    function fmt(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

    function nthWeekday(y, m0, wd, n) {
        var d = new Date(y, m0, 1);
        var add = (wd - d.getDay() + 7) % 7;
        return new Date(y, m0, 1 + add + (n - 1) * 7);
    }
    function lastWeekday(y, m0, wd) {
        var d = new Date(y, m0 + 1, 0);
        var sub = (d.getDay() - wd + 7) % 7;
        return new Date(y, m0 + 1, d.getDate() - sub);
    }
    function easterSunday(y) {
        var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4),
            e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
            h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
            l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
            month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(y, month - 1, day);
    }

    function holidayDate(key, year) {
        switch (key) {
            case "new_years_day": return fmt(new Date(year, 0, 1));
            case "mlk": return fmt(nthWeekday(year, 0, 1, 3));
            case "easter": return fmt(easterSunday(year));
            case "mothers_day": return fmt(nthWeekday(year, 4, 0, 2));
            case "memorial_day": return fmt(lastWeekday(year, 4, 1));
            case "fathers_day": return fmt(nthWeekday(year, 5, 0, 3));
            case "july_4": return fmt(new Date(year, 6, 4));
            case "labor_day": return fmt(nthWeekday(year, 8, 1, 1));
            case "halloween": return fmt(new Date(year, 9, 31));
            case "black_friday": return fmt(nthWeekday(year, 10, 5, 4));
            case "christmas_eve": return fmt(new Date(year, 11, 24));
            case "new_years_eve": return fmt(new Date(year, 11, 31));
            default: return null;
        }
    }

    /* ------------------------------------------------------------------
       Loaded data. Definitions/members fall back to the constants above;
       assignments, trades, and prefills are empty until loaded.
       ------------------------------------------------------------------ */
    var defs = FALLBACK_DEFS;
    var members = FALLBACK_MEMBERS;
    var assignments = {};   // "userId|year" -> group number
    var trades = [];        // holiday_trades rows
    var prefills = {};      // "userId|dateKey" -> {key, name, isOfficial, date}
    var dataLoaded = false;
    var dataLoading = null;

    function profileName(id) {
        try {
            var p = (profiles || []).find(function (x) { return x.id === id; });
            return p ? getProfileName(p) : id;
        } catch (_) { return id; }
    }

    async function loadHolidayData() {
        if (dataLoading) return dataLoading;
        dataLoading = (async function () {
            try {
                var results = await Promise.all([
                    supabaseClient.from("holiday_definitions").select("key,name,is_official"),
                    supabaseClient.from("holiday_group_members").select("group_number,holiday_key"),
                    supabaseClient.from("provider_holiday_groups").select("user_id,year,group_number"),
                    supabaseClient.from("holiday_trades").select("id,year,from_user_id,from_holiday_key,to_user_id,to_holiday_key,status,responded_at"),
                    supabaseClient.from("holiday_prefills").select("user_id,holiday_key,year,holiday_date,is_official")
                ]);
                if (results[0].data && results[0].data.length) {
                    var d = {};
                    results[0].data.forEach(function (r) {
                        d[r.key] = { name: r.name, isOfficial: !!r.is_official };
                    });
                    defs = d;
                }
                if (results[1].data && results[1].data.length) {
                    var m = {};
                    results[1].data.forEach(function (r) {
                        (m[r.group_number] = m[r.group_number] || []).push(r.holiday_key);
                    });
                    members = m;
                }
                assignments = {};
                (results[2].data || []).forEach(function (r) {
                    assignments[r.user_id + "|" + r.year] = r.group_number;
                });
                trades = results[3].data || [];
                prefills = {};
                (results[4].data || []).forEach(function (r) {
                    prefills[r.user_id + "|" + r.holiday_date] = {
                        key: r.holiday_key,
                        name: (defs[r.holiday_key] || {}).name || r.holiday_key,
                        isOfficial: !!r.is_official,
                        date: r.holiday_date
                    };
                });
                dataLoaded = true;
            } catch (e) {
                console.warn("Holiday data load failed", e);
            }
            dataLoading = null;
        })();
        return dataLoading;
    }

    /* Effective holidays for one provider in one year: group members, with
       that year's 1:1 trades applied (giver loses the given holiday and
       gains the received one; receiver the reverse). */
    function effectiveHolidaysFor(userId, year) {
        var out = {};
        var group = assignments[userId + "|" + year];
        (members[group] || []).forEach(function (key) {
            out[key] = {
                key: key,
                name: (defs[key] || {}).name || key,
                isOfficial: !!(defs[key] || {}).isOfficial,
                date: holidayDate(key, year)
            };
        });
        /* Only ACCEPTED trades are effective. Pending requests and
           declines never move coverage; rows without a status (pre-
           revision data) are treated as accepted. */
        trades.filter(function (t) {
            return t.year === year && t.status !== "pending" && t.status !== "declined";
        }).forEach(function (t) {
            if (t.from_user_id === userId) {
                delete out[t.from_holiday_key];
                out[t.to_holiday_key] = {
                    key: t.to_holiday_key,
                    name: (defs[t.to_holiday_key] || {}).name || t.to_holiday_key,
                    isOfficial: !!(defs[t.to_holiday_key] || {}).isOfficial,
                    date: holidayDate(t.to_holiday_key, year)
                };
            }
            if (t.to_user_id === userId) {
                delete out[t.to_holiday_key];
                out[t.from_holiday_key] = {
                    key: t.from_holiday_key,
                    name: (defs[t.from_holiday_key] || {}).name || t.from_holiday_key,
                    isOfficial: !!(defs[t.from_holiday_key] || {}).isOfficial,
                    date: holidayDate(t.from_holiday_key, year)
                };
            }
        });
        return out;
    }

    /* The lock lookup: only a prefill record locks a cell. Assignments
       without an apply are plans, not locks; the apply reports them as
       conflicts if the day was already picked. */
    function prefillFor(userId, dateKey) {
        return prefills[userId + "|" + dateKey] || null;
    }

    function turflandEmployees() {
        try {
            return (profiles || []).filter(function (p) {
                return p.active && p.role === "employee" && p.clinic_site === "Turfland";
            }).sort(function (a, b) { return getProfileName(a).localeCompare(getProfileName(b)); });
        } catch (_) { return []; }
    }

    /* ------------------------------------------------------------------
       Grid lock: after every schedule render, convert prefilled holiday
       cells to locked holiday displays. renderSchedule rebuilds the
       bodies from scratch each time, so no duplicate-label risk.
       ------------------------------------------------------------------ */
    function holidayPostPass() {
        if (!dataLoaded) return;
        var dates;
        try { dates = getWeekDates().map(function (d) { return getDateKey(d); }); }
        catch (_) { return; }
        ["turflandBody", "fountainBody"].forEach(function (bodyId) {
            var body = document.getElementById(bodyId);
            if (!body) return;
            Array.prototype.forEach.call(body.querySelectorAll("tr"), function (row) {
                var nameCell = row.querySelector(".employee-name");
                if (!nameCell) return;
                var label = nameCell.textContent.trim();
                var person = null;
                try {
                    person = (profiles || []).find(function (p) {
                        return getProfileName(p).trim() === label;
                    });
                } catch (_) { return; }
                if (!person) return;
                var cells = row.querySelectorAll("td");
                for (var i = 0; i < 7; i++) {
                    var cell = cells[i + 1];
                    if (!cell) continue;
                    var pre = prefillFor(person.id, dates[i]);
                    if (!pre) continue;
                    var code = pre.isOfficial ? "8" : "12";
                    var note = pre.isOfficial ? "Holiday · 8 + leave" : "Holiday · 12";
                    cell.classList.remove("editable");
                    cell.classList.add("locked", "holiday-locked");
                    cell.title = pre.name + " (assigned holiday)";
                    cell.innerHTML = '<span class="schedule-admin-value">' + esc(code) + '</span>'
                        + '<span class="shift-site-display schedule-admin-label">' + esc(note) + '</span>'
                        + '<span class="shift-site-display">' + esc(pre.name) + '</span>';
                }
            });
        });
    }

    /* ------------------------------------------------------------------
       Wrappers. These chain after any earlier wrappers (this file loads
       last), and they load holiday data on first use after sign-in.
       ------------------------------------------------------------------ */
    if (typeof renderSchedule === "function") {
        var origRenderSchedule = renderSchedule;
        renderSchedule = function () {
            var result = origRenderSchedule.apply(this, arguments);
            try {
                if (typeof currentUser !== "undefined" && currentUser && !dataLoaded) {
                    loadHolidayData().then(function () {
                        try { holidayPostPass(); } catch (_) {}
                        try { holidayStripPassSoon(); } catch (_) {}
                    });
                } else {
                    holidayPostPass();
                }
            } catch (e) { console.warn("Holiday post-pass failed", e); }
            try { holidayStripPassSoon(); } catch (_) {}
            return result;
        };
    }

    if (typeof saveScheduleValue === "function") {
        var origSaveScheduleValue = saveScheduleValue;
        saveScheduleValue = async function (userId, dateKey, scheduleCode, workSite) {
            try {
                if (typeof currentUser !== "undefined" && currentUser && !dataLoaded) {
                    await loadHolidayData();
                }
                var pre = prefillFor(userId, dateKey);
                if (pre) {
                    if (typeof showError === "function") {
                        showError("This day is a locked holiday assignment (" + pre.name + ") and cannot be changed. Use the holiday trade flow instead.");
                    }
                    return false;
                }
            } catch (e) { console.warn("Holiday save guard failed", e); }
            return origSaveScheduleValue.apply(this, arguments);
        };
    }

    /* ------------------------------------------------------------------
       Modal + styles.
       ------------------------------------------------------------------ */
    function ensureStyles() {
        if (document.getElementById("holidayStyles")) return;
        var s = document.createElement("style");
        s.id = "holidayStyles";
        s.textContent = ".holiday-locked{background:#fff7d6!important}"
            + ".holiday-tabs{display:flex;gap:8px;margin-bottom:14px}"
            + ".holiday-tab{border:1px solid #cad7e7;background:#fff;color:#17365d;border-radius:8px;padding:6px 14px;cursor:pointer;font-weight:600}"
            + ".holiday-tab.active{background:#17365d;color:#fff}"
            + ".holiday-table{width:100%;border-collapse:collapse;font-size:13px}"
            + ".holiday-table th{text-align:left;color:#475569;padding:6px 8px;border-bottom:1px solid #e2e8f0}"
            + ".holiday-table td{padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle}"
            + ".holiday-table select{padding:4px 6px;border:1px solid #cbd5e1;border-radius:6px}"
            + ".holiday-note{color:#64748b;font-size:12px;margin-top:8px}";
        document.head.appendChild(s);
    }

    var modalYear = new Date().getFullYear();

    function yearOptions(selected) {
        var out = "";
        for (var y = modalYear - 2; y <= modalYear + 2; y++) {
            out += '<option value="' + y + '"' + (y === selected ? " selected" : "") + ">" + y + "</option>";
        }
        return out;
    }

    function ensureModal() {
        if (document.getElementById("holidayModal")) return;
        var m = document.createElement("div");
        m.id = "holidayModal";
        m.className = "modal-overlay";
        m.style.display = "none";
        m.innerHTML = '<div class="modal modal-wide"><div class="modal-header"><div class="modal-title">Holidays</div>'
            + '<button class="modal-close" id="holidayModalClose">×</button></div>'
            + '<div class="modal-body modal-scroll">'
            + '<div class="form-group" style="max-width:220px"><label for="holidayYearSelect">Year</label>'
            + '<select id="holidayYearSelect"></select></div>'
            + '<div class="holiday-tabs"><button type="button" class="holiday-tab active" data-tab="assign">Assignments</button>'
            + '<button type="button" class="holiday-tab" data-tab="trades">Trades</button>'
            + '<button type="button" class="holiday-tab" data-tab="history">History</button>'
            + '<button type="button" class="holiday-tab" data-tab="myHolidays" style="display:none">My Holidays</button>'
            + '<button type="button" class="holiday-tab" data-tab="myRequests" style="display:none">My Requests</button></div>'
            + '<div id="holidayTabAssign"></div><div id="holidayTabTrades" style="display:none"></div>'
            + '<div id="holidayTabHistory" style="display:none"></div>'
            + '<div id="holidayTabMyHolidays" style="display:none"></div>'
            + '<div id="holidayTabMyRequests" style="display:none"></div>'
            + '</div><div class="modal-footer"><button class="modal-button cancel-button" id="holidayModalDone">Close</button></div></div>';
        document.body.appendChild(m);
        document.getElementById("holidayModalClose").onclick = closeHolidayModal;
        document.getElementById("holidayModalDone").onclick = closeHolidayModal;
        m.querySelectorAll(".holiday-tab").forEach(function (b) {
            b.onclick = function () {
                m.querySelectorAll(".holiday-tab").forEach(function (x) { x.classList.remove("active"); });
                b.classList.add("active");
                m.querySelectorAll(".holiday-tab").forEach(function (x) {
                    var t = x.dataset.tab;
                    var div = document.getElementById("holidayTab" + t.charAt(0).toUpperCase() + t.slice(1));
                    if (div) div.style.display = (t === b.dataset.tab ? "" : "none");
                });
                if (b.dataset.tab === "history") renderHistoryTab();
                if (b.dataset.tab === "myHolidays") renderMyHolidaysTab();
                if (b.dataset.tab === "myRequests") renderMyRequestsTab();
            };
        });
        var ys = document.getElementById("holidayYearSelect");
        ys.innerHTML = yearOptions(modalYear);
        ys.onchange = function () {
            modalYear = Number(ys.value);
            renderAllTabs();
        };
    }

    /* Employees propose trades; admins do not originate them. In view-as
       mode the employee tabs stay hidden, so an admin viewing as someone
       else can never act as them. */
    function isTurflandEmployee() {
        try {
            return !window.viewAsActive && currentProfile && currentProfile.role === "employee"
                && currentProfile.clinic_site === "Turfland";
        } catch (_) { return false; }
    }

    function setTabsForRole() {
        var m = document.getElementById("holidayModal");
        if (!m) return;
        var admin = isAdmin();
        var show = function (tab, visible) {
            m.querySelectorAll('[data-tab="' + tab + '"]').forEach(function (b) {
                b.style.display = visible ? "" : "none";
            });
        };
        show("assign", admin);
        show("trades", admin);
        show("history", admin);
        show("myHolidays", !admin);
        show("myRequests", !admin);
        var active = admin ? "assign" : "myHolidays";
        m.querySelectorAll(".holiday-tab").forEach(function (b) {
            b.classList.toggle("active", b.dataset.tab === active);
            var div = document.getElementById("holidayTab" + b.dataset.tab.charAt(0).toUpperCase() + b.dataset.tab.slice(1));
            if (div) div.style.display = (b.dataset.tab === active ? "" : "none");
        });
    }

    function renderAllTabs() {
        if (isAdmin()) {
            renderAssignTab();
            renderTradesTab();
            if (document.getElementById("holidayTabHistory").style.display !== "none") renderHistoryTab();
        } else {
            renderMyHolidaysTab();
            renderMyRequestsTab();
        }
    }

    function openHolidayModal() {
        if (!isAdmin() && !isTurflandEmployee()) return;
        ensureStyles();
        ensureModal();
        setTabsForRole();
        loadHolidayData().then(renderAllTabs);
        document.getElementById("holidayModal").style.display = "flex";
    }

    function closeHolidayModal() {
        var m = document.getElementById("holidayModal");
        if (m) m.style.display = "none";
    }

    window.openHolidayModal = openHolidayModal;
    window.closeHolidayModal = closeHolidayModal;

    function groupReferenceHtml() {
        var rows = [1, 2, 3, 4, 5, 6].map(function (g) {
            var names = (members[g] || []).map(function (k) { return (defs[k] || {}).name || k; });
            return "<tr><td><strong>Group " + g + "</strong></td><td>" + esc(names.join(" · ")) + "</td></tr>";
        }).join("");
        return '<table class="holiday-table" style="margin-bottom:14px"><tr><th>Group</th><th>Holidays</th></tr>' + rows + "</table>";
    }

    function renderAssignTab() {
        var box = document.getElementById("holidayTabAssign");
        if (!box) return;
        var emps = turflandEmployees();
        var appliedCount = Object.keys(prefills).filter(function (k) {
            return prefills[k].date.slice(0, 4) === String(modalYear);
        }).length;
        var assignedCount = emps.filter(function (p) { return assignments[p.id + "|" + modalYear]; }).length;
        var rows = emps.map(function (p) {
            var cur = assignments[p.id + "|" + modalYear] || "";
            var opts = '<option value="">—</option>' + [1, 2, 3, 4, 5, 6].map(function (g) {
                return '<option value="' + g + '"' + (String(cur) === String(g) ? " selected" : "") + ">Group " + g + "</option>";
            }).join("");
            return "<tr><td>" + esc(getProfileName(p)) + "</td>"
                + '<td><select data-assign-user="' + esc(p.id) + '">' + opts + "</select></td></tr>";
        }).join("") || '<tr><td colspan="2">No active Turfland employees.</td></tr>';
        box.innerHTML = groupReferenceHtml()
            + "<p>Groups are Turfland-only. Assign each provider a group for " + modalYear
            + "; on Jan 1 everyone rotates to the next group (6 → 1).</p>"
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">'
            + '<button class="modal-button save-button" id="holidaySaveAssign">Save assignments</button>'
            + '<button class="modal-button cancel-button" id="holidayRollForward">Roll forward from ' + (modalYear - 1) + " with rotation</button>"
            + '<button class="modal-button save-button" id="holidayApply">Apply holidays for ' + modalYear + "</button></div>"
            + '<div id="holidayAssignMsg" class="holiday-note"></div>'
            + '<div class="holiday-note">Applied prefill rows for ' + modalYear + ": " + appliedCount
            + " · Providers with a group: " + assignedCount + " of " + emps.length + ".</div>"
            + '<table class="holiday-table"><tr><th>Provider</th><th>Group for ' + modalYear + "</th></tr>" + rows + "</table>";
        document.getElementById("holidaySaveAssign").onclick = saveAssignments;
        document.getElementById("holidayRollForward").onclick = function () {
            document.querySelectorAll("[data-assign-user]").forEach(function (sel) {
                var prev = assignments[sel.dataset.assignUser + "|" + (modalYear - 1)];
                if (prev) sel.value = prev === 6 ? 1 : prev + 1;
            });
            document.getElementById("holidayAssignMsg").textContent =
                "Rolled forward with rotation — press Save assignments to commit.";
        };
        document.getElementById("holidayApply").onclick = applyHolidays;
    }

    async function saveAssignments() {
        var msg = document.getElementById("holidayAssignMsg");
        msg.textContent = "Saving…";
        try {
            var sels = document.querySelectorAll("[data-assign-user]");
            for (var i = 0; i < sels.length; i++) {
                var uid = sels[i].dataset.assignUser;
                var val = sels[i].value;
                if (!val) {
                    await supabaseClient.from("provider_holiday_groups")
                        .delete().eq("user_id", uid).eq("year", modalYear);
                } else {
                    await supabaseClient.from("provider_holiday_groups").upsert(
                        { user_id: uid, year: modalYear, group_number: Number(val), updated_at: new Date().toISOString() },
                        { onConflict: "user_id,year" });
                }
            }
            await loadHolidayData();
            msg.textContent = "Assignments saved for " + modalYear + ".";
            renderAssignTab();
        } catch (e) {
            msg.textContent = "Save failed: " + e.message;
        }
    }

    async function applyHolidays() {
        var msg = document.getElementById("holidayAssignMsg");
        msg.textContent = "Applying…";
        try {
            var items = [];
            turflandEmployees().forEach(function (p) {
                if (!assignments[p.id + "|" + modalYear]) return;
                var eff = effectiveHolidaysFor(p.id, modalYear);
                Object.keys(eff).forEach(function (key) {
                    items.push({
                        user_id: p.id,
                        holiday_key: key,
                        holiday_date: eff[key].date,
                        is_official: eff[key].isOfficial
                    });
                });
            });
            var res = await supabaseClient.rpc("apply_holiday_prefills", { p_year: modalYear, p_items: items });
            if (res.error) throw res.error;
            var out = res.data || {};
            var lines = ["Applied " + (out.applied || 0) + " holiday days, removed " + (out.removed || 0) + "."];
            (out.conflicts || []).forEach(function (c) {
                lines.push("Skipped (already scheduled): " + profileName(c.user_id) + " — "
                    + ((defs[c.holiday_key] || {}).name || c.holiday_key) + " (" + c.holiday_date + "): " + c.reason + ".");
            });
            (out.stale || []).forEach(function (c) {
                lines.push("Left untouched (no longer matches the prefill): " + profileName(c.user_id) + " — "
                    + ((defs[c.holiday_key] || {}).name || c.holiday_key) + ".");
            });
            msg.innerHTML = esc(lines.join(" ")).replace(/\. /g, ".<br>");
            await loadHolidayData();
            renderAssignTab();
            if (typeof loadWeek === "function") { try { await loadWeek(); } catch (_) {} }
        } catch (e) {
            msg.textContent = "Apply failed: " + e.message;
        }
    }

    function renderTradesTab() {
        var box = document.getElementById("holidayTabTrades");
        if (!box) return;
        var emps = turflandEmployees();
        var opts = emps.map(function (p) {
            return '<option value="' + esc(p.id) + '">' + esc(getProfileName(p)) + "</option>";
        }).join("");
        var list = trades.filter(function (t) { return t.year === modalYear; }).map(function (t) {
            return "<tr><td>" + esc(profileName(t.from_user_id)) + " gave " + esc((defs[t.from_holiday_key] || {}).name || t.from_holiday_key)
                + "</td><td>" + esc(profileName(t.to_user_id)) + " gave " + esc((defs[t.to_holiday_key] || {}).name || t.to_holiday_key)
                + "</td><td>" + esc(t.status || "accepted") + "</td>"
                + '<td><button class="modal-button cancel-button" data-trade-del="' + esc(t.id) + '">Undo</button></td></tr>';
        }).join("") || '<tr><td colspan="4">No trades recorded for ' + modalYear + ".</td></tr>";
        box.innerHTML = "<p>Holiday trades are 1:1 swaps for one year: each side gives one holiday and receives one. "
            + "Trades recorded here take effect immediately (re-apply holidays for " + modalYear + " to update the schedule). "
            + "Employee requests appear here as Pending until the target accepts or declines.</p>"
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:640px">'
            + '<div class="form-group"><label>Giver</label><select id="tradeFromUser">' + opts + "</select></div>"
            + '<div class="form-group"><label>Giver gives</label><select id="tradeFromHoliday"></select></div>'
            + '<div class="form-group"><label>Receiver</label><select id="tradeToUser">' + opts + "</select></div>"
            + '<div class="form-group"><label>Receiver gives</label><select id="tradeToHoliday"></select></div></div>'
            + '<button class="modal-button save-button" id="holidayRecordTrade">Record trade</button>'
            + '<div id="holidayTradeMsg" class="holiday-note"></div>'
            + '<table class="holiday-table" style="margin-top:14px"><tr><th>Giver</th><th>Receiver</th><th>Status</th><th></th></tr>' + list + "</table>";
        var fillHolidaySelects = function () {
            var fu = document.getElementById("tradeFromUser").value;
            var tu = document.getElementById("tradeToUser").value;
            var fill = function (selId, uid) {
                var sel = document.getElementById(selId);
                var eff = effectiveHolidaysFor(uid, modalYear);
                sel.innerHTML = Object.keys(eff).map(function (k) {
                    return '<option value="' + esc(k) + '">' + esc(eff[k].name) + " (" + esc(eff[k].date) + ")</option>";
                }).join("") || '<option value="">(no holidays assigned)</option>';
            };
            fill("tradeFromHoliday", fu);
            fill("tradeToHoliday", tu);
        };
        document.getElementById("tradeFromUser").onchange = fillHolidaySelects;
        document.getElementById("tradeToUser").onchange = fillHolidaySelects;
        fillHolidaySelects();
        document.getElementById("holidayRecordTrade").onclick = async function () {
            var m = document.getElementById("holidayTradeMsg");
            var fu = document.getElementById("tradeFromUser").value;
            var fh = document.getElementById("tradeFromHoliday").value;
            var tu = document.getElementById("tradeToUser").value;
            var th = document.getElementById("tradeToHoliday").value;
            if (!fu || !fh || !tu || !th) { m.textContent = "Pick both people and both holidays."; return; }
            if (fu === tu) { m.textContent = "A trade needs two different people."; return; }
            if (fh === th) { m.textContent = "A trade needs two different holidays."; return; }
            if (!effectiveHolidaysFor(fu, modalYear)[fh]) {
                m.textContent = profileName(fu) + " does not hold " + ((defs[fh] || {}).name || fh) + " in " + modalYear + ".";
                return;
            }
            if (!effectiveHolidaysFor(tu, modalYear)[th]) {
                m.textContent = profileName(tu) + " does not hold " + ((defs[th] || {}).name || th) + " in " + modalYear + ".";
                return;
            }
            var res = await supabaseClient.from("holiday_trades").insert({
                year: modalYear, from_user_id: fu, from_holiday_key: fh,
                to_user_id: tu, to_holiday_key: th, status: "accepted", created_by: currentUser.id
            });
            if (res.error) { m.textContent = "Trade failed: " + res.error.message; return; }
            m.textContent = "Trade recorded. Re-apply holidays for " + modalYear + " to update the schedule.";
            await loadHolidayData();
            renderTradesTab();
        };
        box.querySelectorAll("[data-trade-del]").forEach(function (b) {
            b.onclick = async function () {
                await supabaseClient.from("holiday_trades").delete().eq("id", b.dataset.tradeDel);
                await loadHolidayData();
                renderTradesTab();
            };
        });
    }

    function codeHours(code) {
        if (code === "12") return 12;
        if (code === "A4") return 0;
        var n = Number(code);
        return Number.isFinite(n) ? n : 0;
    }

    /* ------------------------------------------------------------------
       Employee tabs: My Holidays (own coverage + propose a trade) and
       My Requests (incoming pending trades to accept/decline, outgoing
       pending trades to cancel). Acceptance runs the RPC, which swaps
       the two days on the schedule immediately.
       ------------------------------------------------------------------ */
    function renderMyHolidaysTab() {
        var box = document.getElementById("holidayTabMyHolidays");
        if (!box) return;
        var me = currentUser ? currentUser.id : null;
        if (!me) { box.textContent = "Sign in to see your holidays."; return; }
        var group = assignments[me + "|" + modalYear];
        var base = members[group] || [];
        var eff = effectiveHolidaysFor(me, modalYear);
        var effRows = Object.keys(eff).map(function (k) {
            var traded = base.indexOf(k) === -1;
            return "<tr><td><strong>" + esc(eff[k].name) + "</strong></td><td>" + esc(eff[k].date) + "</td>"
                + "<td>" + (eff[k].isOfficial ? "Official (8 + leave)" : "Non-observed (12)") + "</td>"
                + "<td>" + (traded ? "Received in trade" : "Group " + group) + "</td></tr>";
        }).join("") || '<tr><td colspan="4">No holidays assigned.</td></tr>';
        var away = base.filter(function (k) { return !eff[k]; }).map(function (k) {
            return esc((defs[k] || {}).name || k);
        }).join(", ");
        var others = turflandEmployees().filter(function (p) { return p.id !== me; });
        var otherOpts = others.map(function (p) {
            return '<option value="' + esc(p.id) + '">' + esc(getProfileName(p)) + "</option>";
        }).join("");
        box.innerHTML = "<p>Your holiday coverage for " + modalYear
            + (group ? " (Group " + group + ")" : " — no group assigned yet; ask an admin to assign you.")
            + "</p>"
            + '<table class="holiday-table"><tr><th>Holiday</th><th>Date</th><th>Type</th><th>How</th></tr>' + effRows + "</table>"
            + (away ? '<div class="holiday-note">Traded away: ' + away + ".</div>" : "")
            + (group ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:640px;margin-top:14px">'
            + '<div class="form-group"><label>Offer one of my holidays</label><select id="myTradeMine"></select></div>'
            + '<div class="form-group"><label>Trade with</label><select id="myTradeWith">' + otherOpts + "</select></div>"
            + '<div class="form-group"><label>For their holiday</label><select id="myTradeTheirs"></select></div></div>'
            + '<button class="modal-button save-button" id="myTradeSend">Send trade request</button>'
            + '<div id="myTradeMsg" class="holiday-note"></div>'
            + '<div class="holiday-note">A 1:1 swap: you give one holiday and receive one. The other provider accepts or declines; on acceptance the two days swap on the schedule right away.</div>' : "");
        if (!group) return;
        var fillMine = function () {
            document.getElementById("myTradeMine").innerHTML = Object.keys(eff).map(function (k) {
                return '<option value="' + esc(k) + '">' + esc(eff[k].name) + " (" + esc(eff[k].date) + ")</option>";
            }).join("");
        };
        var fillTheirs = function () {
            var uid = document.getElementById("myTradeWith").value;
            var theirs = effectiveHolidaysFor(uid, modalYear);
            document.getElementById("myTradeTheirs").innerHTML = Object.keys(theirs).map(function (k) {
                return '<option value="' + esc(k) + '">' + esc(theirs[k].name) + " (" + esc(theirs[k].date) + ")</option>";
            }).join("") || '<option value="">(no holidays assigned)</option>';
        };
        fillMine();
        fillTheirs();
        document.getElementById("myTradeWith").onchange = fillTheirs;
        document.getElementById("myTradeSend").onclick = async function () {
            var m = document.getElementById("myTradeMsg");
            var mh = document.getElementById("myTradeMine").value;
            var tu = document.getElementById("myTradeWith").value;
            var th = document.getElementById("myTradeTheirs").value;
            if (!mh || !tu || !th) { m.textContent = "Pick your holiday, the other provider, and their holiday."; return; }
            if (mh === th) { m.textContent = "A trade needs two different holidays."; return; }
            if (!effectiveHolidaysFor(me, modalYear)[mh]) { m.textContent = "You no longer hold that holiday."; return; }
            if (!effectiveHolidaysFor(tu, modalYear)[th]) { m.textContent = "They no longer hold that holiday."; return; }
            var res = await supabaseClient.from("holiday_trades").insert({
                year: modalYear, from_user_id: me, from_holiday_key: mh,
                to_user_id: tu, to_holiday_key: th, status: "pending", created_by: me
            });
            if (res.error) { m.textContent = "Request failed: " + res.error.message; return; }
            m.textContent = "Trade request sent.";
            await loadHolidayData();
            renderAllTabs();
        };
    }

    function renderMyRequestsTab() {
        var box = document.getElementById("holidayTabMyRequests");
        if (!box) return;
        var me = currentUser ? currentUser.id : null;
        if (!me) { box.textContent = "Sign in to see your requests."; return; }
        var incoming = trades.filter(function (t) { return t.to_user_id === me && t.status === "pending"; });
        var outgoing = trades.filter(function (t) { return t.from_user_id === me && t.status === "pending"; });
        var inRows = incoming.map(function (t) {
            return "<tr><td>" + esc(profileName(t.from_user_id)) + " offers " + esc((defs[t.from_holiday_key] || {}).name || t.from_holiday_key)
                + "</td><td>for your " + esc((defs[t.to_holiday_key] || {}).name || t.to_holiday_key) + " (" + t.year + ")</td>"
                + '<td><button class="modal-button save-button" data-trade-accept="' + esc(t.id) + '">Accept</button> '
                + '<button class="modal-button cancel-button" data-trade-decline="' + esc(t.id) + '">Decline</button></td></tr>';
        }).join("") || '<tr><td colspan="3">No incoming requests.</td></tr>';
        var outRows = outgoing.map(function (t) {
            return "<tr><td>You offered " + esc((defs[t.from_holiday_key] || {}).name || t.from_holiday_key)
                + "</td><td>for " + esc(profileName(t.to_user_id)) + "'s " + esc((defs[t.to_holiday_key] || {}).name || t.to_holiday_key) + " (" + t.year + ")</td>"
                + '<td><button class="modal-button cancel-button" data-trade-cancel="' + esc(t.id) + '">Cancel</button></td></tr>';
        }).join("") || '<tr><td colspan="3">No outgoing requests.</td></tr>';
        box.innerHTML = '<div id="myRequestsMsg" class="holiday-note"></div>'
            + "<p><strong>Incoming requests</strong></p>"
            + '<table class="holiday-table"><tr><th>Offer</th><th>For</th><th></th></tr>' + inRows + "</table>"
            + "<p style=\"margin-top:14px\"><strong>Outgoing requests</strong></p>"
            + '<table class="holiday-table"><tr><th>Offer</th><th>For</th><th></th></tr>' + outRows + "</table>";
        var msg = document.getElementById("myRequestsMsg");
        box.querySelectorAll("[data-trade-accept]").forEach(function (b) {
            b.onclick = async function () {
                var res = await supabaseClient.rpc("accept_holiday_trade", { p_trade_id: b.dataset.tradeAccept });
                if (res.error) { msg.textContent = "Accept failed: " + res.error.message; return; }
                msg.textContent = "Trade accepted — the two days swapped on the schedule.";
                await loadHolidayData();
                renderAllTabs();
                if (typeof loadWeek === "function") { try { await loadWeek(); } catch (_) {} }
            };
        });
        box.querySelectorAll("[data-trade-decline]").forEach(function (b) {
            b.onclick = async function () {
                var res = await supabaseClient.from("holiday_trades")
                    .update({ status: "declined", responded_at: new Date().toISOString() })
                    .eq("id", b.dataset.tradeDecline).eq("to_user_id", me).eq("status", "pending");
                if (res.error) { msg.textContent = "Decline failed: " + res.error.message; return; }
                msg.textContent = "Trade declined.";
                await loadHolidayData();
                renderAllTabs();
            };
        });
        box.querySelectorAll("[data-trade-cancel]").forEach(function (b) {
            b.onclick = async function () {
                var res = await supabaseClient.from("holiday_trades")
                    .delete().eq("id", b.dataset.tradeCancel).eq("from_user_id", me).eq("status", "pending");
                if (res.error) { msg.textContent = "Cancel failed: " + res.error.message; return; }
                msg.textContent = "Request cancelled.";
                await loadHolidayData();
                renderAllTabs();
            };
        });
    }

    async function renderHistoryTab() {
        var box = document.getElementById("holidayTabHistory");
        if (!box) return;
        box.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">'
            + '<select id="historyClinic"><option value="Turfland">Turfland</option><option value="Fountain Court">Fountain Court</option></select>'
            + '<select id="historyMode"><option value="byHoliday">By holiday</option><option value="byProvider">By provider</option></select>'
            + '<select id="historyProvider" style="display:none"></select></div>'
            + '<div id="historyContent">Loading…</div>';
        var clinicSel = document.getElementById("historyClinic");
        var modeSel = document.getElementById("historyMode");
        var provSel = document.getElementById("historyProvider");
        provSel.innerHTML = (profiles || []).filter(function (p) { return p.active && p.role === "employee"; })
            .sort(function (a, b) { return getProfileName(a).localeCompare(getProfileName(b)); })
            .map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(getProfileName(p)) + "</option>"; }).join("");
        var render = async function () {
            var content = document.getElementById("historyContent");
            var clinic = clinicSel.value;
            var mode = modeSel.value;
            provSel.style.display = mode === "byProvider" ? "" : "none";
            content.textContent = "Loading…";
            try {
                var keys = Object.keys(defs);
                var histYears = [];
                if (mode === "byProvider") {
                    for (var hy = modalYear - 2; hy <= modalYear + 1; hy++) histYears.push(hy);
                } else {
                    histYears = [modalYear];
                }
                var dates = [];
                histYears.forEach(function (hy) {
                    keys.forEach(function (k) { dates.push(holidayDate(k, hy)); });
                });
                var sRes = await supabaseClient.from("schedules")
                    .select("user_id,schedule_date,schedule_code,work_site")
                    .in("schedule_date", dates);
                var lRes = await supabaseClient.from("schedule_leave_hours")
                    .select("user_id,leave_date,vacation_hours,professional_leave_hours,tdl_hours")
                    .in("leave_date", dates);
                var schedBy = {};
                (sRes.data || []).forEach(function (r) { schedBy[r.user_id + "|" + r.schedule_date] = r; });
                var leaveBy = {};
                (lRes.data || []).forEach(function (r) {
                    leaveBy[r.user_id + "|" + r.leave_date] =
                        Number(r.vacation_hours || 0) + Number(r.professional_leave_hours || 0) + Number(r.tdl_hours || 0);
                });
                var actualText = function (uid, date) {
                    var s = schedBy[uid + "|" + date];
                    if (!s) return "no schedule row";
                    var bits = [s.schedule_code];
                    if (leaveBy[uid + "|" + date]) bits.push(leaveBy[uid + "|" + date] + "h leave");
                    return bits.join(" + ");
                };
                if (mode === "byHoliday") {
                    var rows = keys.map(function (k) {
                        var date = holidayDate(k, modalYear);
                        var who = "";
                        if (clinic === "Turfland") {
                            who = turflandEmployees().filter(function (p) {
                                return !!effectiveHolidaysFor(p.id, modalYear)[k];
                            }).map(function (p) {
                                return esc(getProfileName(p)) + " (" + esc(actualText(p.id, date)) + ")";
                            }).join(", ") || "—";
                        } else {
                            who = (profiles || []).filter(function (p) {
                                return p.active && p.role === "employee" && p.clinic_site === "Fountain Court";
                            }).filter(function (p) {
                                var s = schedBy[p.id + "|" + date];
                                return s && codeHours(s.schedule_code) > 0;
                            }).map(function (p) {
                                return esc(getProfileName(p)) + " (" + esc(actualText(p.id, date)) + ")";
                            }).join(", ") || "—";
                        }
                        return "<tr><td><strong>" + esc(defs[k].name) + "</strong></td><td>" + esc(date) + "</td>"
                            + "<td>" + (defs[k].isOfficial ? "Official (8 + leave)" : "Non-observed (12)") + "</td><td>" + who + "</td></tr>";
                    }).join("");
                    content.innerHTML = '<table class="holiday-table"><tr><th>Holiday</th><th>Date</th><th>Type</th><th>Who worked — ' + esc(clinic) + " " + modalYear + "</th></tr>" + rows + "</table>"
                        + '<div class="holiday-note">Turfland shows assigned providers (group + trades) with their actual schedule that day. Fountain Court has no groups, so it shows everyone with a worked shift that day.</div>';
                } else {
                    var uid = provSel.value;
                    var person = (profiles || []).find(function (p) { return p.id === uid; });
                    var rows2 = "";
                    for (var y = modalYear - 2; y <= modalYear + 1; y++) {
                        keys.forEach(function (k) {
                            var date = holidayDate(k, y);
                            var assigned = person && person.clinic_site === "Turfland" && !!effectiveHolidaysFor(uid, y)[k];
                            var s = schedBy[uid + "|" + date];
                            var worked = s && codeHours(s.schedule_code) > 0;
                            if (assigned || worked) {
                                rows2 += "<tr><td>" + y + "</td><td><strong>" + esc(defs[k].name) + "</strong></td><td>" + esc(date) + "</td>"
                                    + "<td>" + (assigned ? "Assigned" : "—") + "</td><td>" + esc(actualText(uid, date)) + "</td></tr>";
                            }
                        });
                    }
                    content.innerHTML = "<p>Holidays for " + esc(person ? getProfileName(person) : "") + " (assigned for Turfland; actual schedule shown for every year listed).</p>"
                        + '<table class="holiday-table"><tr><th>Year</th><th>Holiday</th><th>Date</th><th>Assigned</th><th>Actual</th></tr>'
                        + (rows2 || '<tr><td colspan="5">Nothing found.</td></tr>') + "</table>"
                        + '<div class="holiday-note">By-provider actuals cover ' + (modalYear - 2) + "–" + (modalYear + 1) + " holiday dates only; earlier years are not queried here.</div>";
                }
            } catch (e) {
                content.textContent = "History failed: " + e.message;
            }
        };
        clinicSel.onchange = render;
        modeSel.onchange = render;
        provSel.onchange = render;
        render();
    }

    /* Strip entry point: for Turfland employees the Notifications strip
       card becomes My Holidays (the bell already opens notifications).
       Skipped in view-as mode, and for anyone who is not a Turfland
       employee the strip is left alone. The strip rebuilds on a timeout
       after each render, so this runs both now and on the next tick. */
    function holidayStripInfo() {
        try {
            if (!dataLoaded || !currentUser) return null;
            var year = new Date().getFullYear();
            var group = assignments[currentUser.id + "|" + year];
            if (!group) return null;
            var eff = effectiveHolidaysFor(currentUser.id, year);
            return { group: group, count: Object.keys(eff).length, year: year };
        } catch (_) { return null; }
    }

    function holidayStripPass() {
        try {
            if (window.viewAsActive) return;
            if (!isTurflandEmployee()) return;
            var strip = document.getElementById("accDashboardStrip");
            if (!strip) return;
            var info = holidayStripInfo();
            strip.querySelectorAll(".acc-stat-card").forEach(function (card) {
                var label = card.querySelector(".acc-stat-label");
                if (!label || label.textContent.trim() !== "Notifications") return;
                var icon = card.querySelector(".acc-stat-icon");
                var value = card.querySelector(".acc-stat-value");
                var sub = card.querySelector(".acc-stat-sub");
                if (icon) icon.textContent = "🗓";
                label.textContent = "My Holidays";
                if (value) value.textContent = info ? "Group " + info.group : "View";
                if (sub) sub.textContent = info ? info.count + " holidays · " + info.year : "Holiday coverage";
                card.onclick = openHolidayModal;
            });
        } catch (_) {}
    }

    function holidayStripPassSoon() {
        try { holidayStripPass(); } catch (_) {}
        setTimeout(function () { try { holidayStripPass(); } catch (_) {} }, 0);
    }

    /* ------------------------------------------------------------------
       Entry point: a Holidays button in the Manage People modal. The
       modal markup is static, so inject once at load and re-check
       whenever the admin panel opens.
       ------------------------------------------------------------------ */
    function ensureHolidayButton() {
        if (!isAdmin()) return;
        var top = document.querySelector("#adminModal .admin-top");
        if (!top || document.getElementById("holidayOpenButton")) return;
        var b = document.createElement("button");
        b.id = "holidayOpenButton";
        b.type = "button";
        b.className = "modal-button save-button";
        b.textContent = "Holidays";
        b.onclick = function () {
            var am = document.getElementById("adminModal");
            if (am) am.style.display = "none";
            openHolidayModal();
        };
        top.appendChild(b);
    }

    ensureStyles();
    ensureHolidayButton();
    if (typeof window.openPeopleManagement === "function") {
        var origOpenPeople = window.openPeopleManagement;
        window.openPeopleManagement = function () {
            var r = origOpenPeople.apply(this, arguments);
            setTimeout(ensureHolidayButton, 0);
            return r;
        };
    } else if (typeof openAdmin === "function") {
        var origOpenAdmin = openAdmin;
        openAdmin = function () {
            var r = origOpenAdmin.apply(this, arguments);
            setTimeout(ensureHolidayButton, 0);
            return r;
        };
    }

})();
