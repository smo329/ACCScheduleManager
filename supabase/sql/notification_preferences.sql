-- ACC Schedule Manager
-- Opt-in email notifications when quarter scheduling access is opened.
-- Run in Supabase SQL Editor as postgres.

create table if not exists public.notification_preferences (
    user_id uuid primary key
        references public.profiles(id)
        on delete cascade,

    schedule_open_email_enabled boolean not null
        default false,

    -- NULL means: use the user's current Supabase Auth/login email.
    schedule_open_email text null,

    updated_at timestamptz not null
        default now(),

    constraint notification_preferences_email_format
        check (
            schedule_open_email is null
            or schedule_open_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        )
);

alter table public.notification_preferences
enable row level security;

drop policy if exists
"Users can view their own notification preferences"
on public.notification_preferences;

create policy
"Users can view their own notification preferences"
on public.notification_preferences
for select
to authenticated
using (
    (select auth.uid()) = user_id
);

drop policy if exists
"Users can insert their own notification preferences"
on public.notification_preferences;

create policy
"Users can insert their own notification preferences"
on public.notification_preferences
for insert
to authenticated
with check (
    (select auth.uid()) = user_id
);

drop policy if exists
"Users can update their own notification preferences"
on public.notification_preferences;

create policy
"Users can update their own notification preferences"
on public.notification_preferences
for update
to authenticated
using (
    (select auth.uid()) = user_id
)
with check (
    (select auth.uid()) = user_id
);

drop policy if exists
"Admins can view notification preferences"
on public.notification_preferences;

create policy
"Admins can view notification preferences"
on public.notification_preferences
for select
to authenticated
using (
    (select private.is_admin())
);


create table if not exists public.notification_log (
    id uuid primary key
        default gen_random_uuid(),

    user_id uuid not null
        references public.profiles(id)
        on delete cascade,

    period_id uuid null
        references public.scheduling_periods(id)
        on delete set null,

    event_type text not null,

    channel text not null
        default 'email',

    recipient text null,

    status text not null,

    provider_message_id text null,

    error_message text null,

    created_at timestamptz not null
        default now()
);

alter table public.notification_log
enable row level security;

drop policy if exists
"Users can view their own notification log"
on public.notification_log;

create policy
"Users can view their own notification log"
on public.notification_log
for select
to authenticated
using (
    (select auth.uid()) = user_id
);

drop policy if exists
"Admins can view notification log"
on public.notification_log;

create policy
"Admins can view notification log"
on public.notification_log
for select
to authenticated
using (
    (select private.is_admin())
);

-- Edge Functions use the service role and therefore do not require
-- insert/update policies for notification_log.
