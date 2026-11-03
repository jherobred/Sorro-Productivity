-- Home assistant conversations.
create table if not exists public.sorro_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.sorro_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.sorro_chats on delete cascade,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  tools jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists sorro_chats_user_idx on public.sorro_chats (user_id, updated_at desc);
create index if not exists sorro_chat_messages_chat_idx on public.sorro_chat_messages (chat_id, created_at);
alter table public.sorro_chats enable row level security;
alter table public.sorro_chat_messages enable row level security;
create policy "own chats" on public.sorro_chats for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own chat messages" on public.sorro_chat_messages for all using (user_id = auth.uid()) with check (user_id = auth.uid());
