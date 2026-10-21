# Supabase backend inventory — ACC Schedule

- Project: ACC Schedule, ref `jtxndcvsnnnzfixpbeff`, ca-central-1, NANO, PRODUCTION
- Captured: 2026-10-21, read-only, from the Supabase dashboard SQL Editor and Edge Functions pages
- No changes were made in Supabase. No secret values, API keys, service-role keys, password hashes, salts, or stored key values are in this file.
- Status: INVENTORY ONLY, not a full restore script. It records tables, columns, keys, RLS policies, and function definitions as observed, plus the Edge Functions list and code viewability. The actual Edge Function source files are a separate step (see below).
- UPDATE 2026-10-21: all 9 missing Edge Function sources have now been copied verbatim and saved under `supabase/functions/` in this repo (create-user, login-with-username, manage-user, request-account-access, resend-config-check, send-manager-daily-digest, send-manager-schedule-update, update-my-file [displayed as update-my-profile], update-username), with line counts verified against the dashboard. This inventory file plus those 9 function files together form the backend backup; still not pushed to GitHub as of this update.
- Gaps (see end): check constraints were not included; trigger bindings (which table/event each trigger function is attached to) were not captured; one line in `private.log_comment_change()` was truncated in the dashboard view and is summarized, not quoted verbatim.

## Tables — 23 total (1 private, 22 public), each with a primary key

