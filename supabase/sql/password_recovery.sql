-- Password recovery settings for ACC Schedule Manager.
-- Answers are never stored in plaintext; hashing occurs in the password-recovery Edge Function.
create table if not exists public.password_recovery_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  security_question text not null,
  answer_salt text not null,
  answer_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.password_recovery_settings enable row level security;
revoke all on table public.password_recovery_settings from anon, authenticated;
create index if not exists password_recovery_locked_until_idx on public.password_recovery_settings(locked_until);
