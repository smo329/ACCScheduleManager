-- ACC Schedule Manager
-- Daily clinic-manager schedule change digest.
-- Applied to production on 2026-08-14.
-- Source-of-truth migration is tracked in Supabase migrations.

-- This file documents the production migration that:
-- 1. allows profiles.role = 'manager'
-- 2. creates public.schedule_change_log
-- 3. adds database triggers for schedules, leave, and comments
-- 4. creates a secure cron key verifier
-- 5. enables pg_net + pg_cron
-- 6. invokes send-manager-daily-digest hourly; the function sends only at 6 PM America/New_York.

-- The full migration was applied through Supabase migration tooling.
