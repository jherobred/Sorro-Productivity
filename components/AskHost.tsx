'use client';

import { useEffect, useRef, useState } from 'react';
import { subscribeAsk, resolveAsk, type AskRequest } from '@/lib/ask';
import { useOverlayBack } from '@/lib/nav';

/** Renders whatever `ask()` / `confirmAsk()` is currently waiting on. */
export function AskHost() {
  const [req, setReq] = useState<AskRequest | null>(null);
  const [value, setValue] = useState('');
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => subscribeAsk(setReq), []);
  useEffect(() => {
    if (!req) return;
    setValue(req.initial ?? '');
    // Focus after paint, and select so typing replaces the suggested value.
    requestAnimationFrame(() => { field.current?.focus(); field.current?.select(); });
  }, [req?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  useOverlayBack(!!req, () => resolveAsk(null));

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') resolveAsk(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);

  if (!req) return null;

  const submit = () => {
    if (req.kind === 'prompt' && !value.trim()) return;
    resolveAsk(req.kind === 'prompt' ? value.trim() : 'yes');
  };

  return (
    <div
      onClick={() => resolveAsk(null)}
      style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={req.title}
        className="k-bloom"
        style={{
          width: 380, maxWidth: '100%', padding: 20, borderRadius: 16,
          background: 'var(--card)', border: '1px solid var(--line2)', boxShadow: 'var(--shl)',
        }}>
        <h2 style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-.02em' }}>{req.title}</h2>
        {req.message && (
          <p style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.6, marginTop: 6 }}>{req.message}</p>
        )}

        {req.kind === 'prompt' && (
          <input
            ref={field}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            placeholder={req.placeholder}
            aria-label={req.title}
            style={{
              width: '100%', minHeight: 44, padding: '11px 13px', borderRadius: 10, marginTop: 14,
              border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 13.5,
            }} />
        )}

        <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
          <button onClick={() => resolveAsk(null)} className="hov k-squish"
            style={{ flex: 1, minHeight: 44, borderRadius: 12, border: '1px solid var(--line2)', fontSize: 13, fontWeight: 700, color: 'var(--tx2)' }}>
            Cancel
          </button>
          <button onClick={submit} className="k-squish"
            disabled={req.kind === 'prompt' && !value.trim()}
            style={{
              flex: 1, minHeight: 44, borderRadius: 12, fontSize: 13, fontWeight: 800,
              background: req.danger ? 'var(--pal-coral)' : 'var(--acc)',
              color: req.danger ? '#fff' : 'var(--ink)',
              opacity: req.kind === 'prompt' && !value.trim() ? 0.45 : 1,
            }}>
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
