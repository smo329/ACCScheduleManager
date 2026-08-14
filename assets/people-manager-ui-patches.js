/* ACC Schedule Manager - Manage People search + in-page editor */
(function () {
  "use strict";

  const VERSION = "2026.08.14.1";
  let editingProfileId = null;
  let searchQuery = "";

  console.info(`[ACC Schedule Manager] people manager UI patch loaded: ${VERSION}`);

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function roleLabel(role) {
    if (role === "admin") return "Administrator";
    if (role === "manager") return "Clinic Manager";
    if (role === "external") return "External Shift Worker";
    return "Employee";
  }

  function ensureStyles() {
    if (document.getElementById("peopleManagerUiStyles")) return;
    const style = document.createElement("style");
    style.id = "peopleManagerUiStyles";
    style.textContent = `
      .people-search-wrap{
        margin:16px 0 12px;
        padding:12px;
        border:1px solid #e2e8f0;
        background:#f8fafc;
        border-radius:9px;
      }
      .people-search-wrap label{
        display:block;
        font-size:12px;
        font-weight:700;
        color:#475569;
        margin-bottom:6px;
      }
      .people-search-wrap input{
        width:100%;
        min-height:42px;
        border:1px solid #cbd5e1;
        border-radius:7px;
        padding:9px 11px;
        font-size:15px;
        background:white;
      }
      .people-search-summary{
        margin-top:6px;
        color:#64748b;
        font-size:11px;
      }
      .person-card.people-search-hidden{display:none !important;}
      #editPersonModal .edit-person-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:12px;
      }
      #editPersonModal .edit-person-note{
        margin-top:7px;
        color:#64748b;
        font-size:11px;
        line-height:1.4;
      }
      #editPersonError{
        display:none;
        margin-bottom:12px;
        padding:10px;
        border-radius:7px;
        background:#fee2e2;
        color:#991b1b;
      }
      #editPersonSuccess{
        display:none;
        margin-bottom:12px;
        padding:10px;
        border-radius:7px;
        background:#dcfce7;
        color:#166534;
      }
      @media(max-width:760px){
        #editPersonModal .edit-person-grid{grid-template-columns:1fr;gap:0;}
        .people-search-wrap{margin-top:12px;}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureEditModal() {
    let modal = document.getElementById("editPersonModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "editPersonModal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Edit Person</div>
          <button class="modal-close" id="editPersonCloseX" type="button">×</button>
        </div>
        <div class="modal-body">
          <div id="editPersonError"></div>
          <div id="editPersonSuccess"></div>
          <div class="edit-person-grid">
            <div class="form-group">
              <label for="editPersonFirstName">First Name</label>
              <input id="editPersonFirstName" type="text">
            </div>
            <div class="form-group">
              <label for="editPersonLastName">Last Name</label>
              <input id="editPersonLastName" type="text">
            </div>
            <div class="form-group">
              <label for="editPersonRole">Role</label>
              <select id="editPersonRole">
                <option value="employee">Employee</option>
                <option value="manager">Clinic Manager</option>
                <option value="external">External Shift Worker</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <div class="form-group">
              <label for="editPersonClinic">Primary Clinic</label>
              <select id="editPersonClinic">
                <option value="Turfland">Turfland</option>
                <option value="Fountain Court">Fountain Court</option>
                <option value="">Not applicable</option>
              </select>
              <div id="editPersonClinicNote" class="edit-person-note"></div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="editPersonCancel" class="modal-button cancel-button" type="button">Cancel</button>
          <button id="editPersonSave" class="modal-button save-button" type="button">Save Changes</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    modal.querySelector("#editPersonCloseX").onclick = closeEditModal;
    modal.querySelector("#editPersonCancel").onclick = closeEditModal;
    modal.querySelector("#editPersonSave").onclick = saveEditPerson;
    modal.querySelector("#editPersonRole").addEventListener("change", syncClinicForRole);
    return modal;
  }

  function setEditMessage(type, text) {
    const error = document.getElementById("editPersonError");
    const success = document.getElementById("editPersonSuccess");
    if (!error || !success) return;
    error.style.display = "none";
    success.style.display = "none";
    if (!text) return;
    const target = type === "error" ? error : success;
    target.textContent = text;
    target.style.display = "block";
  }

  function syncClinicForRole() {
    const role = document.getElementById("editPersonRole")?.value;
    const clinic = document.getElementById("editPersonClinic");
    const note = document.getElementById("editPersonClinicNote");
    if (!clinic) return;

    const external = role === "external";
    clinic.disabled = external;
    if (external) clinic.value = "";
    else if (!clinic.value) clinic.value = "Turfland";

    if (note) {
      note.textContent = external
        ? "External Shift Workers do not appear on the regular department schedule, so no primary clinic is assigned."
        : "Primary clinic controls where department employees normally appear on the schedule.";
    }
  }

  function closeEditModal() {
    document.getElementById("editPersonModal")?.classList.remove("show");
    editingProfileId = null;
  }

  function openEditor(profile) {
    if (!profile) return;
    ensureStyles();
    const modal = ensureEditModal();
    editingProfileId = profile.id;
    setEditMessage("", "");

    document.getElementById("editPersonFirstName").value = profile.first_name || "";
    document.getElementById("editPersonLastName").value = profile.last_name || "";
    document.getElementById("editPersonRole").value = profile.role || "employee";
    document.getElementById("editPersonClinic").value = profile.clinic_site || "";

    const roleSelect = document.getElementById("editPersonRole");
    const isOwnAccount = typeof currentUser !== "undefined" && currentUser && profile.id === currentUser.id;
    roleSelect.disabled = isOwnAccount;
    roleSelect.title = isOwnAccount ? "You cannot change your own administrator role here." : "";

    syncClinicForRole();
    modal.classList.add("show");
  }

  async function saveEditPerson() {
    const profile = (typeof profiles !== "undefined" ? profiles : []).find(p => p.id === editingProfileId);
    if (!profile) return setEditMessage("error", "This person could not be found. Refresh Manage People and try again.");

    const firstName = document.getElementById("editPersonFirstName").value.trim();
    const lastName = document.getElementById("editPersonLastName").value.trim();
    const role = document.getElementById("editPersonRole").value;
    const clinicSite = role === "external" ? null : document.getElementById("editPersonClinic").value;
    const saveButton = document.getElementById("editPersonSave");

    if (!firstName || !lastName) return setEditMessage("error", "First name and last name are required.");
    if (!["employee", "manager", "external", "admin"].includes(role)) return setEditMessage("error", "Select a valid role.");
    if (role !== "external" && !["Turfland", "Fountain Court"].includes(clinicSite)) {
      return setEditMessage("error", "Select Turfland or Fountain Court as the primary clinic.");
    }

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    setEditMessage("", "");

    try {
      if (typeof invokeManageUser !== "function") throw new Error("The person-management service is not available.");
      const success = await invokeManageUser({
        action: "update_profile",
        user_id: profile.id,
        first_name: firstName,
        last_name: lastName,
        role,
        clinic_site: clinicSite
      });
      if (!success) throw new Error("The update was not completed.");

      profile.first_name = firstName;
      profile.last_name = lastName;
      profile.role = role;
      profile.clinic_site = clinicSite;

      if (typeof loadWeek === "function") await loadWeek();
      if (typeof renderPeopleList === "function") renderPeopleList();
      setEditMessage("success", `${firstName} ${lastName} was updated.`);
      setTimeout(closeEditModal, 500);
    } catch (error) {
      console.error(error);
      setEditMessage("error", error.message || "Unable to update this person.");
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save Changes";
    }
  }

  function ensureSearchBar() {
    const peopleList = document.getElementById("peopleList");
    if (!peopleList) return;
    let wrap = document.getElementById("peopleSearchWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "peopleSearchWrap";
      wrap.className = "people-search-wrap";
      wrap.innerHTML = `
        <label for="peopleSearchInput">Find a person</label>
        <input id="peopleSearchInput" type="search" placeholder="Search by name, role, clinic, or status..." autocomplete="off">
        <div id="peopleSearchSummary" class="people-search-summary"></div>`;
      peopleList.insertAdjacentElement("beforebegin", wrap);
      wrap.querySelector("#peopleSearchInput").addEventListener("input", event => {
        searchQuery = event.target.value || "";
        applySearch();
      });
    }
    const input = document.getElementById("peopleSearchInput");
    if (input && input.value !== searchQuery) input.value = searchQuery;
  }

  function wireCards() {
    const cards = [...document.querySelectorAll("#peopleList .person-card")];
    const list = typeof profiles !== "undefined" ? profiles : [];

    cards.forEach((card, index) => {
      const profile = list[index];
      if (!profile) return;
      card.dataset.personId = profile.id;
      card.dataset.personSearch = [
        profile.first_name,
        profile.last_name,
        roleLabel(profile.role),
        profile.role,
        profile.clinic_site || "no clinic",
        profile.active ? "active" : "inactive"
      ].filter(Boolean).join(" ").toLowerCase();

      const editButton = [...card.querySelectorAll("button")].find(b => b.textContent.trim() === "Edit");
      if (editButton) {
        editButton.onclick = function (event) {
          event.preventDefault();
          openEditor(profile);
        };
      }
    });
  }

  function applySearch() {
    const query = searchQuery.trim().toLowerCase();
    const cards = [...document.querySelectorAll("#peopleList .person-card")];
    let visible = 0;

    cards.forEach(card => {
      const matches = !query || String(card.dataset.personSearch || card.textContent).toLowerCase().includes(query);
      card.classList.toggle("people-search-hidden", !matches);
      if (matches) visible++;
    });

    const summary = document.getElementById("peopleSearchSummary");
    if (summary) {
      summary.textContent = query
        ? `${visible} of ${cards.length} people shown`
        : `${cards.length} people`;
    }
  }

  function enhancePeopleList() {
    ensureStyles();
    ensureEditModal();
    ensureSearchBar();
    wireCards();
    applySearch();
  }

  const originalRenderPeopleList = typeof renderPeopleList === "function" ? renderPeopleList : null;
  if (originalRenderPeopleList) {
    window.renderPeopleList = function () {
      const result = originalRenderPeopleList.apply(this, arguments);
      enhancePeopleList();
      return result;
    };
  }

  const originalOpenAdmin = typeof openAdmin === "function" ? openAdmin : null;
  if (originalOpenAdmin) {
    window.openAdmin = function () {
      const result = originalOpenAdmin.apply(this, arguments);
      enhancePeopleList();
      return result;
    };
  }

  ensureStyles();
  setTimeout(enhancePeopleList, 0);
})();