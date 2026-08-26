-- Three tables answered a signed-out request with real rows.
--
-- Verified against production with nothing but the publishable key that ships
-- in `.env.production` — no session, no token, one GET:
--
--   bd_challenge_stars  0004  `for select using (true)`
--   bd_challenge_days   0006  `for select using (true)`
--   bd_ranked           base schema, policy not in this repo
--
-- Every other bd_* table returned `[]`, which is RLS doing its job. These three
-- returned user ids paired with what those people did and when: a day-by-day
-- activity series, who starred what, and everyone's RP, peak RP and win/loss
-- record. `bd_profiles` reads `to authenticated`, so the ids do not resolve to
-- names anonymously — but a stable per-person id plus a daily activity trace is
-- exactly the shape of thing that correlates with an id found somewhere else.
--
-- `using (true)` was deliberate and it is still right: a leaderboard nobody can
-- see is not a leaderboard, and the Arena has to read everyone's row. What was
-- never intended is that "everyone" included the open internet. Every screen
-- that reads these requires a session, so nothing in the app changes.
--
-- A REVOKE rather than a rewritten policy, for two reasons: bd_ranked's policy
-- was created outside this repo and this migration does not know its name, and
-- a grant is a coarser gate than a policy — it fails the request outright
-- instead of evaluating a predicate per row. `app_secrets` is already held shut
-- this way and answers 42501, which is the behaviour being copied.

revoke select on public.bd_challenge_stars from anon;
revoke select on public.bd_challenge_days  from anon;
revoke select on public.bd_ranked          from anon;
