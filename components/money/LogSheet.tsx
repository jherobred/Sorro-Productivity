'use client';

import { useState } from 'react';
import { useOverlayBack } from '@/lib/nav';
import { peso } from '@/lib/money';

/**
 * The details, and a way out of giving them.
 *
 * Asking what, when, where and who is how a ledger becomes worth reading back —
 * "₱120" tells you nothing in a month, "₱120, lunch, canteen, with the barkada"
 * tells you everything. But a form is also the reason people stop logging, and
 * an unlogged expense is worth less than an untidy one.
 *
 * So Lazy is a first-class button rather than a cancel. It writes the amount and
 * the jar and closes, and the row shows as incomplete in the feed so it can be
 * finished later. Getting the number down is the part that cannot be
 * reconstructed afterwards; the rest can.
 */

export type LogDetails = {
  name: string;
  where: string;
  who: string;
  when: string;
};

export function LogSheet({
  amount, kind, jar, onClose, onSave,
}: {
  /** Centavos, like everything else `peso()` formats — not pesos. */
  amount: number;
  kind: 'expense' | 'income';
  jar: string | null;
  onClose: () => void;
  /** `null` details means the lazy path — amount and jar only. */
  onSave: (d: LogDetails | null) => void;
}) {
  useOverlayBack(true, onClose);
  const [v, setV] = useState<LogDetails>({
    name: '', where: '', who: '',
    when: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  });
  const set = (k: keyof LogDetails, x: string) => setV((p) => ({ ...p, [k]: x }));

  return (
    <div
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(6,5,11,.74)',
        backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div className="rise" style={{
        width: '100%', maxWidth: 460, maxHeight: '90dvh', overflowY: 'auto',
        background: 'var(--panel)', border: '1px solid var(--line2)', borderBottom: 'none',
        borderRadius: '18px 18px 0 0', padding: '10px 15px calc(16px + env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ width: 34, height: 3.5, borderRadius: 2, background: 'var(--line2)', margin: '0 auto 2px' }} />

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.028em' }}>
            {kind === 'expense' ? 'Log' : 'Add'} {peso(amount)}{jar ? ` to ${jar}` : ''}
          </div>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 700, letterSpacing: '.09em',
            textTransform: 'uppercase', padding: '3px 6px', borderRadius: 5, flex: 'none',
            background: `color-mix(in srgb, ${kind === 'expense' ? '#FF6B6B' : '#34D9A0'} 18%, transparent)`,
            color: kind === 'expense' ? '#FF6B6B' : '#34D9A0',
          }}>{kind}</span>
        </div>

        <button
          onClick={() => { onSave(null); onClose(); }}
          className="k-squish"
          style={{
            width: '100%', minHeight: 42, borderRadius: 10, cursor: 'pointer',
            border: '1px dashed color-mix(in srgb, var(--acc) 55%, transparent)',
            background: 'color-mix(in srgb, var(--acc) 11%, transparent)',
            color: 'var(--accTx)', fontSize: 12.5, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          Lazy log — just the amount
          <small style={{ fontWeight: 600, fontSize: 9, opacity: .8 }}>fill the rest later</small>
        </button>

        <Field label="What"><input value={v.name} autoFocus placeholder="Lunch, load, tricycle"
          onChange={(e) => set('name', e.target.value)} style={INPUT} /></Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="When"><input value={v.when} onChange={(e) => set('when', e.target.value)} style={INPUT} /></Field>
          <Field label="Where"><input value={v.where} placeholder="Canteen, sa tabi ng SM"
            onChange={(e) => set('where', e.target.value)} style={INPUT} /></Field>
        </div>

        <Field label="Who with"><input value={v.who} placeholder="Alone, barkada, family"
          onChange={(e) => set('who', e.target.value)} style={INPUT} /></Field>

        <button
          onClick={() => { onSave(v); onClose(); }}
          className="acc k-squish"
          style={{
            width: '100%', minHeight: 44, borderRadius: 11, background: 'var(--acc)',
            color: 'var(--ink)', fontSize: 13.5, fontWeight: 800, border: 'none', cursor: 'pointer',
          }}
        >
          Save the details
        </button>
      </div>
    </div>
  );
}

const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--bg)', color: 'var(--tx)', border: '1px solid var(--line2)',
  borderRadius: 8, padding: '9px 10px', fontSize: 12.5, minHeight: 38, fontFamily: 'inherit',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 700, letterSpacing: '.12em',
        textTransform: 'uppercase', color: 'var(--tx3)',
      }}>{label}</span>
      {children}
    </label>
  );
}
