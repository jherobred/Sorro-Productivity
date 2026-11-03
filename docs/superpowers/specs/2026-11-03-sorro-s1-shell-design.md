# Sorro S1: shell and design system

Date: 2026-11-03. Status: approved in chat, awaiting written-spec review.

## Program

Basedly becomes **Sorro**, a productivity-only app. Its look extends the LodiSave
Gallery (`C:\Users\J30N\LodiSave\app\ui\gallery.css`), because Jhems plans to merge
all his apps into one later. The old Basedly look and the Grok Sorro look are both
dropped. The Grok Sorro project (`Downloads\grok downloads`,
`jherobred/Sorro-DRAFT-1`) is idea input only, apart from its logo and fox mascot.

Each sub-project gets its own spec, plan and build, in this order:

| Code | Sub-project | Decided so far |
|---|---|---|
| S1 | Shell and design system | This document |
| S1b | Remove basedly everywhere | `2026-11-03-sorro-s1b-rename-design.md` |
| S2 | Auth | TOTP authenticator (QR enrolment) plus device biometrics or PIN (WebAuthn on web, native prompt in APK and Windows). Re-check every other day |
| S3 | T1 Home | AI chat that can act across the app, widget strip above it. Cloud model with a small local model as offline fallback. Focus timer is a widget |
| S4 | T2 Notes | Rebuilt notebook with Sorro's own note types; drop the Google Docs style page, it must not look like other note apps |
| S5 | T3 Calendar, T4 Tasks, T5 Vault | Tasks has list and board views, projects become task groups. Vault is a file explorer in the LodiSave Gallery layout: links, files, images, PDFs and clips, attachable to notes, tasks and events, with read-later and AI access |
| S6 | Tracker app | Later, new repo forked from tag `basedly-final`. Gets habits, focus history, fitness, fuel, money, plates, memories, people, community |
| S7 | Code comments | `/antislop-code` pass over everything Sorro keeps |
| S8 | Phone home-screen widgets | Rebuilt from scratch, useful ones only (old Basedly widgets dropped). Designed after S3 so they share the Home widget set |
| S9 | Notifications | Agenda and upcoming tasks, events and other items, each with a visual (image or rich layout). Targets: Android phone, Xiaomi tablet, Windows PC, and Redmi Watch 6 Lite (receives phone notifications through Mi Fitness, so phone notifications must read well as text-first on a small screen) |

Tabs that leave Sorro: Habits, Focus (tab), People, Community, Money, Fitness, Gym,
Fuel, Plates, Memories, Projects, Board, Links, Files, Body, More, Profile (moves
behind the avatar).

Operating rule from Jhems: Claude does the outside steps itself through the browser
and computer tools (Supabase and Vercel dashboards, Google Cloud, builds, installs),
within the safety rules (no passwords or secrets typed by Claude, confirmation
before sending, publishing or purchasing).

## Approach (O1, approved)

Rebuild in place. Tag current master `basedly-final` and push the tag. Keep the
data layer: Supabase `bd_` tables and RPCs, `lib/offline.ts` mutation queue,
`lib/supabase.ts`, Google Calendar sync (`lib/events.ts`, `lib/googleAccounts.ts`,
`lib/googleCalendarApi.ts`), the service worker, the Capacitor APK and the Tauri
app. Table names keep the `bd_` prefix; renaming live tables buys nothing.

## S1 scope

S1 delivers the frame every later sub-project plugs into. It does not rebuild any
tab's contents. After S1, T2 to T4 render their existing screens inside the new
shell with the new tokens, T1 and T5 are empty states, and all removed tabs are gone.

### D1 Tokens

Copy LodiSave's Kape tokens into `app/globals.css` `:root`, replacing Basedly's.
Same names as LodiSave (`--bg --surface --soft --soft-2 --line --ink --muted
--accent --accent-ink --pick --ok --bad`, radii `--r-row 10 --r-tile 12 --r-panel
18 --r-pill`, springs `--float --drift --snap`) so a later merge is a copy.

- Light: paper `#F7F6F4`, surface `#FFFFFF`, accent `#B84C0C`.
- Dark: `#111113`, surface `#18181A`, accent crema `#FF8A3D`.
- Theme follows the system with a Settings override (light, dark, system), stored
  in the synced prefs map.
- Type: Geist and Geist Mono, self-hosted woff2 copied from LodiSave
  (`app/ui/fonts`). Body 14px, rows 13px, tabular numbers.
- Motion: LodiSave springs, gated by the existing `.nomo` product setting, not
  `prefers-reduced-motion`.