- `private.schedule_digest_config`: id boolean NOT NULL DEFAULT true; cron_key text NOT NULL. PK (id). No data values queried.
- `public.account_access_requests`: id uuid NOT NULL DEFAULT gen_random_uuid(); first_name text NOT NULL; last_name text NOT NULL; email text NOT NULL; status text NOT NULL DEFAULT 'pending'; requested_at timestamptz NOT NULL DEFAULT now(); reviewed_at timestamptz; reviewed_by uuid; notes text. PK (id); FK reviewed_by → profiles(id) ON DELETE SET NULL.
- `public.clinic_capacity`: id uuid NOT NULL DEFAULT gen_random_uuid(); clinic_site text NOT NULL; capacity_date date NOT NULL; shift_capacity integer NOT NULL DEFAULT 0; created_at timestamptz NOT NULL DEFAULT now(); updated_at timestamptz NOT NULL DEFAULT now(). PK (id); UNIQUE (clinic_site, capacity_date).
- `public.employment_periods`: id uuid NOT NULL DEFAULT gen_random_uuid(); user_id uuid NOT NULL; start_date date NOT NULL; end_date date; created_at/updated_at timestamptz NOT NULL DEFAULT now(). PK (id); FK user_id → profiles(id) ON DELETE CASCADE.
- `public.issue_snapshot_acknowledgements`: user_id uuid NOT NULL; period_id uuid NOT NULL; fingerprint text NOT NULL; acknowledged_at timestamptz NOT NULL DEFAULT now(). PK (user_id, period_id); FK period_id → scheduling_periods(id) ON DELETE CASCADE; FK user_id → profiles(id) ON DELETE CASCADE.
- `public.notification_log`: id uuid NOT NULL DEFAULT gen_random_uuid(); user_id uuid NOT NULL; period_id uuid; event_type text NOT NULL; channel text NOT NULL DEFAULT 'email'; recipient text; status text NOT NULL; provider_message_id text; error_message text; created_at timestamptz NOT NULL DEFAULT now(); metadata jsonb NOT NULL DEFAULT '{}'; read_at timestamptz. PK (id); FK period_id → scheduling_periods(id) ON DELETE SET NULL; FK user_id → profiles(id) ON DELETE CASCADE.
- `public.notification_preferences`: user_id uuid NOT NULL; schedule_open_email_enabled boolean NOT NULL DEFAULT false; schedule_open_email text; updated_at timestamptz NOT NULL DEFAULT now(); manager_schedule_update_email_enabled boolean NOT NULL DEFAULT false; manager_schedule_update_email text. PK (user_id); FK user_id → profiles(id) ON DELETE CASCADE.
- `public.open_shift_claims`: id uuid NOT NULL DEFAULT gen_random_uuid(); opportunity_id uuid NOT NULL; user_id uuid NOT NULL; start_hour integer NOT NULL; end_hour integer NOT NULL; created_at/updated_at timestamptz NOT NULL DEFAULT now(). PK (id); FK opportunity_id → open_shift_opportunities(id) ON DELETE CASCADE; FK user_id → auth.users(id) ON DELETE CASCADE.
- `public.open_shift_opportunities`: id uuid NOT NULL DEFAULT gen_random_uuid(); period_id uuid NOT NULL; shift_date date NOT NULL; clinic_site text NOT NULL; slot_number integer NOT NULL DEFAULT 1; start_hour integer NOT NULL DEFAULT 8; end_hour integer NOT NULL DEFAULT 20; status text NOT NULL DEFAULT 'published'; created_by uuid; created_at/updated_at timestamptz NOT NULL DEFAULT now(). PK (id); FK created_by → auth.users(id) ON DELETE SET NULL; FK period_id → scheduling_periods(id) ON DELETE CASCADE.
- `public.password_recovery_settings`: user_id uuid NOT NULL; security_question text NOT NULL; answer_salt text NOT NULL; answer_hash text NOT NULL; failed_attempts integer NOT NULL DEFAULT 0; locked_until timestamptz; updated_at timestamptz NOT NULL DEFAULT now(). PK (user_id); FK user_id → auth.users(id) ON DELETE CASCADE. Column names/types/defaults only — no salt or hash values.
- `public.profiles`: id uuid NOT NULL; first_name text NOT NULL; last_name text NOT NULL; role text NOT NULL DEFAULT 'employee'; active boolean NOT NULL DEFAULT true; created_at/updated_at timestamptz NOT NULL DEFAULT now(); clinic_site text; username text NOT NULL. PK (id); FK id → auth.users(id) ON DELETE CASCADE.
- `public.schedule_archive_index`: id uuid NOT NULL DEFAULT gen_random_uuid(); period_id uuid; quarter_name text NOT NULL; period_start date NOT NULL; period_end date NOT NULL; file_name text NOT NULL; archive_format text NOT NULL DEFAULT 'acc-schedule-archive-v1'; status text NOT NULL DEFAULT 'exported'; record_counts jsonb NOT NULL DEFAULT '{}'; archived_by uuid NOT NULL; archived_at timestamptz NOT NULL DEFAULT now(); live_data_removed_at timestamptz; notes text; created_at/updated_at timestamptz NOT NULL DEFAULT now(). PK (id); FK archived_by → profiles(id) (default NO ACTION); FK period_id → scheduling_periods(id) ON DELETE SET NULL.
- `public.schedule_audit_log`: id uuid NOT NULL DEFAULT gen_random_uuid(); actor_user_id uuid; target_user_id uuid NOT NULL; schedule_date date NOT NULL; action text NOT NULL; old_schedule_code text; new_schedule_code text; old_work_site text; new_work_site text; changed_at timestamptz NOT NULL DEFAULT now(). PK (id); FK actor_user_id → auth.users(id) ON DELETE SET NULL; FK target_user_id → auth.users(id) ON DELETE CASCADE.
- `public.schedule_change_log`: id bigint NOT NULL; changed_at timestamptz NOT NULL DEFAULT now(); changed_by uuid; employee_id uuid NOT NULL; clinic_site text; schedule_date date NOT NULL; change_type text NOT NULL; operation text NOT NULL; old_data jsonb; new_data jsonb. PK (id); FK employee_id → profiles(id) ON DELETE CASCADE. No FK listed for changed_by.
- `public.schedule_comments`: id uuid NOT NULL DEFAULT gen_random_uuid(); user_id uuid NOT NULL; schedule_date date NOT NULL; comment text NOT NULL; created_at/updated_at timestamptz NOT NULL DEFAULT now(). PK (id); FK user_id → profiles(id) ON DELETE CASCADE.
- `public.schedule_leave_hours`: id uuid NOT NULL DEFAULT gen_random_uuid(); user_id uuid NOT NULL; leave_date date NOT NULL; vacation_hours integer NOT NULL DEFAULT 0; professional_leave_hours integer NOT NULL DEFAULT 0; tdl_hours integer NOT NULL DEFAULT 0; updated_at timestamptz NOT NULL DEFAULT now(). PK (id); FK user_id → profiles(id) ON DELETE CASCADE.
- `public.schedules`: id uuid NOT NULL DEFAULT gen_random_uuid(); user_id uuid NOT NULL; schedule_date date NOT NULL; schedule_code text NOT NULL DEFAULT '0'; created_at/updated_at timestamptz NOT NULL DEFAULT now(); work_site text. PK (id); FK user_id → profiles(id) ON DELETE CASCADE.
- `public.scheduling_known_leave`: id uuid NOT NULL DEFAULT gen_random_uuid(); period_id uuid NOT NULL; user_id uuid NOT NULL; leave_date date NOT NULL; leave_type text NOT NULL; hours integer NOT NULL; notes text; created_by uuid; created_at/updated_at timestamptz NOT NULL DEFAULT now(). PK (id); FK created_by → profiles(id) (no ON DELETE action shown); FK period_id → scheduling_periods(id) ON DELETE CASCADE; FK user_id → profiles(id) ON DELETE CASCADE.
- `public.scheduling_month_weekend_targets`: id uuid NOT NULL DEFAULT gen_random_uuid(); period_id uuid NOT NULL; user_id uuid NOT NULL; month_key text NOT NULL; target integer NOT NULL DEFAULT 3; updated_at timestamptz NOT NULL DEFAULT now(). PK (id); FK period_id → scheduling_periods(id) ON DELETE CASCADE; FK user_id → profiles(id) ON DELETE CASCADE; UNIQUE (period_id, user_id, month_key).
- `public.scheduling_period_access`: id uuid NOT NULL DEFAULT gen_random_uuid(); period_id uuid NOT NULL; user_id uuid NOT NULL; is_open boolean NOT NULL DEFAULT false; opened_at timestamptz; closed_at timestamptz; updated_at timestamptz NOT NULL DEFAULT now(); weekend_target_override integer. PK (id); FK period_id → scheduling_periods(id) ON DELETE CASCADE; FK user_id → profiles(id) ON DELETE CASCADE; UNIQUE (period_id, user_id).
- `public.scheduling_periods`: id uuid NOT NULL DEFAULT gen_random_uuid(); name text NOT NULL; period_start date NOT NULL; period_end date NOT NULL; weekend_target integer NOT NULL DEFAULT 3; active boolean NOT NULL DEFAULT true; created_at/updated_at timestamptz NOT NULL DEFAULT now(). PK (id); UNIQUE (period_start, period_end).
- `public.week_submissions`: id uuid NOT NULL DEFAULT gen_random_uuid(); user_id uuid NOT NULL; week_start date NOT NULL; status text NOT NULL; submitted_at timestamptz; updated_at timestamptz NOT NULL DEFAULT now(). PK (id); FK user_id → profiles(id) ON DELETE CASCADE; UNIQUE (user_id, week_start).
- `public.weekly_locks`: week_start date NOT NULL; locked boolean NOT NULL DEFAULT false; locked_at timestamptz; locked_by uuid; updated_at timestamptz NOT NULL DEFAULT now(). PK (week_start); FK locked_by → profiles(id) ON DELETE SET NULL.

