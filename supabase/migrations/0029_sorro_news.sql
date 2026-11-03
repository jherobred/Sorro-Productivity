-- News: Grok's scheduled tasks drop digests here through the news-drop function.

create table if not exists public.sorro_news (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  kind text not null check (kind in ('ai-digest','dev-stack','trending','hackathons','jobs','research','gaming','ph-brief','weekly')),
  edition date not null default (now() at time zone 'Asia/Manila')::date,
  title text not null default '',
  body text not null default '',
  items jsonb not null default '[]',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists sorro_news_user_edition_idx on public.sorro_news (user_id, edition desc);
alter table public.sorro_news enable row level security;
create policy "read own news" on public.sorro_news for select using (user_id = auth.uid());
create policy "mark own news" on public.sorro_news for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "add own news" on public.sorro_news for insert with check (user_id = auth.uid());
create policy "remove own news" on public.sorro_news for delete using (user_id = auth.uid());

-- Pieces of a long digest until the last one arrives. Written only by the function.
create table if not exists public.sorro_news_parts (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  edition date not null,
  part int not null check (part between 1 and 50),
  of int not null check (of between 1 and 50),
  text text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, edition, part)
);
alter table public.sorro_news_parts enable row level security;

-- The drop key, stored hashed. Only the owner can rotate it; the function reads it with the service role.
create table if not exists public.sorro_news_keys (
  user_id uuid primary key references auth.users on delete cascade,
  key_hash text not null unique,
  created_at timestamptz not null default now()
);
alter table public.sorro_news_keys enable row level security;
create policy "see own key date" on public.sorro_news_keys for select using (user_id = auth.uid());

create or replace function public.sorro_news_key_rotate() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare k text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  k := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.sorro_news_keys (user_id, key_hash) values (auth.uid(), encode(extensions.digest(k, 'sha256'), 'hex'))
  on conflict (user_id) do update set key_hash = excluded.key_hash, created_at = now();
  return k;
end $$;
revoke all on function public.sorro_news_key_rotate() from public, anon;
grant execute on function public.sorro_news_key_rotate() to authenticated;

alter publication supabase_realtime add table public.sorro_news;
