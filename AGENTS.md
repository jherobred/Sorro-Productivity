# Change brief: Sorro 2.0 (S1, S1b, P2–P7)

Shared context file. Claude Code and Antigravity both read `AGENTS.md`, so this
is the one copy. Repo rules stay in `GEMINI.md`; long-lived architecture notes
stay in `HANDOFF.md`. Specs are in `docs/superpowers/specs/2026-11-03-sorro-*`
(roadmap S1–S9 in the S1 shell spec).

Covers master up to the 2.0.0 release (2026-11-04).

## What changed

- **Basedly is Sorro, productivity only.** Tabs: Home, Notes (`/notebooks/`),
  Calendar, Tasks, Vault, News (`lib/destinations.ts`). Vault is one shelf of
  saved links (`lib/links.ts`) and uploaded files (`lib/vault.ts`); attaching
  them to notes and AI access wait for S5. Trackers and social tabs are gone; the tracker app (S6) forks from
  tag `basedly-final`.
- **Renamed everywhere.** Repo `jherobred/sorro`, live
  `https://sorro-jhemsini.vercel.app` (Vercel project `sorro`), Android
  `com.sorro.app`, Tauri `com.sorro.desktop`. The 34 Sorro tables and 9
  functions are `sorro_*`; tracker tables keep `bd_` for S6. Buckets are
  `sorro-files/journal/avatars`. Browser keys, the IndexedDB and note-body
  markers migrate on first load (`lib/storageKeys.ts`).
- **Tokens** are LodiSave Kape names in `app/tokens.css`, imported last. Old
  Basedly names alias to them at the bottom. `--sh` is `none`.
- **Theme** is `'light' | 'dark' | 'system'`. Use `themeIsDark(prefs.theme)`.
- **Shell** (`components/Shell.tsx`): sidebar or 64px rail (forced on tablet,
  761–1024px), top strip `S.top` with the Windows buttons, phone bar with four
  destinations plus More, and the right panel (`components/SidePanel.tsx`,
  widgets in `components/widgets/Widgets.tsx`, pref `prefs.panel`). The panel
  is not shown on Home. The fox mood lives in `lib/foxMood.ts`.
- **Part names:** every region has `data-part`. Codes live in `lib/parts.ts`;
  add new ones there.
- **Home** is the assistant: Supabase function `assistant` (Gemini, model
  `GEMINI_MODEL` or `gemini-3.6-flash`, tools in `tools.ts`), chats in
  `sorro_chats`/`sorro_chat_messages`, Undo on every write
  (`lib/assistantLogic.ts`), and a local Qwen fallback when offline.
- **Notes types** are in `lib/noteTypes.ts`. Page and Recall are new formats
  (`<!-- sorro-text:v1 -->`, `<!-- sorro-recall:v1 -->`). Page opens a note
  only when `pageCanHold`; Convert only when `documentSafeForPage`.
- **Calendar** quick add parses plain words (`lib/eventParse.ts`). **Tasks**
  have streaks (`lib/taskStreak.ts`) and focus minutes (`lib/focusTimer.ts`).
- **News**: Grok's scheduled tasks visit the `news-drop` function URL with a
  per-user key (hash stored only). Parts join when all are in. Sorro writes a
  Monday "Your week" edition itself.

## Gotchas

- Without `GEMINI_API_KEY` in Supabase secrets the assistant answers 503
  `no_key`.
- Compat views under the old `bd_` names stay until migration 0028. Apply it
  on or after 2026-11-10, after rerunning `scripts/move-buckets.mjs`.
- `lib/legacyQueue.ts` imports removed tabs' libs only so queued offline
  writes replay. Delete it in S6.
- Running `npm run build` while `npm run dev` is up breaks the dev server.
- The browser pane freezes animations and key events. Test with synthetic
  events and measurements.
- Supabase CLI needs `--yes` for hosted writes, and its JSON output mangles
  non-ASCII.
- The dev machine has no DST. Test date logic with `TZ=America/New_York`.

## What did not change

Save behaviour, Google Calendar sync, the offline queue, the Supabase project
ref `jdkbnsjczanvmmpsovhm`. The APK and Windows app still load the live site,
so web changes ship by pushing master.
