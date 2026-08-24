'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { signInWithGoogle } from './nativeAuth';
import { toast } from './toast';
import { resetPersistedCache, pendingWriteCount } from './offline';

/**
 * More than one account, one tap apart.
 *
 * A student has a personal Google account and a school one, and the second is
 * the one the timetable and the class group live in. Signing out and back in
 * costs a full OAuth round trip — on the APK that means leaving the app for the
 * system browser and coming back through a deep link — so in practice nobody
 * does it, and half their week lives in an account they never open.
 *
 * **How it works.** Supabase keeps exactly one session. This keeps a copy of
 * every session you have signed into, and switching is `setSession()` with the
 * one you picked. Nothing is re-authorised, nothing leaves the device.
 *
 * **Refresh-token rotation is the part that has to be right.** Supabase issues
 * a new refresh token every time one is used and invalidates the old one, so a
 * copy taken at sign-in is worthless an hour later. `remember()` is therefore
 * wired to `onAuthStateChange`, which fires on every refresh — the stored copy
 * is always the live one. Store it once at sign-in instead and switching back
 * fails the first time you try it, days later, with no way to tell why.
 *
 * **What this puts on the device.** A refresh token per account, in
 * localStorage, next to the one Supabase already keeps there. That is the same
 * exposure as staying signed in, multiplied by how many accounts you added; it
 * is the user's own device and the same trade every multi-account app makes.
 * `forget()` removes one, and signing out clears the lot.
 *
 * **Switching reloads the page, deliberately.** The query cache, the persisted
 * copy of it, the prefs store, the cached user id, the realtime socket and the
 * presence channel are all keyed to whoever was signed in. Tearing each one
 * down by hand is six chances to leave one holding the previous account's rows
 * — and a name or a balance from the wrong account is the worst bug this app
 * could have. A reload cannot get it wrong.
 */

export type Stored = {
  user_id: string;
  email: string;
  name: string;
  photo: string | null;
  access_token: string;
  refresh_token: string;
  /** When this copy was taken, so the list can be ordered by last used. */
  at: number;
};

const KEY = 'basedly-accounts';
/** Who the caches below currently belong to. */
const CURRENT = 'basedly-account-current';
/** localStorage caches wiped on a switch. The query cache is IndexedDB now — see resetPersistedCache(). */
const SCOPED = ['basedly-prefs'];

const listeners = new Set<() => void>();
let cache: Stored[] | null = null;

function read(): Stored[] {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(raw) ? (raw as Stored[]).filter((a) => a?.user_id && a?.refresh_token) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: Stored[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* quota or private mode — switching just will not persist */ }
  for (const l of listeners) l();
}

/** Every account signed into on this device, most recently used first. */
export function useAccounts(): Stored[] {
  return useSyncExternalStore(
    useCallback((cb: () => void) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    }, []),
    () => read(),
    () => EMPTY,
  );
}
const EMPTY: Stored[] = [];

/**
 * Record the live session. Called on every auth event, which is what keeps the
 * stored refresh token current through rotation.
 *
 * Returns true when the signed-in account *changed* — the caller reloads on
 * that, because clearing localStorage does nothing to the query cache already
 * sitting in memory, and coming back from Google is a client-side route change,
 * not a fresh document.
 */
export async function remember(session: {
  access_token: string; refresh_token: string;
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> };
} | null): Promise<boolean> {
  if (!session?.user?.id || !session.refresh_token) return false;
  const m = session.user.user_metadata ?? {};
  const row: Stored = {
    user_id: session.user.id,
    email: session.user.email ?? '',
    name: String(m.full_name ?? m.name ?? session.user.email ?? 'Account'),
    photo: typeof m.avatar_url === 'string' ? m.avatar_url : null,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    at: Date.now(),
  };
  write([row, ...read().filter((a) => a.user_id !== row.user_id)]);

  // Whoever just signed in may not be who the caches belong to. This is the
  // path an added account comes back through, so it is also what stops the new
  // one inheriting the last one's rows.
  try {
    const was = localStorage.getItem(CURRENT);
    localStorage.setItem(CURRENT, row.user_id);
    // Clearing here can discard writes the previous account had queued, so both
    // ways in — switchTo() and addAccount() — refuse to start while any are
    // pending. What is left reaching this line is a session that changed
    // outside the app (restored on launch), where the old account is already
    // gone: there is nothing to flush to, and keeping its rows would hand them
    // to the new account instead. Clearing is the lesser loss.
    if (was && was !== row.user_id) { await clearScoped(); return true; }
  } catch { /* private mode */ }
  return false;
}