## Functions — 20 total (9 private, 11 public)

Private:
- `private.is_admin()` → boolean — SQL, STABLE, SECURITY DEFINER, search_path 'public': exists profile with id = auth.uid(), role 'admin', active true.
- `private.is_employee()` — same, role 'employee'.
- `private.is_manager()` — same, role 'manager'.
- `private.user_employed_on_date(p_user_id uuid, p_date date)` → boolean — SQL, STABLE, SECURITY DEFINER: exists employment_periods where user_id = p_user_id and start_date <= p_date and (end_date is null or end_date >= p_date).
- `private.user_has_scheduling_access(p_user_id uuid, p_schedule_date date)` → boolean — SQL, STABLE, SECURITY DEFINER: if no active scheduling_period covers p_schedule_date, true; else exists scheduling_period_access for that user/period with is_open true.
- `private.week_is_locked(p_schedule_date date)` → boolean — SQL, STABLE, SECURITY DEFINER: exists weekly_locks where week_start = p_schedule_date minus its day-of-week and locked true.
- `private.log_schedule_change()` → trigger, plpgsql, SECURITY DEFINER: logs schedule_code/work_site old/new into public.schedule_change_log, change_type 'schedule'; clinic = work_site when schedule_code = '12', else profile clinic_site; skips logging on UPDATE when old and new are not distinct; returns OLD on DELETE, else NEW.
- `private.log_leave_change()` → trigger, plpgsql, SECURITY DEFINER: logs vacation_hours/professional_leave_hours/tdl_hours old/new into schedule_change_log, change_type 'leave'; skips no-change UPDATEs.
- `private.log_comment_change()` → trigger, plpgsql, SECURITY DEFINER: logs comment presence old/new into schedule_change_log, change_type 'comment', changed_by = auth.uid(). One long old_data line was truncated in the dashboard view — summarized here, not quoted verbatim.

