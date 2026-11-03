-- Apply one week after 0027 (on or after 2026-11-10), once every device runs Sorro code.
-- Drops the read-only stand-ins under Sorro's old table names.
do $$
declare v record;
begin
  for v in select viewname from pg_views where schemaname = 'public' and viewname like 'bd\_%'
             and exists (select 1 from pg_class where relname = 'sorro_' || substr(viewname, 4) and relnamespace = 'public'::regnamespace)
  loop
    execute format('drop view public.%I', v.viewname);
  end loop;
end $$;
