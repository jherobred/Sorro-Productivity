-- A challenge you joined shows up in your habits.
--
-- `bd_challenge_members.habit_id` has pointed at a habit since messaging
-- landed, and nothing ever filled it in: joining a challenge left you with a
-- scoreboard in Community and no row on the page you actually open every
-- morning. So people joined and then forgot, which is the failure mode the
-- whole section exists to avoid.
--
-- This is the other end of that link. A habit knows which challenge it mirrors,
-- so the Habits page can group Personal and Challenges without reading a second
-- table, and `metric: 'habit'` challenges can count *that* habit rather than any
-- tick you happen to make.
--
-- `on delete set null` rather than cascade: deleting a challenge must not take
-- somebody's streak with it. The habit survives as a plain personal one.

alter table public.bd_habits
  add column if not exists challenge_id uuid
    references public.bd_challenges(id) on delete set null;

-- One mirror per challenge per person, so a double-tap on Join cannot leave two
-- identical habits behind. Partial, because every ordinary habit is null here
-- and a plain unique index would allow only one of those.
create unique index if not exists bd_habits_challenge_once
  on public.bd_habits (user_id, challenge_id)
  where challenge_id is not null;

create index if not exists bd_habits_challenge
  on public.bd_habits (challenge_id) where challenge_id is not null;
