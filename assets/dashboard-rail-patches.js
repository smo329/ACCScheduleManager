/* ACC Schedule Manager - premium dashboard right rail + profile header */
(function(){
'use strict';
const VERSION='2026.08.14.1';
let accessRows=[];
console.info(`[ACC Schedule Manager] dashboard rail loaded: ${VERSION}`);

const role=()=>{try{return currentProfile?.role||''}catch(_){return''}};
const isAdmin=()=>role()==='admin';
const isEmployee=()=>role()==='employee';
const isExternal=()=>role()==='external';
const isManager=()=>role()==='manager';
const name=()=>{try{return getProfileName(currentProfile)||'User'}catch(_){return [currentProfile?.first_name,currentProfile?.last_name].filter(Boolean).join(' ')||'User'}};
const period=()=>{try{return adminSchedulingPeriod||activeSchedulingPeriod||allSchedulingPeriods?.find(p=>p.id===viewSchedulingPeriodId)||null}catch(_){return null}};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function initials(){const parts=name().trim().split(/\s+/);return ((parts[0]?.[0]||'')+(parts.length>1?(parts.at(-1)?.[0]||''):'')).toUpperCase()||'U'}
function roleLabel(){return ({admin:'Administrator',employee:'Employee',manager:'Clinic Manager',external:'External Shift Worker'})[role()]||role()||'User'}

function ensureStyles(){
 if(document.getElementById('dashboardRailStyles'))return;
 const s=document.createElement('style');s.id='dashboardRailStyles';s.textContent=`
 .acc-workspace-shell{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:start}
 .acc-workspace-main{min-width:0}.acc-right-rail{display:flex;flex-direction:column;gap:14px;position:sticky;top:92px;max-height:calc(100vh - 110px);overflow:auto;padding-bottom:8px}
 .rail-card{background:#fff;border:1px solid #dbe4f0;border-radius:16px;padding:16px;box-shadow:0 8px 24px rgba(15,35,70,.07)}
 .rail-title{font-size:15px;font-weight:850;color:#14345f;display:flex;align-items:center;gap:8px;margin-bottom:11px}.rail-subtle{font-size:11px;color:#738196;line-height:1.45}.rail-count{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;border-radius:999px;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:850;padding:0 7px}
 .rail-action{width:100%;display:flex;align-items:center;gap:10px;border:0;background:transparent;border-radius:10px;padding:10px 8px;text-align:left;cursor:pointer;color:#18365f;font-weight:720;font-size:12px}.rail-action:hover{background:#eef5ff}.rail-action-icon{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:#eef5ff;color:#175ea8;font-size:15px;flex:none}
 .rail-primary{width:100%;margin-top:10px;border:0;border-radius:10px;padding:10px 12px;background:linear-gradient(135deg,#0d376f,#174e96);color:#fff;font-weight:800;cursor:pointer;box-shadow:0 7px 18px rgba(23,78,150,.18)}
 .picking-list{display:flex;flex-direction:column;gap:7px}.picking-row{display:grid;grid-template-columns:24px 1fr auto auto;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #eef2f7}.picking-order{display:flex;gap:3px}.picking-order button{width:22px;height:22px;border:1px solid #d5dfeb;border-radius:6px;background:#fff;color:#17365d;font-size:11px;cursor:pointer;line-height:1}.picking-order button:disabled{opacity:.35;cursor:default}.picking-row:last-child{border-bottom:0}.picking-num{width:22px;height:22px;border-radius:7px;background:#f1f5f9;display:grid;place-items:center;font-size:10px;font-weight:850;color:#456}.picking-name{font-size:11px;font-weight:760;color:#243c5a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pick-chip{font-size:9px;font-weight:850;border-radius:999px;padding:4px 7px;background:#f1f5f9;color:#64748b}.pick-chip.open{background:#dcfce7;color:#166534}.pick-chip.done{background:#dbeafe;color:#1d4ed8}
 .rail-issue-good{display:flex;align-items:center;gap:9px;color:#166534;font-size:12px;font-weight:750}.rail-issue-dot{width:30px;height:30px;border-radius:10px;background:#dcfce7;display:grid;place-items:center}.rail-issue-copy{font-size:12px;color:#475569;line-height:1.5}.rail-issue-card.has-issues{border-color:#fed7aa;background:linear-gradient(180deg,#fff,#fffaf3)}
 .premium-profile{display:flex;align-items:center;gap:9px;margin-left:4px}.premium-avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#2563eb,#19489a);color:#fff;font-weight:850;font-size:12px;box-shadow:0 6px 16px rgba(37,99,235,.25)}.premium-profile-copy{display:flex;flex-direction:column;line-height:1.15}.premium-profile-name{font-size:12px;font-weight:850;color:#fff}.premium-profile-role{font-size:10px;color:#b9c9e3;margin-top:3px}
 .topbar-user>.user-name,.topbar-user>.role-badge{display:none!important}
 .rail-personal-stat{font-size:28px;font-weight:880;color:#14345f;line-height:1}.rail-personal-label{font-size:11px;color:#738196;margin-top:5px}
 @media(max-width:1250px){.acc-workspace-shell{grid-template-columns:minmax(0,1fr) 270px}.acc-right-rail{top:84px}}
 @media(max-width:1000px){.acc-workspace-shell{display:block}.acc-right-rail{display:none}.premium-profile-copy{display:none}.premium-avatar{width:34px;height:34px}}
 @media(max-width:620px){.premium-profile{margin-left:0}.premium-avatar{width:32px;height:32px;font-size:10px}}
 `;document.head.appendChild(s);
}

function enhanceHeader(){
 const holder=document.querySelector('.topbar-user');if(!holder||!currentProfile)return;
 let p=document.getElementById('premiumProfile');
 if(!p){p=document.createElement('div');p.id='premiumProfile';p.className='premium-profile';const bell=document.getElementById('accountRequestBell');if(bell)bell.insertAdjacentElement('afterend',p);else holder.prepend(p)}
 p.innerHTML=`<div class="premium-avatar">${esc(initials())}</div><div class="premium-profile-copy"><div class="premium-profile-name">${esc(name())}</div><div class="premium-profile-role">${esc(roleLabel())}</div></div>`;
}

function ensureShell(){
 const main=document.querySelector('.main-content');if(!main||document.getElementById('accWorkspaceShell'))return;
 const shell=document.createElement('div');shell.id='accWorkspaceShell';shell.className='acc-workspace-shell';
 const left=document.createElement('div');left.id='accWorkspaceMain';left.className='acc-workspace-main';
 const rail=document.createElement('aside');rail.id='accRightRail';rail.className='acc-right-rail';
 [...main.children].forEach(ch=>left.appendChild(ch));shell.append(left,rail);main.appendChild(shell);
}

async function loadAccess(){
 const p=period();if(!p){accessRows=[];return}
 const {data,error}=await supabaseClient.from('scheduling_period_access').select('user_id,is_open,opened_at,closed_at,updated_at,pick_order').eq('period_id',p.id);
 if(error){console.warn('Right rail access load failed',error);accessRows=[];return}accessRows=data||[];
}
function employeeRows(){try{return (profiles||[]).filter(p=>p.active&&p.role==='employee')}catch(_){return[]}}
function accessFor(id){return accessRows.find(x=>x.user_id===id)||null}
function pickingRows(){
 const emps=employeeRows();
 return emps.sort((a,b)=>{const aa=accessFor(a.id),bb=accessFor(b.id);const aRank=aa?.is_open?0:(aa?.closed_at?2:1);const bRank=bb?.is_open?0:(bb?.closed_at?2:1);if(aRank!==bRank)return aRank-bRank;if(aRank===1){const ao=aa?.pick_order,bo=bb?.pick_order;if(ao!=null||bo!=null){if(ao==null)return 1;if(bo==null)return -1;if(ao!==bo)return ao-bo;}}const at=aa?.opened_at||'9999',bt=bb?.opened_at||'9999';if(at!==bt)return at.localeCompare(bt);return getProfileName(a).localeCompare(getProfileName(b));});
}
function waitingRows(){return pickingRows().filter(pr=>{const a=accessFor(pr.id);return !a?.is_open&&!a?.closed_at})}
async function movePickingOrder(userId,dir){
 if(!isAdmin())return;const p=period();if(!p)return;const waiting=waitingRows();const idx=waiting.findIndex(pr=>pr.id===userId);if(idx<0)return;const swapIdx=idx+dir;if(swapIdx<0||swapIdx>=waiting.length)return;const next=[...waiting];[next[idx],next[swapIdx]]=[next[swapIdx],next[idx]];try{for(let i=0;i<next.length;i++){const {error}=await supabaseClient.from('scheduling_period_access').upsert({period_id:p.id,user_id:next[i].id,pick_order:i+1},{onConflict:'period_id,user_id'});if(error)throw error}await loadAccess();await renderRail()}catch(e){console.warn('Picking reorder failed:',e)}
}

function quickActions(){
 if(isAdmin())return [
  ['＋','Add Additional Shift',()=>window.openOpenShifts?.()],
  ['✚','Add Known Leave',()=>{if(window.openKnownLeaveManager)window.openKnownLeaveManager();else window.openQuarterDashboardPanel?.()}],
  // People-only mode (see premium-layout-patches.js): show the people list, not the quarter controls.
  ['👤','Add Personnel',()=>{window.openPeopleManagement?.()||window.openAdmin?.();setTimeout(()=>window.openAddEmployeeSection?.(),80)}],
  ['⚠','Review Issues',()=>window.openIssuesCenter?.()]
 ];
 if(isEmployee())return [['▦','My Schedule',()=>window.openMySchedule?.()],['＋','Additional Shifts',()=>window.openOpenShifts?.()],['🔔','Notifications',()=>window.openNotificationCenter?.()]];
 if(isExternal())return [['＋','Additional Shifts',()=>window.openOpenShifts?.()],['▦','My Additional Shifts',()=>window.openMySchedule?.()],['🔔','Notifications',()=>window.openNotificationCenter?.()]];
 if(isManager())return [['▦','Schedule',()=>window.scrollTo({top:0,behavior:'smooth'})],['＋','Additional Shifts',()=>window.openOpenShifts?.()],['🔔','Notifications',()=>window.openNotificationCenter?.()]];
 return [];
}

function pickingCardHtml(){
 const p=period();const rows=pickingRows();const waiting=waitingRows();const waitingIds=new Set(waiting.map(pr=>pr.id));
 return `<section class="rail-card"><div class="rail-title">Picking Status</div><div class="rail-subtle" style="margin-bottom:8px">${esc(p?.name||'Selected quarter')}</div><div class="picking-list">${rows.map((pr,i)=>{const a=accessFor(pr.id);const cls=a?.is_open?'open':a?.closed_at?'done':'';const txt=a?.is_open?'Open':a?.closed_at?'Closed':'Waiting';const wIdx=waiting.findIndex(w=>w.id===pr.id);const arrows=(isAdmin()&&wIdx>=0)?`<div class="picking-order"><button type="button" data-move="${esc(pr.id)}|-1" ${wIdx===0?'disabled':''} aria-label="Move up">↑</button><button type="button" data-move="${esc(pr.id)}|1" ${wIdx===waiting.length-1?'disabled':''} aria-label="Move down">↓</button></div>`:'';return `<div class="picking-row"><div class="picking-num">${i+1}</div><div class="picking-name">${esc(getProfileName(pr))}</div><span class="pick-chip ${cls}">${txt}</span>${arrows}</div>`}).join('')||'<div class="rail-subtle">No active employees.</div>'}</div>${isAdmin()?'<button class="rail-primary" id="railManagePeople" style="background:#fff;color:#17365d;border:1px solid #cad7e7;box-shadow:none">Manage People</button>':''}</section>`;
}
function bindPickingCard(rail){
 rail.querySelectorAll('[data-move]').forEach(b=>{b.onclick=()=>{const [id,dir]=b.dataset.move.split('|');movePickingOrder(id,Number(dir))}});
 rail.querySelector('#railManagePeople')?.addEventListener('click',()=>window.openPeopleManagement?.()||window.openAdmin?.());
}
function renderAdminRail(rail){
 const sum=window.accScheduleIssuesSummary||{count:0,high:0};
 const p=period();const rows=pickingRows();
 rail.innerHTML=`
 <section class="rail-card rail-issue-card ${sum.count?'has-issues':''}">
   <div class="rail-title">${sum.count?'⚠':'✓'} Scheduling Issues ${sum.count?`<span class="rail-count">${sum.count}</span>`:''}</div>
   ${sum.count?`<div class="rail-issue-copy">There ${sum.count===1?'is':'are'} <strong>${sum.count}</strong> actionable issue${sum.count===1?'':'s'}${sum.high?`, including ${sum.high} high priority`:''}.</div><button class="rail-primary" id="railViewIssues">View Issues →</button>`:`<div class="rail-issue-good"><span class="rail-issue-dot">✓</span><span>No actionable issues detected.</span></div>`}
 </section>
 <section class="rail-card"><div class="rail-title">Quick Actions</div><div id="railQuickActions"></div></section>
 ${pickingCardHtml()}`;
 rail.querySelector('#railViewIssues')?.addEventListener('click',()=>window.openIssuesCenter?.());
 bindPickingCard(rail);
}

function renderPersonalRail(rail){
 const title=isExternal()?'My Additional Shifts':'My Schedule';
 rail.innerHTML=`<section class="rail-card"><div class="rail-title">${esc(title)}</div><div class="rail-personal-stat">40</div><div class="rail-personal-label">weekly target hours</div><button class="rail-primary" id="railMySchedule">Open ${esc(title)}</button></section>${isExternal()?'':pickingCardHtml()}<section class="rail-card"><div class="rail-title">Quick Actions</div><div id="railQuickActions"></div></section><section class="rail-card"><div class="rail-title">Need something?</div><div class="rail-subtle">Use Notifications to see scheduling-open alerts and newly published Additional Shifts.</div><button class="rail-primary" id="railNotifications">Open Notifications</button></section>`;
 rail.querySelector('#railMySchedule')?.addEventListener('click',()=>window.openMySchedule?.());
 bindPickingCard(rail);
 rail.querySelector('#railNotifications')?.addEventListener('click',()=>window.openNotificationCenter?.());
}
function renderManagerRail(rail){
 rail.innerHTML=`<section class="rail-card"><div class="rail-title">Clinic View</div><div class="rail-subtle">Read-only access to schedules, comments, and Additional Shift activity.</div></section>${pickingCardHtml()}<section class="rail-card"><div class="rail-title">Quick Actions</div><div id="railQuickActions"></div></section>`;
 bindPickingCard(rail);
}
function renderActions(){const box=document.getElementById('railQuickActions');if(!box)return;quickActions().forEach(([icon,label,run])=>{const b=document.createElement('button');b.type='button';b.className='rail-action';b.innerHTML=`<span class="rail-action-icon">${icon}</span><span>${esc(label)}</span>`;b.onclick=run;box.appendChild(b)})}

async function renderRail(){
 ensureStyles();ensureShell();enhanceHeader();const rail=document.getElementById('accRightRail');if(!rail||!currentProfile)return;
 await loadAccess();if(isAdmin())renderAdminRail(rail);else if(isManager())renderManagerRail(rail);else renderPersonalRail(rail);
 renderActions();
}

setTimeout(()=>renderRail().catch(console.warn),500);setTimeout(()=>renderRail().catch(console.warn),1600);
if(typeof updateUserHeader==='function'){const old=updateUserHeader;updateUserHeader=function(...args){const r=old.apply(this,args);setTimeout(()=>renderRail().catch(console.warn),0);return r}}
if(typeof window.refreshIssuesCenter==='function'){const oldIssues=window.refreshIssuesCenter;window.refreshIssuesCenter=async function(...args){const r=await oldIssues.apply(this,args);setTimeout(()=>renderRail().catch(console.warn),0);return r}}
window.refreshDashboardRail=renderRail;
})();