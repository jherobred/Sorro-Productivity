'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { useLayout } from '@/lib/useLayout';
import { uploadTo } from '@/lib/uploads';
import { readReceipt, type ReceiptRead } from '@/lib/vision';
import { colourOf } from './Instruments';

/**
 * Adding a transaction, in two seconds at a counter.
 *
 * A form with a keyboard is the wrong instrument for "I just spent forty
 * pesos". This is a number pad and six big buttons — the same shape as every
 * card machine on earth, which is exactly where you are standing when you use
 * it.
 *
 * The camera is the other half. A receipt through `photo-read` comes back with
 * the merchant, the total and the date already in the fields, and the same rule
 * holds as everywhere else: it fills them in, you press the button. A total the
 * app entered by itself is a total you would have to audit later.
 */

export const CATEGORIES = ['Food', 'Transport', 'School', 'Bills', 'Fun', 'Health'] as const;

export type Draft = {
  name: string;
  amount_centavos: number;
  category: string;
  occurred_at: string;
  receipt_path: string | null;
};

export function QuickAdd({ onClose, onAdd }: { onClose: () => void; onAdd: (d: Draft) => void }) {
  const { phone } = useLayout();
  useOverlayBack(true, onClose);

  const [digits, setDigits] = useState('');
  const [category, setCategory] = useState<string>('Food');
  const [name, setName] = useState('');
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [read, setRead] = useState<ReceiptRead | null>(null);

  const centavos = Math.round(Number(digits || '0') * 100);
  const shown = digits === '' ? '0' : digits;

  const press = (k: string) => {
    if (k === '<') { setDigits((d) => d.slice(0, -1)); return; }
    if (k === '.' && digits.includes('.')) return;
    // Two decimals is as fine-grained as money gets, and a long number here is
    // nearly always a mis-tap.
    if (/\.\d\d$/.test(digits) && k !== '<') return;
    if (digits.replace('.', '').length >= 8) return;
    setDigits((d) => (d === '0' && k !== '.' ? k : d + k));
  };

  const scan = async (f: File) => {
    setBusy(true);
    setFile(f);
    try {
      const { result } = await readReceipt(f);
      setRead(result);
      if (result.total > 0) setDigits(String(Math.round(result.total * 100) / 100));
      if (result.merchant) setName(result.merchant);
      if (result.category) setCategory(result.category);
      if (result.date && /^\d{4}-\d{2}-\d{2}$/.test(result.date)) setWhen(result.date);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that');
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (centavos <= 0) return;
    setBusy(true);
    try {
      const receipt_path = file ? await uploadTo('bd-files', file) : null;
      onAdd({
        name: name.trim() || category,
        amount_centavos: centavos,
        category,
        occurred_at: new Date(`${when}T12:00:00`).toISOString(),
        receipt_path,
      });
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save it');
    } finally { setBusy(false); }
  };

  const unsure = read != null && read.confidence < 0.7;

  const body = (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: phone ? 'flex-end' : 'center', justifyContent: 'center', padding: phone ? 0 : 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add a transaction"
        className="k-bloom navsb" style={{
          width: 400, maxWidth: '100%', maxHeight: phone ? '94dvh' : '90dvh', overflowY: 'auto',
          background: 'var(--card)', border: '1px solid var(--line2)',
          borderRadius: phone ? '18px 18px 0 0' : 18, padding: 16, boxShadow: 'var(--shl)',
        }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>Spent</h2>
          <label className="hov k-squish" title="Photograph the receipt"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 10,
              border: '1px solid var(--line2)', fontSize: 11, fontWeight: 700, color: 'var(--tx2)',
              cursor: 'pointer', opacity: busy ? 0.5 : 1,
            }}>
            <Icon name="photo" size={13} color="var(--tx3)" />{busy ? 'Reading…' : 'Receipt'}
            <input type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void scan(f); e.target.value = ''; }} />
          </label>
          <button onClick={onClose} className="hov k-squish" aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4,
          padding: '10px 0 14px',
        }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx3)' }}>₱</span>
          <span style={{
            fontSize: 46, fontWeight: 800, letterSpacing: '-.04em', fontVariantNumeric: 'tabular-nums',
            color: centavos > 0 ? 'var(--tx)' : 'var(--tx3)',
          }}>
            {shown}
          </span>
        </div>

        {read && (
          <p style={{
            fontSize: 11, lineHeight: 1.6, textAlign: 'center', margin: '0 0 12px',
            color: unsure ? 'var(--pal-amber)' : 'var(--tx3)',
          }}>
            {read.merchant ? `Read “${read.merchant}”` : 'Read the receipt'} · {Math.round(read.confidence * 100)}% sure
            {unsure && ' — worth checking the total'}
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginBottom: 12 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '<'].map((k) => (
            <button key={k} onClick={() => press(k)} className="hov k-squish" aria-label={k === '<' ? 'Delete' : k}
              style={{
                minHeight: 48, borderRadius: 12, border: '1px solid var(--line2)', background: 'var(--card2)',
                fontSize: 19, fontWeight: 700, color: 'var(--tx)', display: 'grid', placeItems: 'center',
              }}>
              {k === '<' ? <Icon name="back" size={16} color="var(--tx2)" /> : k}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginBottom: 12 }}>
          {CATEGORIES.map((c) => {
            const on = category === c;
            return (
              <button key={c} onClick={() => setCategory(c)} aria-pressed={on}
                style={{
                  minHeight: 42, borderRadius: 11, fontSize: 11.5, fontWeight: 700,
                  border: `1px solid ${on ? colourOf(c) : 'var(--line2)'}`,
                  background: on ? `color-mix(in srgb, ${colourOf(c)} 18%, transparent)` : 'transparent',
                  color: on ? 'var(--tx)' : 'var(--tx2)',
                }}>
                {c}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="What for? (optional)"
            aria-label="What for"
            style={{
              flex: 1, minWidth: 0, minHeight: 40, padding: '9px 11px', borderRadius: 10,
              border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 12.5,
            }} />
          <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="When"
            style={{
              flex: 'none', width: 140, minHeight: 40, padding: '9px 11px', borderRadius: 10,
              border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 11.5,
            }} />
        </div>

        <button onClick={() => void save()} disabled={centavos <= 0 || busy} className="k-squish"
          style={{
            width: '100%', minHeight: 46, borderRadius: 13, background: 'var(--acc)', color: 'var(--ink)',
            fontSize: 13.5, fontWeight: 800, opacity: centavos > 0 && !busy ? 1 : 0.45,
          }}>
          {busy ? 'Saving…' : centavos > 0 ? `Add ₱${shown}` : 'Add'}
        </button>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}
