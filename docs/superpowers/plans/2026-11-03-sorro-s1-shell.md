# Sorro S1 Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Basedly's frame into Sorro's: LodiSave Kape tokens, a seamless top strip, a five-tab nav, the fox brand, part names, and every non-Sorro tab removed.

**Architecture:** Rebuild in place on master. New tokens live in one file imported last so they win the cascade; old token names alias to them until S4/S5 rebuild each tab. `components/Shell.tsx` is rewritten; `components/Page.tsx` portals its title actions into the shell's strip. Data libs with offline mutations stay so queued writes still replay.

**Tech Stack:** Next.js 15 static export, React 19, TanStack Query, Supabase, Capacitor 8 (Android), Tauri 2 (Windows), Vercel.

**Spec:** `docs/superpowers/specs/2026-11-03-sorro-s1-shell-design.md`

## Global Constraints

- Tokens use LodiSave's names verbatim: `--bg --surface --soft --soft-2 --line --ink --muted --accent --accent-ink --pick --ok --bad --shadow --close`, radii `--r-row 10px --r-tile 12px --r-panel 18px --r-pill 999px`, springs `--float --drift --snap` (copy values from `C:\Users\J30N\LodiSave\app\ui\gallery.css` lines 13-35).
- Light: `--bg #F7F6F4 --surface #FFFFFF --accent #B84C0C`. Dark: `--bg #111113 --surface #18181A --accent #FF8A3D`.
- Type: Geist and Geist Mono from `C:\Users\J30N\LodiSave\app\ui\fonts`. Body 14px, rows 13px, `font-variant-numeric: tabular-nums`.
- Spacing steps 6, 10, 14, 18px only. Rows 32-34px. Page padding 18px desktop, 14px phone.
- Motion respects the `.nomo` class (product setting), never `prefers-reduced-motion`.
- Active nav row is `--soft-2`, never the accent.
- Copy says **Sorro**; wordmark is `sorro` lowercase Geist 600.
- Keep: `bd_` tables, Android `appId com.basedly.app`, Tauri `identifier com.basedly.desktop`, Vercel project `basedly-web`, routes `/notebooks/ /calendar/ /tasks/ /home/`.
- Commit messages: sentence case, no `feat:` prefix, no co-author trailer (user rule).
- Every new browser-side API host goes into both CSPs (`vercel.json` and `app/layout.tsx`). S1 adds none.

## Review Focus

1. **Queued offline writes for removed tabs.** A habit tick or money entry queued offline before the update must still sync after it. Owned by Task 3 (`lib/legacyQueue.ts`).
2. **Old `--ink` usages.** Basedly's `--ink` meant text on accent (56 uses). LodiSave's `--ink` is body text. Unconverted uses would put dark text on dark buttons. Owned by Task 2 (codemod plus grep check).
3. **Saved prefs from Basedly.** `theme: 'dark'|'light'`, `sidebar: 'hidden'|'collapsed'`, `navPicks` with removed ids, `shellLayout`. Old values must load without crashing and map to the new shell. Owned by Task 2 (`resolveTheme`) and Task 4 (sidebar mapping).
4. **Deep links to removed tabs.** `/habits/`, `/money/` and others, from bookmarks, notifications or the APK's last route, must land on `/home/`, not a 404. Owned by Task 3 (vercel redirects).
5. **Strip on the Windows app and APK.** Window controls must not cover tab actions at 380px minimum width; the APK strip must clear the status bar. Owned by Task 5.

---

### Task 1: Tag Basedly and prepare the fox brand assets

**Files:**
- Create: `public/brand/fox-head.png`, `fox-sit.png`, `fox-alert.png`, `fox-glad.png`, `fox-sleep.png`, `fox-run.gif`, `app-icon.png` (1024, crema fox on graphite)
- Create (scratchpad, not committed): `recolor.py`

**Interfaces:**
- Produces: white-on-transparent masks at `/brand/fox-*.png` for CSS `mask-image`; `/brand/app-icon.png` for Task 5.

- [ ] **Step 1: Tag the last Basedly commit**

Run: `git tag basedly-final d03473d && git push origin basedly-final`
Expected: tag on the remote (`git ls-remote --tags origin basedly-final` prints one line).

- [ ] **Step 2: Convert the Grok assets**

