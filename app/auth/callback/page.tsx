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

      const userId = data.session.user.id;
      const { data: profile } = await supabase
        .from('bd_profiles')
        .select('onboarded_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled) return;
      router.replace(profile?.onboarded_at ? '/home/' : '/onboarding/');
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
        <div className="glowring" style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--acc)' }} />
      )}
    </main>
  );
}
