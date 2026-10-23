/* ACC Schedule Manager — admin password-reset notification integration */
(function(){
'use strict';
const VERSION='2026.08.15.3';
let resetNotifications=[];
console.info(`[ACC Schedule Manager] password reset notifications loaded: ${VERSION}`);

const isAdmin=()=>{try{return currentProfile?.role==='admin'&&currentProfile?.active!==false}catch(_){return false}};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>{try{return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(v))}catch(_){return String(v||'')}};

async function load(){
  if(!isAdmin()||!currentUser){resetNotifications=[];return}
  const {data,error}=await supabaseClient.from('notification_log')
    .select('id,event_type,created_at,metadata,read_at,status')
    .eq('user_id',currentUser.id).eq('channel','in_app').eq('event_type','password_reset_request')
    .in('status',['sent','read'])
    .order('created_at',{ascending:false}).limit(50);
  if(error){console.warn('Password-reset notifications failed',error);resetNotifications=[];window.accPasswordResetUnreadCount=0;return}
  // Collapse duplicate rows for the same person into one card (newest
  // row kept; unread if any duplicate is unread). Dismissing / marking
  // that card read updates every duplicate id behind it.
  const grouped=new Map();
  for(const n of (data||[])){const key=(n.metadata&&n.metadata.target_user_id)||n.id;const prev=grouped.get(key);if(!prev){grouped.set(key,{...n,_duplicateIds:[n.id]});}else{prev._duplicateIds.push(n.id);if(prev.read_at&&!n.read_at)prev.read_at=null;}}
  resetNotifications=[...grouped.values()];
  window.accPasswordResetUnreadCount=resetNotifications.filter(n=>!n.read_at).length;
}
function ensureBellDot(){
  const bell=document.getElementById('accountRequestBell');if(!bell)return;
  let dot=document.getElementById('passwordResetBellDot');
  const unread=resetNotifications.some(n=>!n.read_at);
  if(unread&&!dot){dot=document.createElement('span');dot.id='passwordResetBellDot';dot.className='password-reset-alert-dot';dot.title='Password reset request';bell.appendChild(dot)}
  if(dot)dot.style.display=unread?'block':'none';
}
async function setStatus(id,status){
  if(!id||!currentUser)return;
  const values={status};
  if(status==='read'||status==='resolved'||status==='dismissed')values.read_at=new Date().toISOString();
  const row=resetNotifications.find(n=>n.id===id);const ids=row&&row._duplicateIds?row._duplicateIds:[id];
  const {error}=await supabaseClient.from('notification_log').update(values).eq('user_id',currentUser.id).in('id',ids);
  if(error){console.warn('Unable to update password-reset notification',error);return false}
  await refresh();
  window.refreshNotificationCenter?.();
  return true;
}
function renderIntoCenter(){
  if(!isAdmin())return;const content=document.getElementById('notificationCenterContent');if(!content)return;
  content.querySelector('#passwordResetNotificationSection')?.remove();
  // The unified feed moves cards out of their section into its own feed,
  // so removing the section alone leaves stale cards behind: a dismissed
  // card would stay visible forever, and a marked-read card would stay
  // unread while a fresh read card was added beside it. Remove any
  // existing password cards by id before rendering the fresh list.
  content.querySelectorAll('[data-password-reset-id]').forEach(el=>el.remove());
  const section=document.createElement('div');section.id='passwordResetNotificationSection';section.className='notification-center-section';
  const unread=resetNotifications.filter(n=>!n.read_at).length;
  section.innerHTML=`<div class="notification-center-heading"><div><strong>Password Reset Requests</strong><div class="notification-center-count">${unread} unread · ${resetNotifications.length} recent</div></div></div>${resetNotifications.length?resetNotifications.map(n=>{const m=n.metadata||{};return `<div class="notification-card ${!n.read_at?'unread':''}" data-password-reset-id="${esc(n.id)}"><div class="notification-card-title">Password reset requested</div><div class="notification-card-body"><strong>${esc(m.target_name||m.username||'User')}</strong> could not complete self-service password recovery${m.username?`.<br>Username: <strong>${esc(m.username)}</strong>`:'.'}</div><div class="notification-card-meta">${esc(fmt(n.created_at))}</div><div class="notification-card-actions"><button class="modal-button save-button reset-user-password" type="button" data-target-user="${esc(m.target_user_id||'')}" data-target-name="${esc(m.target_name||m.username||'User')}">Reset Password</button><button class="modal-button cancel-button dismiss-reset-request" type="button">Dismiss</button>${!n.read_at?'<button class="modal-button cancel-button mark-reset-read" type="button">Mark Read</button>':''}</div></div>`}).join(''):'<div class="notification-empty">No password reset requests.</div>'}`;
  content.appendChild(section);
  section.querySelectorAll('.reset-user-password').forEach(b=>b.onclick=()=>{const card=b.closest('[data-password-reset-id]');window.openAdminPasswordReset?.(b.dataset.targetUser,b.dataset.targetName,card?.dataset.passwordResetId)});
  section.querySelectorAll('.mark-reset-read').forEach(b=>b.onclick=async()=>{const id=b.closest('[data-password-reset-id]')?.dataset.passwordResetId;if(id)await setStatus(id,'read')});
  section.querySelectorAll('.dismiss-reset-request').forEach(b=>b.onclick=async()=>{const id=b.closest('[data-password-reset-id]')?.dataset.passwordResetId;if(!id)return;if(!confirm('Dismiss this password reset request?'))return;await setStatus(id,'dismissed')});
}
async function refresh(){await load();ensureBellDot();if(typeof window.refreshNotificationCenter==='function')window.refreshNotificationCenter();const modal=document.getElementById('notificationCenterModal');if(modal?.style.display==='flex')renderIntoCenter()}
function hookOpen(){if(typeof window.openNotificationCenter!=='function'||window.openNotificationCenter.__passwordResetHook)return;const old=window.openNotificationCenter;const wrapped=async function(...args){const r=await old.apply(this,args);await refresh();renderIntoCenter();return r};wrapped.__passwordResetHook=true;window.openNotificationCenter=wrapped;const bell=document.getElementById('accountRequestBell');if(bell)bell.onclick=wrapped}
window.resolvePasswordResetNotification=async function(id){return setStatus(id,'resolved')};
window.refreshPasswordResetNotifications=refresh;
[400,900,1800].forEach(ms=>setTimeout(()=>{hookOpen();refresh().catch(console.warn)},ms));
setInterval(()=>refresh().catch(console.warn),45000);
})();
