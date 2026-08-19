-- Notebook system v2 — Evernote's shape.
--
-- Evernote has notebooks and notes. It has no sections, and a note's content is
-- one document rather than a table of paragraph rows. Both of those were true
-- of the old schema and both of them cost data: a note whose first block was
-- written before its own row existed lost the text to a foreign-key rollback,
-- which is why bd_note_blocks is empty in production while notes exist.
--
-- After this migration:
--   bd_notes.notebook_id  — a note belongs to a notebook, directly
--   bd_notes.body         — markdown, the whole note, one row, one write
--   bd_notes.section_id   — nullable, legacy, read by nothing
--   bd_note_tags          — Evernote's other axis of organisation
--
-- bd_sections and bd_note_blocks are left in place holding whatever they hold.
-- Nothing reads them any more; dropping user rows is not this migration's job.

-- 1. Notes hang off notebooks ------------------------------------------------

alter table public.bd_notes
  add column if not exists notebook_id uuid references public.bd_notebooks(id) on delete cascade;

update public.bd_notes n
   set notebook_id = s.notebook_id
  from public.bd_sections s
 where n.section_id = s.id
   and n.notebook_id is null;

-- Any note whose section vanished lands in the user's first notebook rather
-- than becoming invisible.
update public.bd_notes n
   set notebook_id = (select b.id from public.bd_notebooks b
                       where b.user_id = n.user_id order by b.position, b.created_at limit 1)
 where n.notebook_id is null;

alter table public.bd_notes alter column section_id drop not null;

create index if not exists bd_notes_notebook_idx on public.bd_notes (notebook_id);
create index if not exists bd_notes_updated_idx  on public.bd_notes (user_id, updated_at desc);

-- 2. Blocks fold back into the document --------------------------------------

with md as (
  select note_id,
         string_agg(
           case kind
             when 'h1'      then '# '   || text
             when 'h2'      then '## '  || text
             when 'h3'      then '### ' || text
             when 'bullet'  then '- '   || text
             when 'number'  then '1. '  || text
             when 'todo'    then (case when done then '- [x] ' else '- [ ] ' end) || text
             when 'quote'   then '> '   || text
             when 'callout' then '|| '  || text
             when 'code'    then E'```\n' || text || E'\n```'
             when 'divider' then '---'
             else text
           end, E'\n' order by position) as body
    from public.bd_note_blocks
   group by note_id
)
update public.bd_notes n
   set body = md.body
  from md
 where md.note_id = n.id
   and coalesce(n.body, '') = ''
   and coalesce(md.body, '') <> '';

-- 3. Tags ---------------------------------------------------------------------

create table if not exists public.bd_note_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.bd_notes(id) on delete cascade,
  tag     text not null check (length(tag) between 1 and 40),
  primary key (note_id, tag)
);

create index if not exists bd_note_tags_user_idx on public.bd_note_tags (user_id, tag);

alter table public.bd_note_tags enable row level security;

do $$ begin
  create policy "own bd_note_tags" on public.bd_note_tags
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- 4. The seeds write notebooks, not sections ---------------------------------

create or replace function public.bd_complete_onboarding(
  p_name text, p_handle text, p_course text, p_year text,
  p_campus text default '', p_timezone text default 'Asia/Manila',
  p_interests text[] default '{}', p_term_name text default 'Current term',
  p_term_start date default current_date, p_term_end date default (current_date + 120))
returns void language plpgsql set search_path to 'public' as $function$
declare u uuid := auth.uid(); nb uuid;
begin
  if u is null then raise exception 'Not signed in'; end if;

  insert into public.bd_profiles (user_id, name, handle, course, year, campus, timezone, interests, onboarded_at)
  values (u, p_name, nullif(p_handle, ''), p_course, p_year, p_campus, p_timezone, p_interests, now())
  on conflict (user_id) do update set
    name = excluded.name, handle = coalesce(excluded.handle, public.bd_profiles.handle),
    course = excluded.course, year = excluded.year, campus = excluded.campus,
    timezone = excluded.timezone, interests = excluded.interests, onboarded_at = now();

  insert into public.bd_terms (user_id, name, starts_on, ends_on)
  values (u, p_term_name, p_term_start, p_term_end);

  insert into public.bd_notebooks (user_id, name, color, position)
  values (u, coalesce(nullif(p_year, ''), 'My notebook'), '#B07CFF', 0)
  returning id into nb;

  insert into public.bd_notes (user_id, notebook_id, title, body, position)
  values (u, nb, 'Welcome', E'This is a note. Type to write.\n\n- [ ] Try a checklist\n- Link another note with [[double brackets]]', 0);

  insert into public.bd_lists (user_id, name, color, position) values
    (u, 'School',   '#7C8CFF', 0),
    (u, 'Personal', '#FFC24B', 1),
    (u, 'Errands',  '#34D9A0', 2);

  insert into public.bd_accounts (user_id, name, kind, color, position) values
    (u, 'Cash',     'cash',    '#34D9A0', 0),
    (u, 'Maribank', 'ewallet', '#7C8CFF', 1);
