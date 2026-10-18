-- Persist habit schedule, cue, icon, category, and display metadata on bd_habits
-- instead of browser-local storage so phone and desktop stay in sync.

alter table public.bd_habits
  add column if not exists short_name text not null default '',
  add column if not exists show_in_home boolean not null default true,
  add column if not exists category text not null default 'health',
  add column if not exists frequency text not null default 'daily',
  add column if not exists custom_days smallint[],
  add column if not exists time_of_day text not null default 'anytime',
  add column if not exists icon text,
  add column if not exists cue text not null default '',
  add column if not exists target_unit text,
  add column if not exists reminder_time text;

alter table public.bd_habit_ticks
  add column if not exists note text,
  add column if not exists mood text;
