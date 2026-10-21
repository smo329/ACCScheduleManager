/*
 * ACC Schedule Manager - Open shift pay-period warning
 * Uses a repeating 14-day pay period anchored to Aug 9-Aug 22, 2026.
 * Leave hours do not count toward the 40 qualifying-work-hour threshold.
 */
(function () {
  "use strict";

  const VERSION = "2026.08.14.1";
  const PAY_PERIOD_ANCHOR = new Date(2026, 7, 9); // Aug 9, 2026
  const MS_PER_DAY = 86400000;
  const THRESHOLD = 40;

  console.info(`[ACC Schedule Manager] open-shift pay-period warning loaded: ${VERSION}`);

  function localDate(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function fmtShortDate(date) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
  }

  function getPayPeriodForDate(key) {
    const target = localDate(key);
    const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const anchorMidnight = new Date(PAY_PERIOD_ANCHOR.getFullYear(), PAY_PERIOD_ANCHOR.getMonth(), PAY_PERIOD_ANCHOR.getDate());
    const days = Math.round((targetMidnight - anchorMidnight) / MS_PER_DAY);
    const periodIndex = Math.floor(days / 14);
    const start = new Date(anchorMidnight);
    start.setDate(start.getDate() + periodIndex * 14);
    const end = new Date(start);
    end.setDate(end.getDate() + 13);
    return { start, end, startKey: dateKey(start), endKey: dateKey(end) };
  }

  function qualifyingScheduleHours(code, leaveHours) {
    const leave = Math.max(0, Number(leaveHours || 0));
    if (code === "12") return Math.max(0, 12 - leave);
    if (code === "A4") return 4;
    const n = Number(code);
    return Number.isFinite(n) && n >= 0 && n <= 12 ? n : 0;
  }

  // Regular schedule for one day. worked is the scheduled worked
  // hours (12, A4, or a typed partial such as 7.5). A leave-only day
  // (legacy VL/PL/TDL code, worked 0) is not a working day for this check.
  async function getSameDayWork(shiftDate, userId) {
    const { data, error } = await supabaseClient
      .from("schedules")
      .select("schedule_code")
      .eq("user_id", userId)
      .eq("schedule_date", shiftDate)
      .maybeSingle();
    if (error) throw error;
    const code = data?.schedule_code || "0";
    return { worked: qualifyingScheduleHours(code, 0), code };
  }

  async function getPayPeriodStatus(shiftDate, userId) {
    const period = getPayPeriodForDate(shiftDate);

    const [scheduleResult, leaveResult, opportunityResult] = await Promise.all([
      supabaseClient
        .from("schedules")
        .select("schedule_date,schedule_code")
        .eq("user_id", userId)
        .gte("schedule_date", period.startKey)
        .lte("schedule_date", period.endKey),
      supabaseClient
        .from("schedule_leave_hours")
        .select("leave_date,vacation_hours,professional_leave_hours,tdl_hours")
        .eq("user_id", userId)
        .gte("leave_date", period.startKey)
        .lte("leave_date", period.endKey),
      supabaseClient
        .from("open_shift_opportunities")
        .select("id,shift_date")
        .gte("shift_date", period.startKey)
        .lte("shift_date", period.endKey)
    ]);

    if (scheduleResult.error) throw scheduleResult.error;
    if (leaveResult.error) throw leaveResult.error;
    if (opportunityResult.error) throw opportunityResult.error;

    const leaveByDate = new Map();
    let totalLeave = 0;
    (leaveResult.data || []).forEach(row => {
      const leave = Number(row.vacation_hours || 0) +
        Number(row.professional_leave_hours || 0) +
        Number(row.tdl_hours || 0);
      leaveByDate.set(row.leave_date, leave);
      totalLeave += leave;
    });

    let regularWorked = 0;
    (scheduleResult.data || []).forEach(row => {
      regularWorked += qualifyingScheduleHours(
        row.schedule_code,
        leaveByDate.get(row.schedule_date) || 0
      );
    });

    const opportunityIds = (opportunityResult.data || []).map(row => row.id);
    let claimedHours = 0;

    if (opportunityIds.length) {
      const claimResult = await supabaseClient
        .from("open_shift_claims")
        .select("start_hour,end_hour")
        .eq("user_id", userId)
        .in("opportunity_id", opportunityIds);

      if (claimResult.error) throw claimResult.error;

      claimedHours = (claimResult.data || []).reduce(
        (sum, row) => sum + Math.max(0, Number(row.end_hour) - Number(row.start_hour)),
        0
      );
    }

    return {
      period,
      totalLeave,
      regularWorked,
      claimedHours,
      qualifyingHours: regularWorked + claimedHours
    };
  }

  function ensureWarningElement(box) {
    let warning = box.querySelector(".open-shift-pay-warning");
    if (!warning) {
      warning = document.createElement("div");
      warning.className = "open-shift-pay-warning";
      box.appendChild(warning);
    }
    return warning;
  }

  function ensureStyles() {
    if (document.getElementById("openShiftPayWarningStyles")) return;
    const style = document.createElement("style");
    style.id = "openShiftPayWarningStyles";
    style.textContent = `
      .open-shift-pay-warning{
        grid-column:1/-1;
        margin-top:3px;
        padding:9px 10px;
        border-radius:7px;
        font-size:11px;
        line-height:1.4;
        border:1px solid #e2e8f0;
        background:#f8fafc;
        color:#475569;
      }
      .open-shift-pay-warning.warning{
        border-color:#f59e0b;
        background:#fffbeb;
        color:#92400e;
      }
      .open-shift-pay-warning.good{
        border-color:#86efac;
        background:#f0fdf4;
        color:#166534;
      }
      .open-shift-pay-warning strong{font-weight:800}
      .acc-dark .open-shift-pay-warning{background:#172033;border-color:#475569;color:#cbd5e1}
      .acc-dark .open-shift-pay-warning.warning{background:#33270d;border-color:#b45309;color:#fde68a}
      .acc-dark .open-shift-pay-warning.good{background:#102719;border-color:#15803d;color:#bbf7d0}
    `;
    document.head.appendChild(style);
  }

  async function updateWarning(box) {
    if (!box || !currentUser) return;

    const opportunityId = box.dataset.opp;
    const start = Number(box.querySelector(".open-start")?.value);
    const end = Number(box.querySelector(".open-end")?.value);
    const warning = ensureWarningElement(box);

    if (!opportunityId || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      warning.textContent = "Unable to calculate the pay-period warning for this selection.";
      warning.className = "open-shift-pay-warning warning";
      return;
    }

    warning.textContent = "Checking pay-period hours…";
    warning.className = "open-shift-pay-warning";

    try {
      const opportunityResult = await supabaseClient
        .from("open_shift_opportunities")
        .select("shift_date")
        .eq("id", opportunityId)
        .single();

      if (opportunityResult.error) throw opportunityResult.error;

      const status = await getPayPeriodStatus(opportunityResult.data.shift_date, currentUser.id);

      // Same-day block, shown in the signup box before any click: an
      // additional shift cannot be claimed on a day the employee is
      // already scheduled to work (e.g. Oct 4, 2026, where Test Tester
      // was both scheduled staff and an additional-shift claim).
      const sameDay = await getSameDayWork(opportunityResult.data.shift_date, currentUser.id);
      box.dataset.sameDayBlocked = sameDay.worked > 0 ? "true" : "false";
      if (sameDay.worked > 0) {
        warning.className = "open-shift-pay-warning warning";
        warning.innerHTML = `<strong>Signup blocked:</strong> You are already scheduled to work ${sameDay.worked} hour${sameDay.worked === 1 ? "" : "s"} on ${fmtShortDate(localDate(opportunityResult.data.shift_date))} (${sameDay.code === "A4" ? "Admin" : sameDay.code}). You cannot sign up for an additional shift on a day you are already working.`;
        const claimBtn = box.querySelector(".claim-open-shift");
        if (claimBtn) claimBtn.disabled = true;
        box.dataset.payWarningReady = "true";
        return;
      }

      const claimBtn = box.querySelector(".claim-open-shift");
      if (claimBtn) claimBtn.disabled = false;

      const selectedHours = end - start;
      const remainingTo40 = Math.max(0, THRESHOLD - status.qualifyingHours);
      const belowThreshold = Math.min(selectedHours, remainingTo40);
      const beyondThreshold = Math.max(0, selectedHours - belowThreshold);
      const periodLabel = `${fmtShortDate(status.period.start)}–${fmtShortDate(status.period.end)}`;

      if (status.totalLeave > 0 && belowThreshold > 0) {
        warning.className = "open-shift-pay-warning warning";
        warning.innerHTML = `<strong>Additional-rate warning:</strong> Pay period ${periodLabel}. ` +
          `You currently have ${status.qualifyingHours} qualifying worked hour${status.qualifyingHours === 1 ? "" : "s"} and ${status.totalLeave} leave hour${status.totalLeave === 1 ? "" : "s"}. ` +
          `${belowThreshold} hour${belowThreshold === 1 ? "" : "s"} of this ${selectedHours}-hour signup fall below the 40-hour qualifying threshold` +
          (beyondThreshold > 0 ? `; the remaining ${beyondThreshold} hour${beyondThreshold === 1 ? "" : "s"} are beyond 40.` : ".") +
          ` This is a scheduling warning, not a payroll guarantee.`;
      } else if (status.totalLeave > 0) {
        warning.className = "open-shift-pay-warning good";
        warning.innerHTML = `<strong>Pay-period check:</strong> ${periodLabel}. You have ${status.totalLeave} leave hour${status.totalLeave === 1 ? "" : "s"}, but your current qualifying worked hours are already ${status.qualifyingHours}. All ${selectedHours} selected hour${selectedHours === 1 ? "" : "s"} are beyond the 40-hour threshold based on the current schedule.`;
      } else {
        warning.className = "open-shift-pay-warning good";
        warning.innerHTML = `<strong>Pay-period check:</strong> ${periodLabel}. No leave is currently recorded in this pay period. Current qualifying worked hours: ${status.qualifyingHours}.`;
      }

      box.dataset.payWarningReady = "true";
    } catch (error) {
      console.error("Unable to calculate open-shift pay-period warning:", error);
      warning.className = "open-shift-pay-warning warning";
      warning.textContent = "Pay-period hours could not be checked. You may still sign up, but verify your qualifying hours before relying on the additional rate.";
      box.dataset.payWarningReady = "error";
    }
  }

  function wireBox(box) {
    if (!box || box.dataset.payWarningWired === "true") return;
    box.dataset.payWarningWired = "true";

    const start = box.querySelector(".open-start");
    const end = box.querySelector(".open-end");
    const button = box.querySelector(".claim-open-shift");
    if (!start || !end || !button) return;

    const scheduleUpdate = () => {
      box.dataset.payWarningReady = "false";
      setTimeout(() => updateWarning(box), 0);
    };

    start.addEventListener("change", scheduleUpdate);
    end.addEventListener("change", scheduleUpdate);

    /*
     * Replace the original claim button handler so the checks run
     * immediately before the insert: a same-day working day blocks the
     * signup outright, and any leave in the pay period prompts for
     * confirmation before the claim is inserted.
     */
    button.onclick = async function (event) {
      event.preventDefault();
      event.stopPropagation();

      const selectedStart = Number(start.value);
      const selectedEnd = Number(end.value);
      const selectedHours = selectedEnd - selectedStart;

      if (!Number.isFinite(selectedHours) || selectedHours < 2) {
        if (typeof setMessage === "function") {
          setMessage("error", "Open-shift signups must be at least 2 hours.");
        }
        return;
      }

      await updateWarning(box);

      // Re-check fresh here (not just from the banner above): if the
      // employee is already scheduled to work that day, block the
      // signup and insert nothing.
      try {
        const oppResult = await supabaseClient
          .from("open_shift_opportunities")
          .select("shift_date")
          .eq("id", box.dataset.opp)
          .single();
        if (oppResult.error) throw oppResult.error;

        const shiftDate = oppResult.data.shift_date;
        const sameDay = await getSameDayWork(shiftDate, currentUser.id);
        if (sameDay.worked > 0) {
          const errorBox = document.getElementById("openShiftError");
          if (errorBox) {
            errorBox.textContent = `Signup blocked: you are already scheduled to work ${sameDay.worked} hour${sameDay.worked === 1 ? "" : "s"} on ${fmtShortDate(localDate(shiftDate))}, so you cannot sign up for an additional shift that day.`;
            errorBox.style.display = "block";
          }
          return;
        }

        // Leave in the pay period does not block, but must be confirmed:
        // additional hours below the 40-hour qualifying threshold may
        // not be paid at the additional rate.
        const periodStatus = await getPayPeriodStatus(shiftDate, currentUser.id);
        if (periodStatus.totalLeave > 0) {
          const periodLabel = `${fmtShortDate(periodStatus.period.start)}–${fmtShortDate(periodStatus.period.end)}`;
          const ok = confirm(`You have ${periodStatus.totalLeave} leave hour${periodStatus.totalLeave === 1 ? "" : "s"} in the pay period ${periodLabel}. Additional hours below the 40-hour qualifying threshold may not be paid at the additional rate. Do you want to continue with this signup?`);
          if (!ok) return;
        }
      } catch (checkError) {
        console.error("Additional-shift signup check failed:", checkError);
        const errorBox = document.getElementById("openShiftError");
        if (errorBox) {
          errorBox.textContent = "Your schedule for that day could not be checked, so the signup was not placed. Please try again.";
          errorBox.style.display = "block";
        }
        return;
      }

      button.disabled = true;
      try {
        const { error } = await supabaseClient.from("open_shift_claims").insert({
          opportunity_id: box.dataset.opp,
          user_id: currentUser.id,
          start_hour: selectedStart,
          end_hour: selectedEnd
        });
        if (error) throw error;

        const success = document.getElementById("openShiftSuccess");
        const errorBox = document.getElementById("openShiftError");
        if (errorBox) errorBox.style.display = "none";
        if (success) {
          success.textContent = `Signed up for ${selectedHours} hour${selectedHours === 1 ? "" : "s"}.`;
          success.style.display = "block";
        }

        const refresh = document.getElementById("refreshOpenShifts");
        if (refresh) refresh.click();
      } catch (error) {
        console.error(error);
        const errorBox = document.getElementById("openShiftError");
        if (errorBox) {
          errorBox.textContent = error.message || "Unable to claim those hours. They may have just been taken by someone else.";
          errorBox.style.display = "block";
        }
        button.disabled = false;
      }
    };

    updateWarning(box);
  }

  function scan() {
    document.querySelectorAll(".open-shift-signup").forEach(wireBox);
  }

  ensureStyles();

  const observer = new MutationObserver(() => scan());

  function start() {
    const modal = document.getElementById("openShiftsModal");
    if (!modal) {
      setTimeout(start, 150);
      return;
    }
    observer.observe(modal, { childList: true, subtree: true });
    scan();
  }

  start();
})();
