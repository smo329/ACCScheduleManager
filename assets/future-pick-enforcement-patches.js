/* ACC Schedule Manager - enforce future-pick protection */
(function(){
  'use strict';
  const VERSION='2026.08.14.1';
  console.info(`[ACC Schedule Manager] future pick enforcement loaded: ${VERSION}`);
  function employeeIsEarlierPicker(profile){try{return currentProfile?.role==='employee'&&profile?.id===currentUser?.id;}catch(_){return false;}}
  if(typeof confirmCapacityFor12Shift!=='function')return;
  const original=confirmCapacityFor12Shift;
  confirmCapacityFor12Shift=async function(profile,dateKey,workSite){
    /* Admins can still correct schedules manually. Protection is for employee picking. */
    if(employeeIsEarlierPicker(profile)&&typeof window.checkFuturePickProtection==='function'){
      try{
        const result=window.checkFuturePickProtection(workSite,dateKey);
        if(result?.blocked){
          const names=(result.risks||[]).map(r=>{try{return getProfileName(r.person);}catch(_){return 'a later employee';}}).join(', ');
          showError(`That shift is being held for ${names||'a later employee'} because known leave would otherwise leave them without enough available shifts to complete the week. Please choose another available shift.`);
          return false;
        }
      }catch(error){console.warn('Future pick protection check failed:',error);}
    }
    return await original.apply(this,arguments);
  };
})();