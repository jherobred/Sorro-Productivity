-- Canvas and Google Calendar sync could never write anything.
--
-- The `sync` Edge Function writes with ON CONFLICT (user_id, source, external_id),
-- so a second sync updates what the first one wrote instead of duplicating it.
-- Postgres only accepts a plain unique index or constraint on exactly those
-- columns as that target. Checked against production on 2026-09-15: bd_tasks,
-- bd_notifications and bd_events all refuse it with "there is no unique or
-- exclusion constraint matching the ON CONFLICT specification", which is the
-- message Connect UST Canvas showed. bd_integrations accepts its own
-- (user_id, kind) target, so saving the token was never the problem.
--
-- Unique indexes treat NULLs as distinct, so rows without an external_id
-- (everything typed into the app) are unaffected, and no sync ever managed to
-- write a duplicate, so building these cannot fail on existing rows.

create unique index if not exists bd_tasks_sync_key
  on public.bd_tasks (user_id, source, external_id);

create unique index if not exists bd_notifications_sync_key
  on public.bd_notifications (user_id, source, external_id);

create unique index if not exists bd_events_sync_key
  on public.bd_events (user_id, source, external_id);

-- The same writer needs its values allowed wherever a column is limited to a
-- list: source 'canvas_lms' on tasks and notifications, kind 'canvas' on
-- notifications. bd_events.source already lists 'gcal_ics' (0007). A list that
-- already has the value is left alone, and so is any check that is not a list.
do $$
declare
  want record;
  con record;
  vals text[];
begin
  for want in
    select * from (values
      ('bd_tasks', 'source', 'canvas_lms'),
      ('bd_notifications', 'source', 'canvas_lms'),
      ('bd_notifications', 'kind', 'canvas')
    ) as w(tbl, col, val)
  loop
    for con in
      select c.conname, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
      where c.conrelid = format('public.%I', want.tbl)::regclass
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ~* ('\m' || want.col || '\M')
        and pg_get_constraintdef(c.oid) like '%ARRAY[%'
        and pg_get_constraintdef(c.oid) not like ('%''' || want.val || '''%')
    loop
      select array_agg(m[1]) into vals
      from regexp_matches(con.def, '''([^'']*)''', 'g') as m;
      execute format('alter table public.%I drop constraint %I', want.tbl, con.conname);
      execute format('alter table public.%I add constraint %I check (%I = any (%L::text[]))',
        want.tbl, con.conname, want.col, array_append(vals, want.val));
    end loop;
  end loop;
end $$;

-- The sync leaves out `position`, which the app always sends. Without a default
-- a synced task would fail NOT NULL, so give it one if it has none.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bd_tasks'
      and column_name = 'position' and column_default is null
  ) then
    alter table public.bd_tasks alter column "position" set default 0;
  end if;
end $$;
