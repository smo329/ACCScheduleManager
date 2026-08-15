/* ACC Schedule Manager — admin drill-down navigation */
(function(){
  'use strict';
  const VERSION='2026.08.14.1';
  console.info(`[ACC Schedule Manager] admin drill-down loaded: ${VERSION}`);

  function isAdmin(){try{return currentProfile?.role==='admin'&&currentProfile?.active!==false}catch(_){return false}}
  function localDate(key){const [y,m,d]=String(key||'').slice(0,10).split('-').map(Number);return new Date(y,m-1,d)}
  function fmtDate(key){return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}).format(localDate(key))}
  function nameFor(id){try{const p=(profiles||[]).find(x=>x.id===id);return p?getProfileName(p):''}catch(_){return''}}
  function periodById(id){try{return (allSchedulingPeriods||[]).find(p=>p.id===id)||null}catch(_){return null}}
  function currentPeriod(){try{return adminSchedulingPeriod||activeSchedulingPeriod||(allSchedulingPeriods||[]).find(p=>p.id===viewSchedulingPeriodId)||null}catch(_){return null}}

  function ensureStyles(){
    if(document.getElementById('adminDrilldownStyles'))return;
    const s=document.createElement('style');s.id='adminDrilldownStyles';s.textContent=`
      .picking-row.acc-drillable{cursor:pointer;border-radius:9px;padding-left:5px;padding-right:5px;transition:.15s ease}
      .picking-row.acc-drillable:hover{background:#eef5ff;transform:translateX(2px)}
      .picking-row.acc-drillable:after{content:'›';color:#8ba0b9;font-size:17px;font-weight:800;margin-left:2px}
      .acc-drill-highlight{position:relative;z-index:2;animation:accDrillPulse 2.4s ease both!important;box-shadow:0 0 0 3px rgba(59,130,246,.35),0 10px 28px rgba(37,99,235,.18)!important}
      .acc-drill-row-highlight td{animation:accDrillCellPulse 2.4s ease both}
      @keyframes accDrillPulse{0%,100%{transform:translateY(0)}18%{transform:translateY(-2px)}}
      @keyframes accDrillCellPulse{0%,100%{background-color:inherit}15%,65%{background-color:#eaf4ff}}
      .issue-actions .issue-jump,.issue-actions .issue-additional{position:relative}
      .issue-actions .issue-jump:after,.issue-actions .issue-additional:after{content:' ↗';font-size:10px;opacity:.65}
    `;document.head.appendChild(s);
  }

  function closeMobileSidebar(){
    document.querySelector('.acc-sidebar')?.classList.remove('open');
    document.querySelector('.acc-sidebar-backdrop')?.classList.remove('show');
  }

  function selectPeriod(periodId){
    if(!periodId)return;
    try{viewSchedulingPeriodId=periodId}catch(_){}
    try{adminSchedulingPeriodId=periodId}catch(_){}
    const view=document.getElementById('viewQuarterSelect');if(view&&[...view.options].some(o=>o.value===periodId))view.value=periodId;
    const admin=document.getElementById('adminQuarterSelect');if(admin&&[...admin.options].some(o=>o.value===periodId))admin.value=periodId;
  }

  async function goToSchedule(dateKey,userId,clinic,periodId){
    if(!isAdmin())return;
    closeMobileSidebar();
    selectPeriod(periodId);
    const p=periodById(periodId)||currentPeriod();
    let target=dateKey;
    if(!target&&p)target=p.period_start;
    if(target){
      try{currentWeekStart=getSunday(getDateFromKey(target))}catch(_){try{currentWeekStart=getSunday(localDate(target))}catch(__){}}
    }
    try{if(typeof loadWeek==='function')await loadWeek();else if(typeof renderSchedule==='function')renderSchedule()}catch(e){console.warn('Drill-down week load failed',e)}
    setTimeout(()=>highlightSchedule(userId,clinic,dateKey),120);
  }

  function clinicPanel(clinic){
    const panels=[...document.querySelectorAll('.clinic-panel')];
    if(!clinic)return panels[0]||null;
    return panels.find(p=>p.querySelector('.clinic-title')?.textContent.includes(clinic))||null;
  }

  function highlightSchedule(userId,clinic,dateKey){
    const panel=clinicPanel(clinic||(profiles||[]).find(p=>p.id===userId)?.clinic_site);
    if(!panel)return;
    panel.scrollIntoView({behavior:'smooth',block:'start'});
    const targetName=userId?nameFor(userId):'';
    if(targetName){
      const row=[...panel.querySelectorAll('tbody tr')].find(r=>r.querySelector('.employee-name')?.textContent.trim()===targetName.trim());
      if(row){row.classList.add('acc-drill-row-highlight');setTimeout(()=>row.classList.remove('acc-drill-row-highlight'),2600)}
    }
    if(dateKey){
      const dates=typeof getWeekDates==='function'?getWeekDates():[];
      const idx=dates.findIndex(d=>typeof getDateKey==='function'&&getDateKey(d)===dateKey);
      if(idx>=0){
        const table=panel.querySelector('table');
        const header=panel.querySelector(`thead tr th:nth-child(${idx+2})`);
        header?.classList.add('acc-drill-highlight');
        setTimeout(()=>header?.classList.remove('acc-drill-highlight'),2600);
        const scroller=panel.querySelector('.table-scroll');
        if(scroller&&header){const left=Math.max(0,header.offsetLeft-130);scroller.scrollTo({left,behavior:'smooth'})}
      }
    }
  }

  function issueForCard(card){
    const detail=card?.querySelector('.issue-detail')?.textContent.trim();
    const list=window.accScheduleIssuesSummary?.issues||[];
    return list.find(x=>String(x.detail||'').trim()===detail)||null;
  }

  async function openExactAdditional(issue){
    if(!issue)return;
    const periodId=window.accScheduleIssuesSummary?.period_id||currentPeriod()?.id||'';
    selectPeriod(periodId);
    document.getElementById('issuesCenterModal')?.classList.remove('show');
    if(typeof window.openOpenShifts!=='function')return;
    await window.openOpenShifts();
    const sel=document.getElementById('openShiftPeriodSelect');
    if(sel&&periodId&&[...sel.options].some(o=>o.value===periodId)){
      if(sel.value!==periodId){sel.value=periodId;sel.dispatchEvent(new Event('change',{bubbles:true}));}
    }
    focusAdditionalCard(issue,0);
  }

  function focusAdditionalCard(issue,attempt){
    const cards=[...document.querySelectorAll('#openShiftContent .open-shift-card')];
    const dateLabel=fmtDate(issue.date);
    const card=cards.find(c=>{
      const d=c.querySelector('.open-shift-date')?.textContent.trim()||'';
      const site=c.querySelector('.open-shift-site')?.textContent||'';
      return d===dateLabel&&(!issue.clinic||site.includes(issue.clinic));
    });
    if(card){card.classList.add('acc-drill-highlight');card.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>card.classList.remove('acc-drill-highlight'),2800);return}
    if(attempt<8)setTimeout(()=>focusAdditionalCard(issue,attempt+1),180);
  }

  function wireIssueCards(){
    if(!isAdmin())return;
    document.querySelectorAll('#issuesCenterContent .issue-card').forEach(card=>{
      if(card.dataset.drillWired==='1')return;card.dataset.drillWired='1';
      const jump=card.querySelector('.issue-jump');
      if(jump)jump.onclick=()=>{const issue=issueForCard(card);if(!issue)return;document.getElementById('issuesCenterModal')?.classList.remove('show');goToSchedule(issue.date,issue.user_id,issue.clinic,window.accScheduleIssuesSummary?.period_id)};
      const additional=card.querySelector('.issue-additional');
      if(additional)additional.onclick=()=>openExactAdditional(issueForCard(card));
    });
  }

  function wirePickingRows(){
    if(!isAdmin())return;
    const rows=[...document.querySelectorAll('#accRightRail .picking-row')];
    const ordered=typeof profiles!=='undefined'&&typeof getProfileName==='function'?[...(profiles||[])].filter(p=>p.active&&p.role==='employee'):[];
    rows.forEach(row=>{
      if(row.dataset.drillWired==='1')return;
      const label=row.querySelector('.picking-name')?.textContent.trim();
      const person=ordered.find(p=>getProfileName(p).trim()===label);
      if(!person)return;
      row.dataset.drillWired='1';row.classList.add('acc-drillable');row.tabIndex=0;row.title=`Open ${label}'s schedule`;
      const run=()=>goToSchedule(null,person.id,person.clinic_site,currentPeriod()?.id);
      row.addEventListener('click',run);row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();run()}});
    });
  }

  function scan(){wirePickingRows();wireIssueCards()}
  ensureStyles();
  setTimeout(scan,700);setTimeout(scan,1700);
  const observer=new MutationObserver(scan);
  const start=()=>{const app=document.getElementById('app');if(!app)return setTimeout(start,250);observer.observe(app,{childList:true,subtree:true});const issues=document.getElementById('issuesCenterModal');if(issues)observer.observe(issues,{childList:true,subtree:true});scan()};
  start();

  window.accAdminDrillToSchedule=goToSchedule;
  window.accAdminOpenExactAdditional=openExactAdditional;
})();