Public:
- `public.is_active_admin(uid uuid)` → boolean — SQL, STABLE, SECURITY DEFINER: exists profile id = uid, active true, role 'admin'.
- `public.verify_schedule_digest_key(p_key text)` → boolean — SQL, STABLE, SECURITY DEFINER: exists private.schedule_digest_config where id = true and cron_key = p_key. No stored key value queried or recorded.
- `public.update_my_profile(p_first_name text, p_last_name text)` → void — plpgsql, SECURITY DEFINER: requires auth, trims inputs, requires first/last non-empty and ≤100 chars, updates profiles where id = auth.uid() and active true; raises 'Active profile not found' if no row updated.
- `public.delete_scheduling_period_and_data(p_period_id uuid)` → jsonb — plpgsql, SECURITY DEFINER, search_path 'public': requires private.is_admin(), else raises 'Only administrators can delete scheduling periods'; deletes, in period range, schedule_comments, schedule_leave_hours, schedules, week_submissions, weekly_locks, clinic_capacity, then the scheduling_periods row; returns success/name/period_start/period_end. NOTE: the body does not explicitly delete scheduling_period_access, scheduling_month_weekend_targets, or scheduling_known_leave rows.
- `public.audit_schedule_change()` → trigger, plpgsql, SECURITY DEFINER: INSERT/UPDATE/DELETE into schedule_audit_log with actor, target, date, action, old/new code and work_site.
- `public.notify_additional_shift_published()` → trigger: on published open_shift_opportunities insert/update, inserts in_app 'additional_shift_added' notification_log rows for active employee/external profiles.
- `public.notify_admins_when_quarter_completed()` → trigger: on week_submissions status 'submitted', when submitted weeks equal expected weeks for the period ((period_end - period_start)/7 + 1), inserts in_app 'quarter_completed' rows for active admins, de-duplicated by existing log row for that employee/period.
- `public.notify_leadership_open_shift_claimed()` → trigger: on open_shift_claims insert, inserts in_app 'open_shift_claimed' rows for active admin/manager profiles.
- `public.notify_schedule_access_opened()` → trigger: on scheduling_period_access is_open turning true, inserts in_app 'schedule_opened' for employee profiles, de-duplicated.
- `public.release_known_leave_on_employee_edit()` → trigger: on leave edit by the same user, deletes scheduling_known_leave rows for that user/date where a scheduling_period_access row is open.
- `public.validate_open_shift_claim()` → trigger: advisory lock on opportunity, requires published status, hours within the published window, at least 2 hours, active employee profile, and no overlapping claim. NOTE: this allows role 'employee' only, while the open_shift_claims RLS insert policy allows 'employee' or 'external' — a difference to reconcile, not an assumed bug.

