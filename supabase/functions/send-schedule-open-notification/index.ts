import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  const siteUrl =
    Deno.env.get("ACC_SCHEDULE_SITE_URL") ||
    "https://smo329.github.io/ACCScheduleManager/";

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase server configuration is missing." }, 500);
  }

  if (!resendApiKey || !fromEmail) {
    return json({
      error:
        "Email service is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.",
    }, 500);
  }

  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Authentication required." }, 401);
  }

  const token = authHeader.slice("Bearer ".length);

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

  const {
    data: callerData,
    error: callerError,
  } = await admin.auth.getUser(token);

  const caller = callerData?.user;

  if (callerError || !caller) {
    return json({ error: "Invalid session." }, 401);
  }

  const {
    data: callerProfile,
    error: callerProfileError,
  } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", caller.id)
    .single();

  if (
    callerProfileError ||
    !callerProfile ||
    callerProfile.role !== "admin"
  ) {
    return json({ error: "Administrator permission required." }, 403);
  }

  let body: {
    user_id?: string;
    period_id?: string;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const targetUserId = body.user_id;
  const periodId = body.period_id;

  if (!targetUserId || !periodId) {
    return json({
      error: "user_id and period_id are required.",
    }, 400);
  }

  const [
    preferenceResult,
    periodResult,
    profileResult,
    accessResult,
  ] = await Promise.all([
    admin
      .from("notification_preferences")
      .select(
        "schedule_open_email_enabled, schedule_open_email",
      )
      .eq("user_id", targetUserId)
      .maybeSingle(),

    admin
      .from("scheduling_periods")
      .select("id, name, period_start, period_end")
      .eq("id", periodId)
      .single(),

    admin
      .from("profiles")
      .select("id, first_name, last_name, role, active")
      .eq("id", targetUserId)
      .single(),

    admin
      .from("scheduling_period_access")
      .select("is_open")
      .eq("period_id", periodId)
      .eq("user_id", targetUserId)
      .maybeSingle(),
  ]);

  if (preferenceResult.error) {
    return json({
      error: preferenceResult.error.message,
    }, 500);
  }

  if (periodResult.error || !periodResult.data) {
    return json({
      error:
        periodResult.error?.message ||
        "Scheduling period not found.",
    }, 404);
  }

  if (profileResult.error || !profileResult.data) {
    return json({
      error:
        profileResult.error?.message ||
        "Employee profile not found.",
    }, 404);
  }

  if (
    profileResult.data.role === "admin" ||
    !profileResult.data.active
  ) {
    return json({
      sent: false,
      skipped: true,
      reason: "Target is not an active employee.",
    });
  }

  if (
    accessResult.error ||
    !accessResult.data?.is_open
  ) {
    return json({
      sent: false,
      skipped: true,
      reason: "Scheduling access is not currently open.",
    });
  }

  const preference = preferenceResult.data;

  if (!preference?.schedule_open_email_enabled) {
    return json({
      sent: false,
      skipped: true,
      reason: "Employee has not opted in.",
    });
  }

  const {
    data: targetAuthData,
    error: targetAuthError,
  } = await admin.auth.admin.getUserById(targetUserId);

  if (targetAuthError || !targetAuthData?.user) {
    return json({
      error:
        targetAuthError?.message ||
        "Unable to find employee login email.",
    }, 500);
  }

  const recipient =
    preference.schedule_open_email?.trim() ||
    targetAuthData.user.email;

  if (!recipient) {
    return json({
      error: "No notification email is available for this employee.",
    }, 400);
  }

  const employeeName =
    [
      profileResult.data.first_name,
      profileResult.data.last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || "Employee";

  const period = periodResult.data;

  const subject =
    `Your ACC schedule is open — ${period.name}`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937;">
      <h2 style="color:#17365d;margin-bottom:8px;">
        Your ACC schedule is now open
      </h2>

      <p>Hello ${employeeName},</p>

      <p>
        Your scheduling access for <strong>${period.name}</strong>
        has been opened. You can now sign in and select your shifts.
      </p>

      <p>
        <strong>Scheduling period:</strong>
        ${period.period_start} through ${period.period_end}
      </p>

      <p style="margin:24px 0;">
        <a
          href="${siteUrl}"
          style="
            display:inline-block;
            background:#17365d;
            color:white;
            text-decoration:none;
            padding:10px 16px;
            border-radius:6px;
            font-weight:bold;
          "
        >
          Open ACC Schedule Manager
        </a>
      </p>

      <p style="font-size:12px;color:#6b7280;">
        You received this message because you opted in to scheduling-open
        notifications in ACC Schedule Manager. You can change this setting
        in Account Manager.
      </p>
    </div>
  `;

  const resendResponse = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient],
        subject,
        html,
      }),
    },
  );

  const resendBody = await resendResponse.json().catch(() => ({}));

  if (!resendResponse.ok) {
    const errorMessage =
      resendBody?.message ||
      resendBody?.error ||
      `Resend returned HTTP ${resendResponse.status}`;

    await admin
      .from("notification_log")
      .insert({
        user_id: targetUserId,
        period_id: periodId,
        event_type: "schedule_open",
        channel: "email",
        recipient,
        status: "failed",
        error_message: errorMessage,
      });

    return json({
      error: errorMessage,
    }, 502);
  }

  await admin
    .from("notification_log")
    .insert({
      user_id: targetUserId,
      period_id: periodId,
      event_type: "schedule_open",
      channel: "email",
      recipient,
      status: "sent",
      provider_message_id:
        typeof resendBody?.id === "string"
          ? resendBody.id
          : null,
    });

  return json({
    sent: true,
    recipient,
  });
});
