# Basedly — setup & state

Frontend for the Basedly v1 design freeze (`design_handoff_basedly_v1`). Next.js static
export + Supabase, wrapped in Capacitor for Android. One build feeds both the website and
the APK, which is what keeps them in sync — same code, same database.

## What's built

| Area | State |
| --- | --- |
| Design tokens, keyframes, motion system | Complete, lifted verbatim from the prototype |
| Icon set (all 58 paths, CSS-mask technique) | Complete |
| Auth — Google-only, web + native deep link | Complete, **needs credentials (below)** |
| Onboarding — 4 steps, seeds notebook + lists | Complete |
| App shell — sidebar, bottom nav, top bar, toast+undo | Complete |
| Offline reads + queued writes | Complete |
| Preferences (theme / accent / motion) persisted per user | Complete |
| Tasks — list, add, star, complete, delete, undo | Complete |
| Home | Greeting + task tile only; remaining tiles pending |
| Calendar, Notebooks, Projects, Habits, Body, Money, Community, Files, People | Not built |
| AI panel | Deliberately omitted from v1 |

## Live

| | |
| --- | --- |
| Web app | https://basedly-web-jhemsini.vercel.app |
| Repo | https://github.com/jherobred/basedly (private) |
| Vercel project | `basedly-web` — deploys automatically on push to `master` |
| Supabase | project `basedly`, ref `jdkbnsjczanvmmpsovhm`, ap-southeast-1 |

## You have to do this — I can't

The site is live, but **sign-in cannot work yet**: the Supabase project has only `email`
enabled, `google: false` (verified against `/auth/v1/settings`). Enabling it means entering
OAuth credentials, so it is yours:

1. **Google Cloud Console** → create an OAuth 2.0 Client ID (type: Web application).
   - Authorised redirect URI: `https://jdkbnsjczanvmmpsovhm.supabase.co/auth/v1/callback`
2. **Supabase dashboard** → Authentication → Providers → Google → paste the client ID and
   secret, enable.
3. **Supabase** → Authentication → URL Configuration → add to *Redirect URLs*:
   - `https://basedly-web-jhemsini.vercel.app/auth/callback/` (production)
   - `http://localhost:3000/auth/callback/` (local dev)
   - `com.basedly.app://auth` (the Android app)

Note: `signInWithOAuth` builds the authorize URL client-side without validating it, so while
Google is disabled the button fails silently rather than showing an error. That is a
supabase-js behaviour, not a bug in the sign-in screen.

The Android scheme is already registered in `android/app/src/main/AndroidManifest.xml` and
must stay in sync with `NATIVE_REDIRECT` in `lib/nativeAuth.ts`.

### Where the APK lives (Settings → App)

Settings → App can check for a new build and hand the user the APK, but it needs somewhere
to look. Publish a small JSON manifest alongside each release and point the app at it:

```json
{
  "version": "1.1.0",
  "url": "https://github.com/<you>/basedly/releases/download/v1.1.0/basedly-1.1.0.apk",
  "notes": "Faster sync, calendar zoom on phone."
}
```

Then set `NEXT_PUBLIC_UPDATE_URL` to that file's URL and bump `NEXT_PUBLIC_APP_VERSION` to
match each build. A GitHub release asset works and costs nothing;
`releases/latest/download/update.json` is a stable URL that always resolves to the newest
release, so the app never needs redeploying to learn about one.

Until it is set, the section says so plainly instead of offering a button that goes nowhere.
Installing over the top keeps the user's data — everything lives in Supabase — so no
uninstall-reinstall cycle is needed.

## Commands

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm run apk
```

`npm run apk` builds the web app, syncs it into the Android project, and produces
`android/app/build/outputs/apk/debug/app-debug.apk`.

## Backend

Supabase project **`basedly`** (`jdkbnsjczanvmmpsovhm`, ap-southeast-1) — a clean database
containing only the `bd_*` tables. The schema was replayed from the original `jhems-os`
project's migrations, so the two are identical in structure; `jhems-os` is now unused by this
app. RLS is on every table, plus helper RPCs:

- `bd_restore(p_table, p_id)` — clears `deleted_at`, backs the Undo toast
- `bd_set_pin` / `bd_verify_pin` — the Money section's PIN gate
- `bd_locked_sections()` — which sections are PIN-gated
- `bd_complete_onboarding(...)` — seeds profile, term, notebook, lists and accounts in one
  transaction. The onboarding screen calls this rather than hand-rolling the inserts.
- `bd_habit_tick(habit, date, value)` — toggles a tick *and* recomputes linked challenge
  progress in the same transaction, which is what BACKEND.md requires of `POST /habits/:id/tick`

There is no API server. The client talks to Postgres directly, so **RLS is the only thing
protecting the data** — every new table needs `user_id = auth.uid()` policies before it ships.

## Offline

`lib/offline.ts`. Queries are `offlineFirst` with an infinite `gcTime` and the cache is
persisted, so opened screens still render with no signal. Mutations keep the default `online`
network mode, which *pauses* them instead of failing; paused mutations persist and replay on
reconnect.

**Every mutation must be registered with `defineMutation()` at module scope.** A mutation
resumed after an app restart has no closure to resume into — only the key. See `lib/tasks.ts`
for the pattern.

## Fidelity debt — read this first

The design tokens, keyframes, motion system, icon set and interaction constants are ported
**verbatim** from `Basedly.dc.html`. The **section layouts are not**: Tasks, Calendar, Habits,
Money, Notebooks, People, Files, Body and Projects were composed from scratch using the right
tokens, rather than recreating the prototype's actual markup. README.md calls for
pixel-for-pixel recreation, so each of these needs a second pass against the prototype.

Reference material lives in the `Design feedback needed` Claude Design project
(`4fd595cf-2503-4674-ac86-b2d873a35fd7`) — same `Basedly.dc.html` byte-for-byte, plus
`screenshots/` showing the real rendered look and `uploads/BASEDLY-DESIGN-BRIEF.md`.

Concrete deltas already spotted from `screenshots/01-ls.png` and `screenshots/phone.png`:

- Phone nav is a **floating rounded pill** with a glass/gradient fill and a filled accent
  capsule behind the active item — not the flat full-width bar currently shipped.
- Notebooks uses a **segmented tab control** (Notes / Journal / Canvas / Java) and pill-shaped
  notebook and section chips.
- The FAB is a large circular accent button with a glow, draggable and position-remembering.
- `/body` and `/projects` exist as routes but are deliberately **not linked in the sidebar**
  until they are rebuilt faithfully.

## Known gaps

- Long-press context menus (420 ms / 7 px cancel) are specified in `ANNOTATIONS.md` but only
  the constants are in place (`lib/pal.ts` → `K`); no menu component yet.
- Push reminders need a Supabase Edge Function on `pg_cron` plus FCM registration.
- Avatar art and real uploads are unsourced assets, per the handoff.
