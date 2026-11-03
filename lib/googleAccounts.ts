'use client';

import { supabase } from './supabase';
import { NATIVE_REDIRECT, isNative, signInWithGoogle } from './nativeAuth';
import { Browser } from '@capacitor/browser';

/**
 * Google write access for up to three Google accounts on one Basedly account.
 *
 * Supabase hands over a Google access token (`provider_token`) only on the
 * sign-in that produced it, and only for that one account. So every token that
 * passes through is kept here under its Google email, and an edit picks the one
 * whose account owns the calendar. Tokens last about an hour; an expired one is
 * dropped and the edit asks to reconnect that account.
 *
 * A second Google account must be *linked* (`linkIdentity`), not signed in with:
 * signing in with an unlinked account opens a different Basedly account. Once
 * linked, signing in with it returns to this Basedly account with a fresh token.
 */

export const MAX_GOOGLE_ACCOUNTS = 3;
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const KEY = 'bd_google_tokens';
type Stored = Record<string, { token: string; exp: number }>;

const read = (): Stored => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const write = (v: Stored) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked */ } };

/** Live tokens, by Google email. */
export function googleTokens(): { email: string; token: string }[] {
  const now = Date.now() + 60_000;
  return Object.entries(read()).filter(([, t]) => t.exp > now).map(([email, t]) => ({ email, token: t.token }));
}

export function forgetGoogleToken(token: string) {
  write(Object.fromEntries(Object.entries(read()).filter(([, t]) => t.token !== token)));
}

let lastSeen = '';
async function remember(token: string | null | undefined) {
  if (!token || token === lastSeen) return;
  lastSeen = token;
  const res = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`).catch(() => null);
  if (!res?.ok) return;
  const info = await res.json() as { email?: string; expires_in?: string; scope?: string };
  if (!info.email || !info.scope?.includes(CALENDAR_SCOPE)) return;
  write({ ...read(), [info.email.toLowerCase()]: { token, exp: Date.now() + Number(info.expires_in ?? 0) * 1000 } });
}

if (typeof window !== 'undefined') {
  void supabase.auth.getSession().then(({ data }) => remember(data.session?.provider_token));
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') write({});
    else void remember(session?.provider_token);
  });
}

/** Google emails already attached to this Basedly account. */
async function linkedEmails(): Promise<string[]> {
  const { data } = await supabase.auth.getUser();
  return (data.user?.identities ?? [])
    .filter((i) => i.provider === 'google')
    .map((i) => String(i.identity_data?.email ?? '').toLowerCase())
    .filter(Boolean);
}

/**
 * Ask Google for calendar write access for `email` (or a chosen account).
 * Linked accounts sign in again for a fresh token; new ones are linked first.
 * `back` is where the app returns after Google.
 */
export async function connectGoogleAccount(email?: string, back = '/calendar/'): Promise<{ error?: string }> {
  sessionStorage.setItem('sorro-after-auth', back);
  const linked = await linkedEmails();
  const known = !!email && linked.includes(email.toLowerCase());
  const queryParams: Record<string, string> = { prompt: 'consent select_account', ...(email ? { login_hint: email } : {}) };
  if (known) return signInWithGoogle({ prompt: queryParams.prompt, scopes: CALENDAR_SCOPE, loginHint: email });
  if (linked.length >= MAX_GOOGLE_ACCOUNTS) return { error: `Basedly connects up to ${MAX_GOOGLE_ACCOUNTS} Google accounts.` };
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: {
      redirectTo: isNative() ? NATIVE_REDIRECT : `${window.location.origin}/auth/callback/`,
      scopes: CALENDAR_SCOPE, queryParams, skipBrowserRedirect: isNative(),
    },
  });
  if (error) return { error: error.message };
  if (isNative() && data?.url) await Browser.open({ url: data.url });
  return {};
}
