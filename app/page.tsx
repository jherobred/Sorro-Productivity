'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { signInWithGoogle, listenForNativeAuth } from '@/lib/nativeAuth';
import { BasedlyLogo } from '@/components/BasedlyLogo';


export default function SignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/home/');
    });
    // Native shell: the OAuth round-trip comes back as a deep link, not a redirect.
    return listenForNativeAuth(() => router.replace('/auth/callback/'));
  }, [router]);

  async function signIn() {
    setBusy(true);
    setErr(null);
    const { error } = await signInWithGoogle();
    if (error) {
      setErr(error);
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        height: '100dvh',
        background: 'var(--bg)',
        color: 'var(--tx)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient aurora blob — 34s loop, frozen by the motion setting. */}
      <div
        className="aur"
        aria-hidden
        style={{
          position: 'absolute',
          width: 620,
          height: 620,
          borderRadius: '50%',
          filter: 'blur(90px)',
          opacity: 0.4,
          background:
            'radial-gradient(circle at 30% 30%, var(--acc) 0%, transparent 62%), radial-gradient(circle at 70% 70%, var(--pal-cyan) 0%, transparent 58%)',
          pointerEvents: 'none',
        }}
      />

      <div className="rise" style={{ width: '100%', maxWidth: 380, zIndex: 1 }}>
        <BasedlyLogo size={28} style={{ marginBottom: 30 }} />

        <h1
          style={{
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: '-.03em',
            lineHeight: 1.12,
            textWrap: 'pretty',
            marginBottom: 30,
          }}
        >
          Your whole week, one surface.
        </h1>

        <button
          onClick={signIn}
          disabled={busy}
          className="acc"
          style={{
            width: '100%',
            minHeight: 44,
            padding: '13px 16px',
            borderRadius: 14,
            background: 'var(--acc)',
            color: 'var(--accent-ink)',
            fontSize: 13.5,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            opacity: busy ? 0.6 : 1,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
            <path fill="currentColor" d="M44.5 20H24v8.5h11.8C34.7 33.4 30.1 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.2-2.7-.5-4z" />
          </svg>
          Continue with Google
        </button>

        <p
          style={{
            marginTop: 14,
            fontSize: 11.5,
            lineHeight: 1.6,
            color: 'var(--tx3)',
            textWrap: 'pretty',
          }}
        >
          Google is the only way in. There are no password fields anywhere in Basedly.
        </p>

        {err && (
          <p className="fade" style={{ marginTop: 12, fontSize: 11.5, color: 'var(--pal-coral)' }}>
            {err}
          </p>
        )}
      </div>
    </main>
  );
}
