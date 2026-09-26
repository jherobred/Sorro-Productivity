-- One transaction keeps an interrupted reorder from leaving half the shelf moved.
create or replace function public.reorder_notebooks(notebook_ids uuid[])
returns void language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null or cardinality(notebook_ids) is null or cardinality(notebook_ids) = 0 then
    raise exception 'Sign in and reload the notebook library before reordering.';
  end if;
  if (select count(distinct id) from unnest(notebook_ids) as x(id)) <> cardinality(notebook_ids)
    or (select count(*) from public.bd_notebooks where id = any(notebook_ids) and user_id = auth.uid() and deleted_at is null) <> cardinality(notebook_ids) then
    raise exception 'The notebook library changed. Reload it and try again.';
  end if;
  update public.bd_notebooks n set position = ordered.rank - 1
    from (select id, ordinal::integer as rank from unnest(notebook_ids) with ordinality as x(id, ordinal)) ordered
    where n.id = ordered.id and n.user_id = auth.uid() and n.deleted_at is null;
end;
$$;
revoke all on function public.reorder_notebooks(uuid[]) from public;
grant execute on function public.reorder_notebooks(uuid[]) to authenticated;
