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
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Server configuration is incomplete." }, 500);
  }

  let body: { user_id?: string; email?: string; message?: string };

  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const userId = String(body.user_id || "").trim();
  const email = String(body.email || "").trim();
  const message = String(body.message || "").trim();

  if (!userId || !email || !message) {
    return json({ error: "Email and message are required." }, 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Please enter a valid email address." }, 400);
  }

  if (message.length > 2000) {
    return json({ error: "Your message is too long (2000 characters max)." }, 400);
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
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return json({ error: "We could not verify your account." }, 400);
  }

  if (profile.active) {
    return json({ error: "This form is only for disabled accounts." }, 403);
  }

  const fullMessage = `Contact email: ${email}\n\n${message}`;

  const { error: insertError } = await admin
    .from("admin_messages")
    .insert({
      sender_id: userId,
      recipient_id: null,
      message: fullMessage,
      status: "open",
    });

  if (insertError) {
    return json({ error: "Could not send your message. Please try again." }, 500);
  }

  return json({ success: true });
});