/** Install once, at app start. Returns a cleanup function. */
export function watchAccounts(): () => void {
  const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') { await clearScoped(); clearCurrent(); return; }
    if (await remember(session)) window.location.assign('/home/');
  });
  // The session that is already live when the app opens — no event fires for it.
  void supabase.auth.getSession().then(async ({ data: d }) => {
    if (await remember(d.session)) window.location.assign('/home/');
  });
  return () => data.subscription.unsubscribe();
}

async function clearScoped() {
  for (const k of SCOPED) {
    try { localStorage.removeItem(k); } catch { /* nothing to clear */ }
  }
  await resetPersistedCache();
}

/** Forget who the caches belonged to — used when signing out entirely. */
function clearCurrent() {
  try { localStorage.removeItem(CURRENT); } catch { /* private mode */ }
}

/**
 * Become somebody else.
 *
 * The token that comes back from `setSession` is a *new* one — rotation again —
 * so it is stored before the reload or the next switch back would fail.
 */
export async function switchTo(userId: string): Promise<void> {
  const target = read().find((a) => a.user_id === userId);
  if (!target) { toast('That account is not signed in on this device'); return; }

  // Switching tears down the query cache (clearScoped -> resetPersistedCache),
  // and that cache is where paused, offline-queued mutations live. Losing them
  // is data loss; replaying them after the switch mis-attributes them to the
  // new account. Neither is acceptable, so refuse the switch instead.
  if (pendingWriteCount() > 0) {
    toast('Unsynced changes — reconnect before switching accounts');
    return;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: target.access_token,
    refresh_token: target.refresh_token,
  });

  if (error || !data.session) {
    // Offline, a local fetch failure (status 0), or a 5xx infrastructure
    // outage: all retryable, not a rejection. The stored token may still be
    // good — leave it alone and let the user try again.
    const retryable = !navigator.onLine
      || error?.name === 'AuthRetryableFetchError'
      || !error?.status
      || error.status >= 500;
    if (retryable) {
      toast('Could not switch — check your connection');
      return;
    }
    // A real rejection (Google revoked it, it expired, another device spent
    // it): nothing to salvage. Drop it and ask for a fresh sign-in.
    forget(userId);
    toast(`${target.name} needs signing in again`);
    return;
  }

  await remember(data.session);   // rotation again: store the token it just issued
  await clearScoped();   // must finish before the reload below or the delete races the navigation
  window.location.assign('/home/');
}

/**
 * Add one. `prompt: 'select_account'` is the whole point — without it Google
 * silently returns the account already signed in there and the button appears
 * to do nothing, which is the single most common way this feature ships broken.
 */
export async function addAccount(): Promise<void> {
  // Same reason `switchTo` refuses: coming back from Google lands in
  // `remember()`, which clears the cache the queued writes live in. The guard
  // has to be here, before the round trip — by the time `remember()` runs the
  // session has already changed and there is no account left to flush them to.
  if (pendingWriteCount() > 0) {
    toast('Unsynced changes — reconnect before adding an account');
    return;
  }
  // Nothing is cleared here on purpose. Cancelling at Google's chooser is a
  // normal thing to do, and it should cost nothing; `remember()` wipes the
  // scoped caches on the way back in, once there is actually a new account.
  const { error } = await signInWithGoogle({ prompt: 'select_account' });
  if (error) toast(error);
}

export function forget(userId: string) {
  write(read().filter((a) => a.user_id !== userId));
}

/** Sign out everywhere on this device. */
export async function signOutAll() {
  write([]);
  await clearScoped();
  clearCurrent();
  await supabase.auth.signOut();
}