Source folder: `C:\Users\J30N\Downloads\grok downloads\brand`. With Pillow (`python -I`), for each of `fox-head-on-dark.png`, `fox-sit.png`, `fox-alert.png`, `fox-glad.png`, `fox-sleep.png`: set RGB to white and alpha to `min(original alpha, luminance)`, so black becomes transparent; crop to the alpha bounding box; save to `public/brand/` (head saved as `fox-head.png`). Copy `fox-run.gif` as is. Build `app-icon.png`: 1024x1024 `#0F0F10` square, the head mask at 62% width centered, filled `#FF8A3D`.

- [ ] **Step 3: Verify**

Open each output with the Read tool. Expected: fox shapes with no black box, icon is crema on graphite.

- [ ] **Step 4: Commit**

```bash
git add public/brand
git commit -m "Add the Sorro fox assets"
```

### Task 2: Kape tokens, Geist and theme resolution

**Files:**
- Create: `app/tokens.css`, `public/fonts/Geist.woff2`, `public/fonts/GeistMono.woff2`, `lib/theme.check.ts`
- Modify: `app/layout.tsx` (import `./tokens.css` after every other stylesheet; `themeColor`; title), `app/globals.css:23-79` and `app/studio.css:2-3` (delete old token blocks), `lib/prefs.ts` (theme type, `applyPrefs`)
- Modify (codemod): every `var(--ink)` in `app/ components/ lib/` becomes `var(--accent-ink)`, except inside `app/tokens.css`

**Interfaces:**
- Produces: `export type ThemePref = 'light' | 'dark' | 'system'` and `export function resolveTheme(pref: ThemePref, systemDark: boolean): 'light' | 'dark'` in `lib/prefs.ts`. `Prefs.theme` becomes `ThemePref`, default `'system'`.

- [ ] **Step 1: Write the failing check `lib/theme.check.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme } from './prefs.ts';
test('explicit theme wins', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});
test('system follows the OS', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
});
test('unknown saved value falls back to system', () => {
  assert.equal(resolveTheme('sepia' as never, true), 'dark');
});
```

If `lib/prefs.ts` cannot load under `node --test` (it imports React/Supabase), put `resolveTheme` in a new `lib/theme.ts` and re-export it from `prefs.ts`.

- [ ] **Step 2: Run it to see it fail**

Run: `node --test lib/theme.check.ts`
Expected: FAIL, `resolveTheme` not exported.

- [ ] **Step 3: Implement `resolveTheme` and wire it into `applyPrefs`**

`applyPrefs` sets `data-theme` to `resolveTheme(p.theme, matchMedia('(prefers-color-scheme: dark)').matches)` and re-applies on that media query's `change` while `p.theme === 'system'`. Delete the `--acc`, `--accTx` and `--gl2` writes from the user accent; accent is fixed now.

- [ ] **Step 4: Run it to see it pass**

Run: `node --test lib/theme.check.ts`
Expected: 3 passing.

- [ ] **Step 5: Write `app/tokens.css`**

`@font-face` for Geist and Geist Mono from `/fonts/`. `:root, :root[data-theme='light']` and `:root[data-theme='dark']` blocks with the LodiSave values (Global Constraints). Body font, 14px, tabular numbers. Then one block headed `/* Basedly names, removed tab by tab in S4 and S5. */` aliasing: `--tx: var(--ink); --tx2: var(--muted); --tx3: var(--muted); --bg` (already new); `--panel: var(--surface); --card: var(--surface); --card2: var(--soft); --line2: var(--soft-2); --hov: var(--soft); --sh: var(--shadow); --shl: var(--shadow); --acc: var(--accent); --accTx: var(--accent); --sk1: var(--soft); --sk2: var(--soft-2)`. `:focus-visible { outline: 3px solid var(--pick); outline-offset: 2px }`.

- [ ] **Step 6: Codemod `--ink`, delete old token blocks, update `app/layout.tsx`**

Replace `var(--ink)` with `var(--accent-ink)` outside `tokens.css` first, then delete the old blocks. `themeColor` becomes `[{ media: '(prefers-color-scheme: light)', color: '#F7F6F4' }, { media: '(prefers-color-scheme: dark)', color: '#111113' }]`. Metadata title and `appleWebApp.title` become `Sorro`.

- [ ] **Step 7: Verify**