- Old Basedly token names still used by T2 to T4 screens are aliased to the new
  tokens in one block at the end of `globals.css`, so S1 does not have to touch
  every screen. S4 and S5 remove the aliases as they rebuild each tab.

### D2 Top strip

One 44px strip per screen, same background as the page, no border, no shadow, so
it reads as part of the page. Left: current tab title. Middle: the tab's own
actions (each tab passes them in). Right: search (opens the command palette, also
Ctrl/Cmd+K). In the Windows app the window controls sit at the right of the same
strip in LodiSave's `.caption` style (46x40 buttons, close turns `--close` on
hover), and empty strip space drags the window (`data-tauri-drag-region`). In the
APK the strip sits under the status bar, and the status bar color matches `--bg`.

### D3 Navigation

- Desktop and tablet (≥ 980px): left sidebar in LodiSave's `.side` style, 232px,
  folds to a 64px icon rail (state remembered). Top: fox mark and `sorro`
  wordmark. Then five tabs: Home, Notes, Calendar, Tasks, Vault. Then a Pinned
  section (pinned notes, max 8). Bottom: avatar row that opens Settings and
  account. The active tab is a neutral `--soft-2` row, never the accent.
- Phone (< 980px): bottom bar, five icons, no labels, 56px plus safe-area inset.
  Long-press Home opens quick capture.
- Removed: TabRail, ShellDock, HubBoard, TodaySpine, DayColumn, ContextPane,
  FocusTopClock, NotificationBell in the bar, Buddy and BuddyCompanion, Streak,
  RankUp, TierBadge, ShopModal, Challenges, DailyQuests, Fireworks, the casino,
  messages dock and all onboarding modals for removed tabs.

### D4 Density

Spacing steps 6, 10, 14, 18px only. Rows 32 to 34px. Page padding 18px desktop,
14px phone. No hero cards, greeting banners, "Pick up where you left off" or
"Earlier boards, journals & Java files" sections; screens open on their content.

### D5 Part names

Every region carries `data-part="<code>"`. Codes are tab letter plus region:
`S.side`, `S.top`, `S.bar` (shell); `H.chat`, `H.widgets`; `N.list`, `N.editor`;
`C.grid`, `C.agenda`; `T.list`, `T.board`; `V.tree`, `V.grid`, `V.peek`. S1 adds
the shell codes and the tab roots (`H`, `N`, `C`, `T`, `V`); later sub-projects add
their regions. A Settings toggle "Show part names" draws each code as a small mono
label at the region's top-left corner (CSS `[data-part]::before`, outlined with
`--pick`). The list of codes lives in one file, `lib/parts.ts`.

### D6 Brand

- Name: **Sorro** in copy, `sorro` lowercase Geist 600 as the wordmark (LodiSave
  style), not the Grok Space Grotesk tracked caps.
- Mark: the Grok low-poly fox head. Strip the black background (dark pixels to
  alpha), then use it as a CSS mask (`mask-image`) filled with `--ink`, so it is
  graphite on paper and paper on graphite. App icons (favicon, PWA, Android
  adaptive, Windows) are the fox in crema on graphite.
- Mascot: the fox poses (sit, alert, glad, sleep, run) as masks filled with
  `--muted` or `--accent`. Uses: empty states (sleep), success (glad), errors
  (alert), loading (run gif, shown as the static sit pose when motion is off).
- Assets go to `public/brand/`. Rename the app in `package.json` name field,
  `capacitor.config` appName, `src-tauri/tauri.conf.json` productName and window
  title, the web manifest and `<title>`. Package IDs and the Vercel project stay
  as they are in S1 (changing the Android app ID makes it a new app and loses its
  local data); a rename of those is its own decision later.

## Data flow and errors

S1 changes no data paths. Removed tabs lose their routes; their tables and RPCs
stay in Supabase untouched for S6. Prefetch entries for removed tabs
(`lib/prefetch.ts`) are dropped so the app stops loading data it no longer shows.
Old deep links to removed routes redirect to Home.

## Testing

- `npm run build` passes and the existing `*.check.ts` checks for kept libs pass.
  Checks for deleted libs are deleted with them.
- Browser check at 1440x900 and 375x812, light and dark: the strip has no visible
  seam against the page, the sidebar folds and unfolds, the bottom bar shows five
  icons, "Show part names" labels every shell region and tab root.
- Fixture mode (`NEXT_PUBLIC_DEV_FIXTURES=1`) for renders; one signed-in check on
  the live deploy after push.
- Windows app: window controls and dragging work in the strip.

## Out of scope for S1

Tab contents (S3 to S5), auth (S2), AI (S3), the tracker app (S6), the comment pass
(S7), renaming the repo, Vercel project, Supabase project or Android package ID.
