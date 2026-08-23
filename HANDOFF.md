# Basedly — session handoff

Written for whoever picks this up next, human or model. Read this before
touching anything; it is the difference between fixing a bug and re-fixing one.

Last updated: 2026-08-23 (accounts are reachable from every layout, profiles
have links, and a challenge you join shows up in Habits).

---

## The goal

Basedly is a student productivity app with a social layer, built from a Claude
Design prototype. It ships as **both** a Vercel-hosted web app and a Capacitor
Android APK from one `next build` (`output: 'export'`), live-synced through
Supabase.

The current arc is: take a UI that was faithful to the prototype but shallow,
and make every surface actually work — full CRUD everywhere, no dead controls,
no data loss, and interaction patterns lifted from the apps students already
know (Google Calendar, Notion, Obsidian, OneNote).

---

## Current state

**Live and working.** Production is `basedly-web` on Vercel, deployed from
`master` on push. Supabase project `basedly` (`jdkbnsjczanvmmpsovhm`) — note
that `jhems-os` is a *separate* project holding an unused copy plus the shared
`app_secrets`; check the env file before assuming which one you are in.

Working end to end:

- Full CRUD on Money (3 tabs), Threads, Posts, Projects, Files, Challenges,
  People, Tasks, Notebooks.
- Calendar: 24-hour scrolling grid, Google-style click bubbles, month/week/day.
- The Gemini bot: deployed Edge Function `gemini-bot`, three `pg_cron` jobs
  (tips 2h, campus 5h, challenge Mondays). Verified posting real rows.
- Realtime presence, workspaces, profile photos, rank-up card, APK update
  channel (manifest in the `bd-releases` bucket).

**Known incomplete** — see "Next step" below.

---

## Architecture facts that will bite you

These are the non-obvious ones. Every one of them cost a debugging session.

1. **A note is one markdown document, and every write is an upsert.** This is
   the 2026-08-19 rewrite, and it is what ended the note-loss saga. The old
   editor kept every paragraph as a row in `bd_note_blocks`; a block written
   before its own note's row had landed failed the foreign key, the rollback
   took the characters with it, and production ended up with eight notes and
   zero blocks. `SAVE_NOTE` in `lib/notes.ts` upserts, so a save can never lose
   a race with its own insert, and it deliberately has **no `onError`
   rollback** — restoring the previous cache after a failed save means
   replacing what the user just typed with an older copy of their own note. Do
   not "fix" that missing rollback.

   **`settler()` in `lib/settle.ts` still guards every other invalidate.** Do
   not go back to `onSettled: () => qc.invalidateQueries(...)`. A refetch
   started by one write lands after a later write's optimistic update and
   overwrites it. `isMutating() > 1` means others are still in flight; the last
   one out does the refetch.

   **And the settler is necessary, not sufficient.** It only counts in-flight
   *mutations*; a pending debounce timer is not a mutation, so the window where
   a keystroke lives only in the cache is invisible to it. `lib/notes.ts` keeps
   a `pending` map of typed-but-unwritten text and overlays it on every read, so
   no refetch source can drop an unconfirmed keystroke. Do not remove the
   overlay thinking the settler covers it — it does not.

   The editor's flush effect is keyed on `note.id` with the save read through a
   ref. Depending on the callback prop instead ran the cleanup on *every*
   keystroke, flushing the debounce instantly and firing one write per
   character. If a burst of typing turns back into forty writes, that
   dependency regressed.

2. **`main` has `zoom`** (the font-scale/density pref) **and a page-entry
   transform.** Either makes it the containing block for `position: fixed`, so
   anything fixed rendered inside it is positioned relative to `main`, not the
   viewport. Menus and popovers **must** portal to `document.body`
   (`ContextMenu.tsx`, `CalPopover.tsx` already do).

3. **Optimistic writes must patch every cached window.** `lib/events.ts` keys
   queries `[...EVENTS_KEY, weekStart, days]`; an optimistic helper that
   rebuilds a shorter key writes where nothing reads. Use
   `getQueriesData({ queryKey: PREFIX })`.

4. **Dev fixtures need `NEXT_PUBLIC_DEV_FIXTURES=1` in `.env.local`** — there
   is no `?fx=1` query parameter, whatever older notes say. They disable
   `invalidateQueries` entirely and stub
   `currentUserId()` to `'me'`. Pages pass an inline `queryFn`, which beats the
   fixture default, so any refetch in fixture mode hits a signed-out Supabase
   and returns `[]`. Seeding happens *before* `Providers` renders children —
   moving it back into an effect reintroduces a race that blanks Tasks and
   People.

5. **`bd_notes.body` *is* the note.** Markdown, one row. `bd_note_blocks`,
   `bd_note_links` and `bd_sections` are the old model and nothing reads them —
   they are left in place holding whatever they hold. Previews, word counts,
   backlinks and the graph edges are all parsed out of `body` by `lib/md.ts`.
   `bd_notes.section_id` is nullable and dead; `notebook_id` is what a note
   belongs to.

6. **Running `npm run build` while a dev server is up wipes `.next`** and the
   dev server starts 404ing its own chunks. Restart the dev server after any
   production build. `.claude/launch.json` has `autoPort: true` so a second
   server does not fight over 3000.

7. **`bd_events.source` is a CHECK constraint, and the app writes values it
   did not list.** It allowed `('manual','timetable','task')` while the
   timetable scanner wrote `'schedule_scan'` and the Google sync wrote
   `'gcal_ics'` — so every row either of them inserted was refused, the whole
   batch with it, and production held 31 events all of them `'manual'`.
   Widened in `0007`. If you add a fifth writer, add its name there in the same
   commit, and remember that a Postgres check failure takes down the *entire*
   multi-row insert, not the offending row.

8. **Realtime is one channel, owned by the session.** `useLiveSync()` in
   `lib/realtime.ts`, mounted once by the Shell, with a binding per table and
   invalidation by *query-key prefix* (`bd_tasks` → `['tasks']`). Do not go back
   to a `useRealtime(table, key)` per screen: two screens that want the same
   table open two channels on one Phoenix topic and race, which is exactly what
   Messages and the MessengerDock were doing. A table not in the
   `supabase_realtime` publication is silent however good the client is — that
   was the whole sync bug, and `0009` is the fix.

9. **Anything in the chrome must exist on both layouts.** The account switcher
   shipped in the desktop sidebar only, and a phone has no sidebar — so the
   feature was complete, tested, and unreachable for most of the app's use. If a
   control is the only way to do something, it belongs somewhere both layouts
   render: the header, or a sheet both can open. `AccountSheet` is that pattern.

10. **The browser pane does not composite when hidden** — CSS animations sit at
   `currentTime: 0`, so `getBoundingClientRect()` on anything with an entry
   animation reports the *from* keyframe. Neutralise animations before
   measuring, or you will chase phantom layout bugs. (`.pop` starts at
   `scale(.4)`.)

---

## Touched 2026-08-23, fourth pass (accounts reachable, links, challenge habits)

