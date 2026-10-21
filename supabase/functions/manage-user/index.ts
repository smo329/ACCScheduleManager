import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function validDate(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
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

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const { action, user_id } = body;
    if (!action || !user_id) return json({ error: "action and user_id are required" }, 400);

    if (user_id === userData.user.id && (action === "deactivate" || (action === "update_profile" && body.role !== "admin"))) {
      return json({ error: "You cannot deactivate or demote your own administrator account." }, 400);
    }

    if (action === "update_profile") {
      const firstName = String(body.first_name || "").trim();
      const lastName = String(body.last_name || "").trim();
      const requestedRole = String(body.role || "").trim().toLowerCase();
      const role = ["employee", "manager", "admin", "external"].includes(requestedRole) ? requestedRole : "employee";
      const clinicSite = body.clinic_site === "Fountain Court" ? "Fountain Court" : body.clinic_site === "Turfland" ? "Turfland" : null;

      if (!firstName || !lastName) return json({ error: "First name and last name are required." }, 400);
      if (role !== "external" && !clinicSite) return json({ error: "Primary clinic must be Turfland or Fountain Court." }, 400);

      const { data: oldProfile } = await adminClient.from("profiles").select("role").eq("id", user_id).single();
      const { error } = await adminClient.from("profiles").update({
        first_name: firstName,
        last_name: lastName,
        role,
        clinic_site: role === "external" ? null : clinicSite,
        updated_at: new Date().toISOString(),
      }).eq("id", user_id);
      if (error) return json({ error: error.message }, 400);

      if (oldProfile?.role !== "employee" && role === "employee") {
        const startDate = validDate(body.employment_start_date) ? body.employment_start_date : new Date().toISOString().slice(0, 10);
        const { error: periodError } = await adminClient.from("employment_periods").insert({ user_id, start_date: startDate, end_date: null });
        if (periodError && !periodError.message.includes("duplicate")) return json({ error: periodError.message }, 400);
      }

      if (oldProfile?.role === "employee" && role !== "employee") {
        const endDate = validDate(body.employment_end_date) ? body.employment_end_date : new Date().toISOString().slice(0, 10);
        await adminClient.from("employment_periods").update({ end_date: endDate, updated_at: new Date().toISOString() }).eq("user_id", user_id).is("end_date", null);
      }

      return json({ success: true });
    }

    if (action === "activate") {
      const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user_id).single();
      const { error } = await adminClient.from("profiles").update({ active: true, updated_at: new Date().toISOString() }).eq("id", user_id);
      if (error) return json({ error: error.message }, 400);
      if (profile?.role === "employee") {
        const startDate = validDate(body.employment_start_date) ? body.employment_start_date : new Date().toISOString().slice(0, 10);
        const { data: openPeriod } = await adminClient.from("employment_periods").select("id").eq("user_id", user_id).is("end_date", null).maybeSingle();
        if (!openPeriod) {
          const { error: periodError } = await adminClient.from("employment_periods").insert({ user_id, start_date: startDate, end_date: null });
          if (periodError) return json({ error: periodError.message }, 400);
        }
      }
      return json({ success: true });
    }

    if (action === "deactivate") {
      const endDate = validDate(body.employment_end_date) ? body.employment_end_date : new Date().toISOString().slice(0, 10);
      const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user_id).single();
      if (profile?.role === "employee") {
        const { data: openPeriod } = await adminClient.from("employment_periods").select("id, start_date").eq("user_id", user_id).is("end_date", null).maybeSingle();
        if (openPeriod && endDate < openPeriod.start_date) return json({ error: "Employment end date cannot be before the start date." }, 400);
        if (openPeriod) {
          const { error: periodError } = await adminClient.from("employment_periods").update({ end_date: endDate, updated_at: new Date().toISOString() }).eq("id", openPeriod.id);
          if (periodError) return json({ error: periodError.message }, 400);
        }
      }
      const { error } = await adminClient.from("profiles").update({ active: false, updated_at: new Date().toISOString() }).eq("id", user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (action === "set_employment_period") {
      if (!validDate(body.start_date)) return json({ error: "A valid employment start date is required." }, 400);
      if (body.end_date && !validDate(body.end_date)) return json({ error: "Employment end date must be blank or YYYY-MM-DD." }, 400);
      if (body.end_date && body.end_date < body.start_date) return json({ error: "Employment end date cannot be before the start date." }, 400);
      if (body.period_id) {
        const { error } = await adminClient.from("employment_periods").update({ start_date: body.start_date, end_date: body.end_date || null, updated_at: new Date().toISOString() }).eq("id", body.period_id).eq("user_id", user_id);
        if (error) return json({ error: error.message }, 400);
      } else {
        const { error } = await adminClient.from("employment_periods").insert({ user_id, start_date: body.start_date, end_date: body.end_date || null });
        if (error) return json({ error: error.message }, 400);
      }
      return json({ success: true });
    }

    if (action === "set_password") {
      const password = String(body.password || "");
      if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});
