'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';



/**
 * OAuth landing. detectSessionInUrl exchanges the PKCE code automatically, so
 * this page only has to wait for the session and decide where to send the user:
 * onboarding runs once (bd_profiles.onboarded_at), then Home.
 */
export default function AuthCallback() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;

      if (error || !data.session) {
        setErr(error?.message ?? 'Sign-in did not complete.');
        return;
      }

      let back: string | null = null;
      try {
        back = sessionStorage.getItem('sorro-after-auth');
        sessionStorage.removeItem('sorro-after-auth');
      } catch { /* private mode */ }

      // Only same-origin app paths, so a stored value can never become an
      // open redirect: it must start with a single slash.
      router.replace(back && /^\/[^/]/.test(back) ? back : '/home/');
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main
      style={{
        height: '100dvh',
        background: 'var(--bg)',
        color: 'var(--tx2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13.5,
      }}
    >
      {err ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ color: 'var(--pal-coral)', marginBottom: 12 }}>{err}</p>
          <button onClick={() => router.replace('/')} style={{ color: 'var(--accTx)', fontWeight: 700 }}>
            Back to sign in
          </button>
        </div>
      ) : (
        <span role="status">Opening your workspace…</span>
      )}
    </main>
  );
}
