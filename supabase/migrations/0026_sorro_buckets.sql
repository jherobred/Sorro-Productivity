-- Sorro storage buckets. Applied before 0027 so files can be copied over
-- (scripts/move-buckets.mjs) before profile URLs are pointed at them.
-- Tracker buckets (bd-feed) and bd-releases stay as they are.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select replace(id, 'bd-', 'sorro-'), replace(name, 'bd-', 'sorro-'), public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('bd-files', 'bd-journal', 'bd-avatars')
on conflict (id) do nothing;

-- Same rules as the old buckets, with the bucket id swapped.
do $$
declare p record; stmt text;
begin
  for p in
    select policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and coalesce(qual, '') || coalesce(with_check, '') ~ 'bd-(files|journal|avatars)'
  loop
    stmt := format('create policy %I on storage.objects as %s for %s to %s',
      replace(replace(p.policyname, 'bd-', 'sorro-'), 'avatar', 'sorro avatar'),
      p.permissive, p.cmd, array_to_string(p.roles, ', '));
    if p.qual is not null then stmt := stmt || ' using (' || regexp_replace(p.qual, 'bd-(files|journal|avatars)', 'sorro-\1', 'g') || ')'; end if;
    if p.with_check is not null then stmt := stmt || ' with check (' || regexp_replace(p.with_check, 'bd-(files|journal|avatars)', 'sorro-\1', 'g') || ')'; end if;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                   and policyname = replace(replace(p.policyname, 'bd-', 'sorro-'), 'avatar', 'sorro avatar')) then
      execute stmt;
    end if;
  end loop;
end $$;
