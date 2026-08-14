/* ACC Schedule Manager - in-app people editor + people search */
(function () {
  "use strict";

  const ROLE_OPTIONS = [
    ["employee", "Employee"],
    ["manager", "Clinic Manager"],
    ["external", "External Shift Worker"],
    ["admin", "Administrator"]
  ];

  let editingProfile = null;

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }

  function ensureStyles() {
    if (document.getElementById("peopleEditorStyles")) return;
    const s = document.createElement("style");
    s.id = "peopleEditorStyles";
    s.textContent = `
      .people-search-wrap{margin:16px 0 12px;position:relative}
      .people-search-wrap input{width:100%;box-sizing:border-box;padding:11px 38px 11px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;background:#fff;color:#0f172a}
      .people-search-clear{position:absolute;right:7px;top:50%;transform:translateY(-50%);border:0;background:transparent;font-size:22px;color:#64748b;cursor:pointer;padding:4px 8px}
      .people-search-count{font-size:12px;color:#64748b;margin-top:5px}
      #personEditorModal{z-index:12000}
      #personEditorModal .modal{max-width:620px}
      .person-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .person-editor-message{display:none;margin-bottom:12px;padding:9px 11px;border-radius:7px;font-size:13px}
      .person-editor-message.error{display:block;background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
      .person-editor-message.success{display:block;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534}
      @media(max-width:650px){.person-editor-grid{grid-template-columns:1fr}#personEditorModal .modal{width:100%;max-width:none;height:100%;max-height:none;border-radius:0}}
    `;
    document.head.appendChild(s);
  }

  function ensureEditorModal() {
    if (document.getElementById("personEditorModal")) return;
    const overlay = document.createElement("div");
    overlay.id = "personEditorModal";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header"><div class="modal-title">Edit Person</div><button class="modal-close" type="button" id="personEditorX">×</button></div>
        <div class="modal-body modal-scroll">
          <div id="personEditorMessage" class="person-editor-message"></div>
          <div class="person-editor-grid">
            <div class="form-group"><label>First Name</label><input id="editPersonFirst" type="text"></div>
            <div class="form-group"><label>Last Name</label><input id="editPersonLast" type="text"></div>
            <div class="form-group"><label>Role</label><select id="editPersonRole"></select></div>
            <div class="form-group" id="editPersonClinicGroup"><label>Primary Clinic</label><select id="editPersonClinic"><option value="Turfland">Turfland</option><option value="Fountain Court">Fountain Court</option></select></div>
          </div>
          <div style="font-size:12px;color:#64748b;margin-top:4px">External Shift Workers do not have a primary clinic and do not appear on the regular schedule.</div>
        </div>
        <div class="modal-footer"><button class="modal-button cancel-button" type="button" id="personEditorCancel">Cancel</button><button class="modal-button save-button" type="button" id="personEditorSave">Save Changes</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const role = overlay.querySelector("#editPersonRole");
    ROLE_OPTIONS.forEach(([value,label]) => role.add(new Option(label,value)));
    overlay.querySelector("#personEditorX").onclick = closeEditor;
    overlay.querySelector("#personEditorCancel").onclick = closeEditor;
    overlay.querySelector("#personEditorSave").onclick = saveEditor;
    role.onchange = syncClinic;
  }

  function message(text, type="error") {
    const box = document.getElementById("personEditorMessage");
    box.className = `person-editor-message ${type}`;
    box.textContent = text;
  }

  function clearMessage() {
    const box = document.getElementById("personEditorMessage");
    box.className = "person-editor-message";
    box.textContent = "";
  }

  function syncClinic() {
    const role = document.getElementById("editPersonRole").value;
    const group = document.getElementById("editPersonClinicGroup");
    group.style.display = role === "external" ? "none" : "block";
  }

  function closeEditor() {
    document.getElementById("personEditorModal")?.classList.remove("show");
    editingProfile = null;
  }

  window.editPerson = function(profile) {
    ensureEditorModal();
    editingProfile = profile;
    clearMessage();
    document.getElementById("editPersonFirst").value = profile.first_name || "";
    document.getElementById("editPersonLast").value = profile.last_name || "";
    const role = document.getElementById("editPersonRole");
    role.value = profile.role || "employee";
    if (profile.id === currentUser?.id) role.disabled = true;
    else role.disabled = false;
    document.getElementById("editPersonClinic").value = profile.clinic_site === "Fountain Court" ? "Fountain Court" : "Turfland";
    syncClinic();
    document.getElementById("personEditorModal").classList.add("show");
  };

  async function saveEditor() {
    if (!editingProfile) return;
    clearMessage();
    const first = document.getElementById("editPersonFirst").value.trim();
    const last = document.getElementById("editPersonLast").value.trim();
    const roleEl = document.getElementById("editPersonRole");
    const role = editingProfile.id === currentUser?.id ? editingProfile.role : roleEl.value;
    const clinic = role === "external" ? null : document.getElementById("editPersonClinic").value;
    if (!first || !last) return message("First and last name are required.");
    const btn = document.getElementById("personEditorSave");
    btn.disabled = true; btn.textContent = "Saving...";
    try {
      const { data, error } = await supabaseClient.functions.invoke("manage-user", { body: {
        action:"update_profile", user_id:editingProfile.id, first_name:first, last_name:last, role, clinic_site:clinic
      }});
      if (error) throw new Error(error.message || "Unable to update person.");
      if (data?.error) throw new Error(data.error);
      const p = profiles.find(x => x.id === editingProfile.id);
      if (p) { p.first_name=first; p.last_name=last; p.role=role; p.clinic_site=clinic; }
      if (editingProfile.id === currentUser?.id && currentProfile) { currentProfile.first_name=first; currentProfile.last_name=last; currentProfile.role=role; currentProfile.clinic_site=clinic; }
      message("Changes saved.", "success");
      if (typeof loadWeek === "function") await loadWeek();
      if (typeof renderPeopleList === "function") renderPeopleList();
      setTimeout(closeEditor, 450);
    } catch (e) {
      console.error(e); message(e.message || "Unable to update person.");
    } finally { btn.disabled=false; btn.textContent="Save Changes"; }
  }

  function ensureSearch() {
    const list = document.getElementById("peopleList");
    if (!list || document.getElementById("peopleSearch")) return;
    const wrap = document.createElement("div");
    wrap.className = "people-search-wrap";
    wrap.innerHTML = `<input id="peopleSearch" type="search" placeholder="Search people by name, role, clinic, or status…" autocomplete="off"><button class="people-search-clear" type="button" aria-label="Clear search">×</button><div id="peopleSearchCount" class="people-search-count"></div>`;
    list.parentNode.insertBefore(wrap, list);
    wrap.querySelector("input").addEventListener("input", filterPeople);
    wrap.querySelector("button").onclick = () => { wrap.querySelector("input").value=""; filterPeople(); wrap.querySelector("input").focus(); };
  }

  function filterPeople() {
    const input = document.getElementById("peopleSearch");
    const cards = [...document.querySelectorAll("#peopleList .person-card")];
    if (!input) return;
    const q = input.value.trim().toLowerCase();
    let shown=0;
    cards.forEach(card => { const ok=!q || card.textContent.toLowerCase().includes(q); card.style.display=ok?"":"none"; if(ok) shown++; });
    const count=document.getElementById("peopleSearchCount");
    if(count) count.textContent = q ? `${shown} of ${cards.length} people shown` : `${cards.length} people`;
  }

  const originalRender = window.renderPeopleList;
  if (typeof originalRender === "function") {
    window.renderPeopleList = function(...args) {
      const r = originalRender.apply(this,args);
      ensureSearch();
      filterPeople();
      return r;
    };
  }

  /* Replace browser password prompt with a small in-app dialog too. */
  window.changePersonPassword = function(profile) {
    let modal = document.getElementById("personPasswordModal");
    if (!modal) {
      modal=document.createElement("div"); modal.id="personPasswordModal"; modal.className="modal-overlay";
      modal.innerHTML=`<div class="modal"><div class="modal-header"><div class="modal-title" id="personPasswordTitle">Change Password</div><button class="modal-close" type="button" id="personPasswordX">×</button></div><div class="modal-body"><div id="personPasswordMessage" class="person-editor-message"></div><div class="form-group"><label>New Temporary Password</label><input id="personPasswordInput" type="password" autocomplete="new-password"></div></div><div class="modal-footer"><button class="modal-button cancel-button" id="personPasswordCancel" type="button">Cancel</button><button class="modal-button save-button" id="personPasswordSave" type="button">Update Password</button></div></div>`;
      document.body.appendChild(modal);
      modal.querySelector("#personPasswordX").onclick=()=>modal.classList.remove("show");
      modal.querySelector("#personPasswordCancel").onclick=()=>modal.classList.remove("show");
    }
    modal.dataset.userId=profile.id;
    document.getElementById("personPasswordTitle").textContent=`Change Password — ${typeof getProfileName==="function"?getProfileName(profile):`${profile.first_name} ${profile.last_name}`}`;
    document.getElementById("personPasswordInput").value="";
    const msg=document.getElementById("personPasswordMessage"); msg.className="person-editor-message"; msg.textContent="";
    document.getElementById("personPasswordSave").onclick=async function(){
      const password=document.getElementById("personPasswordInput").value;
      if(password.length<8){msg.className="person-editor-message error";msg.textContent="Password must be at least 8 characters.";return;}
      this.disabled=true;this.textContent="Updating...";
      try{const {data,error}=await supabaseClient.functions.invoke("manage-user",{body:{action:"set_password",user_id:modal.dataset.userId,password}});if(error)throw new Error(error.message);if(data?.error)throw new Error(data.error);msg.className="person-editor-message success";msg.textContent="Password updated successfully.";setTimeout(()=>modal.classList.remove("show"),600);}catch(e){msg.className="person-editor-message error";msg.textContent=e.message||"Unable to update password.";}finally{this.disabled=false;this.textContent="Update Password";}
    };
    modal.classList.add("show"); setTimeout(()=>document.getElementById("personPasswordInput").focus(),0);
  };

  ensureStyles();
  ensureEditorModal();
  ensureSearch();
})();
