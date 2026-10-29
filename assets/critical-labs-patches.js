/* ACC Schedule Manager — Critical Labs coverage (one person per whole week) */
(function () {
  'use strict';

  // Table: public.schedule_critical_labs_coverage
  //   week_start date UNIQUE, user_id -> profiles(id), updated_at
  // Admins manage all rows; every signed-in staff member can view all rows,
  // so everybody's Calendar & Print can show who is covering that week.
  // Coverage is an on-call duty: it does NOT count as worked hours, does not
  // change weekly totals, and does not block additional-shift signups.
  const TABLE = 'schedule_critical_labs_coverage';

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isAdmin = () => { try { return currentProfile?.role === 'admin'; } catch (_) { return false; } };
  const isViewAs = () => { try { return Boolean(window.viewAsActive); } catch (_) { return false; } };

  function keyOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function localDate(k) { const [y, m, d] = String(k).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
  function sundayOf(k) { const d = localDate(k); d.setDate(d.getDate() - d.getDay()); return keyOf(d); }
  function weekLabel(weekStart) {
    const s = localDate(weekStart), e = new Date(s); e.setDate(e.getDate() + 6);
    const fmt = (d) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
    return `Week of ${fmt(s)} – ${fmt(e)}`;
  }
  function personName(p) {
    if (!p) return 'Unknown';
    try { return getProfileName(p); } catch (_) { return [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown'; }
  }
  function eligiblePeople() {
    try {
      return (profiles || [])
        .filter(p => p.active && (p.role === 'employee' || p.role === 'manager'))
        .slice().sort((a, b) => personName(a).localeCompare(personName(b)));
    } catch (_) { return []; }
  }
  function activePeriod() {
    try {
      if (activeSchedulingPeriod) return activeSchedulingPeriod;
      return (allSchedulingPeriods || []).find(p => p.active) || (allSchedulingPeriods || [])[0] || null;
    } catch (_) { return null; }
  }
  function weeksForPeriod(p) {
    if (!p) return [];
    try {
      if (typeof getWeekStartDatesForPeriod === 'function') {
        return getWeekStartDatesForPeriod(p).map(d => keyOf(d instanceof Date ? d : localDate(d)));
      }
    } catch (_) {}
    // Fallback: Sundays from period start to period end.
    const out = [];
    let d = localDate(p.period_start); d.setDate(d.getDate() - d.getDay());
    const end = localDate(p.period_end);
    while (d <= end) { out.push(keyOf(d)); d.setDate(d.getDate() + 7); }
    return out;
  }

  async function loadCoverage(start, end) {
    // Returns Map week_start -> user_id. Fails soft: a coverage query error
    // must never break the schedule, dashboard, or calendar.
    const map = new Map();
    try {
      if (!supabaseClient) return map;
      const { data, error } = await supabaseClient.from(TABLE)
        .select('week_start,user_id').gte('week_start', start).lte('week_start', end);
      if (error) { console.warn('Critical Labs coverage load failed:', error); return map; }
      (data || []).forEach(r => map.set(r.week_start, r.user_id));
    } catch (e) { console.warn('Critical Labs coverage load failed:', e); }
    return map;
  }

  // Default panel window: 2 weeks before, this week, and 3 weeks after
  // (2 past + this week + 3 upcoming = 6 total). Computed from the calendar,
  // not from the quarter, so it still works at a quarter boundary.
  function recentWeeks() {
    let cur = null;
    try { if (currentWeekStart) cur = keyOf(currentWeekStart); } catch (_) {}
    if (!cur) cur = sundayOf(keyOf(new Date()));
    const base = localDate(cur);
    const out = [];
    [-14, -7, 0, 7, 14, 21].forEach(off => {
      const d = new Date(base); d.setDate(d.getDate() + off); out.push(keyOf(d));
    });
    return out;
  }

  /* ---- Dashboard banner: "You are covering Critical Labs this week" ---- */
  function ensureBannerEl() {
    let el = document.getElementById('criticalLabsBanner');
    if (el) return el;
    const strip = document.getElementById('accDashboardStrip') || document.querySelector('.dashboard-strip');
    if (!strip || !strip.parentNode) return null;
    el = document.createElement('div');
    el.id = 'criticalLabsBanner';
    el.style.cssText = 'display:none;margin:10px 0;padding:12px 14px;border-radius:10px;background:#ede9fe;color:#4c1d95;font-weight:800;font-size:13px;border:1px solid #c4b5fd';
    strip.parentNode.insertBefore(el, strip.nextSibling);
    return el;
  }

  async function refreshBanner() {
    const el = ensureBannerEl();
    if (!el) return;
    el.style.display = 'none';
    el.innerHTML = '';
    if (isViewAs()) return; // View-as shows the viewed person's view, not the admin's own coverage.
    let uid = null;
    try { uid = currentUser?.id || null; } catch (_) {}
    if (!uid) return;
    let weekStart = null;
    try {
      if (currentWeekStart) weekStart = keyOf(currentWeekStart);
    } catch (_) {}
    if (!weekStart) weekStart = sundayOf(keyOf(new Date()));
    const map = await loadCoverage(weekStart, weekStart);
    if (map.get(weekStart) === uid) {
      // Trade Center 1:1 swap entry point: the button sits on the right
      // of the banner. It opens the coverage-week picker in
      // trade-center-patches.js; if that file has not loaded, the
      // button simply does nothing rather than breaking the banner.
      el.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0;padding:12px 14px;border-radius:10px;background:#ede9fe;color:#4c1d95;font-weight:800;font-size:13px;border:1px solid #c4b5fd';
      const label = document.createElement('span');
      label.textContent = `🧪 You are covering Critical Labs this week (${weekLabel(weekStart)}).`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Request Trade';
      btn.style.cssText = 'flex:none;background:#fff;color:#4c1d95;border:1px solid #c4b5fd;border-radius:8px;padding:7px 12px;font-weight:800;font-size:12px;cursor:pointer';
      btn.onclick = () => { try { window.openCriticalLabsTradePicker?.(weekStart); } catch (_) {} };
      el.append(label, btn);
      el.style.display = 'flex';
    }
  }

  // Refresh the banner after the weekly schedule loads (currentWeekStart is set there).
  if (typeof loadWeek === 'function') {
    const origLoadWeek = loadWeek;
    loadWeek = async function (...args) {
      const r = await origLoadWeek.apply(this, args);
      try { await refreshBanner(); } catch (_) {}
      return r;
    };
  }

  /* ---- Employee view: "My Critical Labs" — every week I hold ---- */
  function ensureMyCriticalLabsModal() {
    let m = document.getElementById('myCriticalLabsModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'myCriticalLabsModal';
    m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal modal-wide"><div class="modal-header"><div class="modal-title">My Critical Labs</div><button class="modal-close" type="button">×</button></div><div class="modal-body modal-scroll"><div id="myCriticalLabsMessage" class="person-editor-message"></div><p style="color:#475569;font-size:13px;margin:0 0 12px">Every week you hold Critical Labs coverage, newest first. Request a 1:1 trade for any current or upcoming week.</p><div id="myCriticalLabsWeeks"></div></div><div class="modal-footer"><button class="modal-button cancel-button" id="myCriticalLabsClose" type="button">Close</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('.modal-close').onclick = () => m.classList.remove('show');
    m.querySelector('#myCriticalLabsClose').onclick = () => m.classList.remove('show');
    return m;
  }

  window.openMyCriticalLabs = async function () {
    if (isViewAs()) return;
    let uid = null;
    try { uid = currentUser?.id || null; } catch (_) {}
    if (!uid) return;
    const m = ensureMyCriticalLabsModal();
    const box = m.querySelector('#myCriticalLabsWeeks');
    const msg = m.querySelector('#myCriticalLabsMessage');
    msg.textContent = '';
    box.innerHTML = '<div class="my-schedule-empty">Loading coverage…</div>';
    m.classList.add('show');
    let rows = [];
    try {
      if (!supabaseClient) throw new Error('No database connection.');
      const { data, error } = await supabaseClient.from(TABLE)
        .select('week_start').eq('user_id', uid).order('week_start', { ascending: false });
      if (error) throw error;
      rows = data || [];
    } catch (e) {
      msg.textContent = 'Unable to load your coverage weeks. Please try again.';
      box.innerHTML = '';
      return;
    }
    if (!rows.length) {
      box.innerHTML = '<div class="my-schedule-empty">You have no Critical Labs coverage weeks.</div>';
      return;
    }
    const thisSunday = sundayOf(keyOf(new Date()));
    box.innerHTML = rows.map(r => {
      const ws = String(r.week_start).slice(0, 10);
      const trade = ws >= thisSunday
        ? `<button type="button" class="modal-button cancel-button" data-trade-week="${esc(ws)}">Request Trade</button>`
        : '';
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #e2e8f0"><span style="font-weight:650;color:#17365d">${esc(weekLabel(ws))}</span>${trade}</div>`;
    }).join('');
    box.querySelectorAll('[data-trade-week]').forEach(btn => {
      btn.onclick = () => { try { window.openCriticalLabsTradePicker?.(btn.dataset.tradeWeek); } catch (_) {} };
    });
  };

  /* ---- Admin panel: pick one person per week in the current quarter ---- */
  function ensureModal() {
    let m = document.getElementById('criticalLabsModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'criticalLabsModal';
    m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal modal-wide"><div class="modal-header"><div class="modal-title">Critical Labs Coverage</div><button class="modal-close" type="button">×</button></div><div class="modal-body modal-scroll"><div id="criticalLabsMessage" class="person-editor-message"></div><p style="color:#475569;font-size:13px;margin:0 0 12px">One person per whole week. Only admins can change this. The assigned person sees a banner on their dashboard, and the coverage shows on everybody's Calendar &amp; Print.</p><div style="display:flex;gap:8px;margin-bottom:10px"><button type="button" id="criticalLabsFilterRecent" class="modal-button cancel-button">Recent (6 weeks)</button><button type="button" id="criticalLabsFilterAll" class="modal-button cancel-button">All weeks in quarter</button></div><div id="criticalLabsWeeks"></div></div><div class="modal-footer"><button class="modal-button save-button" id="criticalLabsSave" type="button">Save Coverage</button><button class="modal-button cancel-button" id="criticalLabsClose" type="button">Close</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('.modal-close').onclick = () => m.classList.remove('show');
    m.querySelector('#criticalLabsClose').onclick = () => m.classList.remove('show');
    return m;
  }

  // Panel state: loaded = what the database had when last rendered,
  // pending = unsaved picks (kept across filter switches, so switching
  // from Recent to All and back never silently drops a pick).
  let panelFilter = 'recent';
  let panelLoaded = new Map();
  let panelPending = new Map();
  let panelWeeks = [];

  window.openCriticalLabsManager = async function () {
    if (!isAdmin()) return;
    const m = ensureModal();
    const msg = m.querySelector('#criticalLabsMessage');
    const box = m.querySelector('#criticalLabsWeeks');
    const recentBtn = m.querySelector('#criticalLabsFilterRecent');
    const allBtn = m.querySelector('#criticalLabsFilterAll');
    const period = activePeriod();
    panelFilter = 'recent';
    panelLoaded = new Map();
    panelPending = new Map();
    panelWeeks = [];
    msg.className = 'person-editor-message'; msg.textContent = '';

    function setFilterUI() {
      const active = (b, on) => { if (!b) return; b.style.background = on ? '#17365d' : ''; b.style.color = on ? '#fff' : ''; b.style.borderColor = on ? '#17365d' : ''; };
      active(recentBtn, panelFilter === 'recent');
      active(allBtn, panelFilter === 'all');
    }

    async function renderPanel() {
      setFilterUI();
      panelWeeks = panelFilter === 'all' ? (period ? weeksForPeriod(period) : []) : recentWeeks();
      if (!panelWeeks.length) {
        box.innerHTML = '<div class="my-schedule-empty">No weeks to show.</div>';
        return;
      }
      box.innerHTML = '<div class="my-schedule-empty">Loading coverage…</div>';
      const fetched = await loadCoverage(panelWeeks[0], panelWeeks[panelWeeks.length - 1]);
      panelWeeks.forEach(w => panelLoaded.set(w, fetched.get(w) || ''));
      const people = eligiblePeople();
      const rows = panelWeeks.map(w => {
        const currentId = panelPending.has(w) ? panelPending.get(w) : (panelLoaded.get(w) || '');
        const opts = [`<option value="">— No coverage —</option>`].concat(people.map(p =>
          `<option value="${esc(p.id)}" ${p.id === currentId ? 'selected' : ''}>${esc(personName(p))} (${esc(p.clinic_site || '')})</option>`)).join('');
        return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #eef2f7"><div style="min-width:230px;font-weight:750;color:#17365d;font-size:13px">${esc(weekLabel(w))}</div><select data-week="${esc(w)}" style="min-height:38px;border:1px solid #d4dfeb;border-radius:9px;padding:6px 9px;color:#17365d;font-weight:700">${opts}</select></div>`;
      }).join('');
      box.innerHTML = rows;
      box.querySelectorAll('select[data-week]').forEach(sel => {
        sel.onchange = () => {
          const week = sel.dataset.week, val = sel.value, old = panelLoaded.get(week) || '';
          if (val === old) panelPending.delete(week); else panelPending.set(week, val);
        };
      });
    }

    recentBtn.onclick = async () => { panelFilter = 'recent'; await renderPanel(); };
    allBtn.onclick = async () => { panelFilter = 'all'; await renderPanel(); };
    m.querySelector('#criticalLabsSave').onclick = async function () {
      const btn = this; btn.disabled = true; btn.textContent = 'Saving…';
      try {
        // Save only what changed, from the pending map — assignments for
        // weeks not currently shown are never touched or deleted.
        let changed = 0;
        for (const [week, val] of [...panelPending.entries()]) {
          changed++;
          if (!val) {
            const { error } = await supabaseClient.from(TABLE).delete().eq('week_start', week);
            if (error) throw error;
          } else {
            const { error } = await supabaseClient.from(TABLE).upsert({ week_start: week, user_id: val }, { onConflict: 'week_start' });
            if (error) throw error;
          }
        }
        panelPending = new Map();
        msg.className = 'person-editor-message success';
        msg.textContent = changed ? 'Critical Labs coverage saved.' : 'No changes to save.';
        await renderPanel();
        try { await refreshBanner(); } catch (_) {}
      } catch (e) {
        console.error(e);
        msg.className = 'person-editor-message error';
        msg.textContent = e.message || 'Unable to save coverage.';
      } finally { btn.disabled = false; btn.textContent = 'Save Coverage'; }
    };

    m.classList.add('show');
    await renderPanel();
  };

  // Shared helper for Calendar & Print: coverage for a date range, as a Map
  // from week_start -> user_id, plus the Sunday key for any date.
  window.criticalLabsCoverage = { load: loadCoverage, sundayOf, weekLabel };
})();
