/* ACC Schedule Manager - Archive Center
 * Exports a complete quarter to a portable JSON archive and keeps a lightweight
 * searchable archive index in Supabase. Archive files can be opened later for
 * read-only viewing without restoring them to the live database.
 */
(function () {
  "use strict";

  const FORMAT = "acc-schedule-archive-v1";
  const VERSION = "2026.08.14.1";
  let loadedArchive = null;

  console.info(`[ACC Schedule Manager] archive center loaded: ${VERSION}`);

  function isAdmin() {
    return Boolean(window.currentProfile && currentProfile.role === "admin" && currentProfile.active !== false);
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtDate(value) {
    if (!value) return "—";
    const [y,m,d] = String(value).slice(0,10).split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", {month:"short",day:"numeric",year:"numeric"}).format(new Date(y,m-1,d));
  }

  function fmtDateTime(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-US", {dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
  }

  function safeName(value) {
    return String(value || "quarter").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60) || "quarter";
  }

  function profileName(id, profileRows) {
    const p = (profileRows || []).find(x => x.id === id);
    return p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.username || id : id || "Unknown";
  }

  function ensureStyles() {
    if (document.getElementById("archiveCenterStyles")) return;
    const style = document.createElement("style");
    style.id = "archiveCenterStyles";
    style.textContent = `
      #archiveCenterTopButton{background:#475569!important;border-color:#64748b!important;color:#fff!important;font-weight:700}
      #archiveCenterTopButton:hover{background:#334155!important}
      .archive-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:10px;align-items:end;margin-bottom:16px}
      .archive-info{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;border-radius:8px;padding:11px 12px;font-size:12px;line-height:1.45;margin-bottom:14px}
      .archive-card{border:1px solid #e2e8f0;background:#fff;border-radius:9px;padding:12px;margin-bottom:9px}
      .archive-card-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .archive-card-title{font-weight:800;color:#17365d}
      .archive-card-meta{font-size:11px;color:#64748b;margin-top:3px}
      .archive-badge{display:inline-block;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:800;background:#e2e8f0;color:#334155}
      .archive-count-grid{display:grid;grid-template-columns:repeat(4,minmax(90px,1fr));gap:6px;margin-top:10px}
      .archive-count{background:#f8fafc;border-radius:6px;padding:7px;font-size:10px;color:#64748b}
      .archive-count strong{display:block;color:#17365d;font-size:15px}
      .archive-file-tools{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
      .archive-preview-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #e5e7eb;border-radius:8px}
      .archive-preview-table{border-collapse:collapse;width:100%;min-width:720px;font-size:11px}
      .archive-preview-table th,.archive-preview-table td{padding:7px 8px;border-bottom:1px solid #e5e7eb;text-align:left}
      .archive-preview-table th{background:#f8fafc;color:#17365d;position:sticky;top:0}
      .archive-section-title{font-weight:800;color:#17365d;margin:16px 0 8px}
      .archive-empty{padding:22px;text-align:center;color:#64748b}
      .archive-error,.archive-success{display:none;padding:10px 12px;border-radius:7px;margin-bottom:12px;font-size:12px}
      .archive-error{background:#fee2e2;color:#991b1b}.archive-success{background:#dcfce7;color:#166534}
      @media(max-width:760px){
        .archive-toolbar{grid-template-columns:1fr}
        .archive-toolbar .modal-button{width:100%}
        .archive-count-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .archive-file-tools{display:grid;grid-template-columns:1fr}
        .archive-file-tools .modal-button{width:100%}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    let modal = document.getElementById("archiveCenterModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "archiveCenterModal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal modal-wide">
        <div class="modal-header"><div class="modal-title">Archive Center</div><button class="modal-close" id="archiveCloseX" type="button">×</button></div>
        <div class="modal-body modal-scroll">
          <div id="archiveError" class="archive-error"></div><div id="archiveSuccess" class="archive-success"></div>
          <div class="archive-info"><strong>How archives work:</strong> Exporting creates a complete portable quarter file and records a small index entry here. Save the file in OneDrive or another secure location. The detailed live data is not deleted automatically. Later, you can open the archive file here and view the historical schedule even if the live quarter has eventually been removed.</div>
          <div class="archive-toolbar">
            <div class="form-group" style="margin:0"><label for="archivePeriodSelect">Quarter to export</label><select id="archivePeriodSelect"></select></div>
            <button id="archiveExportButton" class="modal-button save-button" type="button">Export Quarter Archive</button>
          </div>
          <div class="archive-file-tools">
            <button id="archiveOpenFileButton" class="modal-button cancel-button" type="button">Open Archive File</button>
            <input id="archiveFileInput" type="file" accept=".json,.accschedule.json,application/json" style="display:none">
            <button id="archiveClearPreview" class="modal-button cancel-button" type="button" style="display:none">Close Archive Preview</button>
          </div>
          <div id="archivePreview"></div>
          <div class="archive-section-title">Archive Index</div>
          <div id="archiveIndexList"><div class="archive-empty">Loading archives…</div></div>
        </div>
        <div class="modal-footer"><button id="archiveCloseFooter" class="modal-button cancel-button" type="button">Close</button></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector("#archiveCloseX").onclick = closeArchiveCenter;
    modal.querySelector("#archiveCloseFooter").onclick = closeArchiveCenter;
    modal.querySelector("#archiveExportButton").onclick = exportSelectedQuarter;
    modal.querySelector("#archiveOpenFileButton").onclick = () => modal.querySelector("#archiveFileInput").click();
    modal.querySelector("#archiveFileInput").addEventListener("change", openArchiveFile);
    modal.querySelector("#archiveClearPreview").onclick = clearArchivePreview;
    return modal;
  }

  function setMessage(type, text) {
    const e = document.getElementById("archiveError");
    const s = document.getElementById("archiveSuccess");
    if (!e || !s) return;
    e.style.display = "none"; s.style.display = "none";
    if (!text) return;
    const el = type === "error" ? e : s;
    el.textContent = text; el.style.display = "block";
  }

  function periods() {
    return Array.isArray(window.allSchedulingPeriods) ? allSchedulingPeriods : [];
  }

  function populatePeriodSelect() {
    const select = document.getElementById("archivePeriodSelect");
    if (!select) return;
    const prior = select.value || window.viewSchedulingPeriodId || window.adminSchedulingPeriodId || "";
    select.innerHTML = "";
    periods().slice().sort((a,b)=>String(b.period_start).localeCompare(String(a.period_start))).forEach(p => {
      const o = new Option(`${p.name} (${fmtDate(p.period_start)} – ${fmtDate(p.period_end)})`, p.id);
      if (p.id === prior) o.selected = true;
      select.add(o);
    });
  }

  async function selectRows(table, select, configure) {
    let q = supabaseClient.from(table).select(select || "*");
    q = configure(q);
    const {data,error} = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    return data || [];
  }

  async function buildArchive(period) {
    const start = period.period_start;
    const end = period.period_end;

    const [
      schedules, leaveHours, comments, capacity, submissions, locks,
      periodAccess, weekendTargets, opportunities, auditLog, changeLog,
      profileRows, employmentPeriods
    ] = await Promise.all([
      selectRows("schedules","*",q=>q.gte("schedule_date",start).lte("schedule_date",end).order("schedule_date")),
      selectRows("schedule_leave_hours","*",q=>q.gte("leave_date",start).lte("leave_date",end).order("leave_date")),
      selectRows("schedule_comments","*",q=>q.gte("schedule_date",start).lte("schedule_date",end).order("schedule_date")),
      selectRows("clinic_capacity","*",q=>q.gte("capacity_date",start).lte("capacity_date",end).order("capacity_date")),
      selectRows("week_submissions","*",q=>q.gte("week_start",start).lte("week_start",end).order("week_start")),
      selectRows("weekly_locks","*",q=>q.gte("week_start",start).lte("week_start",end).order("week_start")),
      selectRows("scheduling_period_access","*",q=>q.eq("period_id",period.id)),
      selectRows("scheduling_month_weekend_targets","*",q=>q.eq("period_id",period.id)),
      selectRows("open_shift_opportunities","*",q=>q.eq("period_id",period.id).order("shift_date")),
      selectRows("schedule_audit_log","*",q=>q.gte("schedule_date",start).lte("schedule_date",end).order("changed_at")),
      selectRows("schedule_change_log","*",q=>q.gte("schedule_date",start).lte("schedule_date",end).order("changed_at")),
      selectRows("profiles","id,first_name,last_name,role,active,clinic_site,username,created_at,updated_at",q=>q.order("last_name")),
      selectRows("employment_periods","*",q=>q.lte("start_date",end).or(`end_date.is.null,end_date.gte.${start}`))
    ]);

    const oppIds = opportunities.map(x=>x.id);
    let openShiftClaims = [];
    if (oppIds.length) {
      const {data,error} = await supabaseClient.from("open_shift_claims").select("*").in("opportunity_id",oppIds).order("created_at");
      if (error) throw new Error(`open_shift_claims: ${error.message}`);
      openShiftClaims = data || [];
    }

    const data = {
      scheduling_periods: [period], schedules, schedule_leave_hours: leaveHours,
      schedule_comments: comments, clinic_capacity: capacity, week_submissions: submissions,
      weekly_locks: locks, scheduling_period_access: periodAccess,
      scheduling_month_weekend_targets: weekendTargets,
      open_shift_opportunities: opportunities, open_shift_claims: openShiftClaims,
      schedule_audit_log: auditLog, schedule_change_log: changeLog,
      profiles: profileRows, employment_periods: employmentPeriods
    };

    const counts = Object.fromEntries(Object.entries(data).map(([k,v])=>[k,Array.isArray(v)?v.length:0]));
    return {
      format: FORMAT,
      version: 1,
      exported_at: new Date().toISOString(),
      exported_by: currentUser?.id || null,
      quarter: {id:period.id,name:period.name,period_start:start,period_end:end},
      counts,
      data
    };
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function exportSelectedQuarter() {
    if (!isAdmin()) return;
    const id = document.getElementById("archivePeriodSelect")?.value;
    const period = periods().find(p=>p.id===id);
    if (!period) return setMessage("error","Select a quarter to export.");
    const button = document.getElementById("archiveExportButton");
    button.disabled = true; button.textContent = "Building Archive…"; setMessage("","");
    try {
      const archive = await buildArchive(period);
      const fileName = `acc-schedule-${safeName(period.name)}-${period.period_start}-to-${period.period_end}.accschedule.json`;
      const {error:indexError} = await supabaseClient.from("schedule_archive_index").insert({
        period_id: period.id,
        quarter_name: period.name,
        period_start: period.period_start,
        period_end: period.period_end,
        file_name: fileName,
        archive_format: FORMAT,
        status: "exported",
        record_counts: archive.counts,
        archived_by: currentUser.id
      });
      if (indexError) throw indexError;
      downloadJson(archive,fileName);
      setMessage("success",`Archive created for ${period.name}. Save the archive file in OneDrive or another secure location before ever removing live data.`);
      await loadArchiveIndex();
    } catch (error) {
      console.error(error); setMessage("error",error.message || "Unable to create the quarter archive.");
    } finally {
      button.disabled=false; button.textContent="Export Quarter Archive";
    }
  }

  async function loadArchiveIndex() {
    const box = document.getElementById("archiveIndexList");
    if (!box) return;
    const {data,error} = await supabaseClient.from("schedule_archive_index").select("*").order("archived_at",{ascending:false});
    if (error) { box.innerHTML=`<div class="archive-empty">${esc(error.message)}</div>`; return; }
    if (!data?.length) { box.innerHTML='<div class="archive-empty">No quarter archives have been exported yet.</div>'; return; }
    box.innerHTML = data.map(row => {
      const counts = row.record_counts || {};
      return `<div class="archive-card">
        <div class="archive-card-head"><div><div class="archive-card-title">${esc(row.quarter_name)}</div><div class="archive-card-meta">${esc(fmtDate(row.period_start))} – ${esc(fmtDate(row.period_end))}<br>${esc(row.file_name)} · Archived ${esc(fmtDateTime(row.archived_at))}</div></div><span class="archive-badge">${esc(row.status.replaceAll("_"," ").toUpperCase())}</span></div>
        <div class="archive-count-grid">
          <div class="archive-count"><strong>${Number(counts.schedules||0)}</strong>Schedule rows</div>
          <div class="archive-count"><strong>${Number(counts.schedule_comments||0)}</strong>Comments</div>
          <div class="archive-count"><strong>${Number(counts.schedule_audit_log||0)+Number(counts.schedule_change_log||0)}</strong>History rows</div>
          <div class="archive-count"><strong>${Number(counts.open_shift_claims||0)}</strong>Open-shift claims</div>
        </div>
      </div>`;
    }).join("");
  }

  async function openArchiveFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.format !== FORMAT || !parsed.quarter || !parsed.data) throw new Error("This is not a valid ACC Schedule Manager archive file.");
      loadedArchive = parsed; renderArchivePreview(parsed); setMessage("success",`Opened archive: ${parsed.quarter.name}.`);
    } catch (error) {
      console.error(error); loadedArchive=null; setMessage("error",error.message || "Unable to open archive file.");
    } finally { event.target.value=""; }
  }

  function clearArchivePreview() {
    loadedArchive=null;
    const box=document.getElementById("archivePreview"); if(box) box.innerHTML="";
    const b=document.getElementById("archiveClearPreview"); if(b) b.style.display="none";
  }

  function renderArchivePreview(archive) {
    const box = document.getElementById("archivePreview");
    if (!box) return;
    document.getElementById("archiveClearPreview").style.display="";
    const profiles = archive.data.profiles || [];
    const commentsByKey = new Map((archive.data.schedule_comments||[]).map(x=>[`${x.user_id}|${x.schedule_date}`,x.comment]));
    const leaveByKey = new Map((archive.data.schedule_leave_hours||[]).map(x=>[`${x.user_id}|${x.leave_date}`,x]));
    const rows = (archive.data.schedules||[]).slice().sort((a,b)=>String(a.schedule_date).localeCompare(String(b.schedule_date)) || profileName(a.user_id,profiles).localeCompare(profileName(b.user_id,profiles)));
    const openClaims = archive.data.open_shift_claims || [];
    const opportunities = archive.data.open_shift_opportunities || [];

    const scheduleHtml = rows.length ? `<div class="archive-preview-table-wrap"><table class="archive-preview-table"><thead><tr><th>Date</th><th>Person</th><th>Clinic</th><th>Code</th><th>Leave</th><th>Comment</th></tr></thead><tbody>${rows.map(r=>{
      const leave=leaveByKey.get(`${r.user_id}|${r.schedule_date}`)||{};
      const leaveText=[leave.vacation_hours?`VL ${leave.vacation_hours}`:"",leave.professional_leave_hours?`PL ${leave.professional_leave_hours}`:"",leave.tdl_hours?`TDL ${leave.tdl_hours}`:""].filter(Boolean).join(", ")||"—";
      return `<tr><td>${esc(fmtDate(r.schedule_date))}</td><td>${esc(profileName(r.user_id,profiles))}</td><td>${esc(r.work_site||"—")}</td><td>${esc(r.schedule_code||"0")}</td><td>${esc(leaveText)}</td><td>${esc(commentsByKey.get(`${r.user_id}|${r.schedule_date}`)||"—")}</td></tr>`;
    }).join("")}</tbody></table></div>` : '<div class="archive-empty">No schedule rows in this archive.</div>';

    const claimHtml = openClaims.length ? `<div class="archive-preview-table-wrap"><table class="archive-preview-table"><thead><tr><th>Date</th><th>Clinic</th><th>Person</th><th>Hours</th></tr></thead><tbody>${openClaims.map(c=>{
      const op=opportunities.find(o=>o.id===c.opportunity_id)||{};
      return `<tr><td>${esc(fmtDate(op.shift_date))}</td><td>${esc(op.clinic_site||"—")}</td><td>${esc(profileName(c.user_id,profiles))}</td><td>${esc(`${c.start_hour}:00–${c.end_hour}:00`)}</td></tr>`;
    }).join("")}</tbody></table></div>` : '<div class="archive-empty">No open-shift claims in this archive.</div>';

    box.innerHTML = `<div class="archive-card"><div class="archive-card-title">Viewing archived quarter: ${esc(archive.quarter.name)}</div><div class="archive-card-meta">${esc(fmtDate(archive.quarter.period_start))} – ${esc(fmtDate(archive.quarter.period_end))} · Exported ${esc(fmtDateTime(archive.exported_at))}</div></div><div class="archive-section-title">Archived Schedule</div>${scheduleHtml}<div class="archive-section-title">Archived Open Shift Claims</div>${claimHtml}`;
  }

  function closeArchiveCenter() { document.getElementById("archiveCenterModal")?.classList.remove("show"); }

  window.openArchiveCenter = async function () {
    if (!isAdmin()) return;
    ensureStyles(); ensureModal(); populatePeriodSelect(); clearArchivePreview(); setMessage("","");
    document.getElementById("archiveCenterModal").classList.add("show");
    await loadArchiveIndex();
  };

  function installButton() {
    if (!isAdmin()) { document.getElementById("archiveCenterTopButton")?.remove(); return; }
    const bar = document.querySelector(".topbar-user"); if (!bar) return;
    let btn=document.getElementById("archiveCenterTopButton");
    if (!btn) {
      btn=document.createElement("button"); btn.id="archiveCenterTopButton"; btn.className="topbar-button"; btn.type="button"; btn.textContent="Archive";
      const anchor=document.getElementById("scheduleHistoryTopButton") || document.getElementById("quarterDashboardTopButton") || document.getElementById("managePeopleTopButton");
      if(anchor) anchor.insertAdjacentElement("afterend",btn); else bar.appendChild(btn);
    }
    btn.onclick=window.openArchiveCenter; btn.style.display="";
  }

  ensureStyles();
  setTimeout(installButton,0); setTimeout(installButton,500); setTimeout(installButton,1500);
  if (typeof updateUserHeader === "function") {
    const original=updateUserHeader;
    updateUserHeader=function(...args){const result=original.apply(this,args);setTimeout(installButton,0);return result;};
  }
})();