**The account switcher was built and unreachable.** Last pass put it in a menu
at the foot of the **desktop sidebar** — and a phone has no sidebar, so on the
layout this app is mostly used in there was no way to switch account, add one,
or sign out at all. It was reported as "I still don't see the account switching
thing", and that was exactly right.

`components/AccountSheet.tsx` is now the one place all of it lives: your face,
your handle, your shareable link, every account signed in on this device, the
space switcher, Settings and Sign out. It opens from **your own picture in the
top right**, on both layouts, and from a card at the top of More. The sidebar's
inline menu is gone rather than duplicated — one room, three doors.

Two hardcoded identities went with it: the desktop header drew a disc reading
`MR` on every account, and `PhoneHome` fell back to the initials `MR` when a
name was missing. Both read `useMyIdentity()` now (`lib/people.ts`), which is
one cached query the header, More and the sheet share.

**Always fullscreen, on the web.** `useAlwaysFullscreen(prefs.alwaysFullscreen)`
in `lib/appUpdate.ts`. The App tab has had a fullscreen *button* for a while
with a comment explaining why it could not be a switch — the Fullscreen API only
answers to a user gesture, so a remembered "on" would come back to a screen that
was plainly not fullscreen. The way round it is not to ask on load: arm a
one-shot listener for the first `pointerdown`/`keydown`/`touchstart` of the
session and ask inside *that*. In practice that is the person opening their
first tab, so it reads as launching fullscreen. Native is exempt — the APK is
already edge to edge. There is a row for it in More as well, and toggling it on
*there* takes effect immediately, because that tap is itself a gesture.

**The avatar builder is behind an icon.** Eleven categories and a swatch grid
took half the Profile page permanently, for something most people set once. The
page is your name, handle, picture and link; the workbench opens on a pencil.

**Shareable profile links, and an inbox that is not everybody.** These are one
change, because they are one problem.

`PeoplePicker` listed **every profile in the database** — `bd_profiles` is
world-readable, so the list was free. That makes a stranger and a groupmate the
same single tap: nobody is a contact because everybody already is.

- The default list is now **people you have actually met** — `useKnownPeople()`
  derives it from conversations you share, projects you are both on, and
  challenges you both joined. No friends table, no accept step: the connection
  is something you both already did, so there is nothing to approve.
- Challenge membership is filtered to *your* challenges in a second query rather
  than read whole. A public challenge with two hundred people in it would
  otherwise put two hundred strangers straight back in the list.
- Anyone else is found **by handle only**, minimum two characters, prefix match,
  and deliberately **not by name** — a name search over every profile is a
  directory, and a directory is what made everyone a contact.
- `profileLink()` builds `/profile/?u=<handle>`. A query parameter, not
  `/u/[handle]`: this is a static export and handles are made after the build.
  `?u=` renders a read-only card with one button on it — Message them.

**The link had to survive the sign-in wall.** `/profile/` is inside the
auth-gated shell, so opening somebody's link while signed out bounced you to
sign-in and then to Home — the link worked for everyone except the person it was
sent to. The gate stashes `pathname + search` in sessionStorage and
`/auth/callback/` returns you there. The stored value must match `/^\/[^/]/`
before it is used, so it can never become an open redirect.

**A challenge you join lands on your Habits page.** `0011_challenge_habits.sql`
adds `bd_habits.challenge_id` with a *partial* unique index
(`where challenge_id is not null`) so a double-tap on Join cannot leave two
mirrors. `enrol()` in `lib/challenges.ts` runs on create and on join; leaving
archives the mirror rather than deleting it, because the ticks are yours and a
streak should not vanish because you stepped out of somebody's sprint.

**Which challenges get the scoring link is the load-bearing detail.**
`bd_challenge_members.habit_id` has existed since messaging landed and was never
filled in — and `bd_habit_tick` already recomputes a member's progress as the
number of ticks of their linked habit in the window. So the plumbing was there;
only the connection was missing. But that recomputation is *right* only for
`habit` and `manual` metrics. Link a `steps` or `task` challenge and ticking a
square would overwrite a real count with "how many times you tapped". So every
challenge gets the habit row; only those two get `habit_id`, and lib/metrics.ts
keeps owning the rest. `Challenges.tsx` also stopped passing `null` as the
habit id to `useMyMetric`, which meant a "habit" challenge counted *any* tick
you made.

The Habits page splits at a divider: **Yours**, then **From challenges** with a
chip saying what each one counts. A mirror has no Delete — deleting it would
leave you in the challenge with nothing to tick — it has a chevron to the
challenge instead.

**Messages, on a phone.** `MessengerDock` is desktop-only for good reasons (it
would sit on the phone's own navigation, and a 328px window inside a 375px
screen is just the screen with a border), so the phone had nothing and answering
a message meant leaving the page you were on. `components/MessagesSheet.tsx` is
the phone's answer and is deliberately **not** a floating bubble: a count on a
header icon, and the conversation full screen when you ask for it. Nothing
hovers over anything.

**Also**: the notification panel hung off the left edge of a phone — it was
340px anchored `right: 0` to a 34px button a few pixels from the screen edge, so
its left edge landed off-screen and "NOTIFICATIONS" was cut in half.
`maxWidth: calc(100vw - 28px)` never helped because 340 was already under that;
the overflow was in the *position*. It is pinned to the viewport on phones now.

**Migrations applied to production**: `0011_challenge_habits.sql`.

**Verified in the browser (fixture mode).** The account sheet opening from the
header face on desktop and from the More card on a phone, flush to the bottom at
360px once the entry animation is neutralised. More's settings list reading
Light mode / Always fullscreen / Customise nav / All settings. The phone header
carrying Messages (1 unread), Notifications (4 unread), Capture and your face —
no cog. The notification panel measured inside the viewport (17→358 of 375). The
messages sheet full bleed at 375×812 with the chat list in it. Habits showing
YOURS 3 then FROM CHALLENGES 2, chips reading "A habit kept" and "Gym days". The
picker listing only Bea/Jules/Rain by default, finding `@csss` on "css", and
finding **nothing** for a stranger searched by name. Profile's builder hidden
until the pencil, and `?u=` rendering the not-found card (signed out, which is
what `bd_profiles`' `to authenticated` read policy gives an anonymous client —
the found path needs a session and was not exercised). All seven check files
pass; `tsc` and `next build` are clean.

**Not verified signed in**: every write, the switcher's `setSession` round trip,
the post-sign-in return to a shared link, and a real challenge writing its
mirror habit.

---

## Touched 2026-08-23, third pass (Body as one page, live sync, accounts)

**The sync delay was not slowness, it was absence.** Only eleven tables were
ever in the `supabase_realtime` publication — the community feed and project
cards — and only four screens opened a channel. Tasks, calendar, notes, habits,
money, files, the gym and the journal had no live path at all, so a phone and a
desktop on the same account agreed only after `staleTime` expired *and* the
window happened to be focused, which on a phone with the app already in front of
you never happens. `0009_realtime_everywhere.sql` puts 54 tables in the
publication and `lib/realtime.ts` is now one channel owned by the session rather
than one per screen (`useLiveSync()`, mounted in `Shell`). Table `bd_x` maps to
query prefix `['x']`; TanStack's prefix matching covers every window a screen has
cached, which is fact 3 enforced rather than restated. A `visibilitychange`
backstop refetches active queries when you come back to the app, because
`focus` does not fire on a phone returning from the background.

