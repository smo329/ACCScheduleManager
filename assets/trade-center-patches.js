/* ACC Schedule Manager — Trade Center (1:1 swaps only)
 *
 * Settled rules (do not soften them here):
 * - Every trade is a 1:1 swap. No one-way handoffs.
 * - Regular-shift trades are only for a CLOSED quarter: a scheduling
 *   period with active = false whose period_end has passed. While a
 *   quarter is open, the regular proposer is not offered.
 * - A swap moves only schedule code + work_site. Leave and Admin hours
 *   stay with the person on their original date (the accept RPC never
 *   touches those tables).
 * - A trade moves only when the target accepts. Admins are notified only
 *   on acceptance (via the accept RPC); the target is notified on request
 *   (DB trigger on insert); the holder is notified on decline (decline RPC).
 * - A swap is blocked if either person already works the other person's
 *   day (worked = code 12, A4, or numeric > 0; a leave-only day does not
 *   block). Acceptance re-checks everything in the RPC.
 * - External workers never get Trade Center (they only sign up for
 *   additional shifts). View-as mode never shows it either.
 * - Everything here fails soft: a trade load error must never break the
 *   dashboard, the schedule grid, or the calendar.
 */
(function () {
  'use strict';
  const VERSION = '2026.10.23.1';
  console.info(`[ACC Schedule Manager] trade center loaded: ${VERSION}`);
  const TABLE = 'schedule_trade_requests';

  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const role = () => { try { return currentProfile?.role || ''; } catch (_) { return ''; } };
  const isAdmin = () => role() === 'admin';
  const isExternal = () => role() === 'external';
  const isViewAs = () => { try { return Boolean(window.viewAsActive); } catch (_) { return false; } };
  const eligible = () => !isExternal() && !isViewAs() && ['admin', 'manager', 'employee'].includes(role());
  const me = () => { try { return currentUser?.id || null; } catch (_) { return null; } };
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const localDate = k => { const [y, m, d] = String(k).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = k => { if (!k) return '—'; try { return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(localDate(k)); } catch (_) { return String(k); } };
  const weekLabel = ws => { const s = localDate(ws), e = new Date(s); e.setDate(e.getDate() + 6); const f = d => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d); return `Week of ${f(s)} – ${f(e)}`; };
  const personName = p => { if (!p) return 'Unknown'; try { return getProfileName(p); } catch (_) { return [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown'; } };
  const personById = id => { try { return (profiles || []).find(p => p.id === id) || null; } catch (_) { return null; } };
  const codeHours = code => { if (code === '12') return 12; if (code === 'A4') return 4; const n = Number(code); return Number.isFinite(n) && n >= 0 && n <= 12 ? n : 0; };
  const isWorked = code => codeHours(code) > 0;
  const codeLabel = code => code === 'A4' ? 'Admin' : code === '12' ? '12 hours' : `${code} hours`;
  const siteLabel = (site, person) => site || (person?.clinic_site || '—');

  /* ---- Quarters: a quarter is CLOSED when it is not the active period
   * and its end date has passed. The app has no dedicated "closed"
   * flag: scheduling_periods carries only `active`, and weekly_locks /
   * week_submissions are per-week / per-person, so neither defines a
   * whole-quarter closure. This period-based definition is the closest
   * existing one; see the build report. ---- */
  async function loadPeriods() {
    try {
      if (Array.isArray(allSchedulingPeriods) && allSchedulingPeriods.length) return allSchedulingPeriods;
    } catch (_) {}
    try {
      const { data, error } = await supabaseClient.from('scheduling_periods')
        .select('id,name,period_start,period_end,active').order('period_start');
      if (!error) return data || [];
    } catch (_) {}
    return [];
  }
  const isClosedPeriod = p => Boolean(p && !p.active && p.period_end && String(p.period_end).slice(0, 10) < todayKey());

  function eligiblePeople() {
    try {
      return (profiles || [])
        .filter(p => p.active && (p.role === 'employee' || p.role === 'manager') && p.id !== me())
        .slice().sort((a, b) => personName(a).localeCompare(personName(b)));
    } catch (_) { return []; }
  }

  async function loadWorkedDays(userId, period) {
    const { data, error } = await supabaseClient.from('schedules')
      .select('schedule_date,schedule_code,work_site')
      .eq('user_id', userId)
      .gte('schedule_date', period.period_start)
      .lte('schedule_date', period.period_end)
      .order('schedule_date');
    if (error) throw error;
    const person = personById(userId);
    return (data || [])
      .filter(r => isWorked(r.schedule_code))
      .map(r => ({
        date: r.schedule_date,
        code: r.schedule_code,
        // A stored null site on a 12-hour shift counts as the holder's
        // primary clinic (same rule the schedule grid uses on display).
        site: r.work_site || (r.schedule_code === '12' ? (person?.clinic_site || null) : null),
        label: `${fmtDate(r.schedule_date)} · ${codeLabel(r.schedule_code)} · ${siteLabel(r.work_site || (r.schedule_code === '12' ? (person?.clinic_site || null) : null), person)}`
      }));
  }

  async function loadTrades() {
    const uid = me();
    if (!uid) return [];
    try {
      const { data, error } = await supabaseClient.from(TABLE)
        .select('*').or(`from_user_id.eq.${uid},to_user_id.eq.${uid}`)
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('Trade Center load failed:', e);
      return [];
    }
  }

  function sideLabel(t, which) {
    if (t.trade_type === 'critical_labs') {
      const w = which === 'from' ? t.from_week_start : t.to_week_start;
      return weekLabel(w);
    }
    const d = which === 'from' ? t.from_date : t.to_date;
    const c = which === 'from' ? t.from_code : t.to_code;
    const s = which === 'from' ? t.from_site : t.to_site;
    const person = personById(which === 'from' ? t.from_user_id : t.to_user_id);
    return `${fmtDate(d)} · ${codeLabel(c)} · ${siteLabel(s, person)}`;
  }

  function tradeCard(t, direction) {
    const otherId = direction === 'incoming' ? t.from_user_id : t.to_user_id;
    const other = personName(personById(otherId));
    const status = t.status;
    const statusText = { pending: 'Pending', accepted: 'Accepted', declined: 'Declined', cancelled: 'Cancelled' }[status] || status;
    const typeText = t.trade_type === 'critical_labs' ? 'Critical Labs coverage swap' : 'Regular shift swap';
    const periodName = (() => { try { return (allSchedulingPeriods || []).find(p => p.id === t.period_id)?.name || ''; } catch (_) { return ''; } })();
    let actions = '';
    if (status === 'pending' && direction === 'incoming') {
      actions = `<div class="trade-card-actions"><button class="modal-button save-button" type="button" data-trade-accept="${esc(t.id)}">Accept Trade</button><button class="modal-button cancel-button" type="button" data-trade-decline="${esc(t.id)}">Decline</button></div>`;
    } else if (status === 'pending' && direction === 'outgoing') {
      actions = `<div class="trade-card-actions"><button class="modal-button cancel-button" type="button" data-trade-cancel="${esc(t.id)}">Cancel Request</button></div>`;
    }
    return `<div class="trade-card" data-trade-id="${esc(t.id)}"><div class="trade-card-title">${esc(typeText)} · <span class="trade-status ${esc(status)}">${esc(statusText)}</span></div><div class="trade-card-body">With <strong>${esc(other)}</strong>${periodName ? ` · ${esc(periodName)}` : ''}<br>Your side: <strong>${esc(sideLabel(t, direction === 'incoming' ? 'to' : 'from'))}</strong><br>Their side: <strong>${esc(sideLabel(t, direction === 'incoming' ? 'from' : 'to'))}</strong></div><div class="trade-card-meta">Requested ${esc(fmtDate(String(t.created_at).slice(0, 10)))}${t.responded_at ? ` · Responded ${esc(fmtDate(String(t.responded_at).slice(0, 10)))}` : ''}</div>${actions}</div>`;
  }

  function installStyles() {
    if (document.getElementById('tradeCenterStyles')) return;
    const s = document.createElement('style');
    s.id = 'tradeCenterStyles';
    s.textContent = `
      #tradeCenterModal .trade-card{border:1px solid #e2e8f0;border-radius:9px;padding:12px;margin-bottom:10px;background:#fff}
      #tradeCenterModal .trade-card-title{font-weight:800;color:#17365d;margin-bottom:4px}
      #tradeCenterModal .trade-card-body{font-size:12px;line-height:1.55;color:#475569}
      #tradeCenterModal .trade-card-meta{font-size:10px;color:#94a3b8;margin-top:7px}
      #tradeCenterModal .trade-card-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
      #tradeCenterModal .trade-status{font-size:10px;font-weight:850;border-radius:999px;padding:3px 8px;background:#f1f5f9;color:#64748b}
      #tradeCenterModal .trade-status.pending{background:#fef3c7;color:#92400e}
      #tradeCenterModal .trade-status.accepted{background:#dcfce7;color:#166534}
      #tradeCenterModal .trade-status.declined,#tradeCenterModal .trade-status.cancelled{background:#fee2e2;color:#991b1b}
      #tradeCenterModal .trade-form label{font-size:12px;font-weight:700;color:#475569}
      #tradeCenterModal .trade-form select,#tradeCenterModal .trade-form input{width:100%;margin-top:5px;margin-bottom:12px;padding:8px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#17365d;font-weight:700}
      #tradeCenterModal .trade-message{border-radius:7px;padding:10px;margin-bottom:12px;font-size:12px;font-weight:700;display:none}
      #tradeCenterModal .trade-message.error{display:block;background:#fee2e2;color:#991b1b}
      #tradeCenterModal .trade-message.success{display:block;background:#dcfce7;color:#166534}
      #tradeCenterModal .trade-empty{padding:20px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:8px}
      .acc-nav-item#navTradeCenter{border-color:#ddd6fe}
    `;
    document.head.appendChild(s);
  }

  function ensureModal() {
    let m = document.getElementById('tradeCenterModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'tradeCenterModal';
    m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal modal-wide"><div class="modal-header"><div class="modal-title">Trade Center</div><button class="modal-close" type="button">×</button></div><div class="modal-body modal-scroll"><div id="tradeCenterMessage" class="trade-message"></div><p style="color:#475569;font-size:13px;margin:0 0 12px">All trades are 1:1 swaps — you give a day and take a day. A trade only moves when the other person accepts it. Admins are notified when a trade is accepted.</p><div id="tradeCenterProposeWrap" style="margin-bottom:14px"></div><h3 style="color:#17365d;font-size:14px;margin:14px 0 8px">Incoming requests</h3><div id="tradeCenterIncoming"></div><h3 style="color:#17365d;font-size:14px;margin:14px 0 8px">Outgoing requests</h3><div id="tradeCenterOutgoing"></div></div><div class="modal-footer"><button class="modal-button cancel-button" id="tradeCenterClose" type="button">Close</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('.modal-close').onclick = () => m.classList.remove('show');
    m.querySelector('#tradeCenterClose').onclick = () => m.classList.remove('show');
    return m;
  }

  function showMessage(msg, kind) {
    const el = document.getElementById('tradeCenterMessage');
    if (!el) return;
    el.textContent = msg || '';
    el.className = `trade-message ${kind || ''}`;
  }

  async function refreshLists() {
    const incomingBox = document.getElementById('tradeCenterIncoming');
    const outgoingBox = document.getElementById('tradeCenterOutgoing');
    if (!incomingBox || !outgoingBox) return;
    incomingBox.innerHTML = '<div class="trade-empty">Loading…</div>';
    outgoingBox.innerHTML = '<div class="trade-empty">Loading…</div>';
    const trades = await loadTrades();
    const uid = me();
    const incoming = trades.filter(t => t.to_user_id === uid);
    const outgoing = trades.filter(t => t.from_user_id === uid);
    incomingBox.innerHTML = incoming.length ? incoming.map(t => tradeCard(t, 'incoming')).join('') : '<div class="trade-empty">No incoming trade requests.</div>';
    outgoingBox.innerHTML = outgoing.length ? outgoing.map(t => tradeCard(t, 'outgoing')).join('') : '<div class="trade-empty">No outgoing trade requests.</div>';
    const modal = document.getElementById('tradeCenterModal');
    if (!modal) return;
    modal.querySelectorAll('[data-trade-accept]').forEach(b => b.onclick = () => actOnTrade(b.dataset.tradeAccept, 'accept'));
    modal.querySelectorAll('[data-trade-decline]').forEach(b => b.onclick = () => actOnTrade(b.dataset.tradeDecline, 'decline'));
    modal.querySelectorAll('[data-trade-cancel]').forEach(b => b.onclick = () => actOnTrade(b.dataset.tradeCancel, 'cancel'));
  }

  async function actOnTrade(id, action) {
    showMessage('', '');
    try {
      if (action === 'accept') {
        const { data, error } = await supabaseClient.rpc('accept_trade_request', { p_trade_id: id });
        if (error) throw error;
        if (data && data.ok === false) { showMessage(data.error || 'This trade could no longer be accepted.', 'error'); await refreshLists(); return; }
        showMessage('Trade accepted. Both schedules have been swapped.', 'success');
      } else if (action === 'decline') {
        const { data, error } = await supabaseClient.rpc('decline_trade_request', { p_trade_id: id });
        if (error) throw error;
        if (data && data.ok === false) { showMessage(data.error || 'This trade could not be declined.', 'error'); await refreshLists(); return; }
        showMessage('Trade declined.', 'success');
      } else {
        const { error } = await supabaseClient.from(TABLE).update({ status: 'cancelled', responded_at: new Date().toISOString() })
          .eq('id', id).eq('from_user_id', me()).eq('status', 'pending');
        if (error) throw error;
        showMessage('Trade request cancelled.', 'success');
      }
      await refreshLists();
      // A swap changes the schedule grid (and, for Critical Labs, the
      // banner/calendar on next load), so reload the current week.
      try { if (typeof loadWeek === 'function') await loadWeek(); } catch (_) {}
    } catch (e) {
      console.warn('Trade action failed:', e);
      // Until the schema file is applied, these calls fail with a
      // missing-table/function error — say so plainly, don't crash.
      showMessage(/relation .* does not exist|function .* does not exist|Could not find/i.test(String(e?.message || e))
        ? 'Trade requests are not set up yet — the Trade Center database tables still need to be applied.'
        : (e?.message || 'That trade action could not be completed.'));
      await refreshLists();
    }
  }

  /* ---- Propose a regular-shift trade (closed quarters only) ---- */
  async function openProposeDialog() {
    if (isAdmin()) return;
    const modal = ensureModal();
    const wrap = document.getElementById('tradeCenterProposeWrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="trade-empty">Loading closed quarters…</div>';
    const periods = await loadPeriods();
    const closed = periods.filter(isClosedPeriod).sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)));
    if (!closed.length) {
      wrap.innerHTML = '<div class="trade-empty">No closed quarters yet. Regular-shift trades open only once an entire quarter is closed.</div>';
      return;
    }
    wrap.innerHTML = `<div class="trade-form"><label for="tradePeriod">Closed quarter</label><select id="tradePeriod">${closed.map(p => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.period_start)} – ${esc(p.period_end)})</option>`).join('')}</select><label for="tradeMyDay">Your day (worked days in this quarter)</label><select id="tradeMyDay"><option value="">Choose a quarter first</option></select><label for="tradePerson">Trade with</label><select id="tradePerson"><option value="">Choose a person</option>${eligiblePeople().map(p => `<option value="${esc(p.id)}">${esc(personName(p))} (${esc(p.clinic_site || '')})</option>`).join('')}</select><label for="tradeTheirDay">Their day (worked days in this quarter)</label><select id="tradeTheirDay"><option value="">Choose a person first</option></select><div id="tradeProposeError" class="trade-message error" style="display:none"></div><button class="modal-button save-button" id="tradeProposeConfirm" type="button">Propose 1:1 Trade</button></div>`;
    const periodSel = wrap.querySelector('#tradePeriod');
    const myDaySel = wrap.querySelector('#tradeMyDay');
    const personSel = wrap.querySelector('#tradePerson');
    const theirDaySel = wrap.querySelector('#tradeTheirDay');
    const errBox = wrap.querySelector('#tradeProposeError');
    let myDays = [], theirDays = [];
    const setErr = msg => { if (!errBox) return; errBox.textContent = msg || ''; errBox.style.display = msg ? 'block' : 'none'; };
    const fillDays = async () => {
      const period = closed.find(p => p.id === periodSel.value);
      if (!period) return;
      try {
        myDays = await loadWorkedDays(me(), period);
        myDaySel.innerHTML = myDays.length
          ? '<option value="">Choose your day</option>' + myDays.map((d, i) => `<option value="${i}">${esc(d.label)}</option>`).join('')
          : '<option value="">No worked days in this quarter</option>';
      } catch (e) {
        console.warn('Trade day load failed:', e);
        myDaySel.innerHTML = '<option value="">Could not load your days</option>';
      }
      await fillTheirDays();
    };
    const fillTheirDays = async () => {
      const period = closed.find(p => p.id === periodSel.value);
      const personId = personSel.value;
      if (!period || !personId) { theirDaySel.innerHTML = '<option value="">Choose a person first</option>'; theirDays = []; return; }
      try {
        theirDays = await loadWorkedDays(personId, period);
        theirDaySel.innerHTML = theirDays.length
          ? '<option value="">Choose their day</option>' + theirDays.map((d, i) => `<option value="${i}">${esc(d.label)}</option>`).join('')
          : '<option value="">No worked days in this quarter</option>';
      } catch (e) {
        console.warn('Trade day load failed:', e);
        theirDaySel.innerHTML = '<option value="">Could not load their days</option>';
      }
    };
    periodSel.onchange = fillDays;
    personSel.onchange = fillTheirDays;
    await fillDays();
    wrap.querySelector('#tradeProposeConfirm').onclick = async () => {
      setErr('');
      const period = closed.find(p => p.id === periodSel.value);
      const myDay = myDays[Number(myDaySel.value)];
      const theirDay = theirDays[Number(theirDaySel.value)];
      const personId = personSel.value;
      if (!period || !myDay || !theirDay || !personId) { setErr('Choose a quarter, your day, a person, and their day.'); return; }
      if (myDay.date === theirDay.date) { setErr('A swap needs two different dates — you cannot trade a day with itself.'); return; }
      // Conflict check (re-checked authoritatively by the accept RPC):
      // neither person may already work the other person's day.
      const myOnTheirDate = myDays.find(d => d.date === theirDay.date);
      const theirOnMyDate = theirDays.find(d => d.date === myDay.date);
      if (myOnTheirDate || theirOnMyDate) {
        setErr('This swap cannot go through — someone already works the other day.');
        return;
      }
      try {
        const { error } = await supabaseClient.from(TABLE).insert({
          trade_type: 'regular_shift',
          period_id: period.id,
          from_user_id: me(),
          to_user_id: personId,
          from_date: myDay.date, from_code: myDay.code, from_site: myDay.site,
          to_date: theirDay.date, to_code: theirDay.code, to_site: theirDay.site,
          status: 'pending'
        });
        if (error) throw error;
        showMessage('Trade proposed. It will only move if the other person accepts it.', 'success');
        wrap.innerHTML = '';
        await refreshLists();
      } catch (e) {
        console.warn('Trade propose failed:', e);
        setErr(/relation .* does not exist/i.test(String(e?.message || e))
          ? 'Trade requests are not set up yet — the Trade Center database tables still need to be applied.'
          : (e?.message || 'That trade could not be proposed.'));
      }
    };
  }

  window.openTradeCenter = async function () {
    if (!eligible()) return;
    installStyles();
    const modal = ensureModal();
    modal.classList.add('show');
    const wrap = document.getElementById('tradeCenterProposeWrap');
    if (wrap) {
      if (isAdmin()) {
        wrap.innerHTML = '<div class="trade-empty">Admins receive a notification when a trade is accepted. Proposing a trade needs an employee or manager schedule, so no proposer is shown here.</div>';
      } else {
        wrap.innerHTML = '<button class="modal-button save-button" id="tradeCenterProposeBtn" type="button">Propose a Trade (regular shift, closed quarter)</button>';
        wrap.querySelector('#tradeCenterProposeBtn').onclick = openProposeDialog;
      }
    }
    showMessage('', '');
    await refreshLists();
  };

  /* ---- Critical Labs 1:1 swap picker (opened from the banner) ---- */
  window.openCriticalLabsTradePicker = async function (bannerWeek) {
    if (!eligible() || isAdmin()) return;
    installStyles();
    const modal = ensureModal();
    modal.classList.add('show');
    const wrap = document.getElementById('tradeCenterProposeWrap');
    if (wrap) wrap.innerHTML = '<div class="trade-empty">Loading Critical Labs coverage…</div>';
    showMessage('', '');
    await refreshLists();
    if (!wrap) return;
    let coverage = [];
    try {
      const { data, error } = await supabaseClient.from('schedule_critical_labs_coverage')
        .select('week_start,user_id').order('week_start');
      if (error) throw error;
      coverage = data || [];
    } catch (e) {
      console.warn('Critical Labs trade load failed:', e);
      wrap.innerHTML = '<div class="trade-empty">Critical Labs coverage could not be loaded.</div>';
      return;
    }
    const byPerson = new Map();
    coverage.forEach(r => {
      if (r.user_id === me()) return;
      if (!byPerson.has(r.user_id)) byPerson.set(r.user_id, []);
      byPerson.get(r.user_id).push(r.week_start);
    });
    const holders = [...byPerson.entries()]
      .map(([id, weeks]) => ({ id, weeks: weeks.sort() }))
      .filter(h => h.weeks.length)
      .sort((a, b) => personName(personById(a.id)).localeCompare(personName(personById(b.id))));
    if (!holders.length) {
      wrap.innerHTML = '<div class="trade-empty">Nobody else holds a Critical Labs week to swap with, so a 1:1 Critical Labs trade is not possible right now.</div>';
      return;
    }
    wrap.innerHTML = `<div class="trade-form"><p style="color:#475569;font-size:13px;margin:0 0 12px">Swap your week <strong>${esc(weekLabel(bannerWeek))}</strong> for one of their coverage weeks. Both weeks move — neither person ends up without coverage.</p><label for="tradeLabsPerson">Swap with</label><select id="tradeLabsPerson">${holders.map(h => `<option value="${esc(h.id)}">${esc(personName(personById(h.id)))} (${esc(h.weeks.length)} week${h.weeks.length === 1 ? '' : 's'})</option>`).join('')}</select><label for="tradeLabsWeek">Their week you would take</label><select id="tradeLabsWeek"></select><div id="tradeLabsError" class="trade-message error" style="display:none"></div><button class="modal-button save-button" id="tradeLabsConfirm" type="button">Propose Coverage Swap</button></div>`;
    const personSel = wrap.querySelector('#tradeLabsPerson');
    const weekSel = wrap.querySelector('#tradeLabsWeek');
    const errBox = wrap.querySelector('#tradeLabsError');
    const setErr = msg => { if (!errBox) return; errBox.textContent = msg || ''; errBox.style.display = msg ? 'block' : 'none'; };
    const fillWeeks = () => {
      const holder = holders.find(h => h.id === personSel.value);
      weekSel.innerHTML = (holder?.weeks || []).map(w => `<option value="${esc(w)}">${esc(weekLabel(w))}</option>`).join('') || '<option value="">No weeks</option>';
    };
    personSel.onchange = fillWeeks;
    fillWeeks();
    wrap.querySelector('#tradeLabsConfirm').onclick = async () => {
      setErr('');
      const theirWeek = weekSel.value;
      if (!theirWeek || theirWeek === bannerWeek) { setErr('Choose one of their coverage weeks.'); return; }
      try {
        const { error } = await supabaseClient.from(TABLE).insert({
          trade_type: 'critical_labs',
          period_id: null,
          from_user_id: me(),
          to_user_id: personSel.value,
          from_week_start: bannerWeek,
          to_week_start: theirWeek,
          status: 'pending'
        });
        if (error) throw error;
        showMessage('Coverage swap proposed. It will only move if the other person accepts it.', 'success');
        wrap.innerHTML = '';
        await refreshLists();
      } catch (e) {
        console.warn('Critical Labs trade propose failed:', e);
        setErr(/relation .* does not exist/i.test(String(e?.message || e))
          ? 'Trade requests are not set up yet — the Trade Center database tables still need to be applied.'
          : (e?.message || 'That swap could not be proposed.'));
      }
    };
  };

})();
