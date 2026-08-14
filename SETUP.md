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

## You have to do this — I can't

Sign-in will fail until Google OAuth is configured. This needs credentials, so it is yours:

1. **Google Cloud Console** → create an OAuth 2.0 Client ID (type: Web application).
   - Authorised redirect URI: `https://lgdvpghpivxnuwlpgbzf.supabase.co/auth/v1/callback`
2. **Supabase dashboard** → Authentication → Providers → Google → paste the client ID and
   secret, enable.
3. **Supabase** → Authentication → URL Configuration → add to *Redirect URLs*:
   - `http://localhost:3000/auth/callback/` (local dev)
   - `https://<your-domain>/auth/callback/` (production)
   - `com.basedly.app://auth` (the Android app)

The Android scheme is already registered in `android/app/src/main/AndroidManifest.xml` and
must stay in sync with `NATIVE_REDIRECT` in `lib/nativeAuth.ts`.

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

Supabase project **`jhems-os`** (`lgdvpghpivxnuwlpgbzf`, ap-southeast-1). Basedly's tables all
carry the `bd_` prefix and share the database with the older JHEMS-OS tables. The schema was
already applied before this frontend existed — RLS is on every table, plus helper RPCs:

- `bd_restore(p_table, p_id)` — clears `deleted_at`, backs the Undo toast
- `bd_set_pin` / `bd_verify_pin` — the Money section's PIN gate
- `bd_locked_sections()` — which sections are PIN-gated
- `manila_today()` — day boundaries in the user's timezone

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

## Known gaps

- Long-press context menus (420 ms / 7 px cancel) are specified in `ANNOTATIONS.md` but only
  the constants are in place (`lib/pal.ts` → `K`); no menu component yet.
- Push reminders need a Supabase Edge Function on `pg_cron` plus FCM registration.
- Avatar art and real uploads are unsourced assets, per the handoff.
