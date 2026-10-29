/* ACC Schedule Manager - employee/personal dashboard cleanup */
(function(){
'use strict';
const VERSION='2026.08.14.1';
console.info(`[ACC Schedule Manager] employee dashboard cleanup loaded: ${VERSION}`);

function role(){try{return currentProfile?.role||''}catch(_){return''}}
function isPersonalRole(){return ['employee','external','manager'].includes(role())}

function cleanTopbar(){
  if(!isPersonalRole())return;
  const holder=document.querySelector('.topbar-user');
  if(!holder)return;
  [...holder.children].forEach(el=>{
    if(el.id==='accMobileMenuButton'||el.id==='accountRequestBell'||el.id==='premiumProfile')return;
    if(el.classList?.contains('user-name')||el.classList?.contains('role-badge')){el.style.display='none';return;}
    if(el.tagName==='BUTTON'||el.id==='compactAdminMenuWrap')el.style.setProperty('display','none','important');
  });
}

function scrollToWorkflow(){
  const target=document.getElementById('workflowPanel')||document.querySelector('.schedule-header');
  if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
}
function scrollToQuarter(){
  const target=document.getElementById('quarterNavigator');
  if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
}

function actionCard(card,handler,label){
  if(!card)return;
  card.classList.add('acc-stat-card-actionable');
  card.setAttribute('role','button');
  card.setAttribute('tabindex','0');
  card.setAttribute('aria-label',label);
  card.onclick=handler;
  card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();handler();}};
}

function improveCards(){
  if(!['employee','external'].includes(role()))return;
  const strip=document.getElementById('accDashboardStrip');
  if(!strip)return;
  const cards=[...strip.querySelectorAll('.acc-stat-card')];
  if(!cards.length)return;

  if(role()==='employee'){
    if(cards[0]){
      actionCard(cards[0],()=>window.openOpenShifts?.(),'Open Additional Shifts');
      const sub=cards[0].querySelector('.acc-stat-sub');
      if(sub)sub.textContent='Tap to browse shifts';
    }
    if(cards[1]){
      actionCard(cards[1],()=>window.openMySchedule?.(),'Open My Schedule');
      const sub=cards[1].querySelector('.acc-stat-sub');
      if(sub)sub.textContent='Tap to view your schedule';
    }
    if(cards[2]){
      /* Third employee card is My Critical Labs (Week status only in
         view-as, where this pass never runs). */
      actionCard(cards[2],()=>window.openMyCriticalLabs?.(),'Open My Critical Labs');
      const sub=cards[2].querySelector('.acc-stat-sub');
      if(sub)sub.textContent='Tap to view your coverage weeks';
    }
    if(cards[3]){
      /* The holiday patch turns this card into My Holidays for Turfland
         employees and runs after the strip rebuild but before this pass,
         so a card already labeled My Holidays must be left alone —
         forcing it back to Notifications would undo that swap. */
      const label=cards[3].querySelector('.acc-stat-label');
      if(!label || label.textContent.trim()!=='My Holidays'){
        const icon=cards[3].querySelector('.acc-stat-icon');
        const value=cards[3].querySelector('.acc-stat-value');
        const sub=cards[3].querySelector('.acc-stat-sub');
        if(icon)icon.textContent='🔔';
        if(label)label.textContent='Notifications';
        if(value)value.textContent='View';
        if(sub)sub.textContent='Scheduling alerts';
        actionCard(cards[3],()=>window.openNotificationCenter?.(),'Open notifications');
      }
    }
  } else {
    if(cards[0])actionCard(cards[0],()=>window.openOpenShifts?.(),'Open Additional Shifts');
    if(cards[1])actionCard(cards[1],()=>window.openMySchedule?.(),'Open My Additional Shifts');
    if(cards[2]){
      const icon=cards[2].querySelector('.acc-stat-icon');
      const label=cards[2].querySelector('.acc-stat-label');
      const value=cards[2].querySelector('.acc-stat-value');
      const sub=cards[2].querySelector('.acc-stat-sub');
      if(icon)icon.textContent='🔔';
      if(label)label.textContent='Notifications';
      if(value)value.textContent='View';
      if(sub)sub.textContent='Shift alerts';
      actionCard(cards[2],()=>window.openNotificationCenter?.(),'Open notifications');
    }
    if(cards[3])cards[3].remove();
  }
}

function installStyles(){
  if(document.getElementById('employeeDashboardCleanupStyles'))return;
  const s=document.createElement('style');
  s.id='employeeDashboardCleanupStyles';
  s.textContent=`
    .acc-stat-card-actionable{cursor:pointer!important;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease!important}
    .acc-stat-card-actionable:hover{transform:translateY(-2px);border-color:#6fa3ea!important;box-shadow:0 12px 28px rgba(15,64,130,.14)!important}
    .acc-stat-card-actionable:focus-visible{outline:3px solid rgba(59,130,246,.28);outline-offset:2px}
    .acc-stat-card-actionable .acc-stat-sub:after{content:'  →';font-weight:800;color:#3b82f6}
    @media(max-width:1000px){
      .topbar-user>#accMobileMenuButton,.topbar-user>#accountRequestBell,.topbar-user>#premiumProfile{display:inline-flex!important}
      .acc-stat-card-actionable:active{transform:scale(.985)}
    }
  `;
  document.head.appendChild(s);
}

function apply(){
  // In read-only view-as mode the dashboard strip starts with an
  // "Acting as" card, not the Weeks card improveCards() assumes is
  // first. Running it here would relabel that card "Weeks" and
  // replace its return-dialog click with a scroll to the quarter
  // navigator — leaving the admin with no way back except reload.
  // Skip the whole pass in view mode; the strip keeps its original
  // premium-layout labels, and the Acting as card keeps working.
  if(window.viewAsActive)return;
  installStyles();cleanTopbar();improveCards();
}

setTimeout(apply,0);
setTimeout(apply,400);
setTimeout(apply,1200);

if(typeof window.refreshPremiumLayout==='function'){
  const old=window.refreshPremiumLayout;
  window.refreshPremiumLayout=function(...args){const r=old.apply(this,args);setTimeout(apply,0);return r;};
}
if(typeof window.renderSchedule==='function'){
  const old=window.renderSchedule;
  window.renderSchedule=function(...args){const r=old.apply(this,args);setTimeout(apply,0);return r;};
}
if(typeof window.updateUserHeader==='function'){
  const old=window.updateUserHeader;
  window.updateUserHeader=function(...args){const r=old.apply(this,args);setTimeout(apply,0);return r;};
}
})();
