/* ACC Schedule Manager - persistent read state for issue notifications */
(function(){
  'use strict';
  const VERSION='2026.08.14.1';
  let acknowledgedFingerprint=null;
  let loadedPeriodId=null;
  console.info(`[ACC Schedule Manager] issue read-state patch loaded: ${VERSION}`);

  function isAdmin(){try{return currentProfile?.role==='admin'&&currentProfile?.active!==false}catch(_){return false}}
  function summary(){return isAdmin()?window.accScheduleIssuesSummary||null:null}
  function canonicalIssue(i){return [i.type||'',i.severity||'',i.title||'',i.detail||'',i.date||'',i.clinic||'',i.user_id||'',String(i.remaining??'')].join('|')}
  function fingerprint(){const s=summary();if(!s||!s.count)return '';return (s.issues||[]).map(canonicalIssue).sort().join('||')}

  async function loadAck(force=false){
    const s=summary();
    if(!isAdmin()||!currentUser||!s?.period_id){acknowledgedFingerprint=null;loadedPeriodId=null;return null}
    if(!force&&loadedPeriodId===s.period_id)return acknowledgedFingerprint;
    const {data,error}=await supabaseClient.from('issue_snapshot_acknowledgements').select('fingerprint').eq('user_id',currentUser.id).eq('period_id',s.period_id).maybeSingle();
    if(error){console.warn('Unable to load issue acknowledgement',error);acknowledgedFingerprint=null;return null}
    loadedPeriodId=s.period_id;acknowledgedFingerprint=data?.fingerprint||null;return acknowledgedFingerprint;
  }

  async function markRead(){
    const s=summary(),fp=fingerprint();
    if(!isAdmin()||!currentUser||!s?.period_id||!fp)return;
    const {error}=await supabaseClient.from('issue_snapshot_acknowledgements').upsert({user_id:currentUser.id,period_id:s.period_id,fingerprint:fp,acknowledged_at:new Date().toISOString()},{onConflict:'user_id,period_id'});
    if(error){console.warn('Unable to acknowledge issue snapshot',error);return}
    loadedPeriodId=s.period_id;acknowledgedFingerprint=fp;
    adjustNotificationUi();
  }

  function isUnread(){const s=summary();if(!s?.count)return false;return fingerprint()!==acknowledgedFingerprint}

  function adjustNotificationUi(){
    if(!isAdmin())return;
    const s=summary();
    const unread=isUnread();
    const card=document.querySelector('#notificationCenterContent .notification-card.issue-alert');
    if(card){
      card.classList.toggle('unread',unread);
      let meta=card.querySelector('.issue-read-state');
      if(!meta){meta=document.createElement('div');meta.className='notification-card-meta issue-read-state';card.appendChild(meta)}
      meta.textContent=unread?'New or changed since you last reviewed these issues.':'Reviewed — still unresolved.';
    }
    const badge=document.getElementById('notificationCenterBadge');
    if(badge&&s?.count>0&&!unread){
      const n=parseInt(badge.textContent,10);
      if(Number.isFinite(n)&&n>0){const next=Math.max(0,n-1);badge.textContent=String(next);badge.style.display=next?'inline-flex':'none'}
    }
  }

  window.accIssuesIsUnread=isUnread;
  window.markCurrentIssuesRead=markRead;

  const oldOpen=window.openIssuesCenter;
  if(typeof oldOpen==='function'){
    window.openIssuesCenter=async function(...args){const result=await oldOpen.apply(this,args);await loadAck(true);await markRead();setTimeout(()=>window.refreshNotificationCenter?.(),0);return result};
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('#openIssuesFromNotifications,#issuesSummaryAlert button');
    if(btn)setTimeout(()=>markRead().then(()=>window.refreshNotificationCenter?.()),0);
  },true);

  const oldRefresh=window.refreshNotificationCenter;
  if(typeof oldRefresh==='function'){
    window.refreshNotificationCenter=async function(...args){const r=await oldRefresh.apply(this,args);await loadAck();setTimeout(adjustNotificationUi,0);return r};
  }

  async function sync(){if(!isAdmin())return;const s=summary();if(!s?.period_id)return;await loadAck(s.period_id!==loadedPeriodId);adjustNotificationUi()}
  setTimeout(sync,1500);setTimeout(sync,3000);setInterval(sync,60000);
})();

/* Premium visual theme loader. Kept separate from scheduling logic so the makeover is easy to revise. */
(function(){
  if(document.getElementById('accPremiumTheme')) return;
  const link=document.createElement('link');
  link.id='accPremiumTheme';
  link.rel='stylesheet';
  link.href='assets/premium-theme.css?v=20260814-1';
  document.head.appendChild(link);
})();
