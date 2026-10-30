/*
 * ACC Schedule Manager - Modal scroll lock
 * When any modal is open, the page behind it must not scroll. Previously,
 * scrolling over a modal (or past the end of a modal's own scroll area)
 * also scrolled the background page, and wheel events landing on a
 * non-scrollable part of a modal did nothing to the modal at all.
 * This patch watches every .modal-overlay — shown either by inline
 * display:flex or by the .show class — and locks body scrolling while
 * at least one is visible, restoring it when the last one closes.
 */
(function () {
    "use strict";

    let savedOverflow = null;
    let locked = false;

    function anyModalOpen() {
        const overlays = document.querySelectorAll(".modal-overlay");
        for (const overlay of overlays) {
            if (!overlay.isConnected) continue;
            let display = "";
            try {
                display = window.getComputedStyle(overlay).display;
            } catch (e) {
                display = overlay.style.display || "";
            }
            if (display && display !== "none") return true;
        }
        return false;
    }

    function syncModalScrollLock() {
        if (anyModalOpen()) {
            if (!locked) {
                savedOverflow = document.body.style.overflow;
                document.body.style.overflow = "hidden";
                locked = true;
            }
        } else if (locked) {
            document.body.style.overflow = savedOverflow || "";
            savedOverflow = null;
            locked = false;
        }
    }

    function ensureModalScrollLockStyles() {
        if (document.getElementById("modalScrollLockStyles")) return;
        const style = document.createElement("style");
        style.id = "modalScrollLockStyles";
        style.textContent =
            ".modal-overlay .modal-body, .modal-overlay .modal-scroll, " +
            ".modal-overlay .account-settings-content { overscroll-behavior: contain; }";
        document.head.appendChild(style);
    }

    const observer = new MutationObserver(syncModalScrollLock);

    function beginObserving() {
        if (!document.body) {
            setTimeout(beginObserving, 100);
            return;
        }
        ensureModalScrollLockStyles();
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["style", "class"],
        });
        syncModalScrollLock();
    }

    beginObserving();
})();
