'use client';

import { useEffect, useState } from 'react';

/**
 * What a client-side exception looks like instead of a white page.
 *
 * Production was showing Next's default: "Application error: a client-side
 * exception has occurred while loading <host> (see the browser console for
 * more information)". That sentence is the same for a null dereference, a
 * corrupt cache and a bad deploy, it takes the whole app down with it, and it
 * asks the person least able to open a console to go and open one. A crash
 * that cannot be described cannot be reported, and a bug nobody can report is
 * one nobody fixes.
 *
 * So: the real message, the digest the boundary was given, and the top of the
 * stack — plus the two recoveries that actually work.
 *
 * **Clear saved data is the one that matters.** The whole TanStack cache is
 * persisted to localStorage under `basedly-cache` with `maxAge: Infinity`, so
 * a row cached in a shape an older build wrote survives every reload and every
 * deploy. That failure is sticky, it is per-device, and it looks exactly like
 * "this page is broken for me and nobody else". Nothing here is the source of
 * truth — Supabase is — so throwing the cache away costs a refetch.
 */
export function Crashed({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const [copied, setCopied] = useState(false);

  // The console still gets it, in full, for anyone who does open one.
  useEffect(() => { console.error('[basedly] render crash', error); }, [error]);

  const detail = [
    error.message || 'No message',
    error.digest ? `digest ${error.digest}` : '',
    (error.stack ?? '').split('\n').slice(1, 4).join('\n'),
  ].filter(Boolean).join('\n');

  const wipe = () => {
    try {
      localStorage.removeItem('basedly-cache');
    } catch { /* private mode, nothing to clear */ }
    location.reload();
  };

  return (
    <div style={{
      minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24,
      background: 'var(--bg, #0B0A12)', color: 'var(--tx, #EDEBF6)',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    }}>
      <div style={{
        width: 'min(520px, 100%)', display: 'grid', gap: 14, padding: '22px 20px',
        borderRadius: 16, background: 'var(--card, #15131F)', border: '1px solid var(--line2, #2A2739)',
      }}>
        <div style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase',
          color: 'var(--tx3, #8B87A3)',
        }}>
          Something broke
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', margin: 0 }}>
          This screen crashed while drawing.
        </h1>

        <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--tx2, #B8B4CC)', margin: 0 }}>
          Your data is safe — nothing here is stored on this device except a cache of what you
          have already seen. Try again first; if it keeps happening, clear that cache.
        </p>

        <pre style={{
          margin: 0, padding: '11px 12px', borderRadius: 11, overflowX: 'auto',
          background: 'var(--card2, #1C1929)', border: '1px solid var(--line, #241F33)',
          fontSize: 11, lineHeight: 1.6, color: 'var(--tx2, #B8B4CC)', whiteSpace: 'pre-wrap',
        }}>
          {detail}
        </pre>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => (reset ? reset() : location.reload())}
            style={{ ...BTN, background: 'var(--acc, #7C6CFF)', color: '#0A0912', border: 0 }}>
            Try again
          </button>
          <button onClick={wipe} style={BTN}>Clear saved data and reload</button>
          <button
            onClick={() => { void navigator.clipboard?.writeText(detail).then(() => setCopied(true)); }}
            style={BTN}>
            {copied ? 'Copied' : 'Copy details'}
          </button>
        </div>
      </div>
    </div>
  );
}

const BTN: React.CSSProperties = {
  minHeight: 38, padding: '9px 14px', borderRadius: 11, cursor: 'pointer',
  border: '1px solid var(--line2, #2A2739)', background: 'transparent',
  color: 'inherit', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
};
