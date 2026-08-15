/* ACC Schedule Manager - premium app shell */
(function(){
'use strict';
const VERSION='2026.08.14.3';
console.info(`[ACC Schedule Manager] premium layout loaded: ${VERSION}`);
function role(){try{return currentProfile?.role||null}catch(_){return null}}
function isAdmin(){return role()==='admin'}
function isManager(){return role()==='manager'}
function isEmployee(){return role()==='employee'}
function isExternal(){return role()==='external'}
function closeSidebar(){document.getElementById('accSidebar')?.classList.remove('open');document.getElementById('accSidebarBackdrop')?.classList.remove('show')}
function openSidebar(){if(window.innerWidth>900)return;document.getElementById('accSidebar')?.classList.add('open');document.getElementById('accSidebarBackdrop')?.classList.add('show')}
function invoke(fn){closeSidebar();try{fn?.()}catch(e){console.warn(e)}}
function actions(){
 const common=[
  {section:'Scheduling',id:'navSchedule',icon:'▦',label:'Schedule',run:()=>document.querySelector('.schedule-header')?.scrollIntoView({behavior:'smooth',block:'start'})},
  {section:'Scheduling',id:'navMySchedule',icon:'◫',label:isExternal()?'My Additional Shifts':'My Schedule',show:isEmployee()||isExternal(),run:()=>window.openMySchedule?.()},
  {section:'Scheduling',id:'navAdditional',icon:'＋',label:'Additional Shifts',show:isAdmin()||isEmployee()||isExternal(),run:()=>window.openOpenShifts?.()},
 ];
 const admin=[
  {section:'Admin',id:'navQuarter',icon:'◉',label:'Quarter Dashboard',show:isAdmin(),run:()=>window.openQuarterDashboard?.()||window.openAdminQuarterDashboard?.()},
  {section:'Admin',id:'navIssues',icon:'◇',label:'Coverage & Exceptions',show:isAdmin(),run:()=>window.openIssuesCenter?.(),badge:'issues'},
  {section:'Admin',id:'navPeople',icon:'◌',label:'Manage People',show:isAdmin(),run:()=>window.openAdmin?.()},
  {section:'Admin',id:'navHistory',icon:'≡',label:'History',show:isAdmin(),run:()=>window.openScheduleHistory?.()},
  {section:'Admin',id:'navArchive',icon:'▣',label:'Archive',show:isAdmin(),run:()=>window.openArchiveCenter?.()},
 ];
 const manager=[
  {section:'Management',id:'navManagerSchedule',icon:'◎',label:'Schedule View',show:isManager(),run:()=>document.querySelector('.schedule-header')?.scrollIntoView({behavior:'smooth',block:'start'})},
  {section:'Management',id:'navManagerAdditional',icon:'＋',label:'Additional Shifts',show:isManager(),run:()=>window.openOpenShifts?.()},
 ];
 const system=[
  {section:'System',id:'navNotifications',icon:'♢',label:'Notifications',show:true,run:()=>window.openNotificationCenter?.()},
  {section:'System',id:'navAccount',icon:'⚙',label:'Account Settings',show:true,run:()=>window.openAccountManager?.()},
  {section:'System',id:'navSignOut',icon:'↪',label:'Sign Out',show:true,run:()=>window.logout?.()}
 ];
 return [...common,...admin,...manager,...system].filter(x=>x.show!==false);
}
function suppressLegacyHeaderControls(){
 const holder=document.querySelector('.topbar-user');if(!holder)return;
 holder.querySelectorAll('button').forEach(button=>{
  if(button.id==='accountRequestBell'||button.id==='accMobileMenuButton')return;
  const label=(button.textContent||'').trim().toLowerCase();
  if(['account','sign out','admin','admin ▾','manage people','quarter dashboard','history','archive','issues','additional shifts','my schedule','my additional shifts'].includes(label)){
   button.style.setProperty('display','none','important');
   button.setAttribute('aria-hidden','true');
  }
 });
 document.getElementById('compactAdminMenuWrap')?.style.setProperty('display','none','important');
 const mobile=document.getElementById('accMobileMenuButton');
 if(mobile) mobile.style.setProperty('display',window.innerWidth<=900?'inline-flex':'none','important');
}
function ensureShell(){
 const app=document.getElementById('app');if(!app)return;
 app.classList.add('acc-premium-shell');
 let backdrop=document.getElementById('accSidebarBackdrop');if(!backdrop){backdrop=document.createElement('div');backdrop.id='accSidebarBackdrop';backdrop.className='acc-sidebar-backdrop';backdrop.onclick=closeSidebar;document.body.appendChild(backdrop)}
 let side=document.getElementById('accSidebar');if(!side){side=document.createElement('aside');side.id='accSidebar';side.className='acc-sidebar';app.insertBefore(side,app.querySelector('.main-content'))}
 renderSidebar();ensureMobileButton();ensureDashboardStrip();suppressLegacyHeaderControls();
}
function renderSidebar(){
 const side=document.getElementById('accSidebar');if(!side)return;
 const grouped={};actions().forEach(a=>(grouped[a.section]||(grouped[a.section]=[])).push(a));
 side.innerHTML=`<div class="acc-sidebar-inner">${Object.entries(grouped).map(([section,items])=>`<div class="acc-sidebar-section"><div class="acc-sidebar-label">${section}</div>${items.map(a=>`<button class="acc-nav-item" id="${a.id}" type="button"><span class="acc-nav-icon">${a.icon}</span><span class="acc-nav-text">${a.label}</span>${a.badge?'<span class="acc-nav-badge" id="accIssuesNavBadge"></span>':''}</button>`).join('')}</div>`).join('')}<div class="acc-sidebar-footer"><strong>ACC Schedule Manager</strong>Scheduling, coverage, and staffing operations</div></div>`;
 actions().forEach(a=>{const b=document.getElementById(a.id);if(b)b.onclick=()=>invoke(a.run)});updateIssueBadge();
}
function ensureMobileButton(){
 const topbar=document.querySelector('.topbar-user');if(!topbar)return;
 let b=document.getElementById('accMobileMenuButton');if(!b){b=document.createElement('button');b.id='accMobileMenuButton';b.className='topbar-button acc-mobile-menu-button';b.type='button';b.setAttribute('aria-label','Open navigation');b.textContent='☰';topbar.insertBefore(b,topbar.firstChild);b.onclick=openSidebar}
 b.style.setProperty('display',window.innerWidth<=900?'inline-flex':'none','important');
}
function getPeriod(){try{return activeSchedulingPeriod||adminSchedulingPeriod||null}catch(_){return null}}
function ensureDashboardStrip(){
 const main=document.querySelector('.main-content');const header=document.querySelector('.schedule-header');if(!main||!header)return;
 let heading=document.getElementById('accMainHeading');if(!heading){heading=document.createElement('div');heading.id='accMainHeading';heading.className='acc-main-heading';header.insertAdjacentElement('beforebegin',heading)}
 heading.innerHTML=`<div><h2>${isAdmin()?'Schedule Overview':isManager()?'Schedule View':isExternal()?'Additional Shift Hub':'My Scheduling Workspace'}</h2><p>${isAdmin()?'Monitor the current quarter, staffing, and coverage.':isManager()?'View schedules and staffing updates.':isExternal()?'View and manage your claimed Additional Shifts.':'Build your schedule and track your Additional Shifts.'}</p></div>`;
 let strip=document.getElementById('accDashboardStrip');if(!strip){strip=document.createElement('div');strip.id='accDashboardStrip';strip.className='acc-dashboard-strip';heading.insertAdjacentElement('afterend',strip)}
 renderDashboardStrip();
}
function jumpToQuarter(){document.getElementById('quarterNavigator')?.scrollIntoView({behavior:'smooth',block:'center'})}
function jumpToWeek(){document.querySelector('.schedule-header')?.scrollIntoView({behavior:'smooth',block:'start'})}
function renderDashboardStrip(){
 const strip=document.getElementById('accDashboardStrip');if(!strip)return;
 let people='—',weeks='—',status='—',issues='0';
 try{people=(profiles||[]).filter(p=>p.active&&p.role==='employee').length}catch(_){}
 try{const p=getPeriod();if(p&&typeof getWeekStartDatesForPeriod==='function')weeks=getWeekStartDatesForPeriod(p).length}catch(_){}
 try{if(isEmployee()&&typeof getCurrentWeekSubmission==='function'){const s=getCurrentWeekSubmission();status=s?.status==='submitted'?'Submitted':s?.status==='needs_resubmission'?'Resubmit':'Draft'}else status=isAdmin()?'Admin':'View'}catch(_){}
 try{issues=String(window.accScheduleIssuesSummary?.count||0)}catch(_){}
 let cards=[];
 if(isAdmin()) cards=[
  {icon:'👥',label:'People',value:people,sub:'Active employees',run:()=>window.openAdmin?.()},
  {icon:'▦',label:'Weeks',value:weeks,sub:'Selected quarter',run:jumpToQuarter},
  {icon:'✓',label:'Access',value:'Admin',sub:'Full control',run:()=>window.openQuarterDashboard?.()},
  {icon:'⚠',label:'Issues',value:issues,sub:'Coverage & exceptions',run:()=>window.openIssuesCenter?.()}
 ];
 else if(isManager()) cards=[
  {icon:'👥',label:'People',value:people,sub:'Active employees',run:jumpToWeek},
  {icon:'▦',label:'Weeks',value:weeks,sub:'Selected quarter',run:jumpToQuarter},
  {icon:'👁',label:'Mode',value:'View only',sub:'Schedule access',run:jumpToWeek},
  {icon:'🔔',label:'Notifications',value:'Open',sub:'Schedule updates',run:()=>window.openNotificationCenter?.()}
 ];
 else if(isExternal()) cards=[
  {icon:'🕒',label:'My shifts',value:'View',sub:'Claimed Additional Shifts',run:()=>window.openMySchedule?.()},
  {icon:'＋',label:'Additional',value:'Available',sub:'Shift signup',run:()=>window.openOpenShifts?.()},
  {icon:'▦',label:'Quarter',value:weeks,sub:'Weeks in period',run:jumpToQuarter},
  {icon:'🔔',label:'Notifications',value:'Open',sub:'Shift alerts',run:()=>window.openNotificationCenter?.()}
 ];
 else cards=[
  {icon:'▦',label:'Weeks',value:weeks,sub:'Selected quarter',run:jumpToQuarter},
  {icon:'◫',label:'Week status',value:status,sub:'Current week',run:jumpToWeek},
  {icon:'＋',label:'Additional',value:'Available',sub:'Shift signup',run:()=>window.openOpenShifts?.()},
  {icon:'🔔',label:'Notifications',value:'Open',sub:'Scheduling alerts',run:()=>window.openNotificationCenter?.()}
 ];
 strip.innerHTML='';
 cards.forEach(card=>{const el=document.createElement('button');el.type='button';el.className='acc-stat-card acc-stat-card-action';el.innerHTML=`<div class="acc-stat-icon">${card.icon}</div><div class="acc-stat-copy"><div class="acc-stat-label">${card.label}</div><div class="acc-stat-value">${card.value}</div><div class="acc-stat-sub">${card.sub}</div></div><span class="acc-stat-arrow">›</span>`;el.onclick=()=>invoke(card.run);strip.appendChild(el)});
}
function updateIssueBadge(){const b=document.getElementById('accIssuesNavBadge');if(!b)return;const n=Number(window.accScheduleIssuesSummary?.count||0);b.textContent=n>99?'99+':String(n);b.style.display=n?'inline-flex':'none'}
function refresh(){ensureShell();renderSidebar();ensureDashboardStrip();updateIssueBadge();suppressLegacyHeaderControls()}
setTimeout(refresh,0);setTimeout(refresh,300);setTimeout(refresh,700);setTimeout(refresh,1800);
window.addEventListener('resize',()=>{ensureMobileButton();suppressLegacyHeaderControls();if(window.innerWidth>900)closeSidebar()});
if(typeof window.updateUserHeader==='function'){const old=window.updateUserHeader;window.updateUserHeader=function(...args){const r=old.apply(this,args);setTimeout(refresh,0);setTimeout(suppressLegacyHeaderControls,80);return r}}
if(typeof window.renderSchedule==='function'){const old=window.renderSchedule;window.renderSchedule=function(...args){const r=old.apply(this,args);setTimeout(renderDashboardStrip,0);return r}}
const headerObserver=new MutationObserver(()=>setTimeout(suppressLegacyHeaderControls,0));
setTimeout(()=>{const h=document.querySelector('.topbar-user');if(h)headerObserver.observe(h,{childList:true,subtree:false})},0);
window.refreshPremiumLayout=refresh;
window.renderPremiumDashboardStrip=renderDashboardStrip;
})();