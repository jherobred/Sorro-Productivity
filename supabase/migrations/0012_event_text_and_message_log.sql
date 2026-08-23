-- Two unrelated things that both needed a column, done in one pass.
--
-- 1. Event text colour. `bd_events.color` has always been the *background*, and
--    the chip drew its label in the theme's text colour on top — which is
--    unreadable on a light swatch in dark mode and vice versa. `text_color`
--    null keeps the old behaviour (the app picks a readable one); a value
--    overrides it.
--
-- 2. A record of what happened to a message.
--
--    Messages can now be edited, taken back and restored, and people can report
--    one. Every one of those is a way to make evidence disappear: edit the
--    sentence, unsend it, and to everyone else it never existed. So the history
--    is kept somewhere the person who wrote it cannot reach.
--
--    **Written by a trigger, not by the client.** A log the app writes is a log
--    a modified client simply does not write, and the whole point is the person
--    acting badly. The trigger runs inside the same transaction as the change,
--    so there is no version of events where the edit lands and the record does
--    not.
--
--    **Nobody can read it through the API.** RLS is enabled with no SELECT
--    policy at all, which denies every request from `anon` and `authenticated`.
--    The service role bypasses RLS, so the admin panel this is for reads it
--    server-side and nothing else can.

alter table public.bd_messages
  add column if not exists edited_at timestamptz;

alter table public.bd_events
  add column if not exists text_color text;

alter table public.bd_events
  drop constraint if exists bd_events_text_color_len,
  add constraint bd_events_text_color_len check (text_color is null or char_length(text_color) <= 32);

/* ------------------------------------------------------------------- log */

create table if not exists public.bd_message_log (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null,
  conversation_id uuid not null,
  author_id       uuid not null,
  /** Who did it. Not always the author - a group admin may remove somebody's
      message, and that is exactly the case worth recording. */
  actor_id        uuid,
  action          text not null check (action in ('edit', 'delete', 'restore')),
  body_before     text,
  body_after      text,
  attach_path     text,
  at              timestamptz not null default now()
);

create index if not exists bd_message_log_msg on public.bd_message_log (message_id, at desc);
create index if not exists bd_message_log_actor on public.bd_message_log (actor_id, at desc);

alter table public.bd_message_log enable row level security;
-- Deliberately no policies. RLS with none denies everything to anon and
-- authenticated; the service role bypasses RLS and is how the admin panel will
-- read this. A policy added later should be for an admin claim, never for
-- `authenticated`.

create or replace function public.bd_log_message_change()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare act text;
begin
  if tg_op = 'DELETE' then
    act := 'delete';
  elsif old.deleted_at is null and new.deleted_at is not null then
    act := 'delete';
  elsif old.deleted_at is not null and new.deleted_at is null then
    act := 'restore';
  elsif old.body is distinct from new.body then
    act := 'edit';
  else
    -- Everything else is bookkeeping (a read receipt bumping a timestamp, say)
    -- and logging it would bury the three things that matter.
    return coalesce(new, old);
  end if;

  insert into public.bd_message_log
    (message_id, conversation_id, author_id, actor_id, action, body_before, body_after, attach_path)
  values (
    old.id, old.conversation_id, old.author_id, auth.uid(), act,
    old.body, case when tg_op = 'DELETE' then null else new.body end,
    old.attach_path
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists bd_messages_log on public.bd_messages;
create trigger bd_messages_log
  after update or delete on public.bd_messages
  for each row execute function public.bd_log_message_change();

/* --------------------------------------------------------------- reports */

create table if not exists public.bd_message_reports (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null,
  conversation_id uuid not null,
  reporter_id     uuid not null default auth.uid(),
  reason          text not null check (reason in ('spam', 'harassment', 'explicit', 'scam', 'other')),
  note            text not null default '',
  status          text not null default 'open' check (status in ('open', 'reviewed', 'actioned')),
  created_at      timestamptz not null default now()
);

-- One report per person per message. A second press is not a second report,
-- and letting it be one turns the queue into a popularity contest.
create unique index if not exists bd_message_reports_once
  on public.bd_message_reports (message_id, reporter_id);

alter table public.bd_message_reports enable row level security;

drop policy if exists "report a message" on public.bd_message_reports;
create policy "report a message" on public.bd_message_reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and public.bd_in_convo(conversation_id));

drop policy if exists "see my own reports" on public.bd_message_reports;
create policy "see my own reports" on public.bd_message_reports
  for select to authenticated
  using (reporter_id = auth.uid());
