# Sorro S1b: remove "basedly" everywhere

Date: 2026-11-03. Status: awaiting written-spec review. Requested by Jhems (Q7:
"Everything, L3 included").

## Goal

No user-visible or code-level "basedly" left in Sorro, including the live URL,
the GitHub repo, the Supabase project, table names and the Android and Windows
app IDs. Nothing the user has saved (notes, tasks, events, settings, drafts,
queued offline writes) is lost.

## Layers

### L1 What you see
Login page (`app/page.tsx`): new copy and the fox, LodiSave style (one column,
fox head, `sorro` wordmark, "Continue with Google"). The full auth redesign
(TOTP and biometrics) stays S2; this only rebrands. Also `app/auth/callback`,
`components/Crashed.tsx`, Settings copy, notification titles, the "Basedly"
text written into Google Calendar event descriptions (new writes say Sorro;
existing Google events are not rewritten), `public/offline.html`, and the
service worker's offline page.
Delete `components/BasedlyLogo.tsx` (replaced by `Fox` + wordmark) and the old
logo files in `public/` (`basedly-*`, `icon.svg`, `icon.png`, otter and
showcase PNGs) once nothing references them.

### L2 Code names
- localStorage, sessionStorage, IndexedDB and Cache Storage keys go from
  `basedly-*` / `basedly_*` to `sorro-*` / `sorro_*`. One function,
  `migrateStorageKeys()` in `lib/storageKeys.ts`, runs first in the inline
  bootstrap and in `Providers`: for each old key, copy to the new key if the
  new one is absent, then delete the old one. The TanStack persisted cache
  (`basedly-cache`) holds the offline mutation queue, so it migrates before
  the persister restores.
- Files, components, CSS classes (`basedly-wordmark`), comments and doc
  strings are renamed.

### L3 Infrastructure

**Database prefix.** The tracker app (S6) will share this Supabase project,
so tables split by owner:
- Sorro's tables become `sorro_*`: accounts, profiles, notebooks, notes,
  note_blocks, note_sections, note_tags, sections, cards, canvases,
  canvas_nodes, canvas_edges, java_files, journal_entries, journal_photos,
  scratch, tasks, subtasks, lists, terms, events, integrations,
  notifications, files, folders, workspaces, workspace_members.
- Tracker and social tables keep `bd_` for now. S6 renames them to the
  tracker app's prefix.
- Functions, triggers, indexes and constraints that belong to the renamed
  tables are renamed the same way (`bd_complete_onboarding` becomes
  `sorro_complete_onboarding`, and so on). Function bodies that name a
  renamed table are recreated with the new name.
- One migration, in one transaction: `ALTER TABLE ... RENAME`, RLS policies
  and grants carry over automatically. Then a compatibility view named after
  each old table (`create view bd_tasks with (security_invoker = true) as
  select * from sorro_tasks`), so a client still running cached old code can
  read during the rollout. The views are dropped one week later (migration
  noted in HANDOFF.md). Realtime publication membership moves to the new
  tables.
- Edge Functions (`sync`, `bot-api`, `gemini-bot`, `drive-pdf`,
  `photo-read`, `schedule-scan`) and pg_cron jobs are updated and redeployed
  in the same release.
- Order: apply the migration, deploy the Edge Functions, push the web code.
  Steps 1 to 3 run back to back. Upserts from old cached clients fail in the
  minutes between steps 1 and 3 (views do not support ON CONFLICT); the
  offline queue retries them on the new code.

**Supabase project.** Rename the display name `basedly` to `sorro` in the
dashboard. The project ref and URL (`jdkbnsjczanvmmpsovhm.supabase.co`) do not
change, so nothing else does.

**Web URL.** Rename the Vercel project `basedly-web` to `sorro` and add the
domain `sorro-jhemsini.vercel.app` (or the closest free name) as production.
Keep `basedly-web-jhemsini.vercel.app` attached with a permanent redirect to
the new domain, so old bookmarks and the old APK and desktop builds still
land. Add the new origin to Supabase Auth (site URL and redirect allowlist) and
to the Google Cloud OAuth client's authorized JavaScript origins. Capacitor
`server.url`, the Tauri `frontendDist`/`devUrl` and capability URL move to the
new domain.

Cost: each device signs in once on the new domain. Before switching, Claude
checks in the old origin that the offline queue is empty
(`pendingWriteCount()`), on each device Jhems uses.

**Android.** App ID `com.basedly.app` becomes `com.sorro.app`: Gradle
`applicationId` and `namespace`, the Java/Kotlin package folder, the custom
scheme `com.sorro.app://auth` in `AndroidManifest.xml` and
`lib/nativeAuth.ts`, widget action names, and the Supabase redirect allowlist.
It installs as a new app; uninstall the old one after the new one signs in.

**Windows.** Tauri identifier `com.basedly.desktop` becomes
`com.sorro.desktop`. It installs as a new app with its own WebView data, so it
signs in once. The installer is named `Sorro_<version>_x64-setup.exe`.

**GitHub.** Rename `jherobred/basedly` to `jherobred/sorro`. GitHub redirects
the old URL; update the local remote. Vercel's git link follows a rename;
Claude checks it after.

**Local folder.** Rename `C:\Users\J30N\BASEDLY` to `C:\Users\J30N\SORRO` last,
after everything else is pushed, because this session and the Claude memory
folder are keyed to the old path. Claude moves the memory folder to the new
key and updates REPOS.md, `projects/basedly.md` (renamed `sorro.md`) in
dev-context, and the memory notes that name Basedly.

## Not changed

The Supabase project ref and URL, user IDs, row IDs, Google Calendar links,
`bd_` tracker tables (until S6).

## Testing

- `npm test`, `tsc`, `npm run build`.
- A check (`lib/storageKeys.check.ts`) for `migrateStorageKeys`: old key
  moves, an existing new key is not overwritten, and running twice is a no-op.
- `grep -ri basedly` over the repo (excluding `node_modules`, `.git`,
  migrations already applied, and the compatibility views) returns nothing.
- Live checks after deploy: sign in on the new domain, notes, tasks and
  events load, create and edit a task, Google Calendar sync runs, an Edge
  Function call succeeds, the old domain redirects. APK: install, Google
  sign-in returns to the app through the new scheme. Windows: install, sign
  in, window buttons work.

## Out of scope

The S2 auth redesign, S4 note types, and the tracker tables' rename (S6).