end;
$function$;

create or replace function public.bd_seed_demo()
returns void language plpgsql set search_path to 'public' as $function$
declare
  u uuid := auth.uid();
  l_school uuid; l_personal uuid; l_errands uuid;
  d0 date; nb uuid; acct uuid; h1 uuid; h2 uuid; h3 uuid;
  tz text;
begin
  if u is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.bd_tasks where user_id = u) then return; end if;

  select coalesce(nullif(timezone, ''), 'Asia/Manila') into tz from public.bd_profiles where user_id = u;
  perform set_config('TimeZone', coalesce(tz, 'Asia/Manila'), true);
  d0 := current_date;

  select id into l_school   from public.bd_lists where user_id = u and name = 'School'   limit 1;
  select id into l_personal from public.bd_lists where user_id = u and name = 'Personal' limit 1;
  select id into l_errands  from public.bd_lists where user_id = u and name = 'Errands'  limit 1;

  insert into public.bd_tasks (user_id, list_id, title, due_on, priority, stars, notes, position) values
    (u, l_school,   'Finish CS 191 problem set 4',      d0 - 4, 'high', 4, 'Sections 3 and 5 only.', 0),
    (u, l_school,   'Email Prof. Santos about regrade', d0 - 2, 'med',  2, '', 1),
    (u, l_errands,  'Return library books',             d0 - 1, 'low',  0, '', 2),
    (u, l_school,   'Draft thesis outline',             d0,     'high', 5, 'Three chapters, bullet form.', 3),
    (u, l_personal, 'Gym — push day',                   d0,     'med',  0, '', 4),
    (u, l_school,   'Read Chapter 7 — algorithms',      d0,     'low',  1, '', 5),
    (u, l_school,   'Capstone group sync notes',        d0 + 1, 'med',  3, '', 6),
    (u, l_errands,  'Buy notebook + pens',              d0 + 2, 'low',  0, '', 7),
    (u, l_personal, 'Call home',                        d0 + 3, 'med',  2, '', 8),
    (u, l_school,   'Start CS 150 lab report',          d0 + 4, 'high', 0, '', 9);

  insert into public.bd_events (user_id, title, starts_at, ends_at, location, color) values
    (u, 'CS 150 Lecture',             d0 + time '09:00', d0 + time '10:30', 'Eng''g 214', '#7C8CFF'),
    (u, 'Deep work — thesis outline', d0 + time '13:00', d0 + time '14:30', 'Library 3F', '#34D9A0'),
    (u, 'CS 191 Lecture',             d0 + time '15:00', d0 + time '16:30', 'Eng''g 302', '#7C8CFF'),
    (u, 'Group call — capstone',      d0 + time '19:30', d0 + time '20:30', 'Discord',    '#B07CFF'),
    (u, 'CS 165 Lecture',         (d0+1) + time '10:00', (d0+1) + time '11:30', 'Eng''g 210', '#7C8CFF'),
    (u, 'Gym — pull day',         (d0+1) + time '17:00', (d0+1) + time '18:00', 'UST Gym',    '#FF6FA8'),
    (u, 'Thesis consultation',    (d0+2) + time '14:00', (d0+2) + time '15:00', 'Faculty rm', '#FFC24B'),
    (u, 'CS 150 Lab',             (d0+3) + time '09:00', (d0+3) + time '12:00', 'Lab 4',      '#38D6F2');

  insert into public.bd_habits (user_id, name, color, kind, position) values (u,'Read 20 pages','#FF6B6B','bin',0) returning id into h1;
  insert into public.bd_habits (user_id, name, color, kind, position) values (u,'Drink 8 glasses','#38D6F2','bin',1) returning id into h2;
  insert into public.bd_habits (user_id, name, color, kind, position) values (u,'No phone before bed','#B07CFF','bin',2) returning id into h3;
  insert into public.bd_habit_ticks (user_id, habit_id, on_date) select u, h1, d0 - g from generate_series(0,5) g;
  insert into public.bd_habit_ticks (user_id, habit_id, on_date) select u, h2, d0 - g from generate_series(1,9) g where g <> 4;
  insert into public.bd_habit_ticks (user_id, habit_id, on_date) select u, h3, d0 - g from generate_series(0,12) g where g % 3 <> 0;

  select id into acct from public.bd_accounts where user_id = u order by position limit 1;
  insert into public.bd_budgets (user_id, category, period, amount_centavos)
    values (u,'Food','monthly',600000),(u,'Transport','monthly',200000)
    on conflict (user_id, category, period) do nothing;
  insert into public.bd_transactions (user_id, account_id, name, amount_centavos, category, occurred_at) values
    (u, acct,'Jeepney fare',2400,'Transport', now() - interval '1 day'),
    (u, acct,'Lunch — canteen',9500,'Food', now() - interval '1 day'),
    (u, acct,'Coffee',13000,'Food', now() - interval '2 day'),
    (u, acct,'Printing — thesis',4500,'School', now() - interval '3 day'),
    (u, acct,'Groceries',87500,'Food', now() - interval '5 day'),
    (u, acct,'Load',10000,'Other', now() - interval '6 day');
  insert into public.bd_to_buy (user_id, name, amount_centavos) values (u,'Notebook + pens',18000),(u,'USB-C cable',35000);

  select id into nb from public.bd_notebooks where user_id = u order by position limit 1;
  if nb is not null then
    insert into public.bd_notes (user_id, notebook_id, title, body, position) values
      (u, nb,'Sprint planning',
       E'## Week 3\n\nScope is the parser, then the CLI.\n\n- [ ] Rebuild the import\n- [ ] Draft the limitations section\n\nSee [[Requirements elicitation]].',0),
      (u, nb,'Requirements elicitation',
       E'Interview two users before Friday.\n\n> Ask what they do *before* they open the app.',1),
      (u, nb,'Use case diagrams','Actors: student, admin, registrar.',2);
  end if;

  insert into public.bd_scratch (user_id, text, tag, color, pinned, position) values
    (u,'Ask about the thesis template margins','Note','#38D6F2',true,0),
    (u,'Bus leaves at 6:40, not 6:50','Note','#FFC24B',false,1),
    (u,'Library closes early on Fridays','Note','#34D9A0',false,2);

  insert into public.bd_people (user_id, name, category, color, note) values
    (u,'Jasmine Lim','Groupmate','#7C8CFF','Handles the frontend. Prefers Discord.'),
    (u,'Prof. Santos','Prof','#FFC24B','Office hours Tue 2–4pm.'),
    (u,'Miguel Cruz','Classmate','#34D9A0','Lends notes for CS 150.');

  insert into public.bd_body_days (user_id, on_date, sleep_h, water, steps, weight)
    select u, d0 - g, 6.5 + (g % 3) * 0.5, 5 + (g % 4), 4000 + g * 420, 62.5 - g * 0.1
    from generate_series(0,6) g
    on conflict (user_id, on_date) do nothing;
  insert into public.bd_gym_days (user_id, weekday, name, done) values
    (u,0,'Push',true),(u,1,'Pull',true),(u,2,'Legs',false),(u,3,'Rest',false),
    (u,4,'Push',false),(u,5,'Run',false),(u,6,'Rest',false)
    on conflict (user_id, weekday) do nothing;
  insert into public.bd_meals (user_id, on_date, name, slot, kcal, protein, carbs, fat) values
    (u,d0,'Tapsilog','Breakfast',620,32,78,18),
    (u,d0,'Chicken rice bowl','Lunch',740,45,82,20),
    (u,d0,'Banana + peanuts','Snack',240,8,28,11);
end;
$function$;

-- 5. Journal: one mood per day -----------------------------------------------
--
-- The journal screen is the Almanac's month heat map and "on this day" strip
-- wrapped around the Spread's two-leaf page. Everything it needs was already
-- stored except how the day felt.

alter table public.bd_journal_entries add column if not exists mood text;
create index if not exists bd_journal_entries_user_date_idx
  on public.bd_journal_entries (user_id, entry_date desc);