*Side effect worth knowing*: `Messages` and `MessengerDock` both called
`useRealtime('bd_conversations', CONVOS)`, so two channels raced for one Phoenix
topic on one socket. That cannot happen now — there is one.

**Toasts sat on the phone's navigation.** `ToastHost` was pinned 22px off the
bottom on every layout; `BottomNav` occupies roughly the bottom 66px on a phone.
So every "Deleted · Undo" landed on the section icons and a tab covered the Undo
button. It clears the bar on phones now.

**A client-side exception no longer takes the whole app down.** Production was
showing Next's default — "Application error: a client-side exception has
occurred" — which is the same sentence for a null dereference, a corrupt cache
and a bad deploy, and it asks the person least able to open a console to go and
open one. `components/Crashed.tsx` plus `app/(shell)/error.tsx` and
`app/global-error.tsx` show the real message, the digest and the top of the
stack, with Copy details and **Clear saved data**. That last one matters: the
whole TanStack cache is persisted under `basedly-cache` with `maxAge: Infinity`,
so a row cached in a shape an older build wrote survives every reload and every
deploy — a sticky, per-device failure that looks exactly like "broken for me and
nobody else". **The reported Messages crash was not reproduced**: production
holds one conversation, two members and zero messages, the schema matches what
the client selects, and nothing in that render path throws on that data. The
boundary is what will name it next time it happens.

**Body is one page now.** It was a tab rail over three panes — Today and Eaten in
Basedly's lavender cards, Trained in openGym's black tracker inside a rounded,
bordered box. The section that mattered most looked like a different app seen
through a window cut into this one. There are no tabs and no pane: the whole tab
is openGym's black ground with everything laid on it in one scroll — today, water
and sleep, training, fuel, progress.

The seam closed with **one block, not a rewrite**. `app/gym.css` maps Basedly's
own `--card` / `--line` / `--tx` / `--acc` onto openGym's surfaces inside
`.ogym`, so the rings, the glass, the sleep arc and the meal sheet came across
without a single component being edited. Anything portalled out of the page —
`MealSheet`, the exercise sheets — carries `className="ogym"` or it comes back
wearing lavender on a black tab.

`components/body/Gym.tsx` no longer exports a screen. It exports `useTraining`
(the state), `TrainCard`, `ProgressCards` and `TrainingOverlays`, so the page can
put Fuel between two of them. Plan and Exercises were destinations behind a
segmented control; they are sheets.

**The exercise demos are photographs.** openGym pulls ~140 MB of GIFs on first
launch, which a Capacitor APK off a static export cannot do, and the previous
answer — nine drawn line-art patterns — made a bench press and a dumbbell fly the
same picture. `public/ex/<id>-0.jpg` and `-1.jpg` are the start and finish of
each of the 40 movements, crossfaded on a slow beat, which is what the GIF was
communicating at 5.2 MB for the catalogue rather than 140. From
**yuhonas/free-exercise-db**, which is Unlicense (public domain), so it ships
inside an APK with no notice. `ExerciseShot` falls back to `ExerciseArt` for a
movement typed in by hand — that is the normal case, not a failure.

*This was decided against the agreed plan of a Supabase bucket, and the reason
is that the premise changed*: two stills per exercise is 5.2 MB, not 140 MB, so
bundling costs almost nothing and buys offline, no bucket policy to get wrong
(see the `bd-feed` vs `bd-files` note above for how easy that is), and no
runtime failure mode. `shotOf()` in `lib/lift.ts` is the one place to change if
they ever move.

**More than one account, one tap apart.** `lib/accounts.ts`. Supabase keeps one
session; this keeps a copy of every session signed into on the device and
switching is `setSession()`. Two things it would be easy to get wrong:

- **Refresh-token rotation.** Supabase issues a new refresh token every time one
  is used and invalidates the old one, so a copy taken at sign-in is worthless an
  hour later. `remember()` is wired to `onAuthStateChange`, which fires on every
  refresh. Store it once at sign-in instead and switching back fails days later
  with nothing to point at.
- **`prompt: 'select_account'`.** Without it Google returns the account already
  signed in there and "Add another account" appears to do nothing.

Switching **reloads the page on purpose**. The query cache, its persisted copy,
the prefs store, the cached user id, the realtime socket and the presence channel
are all keyed to whoever was signed in; tearing each down by hand is six chances
to leave one holding the previous account's rows, and a balance from the wrong
account is the worst bug this app could have. `remember()` returns true when the
signed-in account *changed*, and that is what triggers it — clearing localStorage
does nothing to a cache already in memory, and coming back from Google is a
client-side route change, not a fresh document.

**Full screen on a phone.** `overlaysWebView: true` on the StatusBar plugin (the
webview started below the status bar, so the app was a page in a grey frame) plus
`values-v27/styles.xml` for `windowLayoutInDisplayCutoutMode: shortEdges`. The
Shell frame is already exactly 100dvh with `env(safe-area-inset-*)` padding, so
it can be handed the whole display. On the web, `public/manifest.webmanifest` +
`appleWebApp` metadata make it installable, which is the only way to lose a
browser's address bar. **`adjustMarginsForEdgeToEdge` does not exist in Capacitor
8** — the CLI's android config has 17 keys and that is not one of them; `tsc`
catches it because `capacitor.config.ts` is in the tsconfig include.

**The schedule scanner read classes and threw the rest of the week away.** Its
prompt said, in as many words, "ignore breaks, vacant slots, lunch, and anything
that is not a scheduled class". Point it at a screenshot of a real calendar and
it returned the five subjects and dropped Wake Up, Travel Time, the gym and the
evening shift — most of the week, and the half that moves. Now:

- Every block with a time on it is read, and each carries a `kind` enum
  (`class | lab | travel | personal | work | break | other`), which the review
  screen turns into a colour and a chip so one tick drops a whole category.
- Explicit instructions for a **calendar-app screenshot**: the column gives the
  day, the hour labels give the time, and the time printed inside the block is
  the truth — do not re-derive it from the geometry.
- `maxOutputTokens` 8192 → 32768. A whole week with the literal source text on
  every row runs well past 8192 and a JSON answer cut off mid-object does not
  parse; the symptom is "the model returned prose, not JSON" on exactly the busy
  timetables the feature exists for. `finishReason: MAX_TOKENS` now says so
  instead. Entry cap 60 → 150.
- **`readRange()` in `lib/schedule.ts` reads both ends of a block together.**
  Reading each end alone is what broke every non-academic row: the timetable rule
  that a bare hour under seven is the afternoon turned "Travel Time 6 - 7" into
  18:00–07:00, a range that ends before it starts, and the review screen flagged
  a perfectly legible commute as unreadable. A pair is one fact, so it is decided
  as one — take the afternoon reading when it makes a coherent block, the literal
  one when it does not. `node lib/schedule.check.ts` asserts both directions.