Run: `grep -rn "var(--ink)" app components lib --include=*.css --include=*.tsx --include=*.ts | grep -v tokens.css`
Expected: no output.
Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add -A app lib public/fonts
git commit -m "Switch to LodiSave Kape tokens and Geist"
```

### Task 3: Remove the non-Sorro tabs

**Files:**
- Delete routes: `app/(shell)/{board,body,community,files,fitness,focus,fuel,gym,habits,links,memories,money,more,people,plates,profile,projects}`
- Delete UI only used by them, found by Step 2. Known: `components/{body,casino,challenges,community,fuel,habits,memories,money,people,projects,stories,focus}/`, `Buddy*.tsx`, `Challenges.tsx`, `DailyQuests.tsx`, `FireworksHost.tsx`, `RankUp.tsx`, `ShopModal.tsx`, `Streak.tsx`, `TierBadge.tsx`, `Messages*.tsx`, `MessengerDock.tsx`, `TabRail.tsx`, `TabOnboardingModal.tsx`, `FocusTopClock.tsx`, `NotificationBell.tsx`, `components/shell/*`, `app/gym.css`, `app/self-workspace.css`
- Create: `lib/legacyQueue.ts`
- Modify: `lib/destinations.ts`, `lib/prefetch.ts`, `vercel.json`, `components/SettingsModal.tsx`, `app/providers.tsx`

**Interfaces:**
- Produces: `DESTINATIONS` = `[{id:'home',name:'Home',icon:'home'},{id:'notebooks',name:'Notes',icon:'book'},{id:'calendar',name:'Calendar',icon:'cal'},{id:'tasks',name:'Tasks',icon:'task'},{id:'vault',name:'Vault',icon:'folder'}] as const`. `MOVED` and `currentId` are deleted. `activePath(path)` is true only for those five ids.

- [ ] **Step 1: Write `lib/legacyQueue.ts` before deleting anything**

Side-effect imports of every lib that calls `defineMutation` and belongs to a removed tab: `body, challenges, community, gym, habits, links, messages, money, water`. Import it once from `app/providers.tsx`. Header comment: `// ponytail: keeps removed tabs' offline writes replayable; delete in S6 once no paused mutation uses these keys.` If any of these libs imports a component being deleted, cut that import from the lib instead of keeping the component.

- [ ] **Step 2: Delete routes and orphaned UI**

Delete the route folders, then loop: `npx tsc --noEmit` to find broken imports in kept files (fix by removing the use, e.g. Buddy on Calendar), and `npx --yes knip --include files` to list unused files (delete the ones under `components/` and `app/`; keep every `lib/` file that `legacyQueue.ts` or a kept screen reaches). Stop when tsc passes and knip lists no `components/` or `app/` files. Delete `lib/*.check.ts` whose lib was deleted.

- [ ] **Step 3: Redirect removed routes**

In `vercel.json` `redirects`, one entry: `{ "source": "/:tab(board|body|community|files|fitness|focus|fuel|gym|habits|links|memories|money|more|people|plates|profile|projects)/:rest*", "destination": "/home/", "permanent": false }`. Add an empty `app/(shell)/vault/page.tsx` stub (`export default function Vault() { return null }`) so the route exists; Task 4 fills it.

- [ ] **Step 4: Trim prefetch and settings**

`lib/prefetch.ts`: keep warmers for home, notebooks, calendar, tasks only. `components/SettingsModal.tsx`: remove sections for removed tabs and the accent picker; keep integrations (Google Calendar), theme (now Light / Dark / System), motion, text size.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass; `out/` has no `habits/`, `money/` etc. folders and has `vault/`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Remove the tracker and social tabs from Sorro"
```

### Task 4: New shell, strip, nav, part names

**Files:**
- Rewrite: `components/Shell.tsx`
- Create: `components/shell.css` (imported by `Shell.tsx`), `lib/parts.ts`, `components/Fox.tsx`, `app/(shell)/vault/page.tsx`
- Modify: `components/Page.tsx`, `app/(shell)/home/page.tsx`, `lib/prefs.ts` (new fields), `components/SettingsModal.tsx` (toggle), `app/(shell)/notebooks/page.tsx` (pin action)

**Interfaces:**
- Consumes: `DESTINATIONS`, `activePath` (Task 3); tokens (Task 2); `/brand/fox-*.png` (Task 1).
- Produces:
  - `lib/parts.ts`: `export const PARTS = { 'S.side': 'Sidebar', 'S.top': 'Top strip', 'S.bar': 'Bottom bar', H: 'Home', N: 'Notes', C: 'Calendar', T: 'Tasks', V: 'Vault' } as const; export type Part = keyof typeof PARTS;`
  - `components/Fox.tsx`: `export function Fox({ pose, size = 20, tone = 'ink' }: { pose: 'head'|'sit'|'alert'|'glad'|'sleep'; size?: number; tone?: 'ink'|'muted'|'accent' })` renders a `<span aria-hidden>` with `mask-image: url(/brand/fox-<pose>.png)` and `background: var(--<tone>)`.
  - `Prefs` gains `showParts: boolean` (default false), `pinnedNotes: string[]` (default `[]`, max 8). `Prefs.sidebar` is read as `'open'` or `'rail'`: old `'compact'|'collapsed'|'hidden'` map to `'rail'`. `navPicks` and `shellLayout` are no longer read.
  - Strip slot: `Page` keeps its props; it renders `actions` through `createPortal` into the element with id `strip-actions` in the shell, and no longer renders its own `h1`. The shell strip shows the current destination's `name`.

- [ ] **Step 1: Write `Shell.tsx` and `shell.css`**

Keep from the old Shell: auth session gate and redirect, `useBackGuard`, `useLiveSync`, `useAutoSync`, `watchAccounts`, Ctrl/Cmd+K search, Ctrl/Cmd+\ sidebar toggle, `SearchPalette`, `SettingsModal`, `AccountSheet`, `ToastHost`, `AskHost`, skip link, `fontScale` zoom on main. Drop: `FireworksHost`, `FocusTopClock`, `useCanvasAlerts`, More sheet, `navPicks`, theme button, location breadcrumb.

Layout (LodiSave `.app`/`.side` patterns):
- `data-part="S.side"` sidebar, width 232px, rail 64px, `--surface`, right border `--line`, collapses with a `grid-template-columns` transition on `--drift` (none under `.nomo`). Top row: `<Fox pose="head"/>` + `sorro` wordmark + collapse button. Five nav rows (34px, `--r-row`, active `--soft-2` + weight 500). `Pinned` heading then up to 8 pinned note titles linking to `/notebooks/?note=<id>` (use whatever query param the notebook page already reads for opening a note). Bottom: avatar row opening `AccountSheet`.
- `data-part="S.top"` strip: 44px, background `--bg`, no border, no shadow. Title (15px, 600), `<div id="strip-actions"/>` flex 1 right-aligned, search icon button. On phone the strip shows the Fox head instead of the sidebar.
- `data-part="S.bar"` phone bottom bar (< 980px): five icon links, no labels, 56px + `env(safe-area-inset-bottom)`, `--surface`, top border `--line`. Long-press Home (`lib/useLongPress.ts`) opens `CaptureSheet`.
- Every tab root wrapper gets `data-part` = `H|N|C|T|V` via the shell's `<main>` (`data-part` from the current destination).
- `html.parts [data-part]::before { content: attr(data-part); position:absolute; font: 500 10.5px var(--font-mono); background: var(--pick); color: var(--accent-ink); padding: 1px 5px; border-radius: 6px; z-index: 50 }` plus `position: relative` on `[data-part]`. `applyPrefs` toggles `parts` on `<html>` from `showParts`.

- [ ] **Step 2: Update `Page.tsx`, Home and Vault**

`Page`: portal `actions` into `#strip-actions` when that node exists, otherwise render inline; drop the `h1`; padding 18px desktop, 14px phone. Home (`app/(shell)/home/page.tsx`): replace its contents with an empty state: `<Fox pose="sleep" size={56} tone="muted"/>`, one line "Sorro's assistant lands here next." and a button opening `CaptureSheet`. Delete the Today-dashboard components it used if knip now lists them. Vault: same pattern with `pose="sit"` and "Your files, links and clips will live here."

- [ ] **Step 3: Settings toggle and pin action**

`SettingsModal`: "Show part names" switch bound to `showParts`. Notebooks page: add "Pin to sidebar" / "Unpin from sidebar" to the note's existing actions menu (next to the action that calls `deleteWithUndo`), updating `pinnedNotes` (newest first, cap 8). Deleted notes drop out of the sidebar because the sidebar renders only ids found in `useNotes()`. On the same page, delete the "Pick up where you left off" and "Earlier boards, journals & Java files" sections (spec D4); the notebook list is what opens first. If `Icon` has no `folder` name for Vault, add one in `components/Icon.tsx` from the lucide `Folder` icon.

- [ ] **Step 4: Verify in the browser**

Run `npm run typecheck && npm test`. Then with fixture mode (`NEXT_PUBLIC_DEV_FIXTURES=1 npm run dev` via `preview_start`), check at 1440x900 and 375x812 in light and dark:
- strip background equals page background (`getComputedStyle` of `[data-part="S.top"]` and `main` give the same `background-color`), no border or box-shadow on the strip;
- sidebar folds to 64px and back; active tab row is `--soft-2`;
- phone shows the bottom bar with exactly five links and no labels;
- "Show part names" labels `S.side`/`S.top`/`S.bar` and the tab root;
- set `localStorage['basedly-prefs']` to `{"theme":"dark","sidebar":"collapsed","navPicks":["habits","money"]}` and reload: app loads, dark, sidebar in rail.
Screenshot each tab once.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Build the Sorro shell with a seamless top strip and five tabs"
```

### Task 5: Rename the apps and native frames

**Files:**
- Modify: `package.json` (`"name": "sorro"`), `capacitor.config.ts` (`appName: 'Sorro'`, `android.backgroundColor: '#111113'`), `public/manifest.webmanifest` (name, short_name `Sorro`, description "Notes, calendar and tasks with an assistant.", colors `#111113`, icon `/brand/app-icon.png` 1024 any + maskable), `src-tauri/tauri.conf.json` (`productName` and window `title` `Sorro`, `"decorations": false`, `app.withGlobalTauri: true`, `shortDescription`), `src-tauri/capabilities/default.json`, `components/Shell.tsx` (window controls, status bar), `android/app/src/main/res/` and `src-tauri/icons/` (generated)

**Interfaces:**
- Consumes: `/brand/app-icon.png` (Task 1); strip `S.top` (Task 4).

- [ ] **Step 1: Tauri window controls**

Capability: add `"remote": { "urls": ["https://basedly-web-jhemsini.vercel.app/*"] }` and permissions `core:window:allow-minimize`, `core:window:allow-toggle-maximize`, `core:window:allow-close`, `core:window:allow-start-dragging`. In the strip, when `window.__TAURI__` exists: put `data-tauri-drag-region` on the strip and its title, and render three 46x40 buttons (minimize, maximize, close) at the right calling `window.__TAURI__.window.getCurrentWindow().minimize() / toggleMaximize() / close()`; close hover is `--close` with `--on-media` icon (copy LodiSave `.caption` rules). Double-click on the strip toggles maximize.

- [ ] **Step 2: APK status bar**

In the Shell, on native platform, call `StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light })` whenever the resolved theme changes. The strip pads `env(safe-area-inset-top)`.

- [ ] **Step 3: Icons**

Run: `npx tauri icon public/brand/app-icon.png` and `npx --yes @capacitor/assets generate --iconBackgroundColor '#0F0F10' --iconBackgroundColorDark '#0F0F10'` with the icon copied to `assets/icon-only.png` (do not commit `assets/`).
Expected: `src-tauri/icons/*` and `android/app/src/main/res/mipmap-*` updated.

- [ ] **Step 4: Verify**

`npm run build` passes. `npm run desktop` builds; install the NSIS exe by double-click (silent install hangs on this PC). In the running app: title bar is gone, strip drags the window, double-click maximizes, the three buttons work, at 380px width the buttons do not cover the search icon. `npm run apk` from a worktree per memory `apk-builds-from-a-worktree` (copy `android/local.properties`, revert capacitor gradle files after `cap sync`); install on the phone; strip clears the status bar in both themes, icon shows the fox.

- [ ] **Step 5: Commit, push, release**

```bash
git add -A
git commit -m "Rename the apps to Sorro and draw the Windows title bar in the strip"
git push origin master
```

Check the live site signed in at https://basedly-web-jhemsini.vercel.app after the Vercel deploy: Home empty state, five tabs, a removed route such as `/habits/` lands on `/home/`. Create a GitHub release `v2.0.0-s1` with the APK and the Setup exe after asking Jhems (publishing needs a yes).

- [ ] **Step 6: Log it**

Append a dated entry to `C:\Users\J30N\dev-context\projects\basedly.md` `## Change log` (What / Why, note the `basedly-final` tag and `lib/legacyQueue.ts`), then `git -C C:\Users\J30N\dev-context pull --rebase`, `add -A`, commit, `push`. Update `AGENTS.md` change brief to cover S1.
