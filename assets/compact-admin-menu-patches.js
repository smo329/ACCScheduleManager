/* ACC Schedule Manager - legacy compact admin menu retired in favor of premium sidebar */
(function(){
  'use strict';
  const VERSION='2026.08.14.6';
  console.info(`[ACC Schedule Manager] compact admin menu compatibility loaded: ${VERSION}`);

  const ADMIN_ONLY_IDS=['adminButton','managePeopleTopButton','quarterDashboardTopButton','scheduleHistoryTopButton','archiveCenterTopButton'];

  function hideLegacyAdminControls(){
    document.getElementById('compactAdminMenuWrap')?.remove();
    ADMIN_ONLY_IDS.forEach(id=>document.getElementById(id)?.style.setProperty('display','none','important'));
    document.querySelectorAll('.topbar-user button').forEach(button=>{
      const label=(button.textContent||'').trim().toLowerCase();
      if(['admin','admin ▾','manage people','quarter dashboard','history','archive','issues'].includes(label)){
        button.style.setProperty('display','none','important');
      }
    });
  }

  hideLegacyAdminControls();
  setTimeout(hideLegacyAdminControls,0);
  setTimeout(hideLegacyAdminControls,250);
  setTimeout(hideLegacyAdminControls,900);
  setTimeout(hideLegacyAdminControls,1800);

  if(typeof window.updateUserHeader==='function'){
    const original=window.updateUserHeader;
    window.updateUserHeader=function(...args){
      const result=original.apply(this,args);
      setTimeout(hideLegacyAdminControls,0);
      setTimeout(hideLegacyAdminControls,80);
      return result;
    };
  }

  const observer=new MutationObserver(()=>hideLegacyAdminControls());
  setTimeout(()=>{
    const topbar=document.querySelector('.topbar-user');
    if(topbar)observer.observe(topbar,{childList:true,subtree:false});
  },0);

  window.refreshCompactAdminMenu=hideLegacyAdminControls;
})();