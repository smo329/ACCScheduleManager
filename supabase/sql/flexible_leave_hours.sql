-- ACC Schedule Manager
-- Flexible whole-hour leave tracking for Vacation, Professional Leave, and TDL.
-- Run in the Supabase SQL Editor as postgres.

create table if not exists public.schedule_leave_hours (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.profiles(id)
        on delete cascade,

    leave_date date not null,

    vacation_hours integer not null default 0
        check (vacation_hours between 0 and 12),

    professional_leave_hours integer not null default 0
        check (professional_leave_hours between 0 and 12),

    tdl_hours integer not null default 0
        check (tdl_hours between 0 and 12),

    updated_at timestamptz not null default now(),

    constraint schedule_leave_hours_daily_total_check
        check (
            vacation_hours
            + professional_leave_hours
            + tdl_hours
            <= 12
        ),

    constraint schedule_leave_hours_unique
        unique (user_id, leave_date)
);

create index if not exists schedule_leave_hours_date_idx
on public.schedule_leave_hours(leave_date);

alter table public.schedule_leave_hours
enable row level security;


drop policy if exists
"Users can view their own leave hours"
on public.schedule_leave_hours;

create policy
"Users can view their own leave hours"
on public.schedule_leave_hours
for select
to authenticated
using (
    (select auth.uid()) = user_id
);


drop policy if exists
"Users can insert their own leave hours"
on public.schedule_leave_hours;

create policy
"Users can insert their own leave hours"
on public.schedule_leave_hours
for insert
to authenticated
with check (
    (select auth.uid()) = user_id
    and not (
        select private.week_is_locked(leave_date)
    )
    and (
        select private.user_has_scheduling_access(
            user_id,
            leave_date
        )
    )
);


drop policy if exists
"Users can update their own leave hours"
on public.schedule_leave_hours;

create policy
"Users can update their own leave hours"
on public.schedule_leave_hours
for update
to authenticated
using (
    (select auth.uid()) = user_id
    and not (
        select private.week_is_locked(leave_date)
    )
    and (
        select private.user_has_scheduling_access(
            user_id,
            leave_date
        )
    )
)
with check (
    (select auth.uid()) = user_id
    and not (
        select private.week_is_locked(leave_date)
    )
    and (
        select private.user_has_scheduling_access(
            user_id,
            leave_date
        )
    )
);


drop policy if exists
"Admins can view all leave hours"
on public.schedule_leave_hours;

create policy
"Admins can view all leave hours"
on public.schedule_leave_hours
for select
to authenticated
using (
    (select private.is_admin())
);


drop policy if exists
"Admins can manage all leave hours"
on public.schedule_leave_hours;

create policy
"Admins can manage all leave hours"
on public.schedule_leave_hours
for all
to authenticated
using (
    (select private.is_admin())
)
with check (
    (select private.is_admin())
);


-- Migrate any existing rigid leave codes to the new model.
insert into public.schedule_leave_hours (
    user_id,
    leave_date,
    vacation_hours,
    professional_leave_hours,
    tdl_hours
)
select
    s.user_id,
    s.schedule_date,
    case
        when s.schedule_code = 'VL12' then 12
        when s.schedule_code = 'VL4' then 4
        else 0
    end,
    case
        when s.schedule_code = 'PL12' then 12
        when s.schedule_code = 'PL4' then 4
        else 0
    end,
    0
from public.schedules s
where s.schedule_code in (
    'VL12',
    'VL4',
    'PL12',
    'PL4'
)
on conflict (user_id, leave_date)
do update set
    vacation_hours = excluded.vacation_hours,
    professional_leave_hours = excluded.professional_leave_hours,
    updated_at = now();

update public.schedules
set
    schedule_code = case
        when schedule_code in ('VL12', 'VL4') then 'VL'
        when schedule_code in ('PL12', 'PL4') then 'PL'
        else schedule_code
    end,
    work_site = null,
    updated_at = now()
where schedule_code in (
    'VL12',
    'VL4',
    'PL12',
    'PL4'
);


-- Keep destructive quarter deletion complete by also clearing leave rows.
create or replace function public.delete_scheduling_period_and_data(
    p_period_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_start date;
    v_end date;
    v_name text;
begin

    if not private.is_admin() then
        raise exception 'Administrator permission required';
    end if;

    select
        sp.period_start,
        sp.period_end,
        sp.name
    into
        v_start,
        v_end,
        v_name
    from public.scheduling_periods sp
    where sp.id = p_period_id;

    if v_start is null then
        raise exception 'Scheduling period not found';
    end if;

    delete from public.schedule_comments
    where schedule_date between v_start and v_end;

    delete from public.schedule_leave_hours
    where leave_date between v_start and v_end;

    delete from public.schedules
    where schedule_date between v_start and v_end;

    delete from public.week_submissions
    where week_start between v_start and v_end;

    delete from public.weekly_locks
    where week_start between v_start and v_end;

    delete from public.clinic_capacity
    where capacity_date between v_start and v_end;

    delete from public.scheduling_periods
    where id = p_period_id;

    return jsonb_build_object(
        'success', true,
        'name', v_name,
        'period_start', v_start,
        'period_end', v_end
    );
end;
$$;

revoke all on function public.delete_scheduling_period_and_data(uuid)
from public;

revoke all on function public.delete_scheduling_period_and_data(uuid)
from anon;

grant execute on function public.delete_scheduling_period_and_data(uuid)
to authenticated;
