'use client';

import { useState } from 'react';
import { Icon } from './Icon';
import { peso } from '@/lib/money';

/**
 * The add/edit affordances shared by the Money tabs.
 *
 * Budgets, goals, subscriptions and the to-buy list all edit the same shape —
 * a name, an amount, sometimes a date — so they share one inline row rather
 * than four near-identical dialogs. Inline because these are small numbers you
 * adjust in passing; a modal for changing a budget from 6,000 to 6,500 is more
 * ceremony than the edit deserves.
 */

export type FieldSpec = { key: string; label: string; kind: 'text' | 'money' | 'date'; placeholder?: string };

export function InlineForm({
  fields, initial, submitLabel, onSubmit, onCancel,
}: {
  fields: FieldSpec[];
  initial?: Record<string, string>;
  submitLabel: string;
  onSubmit: (v: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<Record<string, string>>(() => ({ ...initial }));
  const complete = fields.every((f) => (v[f.key] ?? '').trim());

  return (
    <div className="k-bloom" style={{
      display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end',
      padding: '12px 13px', borderRadius: 12, background: 'var(--card2)',
      border: '1px solid var(--line2)', marginBottom: 10,
    }}>
      {fields.map((f) => (
        <label key={f.key} style={{ flex: f.kind === 'text' ? '2 1 150px' : '1 1 110px', minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 4 }}>
            {f.label}
          </span>
          <input
            type={f.kind === 'date' ? 'date' : f.kind === 'money' ? 'number' : 'text'}
            inputMode={f.kind === 'money' ? 'decimal' : undefined}
            value={v[f.key] ?? ''}
            onChange={(e) => setV((s) => ({ ...s, [f.key]: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter' && complete) onSubmit(v); if (e.key === 'Escape') onCancel(); }}
            placeholder={f.placeholder}
            style={{
              width: '100%', minHeight: 40, padding: '9px 11px', borderRadius: 9,
              border: '1px solid var(--line2)', background: 'var(--card)', fontSize: 12.5,
            }} />
        </label>
      ))}
      <button onClick={() => complete && onSubmit(v)} disabled={!complete} className="k-squish"
        style={{ minHeight: 40, padding: '0 15px', borderRadius: 9, background: 'var(--acc)', color: 'var(--ink)', fontSize: 12, fontWeight: 800, opacity: complete ? 1 : 0.45 }}>
        {submitLabel}
      </button>
      <button onClick={onCancel} className="hov k-squish"
        style={{ minHeight: 40, padding: '0 13px', borderRadius: 9, border: '1px solid var(--line2)', fontSize: 12, fontWeight: 700, color: 'var(--tx2)' }}>
        Cancel
      </button>
    </div>
  );
}

/** "+ Add a budget" — the row that opens the form. */
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="hov k-squish"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44,
        padding: '10px 12px', borderRadius: 11, border: '1.5px dashed var(--line2)',
        fontSize: 12, fontWeight: 700, color: 'var(--tx2)', marginTop: 10,
      }}>
      <Icon name="plus" size={14} color="var(--tx3)" />{label}
    </button>
  );
}

/** Edit and delete, shown on hover on a pointer device and always on touch. */
export function RowActions({ onEdit, onDelete, label }: { onEdit: () => void; onDelete: () => void; label: string }) {
  return (
    <span className="bh" style={{ display: 'flex', gap: 2, flex: 'none' }}>
      <button onClick={onEdit} className="hov k-squish" aria-label={`Edit ${label}`} title="Edit"
        style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center' }}>
        <Icon name="edit" size={13} color="var(--tx3)" />
      </button>
      <button onClick={onDelete} className="hov k-squish" aria-label={`Delete ${label}`} title="Delete"
        style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center' }}>
        <Icon name="trash" size={13} color="var(--tx3)" />
      </button>
    </span>
  );
}

/** Pesos in, centavos out — every amount is stored as an integer. */
export const toCentavos = (s: string) => Math.round(parseFloat(s || '0') * 100);
export const fromCentavos = (c: number) => String((c ?? 0) / 100);

export { peso };
