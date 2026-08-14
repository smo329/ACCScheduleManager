/*
 * ACC Schedule Manager - Account access request UI + admin bell
 */
(function () {
  "use strict";

  const VERSION = "2026.08.14.1";
  let pendingRequests = [];

  console.info(`[ACC Schedule Manager] account request patch loaded: ${VERSION}`);

  function isAdmin() {
    return Boolean(currentProfile && currentProfile.role === "admin");
  }

  function ensureRequestAccessButton() {
    const loginButton = document.getElementById("loginButton");
    if (!loginButton) return;

    if (document.getElementById("requestAccessButton")) return;

    const button = document.createElement("button");
    button.id = "requestAccessButton";
    button.type = "button";
    button.textContent = "New user? Request access";
    button.style.cssText = `
      width:100%;
      margin-top:10px;
      padding:10px 12px;
      border:1px solid #cbd5e1;
      border-radius:6px;
      background:white;
      color:#17365d;
      font-weight:700;
      cursor:pointer;
    `;
    button.onclick = openRequestAccessModal;

    loginButton.insertAdjacentElement("afterend", button);
  }

  function ensureRequestAccessModal() {
    let overlay = document.getElementById("requestAccessModal");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "requestAccessModal";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Request Account Access</div>
          <button class="modal-close" type="button" id="requestAccessClose">×</button>
        </div>

        <div class="modal-body">
          <div id="requestAccessMessage" class="account-message"></div>
          <div id="requestAccessError" class="login-error"></div>

          <p style="margin-top:0;color:#64748b;font-size:13px;">
            Submit your name and email. This does not create an account automatically.
            An administrator will review your request.
          </p>

          <div class="form-group">
            <label for="requestFirstName">First Name</label>
            <input id="requestFirstName" type="text">
          </div>

          <div class="form-group">
            <label for="requestLastName">Last Name</label>
            <input id="requestLastName" type="text">
          </div>

          <div class="form-group">
            <label for="requestEmail">Email</label>
            <input id="requestEmail" type="email">
          </div>
        </div>

        <div class="modal-footer">
          <button class="modal-button cancel-button" type="button" id="requestAccessCancel">
            Cancel
          </button>
          <button class="modal-button save-button" type="button" id="requestAccessSubmit">
            Submit Request
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector("#requestAccessClose").onclick = closeRequestAccessModal;
    overlay.querySelector("#requestAccessCancel").onclick = closeRequestAccessModal;
    overlay.querySelector("#requestAccessSubmit").onclick = submitAccessRequest;

    return overlay;
  }

  function openRequestAccessModal() {
    const modal = ensureRequestAccessModal();
    modal.style.display = "flex";

    const email = document.getElementById("email")?.value?.trim() || "";
    const requestEmail = modal.querySelector("#requestEmail");

    if (email && !requestEmail.value) {
      requestEmail.value = email;
    }

    modal.querySelector("#requestAccessMessage").style.display = "none";
    modal.querySelector("#requestAccessError").style.display = "none";
  }

  function closeRequestAccessModal() {
    const modal = document.getElementById("requestAccessModal");
    if (modal) modal.style.display = "none";
  }

  async function submitAccessRequest() {
    const firstName = document.getElementById("requestFirstName").value.trim();
    const lastName = document.getElementById("requestLastName").value.trim();
    const email = document.getElementById("requestEmail").value.trim();
    const errorBox = document.getElementById("requestAccessError");
    const messageBox = document.getElementById("requestAccessMessage");
    const button = document.getElementById("requestAccessSubmit");

    errorBox.style.display = "none";
    messageBox.style.display = "none";

    if (!firstName || !lastName || !email) {
      errorBox.textContent = "Please enter your first name, last name, and email.";
      errorBox.style.display = "block";
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorBox.textContent = "Please enter a valid email address.";
      errorBox.style.display = "block";
      return;
    }

    button.disabled = true;
    button.textContent = "Submitting...";

    try {
      const { data, error } = await supabaseClient.functions.invoke(
        "request-account-access",
        {
          body: {
            first_name: firstName,
            last_name: lastName,
            email
          }
        }
      );

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Unable to submit request.");
      }

      messageBox.textContent = data?.already_pending
        ? "A request for this email is already pending review."
        : "Your request was submitted. An administrator will review it.";

      messageBox.style.display = "block";

      if (!data?.already_pending) {
        document.getElementById("requestFirstName").value = "";
        document.getElementById("requestLastName").value = "";
      }

    } catch (error) {
      console.error(error);
      errorBox.textContent =
        "Unable to submit access request: " +
        (error.message || "Unknown error");
      errorBox.style.display = "block";
    } finally {
      button.disabled = false;
      button.textContent = "Submit Request";
    }
  }

  function ensureAdminBell() {
    if (!isAdmin()) {
      document.getElementById("accountRequestBell")?.remove();
      return null;
    }

    let bell = document.getElementById("accountRequestBell");
    if (bell) return bell;

    const accountButton = [...document.querySelectorAll(".topbar-button")]
      .find(button => button.textContent.trim() === "Account");

    if (!accountButton) return null;

    bell = document.createElement("button");
    bell.id = "accountRequestBell";
    bell.className = "topbar-button account-request-bell";
    bell.type = "button";
    bell.title = "Pending account access requests";
    bell.innerHTML = `
      <span aria-hidden="true">🔔</span>
      <span id="accountRequestBadge" class="account-request-badge" style="display:none;">0</span>
    `;
    bell.onclick = openAccountRequestInbox;

    accountButton.insertAdjacentElement("beforebegin", bell);
    return bell;
  }

  async function loadPendingRequests() {
    if (!isAdmin()) return [];

    const { data, error } = await supabaseClient
      .from("account_access_requests")
      .select("id,first_name,last_name,email,status,requested_at")
      .eq("status", "pending")
      .order("requested_at", { ascending: true });

    if (error) {
      console.warn("Unable to load account access requests:", error);
      return [];
    }

    pendingRequests = data || [];
    updateBellBadge();
    return pendingRequests;
  }

  function updateBellBadge() {
    const bell = ensureAdminBell();
    if (!bell) return;

    const badge = bell.querySelector("#accountRequestBadge");
    const count = pendingRequests.length;

    badge.textContent = String(count);
    badge.style.display = count > 0 ? "inline-flex" : "none";
    bell.classList.toggle("has-pending", count > 0);
  }

  function ensureRequestInboxModal() {
    let overlay = document.getElementById("accountRequestInboxModal");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "accountRequestInboxModal";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal modal-wide" style="max-width:780px;">
        <div class="modal-header">
          <div class="modal-title">Account Access Requests</div>
          <button class="modal-close" type="button" id="accountRequestInboxClose">×</button>
        </div>

        <div class="modal-body modal-scroll">
          <div id="accountRequestInboxContent"></div>
        </div>

        <div class="modal-footer">
          <button class="modal-button cancel-button" type="button" id="accountRequestInboxCloseBottom">
            Close
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.style.display = "none";
    overlay.querySelector("#accountRequestInboxClose").onclick = close;
    overlay.querySelector("#accountRequestInboxCloseBottom").onclick = close;

    return overlay;
  }

  async function openAccountRequestInbox() {
    const modal = ensureRequestInboxModal();
    modal.style.display = "flex";

    const content = modal.querySelector("#accountRequestInboxContent");
    content.innerHTML = `<div style="color:#64748b;">Loading requests...</div>`;

    await loadPendingRequests();
    renderRequestInbox();
  }

  function renderRequestInbox() {
    const content = document.getElementById("accountRequestInboxContent");
    if (!content) return;

    if (!pendingRequests.length) {
      content.innerHTML = `
        <div style="padding:28px;text-align:center;color:#64748b;">
          No pending account access requests.
        </div>
      `;
      return;
    }

    content.innerHTML = "";

    pendingRequests.forEach(request => {
      const card = document.createElement("div");
      card.className = "account-request-card";

      const requested = new Date(request.requested_at).toLocaleString();

      card.innerHTML = `
        <div class="account-request-main">
          <strong>${escapeHtml(request.first_name)} ${escapeHtml(request.last_name)}</strong>
          <div>${escapeHtml(request.email)}</div>
          <small>Requested ${escapeHtml(requested)}</small>
        </div>

        <div class="account-request-actions">
          <button class="modal-button save-button request-review-button" type="button">
            Review / Add Person
          </button>
          <button class="modal-button deactivate-button request-dismiss-button" type="button">
            Dismiss
          </button>
        </div>
      `;

      card.querySelector(".request-review-button").onclick =
        () => reviewAccessRequest(request);

      card.querySelector(".request-dismiss-button").onclick =
        () => dismissAccessRequest(request);

      content.appendChild(card);
    });
  }

  async function reviewAccessRequest(request) {
    const { error } = await supabaseClient
      .from("account_access_requests")
      .update({
        status: "reviewed",
        reviewed_at: new Date().toISOString(),
        reviewed_by: currentUser.id
      })
      .eq("id", request.id);

    if (error) {
      alert("Unable to mark request as reviewed: " + error.message);
      return;
    }

    pendingRequests = pendingRequests.filter(item => item.id !== request.id);
    updateBellBadge();

    const inbox = document.getElementById("accountRequestInboxModal");
    if (inbox) inbox.style.display = "none";

    if (typeof window.openPeopleManagement === "function") {
      window.openPeopleManagement();
    } else {
      openAdmin();
    }

    if (typeof openAddEmployeeSection === "function") {
      openAddEmployeeSection();
    }

    setTimeout(() => {
      const first = document.getElementById("newFirstName");
      const last = document.getElementById("newLastName");
      const email = document.getElementById("newEmail");
      const role = document.getElementById("newRole");

      if (first) first.value = request.first_name;
      if (last) last.value = request.last_name;
      if (email) email.value = request.email;
      if (role) role.value = "employee";

      const start = document.getElementById("newEmploymentStartDate");
      if (start && !start.value) {
        start.value = new Date().toISOString().slice(0, 10);
      }
    }, 0);
  }

  async function dismissAccessRequest(request) {
    if (!confirm(`Dismiss the access request from ${request.first_name} ${request.last_name}?`)) {
      return;
    }

    const { error } = await supabaseClient
      .from("account_access_requests")
      .update({
        status: "dismissed",
        reviewed_at: new Date().toISOString(),
        reviewed_by: currentUser.id
      })
      .eq("id", request.id);

    if (error) {
      alert("Unable to dismiss request: " + error.message);
      return;
    }

    await loadPendingRequests();
    renderRequestInbox();
  }

  if (typeof updateUserHeader === "function") {
    const originalUpdateUserHeader = updateUserHeader;

    updateUserHeader = function (...args) {
      const result = originalUpdateUserHeader.apply(this, args);

      if (isAdmin()) {
        ensureAdminBell();
        loadPendingRequests().catch(error =>
          console.warn("Account request refresh failed:", error)
        );
      }

      return result;
    };
  }

  setInterval(() => {
    if (isAdmin() && document.getElementById("app")?.style.display !== "none") {
      loadPendingRequests().catch(() => {});
    }
  }, 60000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && isAdmin()) {
      loadPendingRequests().catch(() => {});
    }
  });

  const style = document.createElement("style");
  style.textContent = `
    .account-request-bell {
      position:relative;
      min-width:42px;
      padding-left:10px;
      padding-right:10px;
    }

    .account-request-bell.has-pending {
      box-shadow:0 0 0 2px rgba(255,255,255,.22);
    }

    .account-request-badge {
      position:absolute;
      top:-5px;
      right:-5px;
      min-width:18px;
      height:18px;
      padding:0 5px;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      background:#dc2626;
      color:white;
      font-size:10px;
      font-weight:800;
      border:2px solid #17365d;
    }

    .account-request-card {
      display:flex;
      justify-content:space-between;
      gap:16px;
      align-items:center;
      padding:14px;
      margin-bottom:10px;
      border:1px solid #e2e8f0;
      border-radius:8px;
      background:#fff;
    }

    .account-request-main { min-width:0; }
    .account-request-main strong { display:block;color:#1e293b;margin-bottom:3px; }
    .account-request-main div { color:#475569;word-break:break-word; }
    .account-request-main small { display:block;color:#94a3b8;margin-top:5px; }
    .account-request-actions { display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end; }

    .acc-dark .account-request-card { background:#0f172a;border-color:#334155; }
    .acc-dark .account-request-main strong { color:#f8fafc; }
    .acc-dark .account-request-main div { color:#cbd5e1; }

    @media(max-width:650px) {
      .account-request-card { align-items:stretch;flex-direction:column; }
      .account-request-actions { justify-content:flex-start; }
    }
  `;
  document.head.appendChild(style);

  ensureRequestAccessButton();
})();
