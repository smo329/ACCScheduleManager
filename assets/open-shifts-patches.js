/*
 * ACC Schedule Manager - Open Shifts workflow
 * Admins publish remaining 12-hour opportunities; employees may claim
 * non-overlapping blocks between 8 AM and 8 PM, minimum 2 hours.
 */
(function () {
  "use strict";

  const VERSION = "2026.08.14.1";
  const CLINICS = ["Turfland", "Fountain Court"];
  console.info(`[ACC Schedule Manager] open shifts patch loaded: ${VERSION}`);

  function isAdmin() {
    return Boolean(currentProfile && currentProfile.role === "admin");
  }

  function isEmployee() {
    return Boolean(currentProfile && currentProfile.role === "employee" && currentProfile.active !== false);
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function localDate(key) {
    const [y,m,d] = String(key).split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function fmtDate(key) {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short", month: "short", day: "numeric", year: "numeric"
    }).format(localDate(key));
  }

  function fmtHour(hour) {
    if (hour === 0 || hour === 24) return "12 AM";
    if (hour === 12) return "12 PM";
    return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
  }

  function profileName(id) {
    const p = (typeof profiles !== "undefined" ? profiles : []).find(x => x.id === id);
    if (!p) return "Unknown employee";
    if (typeof getProfileName === "function") return getProfileName(p);
    return `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown employee";
  }

  function defaultCapacity(clinic, dateKey) {
    const day = localDate(dateKey).getDay();
    if (clinic === "Turfland") return day >= 1 && day <= 4 ? 3 : 2;
    if (clinic === "Fountain Court") return day === 2 || day === 3 ? 2 : 1;
    return 0;
  }

  function periodList() {
    return typeof allSchedulingPeriods !== "undefined" ? allSchedulingPeriods : [];
  }

  function selectedDefaultPeriodId() {
    if (typeof viewSchedulingPeriodId !== "undefined" && viewSchedulingPeriodId) return viewSchedulingPeriodId;
    if (typeof adminSchedulingPeriodId !== "undefined" && adminSchedulingPeriodId) return adminSchedulingPeriodId;
    if (typeof activeSchedulingPeriod !== "undefined" && activeSchedulingPeriod?.id) return activeSchedulingPeriod.id;
    return periodList()[0]?.id || "";
  }

  function ensureStyles() {
    if (document.getElementById("openShiftStyles")) return;
    const style = document.createElement("style");
    style.id = "openShiftStyles";
    style.textContent = `
      #openShiftsModal .open-shift-toolbar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:14px}
      #openShiftsModal .open-shift-toolbar .form-group{margin:0;min-width:220px;flex:1}
      .open-shift-tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
      .open-shift-tab{border:1px solid #cbd5e1;background:white;padding:8px 12px;border-radius:6px;font-weight:700;cursor:pointer}
      .open-shift-tab.active{background:#17365d;color:white;border-color:#17365d}
      .open-shift-card{border:1px solid #e2e8f0;border-radius:10px;background:white;padding:14px;margin-bottom:10px}
      .open-shift-card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
      .open-shift-date{font-weight:700;color:#17365d;font-size:15px}
      .open-shift-site{font-size:12px;color:#64748b;margin-top:2px}
      .open-shift-meter{font-size:12px;font-weight:700;color:#475569}
      .open-shift-claims{margin-top:10px;border-top:1px solid #e5e7eb;padding-top:8px}
      .open-shift-line{display:flex;justify-content:space-between;gap:10px;padding:6px 0;font-size:12px;border-bottom:1px dashed #e5e7eb}
      .open-shift-line:last-child{border-bottom:0}
      .open-shift-available{color:#166534;font-weight:700}
      .open-shift-covered{color:#334155}
      .open-shift-signup{display:grid;grid-template-columns:1fr 1fr auto;gap:7px;align-items:end;margin-top:8px;padding:9px;background:#f8fafc;border-radius:7px}
      .open-shift-signup label{display:block;font-size:10px;font-weight:700;color:#64748b;margin-bottom:3px}
      .open-shift-signup select{width:100%;min-height:38px;border:1px solid #cbd5e1;border-radius:5px;background:white;padding:6px}
      .open-shift-admin-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
      .open-shift-builder-row{display:grid;grid-template-columns:auto 1.2fr 1fr .5fr;gap:10px;align-items:center;padding:9px;border-bottom:1px solid #e5e7eb;font-size:12px}
      .open-shift-builder-row:first-child{border-top:1px solid #e5e7eb}
      .open-shift-builder-row input[type=checkbox]{width:20px;height:20px}
      .open-shift-empty{padding:24px;text-align:center;color:#64748b}
      .open-shift-error{background:#fee2e2;color:#991b1b;padding:10px;border-radius:6px;margin-bottom:10px;display:none}
      .open-shift-success{background:#dcfce7;color:#166534;padding:10px;border-radius:6px;margin-bottom:10px;display:none}
      @media(max-width:760px){
        #openShiftsModal .open-shift-toolbar{display:grid;grid-template-columns:1fr}
        #openShiftsModal .open-shift-toolbar .form-group{min-width:0;width:100%}
        .open-shift-tabs{display:grid;grid-template-columns:1fr 1fr}
        .open-shift-tab{width:100%}
        .open-shift-signup{grid-template-columns:1fr 1fr;gap:6px}
        .open-shift-signup button{grid-column:1/-1;width:100%}
        .open-shift-builder-row{grid-template-columns:auto 1fr;gap:5px 9px}
        .open-shift-builder-row .builder-site,.open-shift-builder-row .builder-slot{grid-column:2}
        .open-shift-admin-actions .modal-button{flex:1 1 45%}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    let modal = document.getElementById("openShiftsModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "openShiftsModal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal modal-wide">
        <div class="modal-header">
          <div class="modal-title">Open Shifts</div>
          <button class="modal-close" id="closeOpenShifts" type="button">×</button>
        </div>
        <div class="modal-body modal-scroll">
          <div id="openShiftError" class="open-shift-error"></div>
          <div id="openShiftSuccess" class="open-shift-success"></div>
          <div class="open-shift-toolbar">
            <div class="form-group">
              <label for="openShiftPeriodSelect">Quarter</label>
              <select id="openShiftPeriodSelect"></select>
            </div>
            <button id="refreshOpenShifts" class="modal-button cancel-button" type="button">Refresh</button>
          </div>
          <div id="openShiftTabs" class="open-shift-tabs"></div>
          <div id="openShiftContent"></div>
        </div>
        <div class="modal-footer">
          <button id="closeOpenShiftsFooter" class="modal-button cancel-button" type="button">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector("#closeOpenShifts").onclick = closeModal;
    modal.querySelector("#closeOpenShiftsFooter").onclick = closeModal;
    modal.querySelector("#refreshOpenShifts").onclick = renderCurrentTab;
    modal.querySelector("#openShiftPeriodSelect").addEventListener("change", renderCurrentTab);
    return modal;
  }

  let currentTab = "published";

  function setMessage(type, text) {
    const error = document.getElementById("openShiftError");
    const success = document.getElementById("openShiftSuccess");
    if (!error || !success) return;
    error.style.display = "none";
    success.style.display = "none";
    if (!text) return;
    const el = type === "error" ? error : success;
    el.textContent = text;
    el.style.display = "block";
  }

  function populatePeriods() {
    const select = document.getElementById("openShiftPeriodSelect");
    if (!select) return;
    const previous = select.value || selectedDefaultPeriodId();
    select.innerHTML = "";
    periodList().slice().sort((a,b) => String(a.period_start).localeCompare(String(b.period_start))).forEach(p => {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = `${p.name} (${p.period_start} – ${p.period_end})`;
      if (p.id === previous) option.selected = true;
      select.appendChild(option);
    });
  }

  function renderTabs() {
    const tabs = document.getElementById("openShiftTabs");
    if (!tabs) return;
    const items = [{id:"published",label:"Available Shifts"}];
    if (isAdmin()) items.push({id:"build",label:"Build / Publish"});
    tabs.innerHTML = items.map(x => `<button type="button" class="open-shift-tab ${currentTab===x.id?"active":""}" data-tab="${x.id}">${x.label}</button>`).join("");
    tabs.querySelectorAll("button").forEach(btn => btn.onclick = () => {
      currentTab = btn.dataset.tab;
      renderTabs();
      renderCurrentTab();
    });
  }

  function closeModal() {
    document.getElementById("openShiftsModal")?.classList.remove("show");
  }

  async function fetchOpenShiftData(periodId, includeClosed=false) {
    let oq = supabaseClient.from("open_shift_opportunities")
      .select("id,period_id,shift_date,clinic_site,slot_number,start_hour,end_hour,status,created_at")
      .eq("period_id", periodId)
      .order("shift_date", {ascending:true})
      .order("clinic_site", {ascending:true})
      .order("slot_number", {ascending:true});
    if (!includeClosed) oq = oq.eq("status", "published");
    const {data: opps, error: oppErr} = await oq;
    if (oppErr) throw oppErr;
    const ids = (opps || []).map(o => o.id);
    let claims = [];
    if (ids.length) {
      const {data, error} = await supabaseClient.from("open_shift_claims")
        .select("id,opportunity_id,user_id,start_hour,end_hour,created_at")
        .in("opportunity_id", ids)
        .order("start_hour", {ascending:true});
      if (error) throw error;
      claims = data || [];
    }
    return {opps: opps || [], claims};
  }

  function claimsFor(opportunity, claims) {
    return claims.filter(c => c.opportunity_id === opportunity.id).sort((a,b)=>a.start_hour-b.start_hour);
  }

  function gapsFor(opportunity, claims) {
    const rows = claimsFor(opportunity, claims);
    const gaps = [];
    let cursor = opportunity.start_hour;
    rows.forEach(c => {
      if (c.start_hour > cursor) gaps.push([cursor, c.start_hour]);
      cursor = Math.max(cursor, c.end_hour);
    });
    if (cursor < opportunity.end_hour) gaps.push([cursor, opportunity.end_hour]);
    return gaps;
  }

  function hoursCovered(opportunity, claims) {
    return claimsFor(opportunity, claims).reduce((sum,c)=>sum+(c.end_hour-c.start_hour),0);
  }

  function options(from, to, selected) {
    let html = "";
    for (let h=from; h<=to; h++) html += `<option value="${h}" ${h===selected?"selected":""}>${fmtHour(h)}</option>`;
    return html;
  }

  function publishedCard(op, claims) {
    const rows = claimsFor(op, claims);
    const gaps = gapsFor(op, claims);
    const covered = hoursCovered(op, claims);
    const total = op.end_hour - op.start_hour;
    const lines = [];
    const combined = [
      ...rows.map(c=>({type:"claim",start:c.start_hour,end:c.end_hour,claim:c})),
      ...gaps.map(g=>({type:"gap",start:g[0],end:g[1]}))
    ].sort((a,b)=>a.start-b.start);
    combined.forEach(item => {
      if (item.type === "claim") {
        const c = item.claim;
        const cancel = (isAdmin() || c.user_id === currentUser.id)
          ? `<button class="modal-button cancel-button cancel-open-claim" data-id="${c.id}" type="button">Remove</button>` : "";
        lines.push(`<div class="open-shift-line"><span class="open-shift-covered">${fmtHour(c.start)}–${fmtHour(c.end)} — ${esc(profileName(c.user_id))}</span>${cancel}</div>`);
      } else {
        lines.push(`<div class="open-shift-line"><span class="open-shift-available">${fmtHour(item.start)}–${fmtHour(item.end)} — Available</span></div>`);
        if (isEmployee() && item.end-item.start >= 2) {
          lines.push(`<div class="open-shift-signup" data-opp="${op.id}" data-min="${item.start}" data-max="${item.end}">
            <div><label>Start</label><select class="open-start">${options(item.start,item.end-2,item.start)}</select></div>
            <div><label>End</label><select class="open-end">${options(item.start+2,item.end,item.end)}</select></div>
            <button class="modal-button save-button claim-open-shift" type="button">Sign Up</button>
          </div>`);
        }
      }
    });
    const adminActions = isAdmin() ? `<div class="open-shift-admin-actions">
      <button class="modal-button cancel-button toggle-open-shift" data-id="${op.id}" data-status="${op.status}" type="button">${op.status==="published"?"Close Shift":"Reopen Shift"}</button>
      ${rows.length===0 ? `<button class="modal-button deactivate-button delete-open-shift" data-id="${op.id}" type="button">Remove Shift</button>` : ""}
    </div>` : "";
    return `<div class="open-shift-card">
      <div class="open-shift-card-head">
        <div><div class="open-shift-date">${esc(fmtDate(op.shift_date))}</div><div class="open-shift-site">${esc(op.clinic_site)} · Open Shift ${op.slot_number} · ${fmtHour(op.start_hour)}–${fmtHour(op.end_hour)}</div></div>
        <div class="open-shift-meter">${covered}/${total} hours covered${op.status==="closed"?" · CLOSED":""}</div>
      </div>
      <div class="open-shift-claims">${lines.join("")}</div>${adminActions}
    </div>`;
  }

  async function renderPublished() {
    const content = document.getElementById("openShiftContent");
    const periodId = document.getElementById("openShiftPeriodSelect")?.value;
    if (!content || !periodId) return;
    content.innerHTML = `<div class="open-shift-empty">Loading open shifts...</div>`;
    try {
      const {opps, claims} = await fetchOpenShiftData(periodId, isAdmin());
      const visible = isAdmin() ? opps : opps.filter(o=>o.status==="published");
      content.innerHTML = visible.length ? visible.map(o=>publishedCard(o,claims)).join("") : `<div class="open-shift-empty">No open shifts are published for this quarter.</div>`;
      wirePublishedActions();
    } catch (e) {
      console.error(e); setMessage("error", e.message || "Unable to load open shifts.");
    }
  }

  function wirePublishedActions() {
    document.querySelectorAll(".claim-open-shift").forEach(btn => btn.onclick = claimOpenShift);
    document.querySelectorAll(".cancel-open-claim").forEach(btn => btn.onclick = cancelClaim);
    document.querySelectorAll(".toggle-open-shift").forEach(btn => btn.onclick = toggleShift);
    document.querySelectorAll(".delete-open-shift").forEach(btn => btn.onclick = deleteShift);
    document.querySelectorAll(".open-shift-signup").forEach(box => {
      const start = box.querySelector(".open-start");
      const end = box.querySelector(".open-end");
      start.addEventListener("change", () => {
        const minEnd = Number(start.value)+2;
        const max = Number(box.dataset.max);
        const previous = Number(end.value);
        end.innerHTML = options(minEnd,max,Math.max(previous,minEnd));
      });
    });
  }

  async function claimOpenShift(event) {
    const box = event.currentTarget.closest(".open-shift-signup");
    const start = Number(box.querySelector(".open-start").value);
    const end = Number(box.querySelector(".open-end").value);
    event.currentTarget.disabled = true;
    try {
      const {error} = await supabaseClient.from("open_shift_claims").insert({
        opportunity_id: box.dataset.opp,
        user_id: currentUser.id,
        start_hour: start,
        end_hour: end
      });
      if (error) throw error;
      setMessage("success", `Signed up for ${fmtHour(start)}–${fmtHour(end)}.`);
      await renderPublished();
    } catch (e) {
      console.error(e); setMessage("error", e.message || "Unable to claim those hours. They may have just been taken by someone else.");
      event.currentTarget.disabled = false;
    }
  }

  async function cancelClaim(event) {
    if (!confirm("Remove this open-shift signup?")) return;
    const {error} = await supabaseClient.from("open_shift_claims").delete().eq("id", event.currentTarget.dataset.id);
    if (error) return setMessage("error", error.message);
    setMessage("success", "Signup removed; those hours are available again.");
    await renderPublished();
  }

  async function toggleShift(event) {
    const btn = event.currentTarget;
    const status = btn.dataset.status === "published" ? "closed" : "published";
    const {error} = await supabaseClient.from("open_shift_opportunities").update({status,updated_at:new Date().toISOString()}).eq("id",btn.dataset.id);
    if (error) return setMessage("error", error.message);
    setMessage("success", status === "published" ? "Open shift reopened." : "Open shift closed.");
    await renderPublished();
  }

  async function deleteShift(event) {
    if (!confirm("Remove this unclaimed open shift?")) return;
    const {error} = await supabaseClient.from("open_shift_opportunities").delete().eq("id",event.currentTarget.dataset.id);
    if (error) return setMessage("error", error.message);
    setMessage("success", "Open shift removed.");
    await renderPublished();
  }

  async function buildCandidates(periodId) {
    const period = periodList().find(p=>p.id===periodId);
    if (!period) return [];
    const [{data:schedules,error:sErr},{data:capacities,error:cErr},{data:existing,error:oErr}] = await Promise.all([
      supabaseClient.from("schedules").select("user_id,schedule_date,schedule_code,work_site").gte("schedule_date",period.period_start).lte("schedule_date",period.period_end),
      supabaseClient.from("clinic_capacity").select("clinic_site,capacity_date,shift_capacity").gte("capacity_date",period.period_start).lte("capacity_date",period.period_end),
      supabaseClient.from("open_shift_opportunities").select("shift_date,clinic_site,slot_number").eq("period_id",periodId)
    ]);
    if (sErr) throw sErr; if (cErr) throw cErr; if (oErr) throw oErr;
    const pmap = new Map((typeof profiles !== "undefined" ? profiles : []).map(p=>[p.id,p]));
    const counts = new Map();
    (schedules||[]).forEach(s=>{
      if (s.schedule_code !== "12") return;
      const profile = pmap.get(s.user_id);
      const site = s.work_site || profile?.clinic_site;
      if (!site) return;
      const key = `${s.schedule_date}|${site}`;
      counts.set(key,(counts.get(key)||0)+1);
    });
    const capMap = new Map((capacities||[]).map(c=>[`${c.capacity_date}|${c.clinic_site}`,Number(c.shift_capacity)]));
    const existingSet = new Set((existing||[]).map(o=>`${o.shift_date}|${o.clinic_site}|${o.slot_number}`));
    const candidates=[];
    let d=localDate(period.period_start), end=localDate(period.period_end);
    while(d<=end){
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      CLINICS.forEach(site=>{
        const capacity=capMap.has(`${key}|${site}`)?capMap.get(`${key}|${site}`):defaultCapacity(site,key);
        const scheduled=counts.get(`${key}|${site}`)||0;
        const remaining=Math.max(0,capacity-scheduled);
        for(let slot=1;slot<=remaining;slot++){
          const identity=`${key}|${site}|${slot}`;
          if(!existingSet.has(identity)) candidates.push({shift_date:key,clinic_site:site,slot_number:slot,capacity,scheduled});
        }
      });
      d.setDate(d.getDate()+1);
    }
    return candidates;
  }

  async function renderBuild() {
    if (!isAdmin()) { currentTab="published"; renderTabs(); return renderPublished(); }
    const content=document.getElementById("openShiftContent");
    const periodId=document.getElementById("openShiftPeriodSelect")?.value;
    if(!content||!periodId)return;
    content.innerHTML=`<div class="open-shift-empty">Calculating remaining shifts...</div>`;
    try{
      const candidates=await buildCandidates(periodId);
      if(!candidates.length){content.innerHTML=`<div class="open-shift-empty">No unpublished remaining shifts were found for this quarter.</div>`;return;}
      content.innerHTML=`
        <div style="margin-bottom:10px;color:#475569;font-size:12px;">Select only the remaining shifts you actually want employees to fill. Published shifts become immediately visible for signup.</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px;"><button id="selectAllOpenCandidates" class="modal-button cancel-button" type="button">Select All</button><button id="clearOpenCandidates" class="modal-button cancel-button" type="button">Clear</button><button id="publishOpenCandidates" class="modal-button save-button" type="button">Publish Selected Shifts</button></div>
        <div>${candidates.map((c,i)=>`<label class="open-shift-builder-row"><input type="checkbox" class="open-candidate" data-index="${i}"><span><strong>${esc(fmtDate(c.shift_date))}</strong><br><span style="color:#64748b">${c.scheduled} scheduled / ${c.capacity} capacity</span></span><span class="builder-site">${esc(c.clinic_site)}</span><span class="builder-slot">Open Shift ${c.slot_number}</span></label>`).join("")}</div>`;
      document.getElementById("selectAllOpenCandidates").onclick=()=>document.querySelectorAll(".open-candidate").forEach(x=>x.checked=true);
      document.getElementById("clearOpenCandidates").onclick=()=>document.querySelectorAll(".open-candidate").forEach(x=>x.checked=false);
      document.getElementById("publishOpenCandidates").onclick=()=>publishCandidates(candidates,periodId);
    }catch(e){console.error(e);setMessage("error",e.message||"Unable to build remaining shifts.");}
  }

  async function publishCandidates(candidates,periodId){
    const selected=[...document.querySelectorAll(".open-candidate:checked")].map(x=>candidates[Number(x.dataset.index)]);
    if(!selected.length)return setMessage("error","Select at least one shift to publish.");
    const rows=selected.map(c=>({period_id:periodId,shift_date:c.shift_date,clinic_site:c.clinic_site,slot_number:c.slot_number,start_hour:8,end_hour:20,status:"published",created_by:currentUser.id}));
    const {error}=await supabaseClient.from("open_shift_opportunities").insert(rows);
    if(error)return setMessage("error",error.message);
    setMessage("success",`${rows.length} open shift${rows.length===1?"":"s"} published.`);
    currentTab="published";renderTabs();await renderPublished();
  }

  async function renderCurrentTab(){
    setMessage("","");
    if(currentTab==="build")return renderBuild();
    return renderPublished();
  }

  window.openOpenShifts = async function(){
    ensureStyles();
    const modal=ensureModal();
    populatePeriods();
    if(!isAdmin() && currentTab==="build")currentTab="published";
    renderTabs();
    modal.classList.add("show");
    await renderCurrentTab();
  };

  function installButton(){
    if(!currentUser)return;
    if(document.getElementById("openShiftsTopButton"))return;
    const accountButton=[...document.querySelectorAll(".topbar-user button")].find(b=>b.textContent.trim()==="Account");
    if(!accountButton)return;
    const button=document.createElement("button");
    button.id="openShiftsTopButton";
    button.className="topbar-button";
    button.type="button";
    button.textContent="Open Shifts";
    button.onclick=window.openOpenShifts;
    accountButton.insertAdjacentElement("beforebegin",button);
  }

  if(typeof updateUserHeader==="function"){
    const original=updateUserHeader;
    updateUserHeader=function(...args){const result=original.apply(this,args);setTimeout(installButton,0);return result;};
  }
  setTimeout(installButton,0);
})();
