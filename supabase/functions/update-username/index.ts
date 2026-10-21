import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) return json({ error: "Not authenticated" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

  let body: { username?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const username = String(body.username || "").trim().toLowerCase();

  if (
    username.length < 3 ||
    username.length > 40 ||
    !/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(username)
  ) {
    return json({
      error:
        "Username must be 3–40 characters and use only lowercase letters, numbers, periods, hyphens, or underscores. It must start and end with a letter or number.",
    }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: currentProfile, error: profileError } = await admin
    .from("profiles")
    .select("id, active")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !currentProfile || !currentProfile.active) {
    return json({ error: "Your account is not active." }, 403);
  }

  const { data: existing, error: existingError } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .neq("id", userData.user.id)
    .maybeSingle();

  if (existingError) return json({ error: existingError.message }, 500);
  if (existing) return json({ error: "That username is already in use." }, 409);

  const { error: updateError } = await admin
    .from("profiles")
    .update({ username })
    .eq("id", userData.user.id);

  if (updateError) return json({ error: updateError.message }, 500);

  return json({ success: true, username });
});
