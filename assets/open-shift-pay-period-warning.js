/*
 * ACC Schedule Manager - Open shift pay-period warning
 * Warns employees when leave means part/all of an open-shift claim falls
 * below the 40 qualifying-work-hour threshold in the biweekly pay period.
 */
(function () {
  "use strict";

  const VERSION = "2026.08.14.1";
  const PAY_PERIOD_ANCHOR = new Date(2026, 7, 9); // Aug 9, 2026
  const PAY_PERIOD_DAYS = 14;
  const RATE_THRESHOLD = 40;
  const wrappedButtons = new WeakSet();
  const previewTimers = new WeakMap();

  console.info(`[ACC Schedule Manager] pay-period warning loaded: ${VERSION}`);

  function isEmployee() {
    return Boolean(
      window.currentProfile &&
      currentProfile.role === "employee" &&
      currentProfile.active !== false &&
      window.currentUser
    );
  }

  function localDate(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function fmtShortDate(key) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric"
    }).format(localDate(key));
  }

  function getPayPeriod(dateValue) {
    const target = typeof dateValue === "string" ? localDate(dateValue) : new Date(dateValue);
    const anchor = new Date(PAY_PERIOD_ANCHOR);
    anchor.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    const daysFromAnchor = Math.floor((target - anchor) / 86400000);
    const periodIndex = Math.floor(daysFromAnchor / PAY_PERIOD_DAYS);
    const start = new Date(anchor);
    start.setDate(start.getDate() + periodIndex * PAY_PERIOD_DAYS);
    const end = new Date(start);
    end.setDate(end.getDate() + PAY_PERIOD_DAYS - 1);

    return { start: dateKey(start), end: dateKey(end) };
  }

  function baseWorkedHours(code) {
    const value = String(code || "").toUpperCase();
    if (value === "12") return 12;
    if (value === "A4") return 4;
    return 0;
  }

  async function getOpportunity(opportunityId) {
    const { data, error } = await supabaseClient
      .from("open_shift_opportunities")
      .select("id,shift_date")
      .eq("id", opportunityId)
      .single();
    if (error) throw error;
    return data;
  }

  async function calculateQualifyingHours(userId, payPeriod, excludingOpportunityId) {
    const [scheduleResult, leaveResult, claimResult] = await Promise.all([
      supabaseClient
        .from("schedules")
        .select("schedule_date,schedule_code")
        .eq("user_id", userId)
        .gte("schedule_date", payPeriod.start)
        .lte("schedule_date", payPeriod.end),
      supabaseClient
        .from("schedule_leave_hours")
        .select("leave_date,vacation_hours,professional_leave_hours,tdl_hours")
        .eq("user_id", userId)
        .gte("leave_date", payPeriod.start)
        .lte("leave_date", payPeriod.end),
      supabaseClient
        .from("open_shift_claims")
        .select("id,opportunity_id,start_hour,end_hour,open_shift_opportunities!inner(shift_date)")
        .eq("user_id", userId)
        .gte("open_shift_opportunities.shift_date", payPeriod.start)
        .lte("open_shift_opportunities.shift_date", payPeriod.end)
    ]);

    if (scheduleResult.error) throw scheduleResult.error;
    if (leaveResult.error) throw leaveResult.error;
    if (claimResult.error) throw claimResult.error;

    const leaveByDate = new Map();
    (leaveResult.data || []).forEach(row => {
      const total =
        Number(row.vacation_hours || 0) +
        Number(row.professional_leave_hours || 0) +
        Number(row.tdl_hours || 0);
      leaveByDate.set(row.leave_date, total);
    });

    let regularWorked = 0;
    (scheduleResult.data || []).forEach(row => {
      const base = baseWorkedHours(row.schedule_code);
      const leave = leaveByDate.get(row.schedule_date) || 0;
      regularWorked += Math.max(0, base - leave);
    });

    let priorOpenShiftHours = 0;
    (claimResult.data || []).forEach(row => {
      if (excludingOpportunityId && row.opportunity_id === excludingOpportunityId) return;
      priorOpenShiftHours += Math.max(0, Number(row.end_hour) - Number(row.start_hour));
    });

    return {
      regularWorked,
      priorOpenShiftHours,
      qualifyingBeforeClaim: regularWorked + priorOpenShiftHours
    };
  }

  async function buildWarning(box) {
    if (!isEmployee()) return null;

    const opportunityId = box.dataset.opp;
    const start = Number(box.querySelector(".open-start")?.value);
    const end = Number(box.querySelector(".open-end")?.value);
    if (!opportunityId || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

    const opportunity = await getOpportunity(opportunityId);
    const payPeriod = getPayPeriod(opportunity.shift_date);
    const totals = await calculateQualifyingHours(currentUser.id, payPeriod, opportunityId);
    const claimHours = end - start;
    const hoursNeeded = Math.max(0, RATE_THRESHOLD - totals.qualifyingBeforeClaim);
    const belowThreshold = Math.min(claimHours, hoursNeeded);
    const aboveThreshold = Math.max(0, claimHours - belowThreshold);

    return {
      ...payPeriod,
      shiftDate: opportunity.shift_date,
      claimHours,
      belowThreshold,
      aboveThreshold,
      ...totals
    };
  }

  function warningHtml(info) {
    const period = `${fmtShortDate(info.start)}–${fmtShortDate(info.end)}`;

    if (info.belowThreshold <= 0) {
      return `
        <strong>Additional-rate check</strong><br>
        Pay period: ${period}. You already have ${info.qualifyingBeforeClaim} qualifying work hours. All ${info.claimHours} selected hours are beyond the 40-hour threshold.
      `;
    }

    if (info.aboveThreshold <= 0) {
      return `
        <strong>Additional-rate warning</strong><br>
        Pay period: ${period}. You currently have ${info.qualifyingBeforeClaim} qualifying work hours. All ${info.claimHours} selected hours fall before you reach 40 qualifying work hours and may not receive the additional rate.
      `;
    }

    return `
      <strong>Additional-rate warning</strong><br>
      Pay period: ${period}. You currently have ${info.qualifyingBeforeClaim} qualifying work hours. The first ${info.belowThreshold} hour${info.belowThreshold === 1 ? "" : "s"} of this signup fall before 40; the remaining ${info.aboveThreshold} hour${info.aboveThreshold === 1 ? "" : "s"} are beyond the threshold.
    `;
  }

  function confirmationText(info) {
    const period = `${fmtShortDate(info.start)}–${fmtShortDate(info.end)}`;
    if (info.belowThreshold <= 0) {
      return `Pay period ${period}: all ${info.claimHours} selected hours are beyond 40 qualifying work hours. Continue with signup?`;
    }
    if (info.aboveThreshold <= 0) {
      return `Additional-rate warning for pay period ${period}: you have ${info.qualifyingBeforeClaim} qualifying work hours before this signup. All ${info.claimHours} selected hours fall before the 40-hour threshold and may not receive the additional rate. Continue anyway?`;
    }
    return `Additional-rate warning for pay period ${period}: you have ${info.qualifyingBeforeClaim} qualifying work hours before this signup. The first ${info.belowThreshold} selected hour${info.belowThreshold === 1 ? "" : "s"} fall before 40; ${info.aboveThreshold} hour${info.aboveThreshold === 1 ? "" : "s"} are beyond 40. Continue anyway?`;
  }

  function ensureWarningElement(box) {
    let warning = box.querySelector(".pay-period-rate-warning");
    if (!warning) {
      warning = document.createElement("div");
      warning.className = "pay-period-rate-warning";
      warning.innerHTML = "Checking pay-period hours…";
      box.appendChild(warning);
    }
    return warning;
  }

  async function refreshPreview(box) {
    if (!document.body.contains(box) || !isEmployee()) return;
    const warning = ensureWarningElement(box);
    warning.className = "pay-period-rate-warning checking";
    warning.textContent = "Checking pay-period hours…";
    try {
      const info = await buildWarning(box);
      if (!info || !document.body.contains(box)) return;
      warning.className = `pay-period-rate-warning ${info.belowThreshold > 0 ? "warn" : "ok"}`;
      warning.innerHTML = warningHtml(info);
    } catch (error) {
      console.warn("Unable to calculate pay-period warning:", error);
      warning.className = "pay-period-rate-warning checking";
      warning.textContent = "Unable to calculate the additional-rate estimate right now. Signup is still available.";
    }
  }

  function schedulePreview(box) {
    clearTimeout(previewTimers.get(box));
    previewTimers.set(box, setTimeout(() => refreshPreview(box), 120));
  }

  function wrapSignupBox(box) {
    if (!isEmployee()) return;

    const start = box.querySelector(".open-start");
    const end = box.querySelector(".open-end");
    const button = box.querySelector(".claim-open-shift");
    if (!start || !end || !button) return;

    if (!box.dataset.payPeriodWarningBound) {
      box.dataset.payPeriodWarningBound = "1";
      start.addEventListener("change", () => schedulePreview(box));
      end.addEventListener("change", () => schedulePreview(box));
      schedulePreview(box);
    }

    if (wrappedButtons.has(button)) return;
    wrappedButtons.add(button);

    const originalClick = button.onclick;
    button.onclick = async function (event) {
      event.preventDefault();
      event.stopPropagation();

      button.disabled = true;
      try {
        const info = await buildWarning(box);
        if (info && info.belowThreshold > 0) {
          const proceed = window.confirm(confirmationText(info));
          if (!proceed) {
            button.disabled = false;
            return;
          }
        }

        button.disabled = false;
        if (typeof originalClick === "function") {
          return originalClick.call(button, event);
        }
      } catch (error) {
        console.warn("Pay-period pre-check failed:", error);
        const proceed = window.confirm(
          "The pay-period additional-rate estimate could not be calculated. Do you still want to sign up for these hours?"
        );
        if (!proceed) {
          button.disabled = false;
          return;
        }
        button.disabled = false;
        if (typeof originalClick === "function") {
          return originalClick.call(button, event);
        }
      }
    };
  }

  function scan() {
    document.querySelectorAll(".open-shift-signup").forEach(wrapSignupBox);
  }

  function installStyles() {
    if (document.getElementById("payPeriodWarningStyles")) return;
    const style = document.createElement("style");
    style.id = "payPeriodWarningStyles";
    style.textContent = `
      .pay-period-rate-warning {
        grid-column: 1 / -1;
        margin-top: 3px;
        padding: 9px 10px;
        border-radius: 6px;
        font-size: 11px;
        line-height: 1.4;
      }
      .pay-period-rate-warning.warn {
        background: #fff7ed;
        border: 1px solid #fdba74;
        color: #9a3412;
      }
      .pay-period-rate-warning.ok {
        background: #ecfdf5;
        border: 1px solid #86efac;
        color: #166534;
      }
      .pay-period-rate-warning.checking {
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        color: #64748b;
      }
      .acc-dark .pay-period-rate-warning.warn {
        background: #431407;
        border-color: #9a3412;
        color: #fed7aa;
      }
      .acc-dark .pay-period-rate-warning.ok {
        background: #052e16;
        border-color: #166534;
        color: #bbf7d0;
      }
      .acc-dark .pay-period-rate-warning.checking {
        background: #0f172a;
        border-color: #334155;
        color: #cbd5e1;
      }
    `;
    document.head.appendChild(style);
  }

  installStyles();
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
})();
