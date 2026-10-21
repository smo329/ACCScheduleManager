import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {

    return json({ error: "Server configuration is incomplete." }, 500);
  }

  let body: { username?: string; password?: string };

  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid login request." }, 400);
  }

  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!username || !password) {
    return json({ error: "Invalid username or password." }, 400);
  }

  if (
    username.length < 3 ||
    username.length > 40 ||
    !/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(username)
  ) {
    return json({ error: "Invalid username or password." }, 401);
  }

  const admin = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, active")
    .eq("username", username)
    .maybeSingle();

  if (profileError || !profile || !profile.active) {
    return json({ error: "Invalid username or password." }, 401);
  }


  const { data: authUserData, error: authUserError } =
    await admin.auth.admin.getUserById(profile.id);

  const email = authUserData?.user?.email;

  if (authUserError || !email) {
    return json({ error: "Invalid username or password." }, 401);
  }

  const authClient = createClient(
    supabaseUrl,
    anonKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const { data, error } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session || !data.user) {
    return json({ error: "Invalid username or password." }, 401);
  }

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at,
    token_type: data.session.token_type,
  });
});
