-- Basedly is now Sorro. Sorro's tables and functions move from bd_ to sorro_;
-- tracker and social tables keep bd_ until the tracker app (S6) renames them.
-- Everything is looked up from the catalog here, because production has
-- tables the earlier migration files never created.

begin;

create temp table sorro_map(old text primary key, new text) on commit drop;
insert into sorro_map
select 'bd_' || t, 'sorro_' || t from unnest(array[
  'profiles', 'workspaces', 'workspace_members', 'terms', 'events', 'lists', 'tasks', 'subtasks',
  'projects', 'project_members', 'project_comments', 'cards', 'milestones',
  'notebooks', 'sections', 'notes', 'note_blocks', 'note_links', 'note_tags',
  'journal_entries', 'journal_photos', 'photo_annotations', 'photo_comments',
  'canvases', 'canvas_nodes', 'canvas_edges', 'java_files', 'folders', 'files', 'scratch',
  'revisions', 'reminder_log', 'notifications', 'integrations',
  -- functions
  'complete_onboarding', 'in_project', 'in_workspace', 'notifications_fill_created_at',
  'restore', 'seed_demo', 'ws_can_edit', 'ws_invite', 'ws_role'
]) as t;

-- 1. Tables, then the indexes, constraints, triggers and policies named after them.
do $$
declare m record; o record;
begin
  for m in select s.* from sorro_map s join pg_class c on c.relname = s.old and c.relnamespace = 'public'::regnamespace and c.relkind = 'r' loop
    execute format('alter table public.%I rename to %I', m.old, m.new);
  end loop;
  for o in
    select con.conname, cl.relname from pg_constraint con join pg_class cl on cl.oid = con.conrelid
    where cl.relnamespace = 'public'::regnamespace and cl.relname like 'sorro\_%' and con.conname like 'bd\_%'
  loop
    execute format('alter table public.%I rename constraint %I to %I', o.relname, o.conname, 'sorro_' || substr(o.conname, 4));
  end loop;
  for o in
    select i.relname as idx from pg_index x join pg_class i on i.oid = x.indexrelid join pg_class t on t.oid = x.indrelid
    where t.relnamespace = 'public'::regnamespace and t.relname like 'sorro\_%' and i.relname like 'bd\_%'
  loop
    execute format('alter index public.%I rename to %I', o.idx, 'sorro_' || substr(o.idx, 4));
  end loop;
  for o in
    select tg.tgname, cl.relname from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
    where not tg.tgisinternal and cl.relnamespace = 'public'::regnamespace and cl.relname like 'sorro\_%' and tg.tgname like 'bd\_%'
  loop
    execute format('alter trigger %I on public.%I rename to %I', o.tgname, o.relname, 'sorro_' || substr(o.tgname, 4));
  end loop;
  for o in
    select policyname, tablename from pg_policies where schemaname = 'public' and tablename like 'sorro\_%' and policyname ~ 'bd_'
  loop
    execute format('alter policy %I on public.%I rename to %I', o.policyname, o.tablename, replace(o.policyname, 'bd_', 'sorro_'));
  end loop;
end $$;

-- 2. Functions: rename Sorro's, then rewrite every body that names a renamed
-- table or function. Done here, not client-side, so the bodies' text never
-- leaves the database (a round trip through the CLI mangled non-ASCII).
do $$
declare f record; pat text; def text; m record;
begin
  for f in
    select p.oid, s.new from pg_proc p join sorro_map s on s.old = p.proname
    where p.pronamespace = 'public'::regnamespace
  loop
    execute format('alter function %s rename to %I', f.oid::regprocedure, f.new);
  end loop;
  pat := '\m(' || (select string_agg(old, '|' order by length(old) desc) from sorro_map) || ')\M';
  for f in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' loop
    def := pg_get_functiondef(f.oid);
    if def ~ pat then
      for m in select * from sorro_map order by length(old) desc loop
        def := regexp_replace(def, '\m' || m.old || '\M', m.new, 'g');
      end loop;
      execute def;
    end if;
  end loop;
end $$;

-- 3. Stored data that names the old brand or buckets. Triggers off, so
-- updated_at does not move every note to "edited just now".
alter table public.sorro_notes disable trigger user;
update public.sorro_notes set body = replace(body, '<!-- basedly-', '<!-- sorro-') where body like '%<!-- basedly-%';
alter table public.sorro_notes enable trigger user;
alter table public.sorro_profiles disable trigger user;
update public.sorro_profiles set
  photo_url = replace(photo_url, '/public/bd-avatars/', '/public/sorro-avatars/'),
  cover_url = replace(cover_url, '/public/bd-avatars/', '/public/sorro-avatars/')
where photo_url like '%/bd-avatars/%' or cover_url like '%/bd-avatars/%';
alter table public.sorro_profiles enable trigger user;
update public.sorro_revisions r set table_name = s.new from sorro_map s where r.table_name = s.old;

-- 4. Read-only stand-ins under the old names, for clients still running cached
-- code during the rollout. Dropped by 0028 a week later.
do $$
declare m record;
begin
  for m in select s.* from sorro_map s join pg_class c on c.relname = s.new and c.relnamespace = 'public'::regnamespace and c.relkind = 'r' loop
    execute format('create view public.%I with (security_invoker = true) as select * from public.%I', m.old, m.new);
    execute format('grant select on public.%I to authenticated', m.old);
  end loop;
end $$;

-- 5. Scheduled jobs lose the old name.
do $$
declare j record;
begin
  for j in select jobname, schedule, command from cron.job where jobname like 'basedly-%' loop
    perform cron.unschedule(j.jobname);
    perform cron.schedule(substr(j.jobname, 9), j.schedule, j.command);
  end loop;
end $$;

commit;
