-- The gym log, and the constraint that was eating every import.
--
-- 1. **bd_events_source_check listed three values and the app writes five.**
--    The check allowed ('manual','timetable','task'). The timetable scanner
--    writes 'schedule_scan' and the Google sync writes 'gcal_ics', so every
--    row either of them inserted violated the constraint and Postgres refused
--    the whole batch. Nothing reached the calendar, ever: production holds 31
--    events and all 31 are 'manual'. The import sheet said "84 events added"
--    and closed, because it never looked at the result.
--
--    This is the choke point both features route through, so it is the one
--    place worth fixing — patching the scanner alone would have left the
--    Google sync silently broken in exactly the same way.
--
-- 2. **A workout had no sets.** bd_workouts is a dated session with muscle
--    groups and a duration, which is enough to warm a body map and to count a
--    gym day, and not enough to answer the only question a lifter actually
--    asks: what did I lift last time. Sets are the log; the session is the
--    envelope around them. Weight is numeric because 2.5 kg plates exist.

alter table public.bd_events drop constraint if exists bd_events_source_check;
alter table public.bd_events add constraint bd_events_source_check
  check (source in ('manual', 'timetable', 'task', 'schedule_scan', 'gcal_ics'));

create table if not exists public.bd_workout_sets (
  id         uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.bd_workouts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  exercise   text not null,
  position   smallint not null default 0,
  weight_kg  numeric(6,2) not null default 0,
  reps       smallint not null default 0,
  done       boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists bd_workout_sets_workout_idx on public.bd_workout_sets (workout_id, position);
create index if not exists bd_workout_sets_user_ex_idx on public.bd_workout_sets (user_id, exercise);

alter table public.bd_workout_sets enable row level security;

do $$ begin
  create policy "own bd_workout_sets" on public.bd_workout_sets
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
