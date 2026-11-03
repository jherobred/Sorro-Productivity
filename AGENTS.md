# Change brief: Basedly becomes Sorro (S1 shell)

Shared context file. Claude Code and Antigravity both read `AGENTS.md`, so this
is the one copy. Repo rules stay in `GEMINI.md`; long-lived architecture notes
stay in `HANDOFF.md`. The roadmap and S1 design are in
`docs/superpowers/specs/2026-11-03-sorro-s1-shell-design.md`.

Covers branch `sorro-s1` (2026-11-03), merged to `master`.

## What changed

- **Renamed to Sorro, productivity only.** Five tabs: Home, Notes
  (`/notebooks/`), Calendar, Tasks, Vault. Home and Vault are placeholders
  until S3 and S5. Every tracker and social tab was deleted (habits, focus,
  fitness, fuel, plates, money, memories, people, community, board, links,
  files, projects, more, profile). The last Basedly commit is tag
  `basedly-final`; the tracker app (S6) forks from it.
- **LodiSave Kape tokens** in `app/tokens.css`, imported last in
  `app/layout.tsx`. Same names as LodiSave (`--bg --surface --soft --ink
  --muted --accent --accent-ink ...`). Old Basedly names (`--tx`, `--card2`,
  `--acc` ...) alias to them at the bottom of that file until S4/S5 rebuild
  each tab. Basedly's old `--ink` (text on accent) is now `--accent-ink`.
  Geist from `public/fonts/`.
- **Theme** is `'light' | 'dark' | 'system'` (`lib/theme.ts`). Use
  `themeIsDark(prefs.theme)`, never `prefs.theme === 'dark'`. The user accent
  pref is ignored.
- **Shell** (`components/Shell.tsx`, `components/shell.css`): sidebar that
  folds to a 64px rail, a top strip (`S.top`) the same colour as the page,
  phone bottom bar with five icons, pinned notes (`prefs.pinnedNotes`, max 8,
  pinned from a page's context menu). Long-press Home on phone opens capture.
- **Part names:** every region has `data-part` (`S.side`, `S.top`, `S.bar`,
  tab roots `H N C T V`). Settings → Show part names labels them. Codes live
  in `lib/parts.ts`; add new ones there.
- **Fox brand:** `public/brand/fox-*.png` are white masks; draw them with
  `components/Fox.tsx` so they take the theme colour.
- **Windows app** draws its own title bar: `decorations: false`, window
  buttons in `S.top`, through `window.__TAURI__` (capability allows the live
  URL). Needs a rebuilt installer.

## Gotchas

- `lib/legacyQueue.ts` imports the removed tabs' libs only so their queued
  offline writes still replay. Delete it in S6.
- Old routes redirect to `/home/` (`vercel.json` plus Shell's `activePath`).
- Running `npm run build` while `npm run dev` is up breaks the dev server
  (404 chunks). Restart it.

## What did not change

Save behaviour, Supabase tables (`bd_` prefix), Google Calendar sync, the
offline queue, Android `appId com.basedly.app`, Tauri identifier, Vercel
project `basedly-web`.
