-- Fuel: where a meal happened, and when each cup was drunk.
--
-- Two gaps the redesigned Fuel tab cannot fill from the existing tables.
--
-- `place` — "sa tabi ng SM" is a real answer and no dropdown will ever hold it,
-- so it is free text. It is the single most useful thing for recognising a meal
-- later, and the timeline prints it beside the macros.
--
-- `bd_water_log` — `bd_body_days.water` is a running count with no timestamps,
-- which cannot answer "how much in the last hour". That question is the whole
-- basis of the over-drinking warning: maximum renal free-water clearance is
-- about a litre an hour, and exceeding it is what dilutes blood sodium. A count
-- can only say how much; this says how fast. The day column stays as the cheap
-- total so nothing that reads it has to change.

alter table public.bd_meals
  add column if not exists place text;

create table if not exists public.bd_water_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  at          timestamptz not null default now(),
  ml          integer not null default 250 check (ml > 0 and ml <= 2000),
  created_at  timestamptz not null default now()
);

-- The rolling-hour question is always "this user, recently", so the index is
-- ordered to serve it directly.
create index if not exists bd_water_log_user_at_idx
  on public.bd_water_log (user_id, at desc);

alter table public.bd_water_log enable row level security;

drop policy if exists "own water log" on public.bd_water_log;
create policy "own water log" on public.bd_water_log
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Money: a jar you can recognise, and details you may add later.
--
-- `photo_path` — a budget is easier to pick out of a list by its picture than
-- by reading four category names. Null falls back to a shipped photograph for
-- the common categories and to a tinted initial for anything else, so an
-- existing budget needs no backfill.
--
-- `place`, `who`, `detailed` — the log sheet asks what/when/where/who, and the
-- Lazy button deliberately skips all but the amount. `detailed` is what lets a
-- feed show which rows are still stubs, so a rushed log can be finished later
-- rather than being silently lost.

alter table public.bd_budgets
  add column if not exists photo_path text;

alter table public.bd_transactions
  add column if not exists place text,
  add column if not exists who text,
  add column if not exists detailed boolean not null default true;
