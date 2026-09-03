-- Security audit (A01 Broken Access Control) — fixes for what the migration
-- history can actually prove, plus one belt-and-braces assertion.
--
-- This app has no server: every client hits PostgREST with the anon key
-- baked into the APK, so RLS is the entire authorization model. This
-- migration only touches tables whose full CREATE TABLE + policy history is
-- visible in 0001-0019 — most of the schema (bd_tasks, bd_profiles,
-- bd_people, bd_events, bd_projects, bd_transactions, and ~35 others the
-- client queries) was created outside migration history entirely, most
-- likely via the Supabase dashboard. Guessing owner-only policies onto those
-- from column-name inference alone risks breaking real sharing models this
-- audit already found evidence of (bd_projects/bd_files are workspace-shared,
-- bd_profiles is intentionally world-readable). Per instruction, ambiguous
-- ownership is flagged to the requester rather than guessed — see the
-- audit report for the full "tables not under migration control" list and
-- the live query needed to settle their actual RLS state before anyone
-- writes policies for them.

-- 1. bd_conversation_members: self-invite into any conversation via UPDATE.
--
-- The 0005 "update own membership" policy checks only that the row being
-- touched, and the row that results, both belong to auth.uid(). It never
-- pins conversation_id. A signed-in user who merely knows a target
-- conversation's uuid (not a secret — appears in realtime payloads, shared
-- links, screenshots, per 0014's own reasoning) can run:
--
--   PATCH bd_conversation_members?conversation_id=eq.<their-own-convo>&user_id=eq.<their-uid>
--   { "conversation_id": "<victim-convo-id>" }
--
-- which repoints their own membership row at the victim conversation. USING
-- passes (it's still their row), WITH CHECK passes (user_id is unchanged),
-- and afterwards bd_in_convo(victim-convo-id) is true for them, so every
-- message in that conversation becomes readable. This is the exact
-- vulnerability class 0014 closed for INSERT on this same table and for
-- UPDATE on bd_messages — the sibling UPDATE policy here was missed.
--
-- Fix: require that the resulting conversation_id is one they were already
-- a member of, the same guard 0014 added to bd_messages' update check.
drop policy if exists "update own membership" on public.bd_conversation_members;
create policy "update own membership" on public.bd_conversation_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.bd_in_convo(conversation_id));

-- 2. bd_conversations: any member can hijack created_by via UPDATE, which
--    reopens the door 0014 closed on bd_conversation_members' INSERT policy.
--
-- The 0005 "touch own conversations" policy allows any member to UPDATE any
-- column, checking only membership before and after — it never pins
-- created_by. A member (not the creator) can run:
--
--   PATCH bd_conversations?id=eq.<convo-id>  { "created_by": "<their-own-uid>" }
--
-- USING/WITH CHECK both pass (still a member either way). Once created_by
-- points at them, 0014's "add members you may add" policy — which trusts
-- created_by = auth.uid() as proof of the right to invite — now lets them
-- add arbitrary third parties into the conversation, exactly what 0014 was
-- written to prevent.
--
-- Fix: created_by is the ownership anchor other policies trust, so it must
-- be immutable after creation. A trigger, not a WITH CHECK, because a policy
-- has no access to the pre-update row to compare against.
create or replace function public.bd_conversations_lock_owner()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;

drop trigger if exists bd_conversations_lock_owner_trg on public.bd_conversations;
create trigger bd_conversations_lock_owner_trg
  before update on public.bd_conversations
  for each row execute function public.bd_conversations_lock_owner();

-- 3. app_secrets: belt-and-braces, not a fix for a known hole.
--
-- app_secrets (GEMINI_API_KEY and friends, read by the edge functions via
-- service_role) is never created in any migration — it was made in the
-- dashboard. Its own comment (supabase/functions/gemini-bot/index.ts) and
-- 0015's "already held shut" both say the live state is RLS-on-zero-policies,
-- which is the correct deny-all-but-service-role pattern and needs no
-- change. This line only asserts that state defensively, since a table
-- outside migration history can drift with no review trail — if the anon
-- role ever gained SELECT here, the Gemini key is directly extractable from
-- the APK's own anon credentials. IF EXISTS so this is a no-op in any
-- environment where the table hasn't been created.
alter table if exists public.app_secrets enable row level security;
