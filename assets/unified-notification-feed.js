/* ACC Schedule Manager — unified notification feed presentation */
(function(){
  'use strict';
  const VERSION='2026.08.15.2';
  let arranging=false;
  let observer=null;
  console.info(`[ACC Schedule Manager] unified notification feed loaded: ${VERSION}`);

  function ensureStyles(){
    if(document.getElementById('unifiedNotificationFeedStyles')) return;
    const s=document.createElement('style');
    s.id='unifiedNotificationFeedStyles';
    s.textContent=`
      #notificationCenterContent .unified-notification-feed{margin:0}
      #notificationCenterContent .unified-notification-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px}
      #notificationCenterContent .unified-notification-heading strong{font-size:16px;color:#17365d}
      #notificationCenterContent .unified-notification-count{font-size:11px;color:#64748b;margin-top:2px}
      #notificationCenterContent .unified-notification-list{display:block}
      #notificationCenterContent .unified-notification-list>.notification-card{margin-bottom:10px}
      .acc-dark #notificationCenterContent .unified-notification-heading strong{color:#d8ecff!important}
      .acc-dark #notificationCenterContent .unified-notification-count{color:#94a3b8!important}
    `;
    document.head.appendChild(s);
  }

  function removeLegacySections(content,keepFeed){
    [...content.children].forEach(child=>{
      if(child===keepFeed) return;
      if(child.classList?.contains('notification-center-section') || child.id==='passwordResetNotificationSection') child.remove();
    });
  }

  function arrange(){
    if(arranging) return;
    const content=document.getElementById('notificationCenterContent');
    const modal=document.getElementById('notificationCenterModal');
    if(!content || !modal || modal.style.display!=='flex') return;

    const cards=[...content.querySelectorAll('.notification-card')];
    const markAll=content.querySelector('#markAllScheduleNotificationsRead');

    arranging=true;
    try{
      const existing=content.querySelector('.unified-notification-feed');
      const outsideCards=cards.filter(card=>!existing?.contains(card));

      if(existing && outsideCards.length===0){
        removeLegacySections(content,existing);
        const unread=cards.filter(card=>card.classList.contains('unread')).length;
        const count=existing.querySelector('.unified-notification-count');
        if(count) count.textContent=`${unread} unread · ${cards.length} recent`;
        const list=existing.querySelector('.unified-notification-list');
        if(list && cards.length===0 && !list.querySelector('.notification-empty')){
          list.innerHTML='<div class="notification-empty">No notifications right now.</div>';
        }
        return;
      }

      const feed=document.createElement('div');
      feed.className='unified-notification-feed';
      const unread=cards.filter(card=>card.classList.contains('unread')).length;
      feed.innerHTML=`<div class="unified-notification-heading"><div><strong>Notifications</strong><div class="unified-notification-count">${unread} unread · ${cards.length} recent</div></div></div><div class="unified-notification-list"></div>`;
      const heading=feed.querySelector('.unified-notification-heading');
      const list=feed.querySelector('.unified-notification-list');
      if(markAll) heading.appendChild(markAll);

      if(cards.length){
        cards.sort((a,b)=>{
          const ad=a.querySelector('.notification-card-meta')?.textContent||'';
          const bd=b.querySelector('.notification-card-meta')?.textContent||'';
          const at=Date.parse(ad.replace(/^Requested\s+/i,''));
          const bt=Date.parse(bd.replace(/^Requested\s+/i,''));
          return (Number.isFinite(bt)?bt:0)-(Number.isFinite(at)?at:0);
        });
        cards.forEach(card=>list.appendChild(card));
      }else{
        const empty=document.createElement('div');
        empty.className='notification-empty';
        empty.textContent='No notifications right now.';
        list.appendChild(empty);
      }

      content.innerHTML='';
      content.appendChild(feed);
    }finally{
      arranging=false;
    }
  }

  function watch(){
    const content=document.getElementById('notificationCenterContent');
    if(!content) return;
    observer?.disconnect();
    observer=new MutationObserver(()=>setTimeout(arrange,0));
    observer.observe(content,{childList:true,subtree:true});
  }

  function hookOpen(){
    if(typeof window.openNotificationCenter!=='function' || window.openNotificationCenter.__unifiedFeedHook) return;
    const old=window.openNotificationCenter;
    const wrapped=async function(...args){
      const result=await old.apply(this,args);
      setTimeout(()=>{watch();arrange()},30);
      setTimeout(arrange,250);
      setTimeout(arrange,700);
      return result;
    };
    wrapped.__unifiedFeedHook=true;
    window.openNotificationCenter=wrapped;
    const bell=document.getElementById('accountRequestBell');
    if(bell) bell.onclick=wrapped;
  }

  ensureStyles();
  [500,1000,1800,3000].forEach(ms=>setTimeout(()=>{hookOpen();watch();arrange()},ms));
})();