## RLS policies — 74 total, all PERMISSIVE, roles {authenticated} unless noted

Counts by table (all public; no private-schema policies returned): account_access_requests 2; clinic_capacity 4; employment_periods 2; issue_snapshot_acknowledgements 3; notification_log 3; notification_preferences 4; open_shift_claims 4; open_shift_opportunities 2; profiles 4; schedule_archive_index 4; schedule_audit_log 1; schedule_comments 7; schedule_leave_hours 6; schedules 7; scheduling_known_leave 4; scheduling_month_weekend_targets 3; scheduling_period_access 3; scheduling_periods 2; week_submissions 7; weekly_locks 2.
Public tables with NO policies: password_recovery_settings and schedule_change_log.

Pattern: admin policies generally use `private.is_admin()`; self policies use `auth.uid() = user_id` (or id for profiles); view policies for schedules/comments/capacity/periods/locks are often `true` for authenticated users. DELETE policies on schedules/comments/leave_hours/week_submissions use a shorter check than INSERT/UPDATE — the `user_employed_on_date` term is absent from DELETE, and week_submissions DELETE also lacks `user_has_scheduling_access`.

Full policy list (name — command — USING / WITH CHECK):
- account_access_requests: "Admins can update account access requests" — UPDATE — is_admin / is_admin; "Admins can view account access requests" — SELECT — is_admin / —.
- clinic_capacity: "Admins can delete clinic capacity" — DELETE — is_admin / —; "Admins can insert clinic capacity" — INSERT — — / is_admin; "Admins can update clinic capacity" — UPDATE — is_admin / is_admin; "Authenticated users can view clinic capacity" — SELECT — true / —.
- employment_periods: "Admins can manage employment periods" — ALL — is_admin / is_admin; "Authenticated users can view employment periods" — SELECT — true / —.
- issue_snapshot_acknowledgements: "issue_ack_self_insert" — INSERT — — / user_id = auth.uid(); "issue_ack_self_read" — SELECT — user_id = auth.uid() / —; "issue_ack_self_update" — UPDATE — user_id = auth.uid() / user_id = auth.uid().
- notification_log: "Admins can view notification log" — SELECT — is_admin / —; "Users can update their own in-app notifications" — UPDATE — auth.uid() = user_id AND channel = 'in_app' / same; "Users can view their own notification log" — SELECT — auth.uid() = user_id / —.
- notification_preferences: "Admins can view notification preferences" — SELECT — is_admin / —; "Users can insert their own notification preferences" — INSERT — — / auth.uid() = user_id; "Users can update their own notification preferences" — UPDATE — auth.uid() = user_id / same; "Users can view their own notification preferences" — SELECT — auth.uid() = user_id / —.
- open_shift_claims: "admins update claims" — UPDATE — is_active_admin(auth.uid()) / same; "eligible users cancel own claims" — DELETE — (user_id = auth.uid() AND exists active employee/external profile) OR is_active_admin / —; "eligible users claim own open shifts" — INSERT — — / user_id = auth.uid() AND exists active employee/external profile; "read open shift claims" — SELECT — exists published opportunity for the claim OR is_active_admin / —.
- open_shift_opportunities: "admins manage open shifts" — ALL — is_active_admin / same; "read open shifts" — SELECT — status = 'published' OR is_active_admin / —.
- profiles: "Admins can update all profiles" — UPDATE — is_admin / is_admin; "Admins can view all profiles" — SELECT — is_admin / —; "Authenticated users can view profiles" — SELECT — true / —; "Users can view their own profile" — SELECT — auth.uid() = id / —.
- schedule_archive_index (roles {public}, the exception): "admins delete schedule archive index" — DELETE — is_active_admin / —; "admins insert schedule archive index" — INSERT — — / is_active_admin AND archived_by = auth.uid(); "admins read schedule archive index" — SELECT — is_active_admin / —; "admins update schedule archive index" — UPDATE — is_active_admin / same.
- schedule_audit_log: "Admins can read schedule audit log" — SELECT — exists active admin profile for auth.uid() / —.
- schedule_comments: admin delete/insert/update — is_admin as above; "Authenticated users can view comments" — SELECT — true; self delete — is_employee, own user_id, NOT week_is_locked, user_has_scheduling_access (no employed_on_date); self insert/update — is_employee, own user_id, user_employed_on_date, NOT week_is_locked, user_has_scheduling_access.
- schedule_leave_hours: "Admins can manage all leave hours" — ALL — is_admin / is_admin; "Admins can view all leave hours" — SELECT — is_admin; "Managers can view all leave hours" — SELECT — is_manager; self insert/update/view — same 5-conjunct pattern as schedules, view = own user_id.
- schedules: admin delete/insert/update — is_admin as above; "Authenticated users can view schedules" — SELECT — true; self delete — is_employee, own user_id, NOT week_is_locked, user_has_scheduling_access (no employed_on_date); self insert/update — is_employee, own user_id, user_employed_on_date, NOT week_is_locked, user_has_scheduling_access.
- scheduling_known_leave: "known_leave_admin_delete/insert/update" — admin exists (role admin, active true) pattern; "known_leave_read_authenticated" — SELECT — true.
- scheduling_month_weekend_targets: "Admins can manage monthly weekend targets" — ALL — is_admin / is_admin; "Admins can view all monthly weekend targets" — SELECT — is_admin; "Users can view their own monthly weekend targets" — SELECT — auth.uid() = user_id.
- scheduling_period_access: "Admins can manage scheduling access" — ALL — is_admin / is_admin; "Admins can view all scheduling access" — SELECT — is_admin; "Users can view own scheduling access" — SELECT — auth.uid() = user_id.
- scheduling_periods: "Admins can manage scheduling periods" — ALL — is_admin / is_admin; "Authenticated users can view scheduling periods" — SELECT — true.
- week_submissions: admin manage/view — is_admin; "Managers can view week submissions" — SELECT — is_manager; self delete — is_employee, own user_id, NOT week_is_locked (no access, no employed_on_date); self insert/update — is_employee, own user_id, NOT week_is_locked, user_has_scheduling_access (no employed_on_date); self view — auth.uid() = user_id.
- weekly_locks: "Admins can manage week locks" — ALL — is_admin / is_admin; "Authenticated users can view week locks" — SELECT — true.