Deployed as `schedule-scan` **version 2**, `verify_jwt` on.

**Projects: a folder gets a face and a project gets people.** `0010_project_look.sql`
adds `icon` and `cover` to `bd_projects` — one string each, told apart by shape
(`''` / `ic:proj` / `grad:dusk` / a storage path / an emoji). Prefixes rather
than a `kind` column because nothing ever queries it. `components/projects/Look.tsx`
draws them and holds the picker: any emoji you can type, thirty of the app's own
icons, six Notion-style gradient covers, or upload a picture.

`components/projects/Crew.tsx` replaces three avatars that read **MR, JL and RT**
— a literal array in the JSX, the same three initials on every project on
everybody's screen. Every card drew "MR" as its assignee for the same reason.
`bd_project_members` existed the whole time; this reads it, and a green ring
means that person has the board open right now (off the presence channel the app
already joins). Cards show their real `assignee_id` or say "Unassigned".

**The mascots race now.** The trail drew eight heads at 32px breathing gently on
a chart, which is a standings list with pictures on it. Each animal that has
covered ground leans into it, gallops, and kicks dust back down the lane; the
leader goes visibly harder; the finish is a chequered post; each name chip
carries the gap to the leader so the reader is not doing subtraction. Lanes and
animals grew with it (46/54px, 62px lanes) — a 32px head cannot carry a lean.
`Challenges` **opens on the trail** rather than the standings, because the race
was behind a toggle most people never found.

The rule the moods are built on is unchanged and is why `components/Buddy.tsx`
is safe to put on pages people open on bad mornings: **the face comes from
whether you did the thing recently, never from how you compare to anyone.** Buddy
is on Habits (days since anything was ticked) and Home (days since a task was
completed — `completed_at` is now in the tasks select, one word, so the signal is
real rather than inferred).

**Migrations applied to production**: `0009_realtime_everywhere.sql`,
`0010_project_look.sql`.

**Verified in the browser (fixture mode).** Body: ground `rgb(0,0,0)`, cards
`rgb(28,28,30)` at 14px, accent `#30d158`, h1 34px, no tab rail, no `.ogym-ground`,
`--card` remapped to `#1c1c1e` inside `.ogym`; the exercise sheet listing 40 rows
with 80 real photographs (850×567) and 50px thumbnails; the guided session's demo
card 320px with `bench-0.jpg` loaded and the two hint pills still 25px (a bare
`> span` selector would have stretched them to 320 — hence `.og-shot`). Projects:
emoji and app-icon folder faces, the dusk cover at 109px, "You · owner",
`@juleslopez` / `@raintol` as real assignees. Challenges: 7 racing animals with
dust and speed lines, 46/54px on the trail and 34px in the standings, gap chips
(−4, −5, −8), no sideways scroll at 375px. Habits and Home each draw a rabbit.
All five check files pass, `tsc` and `next build` are clean, and the export
carries 80 images, the manifest and both error-boundary chunks.

**Not verified signed in**, as always in fixture mode: every write, the account
switcher's `setSession` round trip, and the schedule scanner against a real
calendar screenshot. Those are the first things to try.

**One measuring trap, a third time.** The browser pane does not composite when
hidden, so the page-entry transform on `main` sits at its *from* keyframe and
every `getBoundingClientRect()` under it reads wrong — the Body page measured
372.75px wide inside a 375px column, and the trail's walkers measured as
overflowing by 160px when they were comfortably inside. `offsetWidth` is honest;
`getBoundingClientRect()` is not. Neutralise the transform on `main` alone before
measuring — a blanket `transform: none !important` breaks the shell's own layout
and gives you a different set of wrong numbers.

---

## Touched 2026-08-23, second pass (openGym properly, attachments, the dock)

**The gym had openGym's features and none of its face.** The first pass read
sets back correctly on a lavender Basedly card, and that was the wrong call:
openGym is a black-ground, green-accent, iOS-shaped tracker and the shape *is*
the product. `app/gym.css` ports its design system out of that repo's
`frontend/src/index.css` — the real tokens (`#000` ground, `#1c1c1e` surface,
`#30d158` accent, 14px card radius, 26px tabular readouts), the week strip, the
segmented control, the stepper, the set row, the rest clock and the
GitHub-style year grid — every class prefixed `og-` and scoped under `.ogym`.
**The prefix is not tidiness**: openGym calls its classes `.card`, `.row`,
`.chip`, `.sheet` and `.tag`, all five of which already mean something else in
`globals.css`, and unprefixed this file would repaint half the app.

**What was deliberately not ported: openGym's fixed bottom tab bar.** Basedly
already owns the bottom of the viewport. Its five destinations became a
segmented control at the top of the section and its centre Start button became
the green pill beside them — same five places, same one-tap start, nothing
fighting the app it lives inside. The dock below is suppressed on phones for
the same reason.

`components/body/Gym.tsx` is openGym's three screens: Home (week strip, today's
split, body weight, streak), the guided session (demo, tags, last time, the
progression line, set rows, rest clock) and Stats (four tiles, the year, the
curve), plus Plan and Exercises. The weekly plan is `prefs.gymPlan`, seven
strings — no table, and it follows the account between devices. Progression is
double progression: hold the weight until every set hits the top of the range,
then add the smallest jump (`progression()` in `lib/lift.ts`, checked).

**The exercise demos are drawn, not downloaded.** openGym pulls ~140 MB of GIFs
from `hasaneyldrm/exercises-dataset` on first launch, under that dataset's own
terms. A Capacitor APK off a static export can do neither that nor a hotlink,
so `components/body/ExerciseArt.tsx` draws nine movement patterns as line art
on white with the worked muscle in red — a bench press and an incline press are
the same picture with the bench at a different angle. `Exercise.art` is the
key, so swapping in real images later means changing one component.

**Messages carry files.** Three controls on the composer: a photo, any file,
and one out of your Files. `0008` adds four columns to `bd_messages` rather
than a table — an attachment has no life of its own.

**The bucket choice is the load-bearing decision.** Storage RLS on `bd-files`
is `foldername[1] = auth.uid()` for *every* command, so an attachment left
there opens for the sender and 400s for everyone else — the worst kind of bug,
because the person who can test it is the one person it works for. Attachments
go to `bd-feed`, whose read policy is `bucket_id = 'bd-feed'`. Sending from your
Files therefore **copies** the object. That is deliberate: the alternative is
widening the read policy on the whole of `bd-files`, which would hand every
signed-in account the keys to everybody's private documents to save one round
trip.

**`components/MessengerDock.tsx`** is the bottom-right bar LinkedIn, Facebook
and Instagram all landed on: collapsed with an unread count, a list when you
open it, the conversation in the same box. Mounted in `Shell`, portalled to
`document.body` (fact 2, third time), and **desktop only** — on a phone it
would sit on Basedly's own navigation, and a 328px window inside a 375px screen
is just the screen with a border. `Thread` and `ChatList` are exported from
`Messages.tsx` and shared; `compact` drops the Leave button.

