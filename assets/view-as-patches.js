/*
 * ACC Schedule Manager - Read-only "view as" for admins
 *
 * An admin clicks the Access card, picks a person (or a generic role),
 * and the app shows that person's dashboard, sidebar and schedule grid
 * without logging out of the admin account or into theirs.
 *
 * This is display-only, not impersonation:
 * - The signed-in account (currentUser) is never changed, so any save
 *   that did run would still be recorded as the admin, not the viewed
 *   person. In practice no save can run: swapping currentProfile to a
 *   non-admin makes canEditProfile() return false for every row (the
 *   signed-in admin id never matches a viewed profile id), so every
 *   schedule cell renders locked, with no editable hours box, + Leave
 *   or + Admin button, and no Shift Capacity row.
 * - Account-tied panels (My Schedule, Account Settings, Notifications)
 *   are blocked in view mode, because they are built from the signed-in
 *   account and would otherwise show the admin's data as if it were
 *   the viewed person's. Additional Shifts can be viewed read-only;
 *   its signup / remove / publish buttons are blocked by a capture
 *   click guard below, as is week submission.
 * - View mode lives only in memory: reloading the page, or clicking
 *   "Return to normal view", restores the admin profile exactly.
 */
(function () {
    "use strict";

    let originalProfile = null;

    window.viewAsActive = false;
    window.viewAsProfile = null;

    function esc(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function displayName(profile) {
        if (!profile) return "Unknown";
        try {
            if (typeof getProfileName === "function") {
                const name = getProfileName(profile);
                if (name) return name;
            }
        } catch (_) {}
        return `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Unknown";
    }

    function roleLabel(role) {
        if (role === "admin") return "Administrator";
        if (role === "manager") return "Manager";
        if (role === "external") return "External worker";
        return "Employee";
    }

    function ensureStyles() {
        if (document.getElementById("viewAsStyles")) return;
        const style = document.createElement("style");
        style.id = "viewAsStyles";
        style.textContent = `
            #viewAsModal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.55);z-index:4000}
            #viewAsModal.show{display:flex}
            .view-as-card{width:min(520px,100%);max-height:85vh;overflow:auto;background:#fff;border-radius:10px;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.2)}
            .view-as-card h3{margin:0 0 6px;color:#17365d}
            .view-as-card p{margin:0 0 14px;color:#475569}
            .view-as-section{font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin:16px 0 8px}
            .view-as-person{display:block;width:100%;text-align:left;margin-bottom:6px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer}
            .view-as-person:hover{background:#f8fafc}
            .view-as-person strong{display:block;color:#17365d}
            .view-as-person span{color:#64748b;font-size:12px}
            .view-as-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
            .view-as-notice{padding:10px 12px;border-radius:8px;background:#fffbeb;border:1px solid #f59e0b;color:#92400e;font-size:13px;line-height:1.5}
        `;
        document.head.appendChild(style);
    }

    function ensureModal() {
        ensureStyles();
        let overlay = document.getElementById("viewAsModal");
        if (overlay) return overlay;
        overlay = document.createElement("div");
        overlay.id = "viewAsModal";
        overlay.innerHTML = `
            <div class="view-as-card">
                <h3 id="viewAsTitle">View as…</h3>
                <div id="viewAsBody"></div>
                <div class="view-as-actions">
                    <button id="viewAsClose" class="modal-button cancel-button" type="button">Close</button>
                    <button id="viewAsReturn" class="modal-button save-button" type="button" style="display:none">Return to normal view</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector("#viewAsClose").onclick = () => overlay.classList.remove("show");
        overlay.querySelector("#viewAsReturn").onclick = () => {
            overlay.classList.remove("show");
            exitViewAs();
        };
        return overlay;
    }

    function showBlockedMessage() {
        const overlay = ensureModal();
        overlay.querySelector("#viewAsTitle").textContent = "Read-only view";
        overlay.querySelector("#viewAsBody").innerHTML = `
            <div class="view-as-notice">
                You are viewing as <strong>${esc(displayName(window.viewAsProfile))}</strong> in read-only mode.
                This panel is tied to the signed-in account, so it is not available while viewing as someone else.
                Use the schedule grid to see their week, or return to normal view to use your own account panels.
            </div>`;
        overlay.querySelector("#viewAsReturn").style.display = "";
        overlay.classList.add("show");
    }

    function wrapAccountPanels() {
        ["openMySchedule", "openAccountManager", "openNotificationCenter"].forEach(name => {
            const original = window[name];
            if (typeof original !== "function" || original._viewAsWrapped) return;
            const wrapped = function (...args) {
                if (window.viewAsActive) {
                    showBlockedMessage();
                    return;
                }
                return original.apply(this, args);
            };
            wrapped._viewAsWrapped = true;
            window[name] = wrapped;
        });
    }

    // Capture-phase guard: in view mode, no claim, publish, remove,
    // submit-quarter or topbar My Schedule click can reach its handler.
    document.addEventListener("click", event => {
        if (!window.viewAsActive) return;
        const target = event.target;
        if (!target || typeof target.closest !== "function") return;
        if (target.closest(".claim-open-shift, .cancel-open-claim, .toggle-open-shift, .delete-open-shift, #submitQuarterButton, #myScheduleTopButton, #publishOpenCandidates")) {
            event.preventDefault();
            event.stopPropagation();
            showBlockedMessage();
        }
    }, true);

    function refreshView() {
        try {
            if (typeof updateUserHeader === "function") updateUserHeader();
        } catch (_) {}
        try {
            if (typeof window.refreshPremiumLayout === "function") window.refreshPremiumLayout();
        } catch (_) {}
        try {
            if (typeof renderSchedule === "function") renderSchedule();
        } catch (_) {}
    }

    function enterViewAs(profile) {
        if (!currentProfile || currentProfile.role !== "admin") return;
        originalProfile = currentProfile;
        window.viewAsProfile = profile;
        window.viewAsActive = true;
        currentProfile = profile;
        wrapAccountPanels();
        refreshView();
        const notice = document.getElementById("permissionNotice");
        if (notice) {
            notice.innerHTML = `<strong>Viewing as ${esc(displayName(profile))}:</strong> Read-only view. No changes can be saved while acting as this person.`;
        }
    }

    function exitViewAs() {
        if (!window.viewAsActive || !originalProfile) return;
        currentProfile = originalProfile;
        originalProfile = null;
        window.viewAsProfile = null;
        window.viewAsActive = false;
        refreshView();
    }

    window.exitViewAs = exitViewAs;

    window.openViewAsPicker = function () {
        if (window.viewAsActive) {
            openViewAsReturnDialog();
            return;
        }
        if (!currentProfile || currentProfile.role !== "admin") return;
        wrapAccountPanels();
        const overlay = ensureModal();
        overlay.querySelector("#viewAsTitle").textContent = "View as…";
        overlay.querySelector("#viewAsReturn").style.display = "none";

        const people = (typeof profiles !== "undefined" ? profiles : [])
            .filter(p => p.active && p.role !== "admin" && p.id !== currentUser.id)
            .slice()
            .sort((a, b) => displayName(a).localeCompare(displayName(b)));

        const generic = [
            { id: "generic-employee", first_name: "Generic", last_name: "Employee", role: "employee", clinic_site: "Turfland", active: true },
            { id: "generic-manager", first_name: "Generic", last_name: "Manager", role: "manager", clinic_site: null, active: true },
            { id: "generic-external", first_name: "Generic", last_name: "External Worker", role: "external", clinic_site: null, active: true }
        ];

        const personRows = people.length
            ? people.map(p => `<button class="view-as-person" type="button" data-person="${esc(p.id)}"><strong>${esc(displayName(p))}</strong><span>${esc(roleLabel(p.role))}${p.clinic_site ? ` · ${esc(p.clinic_site)}` : ""}</span></button>`).join("")
            : `<p style="color:#64748b">No other active people to view as.</p>`;

        const genericRows = generic.map(p => `<button class="view-as-person" type="button" data-generic="${esc(p.role)}"><strong>${esc(displayName(p))}</strong><span>${esc(roleLabel(p.role))} · Generic role</span></button>`).join("");

        overlay.querySelector("#viewAsBody").innerHTML = `
            <p>Pick who you would like to act as. This is read-only: nothing you click in that view can be saved as them.</p>
            <div class="view-as-section">People</div>${personRows}
            <div class="view-as-section">Generic roles</div>${genericRows}`;

        overlay.querySelectorAll("[data-person]").forEach(button => {
            button.onclick = () => {
                const person = people.find(p => String(p.id) === button.dataset.person);
                if (!person) return;
                overlay.classList.remove("show");
                enterViewAs(person);
            };
        });
        overlay.querySelectorAll("[data-generic]").forEach(button => {
            button.onclick = () => {
                const person = generic.find(p => p.role === button.dataset.generic);
                if (!person) return;
                overlay.classList.remove("show");
                enterViewAs(person);
            };
        });

        overlay.classList.add("show");
    };

    window.openViewAsReturnDialog = function openViewAsReturnDialog() {
        if (!window.viewAsActive || !window.viewAsProfile) return;
        const overlay = ensureModal();
        const profile = window.viewAsProfile;
        overlay.querySelector("#viewAsTitle").textContent = `Acting as ${displayName(profile)}`;
        overlay.querySelector("#viewAsBody").innerHTML = `
            <p><strong>${esc(displayName(profile))}</strong> · ${esc(roleLabel(profile.role))}${profile.clinic_site ? ` · ${esc(profile.clinic_site)}` : ""}</p>
            <div class="view-as-notice">This is a read-only view. No changes can be saved while you are acting as this person.</div>`;
        overlay.querySelector("#viewAsReturn").style.display = "";
        overlay.classList.add("show");
    };

    wrapAccountPanels();
})();
