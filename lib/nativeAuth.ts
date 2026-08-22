'use client';

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { supabase } from './supabase';

export const isNative = () => Capacitor.isNativePlatform();

/** Custom scheme registered in AndroidManifest.xml. Must match the redirect
 *  URI allow-list in both Supabase Auth and the Google Cloud OAuth client. */
export const NATIVE_REDIRECT = 'com.basedly.app://auth';

/**
 * Google blocks OAuth inside embedded webviews, so the native shell cannot use
 * the plain web redirect. Instead: open the consent screen in the system
 * browser, catch the deep link back, and exchange the PKCE code ourselves.
 */
export async function signInWithGoogle(
  /** `prompt: 'select_account'` forces Google's chooser — see lib/accounts.ts. */
  opts: { prompt?: string } = {},
): Promise<{ error?: string }> {
  const redirectTo = isNative() ? NATIVE_REDIRECT : `${window.location.origin}/auth/callback/`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: isNative(),
      ...(opts.prompt ? { queryParams: { prompt: opts.prompt } } : {}),
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
    if (!url.startsWith(NATIVE_REDIRECT)) return;

    // Supabase returns ?code=... for PKCE; errors come back as ?error=...
    const params = new URL(url.replace('com.basedly.app://', 'https://basedly.app/')).searchParams;
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
