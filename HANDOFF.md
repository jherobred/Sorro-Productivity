# Basedly — session handoff

Written for whoever picks this up next, human or model. Read this before
touching anything; it is the difference between fixing a bug and re-fixing one.

Last updated: 2026-08-19 (canvas + graph rewrite, journal photos).

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

7. **The browser pane does not composite when hidden** — CSS animations sit at
   `currentTime: 0`, so `getBoundingClientRect()` on anything with an entry
   animation reports the *from* keyframe. Neutralise animations before
   measuring, or you will chase phantom layout bugs. (`.pop` starts at
   `scale(.4)`.)

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
