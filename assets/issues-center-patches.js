/* ACC Schedule Manager - Admin Issues Center */
(function(){
  'use strict';
  const VERSION='2026.08.14.1';
  let issues=[];
  let currentPeriodId=null;
  console.info(`[ACC Schedule Manager] issues center loaded: ${VERSION}`);

  function isAdmin(){try{return currentProfile?.role==='admin'&&currentProfile?.active!==false}catch(_){return false}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function period(){try{return adminSchedulingPeriod||activeSchedulingPeriod||allSchedulingPeriods?.find(p=>p.id===viewSchedulingPeriodId)||null}catch(_){return null}}
  function personName(id){try{const p=(profiles||[]).find(x=>x.id===id);return p?getProfileName(p):'Employee'}catch(_){return 'Employee'}}
  function fmtDate(k){if(!k)return '—';const [y,m,d]=String(k).slice(0,10).split('-').map(Number);return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric'}).format(new Date(y,m-1,d));}
  function fmtHour(h){h=Number(h);if(!Number.isFinite(h))return '—';if(h===12)return '12 PM';return h<12?`${h} AM`:`${h-12} PM`;}

  function ensureStyles(){if(document.getElementById('issuesCenterStyles'))return;const s=document.createElement('style');s.id='issuesCenterStyles';s.textContent=`
    .issues-summary-alert{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;margin:10px 0;border-radius:8px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;font-size:12px}
    .issues-summary-alert strong{font-size:13px}.issues-summary-alert .modal-button{white-space:nowrap}
    .issue-group{margin-bottom:18px}.issue-group-title{font-weight:800;color:#17365d;margin-bottom:8px}.issue-card{border:1px solid #e2e8f0;border-left:4px solid #f59e0b;border-radius:8px;padding:11px;margin-bottom:8px;background:#fff}.issue-card.high{border-left-color:#dc2626}.issue-title{font-weight:800;color:#334155}.issue-detail{font-size:12px;color:#64748b;margin-top:4px;line-height:1.45}.issue-actions{margin-top:8px;display:flex;gap:7px;flex-wrap:wrap}.issues-empty{padding:24px;text-align:center;border:1px dashed #cbd5e1;border-radius:8px;color:#64748b}
    #issuesMenuBadge{margin-left:auto;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#dc2626;color:#fff;display:none;align-items:center;justify-content:center;font-size:10px;font-weight:800}
    @media(max-width:760px){#issuesCenterModal .modal{width:100%;height:100%;max-width:none;max-height:none;border-radius:0}.issues-summary-alert{align-items:flex-start;flex-direction:column}.issues-summary-alert .modal-button{width:100%}.issue-actions{display:grid;grid-template-columns:1fr}.issue-actions .modal-button{width:100%}}
  `;document.head.appendChild(s)}

  function ensureModal(){let m=document.getElementById('issuesCenterModal');if(m)return m;m=document.createElement('div');m.id='issuesCenterModal';m.className='modal-overlay';m.innerHTML=`<div class="modal modal-wide" style="max-width:900px"><div class="modal-header"><div class="modal-title">Coverage & Exceptions</div><button class="modal-close" type="button">×</button></div><div class="modal-body modal-scroll"><div id="issuesCenterPeriod" style="font-size:12px;color:#64748b;margin-bottom:10px"></div><div id="issuesCenterContent"><div class="issues-empty">Loading issues…</div></div></div><div class="modal-footer"><button id="issuesRefresh" class="modal-button cancel-button" type="button">Refresh</button><button id="issuesClose" class="modal-button cancel-button" type="button">Close</button></div></div>`;document.body.appendChild(m);m.querySelector('.modal-close').onclick=()=>m.classList.remove('show');m.querySelector('#issuesClose').onclick=()=>m.classList.remove('show');m.querySelector('#issuesRefresh').onclick=()=>scan(true);return m}

  async function scan(force=false){if(!isAdmin())return[];const p=period();if(!p){issues=[];publish();return issues}if(!force&&currentPeriodId===p.id&&issues.length)return issues;currentPeriodId=p.id;const found=[];
    const [sRes,cRes,kRes,oRes,aRes]=await Promise.all([
      supabaseClient.from('schedules').select('user_id,schedule_date,schedule_code,work_site').gte('schedule_date',p.period_start).lte('schedule_date',p.period_end),
      supabaseClient.from('clinic_capacity').select('clinic_site,capacity_date,shift_capacity').gte('capacity_date',p.period_start).lte('capacity_date',p.period_end),
      supabaseClient.from('scheduling_known_leave').select('user_id,leave_date,leave_type,hours').eq('period_id',p.id),
      supabaseClient.from('open_shift_opportunities').select('id,shift_date,clinic_site,start_hour,end_hour,status').eq('period_id',p.id).eq('status','published'),
      supabaseClient.from('scheduling_period_access').select('user_id,is_open').eq('period_id',p.id)
    ]);
    const schedules=sRes.data||[], capacities=cRes.data||[], known=kRes.data||[], opps=oRes.data||[], access=aRes.data||[];
    const ids=opps.map(x=>x.id);let claims=[];if(ids.length){const r=await supabaseClient.from('open_shift_claims').select('opportunity_id,user_id,start_hour,end_hour').in('opportunity_id',ids);claims=r.data||[]}

    // Additional Shifts that remain partially or completely uncovered.
    opps.forEach(o=>{const rows=claims.filter(c=>c.opportunity_id===o.id);const covered=rows.reduce((n,c)=>n+Math.max(0,Number(c.end_hour)-Number(c.start_hour)),0);const total=Number(o.end_hour)-Number(o.start_hour);if(covered<total){found.push({type:'additional',severity:covered===0?'high':'medium',title:covered===0?'Additional Shift unfilled':'Additional Shift partially filled',detail:`${fmtDate(o.shift_date)} · ${o.clinic_site} · ${covered}/${total} hours covered`,date:o.shift_date,clinic:o.clinic_site,remaining:total-covered});}});

    // Capacity overages are always actionable.
    function defaultCap(site,dateKey){try{return getDefaultClinicCapacity(site,getDateFromKey(dateKey))}catch(_){const d=new Date(dateKey+'T12:00:00');return site==='Turfland'?(d.getDay()>=1&&d.getDay()<=4?3:2):(d.getDay()===2||d.getDay()===3?2:1)}}
    const capMap=new Map(capacities.map(x=>[`${x.clinic_site}|${x.capacity_date}`,Number(x.shift_capacity)]));
    const dates=[...new Set(schedules.filter(x=>x.schedule_code==='12').map(x=>x.schedule_date))];
    dates.forEach(date=>['Turfland','Fountain Court'].forEach(site=>{const count=schedules.filter(r=>r.schedule_date===date&&r.schedule_code==='12'&&((r.work_site)||((profiles||[]).find(p=>p.id===r.user_id)?.clinic_site))===site).length;const cap=capMap.get(`${site}|${date}`)??defaultCap(site,date);if(count>cap)found.push({type:'capacity',severity:'high',title:'Clinic is over capacity',detail:`${fmtDate(date)} · ${site} · ${count} scheduled for ${cap} available shift${cap===1?'':'s'}`,date,clinic:site});}));

    // Known leave for a still-waiting employee where usable dates are tight.
    const waiting=(profiles||[]).filter(pr=>pr.active&&pr.role==='employee'&&!access.find(a=>a.user_id===pr.id)?.is_open);
    const byWeek=new Map();known.forEach(k=>{if(Number(k.hours||0)<12)return;const d=new Date(k.leave_date+'T12:00:00');d.setDate(d.getDate()-d.getDay());const ws=d.toISOString().slice(0,10);const key=`${k.user_id}|${ws}`;if(!byWeek.has(key))byWeek.set(key,[]);byWeek.get(key).push(k.leave_date)});
    for(const pr of waiting){for(const [key,offDates] of byWeek){const [uid,ws]=key.split('|');if(uid!==pr.id)continue;let usable=0;for(let i=0;i<7;i++){const d=new Date(ws+'T12:00:00');d.setDate(d.getDate()+i);const dk=d.toISOString().slice(0,10);if(offDates.includes(dk))continue;const cap=capMap.get(`${pr.clinic_site}|${dk}`)??defaultCap(pr.clinic_site,dk);const count=schedules.filter(r=>r.schedule_date===dk&&r.schedule_code==='12'&&((r.work_site)||((profiles||[]).find(p=>p.id===r.user_id)?.clinic_site))===pr.clinic_site).length;if(count<cap)usable++;}if(usable<=2){found.push({type:'future',severity:usable<=1?'high':'medium',title:'Future pick risk',detail:`${personName(pr.id)} · week of ${fmtDate(ws)} · only ${usable} usable 12-hour date${usable===1?'':'s'} remain after known leave`,date:ws,user_id:pr.id});}}}

    issues=found.sort((a,b)=>(a.severity==='high'?0:1)-(b.severity==='high'?0:1)||String(a.date||'').localeCompare(String(b.date||'')));publish();render();return issues;
  }

  function publish(){const p=period();window.accScheduleIssuesSummary={count:issues.length,high:issues.filter(x=>x.severity==='high').length,period_id:p?.id||null,period_name:p?.name||'selected quarter',issues:[...issues]};updateMenuBadge();renderDashboardAlert();if(typeof window.refreshNotificationCenter==='function')setTimeout(()=>window.refreshNotificationCenter(),0)}
  function updateMenuBadge(){const b=document.getElementById('issuesMenuBadge');if(!b)return;b.textContent=issues.length>99?'99+':String(issues.length);b.style.display=issues.length?'inline-flex':'none'}
  function renderDashboardAlert(){if(!isAdmin())return;const host=document.getElementById('quarterDashboardContent');if(!host)return;host.querySelector('#issuesSummaryAlert')?.remove();if(!issues.length)return;const d=document.createElement('div');d.id='issuesSummaryAlert';d.className='issues-summary-alert';d.innerHTML=`<div><strong>⚠ ${issues.length} scheduling issue${issues.length===1?'':'s'} need review</strong><div>${issues.filter(x=>x.severity==='high').length} high priority. Details are kept in the separate Issues area.</div></div><button class="modal-button cancel-button" type="button">View Issues</button>`;d.querySelector('button').onclick=window.openIssuesCenter;host.prepend(d)}

  function render(){const m=document.getElementById('issuesCenterModal');if(!m)return;const p=period();m.querySelector('#issuesCenterPeriod').textContent=p?`${p.name} · ${p.period_start} – ${p.period_end}`:'';const box=m.querySelector('#issuesCenterContent');if(!issues.length){box.innerHTML='<div class="issues-empty">No actionable issues detected for this quarter.</div>';return}const groups=[['future','Future Pick Risks'],['capacity','Capacity Problems'],['additional','Additional Shifts']];box.innerHTML=groups.map(([type,label])=>{const rows=issues.filter(x=>x.type===type);if(!rows.length)return'';return `<div class="issue-group"><div class="issue-group-title">${label} (${rows.length})</div>${rows.map(x=>`<div class="issue-card ${x.severity==='high'?'high':''}"><div class="issue-title">${esc(x.title)}</div><div class="issue-detail">${esc(x.detail)}</div><div class="issue-actions"><button class="modal-button cancel-button issue-jump" data-date="${esc(x.date||'')}" type="button">Go to Date</button>${type==='additional'?'<button class="modal-button save-button issue-additional" type="button">Open Additional Shifts</button>':''}</div></div>`).join('')}</div>`}).join('');box.querySelectorAll('.issue-jump').forEach(b=>b.onclick=()=>jumpDate(b.dataset.date));box.querySelectorAll('.issue-additional').forEach(b=>b.onclick=()=>{m.classList.remove('show');window.openOpenShifts?.()});}
  function jumpDate(date){if(!date)return;try{currentWeekStart=getSunday(getDateFromKey(date));document.getElementById('issuesCenterModal')?.classList.remove('show');loadWeek?.();}catch(e){console.warn(e)}}

  window.openIssuesCenter=async function(){if(!isAdmin())return;ensureStyles();const m=ensureModal();m.classList.add('show');await scan(true)};
  window.refreshIssuesCenter=()=>scan(true);
  ensureStyles();ensureModal();setTimeout(()=>scan(true).catch(console.warn),1200);
  setInterval(()=>{if(isAdmin())scan(true).catch(console.warn)},300000);
})();