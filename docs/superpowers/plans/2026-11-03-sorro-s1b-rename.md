# Sorro S1b Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove "basedly" from Sorro at every layer without losing saved data.

**Architecture:** Code renames land on branch `sorro-s1b`. The database rename is one generated migration built from the live catalog (the repo's migration files have drifted from production). Release order: migration, Edge Functions, web push, then domains, native apps, repo, folder.

**Tech Stack:** Next.js static export, Supabase (CLI `npx -y supabase@latest`, logged in; `db query --remote=jdkbnsjczanvmmpsovhm`), Vercel MCP, Capacitor Android, Tauri 2, GitHub CLI.

**Spec:** `docs/superpowers/specs/2026-11-03-sorro-s1b-rename-design.md`

## Global Constraints

- Sorro tables become `sorro_*`; tracker and social tables keep `bd_` until S6.
- Table owner rule: a table is Sorro's if code reachable from a kept screen (Home, Notes, Calendar, Tasks, Vault, Shell, Settings, Search, Capture, Account) reads or writes it, not counting `lib/legacyQueue.ts`. Functions follow the table they serve; RPCs called from kept code are Sorro's.
- Storage keys move `basedly-*`/`basedly_*` → `sorro-*`/`sorro_*` with copy-if-absent then delete.
- New IDs: Android `com.sorro.app`, scheme `com.sorro.app://`, Tauri `com.sorro.desktop`, Vercel project `sorro`, domain `sorro-jhemsini.vercel.app` (or nearest free), GitHub `jherobred/sorro`, Supabase display name `sorro`, buckets `sorro-files`, `sorro-journal`, `sorro-avatars`.
- Unchanged: Supabase ref `jdkbnsjczanvmmpsovhm`, user and row IDs.
- Commit messages: sentence case, no prefix, no co-author trailer.
- Any new browser-side host goes into both CSPs (`vercel.json`, `app/layout.tsx`).
- Live writes (migration, function deploy, dashboard changes, domain moves, repo rename) are done by Claude through the CLI, Vercel MCP and the browser, per Jhems's instruction; anything needing a password or secret value is left to Jhems.

## Review Focus

1. **Persisted offline queue.** `basedly-cache` (TanStack persister) restores before migration runs → queued writes lost. `migrateStorageKeys` must run before the persister reads (Task 1 test + Task 1 Step 4 order check).
2. **Function bodies naming renamed tables.** A plpgsql RPC still saying `bd_tasks` after the rename fails at call time (`bd_restore`, `bd_complete_onboarding`, `reorder_notebooks`). Task 3 verifies every function body against the rename map.
3. **Stored URLs pointing at old buckets.** Rows holding full storage URLs or bucket-qualified paths break when files move. Task 3 Step 1 counts them before moving anything.
4. **Auth redirect after the domain move.** Google sign-in on the new domain or the new APK scheme lands on a Supabase error if the allowlist misses it. Task 5 and Task 6 sign in for real.
5. **Old APK and desktop builds.** They load the old domain; it must redirect to the new one, not 404 (Task 5).

---

### Task 1: Storage key migration

**Files:**
- Create: `lib/storageKeys.ts`, `lib/storageKeys.check.ts`
- Modify: `app/layout.tsx` (inline bootstrap), `app/providers.tsx`, every file using a `basedly-*`/`basedly_*` key (see `grep -rn "basedly[-_]" app components lib public scripts`)

**Interfaces:**
- Produces: `export const LEGACY_KEYS: readonly string[]` and `export function migrateStorageKeys(store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>): number` (returns how many keys moved). New name = old name with leading `basedly` replaced by `sorro`.

- [ ] **Step 1: Write `lib/storageKeys.check.ts`** with a Map-backed fake Storage:
  - `basedly-prefs` → moves to `sorro-prefs` with the same value, old key gone, returns 1;
  - existing `sorro-prefs` is not overwritten, old key still removed;
  - second run returns 0 and changes nothing;
  - unrelated keys (`sb-...-auth-token`) untouched;
  - prefixed dynamic keys (`basedly-journal-day:2026-11-03`) move to `sorro-journal-day:2026-11-03`.
- [ ] **Step 2:** `node --test lib/storageKeys.check.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** Iterate a snapshot of keys; match `/^basedly[-_]/`. Run it for `localStorage` and `sessionStorage`.
- [ ] **Step 4: Wire it first.** Inline bootstrap in `app/layout.tsx` gets the same loop (it runs before React and before the persister). `providers.tsx` calls `migrateStorageKeys` too, guarding against a cached old bootstrap. IndexedDB/Cache Storage names (`basedly-cache` if it is an IDB name, SW cache names in `scripts/sw.js`): rename; the SW deletes caches not matching its new prefix on activate.
- [ ] **Step 5: Rename every key literal** to `sorro-*`.
- [ ] **Step 6:** `node --test lib/storageKeys.check.ts` → 5 pass; `npm test`, `npx tsc --noEmit` pass. Browser (fixture dev server): set `basedly-prefs` with `theme:'dark'`, reload → `sorro-prefs` holds it, page is dark, no `basedly-` keys remain.
- [ ] **Step 7: Commit** "Move browser storage keys from basedly to sorro".

### Task 2: Visible brand and code names

**Files:** `app/page.tsx` (login), `app/auth/callback/page.tsx`, `components/Crashed.tsx`, `components/SettingsModal.tsx`, `components/CaptureSheet.tsx`, `components/Integrations.tsx`, calendar components that write "Basedly" into Google events, `lib/*` strings and comments, CSS files with `basedly-*` classes, `public/offline.html`, `scripts/*`, `README`/docs except history files (`HANDOFF.md` history and dated plans stay as written; `HANDOFF.md` gets a new top section).
Delete: `components/BasedlyLogo.tsx`, `public/basedly-*`, `public/icon.svg`, `public/icon.png`, otter and showcase PNGs in `public/` once unreferenced.

- [ ] **Step 1: Login page.** One column on `--bg`: `<Fox pose="head" size={40}/>`, `sorro` wordmark (Geist 600, 28px), one line "Notes, calendar and tasks with an assistant.", Google button as `.sx-pill` style full width max 320px. Keep the existing sign-in logic untouched.
- [ ] **Step 2: Sweep.** Replace remaining `Basedly`/`basedly` text, identifiers, classes and comments with Sorro equivalents. Google event description text becomes "Added from Sorro".
- [ ] **Step 3: Gate.** `grep -rniI basedly --exclude-dir={node_modules,.git,.next,out,target,.claude,.superpowers} .` lists only: `HANDOFF.md` history, `docs/superpowers/**` (dated), `supabase/migrations/00*` already applied, `capacitor.config.ts`/`tauri.conf.json`/`android/**`/`src-tauri/**` (Tasks 5–6), `vercel.json` domain (Task 5).
- [ ] **Step 4:** `npm test`, `tsc`, `npm run build` pass; fixture browser check of `/` login at 1440 and 375 (light/dark), Home, Notes.
- [ ] **Step 5: Commit** "Replace the Basedly brand with Sorro in the app".

### Task 3: Database rename migration

**Files:**
- Create: `scripts/gen-sorro-rename.mjs` (generator), `supabase/migrations/0026_sorro_rename.sql` (generated, committed), `supabase/migrations/0027_drop_bd_compat_views.sql` (applied one week later, not now)
- Modify: every `from('bd_…')`, `.rpc('bd_…')` and storage `from('bd-…')` in kept code and `supabase/functions/**`

**Interfaces:**
- Produces: `RENAME_TABLES: Record<string,string>` and `RENAME_FUNCTIONS: Record<string,string>` exported from `scripts/gen-sorro-rename.mjs`, printed to the ledger.

- [ ] **Step 1: Classify and measure (read-only).** List `bd_` tables and functions from the live catalog; apply the owner rule by grepping kept code; record the map in the ledger. Count rows whose text columns contain `bd-files`, `bd-journal`, `bd-avatars` or `/storage/v1/object` (one query per text column of Sorro tables). If any exist, the migration also rewrites them.
- [ ] **Step 2: Generator.** Reads the live catalog (via `supabase db query --read-only -o json`) and writes SQL, in one `begin … commit`:
  1. `alter table public.bd_x rename to sorro_x` for each mapped table; indexes, constraints and triggers named `bd_x_*` renamed to `sorro_x_*`.
  2. For each mapped function: `pg_get_functiondef`, replace every mapped table and function name (word-boundary regex, longest first), rename the function, `create or replace` it; `drop function` the old signature. Grants re-applied as in the original (`proacl`).
  3. For every function not mapped but whose body names a mapped table: recreate with the new names, same name.
  4. Compat views: `create view public.bd_x with (security_invoker = true) as select * from public.sorro_x; grant select on public.bd_x to authenticated;`
  5. Buckets: insert `sorro-files`, `sorro-journal`, `sorro-avatars` copying `public`, size and mime settings; copy storage policies with bucket ids replaced. Objects are moved by Step 5, not SQL.
  6. Cron: unschedule `basedly-bot-*`, reschedule the same commands as `bot-tips`, `bot-news`, `bot-chal`.
  7. Any row rewrites found in Step 1.
- [ ] **Step 3: Dry run.** `supabase db query --remote … -f 0026_sorro_rename.sql` wrapped as `begin; … ; rollback;` (generator flag `--dry`). Expected: no error.
- [ ] **Step 4: Code.** Replace mapped names in `lib`, `components`, `app`, `supabase/functions`. `npm test`, `tsc`, `npm run build` pass. Commit "Rename Sorro's tables and functions from bd_ to sorro_".
- [ ] **Step 5: Object move script** `scripts/move-buckets.mjs`: list objects per old bucket with the service role from the CLI (`supabase projects api-keys`, kept in memory only), download and upload each to the new bucket at the same path, compare counts and byte sizes. Old buckets stay until the compat views are dropped.

### Task 4: Release the rename

- [ ] **Step 1:** Ask Jhems to open the current app on each device he uses with a connection, so queued offline writes sync. Check on this PC: `pendingWriteCount()` is 0 on the live site.
- [ ] **Step 2:** Apply `0026` for real; run `move-buckets.mjs`; deploy Edge Functions (`supabase functions deploy <name> --project-ref …` for all six); merge `sorro-s1b` to master and push. Steps run back to back.
- [ ] **Step 3: Verify live (old domain still):** sign in, Notes/Tasks/Calendar load, create, edit and delete a test task (then remove it), open a note with an image from `sorro-files`, trigger Google sync, call one Edge Function, read `bd_tasks` view returns rows. Run `supabase db advisors` and compare with before.

### Task 5: Domains, auth and web URL

- [ ] **Step 1:** Vercel MCP: rename project `basedly-web` → `sorro`; add domain `sorro-jhemsini.vercel.app` (nearest free if taken) to production. Old domain: redirect permanently to the new one (Vercel domain redirect).
- [ ] **Step 2:** Supabase dashboard (browser): Auth URL configuration site URL → new domain, add new domain and `com.sorro.app://auth` to redirect URLs (keep old ones until Task 6 done). Project settings: rename to `sorro`.
- [ ] **Step 3:** Google Cloud console (browser): add the new origin to the OAuth client's authorized JavaScript origins.
- [ ] **Step 4:** Code: `capacitor.config.ts` `server.url`, `src-tauri/tauri.conf.json` `frontendDist`/`devUrl`, capability `remote.urls`, any hard-coded old domain. Commit, push.
- [ ] **Step 5: Verify:** old domain → 301 to new; sign in with Google on the new domain lands in Sorro; Google Calendar edit works (token origin).

### Task 6: Native apps

- [ ] **Step 1: Android.** `namespace`/`applicationId` `com.sorro.app`; move `android/app/src/main/java/com/basedly/app` → `com/sorro/app` and fix `package` lines; manifest scheme, widget actions; `lib/nativeAuth.ts` `NATIVE_REDIRECT = 'com.sorro.app://auth'`. Build per memory `apk-builds-from-a-worktree`. Jhems installs on the phone (or `adb install` if a device is attached); Google sign-in returns to the app.
- [ ] **Step 2: Windows.** Tauri `identifier` `com.sorro.desktop`; `Cargo.toml` package name `sorro-desktop`; `npm run desktop` with `PATH=/c/Users/J30N/.cargo/bin:$PATH`; install by double-click; sign in; window buttons, drag and double-click maximize work.
- [ ] **Step 3:** Remove the old Supabase redirect entries. Commit "Rename the Android and Windows apps to Sorro".
- [ ] **Step 4:** Ask Jhems before publishing a GitHub release with the APK and installer.

### Task 7: Repo, folder, records

- [ ] **Step 1:** `gh repo rename sorro -R jherobred/basedly --yes`; `git remote set-url origin https://github.com/jherobred/sorro.git`; Vercel MCP confirms the git link still points at the repo (push a no-op commit only if needed).
- [ ] **Step 2:** dev-context: rename `projects/basedly.md` → `projects/sorro.md`, update REPOS.md row, append change-log entry, commit, push.
- [ ] **Step 3:** Update Claude memory notes that name Basedly (content and filenames), MEMORY.md index.
- [ ] **Step 4 (last):** Tell Jhems the folder rename ends this session's working directory; rename `C:\Users\J30N\BASEDLY` → `C:\Users\J30N\SORRO` and copy the memory folder `C--Users-J30N-BASEDLY` → `C--Users-J30N-SORRO`. Jhems reopens the project from the new folder.
- [ ] **Step 5 (one week later, scheduled):** apply `0027_drop_bd_compat_views.sql`, delete old buckets after re-checking counts.
