-- Three unrelated asks, one migration, because every one of them is a column.
--
-- 1. A profile has a cover photo, both photos can be framed, and you pick your
--    own animal instead of inheriting the one your user id hashes to.
-- 2. A post can have a title *and* a picture *and* neither a tag nor a caption.
-- 3. A workspace can be deleted with an undo, and shared with real roles.
--
-- Everything here is additive. No existing row is rewritten except
-- bd_workspace_members.role, where the old 'member' becomes 'editor' — the
-- same permission it already had, under a name the new three-tier check
-- accepts.

/* ------------------------------------------------------------ 1. profiles */

-- `photo_fit` / `cover_fit` hold {x, y, zoom}: where the picture sits inside
-- its frame and how far it is pulled in. Numbers, not a re-encoded file, so
-- reframing is free and never degrades the original — drag it again next week
-- and the source is still the one you uploaded.
alter table public.bd_profiles
  add column if not exists cover_url  text,
  add column if not exists photo_fit  jsonb not null default '{}'::jsonb,
  add column if not exists cover_fit  jsonb not null default '{}'::jsonb,
  add column if not exists animal     text;

-- Null means "whatever animalOf(user_id) says", which is what everyone had
-- before this column existed. A stated pick wins; an absent one still resolves
-- to a stable creature, so nobody is ever animal-less.
alter table public.bd_profiles drop constraint if exists bd_profiles_animal_ck;
alter table public.bd_profiles add constraint bd_profiles_animal_ck
  check (animal is null or animal in ('fox','cat','bear','owl','frog','panda','rabbit','wolf'));

/* ---------------------------------------------------------------- 2. feed */

-- A photo could not carry a title and a discussion could not carry a picture,
-- so "here is a thing, and here is what I want to ask about it" had no home.
-- One column fixes half of it: bd_posts is now the table for anything with an
-- image, titled or not, and bd_threads stays the table for anything without
-- one. `tag` was already `default ''` on both, so posting untagged needed no
-- schema change at all — only a composer that stopped preselecting one.
alter table public.bd_posts add column if not exists title text not null default '';

