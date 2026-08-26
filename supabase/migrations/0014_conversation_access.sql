-- Two doors into other people's chats, closed.
--
-- Both come from `0005`, and both are policies that grant more than any screen
-- in the app ever asks for. Nothing here changes what the client can do — the
-- flows below were checked against `lib/messages.ts` and `components/Messages.tsx`
-- before the policies were narrowed.
--
-- 1. **Anyone could add themselves to any conversation.** The insert policy on
--    bd_conversation_members allowed `user_id = auth.uid()`, so a signed-in
--    account holding a conversation's uuid could insert its own membership row
--    and then read the whole history — bd_in_convo() would answer true from
--    that moment on. Nothing in the app inserts a self-membership row: a DM
--    goes through bd_start_dm and a group through bd_start_group, both
--    SECURITY DEFINER and both writing the creator's row themselves. The only
--    direct insert is `addPeople` in components/Messages.tsx, which adds other
--    people and is covered by the created_by branch that stays.
--
--    A uuid is not a secret. It appears in a shared link, a screenshot, a bug
--    report and a realtime payload, and "you would have to know it" is not an
--    access control.
--
-- 2. **An author could move their own message into someone else's chat.** The
--    update policy checked `author_id = auth.uid()` and nothing about the
--    conversation, so an UPDATE that also rewrote `conversation_id` landed the
--    message in any conversation whose uuid the author knew, where every member
--    would then read it. Edit, unsend and restore all leave conversation_id
--    alone, so requiring membership in the WITH CHECK costs them nothing.
--
--    The one behaviour change: after leaving a conversation you can no longer
--    unsend a message you left behind in it. That is the correct answer — the
--    record belongs to the room, and 0012's log keeps it either way.

drop policy if exists "add members you may add" on public.bd_conversation_members;
create policy "add members you may add" on public.bd_conversation_members
  for insert to authenticated
  with check (exists (
    select 1 from public.bd_conversations c
     where c.id = conversation_id and c.created_by = auth.uid()
  ));

drop policy if exists "edit own messages" on public.bd_messages;
create policy "edit own messages" on public.bd_messages
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid() and public.bd_in_convo(conversation_id));
