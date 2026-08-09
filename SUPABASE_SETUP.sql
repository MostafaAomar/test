-- Run this once in Supabase Dashboard > SQL Editor for the project used by UniQuiz.
-- It keeps every user's words and notes private to that authenticated user.

create table if not exists public.user_app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_app_data enable row level security;

revoke all on table public.user_app_data from anon;
grant select, insert, update on table public.user_app_data to authenticated;

drop policy if exists "UniQuiz users can read own data" on public.user_app_data;
create policy "UniQuiz users can read own data"
on public.user_app_data
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "UniQuiz users can insert own data" on public.user_app_data;
create policy "UniQuiz users can insert own data"
on public.user_app_data
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "UniQuiz users can update own data" on public.user_app_data;
create policy "UniQuiz users can update own data"
on public.user_app_data
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
