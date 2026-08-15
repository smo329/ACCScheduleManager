/* ACC Schedule Manager - unified in-app Notification Center */
(function () {
  "use strict";

  const VERSION = "2026.08.14.1";
  let systemNotifications = [];
  let pendingAccessRequests = [];
  let refreshTimer = null;

  console.info(`[ACC Schedule Manager] notification center loaded: ${VERSION}`);

  function role() {
    return (typeof currentProfile !== "undefined" && currentProfile)
      ? currentProfile.role
      : null;
  }

  function canUseCenter() {
    return role() === "admin" || role() === "manager";
  }

  function isAdmin() {
    return role() === "admin";
  }

  function esc(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function fmtDate(value) {
    if (!value) return "—";
    const [y,m,d] = String(value).slice(0,10).split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", {
      weekday:"short", month:"short", day:"numeric", year:"numeric"
    }).format(new Date(y,m-1,d));
  }

  function fmtDateTime(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-US", {
      month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit"
    }).format(new Date(value));
  }

  function fmtHour(value) {
    const h = Number(value);
    if (!Number.isFinite(h)) return "—";
    if (h === 12) return "12 PM";
    if (h === 0 || h === 24) return "12 AM";
    return h < 12 ? `${h} AM` : `${h - 12} PM`;
  }

  function ensureStyles() {
    if (document.getElementById("notificationCenterStyles")) return;
    const style = document.createElement("style");
    style.id = "notificationCenterStyles";
    style.textContent = `
      #accountRequestBell.notification-center-bell{
        position:relative!important;
        flex:0 0 40px!important;
        width:40px!important;
        min-width:40px!important;
        height:40px!important;
        min-height:40px!important;
        padding:0!important;
        border-radius:50%!important;
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        font-size:18px!important;
      }
      #notificationCenterBadge{
        position:absolute;right:-4px;top:-5px;min-width:18px;height:18px;padding:0 4px;
        border-radius:999px;background:#dc2626;color:#fff;font-size:10px;font-weight:800;
        display:none;align-items:center;justify-content:center;border:2px solid #fff;
      }
      .notification-center-section{margin-bottom:20px}
      .notification-center-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
      .notification-center-heading strong{color:#17365d;font-size:14px}
      .notification-card{border:1px solid #e2e8f0;border-radius:9px;padding:12px;margin-bottom:8px;background:#fff}
      .notification-card.unread{border-left:4px solid #2563eb;background:#f8fbff}
      .notification-card-title{font-weight:800;color:#17365d;margin-bottom:4px}
      .notification-card-body{font-size:12px;line-height:1.5;color:#475569}
      .notification-card-meta{font-size:10px;color:#94a3b8;margin-top:7px}
      .notification-card-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
      .notification-empty{padding:20px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:8px}
      .notification-center-count{font-size:11px;color:#64748b}
      @media(max-width:760px){
        #notificationCenterModal .modal{width:100%;height:100%;max-width:none;max-height:none;border-radius:0}
        .notification-card-actions{display:grid;grid-template-columns:1fr}
        .notification-card-actions .modal-button{width:100%}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureBell() {
    if (!canUseCenter()) {
      document.getElementById("accountRequestBell")?.remove();
      return null;
    }

    let bell = document.getElementById("accountRequestBell");
    if (!bell) {
      const accountButton = [...document.querySelectorAll(".topbar-user button")]
        .find(b => b.textContent.trim().toLowerCase() === "account");
      if (!accountButton) return null;

      bell = document.createElement("button");
      bell.id = "accountRequestBell";
      bell.className = "topbar-button";
      bell.type = "button";
      bell.innerHTML = `<span aria-hidden="true">🔔</span>`;
      accountButton.insertAdjacentElement("beforebegin", bell);
    }

    bell.classList.add("notification-center-bell");
    bell.title = "Notifications";
    bell.setAttribute("aria-label", "Notifications");
    bell.onclick = openNotificationCenter;

    let badge = bell.querySelector("#notificationCenterBadge");
    if (!badge) {
      bell.querySelector("#accountRequestBadge")?.remove();
      badge = document.createElement("span");
      badge.id = "notificationCenterBadge";
      bell.appendChild(badge);
    }
    return bell;
  }

  function ensureModal() {
    let modal = document.getElementById("notificationCenterModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "notificationCenterModal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal modal-wide" style="max-width:820px;">
        <div class="modal-header">
          <div class="modal-title">Notifications</div>
          <button class="modal-close" id="notificationCenterCloseX" type="button">×</button>
        </div>
        <div class="modal-body modal-scroll">
          <div id="notificationCenterContent"><div class="notification-empty">Loading notifications…</div></div>
        </div>
        <div class="modal-footer">
          <button class="modal-button cancel-button" id="notificationCenterClose" type="button">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => modal.style.display = "none";
    modal.querySelector("#notificationCenterCloseX").onclick = close;
    modal.querySelector("#notificationCenterClose").onclick = close;
    return modal;
  }

  async function loadSystemNotifications() {
    if (!canUseCenter() || typeof currentUser === "undefined" || !currentUser) {
      systemNotifications = [];
      return;
    }

    const { data, error } = await supabaseClient
      .from("notification_log")
      .select("id,period_id,event_type,channel,status,created_at,metadata,read_at")
      .eq("user_id", currentUser.id)
      .eq("channel", "in_app")
      .in("event_type", ["quarter_completed", "open_shift_claimed"])
      .order("created_at", { ascending:false })
      .limit(100);

    if (error) {
      console.warn("Unable to load in-app notifications:", error);
      systemNotifications = [];
      return;
    }
    systemNotifications = data || [];
  }

  async function loadAccessRequests() {
    if (!isAdmin()) {
      pendingAccessRequests = [];
      return;
    }
    const { data, error } = await supabaseClient
      .from("account_access_requests")
      .select("id,first_name,last_name,email,status,requested_at")
      .eq("status", "pending")
      .order("requested_at", { ascending:true });

    if (error) {
      console.warn("Unable to load pending access requests:", error);
      pendingAccessRequests = [];
      return;
    }
    pendingAccessRequests = data || [];
  }

  function updateBadge() {
    const bell = ensureBell();
    if (!bell) return;
    const unreadSystem = systemNotifications.filter(n => !n.read_at).length;
    const count = unreadSystem + (isAdmin() ? pendingAccessRequests.length : 0);
    const badge = bell.querySelector("#notificationCenterBadge");
    if (!badge) return;
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.style.display = count > 0 ? "inline-flex" : "none";
  }

  function renderSystemNotification(n) {
    const meta = n.metadata || {};
    const unread = !n.read_at;
    let title = "Notification";
    let body = "";

    if (n.event_type === "quarter_completed") {
      title = "Quarter schedule completed";
      body = `<strong>${esc(meta.employee_name || "Employee")}</strong> has submitted all weeks for <strong>${esc(meta.quarter_name || "the quarter")}</strong>.`;
    } else if (n.event_type === "open_shift_claimed") {
      title = "Open shift signup";
      body = `<strong>${esc(meta.worker_name || "Worker")}</strong> signed up for <strong>${esc(fmtHour(meta.start_hour))}–${esc(fmtHour(meta.end_hour))}</strong> on <strong>${esc(fmtDate(meta.shift_date))}</strong> at <strong>${esc(meta.clinic_site || "clinic")}</strong>.`;
    }

    return `<div class="notification-card ${unread ? "unread" : ""}" data-notification-id="${esc(n.id)}">
      <div class="notification-card-title">${esc(title)}</div>
      <div class="notification-card-body">${body}</div>
      <div class="notification-card-meta">${esc(fmtDateTime(n.created_at))}</div>
      ${unread ? `<div class="notification-card-actions"><button class="modal-button cancel-button mark-notification-read" type="button">Mark Read</button></div>` : ""}
    </div>`;
  }

  function renderAccessRequest(request) {
    return `<div class="notification-card" data-request-id="${esc(request.id)}">
      <div class="notification-card-title">New user access request</div>
      <div class="notification-card-body"><strong>${esc(request.first_name)} ${esc(request.last_name)}</strong><br>${esc(request.email)}</div>
      <div class="notification-card-meta">Requested ${esc(fmtDateTime(request.requested_at))}</div>
      <div class="notification-card-actions">
        <button class="modal-button save-button review-access-request" type="button">Review / Add Person</button>
        <button class="modal-button deactivate-button dismiss-access-request" type="button">Dismiss</button>
      </div>
    </div>`;
  }

  function renderCenter() {
    const content = document.getElementById("notificationCenterContent");
    if (!content) return;

    const unread = systemNotifications.filter(n => !n.read_at).length;
    let html = `
      <div class="notification-center-section">
        <div class="notification-center-heading">
          <div><strong>Schedule Notifications</strong><div class="notification-center-count">${unread} unread · ${systemNotifications.length} recent</div></div>
          ${unread ? `<button id="markAllScheduleNotificationsRead" class="modal-button cancel-button" type="button">Mark All Read</button>` : ""}
        </div>
        ${systemNotifications.length ? systemNotifications.map(renderSystemNotification).join("") : `<div class="notification-empty">No schedule notifications yet.</div>`}
      </div>`;

    if (isAdmin()) {
      html += `
        <div class="notification-center-section">
          <div class="notification-center-heading"><div><strong>Account Access Requests</strong><div class="notification-center-count">${pendingAccessRequests.length} pending</div></div></div>
          ${pendingAccessRequests.length ? pendingAccessRequests.map(renderAccessRequest).join("") : `<div class="notification-empty">No pending account access requests.</div>`}
        </div>`;
    }

    content.innerHTML = html;

    content.querySelectorAll(".mark-notification-read").forEach(button => {
      button.onclick = async () => {
        const id = button.closest("[data-notification-id]")?.dataset.notificationId;
        if (id) await markRead([id]);
      };
    });

    const markAll = content.querySelector("#markAllScheduleNotificationsRead");
    if (markAll) {
      markAll.onclick = async () => {
        const ids = systemNotifications.filter(n => !n.read_at).map(n => n.id);
        if (ids.length) await markRead(ids);
      };
    }

    content.querySelectorAll(".review-access-request").forEach(button => {
      button.onclick = () => {
        const id = button.closest("[data-request-id]")?.dataset.requestId;
        const request = pendingAccessRequests.find(r => r.id === id);
        if (request) reviewRequest(request);
      };
    });

    content.querySelectorAll(".dismiss-access-request").forEach(button => {
      button.onclick = async () => {
        const id = button.closest("[data-request-id]")?.dataset.requestId;
        const request = pendingAccessRequests.find(r => r.id === id);
        if (request) await dismissRequest(request);
      };
    });
  }

  async function markRead(ids) {
    if (!ids.length) return;
    const now = new Date().toISOString();
    const { error } = await supabaseClient
      .from("notification_log")
      .update({ read_at:now, status:"read" })
      .eq("user_id", currentUser.id)
      .in("id", ids);
    if (error) {
      console.warn("Unable to mark notifications read:", error);
      return;
    }
    systemNotifications.forEach(n => { if (ids.includes(n.id)) { n.read_at = now; n.status = "read"; } });
    updateBadge();
    renderCenter();
  }

  function reviewRequest(request) {
    document.getElementById("notificationCenterModal").style.display = "none";
    if (typeof window.openPeopleManagement === "function") window.openPeopleManagement();
    else if (typeof openAdmin === "function") openAdmin();
    if (typeof openAddEmployeeSection === "function") openAddEmployeeSection();

    setTimeout(() => {
      const first = document.getElementById("newFirstName");
      const last = document.getElementById("newLastName");
      const email = document.getElementById("newEmail");
      const roleSelect = document.getElementById("newRole");
      if (first) first.value = request.first_name;
      if (last) last.value = request.last_name;
      if (email) email.value = request.email;
      if (roleSelect) roleSelect.value = "employee";
    }, 0);
  }

  async function dismissRequest(request) {
    const ok = window.confirm(`Dismiss the access request from ${request.first_name} ${request.last_name}?`);
    if (!ok) return;
    const { error } = await supabaseClient
      .from("account_access_requests")
      .update({ status:"dismissed", reviewed_at:new Date().toISOString(), reviewed_by:currentUser.id })
      .eq("id", request.id);
    if (error) {
      console.warn("Unable to dismiss access request:", error);
      return;
    }
    await refresh(false);
    renderCenter();
  }

  async function refresh(renderIfOpen = true) {
    if (!canUseCenter()) {
      ensureBell();
      return;
    }
    await Promise.all([loadSystemNotifications(), loadAccessRequests()]);
    updateBadge();
    if (renderIfOpen && document.getElementById("notificationCenterModal")?.style.display === "flex") {
      renderCenter();
    }
  }

  async function openNotificationCenter() {
    const modal = ensureModal();
    modal.style.display = "flex";
    modal.querySelector("#notificationCenterContent").innerHTML = `<div class="notification-empty">Loading notifications…</div>`;
    await refresh(false);
    renderCenter();
  }

  function scheduleRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => refresh(false).catch(console.warn), 60000);
  }

  ensureStyles();
  ensureModal();
  setTimeout(() => refresh(false).catch(console.warn), 0);
  setTimeout(() => refresh(false).catch(console.warn), 500);
  scheduleRefresh();

  if (typeof updateUserHeader === "function") {
    const originalUpdateUserHeader = updateUserHeader;
    updateUserHeader = function (...args) {
      const result = originalUpdateUserHeader.apply(this, args);
      setTimeout(() => refresh(false).catch(console.warn), 0);
      return result;
    };
  }

  window.openNotificationCenter = openNotificationCenter;
  window.refreshNotificationCenter = () => refresh(false);
})();
