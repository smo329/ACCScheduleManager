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

function localParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    },
  );

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    dateKey:
      `${parts.year}-${parts.month}-${parts.day}`,
    hour:
      Number(parts.hour === "24" ? "0" : parts.hour),
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function scheduleDescription(data: any) {
  if (!data) return "none";

  const code =
    data.schedule_code || "0";

  if (
    code === "12" &&
    data.work_site
  ) {
    return `${code} (${data.work_site})`;
  }

  return code;
}

function leaveDescription(data: any) {
  if (!data) return "none";

  const parts: string[] = [];

  const vl =
    Number(data.vacation_hours || 0);

  const pl =
    Number(data.professional_leave_hours || 0);

  const tdl =
    Number(data.tdl_hours || 0);

  if (vl) parts.push(`VL ${vl}`);
  if (pl) parts.push(`PL ${pl}`);
  if (tdl) parts.push(`TDL ${tdl}`);

  return parts.length
    ? parts.join(", ")
    : "0 hours";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json({
      error: "Method not allowed",
    }, 405);
  }

  const supabaseUrl =
    Deno.env.get("SUPABASE_URL");

  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const resendApiKey =
    Deno.env.get("RESEND_API_KEY");

  const fromEmail =
    Deno.env.get("RESEND_FROM_EMAIL");

  const siteUrl =
    Deno.env.get("ACC_SCHEDULE_SITE_URL") ||
    "https://smo329.github.io/ACCScheduleManager/";

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    return json({
      error:
        "Supabase server configuration is missing.",
    }, 500);
  }

  let body: {
    cron_key?: string;
    force?: boolean;
  };

  try {
    body =
      await req.json();
  } catch {
    return json({
      error: "Invalid request body.",
    }, 400);
  }

  const admin =
    createClient(
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
    data: keyValid,
    error: keyError,
  } =
    await admin
      .rpc(
        "verify_schedule_digest_key",
        {
          p_key:
            body.cron_key ||
            "",
        },
      );

  if (
    keyError ||
    keyValid !== true
  ) {
    return json({
      error:
        "Invalid digest scheduler key.",
    }, 403);
  }

  const local =
    localParts();

  if (
    !body.force &&
    local.hour !== 18
  ) {
    return json({
      sent: 0,
      skipped: true,
      reason:
        "Outside the 6 PM America/New_York digest window.",
    });
  }

  const windowEnd =
    new Date();

  const windowStart =
    new Date(
      windowEnd.getTime() -
        24 * 60 * 60 * 1000
    );

  const {
    data: changes,
    error: changesError,
  } =
    await admin
      .from(
        "schedule_change_log"
      )
      .select(`
        id,
        changed_at,
        changed_by,
        employee_id,
        clinic_site,
        schedule_date,
        change_type,
        operation,
        old_data,
        new_data
      `)
      .gte(
        "changed_at",
        windowStart.toISOString(),
      )
      .lt(
        "changed_at",
        windowEnd.toISOString(),
      )
      .order(
        "changed_at",
        {
          ascending: true,
        },
      );

  if (
    changesError
  ) {
    return json({
      error:
        changesError.message,
    }, 500);
  }

  if (
    !changes ||
    changes.length === 0
  ) {
    return json({
      sent: 0,
      skipped: true,
      reason:
        "No schedule changes were recorded in the last 24 hours.",
    });
  }

  const employeeIds =
    Array.from(
      new Set(
        changes.map(
          change =>
            change.employee_id,
        ),
      ),
    );

  const {
    data: employeeProfiles,
    error: employeeProfilesError,
  } =
    await admin
      .from(
        "profiles"
      )
      .select(`
        id,
        first_name,
        last_name
      `)
      .in(
        "id",
        employeeIds,
      );

  if (
    employeeProfilesError
  ) {
    return json({
      error:
        employeeProfilesError.message,
    }, 500);
  }

  const employeeNameById =
    new Map(
      (
        employeeProfiles ||
        []
      ).map(
        profile => [
          profile.id,
          [
            profile.first_name,
            profile.last_name,
          ]
            .filter(Boolean)
            .join(" ")
            .trim() ||
            "Employee",
        ],
      ),
    );

  const {
    data: managers,
    error: managersError,
  } =
    await admin
      .from(
        "profiles"
      )
      .select(`
        id,
        first_name,
        last_name,
        clinic_site,
        role
      `)
      .in(
        "role",
        [
          "manager",
          "admin",
        ],
      )
      .eq(
        "active",
        true,
      );

  if (
    managersError
  ) {
    return json({
      error:
        managersError.message,
    }, 500);
  }

  if (
    !managers ||
    managers.length === 0
  ) {
    return json({
      sent: 0,
      skipped: true,
      reason:
        "There are no active Clinic Managers or Administrators.",
    });
  }

  const managerIds =
    managers.map(
      manager =>
        manager.id,
    );

  const {
    data: preferences,
    error: preferencesError,
  } =
    await admin
      .from(
        "notification_preferences"
      )
      .select(`
        user_id,
        manager_schedule_update_email_enabled,
        manager_schedule_update_email
      `)
      .in(
        "user_id",
        managerIds,
      );

  if (
    preferencesError
  ) {
    return json({
      error:
        preferencesError.message,
    }, 500);
  }

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const manager of managers) {
    const preference =
      (preferences || []).find(
        item =>
          item.user_id === manager.id,
      );

    if (
      !preference?.manager_schedule_update_email_enabled
    ) {
      skipped++;
      continue;
    }

    const isAdmin =
      manager.role === "admin";

    const clinicChanges =
      isAdmin
        ? changes
        : changes.filter(
          change =>
            change.clinic_site === manager.clinic_site,
        );

    if (
      clinicChanges.length === 0
    ) {
      skipped++;
      continue;
    }

    const digestScope =
      isAdmin
        ? "all-clinics"
        : manager.clinic_site;

    const digestKey =
      `${local.dateKey}:${digestScope}`;

    const {
      data: priorDigest,
      error: priorDigestError,
    } =
      await admin
        .from("notification_log")
        .select("id")
        .eq("user_id", manager.id)
        .eq("event_type", "manager_daily_digest")
        .eq("status", "sent")
        .contains("metadata", {
          digest_key: digestKey,
        })
        .limit(1);

    if (priorDigestError) {
      failures.push(`${manager.id}: ${priorDigestError.message}`);
      continue;
    }

    if (priorDigest?.length) {
      skipped++;
      continue;
    }

    if (!resendApiKey || !fromEmail) {
      failures.push(`${manager.id}: email service is not configured`);
      continue;
    }

    const {
      data: authUserData,
      error: authUserError,
    } =
      await admin.auth.admin.getUserById(manager.id);

    if (authUserError || !authUserData?.user) {
      failures.push(`${manager.id}: unable to resolve login email`);
      continue;
    }

    const recipient =
      preference.manager_schedule_update_email?.trim() ||
      authUserData.user.email;

    if (!recipient) {
      failures.push(`${manager.id}: no email address available`);
      continue;
    }

    const managerName =
      [manager.first_name, manager.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
      (isAdmin ? "Administrator" : "Clinic Manager");

    const rows =
      clinicChanges.map(change => {
        const employeeName =
          employeeNameById.get(change.employee_id) ||
          "Employee";

        let detail = "";

        if (change.change_type === "schedule") {
          detail =
            `${scheduleDescription(change.old_data)} → ${scheduleDescription(change.new_data)}`;
        } else if (change.change_type === "leave") {
          detail =
            `${leaveDescription(change.old_data)} → ${leaveDescription(change.new_data)}`;
        } else if (change.change_type === "comment") {
          detail =
            change.operation === "DELETE"
              ? "Comment removed"
              : change.operation === "INSERT"
              ? "Comment added"
              : "Comment updated";
        }

        const changedAt =
          new Date(change.changed_at)
          .toLocaleTimeString(
            "en-US",
            {
              timeZone: "America/New_York",
              hour: "numeric",
              minute: "2-digit",
            },
          );

        return `
          <tr>
            <td style="padding:7px;border-bottom:1px solid #e5e7eb;">${escapeHtml(changedAt)}</td>
            <td style="padding:7px;border-bottom:1px solid #e5e7eb;">${escapeHtml(employeeName)}</td>
            <td style="padding:7px;border-bottom:1px solid #e5e7eb;">${escapeHtml(change.clinic_site || "")}</td>
            <td style="padding:7px;border-bottom:1px solid #e5e7eb;">${escapeHtml(change.schedule_date)}</td>
            <td style="padding:7px;border-bottom:1px solid #e5e7eb;">${escapeHtml(change.change_type)}</td>
            <td style="padding:7px;border-bottom:1px solid #e5e7eb;">${escapeHtml(detail)}</td>
          </tr>
        `;
      }).join("");

    const digestLabel =
      isAdmin
        ? "All Clinics"
        : manager.clinic_site;

    const subject =
      `ACC daily schedule updates — ${digestLabel}`;

    const html = `
          <div style="font-family:Arial,sans-serif;line-height:1.45;color:#1f2937;">
          <h2 style="color:#17365d;margin-bottom:8px;">Daily schedule update summary</h2>
          <p>Hello ${escapeHtml(managerName)},</p>
          <p>
            There ${clinicChanges.length === 1 ? "was" : "were"}
            <strong>${clinicChanges.length}</strong>
            recorded schedule ${clinicChanges.length === 1 ? "change" : "changes"}
          ${isAdmin
            ? "across <strong>both clinics</strong>"
            : `for <strong>${escapeHtml(manager.clinic_site)}</strong>`
          }

            during the last 24 hours.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;text-align:left;">
              <th style="padding:7px;">Time</th>
              <th style="padding:7px;">Employee</th>
              <th style="padding:7px;">Clinic</th>
              <th style="padding:7px;">Schedule Date</th>
              <th style="padding:7px;">Type</th>
              <th style="padding:7px;">Change</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          </table>
          <p style="margin:24px 0;">
            <a href="${siteUrl}" style="display:inline-block;background:#17365d;color:white;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold;">View ACC Schedule</a>
          </p>
          <p style="font-size:12px;color:#6b7280;">
            You received this daily summary because schedule-update notifications are enabled in Account → Notifications. You can opt out at any time.
          </p>
          </div>
    `;

    const resendResponse =
      await fetch(
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

    const resendBody =
      await resendResponse.json().catch(() => ({}));

    if (!resendResponse.ok) {
      const message =
        resendBody?.message ||
        resendBody?.error ||
        `Resend HTTP ${resendResponse.status}`;

      failures.push(`${manager.id}: ${message}`);

      await admin.from("notification_log").insert({
        user_id: manager.id,
        event_type: "manager_daily_digest",
        channel: "email",
        recipient,
        status: "failed",
        error_message: message,
        metadata: {
          digest_key: digestKey,
          clinic_site: isAdmin ? "All Clinics" : manager.clinic_site,
          change_count: clinicChanges.length,
        },
      });

      continue;
    }

    await admin.from("notification_log").insert({
      user_id: manager.id,
      event_type: "manager_daily_digest",
      channel: "email",
      recipient,
      status: "sent",
      provider_message_id:
        typeof resendBody?.id === "string"
          ? resendBody.id
          : null,
      metadata: {
        digest_key: digestKey,
        clinic_site: isAdmin ? "All Clinics" : manager.clinic_site,
        change_count: clinicChanges.length,
      },
    });

    sent++;
  }

  return json({
    sent,
    skipped,
    failures,
    change_count: changes.length,
    digest_date: local.dateKey,
  });
});
