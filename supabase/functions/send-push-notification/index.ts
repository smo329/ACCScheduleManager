// ACC Schedule Manager — Web Push sender for the installed app.
// Modes:
// - { mode: "notify", notification_log_id, key } — called by the
//   notify_push_on_log_insert trigger (async pg_net). Sends a push for
//   that notification_log row to every subscribed device of the recipient.
//   Message pushes arrive the same way: the notify_push_on_admin_message
//   trigger inserts a notification_log row (admin_message /
//   admin_message_reply) for each message recipient, which fires the same
//   log trigger — the message itself never shows in the bell's system
//   notifications, only in "Messages for You".
// - { mode: "test" } — called by the signed-in user from the Mobile tab.
//   Sends a test push to their own subscribed devices.
// VAPID keys come from Supabase secrets: VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:ukhcfammed@gmail.com).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://acc-schedule-manager.pages.dev/";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function fmtDate(value: unknown): string {
  const s = String(value || "");
  if (!s) return "";
  const d = new Date(s.length === 10 ? s + "T12:00:00" : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const HOLIDAY_NAMES: Record<string, string> = {
  new_years_day: "New Year's Day",
  mlk: "MLK Day",
  easter: "Easter",
  mothers_day: "Mother's Day",
  memorial_day: "Memorial Day",
  fathers_day: "Father's Day",
  july_4: "4th of July",
  labor_day: "Labor Day",
  halloween: "Halloween",
  black_friday: "Black Friday",
  christmas_eve: "Christmas Eve",
  new_years_eve: "New Year's Eve",
};

function renderPush(
  eventType: string,
  meta: Record<string, unknown>,
): { title: string; body: string } {
  const from = (meta.from_name as string) || "Someone";
  const to = (meta.to_name as string) || "Someone";
  switch (eventType) {
    case "schedule_opened":
      return {
        title: "Your schedule is open",
        body: `You can now make schedule selections for ${(meta.quarter_name as string) || "the scheduling quarter"}.`,
      };
    case "trade_requested": {
      if (meta.trade_type === "critical_labs") {
        return {
          title: `New trade request from ${from}`,
          body: `${from} wants to swap Provider On Call coverage: their ${fmtDate(meta.to_week_start)} week for your ${fmtDate(meta.from_week_start)} week.`,
        };
      }
      return {
        title: `New trade request from ${from}`,
        body: `${from} wants to swap shifts: their ${fmtDate(meta.from_date)} for your ${fmtDate(meta.to_date)}.`,
      };
    }
    case "trade_accepted": {
      if (meta.trade_type === "critical_labs") {
        return {
          title: "Trade accepted",
          body: `Provider On Call coverage was swapped: ${from} now covers the ${fmtDate(meta.to_week_start)} week and ${to} covers the ${fmtDate(meta.from_week_start)} week.`,
        };
      }
      return {
        title: "Trade accepted",
        body: `A shift swap was accepted: ${from} and ${to} swapped ${fmtDate(meta.from_date)} and ${fmtDate(meta.to_date)}.`,
      };
    }
    case "trade_declined":
      return { title: "Trade declined", body: `${to} declined your trade request.` };
    case "holiday_trade_requested": {
      const mine = HOLIDAY_NAMES[String(meta.to_holiday_key || "")] || String(meta.to_holiday_key || "");
      const theirs = HOLIDAY_NAMES[String(meta.from_holiday_key || "")] || String(meta.from_holiday_key || "");
      return {
        title: `New holiday trade request from ${from}`,
        body: `${from} wants to swap holidays: their ${theirs} for your ${mine}.`,
      };
    }
    case "holiday_trade_accepted": {
      const mine = HOLIDAY_NAMES[String(meta.to_holiday_key || "")] || String(meta.to_holiday_key || "");
      const theirs = HOLIDAY_NAMES[String(meta.from_holiday_key || "")] || String(meta.from_holiday_key || "");
      return {
        title: "Holiday trade accepted",
        body: `Your holiday trade was accepted: ${from}'s ${theirs} for ${to}'s ${mine}.`,
      };
    }
    case "holiday_trade_declined":
      return { title: "Holiday trade declined", body: `${to} declined your holiday trade request.` };
    case "additional_shift_added":
      return {
        title: "New additional shift",
        body: `${(meta.clinic_site as string) || "A clinic"} on ${fmtDate(meta.shift_date)} — open for signup.`,
      };
    case "quarter_access_moved":
      return {
        title: "Schedule access moved",
        body: `${(meta.holder_name as string) || "Someone"} is now picking for ${(meta.quarter_name as string) || "the scheduling quarter"}.`,
      };
    case "schedule_changed":
      return {
        title: "Schedule changes today",
        body: "Changes were made to a schedule. Open History to review.",
      };
    case "quarter_completed":
      return {
        title: "Quarter complete",
        body: `Scheduling is complete for ${(meta.quarter_name as string) || "the quarter"}.`,
      };
    case "open_shift_claimed":
      return {
        title: "Additional shift claimed",
        body: `${from} signed up for an additional shift.`,
      };
    case "admin_message":
      return {
        title: `New message from ${(meta.sender_name as string) || "Someone"}`,
        body: (meta.message_preview as string) || "You have a new message. Open the app to read it.",
      };
    case "admin_message_reply":
      return {
        title: `Reply from ${(meta.sender_name as string) || "Someone"}`,
        body: (meta.message_preview as string) || "Someone replied to your message. Open the app to read it.",
      };
    default:
      return {
        title: "ACC Schedule Manager",
        body: "You have a new notification. Open the app to review.",
      };
  }
}

async function sendToUser(admin: any, userId: string, title: string, body: string) {
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) return { sent: 0, failed: 0, removed: 0, total: 0, error: error.message };
  const total = (subs || []).length;
  let sent = 0, failed = 0, removed = 0;
  const payload = JSON.stringify({ title, body, url: SITE_URL });
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent++;
    } catch (e) {
      failed++;
      // 410 Gone / 404 Not Found: the subscription is dead — drop it.
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 410 || status === 404) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
        removed++;
      }
    }
  }
  return { sent, failed, removed, total };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || "");

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:ukhcfammed@gmail.com";
    if (!vapidPublic || !vapidPrivate) {
      return json({ error: "Push notifications are not configured (VAPID keys missing)." }, 500);
    }
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    if (mode === "test") {
      // Signed-in user only: the app invokes with the user's JWT.
      const header = req.headers.get("Authorization") || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!token) return json({ error: "Not authenticated" }, 401);
      const { data } = await admin.auth.getUser(token);
      const userId = data?.user?.id;
      if (!userId) return json({ error: "Invalid login" }, 401);
      const result = await sendToUser(admin, userId, "ACC Schedule Manager", "Test notification — push is working on this device.");
      if (result.total === 0) {
        return json({ error: "This device isn't subscribed for push yet. Turn on push notifications first.", ...result }, 400);
      }
      if (result.sent === 0) {
        return json({ error: "No devices received the test. Try turning push off and on again.", ...result }, 400);
      }
      return json({ success: true, ...result });
    }

    if (mode === "notify") {
      const key = String(body.key || "");
      if (!key) return json({ error: "key is required." }, 400);
      const { data: ok } = await admin.rpc("verify_push_notify_key", { p_key: key });
      if (!ok) return json({ error: "Invalid key." }, 403);
      const logId = String(body.notification_log_id || "");
      if (!logId) return json({ error: "notification_log_id is required." }, 400);
      const { data: log, error } = await admin
        .from("notification_log")
        .select("id, user_id, event_type, metadata")
        .eq("id", logId)
        .single();
      if (error || !log) return json({ error: "Notification not found." }, 404);
      const { title, body: text } = renderPush(log.event_type as string, (log.metadata as Record<string, unknown>) || {});
      const result = await sendToUser(admin, log.user_id as string, title, text);
      return json({ success: true, ...result });
    }

    return json({ error: "Unknown mode" }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});