-- The pictures after the first. `bd_posts.image_path` stays the cover, so
-- every existing reader — the feed card, the notification, the challenge
-- result card — keeps working untouched and only the gallery needs this.
create table if not exists public.bd_post_images (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.bd_posts(id) on delete cascade,
  path       text not null,
  position   smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists bd_post_images_post on public.bd_post_images (post_id, position);

alter table public.bd_post_images enable row level security;

drop policy if exists "read bd_post_images" on public.bd_post_images;
create policy "read bd_post_images" on public.bd_post_images for select
  using (exists (
    select 1 from public.bd_posts p
    where p.id = post_id and p.deleted_at is null
  ));

drop policy if exists "own bd_post_images" on public.bd_post_images;
create policy "own bd_post_images" on public.bd_post_images for all
  using (exists (
    select 1 from public.bd_posts p where p.id = post_id and p.author_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.bd_posts p where p.id = post_id and p.author_id = auth.uid()
  ));

/* ---------------------------------------------------------- 3. workspaces */

-- Deleting a shared space is the one destructive act in the sidebar and it had
-- no undo, so it gets the same soft delete every other row in this app has.
alter table public.bd_workspaces add column if not exists deleted_at timestamptz;

-- 'member' meant "can do anything except manage people", which is what
-- 'editor' means here. Renaming it keeps every existing membership working at
-- exactly the permission it already had. The old check has to come off first
-- or the rename violates it on the way through.
alter table public.bd_workspace_members drop constraint if exists bd_workspace_members_role_check;
alter table public.bd_workspace_members drop constraint if exists bd_workspace_members_role_ck;

update public.bd_workspace_members set role = 'editor' where role = 'member';

alter table public.bd_workspace_members alter column role set default 'editor';
alter table public.bd_workspace_members add constraint bd_workspace_members_role_ck
  check (role in ('owner','editor','viewer'));

/**
 * Your role in a space, or null when you are not in it.
 *
 * SECURITY DEFINER for the same reason bd_in_workspace is: a policy on
 * bd_workspace_members that reads bd_workspace_members recurses forever.
 * The owner is resolved from bd_workspaces rather than trusted from the
 * membership row, so a member row claiming 'owner' cannot grant itself
 * anything.
 */
create or replace function public.bd_ws_role(p_ws uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when exists (select 1 from public.bd_workspaces w
                 where w.id = p_ws and w.owner_id = auth.uid()) then 'owner'
    else (select m.role from public.bd_workspace_members m
          where m.workspace_id = p_ws and m.user_id = auth.uid())
  end;
$$;

/** Owner or editor. The gate on every write to shared data. */
create or replace function public.bd_ws_can_edit(p_ws uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.bd_ws_role(p_ws) in ('owner','editor');
$$;

-- The owner keeps full control, but a member could not previously leave: the
-- only write policy on the table was the owner's, so `delete my own row`
-- failed silently and Leave did nothing.
drop policy if exists "leave workspace" on public.bd_workspace_members;
create policy "leave workspace" on public.bd_workspace_members for delete
  using (user_id = auth.uid());

-- Soft-deleted spaces disappear from everyone's sidebar, including the owner's
-- until they press Undo.
drop policy if exists "workspaces visible to members" on public.bd_workspaces;
create policy "workspaces visible to members" on public.bd_workspaces for select
  using (deleted_at is null and (owner_id = auth.uid() or public.bd_in_workspace(id)));

/* Sharing that shares something.
 *
 * Until now a workspace was a label: `bd_projects` and `bd_files` carry a
 * workspace_id but their policies only ever asked `user_id = auth.uid()`, so
 * inviting somebody into a space showed them the space and none of the work in
 * it. These are the policies that make membership mean access.
 *
 * A viewer reads. An editor writes. Neither can touch a row whose workspace_id
 * is null, which is everybody's personal stuff and stays personal. */

drop policy if exists "projects in my workspaces" on public.bd_projects;
create policy "projects in my workspaces" on public.bd_projects for select
  using (workspace_id is not null and public.bd_ws_role(workspace_id) is not null);

drop policy if exists "workspace editors write projects" on public.bd_projects;
create policy "workspace editors write projects" on public.bd_projects for all
  using (workspace_id is not null and public.bd_ws_can_edit(workspace_id))
  with check (workspace_id is not null and public.bd_ws_can_edit(workspace_id));

drop policy if exists "files in my workspaces" on public.bd_files;
create policy "files in my workspaces" on public.bd_files for select
  using (workspace_id is not null and public.bd_ws_role(workspace_id) is not null);

drop policy if exists "workspace editors write files" on public.bd_files;
create policy "workspace editors write files" on public.bd_files for all
  using (workspace_id is not null and public.bd_ws_can_edit(workspace_id))
  with check (workspace_id is not null and public.bd_ws_can_edit(workspace_id));

/**
 * Add somebody to a space by user id.
 *
 * A function rather than a plain insert because the client has no way to prove
 * the target exists — bd_profiles is world-readable so it can *find* them, but
 * an insert of a bad uuid would land as a membership row pointing at nobody.
 */
create or replace function public.bd_ws_invite(p_ws uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if public.bd_ws_role(p_ws) <> 'owner' then
    raise exception 'Only the owner can add people';
  end if;
  if p_role not in ('editor','viewer') then
    raise exception 'Role must be editor or viewer';
  end if;
  if not exists (select 1 from public.bd_profiles where user_id = p_user) then
    raise exception 'No such person';
  end if;

  insert into public.bd_workspace_members (workspace_id, user_id, role)
  values (p_ws, p_user, p_role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
end;
$$;

grant execute on function public.bd_ws_role(uuid)  to authenticated;
grant execute on function public.bd_ws_can_edit(uuid) to authenticated;
grant execute on function public.bd_ws_invite(uuid, uuid, text) to authenticated;