## Edge Functions — 11 total, 9 not in the repo

All created/updated about 2 months ago (as shown in the dashboard list). The 2 already in the repo are password-recovery and send-schedule-open-notification (by elimination from the repo contents — not re-verified file-by-file in this phase).
The 9 not in the repo, each a single index.ts in the dashboard Code tab, code viewable:
- create-user — 78 lines
- login-with-username — 107 lines
- manage-user — 130 lines
- request-account-access — ~180 lines
- resend-config-check — 1 line (a stub)
- send-manager-daily-digest — 668 lines
- send-manager-schedule-update — 287 lines
- update-my-profile — 222 lines
- update-username — 85 lines

IMPORTANT slug discrepancy: the deployed function displayed as "update-my-profile" has dashboard slug / invoke URL `update-my-file` (https://jtxndcvsnnnzfixpbeff.supabase.co/functions/v1/update-my-file). The direct /functions/update-my-profile/code route bounces back to the list with "Edge function cannot be found in your project"; opening it from the functions list reaches its code at /functions/update-my-file/code.

## Gaps to close for a full restore

- Edge Function source code itself (not yet copied into the repo — next step).
- Check constraints (not included in the tables query).
- Trigger bindings: which table/event each trigger function is attached to.
- The truncated line in private.log_comment_change().
- Whether RLS is actually enabled per table (policies listed, enablement not separately confirmed in this inventory).
- pg_cron / pg_net jobs, including the manager daily digest schedule (the repo's manager_daily_schedule_digest.sql documents a migration, but live cron jobs were not inventoried here).
- Auth configuration, storage buckets, and any other Supabase settings outside the database/Edge Functions.
