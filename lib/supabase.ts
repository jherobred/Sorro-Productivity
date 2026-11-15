import { createClient, isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jdkbnsjczanvmmpsovhm.supabase.co';
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_dFRyCNdg39_7Ee3OiObwHw_5CQK5szk';

// Publishable key is safe in the client — RLS is what protects the data.
// Every bd_* table has user_id = auth.uid() policies; see the sorro_v1_schema migration.
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      // PKCE is required for the Capacitor shell: the OAuth round-trip leaves
      // the webview and comes back through a deep link, so there is no
      // server to hold a code verifier.
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    // The default is 10 events/second, which throttles a burst of optimistic
    // writes replaying after a reconnect.
    realtime: { params: { eventsPerSecond: 40 } },
  }
);

/**
 * getSession, but usable offline. An access token lasts an hour; once it has
 * expired, getSession must refresh it, and with no connection that fails and
 * returns no session. Offline that is not a sign-out, so the stored session is
 * used as is until the connection is back and the refresh succeeds.
 */
export async function loadSession(): Promise<{ session: Session | null; error: unknown }> {
  // With an expired token, getSession keeps retrying the refresh for ~30 s when offline. Don't make the user wait.
  const saved = storedSession();
  const wait = saved && saved.expires_at && saved.expires_at * 1000 < Date.now() ? 3000 : 60000;
  const result = await Promise.race([supabase.auth.getSession(), new Promise<null>(r => setTimeout(() => r(null), wait))]);
  if (!result) return { session: saved, error: null };
  const { data, error } = result;
  if (data.session || !error || !isAuthRetryableFetchError(error)) return { session: data.session, error };
  return { session: storedSession(), error: storedSession() ? null : error };
}

/** The session saved on this device, without refreshing it. */
export function storedSession(): Session | null {
  try {
    const raw = localStorage.getItem(`sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`);
    const s = raw && JSON.parse(raw);
    return s?.user && s.refresh_token ? s : null;
  } catch { return null; }
}

/**
 * The signed-in user's id.
 *
 * This is called before almost every insert in the app, so how it gets the id
 * matters more than it looks. `supabase.auth.getUser()` POSTs to /auth/v1/user
 * to have the server validate the JWT — a full network round trip that every
 * single write was paying before it even began, and the reason typing felt
 * laggy. `getSession()` reads the persisted session locally, and the result is
 * cached here so repeat calls cost nothing at all.
 *
 * The trade is that a revoked-but-unexpired token would be trusted for a few
 * minutes longer. That is fine: RLS re-checks every statement server-side, so
 * a stale id cannot read or write anything the real user could not.
 */
let cachedUid: string | null = null;

export async function currentUserId(): Promise<string> {
  // Fixture mode has no session, and the fixtures author their rows as 'me'.
  // Without this every "is this mine?" check answers no and the owner-only
  // controls are untestable.
  if (process.env.NEXT_PUBLIC_DEV_FIXTURES === '1' && process.env.NODE_ENV !== 'production') return 'me';
  if (cachedUid) return cachedUid;
  const { session } = await loadSession();
  const id = session?.user?.id;
  if (!id) throw new Error('Not signed in');
  cachedUid = id;
  return id;
}

/** The cached id, or null — for code paths that cannot await. */
export const cachedUserId = () => cachedUid;

// Sign-out and token refresh both have to drop the cache, or the next write
// would stamp rows with the previous account's id.
supabase.auth.onAuthStateChange((event, session) => {
  cachedUid = session?.user?.id ?? null;
  if (event === 'SIGNED_OUT') cachedUid = null;
});
