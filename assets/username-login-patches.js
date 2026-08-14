/*
 * ACC Schedule Manager - Username login support
 */
(function () {
  "use strict";

  const VERSION = "2026.08.14.1";
  console.info(`[ACC Schedule Manager] username login patch loaded: ${VERSION}`);

  function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase();
  }

  function validUsername(value) {
    return /^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$/.test(value);
  }

  function updateLoginUi() {
    const input = document.getElementById("email");
    if (!input) return;

    input.type = "text";
    input.placeholder = "Enter username or email";
    input.autocomplete = "username";

    const label = document.querySelector('label[for="email"]');
    if (label) label.textContent = "Username or Email";
  }

  login = async function () {
    const identifier = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const button = document.getElementById("loginButton");
    const errorBox = document.getElementById("loginError");

    errorBox.style.display = "none";

    if (!identifier || !password) {
      errorBox.textContent = "Please enter your username or email and password.";
      errorBox.style.display = "block";
      return;
    }

    button.disabled = true;
    button.textContent = "Signing In...";

    try {
      if (identifier.includes("@")) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: identifier,
          password
        });

        if (error || !data?.user) {
          throw new Error(error?.message || "Invalid email or password.");
        }

        await startApplication(data.user);
        return;
      }

      const username = normalizeUsername(identifier);

      if (!validUsername(username)) {
        throw new Error("Invalid username or password.");
      }

      const { data, error } = await supabaseClient.functions.invoke(
        "login-with-username",
        {
          body: {
            username,
            password
          }
        }
      );

      if (error || data?.error || !data?.access_token || !data?.refresh_token) {
        throw new Error(data?.error || "Invalid username or password.");
      }

      const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token
        });

      if (sessionError || !sessionData?.user) {
        throw new Error(sessionError?.message || "Unable to start your session.");
      }

      await startApplication(sessionData.user);

    } catch (error) {
      console.error(error);
      errorBox.textContent = error?.message || "Unable to sign in.";
      errorBox.style.display = "block";
    } finally {
      button.disabled = false;
      button.textContent = "Sign In";
    }
  };

  async function loadUsername() {
    if (!currentUser) return null;

    const { data, error } = await supabaseClient
      .from("profiles")
      .select("username")
      .eq("id", currentUser.id)
      .single();

    if (error) {
      console.warn("Unable to load username:", error);
      return null;
    }

    return data?.username || "";
  }

  function ensureUsernameField() {
    if (!currentUser) return null;

    let group = document.getElementById("accountUsernameGroup");
    if (group) return group;

    const emailInput = document.getElementById("accountEmail");
    if (!emailInput) return null;

    const emailGroup = emailInput.closest(".form-group");
    if (!emailGroup) return null;

    group = document.createElement("div");
    group.id = "accountUsernameGroup";
    group.className = "form-group";
    group.innerHTML = `
      <label for="accountUsername">Username</label>
      <input
        id="accountUsername"
        type="text"
        maxlength="40"
        autocomplete="username"
        placeholder="Choose a username"
      >
      <div class="account-settings-help">
        3–40 characters. Lowercase letters, numbers, periods, hyphens, and underscores only.
      </div>
      <button
        id="saveUsernameButton"
        class="modal-button save-button"
        type="button"
        style="margin-top:8px;"
      >
        Save Username
      </button>
    `;

    emailGroup.insertAdjacentElement("afterend", group);

    group.querySelector("#saveUsernameButton").onclick = saveUsername;

    return group;
  }

  async function refreshUsernameField() {
    const group = ensureUsernameField();
    if (!group) return;

    const username = await loadUsername();
    const input = group.querySelector("#accountUsername");
    if (input && username !== null) input.value = username;
  }

  async function saveUsername() {
    if (!currentUser) return;

    if (typeof clearAccountMessages === "function") clearAccountMessages();

    const input = document.getElementById("accountUsername");
    const button = document.getElementById("saveUsernameButton");
    if (!input || !button) return;

    const username = normalizeUsername(input.value);

    if (!validUsername(username)) {
      if (typeof showAccountError === "function") {
        showAccountError(
          "Username must be 3–40 characters and use only lowercase letters, numbers, periods, hyphens, or underscores. It must start and end with a letter or number."
        );
      }
      return;
    }

    button.disabled = true;
    button.textContent = "Saving...";

    try {
      const { error } = await supabaseClient
        .from("profiles")
        .update({ username })
        .eq("id", currentUser.id);

      if (error) {
        if (error.code === "23505") {
          throw new Error("That username is already in use. Please choose another one.");
        }
        throw new Error(error.message);
      }

      input.value = username;

      if (currentProfile) currentProfile.username = username;

      if (typeof showAccountMessage === "function") {
        showAccountMessage(`Username saved. You can now sign in as ${username}.`);
      }

    } catch (error) {
      console.error(error);
      if (typeof showAccountError === "function") {
        showAccountError(error?.message || "Unable to save username.");
      }
    } finally {
      button.disabled = false;
      button.textContent = "Save Username";
    }
  }

  if (typeof openAccountManager === "function") {
    const originalOpenAccountManager = openAccountManager;

    openAccountManager = function (...args) {
      const result = originalOpenAccountManager.apply(this, args);

      setTimeout(() => {
        ensureUsernameField();
        refreshUsernameField().catch(error =>
          console.warn("Username settings load failed:", error)
        );
      }, 0);

      return result;
    };
  }

  updateLoginUi();
})();
