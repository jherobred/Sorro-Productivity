'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import type { Meal } from '@/lib/body';

/**
 * One sheet for add, edit and remove.
 *
 * Three separate flows would be three screens to learn for what is the same
 * act — putting a plate on the record. The photograph sits at the top with the
 * four things you can do to it directly underneath, where the thing they act on
 * is.
 *
 * `place` is free text on purpose. "Sa tabi ng SM" is a real answer and no
 * dropdown will ever contain it; a picker here would force people to lie or to
 * skip the field, and a skipped field is worse than an untidy one.
 */

const SLOTS = ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Side'];

export function MealEditor({
  meal, on, onClose, onSave, onDelete,
}: {
  /** Null for a new one. */
  meal: Meal | null;
  on: string;
  onClose: () => void;
  onSave: (m: Meal) => void;
  onDelete?: () => void;
}) {
  useOverlayBack(true, onClose);
  const [v, setV] = useState<Meal>(() => meal ?? {
    id: crypto.randomUUID(), on_date: on, name: '', slot: 'Snack',
    kcal: 0, protein: 0, carbs: 0, fat: 0, photo_path: null, place: null,
  });

  const set = <K extends keyof Meal>(k: K, x: Meal[K]) => setV((p) => ({ ...p, [k]: x }));
  const num = (s: string) => Math.max(0, Math.round(Number(s.replace(/[^\d.]/g, '')) || 0));

  return (
    <div
      className="sheet-scrim"
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
        <div style={{ width: 34, height: 3.5, borderRadius: 2, background: 'var(--line2)', margin: '0 auto 4px' }} />

        <div style={{
          position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 12,
          overflow: 'hidden', background: 'var(--card2)', display: 'grid', placeItems: 'center',
        }}>
          {v.photo_path
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={v.photo_path} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Icon name="photo" size={26} color="var(--tx3)" />}
          <span style={{
            position: 'absolute', left: 8, bottom: 8, fontFamily: 'var(--font-mono)', fontSize: 8.5,
            fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', padding: '4px 7px',
            borderRadius: 5, background: 'rgba(11,10,19,.8)', border: '1px solid var(--line2)',
          }}>{v.slot}</span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Mini onClick={() => {}}>Retake</Mini>
          <Mini onClick={() => {}}>Crop</Mini>
          <Mini onClick={() => {}}>Adjust</Mini>
          {onDelete && (
            <Mini danger onClick={() => { onDelete(); onClose(); }} style={{ marginLeft: 'auto' }}>
              Remove
            </Mini>
          )}
        </div>

        <Field label="What">
          <input value={v.name} autoFocus={!meal} placeholder="Silog, sinigang, isaw"
            onChange={(e) => set('name', e.target.value)} style={INPUT} />
        </Field>

        <div style={PAIR}>
          <Field label="Calories">
            <input value={v.kcal || ''} inputMode="numeric" placeholder="520"
              onChange={(e) => set('kcal', num(e.target.value))} style={INPUT} />
          </Field>
          <Field label="Meal">
            <select value={v.slot} onChange={(e) => set('slot', e.target.value)} style={INPUT}>
              {SLOTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Place — where you bought or ate this">
          <input value={v.place ?? ''} placeholder="Canteen, home, sa tabi ng SM"
            onChange={(e) => set('place', e.target.value || null)} style={INPUT} />
        </Field>

        <div style={PAIR}>
          <Field label="Protein"><input value={v.protein || ''} inputMode="numeric"
            onChange={(e) => set('protein', num(e.target.value))} style={INPUT} /></Field>
          <Field label="Carbs"><input value={v.carbs || ''} inputMode="numeric"
            onChange={(e) => set('carbs', num(e.target.value))} style={INPUT} /></Field>
        </div>

        <button
          onClick={() => { onSave({ ...v, name: v.name.trim() || 'Meal' }); onClose(); }}
          className="acc k-squish"
          style={{
            width: '100%', minHeight: 44, borderRadius: 11, background: 'var(--acc)',
            color: 'var(--ink)', fontSize: 13.5, fontWeight: 800, border: 'none', cursor: 'pointer',
          }}
        >
          {meal ? 'Save changes' : 'Add this meal'}
        </button>
      </div>
    </div>
  );
}

const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--bg)', color: 'var(--tx)', border: '1px solid var(--line2)',
  borderRadius: 8, padding: '9px 10px', fontSize: 12.5, minHeight: 38, fontFamily: 'inherit',
};

const PAIR: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };

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

function Mini({
  children, onClick, danger, style,
}: { children: React.ReactNode; onClick: () => void; danger?: boolean; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} className="hov" style={{
      border: `1px solid ${danger ? 'rgba(255,107,107,.4)' : 'var(--line2)'}`,
      background: 'var(--card2)', color: danger ? '#FF9B9B' : 'var(--tx2)', borderRadius: 6,
      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '.05em',
      padding: '6px 8px', cursor: 'pointer', textTransform: 'uppercase', ...style,
    }}>{children}</button>
  );
}
