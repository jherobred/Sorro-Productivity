'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { useLayout } from '@/lib/useLayout';
import { uploadTo } from '@/lib/uploads';
import { readMeal, type MealRead } from '@/lib/vision';
import { ymd } from '@/lib/series';
import type { Meal } from '@/lib/body';

/**
 * A meal, added by photograph or by hand.
 *
 * The photograph goes through the same door as the timetable scanner and obeys
 * the same rule: the model reads, **you** confirm. What comes back lands in
 * editable fields with its own confidence next to them, and nothing is saved
 * until the button is pressed. A calorie count you accepted is yours; one the
 * app slipped in behind you is mine, and you would never trust the total again.
 *
 * The picture is kept alongside the numbers, because in three weeks "chicken
 * rice, 620" means nothing and the photograph means everything.
 */

const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;

export function MealSheet({
  on, slot: initialSlot, onClose, onSave,
}: {
  on: string;
  slot?: string;
  onClose: () => void;
  onSave: (m: Meal) => void;
}) {
  const { phone } = useLayout();
  useOverlayBack(true, onClose);

  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [read, setRead] = useState<MealRead | null>(null);
  const [slot, setSlot] = useState<string>(initialSlot ?? guessSlot());
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  const scan = async (f: File) => {
    setBusy(true);
    setFile(f);
    try {
      const { preview: p, result } = await readMeal(f);
      setPreview(p);
      setRead(result);
      setName(result.name || '');
      setKcal(String(Math.round(result.kcal || 0)));
      setProtein(String(Math.round(result.protein || 0)));
      setCarbs(String(Math.round(result.carbs || 0)));
      setFat(String(Math.round(result.fat || 0)));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that');
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!name.trim() && !kcal) return;
    setBusy(true);
    try {
      // The photo is uploaded only once you keep the meal — a scan you
      // abandoned should not leave a file in the bucket.
      const photo_path = file ? await uploadTo('bd-feed', file) : null;
      onSave({
        id: crypto.randomUUID(), on_date: on, name: name.trim() || 'Meal', slot,
        kcal: num(kcal), protein: num(protein), carbs: num(carbs), fat: num(fat), photo_path,
      });
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save it');
    } finally { setBusy(false); }
  };

  const unsure = read != null && read.confidence < 0.6;

  const body = (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: phone ? 'flex-end' : 'center', justifyContent: 'center', padding: phone ? 0 : 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add a meal"
        className="k-bloom navsb" style={{
          width: 460, maxWidth: '100%', maxHeight: phone ? '92dvh' : '86dvh', overflowY: 'auto',
          background: 'var(--card)', border: '1px solid var(--line2)',
          borderRadius: phone ? '18px 18px 0 0' : 18, padding: 16, boxShadow: 'var(--shl)',
        }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Icon name="food" size={16} color="var(--accTx)" />
          <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>Add a meal</h2>
          {read && (
            <span style={{ fontSize: 10, fontWeight: 700, color: unsure ? 'var(--pal-amber)' : 'var(--tx3)' }}>
              {Math.round(read.confidence * 100)}% sure
            </span>
          )}
          <button onClick={onClose} className="hov k-squish" aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        {preview ? (
          <img src={preview} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 13, marginBottom: 12 }} />
        ) : (
          <label style={{
            display: 'grid', placeItems: 'center', gap: 7, padding: '26px 16px', marginBottom: 12,
            border: '1.5px dashed var(--line2)', borderRadius: 14, cursor: 'pointer', textAlign: 'center',
            opacity: busy ? 0.5 : 1,
          }}>
            <Icon name="photo" size={20} color="var(--tx3)" />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)' }}>
              {busy ? 'Reading it…' : 'Photograph the plate'}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
              It estimates the numbers; you check them before anything is saved.
            </span>
            <input type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void scan(f); e.target.value = ''; }} />
          </label>
        )}

        {read?.notes && (
          <p style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.6, margin: '0 0 12px' }}>{read.notes}</p>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {SLOTS.map((sl) => (
            <button key={sl} onClick={() => setSlot(sl)} aria-pressed={slot === sl} className="k-chip"
              style={{
                padding: '6px 13px', borderRadius: 999, minHeight: 32, fontSize: 11, fontWeight: 700,
                border: `1px solid ${slot === sl ? 'var(--acc)' : 'var(--line2)'}`,
                background: slot === sl ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent',
                color: slot === sl ? 'var(--accTx)' : 'var(--tx2)',
              }}>
              {sl}
            </button>
          ))}
        </div>

        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="What was it?" aria-label="Meal"
          style={{ ...INPUT, marginBottom: 10, fontSize: 14, fontWeight: 700 }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
          <Num label="kcal" value={kcal} onChange={setKcal} />
          <Num label="protein" value={protein} onChange={setProtein} />
          <Num label="carbs" value={carbs} onChange={setCarbs} />
          <Num label="fat" value={fat} onChange={setFat} />
        </div>

        {read?.items && read.items.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 6 }}>
              What it saw
            </div>
            {read.items.map((it, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11.5, color: 'var(--tx2)', padding: '3px 0' }}>
                <span style={{ flex: 1 }}>{it.name}{it.portion ? ` · ${it.portion}` : ''}</span>
                <span style={{ color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(it.kcal)} kcal</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 9 }}>
          <button onClick={onClose} className="hov k-squish"
            style={{ flex: 1, minHeight: 42, borderRadius: 12, border: '1px solid var(--line2)', fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)' }}>
            Cancel
          </button>
          <button onClick={() => void save()} disabled={busy || (!name.trim() && !kcal)} className="k-squish"
            style={{
              flex: 1, minHeight: 42, borderRadius: 12, background: 'var(--acc)', color: 'var(--ink)',
              fontSize: 12.5, fontWeight: 800, opacity: busy || (!name.trim() && !kcal) ? 0.45 : 1,
            }}>
            {busy ? 'Saving…' : 'Add it'}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}

function Num({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 4 }}>
        {label}
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
        inputMode="numeric" aria-label={label}
        style={{ ...INPUT, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }} />
    </label>
  );
}

const INPUT: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '9px 11px', borderRadius: 10,
  border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 12.5,
};

const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

/** Whatever meal it probably is, so the chip is usually already right. */
function guessSlot(): string {
  const h = new Date().getHours();
  if (h < 10) return 'Breakfast';
  if (h < 15) return 'Lunch';
  if (h < 21) return 'Dinner';
  return 'Snack';
}

export { ymd };
