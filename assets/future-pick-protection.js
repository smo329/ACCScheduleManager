/* ACC Schedule Manager - Known Leave + Future Pick Protection */
(function(){
"use strict";
const VERSION="2026.08.14.3";
const state={rows:[],periodId:null};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const role=()=>{try{return currentProfile?.role||""}catch(_){return ""}};
const selectedPeriod=()=>{try{return adminSchedulingPeriod||activeSchedulingPeriod||allSchedulingPeriods?.find(p=>p.id===viewSchedulingPeriodId)||null}catch(_){return null}};
const name=p=>p?(typeof getProfileName==="function"?getProfileName(p):`${p.first_name||""} ${p.last_name||""}`.trim()):"Employee";
const parse=s=>{const [y,m,d]=String(s).split("-").map(Number);return new Date(y,m-1,d)};
const key=d=>typeof getDateKey==="function"?getDateKey(d):d.toISOString().slice(0,10);
const add=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return key(d)};
const weekStart=s=>{const d=parse(s);d.setDate(d.getDate()-d.getDay());return key(d)};
const rowsFor=uid=>state.rows.filter(x=>x.user_id===uid);
const unavailable=(uid,date)=>rowsFor(uid).some(x=>x.leave_date===date&&Number(x.hours||0)>=12);

async function load(force=false){
  const p=selectedPeriod();
  if(!p){state.rows=[];state.periodId=null;return}
  if(!force&&state.periodId===p.id)return;
  const {data,error}=await supabaseClient.from("scheduling_known_leave")
    .select("id,period_id,user_id,leave_date,leave_type,hours,notes")
    .eq("period_id",p.id).order("leave_date");
  if(error){console.warn("Known leave load failed",error);state.rows=[];return}
  state.rows=data||[];state.periodId=p.id;
}

function ensureStyles(){
  if(document.getElementById("futurePickStyles"))return;
  const s=document.createElement("style");s.id="futurePickStyles";s.textContent=`
    .known-leave-box{border:1px solid #cbd5e1;border-radius:9px;padding:12px;margin:12px 0;background:#f8fafc}
    .known-leave-grid{display:grid;grid-template-columns:1.3fr 1fr .8fr .8fr 1.5fr auto;gap:8px;align-items:end}
    .known-leave-list{margin-top:10px;max-height:220px;overflow:auto}
    .known-leave-item{display:flex;justify-content:space-between;gap:8px;padding:7px;border-top:1px solid #e2e8f0;font-size:12px}
    .future-risk{background:#fff7ed;border:1px solid #fdba74;color:#9a3412;border-radius:7px;padding:9px;margin:8px 0;font-size:12px}
    .known-leave-mark{box-shadow:inset 0 0 0 2px #fb923c!important}
    @media(max-width:760px){.known-leave-grid{grid-template-columns:1fr 1fr}.known-leave-grid .wide{grid-column:1/-1}.known-leave-item{flex-direction:column;align-items:flex-start}}
  `;document.head.appendChild(s)
}

function employeeOptions(){
  try{return profiles.filter(p=>p.active&&p.role==="employee").sort((a,b)=>name(a).localeCompare(name(b))).map(p=>`<option value="${esc(p.id)}">${esc(name(p))}</option>`).join("")}catch(_){return""}
}

async function addKnown(){
  const p=selectedPeriod(),uid=document.getElementById("knownLeavePerson")?.value,date=document.getElementById("knownLeaveDate")?.value,type=document.getElementById("knownLeaveType")?.value,hours=Number(document.getElementById("knownLeaveHours")?.value||12),notes=document.getElementById("knownLeaveNotes")?.value||null;
  if(!p||!uid||!date)return;
  if(date<p.period_start||date>p.period_end){showError("Date must be within the selected quarter.");return}

  const {error}=await supabaseClient.from("scheduling_known_leave").upsert({
    period_id:p.id,user_id:uid,leave_date:date,leave_type:type,hours,notes,created_by:currentUser.id,updated_at:new Date().toISOString()
  },{onConflict:"period_id,user_id,leave_date,leave_type"});
  if(error){showError(error.message);return}

  if(type!=="Other"){
    const existing=await supabaseClient.from("schedule_leave_hours")
      .select("vacation_hours,professional_leave_hours,tdl_hours")
      .eq("user_id",uid).eq("leave_date",date).maybeSingle();
    const old=existing.data||{};
    const merged={
      user_id:uid,leave_date:date,
      vacation_hours:type==="VL"?hours:Number(old.vacation_hours||0),
      professional_leave_hours:type==="PL"?hours:Number(old.professional_leave_hours||0),
      tdl_hours:type==="TDL"?hours:Number(old.tdl_hours||0),
      updated_at:new Date().toISOString()
    };
    const saveLeave=await supabaseClient.from("schedule_leave_hours").upsert(merged,{onConflict:"user_id,leave_date"});
    if(saveLeave.error){showError("Known leave was saved, but the schedule hours could not be preloaded: "+saveLeave.error.message);return}

    if(hours===12){
      const current=typeof getScheduleEntry==="function"?getScheduleEntry(uid,date):null;
      if(!current||current.code==="0"||["VL","PL","TDL"].includes(current.code)){
        const saveCode=await supabaseClient.from("schedules").upsert({
          user_id:uid,schedule_date:date,schedule_code:type,work_site:null,updated_at:new Date().toISOString()
        },{onConflict:"user_id,schedule_date"});
        if(saveCode.error) console.warn("Unable to display full-day known leave code",saveCode.error);
      }
    }
  }

  state.periodId=null;await load(true);renderAdminBox();if(typeof loadWeek==="function")await loadWeek();
}

async function removeKnown(id){
  const r=state.rows.find(x=>x.id===id);
  const {error}=await supabaseClient.from("scheduling_known_leave").delete().eq("id",id);
  if(error){showError(error.message);return}
  if(r&&r.leave_type!=="Other"){
    const patch=r.leave_type==="VL"?{vacation_hours:0}:r.leave_type==="PL"?{professional_leave_hours:0}:{tdl_hours:0};
    await supabaseClient.from("schedule_leave_hours").update({...patch,updated_at:new Date().toISOString()}).eq("user_id",r.user_id).eq("leave_date",r.leave_date);
    const existing=typeof getScheduleEntry==="function"?getScheduleEntry(r.user_id,r.leave_date):null;
    if(existing&&existing.code===r.leave_type){
      await supabaseClient.from("schedules").upsert({user_id:r.user_id,schedule_date:r.leave_date,schedule_code:"0",work_site:null,updated_at:new Date().toISOString()},{onConflict:"user_id,schedule_date"});
    }
  }
  state.periodId=null;await load(true);renderAdminBox();if(typeof loadWeek==="function")await loadWeek();
}

function renderAdminBox(){
  if(role()!=="admin")return;
  const host=document.getElementById("quarterDashboardContent")||document.querySelector(".quarter-dashboard");if(!host)return;
  let box=document.getElementById("knownLeaveBox");
  if(!box){box=document.createElement("div");box.id="knownLeaveBox";box.className="known-leave-box";host.prepend(box)}
  const p=selectedPeriod();
  box.innerHTML=`<strong>Known Leave / Future Pick Protection</strong>
    <div style="font-size:12px;color:#64748b;margin:4px 0 10px">Enter known leave before a person's picking turn. VL, PL, and TDL are preloaded into the live schedule and count toward weekly hours. Once that employee's scheduling period is open, they may change or remove the preloaded leave themselves.</div>
    <div class="known-leave-grid">
      <select id="knownLeavePerson">${employeeOptions()}</select>
      <input id="knownLeaveDate" type="date" min="${p?.period_start||""}" max="${p?.period_end||""}">
      <select id="knownLeaveType"><option>VL</option><option>PL</option><option>TDL</option><option>Other</option></select>
      <select id="knownLeaveHours">${[2,4,6,8,10,12].map(h=>`<option value="${h}" ${h===12?"selected":""}>${h}h</option>`).join("")}</select>
      <input class="wide" id="knownLeaveNotes" placeholder="Notes (optional)">
      <button id="knownLeaveAdd" class="modal-button save-button" type="button">Add / Update</button>
    </div>
    <div id="futureRiskSummary"></div>
    <div class="known-leave-list">${state.rows.length?state.rows.map(r=>{const pr=profiles.find(p=>p.id===r.user_id);return `<div class="known-leave-item"><span><strong>${esc(name(pr))}</strong> · ${esc(r.leave_date)} · ${esc(r.leave_type)} ${Number(r.hours||0)}h${r.notes?` · ${esc(r.notes)}`:""}</span><button type="button" data-remove-known="${esc(r.id)}">Remove</button></div>`}).join(""):"<div style='color:#64748b;font-size:12px'>No known leave entered for this quarter.</div>"}</div>`;
  box.querySelector("#knownLeaveAdd").onclick=addKnown;
  box.querySelectorAll("[data-remove-known]").forEach(b=>b.onclick=()=>removeKnown(b.dataset.removeKnown));
  renderRiskSummary();
}

function markCells(){
  document.querySelectorAll(".known-leave-mark").forEach(c=>{c.classList.remove("known-leave-mark");c.removeAttribute("data-known-leave")});
  try{profiles.forEach(pr=>getWeekDates().forEach((d,i)=>{const date=key(d);if(!rowsFor(pr.id).some(x=>x.leave_date===date))return;document.querySelectorAll("tbody tr").forEach(r=>{if(r.querySelector(".employee-name")?.textContent!==name(pr))return;const c=r.querySelectorAll(".schedule-cell")[i];if(c){c.classList.add("known-leave-mark");c.dataset.knownLeave="1";c.title="Known leave/unavailability entered for this date."}})}))}catch(_){}
}

function accessFor(uid){try{return schedulingAccess?.[uid]||adminSchedulingAccess?.[uid]||null}catch(_){return null}}
function waitingEmployees(actorId,site){return profiles.filter(p=>p.active&&p.role==="employee"&&p.id!==actorId&&p.clinic_site===site&&!accessFor(p.id)?.is_open)}
function leaveHoursInWeek(uid,ws){let n=0;for(let i=0;i<7;i++)n+=rowsFor(uid).filter(x=>x.leave_date===add(ws,i)).reduce((a,x)=>a+Number(x.hours||0),0);return Math.min(40,n)}
function existingClinicalHours(uid,ws){let n=0;for(let i=0;i<7;i++){const d=add(ws,i),entry=typeof getScheduleEntry==="function"?getScheduleEntry(uid,d):null;if(entry?.code==="12")n+=Math.max(0,12-rowsFor(uid).filter(x=>x.leave_date===d).reduce((a,x)=>a+Number(x.hours||0),0));else if(entry?.code==="A4")n+=4}return n}
function requiredFutureHours(uid,ws){return Math.max(0,40-leaveHoursInWeek(uid,ws)-existingClinicalHours(uid,ws))}
function availableDays(uid,ws,site,tentative){let days=0;for(let i=0;i<7;i++){const d=add(ws,i);if(unavailable(uid,d))continue;const own=typeof getScheduleEntry==="function"?getScheduleEntry(uid,d):null;if(own?.code==="12")continue;let remaining=typeof getRemainingShiftAvailability==="function"?getRemainingShiftAvailability(site,d,uid):0;if(tentative&&tentative.date===d&&tentative.site===site&&tentative.actor!==uid)remaining--;if(remaining>0)days++}return days}
function riskForChoice(actor,date,site){const ws=weekStart(date);for(const person of waitingEmployees(actor.id,site)){const needed=requiredFutureHours(person.id,ws);if(needed<=0)continue;const before=availableDays(person.id,ws,site,null)*12,after=availableDays(person.id,ws,site,{date,site,actor:actor.id})*12;if(before>=needed&&after<needed)return{person,needed,after,ws}}return null}
async function guard(profile,date,site){if(role()==="admin")return true;await load(true);const risk=riskForChoice(profile,date,site);if(!risk)return true;showError(`That shift is protected for a later picker. Taking the final ${site} opening on ${date} would leave ${name(risk.person)} with about ${risk.after} usable clinical hours for the week of ${risk.ws}, but they still need ${risk.needed} hours after known leave.`);return false}
function renderRiskSummary(){const el=document.getElementById("futureRiskSummary"),p=selectedPeriod();if(!el||!p)return;const risks=[];for(const person of profiles.filter(x=>x.active&&x.role==="employee"&&!accessFor(x.id)?.is_open)){for(let ws=weekStart(p.period_start);ws<=p.period_end;ws=add(ws,7)){const needed=requiredFutureHours(person.id,ws);if(needed<=0)continue;const possible=availableDays(person.id,ws,person.clinic_site,null)*12;if(possible<needed)risks.push(`${name(person)} · week of ${ws}: ${possible}h usable / ${needed}h still needed`)}}el.innerHTML=risks.length?`<div class="future-risk"><strong>Future pick risk${risks.length===1?"":"s"}:</strong><br>${risks.slice(0,8).map(esc).join("<br>")}${risks.length>8?`<br>+ ${risks.length-8} more`:""}</div>`:""}

ensureStyles();
const originalConfirm=confirmCapacityFor12Shift;
confirmCapacityFor12Shift=async function(profile,date,site){const base=await originalConfirm(profile,date,site);if(!base)return false;return guard(profile,date,site)};
window.confirmCapacityFor12Shift=confirmCapacityFor12Shift;
const originalRender=renderSchedule;
renderSchedule=function(){const r=originalRender.apply(this,arguments);setTimeout(()=>{markCells();if(role()==="admin")renderAdminBox()},0);return r};
window.renderSchedule=renderSchedule;
if(typeof renderQuarterDashboard==="function"){
  const oq=renderQuarterDashboard;
  renderQuarterDashboard=async function(){const r=await oq.apply(this,arguments);await load(true);renderAdminBox();return r};
  window.renderQuarterDashboard=renderQuarterDashboard;
}
setTimeout(async()=>{await load();markCells();renderAdminBox()},700);
})();
