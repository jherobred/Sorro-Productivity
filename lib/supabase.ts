import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jdkbnsjczanvmmpsovhm.supabase.co';
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_dFRyCNdg39_7Ee3OiObwHw_5CQK5szk';

// Publishable key is safe in the client — RLS is what protects the data.
// Every bd_* table has user_id = auth.uid() policies; see the basedly_v1_schema migration.
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
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
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
