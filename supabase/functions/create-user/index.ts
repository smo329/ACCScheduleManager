import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeUsername(value: string) {
  let result = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "").replace(/^[^a-z0-9]+/, "").replace(/[^a-z0-9]+$/, "").slice(0, 40);
  if (result.length < 3) result = `user-${result || "new"}`.slice(0, 40);
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Invalid login" }, 401);
    const { data: adminProfile, error: profileError } = await userClient.from("profiles").select("role, active").eq("id", userData.user.id).single();
    if (profileError || !adminProfile || adminProfile.role !== "admin" || adminProfile.active !== true) return json({ error: "Administrator permission required" }, 403);

    const { email, password, first_name, last_name, role, clinic_site, employment_start_date, username } = await req.json();
    if (!email || !password || !first_name || !last_name) return json({ error: "Email, password, first name, and last name are required." }, 400);

    const requestedRole = String(role || "").trim().toLowerCase();
    const normalizedRole = ["employee", "manager", "admin", "external"].includes(requestedRole) ? requestedRole : "employee";
    const normalizedClinic = clinic_site === "Turfland" || clinic_site === "Fountain Court" ? clinic_site : null;
    if (normalizedRole !== "external" && !normalizedClinic) return json({ error: "A valid clinic site is required." }, 400);

    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(employment_start_date || "")) ? employment_start_date : new Date().toISOString().slice(0, 10);
    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let baseUsername = normalizeUsername(String(username || "") || String(email).split("@")[0]);
    let finalUsername = baseUsername;
    let suffix = 2;
    while (true) {
      const { data: existingUsername, error: usernameLookupError } = await adminClient.from("profiles").select("id").eq("username", finalUsername).maybeSingle();
      if (usernameLookupError) return json({ error: usernameLookupError.message }, 400);
      if (!existingUsername) break;
      const suffixText = `-${suffix++}`;
      finalUsername = `${baseUsername.slice(0, 40 - suffixText.length)}${suffixText}`;
    }

    const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError || !newUserData.user) return json({ error: createError?.message || "Unable to create account." }, 400);

    const { error: insertError } = await adminClient.from("profiles").insert({ id: newUserData.user.id, first_name, last_name, username: finalUsername, role: normalizedRole, active: true, clinic_site: normalizedRole === "external" ? null : normalizedClinic });
    if (insertError) {
      await adminClient.auth.admin.deleteUser(newUserData.user.id);
      return json({ error: insertError.message }, 400);
    }

    if (normalizedRole === "employee") {
      const { error: employmentError } = await adminClient.from("employment_periods").insert({ user_id: newUserData.user.id, start_date: startDate, end_date: null });
      if (employmentError) {
        await adminClient.from("profiles").delete().eq("id", newUserData.user.id);
        await adminClient.auth.admin.deleteUser(newUserData.user.id);
        return json({ error: employmentError.message }, 400);
      }
    }

    return json({ success: true, user: { id: newUserData.user.id, email, username: finalUsername, first_name, last_name, role: normalizedRole } });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});