**Migrations applied to production**: `0008_message_attachments.sql`.

**Verified in the browser (fixture mode).** The gym's computed values against
openGym's own: ground `rgb(0,0,0)`, card `rgb(28,28,30)` at 14px, accent
`#30d158`, the today pill a 28px green disc with black text, h1 34px/700, the
big readout 30px/600. The guided session end to end — routine start, the demo
card white with its two corner hints, `Best: 76 kg`, `Last time: 60x8`, the
green "Last time you hit all reps · try 62.5 kg", a set arriving prefilled at
62.5x8, ticking it moving the header to `1/3 sets` and raising the `1:30`
clock. Stats: four tiles, a 12-month grid with Sep-to-Aug labels that scrolls,
the curve. At 375px the section fits in 345px with no sideways scroll and the
dock is absent. The dock at 328x505 portalled to BODY, its list, a thread with
all three attachment controls and no Leave, and the Files picker listing real
files with sizes and filtering. Both check files pass; `tsc` and `next build`
are clean.

**One measuring trap, again.** The pane does not composite when hidden, so CSS
*transitions* sit at their start value too, not only animations — the dock
measured 232px wide while its own inline style said 328px. Set
`transition: none` before reading a box, the same as for animations (fact 8).

---

## Touched 2026-08-23 (gym log, mascots, the trail, calendar repairs)

**The timetable import never once worked, and neither did the Google sync.**
Two bugs stacked on the same insert, both fatal, neither visible. `source:
'schedule_scan'` failed the check constraint above; and every occurrence of one
class carried the *same* `external_id` (`sched:<batch>:<row>`), which collided
on the unique index `bd_events_ext` from the second Tuesday onward. Either one
kills the whole batch. `ScheduleImport.save()` then fired the mutation
unawaited, announced "84 events added" and closed the sheet — so a refusal and
a success looked identical. It is `await mutateAsync` now, the sheet stays open
on failure, and the occurrence index is part of the id. Verified against
production in a rolled-back transaction: 15 weekly occurrences insert in one
statement.

**A multi-day run is draggable.** `spanRuns` merges same-title, same-hour
events on consecutive days into one bar, and the bar had `stopPropagation` on
pointerdown and no drag — the only thing on the grid you could look at and not
move. `A.moveRun(evs, dayDelta, hourDelta)` patches every member with one
shared offset and one Undo. The run is clamped by its own ends so half a bar
cannot walk off the week.

**Clear all events** is in the calendar toolbar behind three doors: a count, a
second confirmation, and a typed `CLEAR`. It is the same soft delete a single
event gets — `deleted_at`, with the ids read first so the toast can offer Undo.
The update itself carries no id list, because RLS already scopes it to you and
four hundred uuids in a URL is a request no proxy forwards.

**Every submenu in the app was invisible.** `ContextMenu`'s submenu was
`position: absolute; left: 100%` inside the menu, and the menu is
`overflowY: auto` — one axis not `visible` makes the other `auto` too, so the
child was laid out outside a box that clips. It portals to `document.body` now
with a measured position (measured, not `items.length * 38` — that guess is
already in “Things tried that did NOT work” and it has burned a session once), stops pointerdown so the
window's close listener does not unmount it before the click lands, and opens
on tap as well as hover because the APK has no mouse.

**The journal could not reach line twenty.** The textarea was `flex: 1` in a
column with an `autosize` helper writing `style.height` on every keystroke —
which the flex algorithm ignores, because it sizes flex items. So the box
stayed at whatever the leaf gave it, `overflow: hidden` cut the rest, and no
ancestor scrolled because none ever overflowed. It scrolls itself now;
`background-attachment: local` is what keeps the ruled lines under the words.

**The gym.** `lib/lift.ts` is the arithmetic (pure, `node lib/lift.check.ts`):
a forty-movement catalogue, Epley's 1RM, volume, and what you did last time.
`lib/gym.ts` is the rows, `0007` adds `bd_workout_sets`, and
`components/body/Gym.tsx` is the screen — a session you fill while standing at
the rack, the next set prefilled from the last, a rest clock on the tick, an
estimated max, a four-week heat grid. `GROUPS` in `lib/body.ts` now re-exports
`MUSCLES` from `lift.ts` so the catalogue and the body map cannot drift.
`numeric(6,2)` arrives from PostgREST as a *string*: `useSets` casts it, and
without that every volume concatenates instead of adding.

**Challenges have faces.** `lib/mascot.ts` (pure, `node lib/mascot.check.ts`)
picks one of eight animals from a user id and works out its mood.
`components/challenges/Mascot.tsx` draws it; `app/kinetics.css` gives it a
sub-two-pixel bob and a blink, both on `--anim` so the motion preference stops
them. **The rule the moods are built on is that position never makes a face
worse** — mood comes from whether that person moved recently, so somebody last
on the board who went this morning looks exactly like the leader. The check
file asserts it. The Arena is gone: a `rotateX` floor foreshortens, so equal
gaps looked unequal depending where they were, and it drew a race with nobody
in it. `Trail.tsx` is flat lanes with a creature on each, and the name pill
flips to the animal's left past halfway or the leader's name falls off the card.

**Also**: Gemini can be hidden from the feed (`prefs.hideBot`, a chip beside
the filters — its challenges stay); messaging picks people from a list instead
of asking you to spell a handle (`components/PeoplePicker.tsx`, used for a DM,
a group with its members chosen up front, and adding to an existing group).

**Migrations applied to production**: `0007_gym_and_import.sql`.

**Verified in the browser (fixture mode)**: the gym's routine start, prefill
(60 kg x 8 from last week), volume, TOP badge and rest clock; the mascots
rendering with distinct animals and moods; the trail's lane geometry measured
to stay inside the card; the hide-Gemini chip (9 posts to 7) and its pref; the
people picker and its search; the multi-day span drag (committed, with the
right toast); all three clear-all confirmations, including that a wrong word
aborts. Both check files pass, and `npx tsc --noEmit` and `next build` are
clean. **Not run signed in**: the writes, as always in fixture mode — but the
import's insert was proved against production inside a transaction that rolled
back.

**One environment note**: `three` was missing from the local `node_modules`
even though it is in `package-lock.json`, which fails `tsc` and the build at
`TrophyRoom.tsx:115` with no code change to blame. `npm i three@0.170.0
@types/three@0.170.0 --no-save` fixes it locally; Vercel's `npm ci` never had
the problem.

---

## Touched 2026-08-20 (challenges, Body, Money)

**Challenges count themselves.** This is the change everything else hangs off.
A challenge names a source and reads it — `lib/metrics.ts` has one query per
metric (tasks ticked, habits kept, workouts, steps, study blocks, no-spend
days, days written) and every one of them touches **only the signed-in user's
own rows**, because RLS means it can touch no one else's. Your session works
out your own day series and publishes the counts to `bd_challenge_days`; the
count travels, the data does not. `manual` is the fallback, not the default.

