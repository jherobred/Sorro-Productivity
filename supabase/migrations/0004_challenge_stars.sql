-- A star on a challenge.
--
-- The same gesture as a like on a post, drawn as a star because a challenge is
-- something you back rather than something you enjoy. One row per person per
-- challenge, so the count is a count and starring twice is not a thing.
--
-- Readable by everyone (a count nobody can see is not a signal), writable only
-- by the person doing the starring.

create table if not exists public.bd_challenge_stars (
  challenge_id uuid not null references public.bd_challenges(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create index if not exists bd_challenge_stars_challenge_idx on public.bd_challenge_stars (challenge_id);

alter table public.bd_challenge_stars enable row level security;

do $$ begin
  create policy "read bd_challenge_stars" on public.bd_challenge_stars for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own bd_challenge_stars" on public.bd_challenge_stars
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
