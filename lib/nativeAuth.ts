'use client';

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { supabase } from './supabase';

export const isNative = () => Capacitor.isNativePlatform();

/**
 * The app's own scheme, registered in AndroidManifest.xml and in the Supabase
 * redirect allow-list. Read from the installed package, because the APK built
 * before the rename (com.basedly.app) loads this same live code.
 */
let scheme: Promise<string> | undefined;
export const appScheme = () => scheme ??= App.getInfo().then(i => i.id + '://').catch(() => 'com.sorro.app://');
export const asUrl = (url: string, s: string) => new URL(url.replace(s, 'https://app/'));

/**
 * Google blocks OAuth inside embedded webviews, so the native shell cannot use
 * the plain web redirect. Instead: open the consent screen in the system
 * browser, catch the deep link back, and exchange the PKCE code ourselves.
 */
export async function signInWithGoogle(
  /** `prompt: 'select_account'` forces Google's chooser — see lib/accounts.ts. */
  opts: { prompt?: string; scopes?: string; loginHint?: string } = {},
): Promise<{ error?: string }> {
  const redirectTo = isNative() ? (await appScheme()) + 'auth' : `${window.location.origin}/auth/callback/`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      ...(opts.scopes ? { scopes: opts.scopes } : {}),
      skipBrowserRedirect: isNative(),
      queryParams: { ...(opts.prompt ? { prompt: opts.prompt } : {}), ...(opts.loginHint ? { login_hint: opts.loginHint } : {}) },
    },
  });

  if (error) return { error: error.message };
  if (isNative() && data?.url) await Browser.open({ url: data.url });
  return {};
}

/**
 * Install the deep-link handler once, at app start. Returns a cleanup fn.
 * No-op on the web build, where detectSessionInUrl already handles the code.
 */
export function listenForNativeAuth(onSignedIn: () => void): () => void {
  if (!isNative()) return () => {};

  const handle = App.addListener('appUrlOpen', async ({ url }) => {
    const s = await appScheme();
    if (!url.startsWith(s + 'auth')) return;

    // Supabase returns ?code=... for PKCE; errors come back as ?error=...
    const params = asUrl(url, s).searchParams;
    const code = params.get('code');

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) onSignedIn();
    }
    await Browser.close().catch(() => {});
  });

  return () => {
    void handle.then((h) => h.remove());
  };
}