`lib/series.ts` is the day arithmetic (pure, `node lib/series.check.ts`).
`components/challenges/Arena.tsx` is the track — CSS `rotateX` on the floor and
an equal and opposite one on each token. Templates, duels, RP stakes, and a
podium the settled challenge draws on a canvas and posts to the feed.

**Three.js is in the app, in exactly one place.** `TrophyRoom.tsx` medals are
CSS; tapping one `import()`s three and lights a real cup. Verified after a
build: it lands in its own 676 KB chunk that nothing else references, so
/community's first load is 220 kB and only someone who opens the room pays.
There is a flat-medal fallback if the import fails.

**Body**: `lib/body.ts` + `components/body/`. Rings, a glass you tap, a sleep
arc you drag by its ends, a silhouette that warms where you trained. Schema
(0006): `bd_workouts` is a dated log with muscle groups — `bd_gym_days` is a
weekly *plan* with no dates and could never answer "sessions this fortnight" —
and `bd_body_days` gained `sleep_from` / `sleep_to`.

**Money**: `lib/runway.ts` (pure, checked) + `components/money/`. Days of
runway at your own burn rate, the month as isometric coin stacks, budgets as
jars that drain, and a number pad instead of a form.

**`photo-read`** (deployed) is the third use of the scanner pipeline: a plate
becomes a dish with macros, a receipt becomes merchant/total/date. One pass
rather than schedule-scan's two, and the same rule — it fills in fields, a
person presses the button.

**A bug worth remembering**: my own `nospend` metric filtered
`amount_centavos < 0`. Every row in `bd_transactions` is money *out*, stored
positive, and the whole app `abs()`es it — so the filter matched nothing and
would have scored every day a clean one. If you add anything that reads
transactions, that is the convention.

**Still not run signed in**: all three scanners (timetable, plate, receipt) and
every write in this batch. Fixture mode is signed out, so what was verified is
rendering and optimistic behaviour, not persistence.

---

## Touched 2026-08-20 (messaging, post view)

**The lightbox bug, and the rule behind it.** The full-screen photo viewer was
`position: fixed` rendered inside `main`. `main` carries the font-scale `zoom`
and a page-entry transform, and either makes it the containing block for
anything fixed — so the overlay was laid out against `main` instead of the
viewport and covered part of the screen at the wrong offset. `MediaFrame`'s
Lightbox and the new `components/PostView.tsx` both portal to `document.body`.
This is fact 2 in the list above; it has now bitten twice.

**PostView** is the post opened on its own — picture left, conversation right,
Instagram's shape — replacing the bare lightbox for community posts. One column
on a phone.

**Messaging.** `0005_messaging.sql` (applied): `bd_conversations`,
`bd_conversation_members`, `bd_messages`, plus `bd_start_dm` /
`bd_start_group` / a trigger that bumps `updated_at`. The policies route
through `bd_in_convo()`, a SECURITY DEFINER function, because a policy on
conversations that reads members — whose own policy reads conversations — is
recursion Postgres refuses outright. `lib/messages.ts` + `components/Messages.tsx`
(a Community tab). Both new tables are in the realtime publication.

**Sharing.** `components/ShareSheet.tsx`: send to a chat or a person here, hand
off to `navigator.share`, or copy the link. **A shared post is a reference**
(`share_kind` + `share_id`) rendered from the live row — never a copy, so a post
its author edits or deletes changes in the chat too.

**Open with the user**: a design proposal for rebuilding Challenges, Body and
Money (auto-sourced challenge metrics instead of a +/− counter, templates,
sparkline cards, an arena view; instrument-style Body; a runway gauge for
Money) is published as an artifact and waiting on approval. Nothing from it is
built yet.

---

## Touched 2026-08-20 (schedule scanner, community merge, canvas gestures)

**The schedule scanner.** Calendar → Import reads a timetable out of a photo.
`supabase/functions/schedule-scan` (deployed, `verify_jwt` on) calls Gemini with
`responseSchema` — day names are an enum, so "TTh" can never reach the client —
at temperature 0, then hands its own answer back to the model *with the image*
and asks it to correct itself. Every row comes back with the literal text it was
read from and a per-row confidence. The model never writes: `components/
ScheduleImport.tsx` shows a review table, flags what it could not read, and only
then builds the term's events as one insert. `lib/schedule.ts` is pure
(`node lib/schedule.check.ts`), including the rule that a bare "1:00" on a
timetable is the afternoon.

Two model names are tried in order, `gemini-3.6-pro` then `gemini-3.6-flash`,
falling through only on a 404/"not found" — flash is the name the bot already
uses in production, so the chain ends somewhere known to work.

**Community is one feed.** `lib/community.ts` merges `bd_posts` and
`bd_threads` into one `Item` list with New/Top and a photo/discussion filter.
The tables are untouched; only the read shape is new. `lib/people.ts` reads
`bd_profiles` (world-readable by design) so authors have handles instead of
`id.slice(0, 2)` — that fix applies to replies and challenge standings too.
`components/Composer.tsx` replaces the one-line input, and a caption-less photo
now has no caption rather than being labelled `IMG_1234.jpg`.

**Canvas gestures, as asked.** The wheel zooms about the pointer (shift+wheel
pans); every edge and corner resizes; the four side dots only connect, and
dropping one on empty space creates a card already joined to the parent.
`lib/canvasGeom.ts` holds the resize maths with a check
(`node lib/canvasGeom.check.ts`) — a card cannot be turned inside out.

**One tab rail.** `components/TabRail.tsx`. Every screen used to slide an accent
pill positioned as `index * 100%` of an equal share, which is only aligned when
every tab is the same width. The active tab carries its own background now.
Notebooks, Community, Body and PhoneHome all use it; Calendar's icon switcher
was already built this way.

**Back fired twice.** The mouse's side button fires `mousedown`, Chrome
navigates on it despite the preventDefault, and the `popstate` a few
milliseconds later called `goBack()` again — one press, two steps, so you
landed on Home. `lib/nav.ts` now ignores a second call inside 400ms. Notebooks
also has a visible chevron.

**Also**: canvases and graph views are listed on the notebook shelf with New
canvas / New graph beside New notebook; challenges gained a star (the like, one
row per person, `bd_challenge_stars`) and Duplicate beside Edit and Delete.

**Migrations applied to production**: `0004_challenge_stars.sql`.

**Verified in the browser (fixture mode)**: the merged feed with real handles,
its sort and filters, no tilt, the composer, challenge stars and duplicate, all
four tab rails at 1280px and 375px, the canvas wheel-zoom / 8-handle resize /
drag-to-empty-space, opening a canvas from the shelf, and the notebooks chevron.
The Import sheet opens and the function is deployed (an unauthenticated call
returns 401, not 404) — but **the Gemini round-trip has not been run against a
real timetable**, because fixture mode is signed out and the function requires a
user JWT. That is the first thing to try signed in.

---

## Touched 2026-08-20 (schedule scanner, community merge, canvas gestures)

