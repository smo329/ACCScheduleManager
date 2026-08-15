/* Refresh admin issue summary after the authenticated profile/header is ready. */
(function(){
  'use strict';

  function loadPersonalDashboardCleanup(){
    if(document.getElementById('employeeDashboardCleanupScript'))return;
    const s=document.createElement('script');
    s.id='employeeDashboardCleanupScript';
    s.src='assets/employee-dashboard-cleanup.js?v=20260814-1';
    document.body.appendChild(s);
  }

  function refresh(){
    try{
      if(currentProfile?.role==='admin'){
        window.refreshIssuesCenter?.();
        setTimeout(()=>window.refreshCompactAdminMenu?.(),250);
      } else if(['employee','external','manager'].includes(currentProfile?.role)){
        loadPersonalDashboardCleanup();
      }
    }catch(_){}
  }

  if(typeof updateUserHeader==='function'){
    const original=updateUserHeader;
    updateUserHeader=function(...args){
      const result=original.apply(this,args);
      setTimeout(refresh,300);
      return result;
    };
  }

  setTimeout(refresh,1800);
})();