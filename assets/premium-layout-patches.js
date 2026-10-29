/* ACC Schedule Manager - premium app shell */
(function(){
'use strict';
const VERSION='2026.10.23.1';
console.info(`[ACC Schedule Manager] premium layout loaded: ${VERSION}`);
function role(){try{return currentProfile?.role||null}catch(_){return null}}
function isAdmin(){return role()==='admin'}
function isManager(){return role()==='manager'}
function isEmployee(){return role()==='employee'}
function isExternal(){return role()==='external'}
function closeSidebar(){document.getElementById('accSidebar')?.classList.remove('open');document.getElementById('accSidebarBackdrop')?.classList.remove('show')}
function openSidebar(){closeUserMenu();if(window.innerWidth>900)return;document.getElementById('accSidebar')?.classList.add('open');document.getElementById('accSidebarBackdrop')?.classList.add('show')}
function invoke(fn){closeSidebar();try{fn?.()}catch(e){console.warn(e)}}
function actions(){
 const common=[
  {section:'Scheduling',id:'navSchedule',icon:'▦',label:'Schedule',run:()=>document.querySelector('.schedule-header')?.scrollIntoView({behavior:'smooth',block:'start'})},
  {section:'Scheduling',id:'navMySchedule',icon:'◫',label:isExternal()?'My Additional Shifts':'My Schedule',show:isEmployee()||isExternal(),run:()=>window.openMySchedule?.()},
  {section:'Scheduling',id:'navAdditional',icon:'＋',label:'Additional Shifts',show:isAdmin()||isEmployee()||isExternal(),run:()=>window.openOpenShifts?.()},
  // Calendar & Print was previously appended to the sidebar by calendar-print-patches.js
  // (installNav, on fixed timers and on refreshPremiumLayout only). Every renderSidebar()
  // rebuilds the sidebar from actions() and wipes that appended button, and the login path
  // (updateUserHeader -> refresh()) bypasses refreshPremiumLayout, so a freshly signed-in
  // employee never got the button back — while an already-signed-in admin reloading the
  // page could, from the script-load timers. Making it a first-class action here, shown
  // to every signed-in role, means renderSidebar() includes it on every rebuild. It
  // reuses id navCalendarPrint, so calendar-print's installNav() sees it and skips
  // adding a duplicate.
  {section:'Scheduling',id:'navCalendarPrint',icon:'▤',label:'Calendar & Print',show:true,run:()=>window.openCalendarPrint?.()},
  // Trade Center was previously appended by trade-center-patches.js (installNav, on
  // fixed timers and after every refreshPremiumLayout/updateUserHeader). Every
  // renderSidebar() rebuilds the sidebar from actions() and wipes that appended
  // button, so during the login/refresh render storm it kept vanishing and
  // reappearing — the flicker. Making it a first-class action here means
  // renderSidebar() includes it on every rebuild, in a stable position.
  // Visibility mirrors trade-center's eligible(): admins, managers and
  // employees only, never externals, never in view-as mode.
  {section:'Scheduling',id:'navTradeCenter',icon:'⇄',label:'Trade Center',show:(isAdmin()||isManager()||isEmployee())&&!window.viewAsActive,run:()=>window.openTradeCenter?.()},
 ];
 const admin=[
  // Use the separated modes already defined in admin-experience-patches.js instead of
  // openAdmin() directly: openPeopleManagement() shows only the people list (hiding the
  // quarter controls and Quarter Dashboard), and openQuarterDashboardPanel() shows only
  // the quarter controls and Quarter Dashboard (hiding the people list). The old
  // openQuarterDashboard / openAdminQuarterDashboard functions do not exist, so the
  // Quarter Dashboard sidebar item previously did nothing at all.
  {section:'Admin',id:'navQuarter',icon:'◉',label:'Quarter Dashboard',show:isAdmin(),run:()=>window.openQuarterDashboardPanel?.()||window.openAdmin?.()},
  {section:'Admin',id:'navIssues',icon:'◇',label:'Coverage & Exceptions',show:isAdmin(),run:()=>window.openIssuesCenter?.(),badge:'issues'},
  {section:'Admin',id:'navPeople',icon:'◌',label:'Manage People',show:isAdmin(),run:()=>window.openPeopleManagement?.()||window.openAdmin?.()},
  {section:'Admin',id:'navHistory',icon:'≡',label:'History',show:isAdmin(),run:()=>window.openScheduleHistory?.()},
  {section:'Admin',id:'navArchive',icon:'▣',label:'Archive',show:isAdmin(),run:()=>window.openArchiveCenter?.()},
  {section:'Admin',id:'navCriticalLabs',icon:'🧪',label:'Critical Labs',show:isAdmin(),run:()=>window.openCriticalLabsManager?.()},
 ];
 const manager=[
  {section:'Management',id:'navManagerSchedule',icon:'◎',label:'Schedule View',show:isManager(),run:()=>document.querySelector('.schedule-header')?.scrollIntoView({behavior:'smooth',block:'start'})},
  {section:'Management',id:'navManagerAdditional',icon:'＋',label:'Additional Shifts',show:isManager(),run:()=>window.openOpenShifts?.()},
 ];
 return [...common,...admin,...manager].filter(x=>x.show!==false);
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
  {icon:'👥',label:'People',value:people,sub:'Active employees',run:()=>window.openPeopleManagement?.()||window.openAdmin?.()},
  {icon:'▦',label:'Weeks',value:weeks,sub:'Selected quarter',run:jumpToQuarter},
  {icon:'✓',label:'Access',value:'Admin',sub:'Full control',run:()=>{if(typeof window.openViewAsPicker==='function')window.openViewAsPicker();else if(window.openQuarterDashboardPanel)window.openQuarterDashboardPanel();else if(window.openAdmin)window.openAdmin();}},
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
  {icon:'＋',label:'Additional',value:'Available',sub:'Shift signup',run:()=>window.openOpenShifts?.()},
  {icon:'▦',label:'My Schedule',value:'View',sub:'Your schedule',run:()=>window.openMySchedule?.()},
  /* Employees get a My Critical Labs card like the My Holidays card; in
     view-as mode the Week status card stays, so an admin acting as
     someone never opens that person's coverage view. */
  ...(window.viewAsActive
   ? [{icon:'◫',label:'Week status',value:status,sub:'Current week',run:jumpToWeek}]
   : [{icon:'🧪',label:'My Critical Labs',value:'View',sub:'Your coverage weeks',run:()=>window.openMyCriticalLabs?.()}]),
  {icon:'🔔',label:'Notifications',value:'Open',sub:'Scheduling alerts',run:()=>window.openNotificationCenter?.()}
 ];
 if(window.viewAsActive&&window.viewAsProfile){
  let targetName='Unknown';
  try{targetName=(typeof getProfileName==='function'?getProfileName(window.viewAsProfile):`${window.viewAsProfile.first_name||''} ${window.viewAsProfile.last_name||''}`.trim())||'Unknown'}catch(_){}
  cards.unshift({icon:'\u{1F441}',label:'Acting as',value:targetName,sub:'Read-only \u00b7 Click to return',run:()=>{if(typeof window.openViewAsReturnDialog==='function')window.openViewAsReturnDialog();}});
 }
 strip.innerHTML='';
 cards.forEach(card=>{const el=document.createElement('button');el.type='button';el.className='acc-stat-card acc-stat-card-action';el.innerHTML=`<div class="acc-stat-icon">${card.icon}</div><div class="acc-stat-copy"><div class="acc-stat-label">${card.label}</div><div class="acc-stat-value">${card.value}</div><div class="acc-stat-sub">${card.sub}</div></div><span class="acc-stat-arrow">›</span>`;el.onclick=()=>invoke(card.run);strip.appendChild(el)});
}
function updateIssueBadge(){const b=document.getElementById('accIssuesNavBadge');if(!b)return;const n=Number(window.accScheduleIssuesSummary?.count||0);b.textContent=n>99?'99+':String(n);b.style.display=n?'inline-flex':'none'}
function ensureUserMenuStyles(){
 if(document.getElementById('accUserMenuStyles'))return;
 const st=document.createElement('style');st.id='accUserMenuStyles';
 st.textContent=`#accUserMenu{position:fixed;z-index:30000;min-width:230px;background:#fff;border:1px solid #d8e2ef;border-radius:13px;box-shadow:0 18px 45px rgba(10,34,70,.20);padding:7px;display:none}#accUserMenu.open{display:block}#accUserMenuHeader{padding:10px 12px 9px;border-bottom:1px solid #e2e8f0;margin-bottom:7px}#accUserMenuName{font-weight:800;color:#15355f;font-size:14px}#accUserMenuRole{font-size:11px;color:#66768e;margin-top:2px}.acc-user-menu-item{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:0;background:transparent;border-radius:9px;padding:11px 12px;font-size:14px;font-weight:650;color:#17365d;cursor:pointer}.acc-user-menu-item:hover{background:#eef5ff;color:#174e96}#premiumProfile{background:rgba(255,255,255,.08)!important;border:1px solid rgba(255,255,255,.16)!important;border-radius:999px!important;padding:3px 12px 3px 3px!important;box-shadow:0 2px 8px rgba(0,0,0,.12)!important;gap:8px!important}#premiumProfile:hover{background:rgba(255,255,255,.16)!important;border-color:rgba(255,255,255,.28)!important}#premiumProfile::after{content:'';width:7px;height:7px;color:#b9c9e3;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg) translateY(-2px);transition:transform .15s;flex:none}#premiumProfile[aria-expanded="true"]::after{transform:rotate(-135deg) translateY(-2px)}`;
 document.head.appendChild(st);
}
function ensureUserMenu(){
 ensureUserMenuStyles();
 let menu=document.getElementById('accUserMenu');
 if(menu)return menu;
 menu=document.createElement('div');menu.id='accUserMenu';menu.setAttribute('role','menu');
 menu.innerHTML=`<div id="accUserMenuHeader"><div id="accUserMenuName"></div><div id="accUserMenuRole"></div></div><button type="button" class="acc-user-menu-item" id="accUserMenuAccount"><span>\u2699</span><span>Account Settings</span></button><button type="button" class="acc-user-menu-item" id="accUserMenuSignOut"><span>\u21aa</span><span>Sign Out</span></button>`;
 document.body.appendChild(menu);
 document.getElementById('accUserMenuAccount').onclick=()=>{closeUserMenu();window.openAccountManager?.();};
 document.getElementById('accUserMenuSignOut').onclick=()=>{closeUserMenu();window.logout?.();};
 return menu;
}
function userMenuRoleLabel(){
 try{
  const r=currentProfile?.role;
  if(r==='admin')return 'Administrator';
  if(r==='manager')return 'Manager';
  if(r==='employee')return 'Employee';
  if(r==='external')return 'External Worker';
 }catch(_){}
 return '';
}
function openUserMenu(){
 if(!currentProfile)return;
 const trigger=document.getElementById('premiumProfile');if(!trigger)return;
 const menu=ensureUserMenu();
 try{
  document.getElementById('accUserMenuName').textContent=(typeof getProfileName==='function'?getProfileName(currentProfile):'');
  document.getElementById('accUserMenuRole').textContent=userMenuRoleLabel();
 }catch(_){}
 menu.classList.add('open');
 const rect=trigger.getBoundingClientRect();
 const h=menu.offsetHeight;
 let top=rect.bottom+8;
 if(top+h>window.innerHeight-8)top=Math.max(8,rect.top-h-8);
 menu.style.top=top+'px';
 menu.style.left='auto';
 menu.style.right=Math.max(8,window.innerWidth-rect.right)+'px';
 trigger.setAttribute('aria-expanded','true');
}
function closeUserMenu(){
 document.getElementById('accUserMenu')?.classList.remove('open');
 document.getElementById('premiumProfile')?.setAttribute('aria-expanded','false');
}
function toggleUserMenu(){
 const menu=document.getElementById('accUserMenu');
 if(menu&&menu.classList.contains('open'))closeUserMenu();else openUserMenu();
}
function markUserMenuTrigger(){
 ensureUserMenuStyles();
 const t=document.getElementById('premiumProfile');if(!t)return;
 t.style.cursor='pointer';
 t.setAttribute('role','button');
 t.setAttribute('tabindex','0');
 t.setAttribute('aria-haspopup','true');
 if(!t.getAttribute('aria-expanded'))t.setAttribute('aria-expanded','false');
}
function handleUserMenuDocumentClick(e){
 const trigger=e.target&&e.target.closest?e.target.closest('#premiumProfile'):null;
 if(trigger){toggleUserMenu();return;}
 if(e.target&&e.target.closest&&e.target.closest('#accUserMenu'))return;
 closeUserMenu();
}
function refresh(){ensureShell();renderSidebar();ensureDashboardStrip();updateIssueBadge();suppressLegacyHeaderControls();markUserMenuTrigger()}
setTimeout(refresh,0);setTimeout(refresh,300);setTimeout(refresh,700);setTimeout(refresh,1800);
window.addEventListener('resize',()=>{closeUserMenu();ensureMobileButton();suppressLegacyHeaderControls();if(window.innerWidth>900)closeSidebar()});
if(typeof window.updateUserHeader==='function'){const old=window.updateUserHeader;window.updateUserHeader=function(...args){const r=old.apply(this,args);setTimeout(refresh,0);setTimeout(suppressLegacyHeaderControls,80);return r}}
if(typeof window.renderSchedule==='function'){const old=window.renderSchedule;window.renderSchedule=function(...args){const r=old.apply(this,args);setTimeout(renderDashboardStrip,0);return r}}
const headerObserver=new MutationObserver(()=>setTimeout(suppressLegacyHeaderControls,0));
setTimeout(()=>{const h=document.querySelector('.topbar-user');if(h)headerObserver.observe(h,{childList:true,subtree:false})},0);
document.addEventListener('click',handleUserMenuDocumentClick);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeUserMenu();return;}const t=e.target&&e.target.closest?e.target.closest('#premiumProfile'):null;if(t&&(e.key==='Enter'||e.key===' ')){e.preventDefault();toggleUserMenu();}});
window.refreshPremiumLayout=refresh;
window.renderPremiumDashboardStrip=renderDashboardStrip;
})();