**The schedule scanner.** Calendar → Import reads a timetable out of a photo.
`supabase/functions/schedule-scan` (deployed, `verify_jwt` on) calls Gemini with
`responseSchema` — day names are an enum, so "TTh" can never reach the client —
at temperature 0, then hands its own answer back to the model *with the image*
and asks it to correct itself. Every row comes back with the literal text it was
read from and a per-row confidence. The model never writes: `components/
ScheduleImport.tsx` shows a review table, flags what it could not read, and only
then builds the term's events as one insert. `lib/schedule.ts` is pure
(`node lib/schedule.check.ts`), including the rule that a bare "1:00" on a
timetable is the afternoon.

Two model names are tried in order, `gemini-3.6-pro` then `gemini-3.6-flash`,
falling through only on a 404/"not found" — flash is the name the bot already
uses in production, so the chain ends somewhere known to work.

**Community is one feed.** `lib/community.ts` merges `bd_posts` and
`bd_threads` into one `Item` list with New/Top and a photo/discussion filter.
The tables are untouched; only the read shape is new. `lib/people.ts` reads
`bd_profiles` (world-readable by design) so authors have handles instead of
`id.slice(0, 2)` — that fix applies to replies and challenge standings too.
`components/Composer.tsx` replaces the one-line input, and a caption-less photo
now has no caption rather than being labelled `IMG_1234.jpg`.

**Canvas gestures, as asked.** The wheel zooms about the pointer (shift+wheel
pans); every edge and corner resizes; the four side dots only connect, and
dropping one on empty space creates a card already joined to the parent.
`lib/canvasGeom.ts` holds the resize maths with a check
(`node lib/canvasGeom.check.ts`) — a card cannot be turned inside out.

**One tab rail.** `components/TabRail.tsx`. Every screen used to slide an accent
pill positioned as `index * 100%` of an equal share, which is only aligned when
every tab is the same width. The active tab carries its own background now.
Notebooks, Community, Body and PhoneHome all use it; Calendar's icon switcher
was already built this way.

**Back fired twice.** The mouse's side button fires `mousedown`, Chrome
navigates on it despite the preventDefault, and the `popstate` a few
milliseconds later called `goBack()` again — one press, two steps, so you
landed on Home. `lib/nav.ts` now ignores a second call inside 400ms. Notebooks
also has a visible chevron.

**Also**: canvases and graph views are listed on the notebook shelf with New
canvas / New graph beside New notebook; challenges gained a star (the like, one
row per person, `bd_challenge_stars`) and Duplicate beside Edit and Delete.

**Migrations applied to production**: `0004_challenge_stars.sql`.

**Verified in the browser (fixture mode)**: the merged feed with real handles,
its sort and filters, no tilt, the composer, challenge stars and duplicate, all
four tab rails at 1280px and 375px, the canvas wheel-zoom / 8-handle resize /
drag-to-empty-space, opening a canvas from the shelf, and the notebooks chevron.
The Import sheet opens and the function is deployed (an unauthenticated call
returns 401, not 404) — but **the Gemini round-trip has not been run against a
real timetable**, because fixture mode is signed out and the function requires a
user JWT. That is the first thing to try signed in.

---

## Touched 2026-08-19 (canvas + graph rewrite, journal photos)

**The bug under all of it.** `bd_canvas_nodes.kind` allowed
`('hub','note','flag','muted')` — names from a scratch-board that no longer
exists — while the canvas wrote `'text'` and `'group'`. Every card insert failed
its check constraint, which is why production held two canvases and *zero*
cards: drop a card, watch it vanish on the next refetch. `KINDS` in
`lib/canvas.ts` and `bd_canvas_nodes_kind_check` must stay the same list; change
one, change the other in the same commit.

**New / rewritten**
- `supabase/migrations/0003_canvas_v2.sql` (applied to production): card kinds
  `text|note|canvas|group`, `bd_canvas_nodes.ref_canvas`, `bd_canvases.kind`
  (`canvas|graph`) + `settings` jsonb, `bd_journal_photos.archived_at` and
  `.deleted_at`.
- `lib/canvas.ts` — rewritten. Card text now saves on a debounce with a
  `pending` overlay on reads, the same rule `lib/notes.ts` arrived at; before,
  text was only written on blur. Board-scoped keys *and* the two everything keys
  (`canvas_nodes_all`, `canvas_edges_all`) are patched by every write, or the
  graph goes stale the moment you add a card.
- `components/notes/Canvas.tsx` — rewritten. Boards are a list on the left
  (a phone gets list-then-board), not a scrolling row of pills. Note cards and
  canvas cards are the point: a card can *be* a note or open another board, and
  that is what the graph reads. Local undo stack (no redo) on add / delete /
  move / resize / colour / connect.
- `components/notes/GraphView.tsx` — rewritten. A graph view is now a saved
  `bd_canvases` row of kind `graph`, so there can be several, each with its own
  name, viewport and switches. It draws boards as hubs, cards as their spokes,
  and reaches into the notebook through note cards and `[[wiki links]]`.
- `lib/graph.ts` + `lib/graph.check.ts` — the graph as one pure function.
  `node lib/graph.check.ts` is the runnable check.
- `lib/journalPhotos.ts` + `components/notes/JournalPhotos.tsx` — add,
  replace (same row, so the pins survive), rename, archive, delete with undo,
  purge from the "put away" drawer, and pins you can edit or remove by clicking
  them. Every verb has a button on the open photo as well as a menu row, because
  the APK has no right mouse button.
- `components/notes/JournalWindow.tsx` — the pane above the heat map. Drawn,
  not fetched; sky and greeting come from the hour.
- The notebook tab bar no longer slides a pill behind the labels. It positioned
  the pill as `index * 100%` of an equal share, which is only aligned when every
  tab is the same width — true on a phone, false on a desktop. The active tab
  carries its own background now, so the highlight cannot drift.

**Archived** — `archive/canvas-v1/` (`CanvasBoard.tsx`, `GraphView.tsx`,
`lib-canvas.ts`). Excluded from `tsconfig.json`, imported by nothing.

**Verified in the browser (fixture mode).** Tabs, both new panes on desktop and
at 375px, the graph's counts and its settings toggles, hover hit-testing,
clicking a card dot jumping to the board it lives on, add-card + undo on the
canvas, archive + undo on a photo. Fixture mode still cannot prove persistence
— writes go to a signed-out Supabase and roll back — so the
optimistic paths were sampled inside their window.

---

## Touched 2026-08-19 (notebook rewrite)

The whole notes system was archived and rebuilt on Evernote's model. Old files
are in `archive/notebooks-v1/` (excluded from `tsconfig.json`, imported by
nothing) — read them for history, do not wire them back up.

**New**
`lib/md.ts` (markdown parse / render / edit, pure), `lib/md.check.ts`
(`node lib/md.check.ts` — the runnable check), `lib/notes.ts` (data layer),
`components/notes/NotebookTable.tsx` (the shelf), `components/notes/NoteList.tsx`,
`components/notes/NoteEditor.tsx`, `components/notes/GraphView.tsx`
(Obsidian graph, canvas 2D force sim), `supabase/migrations/0002_notes_v2.sql`
(applied to production: `bd_notes.notebook_id`, `section_id` nullable, blocks
folded into `body`, `bd_note_tags`, both seed RPCs rewritten).

