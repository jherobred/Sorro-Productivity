# Basedly — session handoff

Written for whoever picks this up next, human or model. Read this before
touching anything; it is the difference between fixing a bug and re-fixing one.

Last updated: 2026-08-23 (the gym log, the trail, and the constraint that was
eating every import).

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

8. **The browser pane does not composite when hidden** — CSS animations sit at
   `currentTime: 0`, so `getBoundingClientRect()` on anything with an entry
   animation reports the *from* keyframe. Neutralise animations before
   measuring, or you will chase phantom layout bugs. (`.pop` starts at
   `scale(.4)`.)

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
