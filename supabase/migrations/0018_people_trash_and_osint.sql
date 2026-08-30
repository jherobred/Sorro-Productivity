-- People trash archive & OSINT intelligence metadata.
--
-- deleted_at allows soft-delete with Undo and Trash Archive recovery.
-- osint stores aliases, public keys, crypto wallets, domains/IPs, locations, and research notes.

alter table public.bd_people
  add column if not exists deleted_at timestamptz default null,
  add column if not exists phone text,
  add column if not exists osint jsonb not null default '{}'::jsonb;
