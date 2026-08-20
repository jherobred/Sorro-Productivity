-- The Arena, and the instruments.
--
-- What the three screens needed that the schema could not give them:
--
-- 1. **A day-by-day series per competitor.** A challenge stored one running
--    total, so the card could say who was ahead and nothing else. Momentum —
--    who actually went yesterday — is the thing that makes you go today, and
--    it needs one row per person per day.
--
--    RLS here is deliberately lopsided: everyone in a challenge can read
--    everyone's days (a leaderboard nobody can see is not a leaderboard), and
--    you may only write your own. That matters more than usual now, because
--    progress is *computed from private tables*: your tasks and your gym log
--    are yours alone under RLS, so only your own client can read them and
--    publish the count. Nobody's raw data leaves their session — only the
--    number of things they did.
--
-- 2. **Stakes.** RP already exists on bd_ranked; a challenge can now cost some
--    to enter, which is what makes finishing matter.
--
-- 3. **Workouts with dates.** bd_gym_days is a weekly *plan* (weekday, name,
--    done) and has no dates on it, so nothing could count "gym days this
--    fortnight" and nothing could say which muscles were worked this week.
--    bd_workouts is the log the body map and the gym metric both read.
--
-- 4. **When you slept, not how long.** sleep_h is a number you type. Two
--    handles on an arc — down at 23:40, up at 07:10 — is both easier to enter
--    and more honest, and the hours fall out of it.
--
-- Applied to production 2026-08-20.

alter table public.bd_challenges add column if not exists stake_rp smallint not null default 0;

create table if not exists public.bd_challenge_days (
  challenge_id uuid not null references public.bd_challenges(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  on_date      date not null,
  value        integer not null default 0,
  primary key (challenge_id, user_id, on_date)
);

create index if not exists bd_challenge_days_challenge_idx on public.bd_challenge_days (challenge_id, on_date);

alter table public.bd_challenge_days enable row level security;

do $$ begin
  create policy "read bd_challenge_days" on public.bd_challenge_days for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own bd_challenge_days" on public.bd_challenge_days
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

create table if not exists public.bd_workouts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  on_date    date not null default current_date,
  name       text not null default '',
  -- 'chest','back','arms','core','legs','cardio' — what the body map warms.
  groups     text[] not null default '{}',
  minutes    smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists bd_workouts_user_date_idx on public.bd_workouts (user_id, on_date desc);

alter table public.bd_workouts enable row level security;

do $$ begin
  create policy "own bd_workouts" on public.bd_workouts
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

alter table public.bd_body_days add column if not exists sleep_from time;
alter table public.bd_body_days add column if not exists sleep_to   time;

alter table public.bd_meals add column if not exists photo_path text;
