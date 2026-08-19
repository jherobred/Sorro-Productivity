# Basedly — session handoff

Written for whoever picks this up next, human or model. Read this before
touching anything; it is the difference between fixing a bug and re-fixing one.

Last updated: 2026-08-19.

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

1. **`settler()` in `lib/settle.ts` guards every invalidate.** Do not go back
   to `onSettled: () => qc.invalidateQueries(...)`. A refetch started by one
   write lands after a later write's optimistic update and overwrites it — that
   is the "notes delete themselves" bug, and it took three attempts to find
   because debouncing hides it without fixing it. `isMutating() > 1` means
   others are still in flight; the last one out does the refetch.

   **But the settler is necessary, not sufficient — that is why the bug came
   back.** It only counts in-flight *mutations*; a pending debounce timer is
   not a mutation, so the ~500ms window where a keystroke lives only in the
   cache is invisible to it. Any refetch in that window (an `add`/`del`/
   `reorder` settle, `refetchOnWindowFocus`, reconnect, realtime) still wiped
   the text. The real closer is `pendingBlockText` in `lib/blocks.ts`: typed
   text is registered there and overlaid onto every `useBlocks` read, so no
   refetch source can drop an unconfirmed keystroke. It clears on the block's
   own successful save (only if a newer keystroke has not replaced it). Do not
   remove the overlay thinking the settler covers it — it does not.

   Second half of the same bug: the flush effect in `NoteEditor.tsx` depended
   on `A` (`useBlockActions`, a fresh object every render), so its cleanup ran
   on *every keystroke* — flushing the debounce instantly and firing one write
   per character. It is keyed on `note?.id` now, with `A` read through a ref.
   If a burst of typing turns back into forty writes, that dependency regressed.

2. **`main` has `zoom`** (the font-scale/density pref) **and a page-entry
   transform.** Either makes it the containing block for `position: fixed`, so
   anything fixed rendered inside it is positioned relative to `main`, not the
   viewport. Menus and popovers **must** portal to `document.body`
   (`ContextMenu.tsx`, `CalPopover.tsx` already do).

3. **Optimistic writes must patch every cached window.** `lib/events.ts` keys
   queries `[...EVENTS_KEY, weekStart, days]`; an optimistic helper that
   rebuilds a shorter key writes where nothing reads. Use
   `getQueriesData({ queryKey: PREFIX })`.

4. **Dev fixtures (`?fx=1`) disable `invalidateQueries` entirely** and stub
   `currentUserId()` to `'me'`. Pages pass an inline `queryFn`, which beats the
   fixture default, so any refetch in fixture mode hits a signed-out Supabase
   and returns `[]`. Seeding happens *before* `Providers` renders children —
   moving it back into an effect reintroduces a race that blanks Tasks and
   People.

5. **`bd_notes.body` is legacy.** Note content lives in `bd_note_blocks`.
   Anything reading `body` for a preview gets blank or years-stale text; use
   `useNotePreviews()`.

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

## Touched this session

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
  The invalidate guard is the actual fix.
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

1. **Verify the note-loss fix against production**, signed in. The overlay +
   flush-effect fix (fact 1) is deployed to `master`; what is left is the human
   check that only a signed-in session can do — fixture mode cannot prove
   persistence because signed-out writes 400 and roll back. Type into a note,
   hard-reload, confirm the text survives. Do the same on a canvas card. What
   *was* verified this session (in `?fx=1`): a 12-char burst now fires one
   write, not twelve, and typed text no longer vanishes under the cursor.
2. **Menus replace the row icons** (user-chosen). Tasks rows, Calendar events
   and empty slots, Files rows, Money rows. Every one needs long-press wired
   alongside right-click or touch users lose the only way in — the icons are
   being removed.
3. **Type-scale consolidation**: 25 font sizes and 14 radii down to ~5 and ~4,
   with a 12px floor. Touches nearly every file; do it in one pass, not
   piecemeal.
4. Remaining audit findings not yet actioned: the auth gate has no error state
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

Append `?fx=1` to any route for dev fixtures — without it the pages are empty
because there is no signed-in session. Fixtures are compiled out of production.

```bash
npx tsc --noEmit       # the only gate that matters before committing
npm run build          # then RESTART the dev server (see fact 6)
git push origin master # deploys production via Vercel
```
