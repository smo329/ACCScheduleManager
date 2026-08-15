/* ACC Schedule Manager — mobile menu notification indicators */
(function(){
'use strict';
const VERSION='2026.08.15.1';
let timer=null;
let observer=null;
let refreshBusy=false;
console.info(`[ACC Schedule Manager] mobile notification indicators loaded: ${VERSION}`);

function role(){try{return currentProfile?.role||null}catch(_){return null}}
function isAdmin(){return role()==='admin'}
function isMobile(){return window.innerWidth<=900}

function ensureStyles(){
  if(document.getElementById('mobileMenuNotificationBadgeStyles'))return;
  const s=document.createElement('style');
  s.id='mobileMenuNotificationBadgeStyles';
  s.textContent=`
    #accMobileMenuButton{position:relative!important}
    #accMobileNotificationAlert{
      position:absolute;top:-6px;right:-6px;width:21px;height:21px;border-radius:999px;
      display:none;align-items:center;justify-content:center;background:#f6c945;color:#3b2b00;
      border:2px solid #071f47;font-size:13px;font-weight:950;line-height:1;
      box-shadow:0 3px 10px rgba(0,0,0,.22);pointer-events:none;z-index:4
    }
    #accNotificationsNavBadge{
      margin-left:auto;min-width:23px;height:23px;padding:0 7px;border-radius:999px;
      display:none;align-items:center;justify-content:center;background:#f6c945;color:#3b2b00;
      font-size:11px;font-weight:900;line-height:1;box-shadow:0 2px 7px rgba(0,0,0,.15)
    }
    @media(min-width:901px){#accMobileNotificationAlert{display:none!important}}
  `;
  document.head.appendChild(s);
}

function ensureElements(){
  const menu=document.getElementById('accMobileMenuButton');
  if(menu&&!document.getElementById('accMobileNotificationAlert')){
    const alert=document.createElement('span');
    alert.id='accMobileNotificationAlert';
    alert.textContent='!';
    alert.setAttribute('aria-hidden','true');
    menu.appendChild(alert);
  }

  const nav=document.getElementById('navNotifications');
  if(nav&&!document.getElementById('accNotificationsNavBadge')){
    const badge=document.createElement('span');
    badge.id='accNotificationsNavBadge';
    badge.setAttribute('aria-label','Unread notifications');
    nav.appendChild(badge);
  }
}

function baseUnreadCount(){
  const badge=document.getElementById('notificationCenterBadge');
  if(!badge)return 0;
  const visible=getComputedStyle(badge).display!=='none';
  if(!visible)return 0;
  const text=(badge.textContent||'').trim();
  if(text==='99+')return 99;
  const n=parseInt(text,10);
  return Number.isFinite(n)?n:0;
}

async function passwordResetUnreadCount(){
  if(!isAdmin()||!currentUser)return 0;
  try{
    const {count,error}=await supabaseClient.from('notification_log')
      .select('id',{count:'exact',head:true})
      .eq('user_id',currentUser.id)
      .eq('channel','in_app')
      .eq('event_type','password_reset_request')
      .is('read_at',null)
      .not('status','in','("resolved","dismissed")');
    if(error){console.warn('Unable to count password reset notifications',error);return 0}
    return Number(count||0);
  }catch(e){console.warn(e);return 0}
}

function paint(total){
  ensureElements();
  const alert=document.getElementById('accMobileNotificationAlert');
  const badge=document.getElementById('accNotificationsNavBadge');
  const has=total>0;
  if(alert){
    alert.style.display=has&&isMobile()?'inline-flex':'none';
    const menu=document.getElementById('accMobileMenuButton');
    if(menu)menu.setAttribute('aria-label',has?`Open navigation, ${total} unread notification${total===1?'':'s'}`:'Open navigation');
  }
  if(badge){
    badge.textContent=total>99?'99+':String(total);
    badge.style.display=has?'inline-flex':'none';
    badge.setAttribute('aria-label',`${total} unread notification${total===1?'':'s'}`);
  }
}

async function refresh(){
  if(refreshBusy)return;
  refreshBusy=true;
  try{
    ensureStyles();
    ensureElements();
    const resetCount=await passwordResetUnreadCount();
    paint(baseUnreadCount()+resetCount);
  }finally{refreshBusy=false}
}

function observeHeader(){
  observer?.disconnect();
  const root=document.body;
  if(!root)return;
  observer=new MutationObserver(()=>{
    clearTimeout(window.__accMenuNotificationRefresh);
    window.__accMenuNotificationRefresh=setTimeout(()=>refresh().catch(console.warn),60);
  });
  observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
}

ensureStyles();
[200,600,1200,2200].forEach(ms=>setTimeout(()=>refresh().catch(console.warn),ms));
setTimeout(observeHeader,300);
timer=setInterval(()=>refresh().catch(console.warn),30000);
window.addEventListener('resize',()=>refresh().catch(console.warn));
window.refreshMobileMenuNotificationBadge=refresh;
})();