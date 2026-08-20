-- Messages.
--
-- Three tables and one rule: you can see a conversation if you are in it.
--
-- The rule is enforced by `bd_in_convo()`, a SECURITY DEFINER function, and it
-- has to be a function rather than an inline `exists (select ... from members)`
-- inside the policies. A policy on bd_conversations that reads
-- bd_conversation_members would fire that table's own SELECT policy, which
-- reads bd_conversations, which fires its policy: Postgres refuses that with
-- "infinite recursion detected in policy". A definer function runs without RLS
-- and breaks the loop, which is the documented way through.
--
-- A shared post travels as a reference (`share_kind` + `share_id`), never a
-- copy: the post can be edited or deleted afterwards and the message should
-- follow, not preserve a stale snapshot of something the author took back.
--
-- Applied to production 2026-08-20.

create table if not exists public.bd_conversations (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title      text not null default '',
  is_group   boolean not null default false,
  created_at timestamptz not null default now(),
  -- Bumped by a trigger on every message, so the list sorts by "most recent"
  -- without a correlated subquery per row.
  updated_at timestamptz not null default now()
);

create table if not exists public.bd_conversation_members (
  conversation_id uuid not null references public.bd_conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.bd_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.bd_conversations(id) on delete cascade,
  author_id       uuid not null references auth.users(id) on delete cascade,
  body            text not null default '',
  share_kind      text check (share_kind in ('photo', 'discussion')),
  share_id        uuid,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists bd_messages_convo_idx on public.bd_messages (conversation_id, created_at);
create index if not exists bd_conversation_members_user_idx on public.bd_conversation_members (user_id);
create index if not exists bd_conversations_updated_idx on public.bd_conversations (updated_at desc);

create or replace function public.bd_in_convo(p_convo uuid)
returns boolean language sql security definer stable set search_path to 'public' as $$
  select exists (
    select 1 from public.bd_conversation_members m
     where m.conversation_id = p_convo and m.user_id = auth.uid()
  );
$$;

alter table public.bd_conversations        enable row level security;
alter table public.bd_conversation_members enable row level security;
alter table public.bd_messages             enable row level security;

do $$ begin
  create policy "read own conversations" on public.bd_conversations
    for select using (public.bd_in_convo(id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "start a conversation" on public.bd_conversations
    for insert with check (created_by = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "touch own conversations" on public.bd_conversations
    for update using (public.bd_in_convo(id)) with check (public.bd_in_convo(id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "read members of own conversations" on public.bd_conversation_members
    for select using (public.bd_in_convo(conversation_id));
exception when duplicate_object then null; end $$;

-- You may add yourself to a conversation, and the person who started one may
-- add anybody else. Nobody may add a third party to someone else's chat.
do $$ begin
  create policy "add members you may add" on public.bd_conversation_members
    for insert with check (
      user_id = auth.uid()
      or exists (select 1 from public.bd_conversations c
                  where c.id = conversation_id and c.created_by = auth.uid())
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "update own membership" on public.bd_conversation_members
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "leave a conversation" on public.bd_conversation_members
    for delete using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "read messages in own conversations" on public.bd_messages
    for select using (public.bd_in_convo(conversation_id) and deleted_at is null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "send messages" on public.bd_messages
    for insert with check (author_id = auth.uid() and public.bd_in_convo(conversation_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "edit own messages" on public.bd_messages
    for update using (author_id = auth.uid()) with check (author_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Starting a chat is find-or-create, and it has to be one statement: three
-- round trips from the client is three chances to end up with two "1:1"
-- conversations holding half the history each.
create or replace function public.bd_start_dm(p_other uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); cid uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if p_other = me then raise exception 'You cannot message yourself'; end if;

  select c.id into cid
    from public.bd_conversations c
    join public.bd_conversation_members a on a.conversation_id = c.id and a.user_id = me
    join public.bd_conversation_members b on b.conversation_id = c.id and b.user_id = p_other
   where c.is_group = false
   limit 1;
  if cid is not null then return cid; end if;

  insert into public.bd_conversations (created_by, is_group) values (me, false) returning id into cid;
  insert into public.bd_conversation_members (conversation_id, user_id) values (cid, me), (cid, p_other);
  return cid;
end;
$$;

create or replace function public.bd_start_group(p_title text, p_members uuid[])
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); cid uuid; u uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  insert into public.bd_conversations (created_by, is_group, title)
  values (me, true, coalesce(nullif(btrim(p_title), ''), 'Group')) returning id into cid;
  insert into public.bd_conversation_members (conversation_id, user_id) values (cid, me);
  foreach u in array coalesce(p_members, '{}') loop
    if u <> me then
      insert into public.bd_conversation_members (conversation_id, user_id)
      values (cid, u) on conflict do nothing;
    end if;
  end loop;
  return cid;
end;
$$;

create or replace function public.bd_touch_convo()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update public.bd_conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists bd_messages_touch on public.bd_messages;
create trigger bd_messages_touch after insert on public.bd_messages
for each row execute function public.bd_touch_convo();

alter publication supabase_realtime add table public.bd_messages;
alter publication supabase_realtime add table public.bd_conversations;
