-- Put every table the app reads into the realtime publication.
--
-- Eleven tables were in it — the community feed and project cards — and every
-- personal table (tasks, calendar, notes, habits, money, files, the gym, the
-- journal) was not. So a change made on the desktop reached the phone only when
-- staleTime expired *and* the window happened to be focused, which on a phone
-- with the app already open never happens. That is the sync delay: not slow,
-- absent. lib/realtime.ts has the client half.
--
-- RLS still decides who hears what: Realtime evaluates the same policies per
-- subscriber, so a personal table broadcasts each row only to its owner.
--
-- Deliberately NOT setting `replica identity full`. It would double the WAL for
-- every update to carry the old row, and the only thing the client does with an
-- event is invalidate a query key — it never reads the payload. The cost of
-- that choice is that DELETE events carry the primary key alone and can be
-- filtered out by RLS; almost every delete in this app is a soft delete (an
-- UPDATE of deleted_at), which is delivered normally.

do $$
declare t text;
begin
  foreach t in array array[
    'bd_tasks','bd_subtasks','bd_lists','bd_events','bd_goals','bd_milestones','bd_terms',
    'bd_habits','bd_habit_ticks',
    'bd_notes','bd_notebooks','bd_note_tags','bd_canvases','bd_canvas_nodes','bd_canvas_edges',
    'bd_journal_entries','bd_journal_photos','bd_scratch',
    'bd_transactions','bd_accounts','bd_budgets','bd_to_buy','bd_subscriptions',
    'bd_body_days','bd_meals','bd_workouts','bd_workout_sets','bd_gym_days',
    'bd_projects','bd_cards','bd_project_comments','bd_project_members',
    'bd_files','bd_folders','bd_java_files',
    'bd_posts','bd_threads','bd_post_likes','bd_thread_votes',
    'bd_post_comments','bd_thread_replies','bd_post_saves',
    'bd_conversations','bd_conversation_members','bd_messages',
    'bd_people','bd_profiles','bd_notifications',
    'bd_workspaces','bd_workspace_members',
    'bd_challenges','bd_challenge_members','bd_challenge_days','bd_challenge_stars'
  ]
  loop
    -- Idempotent: eleven of these are already members, and adding one twice is
    -- an error that would take the whole migration down with it.
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
