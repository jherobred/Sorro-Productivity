-- Basedly's resident bot.
--
-- Threads and Challenges are social surfaces, and a social surface with one
-- user in it is a diary. The bot posts news-shaped items every five hours,
-- app tips every two, and sets one or two student challenges a week — enough
-- that the tabs have a pulse before anyone else arrives.
--
-- Why an auth user rather than a flag: bd_threads.author_id and
-- bd_challenges.owner_id both reference auth.users, and loosening those so a
-- non-user could write would weaken the constraint that protects every real
-- row. A confirmed account with no password and no identity provider cannot be
-- signed into — it exists only so the foreign keys have something to point at
-- and the existing RLS keeps working unchanged.
--
-- The id is fixed so the client can recognise the bot without a lookup. It must
-- match BOT_ID in lib/bot.ts.

begin;

insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
)
values (
  '00000000-0000-4000-8000-00000000b07d',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'bot@basedly.internal',
  -- Not a hash of anything. There is no password to check against it, and no
  -- identity row, so no sign-in path reaches this account.
  '', now(),
  '{"provider":"system","providers":["system"]}'::jsonb,
  '{"name":"Gemini"}'::jsonb,
  now(), now(), false, false
)
on conflict (id) do nothing;

insert into bd_profiles (user_id, name, handle, bio, course, year, campus, timezone, interests, onboarded_at)
values (
  '00000000-0000-4000-8000-00000000b07d',
  'Gemini', 'gemini',
  'Campus news, app tips, and a challenge or two a week.',
  'Basedly', '—', '—', 'Asia/Manila',
  array['news', 'tips', 'challenges'],
  now()
)
on conflict (user_id) do update
  set name = excluded.name,
      handle = excluded.handle,
      bio = excluded.bio;

commit;

-- To remove the bot and everything it wrote:
--   delete from auth.users where id = '00000000-0000-4000-8000-00000000b07d';
-- The cascades take its profile, threads and challenges with it.
