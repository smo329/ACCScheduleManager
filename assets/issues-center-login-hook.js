/* Refresh admin issue summary after the authenticated profile/header is ready. */
(function(){
  'use strict';
  function refresh(){
    try{
      if(currentProfile?.role==='admin'){
        window.refreshIssuesCenter?.();
        setTimeout(()=>window.refreshCompactAdminMenu?.(),250);
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