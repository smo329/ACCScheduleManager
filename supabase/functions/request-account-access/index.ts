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

function clean(value: unknown, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  const siteUrl = Deno.env.get("ACC_SCHEDULE_SITE_URL") ||
    "https://smo329.github.io/ACCScheduleManager/";

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Server configuration is incomplete." }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const firstName = clean(body.first_name, 80);
  const lastName = clean(body.last_name, 80);
  const email = clean(body.email, 180).toLowerCase();

  if (!firstName || !lastName || !email) {
    return json({ error: "First name, last name, and email are required." }, 400);
  }

  if (!validEmail(email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing } = await admin
    .from("account_access_requests")
    .select("id, requested_at")
    .eq("status", "pending")
    .ilike("email", email)
    .maybeSingle();

  if (existing) {
    return json({
      success: true,
      already_pending: true,
      message: "A request for this email is already pending review.",
    });
  }

  const { data: requestRow, error: insertError } = await admin
    .from("account_access_requests")
    .insert({ first_name: firstName, last_name: lastName, email })
    .select("id, requested_at")
    .single();

  if (insertError || !requestRow) {
    return json({ error: insertError?.message || "Unable to submit request." }, 500);
  }

  let emailSent = 0;
  const emailFailures: string[] = [];

  if (resendApiKey && fromEmail) {
    const { data: admins, error: adminsError } = await admin
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("role", "admin")
      .eq("active", true);

    if (!adminsError && admins?.length) {
      const adminIds = admins.map(a => a.id);
      const { data: prefs } = await admin
        .from("notification_preferences")
        .select("user_id, manager_schedule_update_email")
        .in("user_id", adminIds);

      for (const adminProfile of admins) {
        const { data: authUserData, error: authError } =
          await admin.auth.admin.getUserById(adminProfile.id);

        if (authError || !authUserData?.user) {
          emailFailures.push(`${adminProfile.id}: unable to resolve admin email`);
          continue;
        }

        const pref = prefs?.find(p => p.user_id === adminProfile.id);
        const recipient = pref?.manager_schedule_update_email?.trim() ||
          authUserData.user.email;

        if (!recipient) {
          emailFailures.push(`${adminProfile.id}: no email available`);
          continue;
        }

        const adminName = [adminProfile.first_name, adminProfile.last_name]
          .filter(Boolean).join(" ").trim() || "Administrator";

        const subject = `New ACC Schedule Manager access request — ${firstName} ${lastName}`;
        const html = `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937;">
            <h2 style="color:#17365d;margin-bottom:8px;">New account access request</h2>
            <p>Hello ${adminName},</p>
            <p><strong>${firstName} ${lastName}</strong> requested access to ACC Schedule Manager.</p>
            <p><strong>Email:</strong> ${email}</p>
            <p>No account has been created. Review the request in ACC Schedule Manager before adding the person.</p>
            <p style="margin:24px 0;">
              <a href="${siteUrl}" style="display:inline-block;background:#17365d;color:white;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold;">Review Access Request</a>
            </p>
          </div>`;

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ from: fromEmail, to: [recipient], subject, html }),
        });

        const responseBody = await response.json().catch(() => ({}));

        if (!response.ok) {
          emailFailures.push(
            `${adminProfile.id}: ${responseBody?.message || responseBody?.error || `HTTP ${response.status}`}`,
          );
          continue;
        }

        emailSent++;

        await admin.from("notification_log").insert({
          user_id: adminProfile.id,
          event_type: "account_access_request",
          channel: "email",
          recipient,
          status: "sent",
          provider_message_id:
            typeof responseBody?.id === "string" ? responseBody.id : null,
          metadata: {
            request_id: requestRow.id,
            requester_email: email,
          },
        });
      }
    }
  }

  return json({
    success: true,
    request_id: requestRow.id,
    email_sent: emailSent,
    email_failures: emailFailures,
  });
});
