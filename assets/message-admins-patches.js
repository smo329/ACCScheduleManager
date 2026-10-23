/* ACC Schedule Manager - message the admins */
(function () {
    "use strict";

    const VERSION = "2026.10.23.1";

    console.info(
        `[ACC Schedule Manager] message admins loaded: ${VERSION}`
    );

    function ensureStyles() {
        if (document.getElementById("messageAdminsStyles")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "messageAdminsStyles";
        style.textContent = `
            #messageAdminsText {
                width:100%;
                min-height:120px;
                border:1px solid #cfdbea;
                border-radius:10px;
                padding:10px 12px;
                background:#fbfdff;
                resize:vertical;
            }

            #messageAdminsError {
                display:none;
                color:#b42318;
                font-size:12px;
                margin-top:8px;
            }
        `;
        document.head.appendChild(style);
    }

    function ensureModal() {
        let modal = document.getElementById("messageAdminsModal");

        if (modal) {
            return modal;
        }

        modal = document.createElement("div");
        modal.id = "messageAdminsModal";
        modal.className = "modal-overlay";
        modal.innerHTML = `
            <div class="modal" style="max-width:520px">
                <div class="modal-header">
                    <div class="modal-title">Message the Admins</div>
                    <button class="modal-close" id="messageAdminsCloseX" type="button">×</button>
                </div>
                <div class="modal-body">
                    <div id="messageAdminsForm">
                        <div style="font-size:12px;color:#475569;margin-bottom:10px">
                            Send a message to the clinic admins. They will see it in the Notification Center.
                        </div>
                        <textarea id="messageAdminsText" maxlength="2000" placeholder="What do you need?"></textarea>
                        <div id="messageAdminsError"></div>
                    </div>
                    <div id="messageAdminsSent" style="display:none">
                        <p>✓ Message sent to the admins.</p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="modal-button cancel-button" id="messageAdminsCancel" type="button">Cancel</button>
                    <button class="modal-button save-button" id="messageAdminsSend" type="button">Send Message</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const close = () => {
            modal.style.display = "none";
        };

        modal.querySelector("#messageAdminsCloseX").onclick = close;
        modal.querySelector("#messageAdminsCancel").onclick = close;
        modal.querySelector("#messageAdminsSend").onclick = sendMessage;

        return modal;
    }

    async function sendMessage() {
        if (!currentUser) {
            return;
        }

        const textEl = document.getElementById("messageAdminsText");
        const errorEl = document.getElementById("messageAdminsError");
        const button = document.getElementById("messageAdminsSend");

        const text = textEl.value.trim();

        if (!text) {
            errorEl.textContent = "Please write a message first.";
            errorEl.style.display = "block";
            return;
        }

        errorEl.style.display = "none";
        button.disabled = true;
        button.textContent = "Sending…";

        const { error } = await supabaseClient
            .from("admin_messages")
            .insert({
                sender_id: currentUser.id,
                message: text
            });

        button.disabled = false;
        button.textContent = "Send Message";

        if (error) {
            errorEl.textContent =
                error.message || "Unable to send your message.";
            errorEl.style.display = "block";
            return;
        }

        document.getElementById("messageAdminsForm").style.display = "none";
        document.getElementById("messageAdminsSent").style.display = "block";
        button.style.display = "none";
        document.getElementById("messageAdminsCancel").textContent = "Done";
    }

    window.openMessageAdmins = function () {
        if (!currentUser) {
            return;
        }

        ensureStyles();

        const modal = ensureModal();

        document.getElementById("messageAdminsForm").style.display = "block";
        document.getElementById("messageAdminsSent").style.display = "none";

        const button = document.getElementById("messageAdminsSend");
        button.style.display = "";

        document.getElementById("messageAdminsCancel").textContent = "Cancel";

        const textEl = document.getElementById("messageAdminsText");
        textEl.value = "";

        document.getElementById("messageAdminsError").style.display = "none";

        modal.style.display = "flex";
        textEl.focus();
    };
})();
