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

function getSunday(dateString: string) {
  const d = new Date(`${dateString}T12:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDateRange(startKey: string) {
  const start = new Date(`${startKey}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const startText = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const endText = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startText}–${endText}`;
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
  const siteUrl = Deno.env.get("ACC_SCHEDULE_SITE_URL") ||
    "https://smo329.github.io/ACCScheduleManager/";



  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase server configuration is missing." }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Authentication required." }, 401);
  }

  const token = authHeader.slice("Bearer ".length);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (callerError || !caller) {
    return json({ error: "Invalid session." }, 401);
  }

  const { data: callerProfile, error: callerProfileError } = await admin
    .from("profiles")
    .select("id, role, active")
    .eq("id", caller.id)
    .single();

  if (
    callerProfileError ||
    !callerProfile ||
    !callerProfile.active ||
    !["employee", "admin"].includes(callerProfile.role)
  ) {
    return json({
      error: "Only active employees or administrators can report schedule updates.",
    }, 403);
  }

  let body: { employee_id?: string; schedule_date?: string; change_type?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const employeeId = body.employee_id;
  const scheduleDate = body.schedule_date;
  const changeType = String(body.change_type || "schedule").slice(0, 60);

  if (!employeeId || !scheduleDate || !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) {
    return json({ error: "employee_id and a valid schedule_date are required." }, 400);
  }

  const [employeeResult, scheduleResult] = await Promise.all([
    admin
      .from("profiles")
      .select("id, first_name, last_name, clinic_site, role, active")
      .eq("id", employeeId)
      .single(),
    admin
      .from("schedules")
      .select("schedule_code, work_site")
      .eq("user_id", employeeId)
      .eq("schedule_date", scheduleDate)
      .maybeSingle(),
  ]);

  if (employeeResult.error || !employeeResult.data) {
    return json({ error: employeeResult.error?.message || "Employee profile not found." }, 404);
  }

  const employee = employeeResult.data;
  if (employee.role !== "employee" || !employee.active) {
    return json({ sent: 0, skipped: true, reason: "The changed profile is not an active employee." });
  }

  const clinicSite =
    scheduleResult.data?.schedule_code === "12" && scheduleResult.data?.work_site
      ? scheduleResult.data.work_site
      : employee.clinic_site;

  if (clinicSite !== "Turfland" && clinicSite !== "Fountain Court") {
    return json({ sent: 0, skipped: true, reason: "No clinic could be determined for this schedule change." });
  }

  const { data: managers, error: managersError } = await admin
    .from("profiles")
    .select("id, first_name, last_name, clinic_site")
    .eq("role", "manager")
    .eq("active", true)
    .eq("clinic_site", clinicSite);

  if (managersError) return json({ error: managersError.message }, 500);
  if (!managers?.length) {
    return json({ sent: 0, skipped: true, reason: "No active Clinic Managers are assigned to this clinic." });
  }

  const managerIds = managers.map((manager) => manager.id);
  const { data: preferences, error: preferencesError } = await admin
    .from("notification_preferences")
    .select("user_id,manager_schedule_update_email_enabled,manager_schedule_update_email")
    .in("user_id", managerIds);

  if (preferencesError) return json({ error: preferencesError.message }, 500);

  const optedIn = managers
    .map((manager) => ({
      manager,
      preference: preferences?.find((p) => p.user_id === manager.id) || null,
    }))
    .filter((item) => item.preference?.manager_schedule_update_email_enabled === true);

  if (!optedIn.length) {
    return json({ sent: 0, skipped: true, reason: "No Clinic Managers for this clinic are opted in." });
  }

  const weekStart = dateKey(getSunday(scheduleDate));
  const cooldownSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const employeeName = [employee.first_name, employee.last_name].filter(Boolean).join(" ").trim() || "An employee";

  let sent = 0;
  let cooldownSkipped = 0;
  const failures: string[] = [];

  for (const item of optedIn) {
    const manager = item.manager;
    const preference = item.preference!;

    const { data: recent, error: recentError } = await admin
      .from("notification_log")
      .select("id")
      .eq("user_id", manager.id)
      .eq("event_type", "manager_schedule_update")
      .eq("status", "sent")
      .gte("created_at", cooldownSince)
      .contains("metadata", { clinic_site: clinicSite, week_start: weekStart })
      .limit(1);

    if (recentError) {
      failures.push(`${manager.id}: ${recentError.message}`);
      continue;
    }

    if (recent?.length) {
      cooldownSkipped++;
      continue;
    }

    if (!resendApiKey || !fromEmail) {
      failures.push(`${manager.id}: email service is not configured`);
      continue;
    }

    const { data: authUserData, error: authUserError } =
      await admin.auth.admin.getUserById(manager.id);

    if (authUserError || !authUserData?.user) {
      failures.push(`${manager.id}: unable to resolve login email`);
      continue;
    }

    const recipient = preference.manager_schedule_update_email?.trim() || authUserData.user.email;
    if (!recipient) {
      failures.push(`${manager.id}: no email address available`);
      continue;
    }

    const managerName = [manager.first_name, manager.last_name].filter(Boolean).join(" ").trim() || "Clinic Manager";
    const subject = `ACC schedule updated — ${clinicSite}`;
    const weekRange = formatDateRange(weekStart);

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937;">
        <h2 style="color:#17365d;margin-bottom:8px;">ACC schedule updated</h2>
        <p>Hello ${managerName},</p>
        <p>The <strong>${clinicSite}</strong> schedule has been updated for the week of <strong>${weekRange}</strong>.</p>
        <p>The latest change involved <strong>${employeeName}</strong> on <strong>${scheduleDate}</strong>.</p>
        <p style="margin:24px 0;"><a href="${siteUrl}" style="display:inline-block;background:#17365d;color:white;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold;">View ACC Schedule</a></p>
        <p style="font-size:12px;color:#6b7280;">To avoid excessive email, additional changes to this clinic/week may be grouped for approximately 15 minutes. You can turn these alerts on or off in Account → Notifications.</p>
      </div>`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [recipient], subject, html }),
    });

    const resendBody = await resendResponse.json().catch(() => ({}));

    if (!resendResponse.ok) {
      const message = resendBody?.message || resendBody?.error || `Resend HTTP ${resendResponse.status}`;
      failures.push(`${manager.id}: ${message}`);
      await admin.from("notification_log").insert({
        user_id: manager.id,
        event_type: "manager_schedule_update",
        channel: "email",
        recipient,
        status: "failed",
        error_message: message,
        metadata: { clinic_site: clinicSite, week_start: weekStart, employee_id: employeeId, schedule_date: scheduleDate, change_type: changeType },
      });
      continue;
    }

    await admin.from("notification_log").insert({
      user_id: manager.id,
      event_type: "manager_schedule_update",
      channel: "email",
      recipient,
      status: "sent",
      provider_message_id: typeof resendBody?.id === "string" ? resendBody.id : null,
      metadata: { clinic_site: clinicSite, week_start: weekStart, employee_id: employeeId, schedule_date: scheduleDate, change_type: changeType },
    });

    sent++;
  }

  return json({ sent, cooldown_skipped: cooldownSkipped, failures });
});
