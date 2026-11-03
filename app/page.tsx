'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { signInWithGoogle, listenForNativeAuth } from '@/lib/nativeAuth';
import { Wordmark } from '@/components/Wordmark';
import '@/components/shell.css';


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
    <main className="sx-signin">
      <div>
        <Wordmark size="lg" />
        <p>Notes, calendar and tasks with an assistant.</p>
        <button className="sx-pill" onClick={signIn} disabled={busy}>
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
            <path fill="currentColor" d="M44.5 20H24v8.5h11.8C34.7 33.4 30.1 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.2-2.7-.5-4z" />
          </svg>
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>
        {err && <p role="alert" className="sx-signin-err">{err}</p>}
      </div>
    </main>
  );
}