**Gone from the build**
`lib/notebooks.ts`, `lib/blocks.ts`, `components/NoteEditor.tsx`,
`components/NotebookTabs.tsx`, the old notebooks page. Sections no longer exist
in the UI.

**The Journal was rebuilt too**, on the chosen hybrid: the Almanac's month heat
map and "on this day" rail around the Spread's two leaves.
`components/notes/Journal.tsx`, `components/notes/JournalPhotos.tsx` (photos and
pins lifted verbatim — that part was never broken), `lib/journal.ts` (three
queries: every entry's date, whole rows for the month on screen, the same day in
past years), `lib/days.ts` + `lib/days.check.ts` (calendar arithmetic, pure and
checked). `alter table bd_journal_entries add column mood text` is applied.
Skipped: weather chips and the daily prompt.

---

## Touched the session before

**New files**
`lib/settle.ts`, `lib/presence.ts`, `lib/workspaces.ts`, `lib/bot.ts`,
`lib/appUpdate.ts`, `components/Page.tsx`, `components/TaskComposer.tsx`,
`components/CalPopover.tsx`, `components/RankUp.tsx`, `components/MoneyRows.tsx`,
`components/MediaFrame.tsx`, `supabase/functions/gemini-bot/index.ts`,
`supabase/migrations/0001_gemini_bot.sql`.

**Heavily edited**
`components/ContextMenu.tsx` (grouped menus, submenus, shortcuts, portal),
`components/Shell.tsx` (FAB removed, presence, account+workspace menu),
`components/NoteEditor.tsx` (debounced saves, wide toggle, backlinks),
`components/NotebookTabs.tsx` (journal photo menu),
`app/(shell)/calendar/page.tsx` (24h grid, popovers, zoom ladder removed),
`app/(shell)/notebooks/page.tsx` (single tree, context menus),
`app/(shell)/money/page.tsx` (six tabs → three),
`app/(shell)/tasks/page.tsx` (composer), `app/globals.css` (contrast, `.tap`).

**Database** — `app_secrets`, bot auth user + profile, `bd_avatars` and
`bd_releases` buckets, `bd_profiles.photo_url`, three cron jobs.

---

## Things tried that did NOT work

Recorded so nobody burns the time again.

- **Fixing the note-loss bug by debouncing alone.** Shipped, looked fixed,
  came back. Debouncing shortens the race window; it does not remove it.
- **Fixing it by guarding invalidates, then by overlaying pending text.** Both
  were real fixes for real races, and the text still went missing, because the
  model underneath was wrong: paragraphs as foreign-keyed rows written
  concurrently with the note they belong to. Three sessions went into patching
  a schema instead of replacing it. When a bug keeps coming back wearing a new
  hat, the data model is the suspect.
- **Six attempts at the collapsible sidebar** (width 0, `minWidth: 0`, root
  classes, `!important`) — all failed because the real cause was `usePrefs()`
  being per-component `useState`, so each copy re-applied a stale snapshot and
  undid the others. It is a `useSyncExternalStore` module store now.
- **Clamping the context menu with a guessed height**
  (`items.length * 38 + 60`). A 7-item menu guessed 326px and jumped ~200px up.
  Measure the rendered box.
- **Instrumenting `window.fetch` to count Supabase writes.** supabase-js
  captures `fetch` at module init, so the patch never sees them.
- **Mobbin MCP.** Every query returns "requires a paid plan" — this is the MCP
  itself, not a workaround-able limit. Attempting it through the user's own
  browser needs the Claude in Chrome extension installed in Brave and paired;
  `list_connected_browsers` currently returns `[]`.
- **Driving the app in the same browser tab as a background agent.** The agent
  navigates the tab out from under you. Use your own tab.

---

## Next step

In priority order:

1. **Verify against production, signed in.** Fixture mode cannot prove
   persistence (signed-out writes 400). Two rewrites are now waiting on the same
   pass:
   - *Notes*: type into a note, hard-reload, confirm the text survived; make a
     notebook, move a note between notebooks, delete one and restore it from
     Trash.
   - *Canvas*: drop a card and reload — this is the one the check constraint was
     silently eating, so it is the single most valuable thing to confirm. Then a
     note card, a canvas card, a connection, and a graph view that shows them.
   - *Journal photos*: upload, replace, archive, delete, undo, and "Forever"
     from the drawer (the last one is the only path that touches storage).
   - *The three scanners*: a real timetable through Calendar → Import, a plate
     through Body → Eaten, a receipt through Money → Spent. Each response says
     which model answered, so a fallback from `gemini-3.6-pro` to flash is
     visible. These are the only paths in the app that spend money per use.
   - *Challenges*: join one with an auto metric, tick a task, and check the bar
     for today appears — that is the whole `bd_challenge_days` loop.
   - *The three scanners*: a real timetable through Calendar → Import, a plate
     through Body → Eaten, a receipt through Money → Spent. Each response says
     which model answered, so a fallback from `gemini-3.6-pro` to flash is
     visible. These are the only paths in the app that spend money per use.
   - *Challenges*: join one with an auto metric, tick a task, and check the bar
     for today appears — that is the whole `bd_challenge_days` loop.
2. **The Journal's skipped bits**, if wanted: a rotating daily prompt above the
   page (a constant list, no schema), and weather chips (needs an API key, so it
   is a real decision rather than a small one). The window pane above the heat
   map is drawn from the clock alone — wiring real weather into it is the same
   API-key decision.
3. **Canvas redo**, if the undo stack proves useful. It is one stack of
   inverses, deliberately without redo or coalescing; a drag that snaps back one
   card at a time would be the sign it wants a proper command history.
4. **Menus replace the row icons** (user-chosen). Tasks rows, Calendar events
   and empty slots, Files rows, Money rows. Every one needs long-press wired
   alongside right-click or touch users lose the only way in — the icons are
   being removed.
5. **Type-scale consolidation**: 25 font sizes and 14 radii down to ~5 and ~4,
   with a 12px floor. Touches nearly every file; do it in one pass, not
   piecemeal.
6. Remaining audit findings not yet actioned: the auth gate has no error state
   or timeout (`Shell.tsx:144-149`) and can hang on a permanently blank screen;
   `prefers-reduced-motion` is ignored for first-run users because
   `DEFAULT_PREFS.motion` is unconditionally `true`; eight inputs have
   placeholder-only labels; `lib/nav.ts` re-arms its history sentinel on every
   navigation because Next replaces `history.state`.

---

## How to run it

```bash
npm run dev            # dev server; autoPort picks a free one if 3000 is taken
```

Set `NEXT_PUBLIC_DEV_FIXTURES=1` in `.env.local` for preview data — without it
the pages are empty because there is no signed-in session, and `.env.production`
is not read by `next dev`, so `.env.local` needs the Supabase keys too.
Fixtures are compiled out of production.

```bash
npx tsc --noEmit       # the only gate that matters before committing
npm run build          # then RESTART the dev server (see fact 6)
git push origin master # deploys production via Vercel
```
