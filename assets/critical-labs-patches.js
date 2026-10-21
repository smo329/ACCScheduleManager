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
    el.textContent = '';
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
      el.textContent = `🧪 You are covering Critical Labs this week (${weekLabel(weekStart)}).`;
      el.style.display = 'block';
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

  /* ---- Admin panel: pick one person per week in the current quarter ---- */
  function ensureModal() {
    let m = document.getElementById('criticalLabsModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'criticalLabsModal';
    m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal modal-wide"><div class="modal-header"><div class="modal-title">Critical Labs Coverage</div><button class="modal-close" type="button">×</button></div><div class="modal-body modal-scroll"><div id="criticalLabsMessage" class="person-editor-message"></div><p style="color:#475569;font-size:13px;margin:0 0 12px">One person per whole week. Only admins can change this. The assigned person sees a banner on their dashboard, and the coverage shows on everybody's Calendar &amp; Print.</p><div id="criticalLabsWeeks"></div></div><div class="modal-footer"><button class="modal-button save-button" id="criticalLabsSave" type="button">Save Coverage</button><button class="modal-button cancel-button" id="criticalLabsClose" type="button">Close</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('.modal-close').onclick = () => m.classList.remove('show');
    m.querySelector('#criticalLabsClose').onclick = () => m.classList.remove('show');
    return m;
  }

  window.openCriticalLabsManager = async function () {
    if (!isAdmin()) return;
    const m = ensureModal();
    const msg = m.querySelector('#criticalLabsMessage');
    const box = m.querySelector('#criticalLabsWeeks');
    msg.className = 'person-editor-message'; msg.textContent = '';
    const period = activePeriod();
    if (!period) { box.innerHTML = '<div class="my-schedule-empty">No scheduling quarter found, so there are no weeks to assign.</div>'; m.classList.add('show'); return; }
    const weeks = weeksForPeriod(period);
    box.innerHTML = '<div class="my-schedule-empty">Loading coverage…</div>';
    m.classList.add('show');
    const current = await loadCoverage(period.period_start, period.period_end);
    const people = eligiblePeople();
    const rows = weeks.map(w => {
      const currentId = current.get(w) || '';
      const opts = [`<option value="">— No coverage —</option>`].concat(people.map(p =>
        `<option value="${esc(p.id)}" ${p.id === currentId ? 'selected' : ''}>${esc(personName(p))} (${esc(p.clinic_site || '')})</option>`)).join('');
      return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #eef2f7"><div style="min-width:230px;font-weight:750;color:#17365d;font-size:13px">${esc(weekLabel(w))}</div><select data-week="${esc(w)}" style="min-height:38px;border:1px solid #d4dfeb;border-radius:9px;padding:6px 9px;color:#17365d;font-weight:700">${opts}</select></div>`;
    }).join('');
    box.innerHTML = rows || '<div class="my-schedule-empty">No weeks in this quarter.</div>';
    // Keep the loaded values on the modal so Save only writes what changed.
    m.dataset.loaded = JSON.stringify([...current.entries()]);
    m.querySelector('#criticalLabsSave').onclick = async function () {
      const btn = this; btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const loaded = new Map(JSON.parse(m.dataset.loaded || '[]'));
        const selects = [...box.querySelectorAll('select[data-week]')];
        let changed = 0;
        for (const sel of selects) {
          const week = sel.dataset.week, val = sel.value, old = loaded.get(week) || '';
          if (val === old) continue;
          changed++;
          if (!val) {
            const { error } = await supabaseClient.from(TABLE).delete().eq('week_start', week);
            if (error) throw error;
          } else {
            const { error } = await supabaseClient.from(TABLE).upsert({ week_start: week, user_id: val }, { onConflict: 'week_start' });
            if (error) throw error;
          }
        }
        msg.className = 'person-editor-message success';
        msg.textContent = changed ? 'Critical Labs coverage saved.' : 'No changes to save.';
        const fresh = await loadCoverage(period.period_start, period.period_end);
        m.dataset.loaded = JSON.stringify([...fresh.entries()]);
        try { await refreshBanner(); } catch (_) {}
      } catch (e) {
        console.error(e);
        msg.className = 'person-editor-message error';
        msg.textContent = e.message || 'Unable to save coverage.';
      } finally { btn.disabled = false; btn.textContent = 'Save Coverage'; }
    };
  };

  // Shared helper for Calendar & Print: coverage for a date range, as a Map
  // from week_start -> user_id, plus the Sunday key for any date.
  window.criticalLabsCoverage = { load: loadCoverage, sundayOf, weekLabel };
})();
