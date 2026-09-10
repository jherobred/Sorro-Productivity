'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useOverlayBack } from '@/lib/nav';

/**
 * The colour wheel behind every "Colour" row.
 *
 * Six named presets were the whole palette, which is fine until you want the
 * green in your header photo. Hue is the angle, saturation the distance from
 * the middle, and lightness and alpha are their own tracks underneath — the
 * three things a wheel alone cannot say.
 *
 * Values come out as #RRGGBB, or #RRGGBBAA when alpha is not full. Both are
 * plain CSS strings, so the `color` column and every color-mix() reading it
 * keep working untouched.
 */

const PRESETS = ['#B07CFF', '#7C6CFF', '#38D6F2', '#34D9A0', '#FFC24B', '#FF6B6B'];
const SIZE = 176;

type HSL = { h: number; s: number; l: number };

function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
    a: full.length >= 8 ? (parseInt(full.slice(6, 8), 16) || 0) / 255 : 1,
  };
}

function rgbToHsl(r: number, g: number, b: number): HSL {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0))
    : max === G ? (B - R) / d + 2
      : (R - G) / d + 4;
  return { h: h * 60, s, l };
}

function hslToHex({ h, s, l }: HSL, a: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(((h % 360) + 360) % 360 / 60);
  const [r1, g1, b1] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg] ?? [0, 0, 0];
  const hx = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  const base = `#${hx(r1)}${hx(g1)}${hx(b1)}`;
  return a >= 1 ? base : `${base}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
}

const CHECKER = 'repeating-conic-gradient(rgba(128,128,128,.28) 0% 25%, transparent 0% 50%) 50%/10px 10px';

export function ColorPicker({
  value, x, y, onChange, onClose,
}: {
  value: string;
  x: number;
  y: number;
  /** Fires live as the wheel moves, so the card recolours under the picker. */
  onChange: (color: string) => void;
  onClose: () => void;
}) {
  const start = hexToRgba(value || '#B07CFF');
  const [hsl, setHsl] = useState<HSL>(() => rgbToHsl(start.r, start.g, start.b));
  const [alpha, setAlpha] = useState(start.a);
  const [text, setText] = useState(value);
  const wheel = useRef<HTMLDivElement>(null);

  useOverlayBack(true, onClose);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const emit = (next: HSL, a: number) => {
    const hex = hslToHex(next, a);
    setText(hex);
    onChange(hex);
  };

  /** Wheel geometry: angle is hue, distance from centre is saturation. */
  const fromPointer = (e: React.PointerEvent) => {
    const r = wheel.current?.getBoundingClientRect();
    if (!r) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.min(Math.hypot(dx, dy), r.width / 2);
    const h = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    const next = { ...hsl, h: (h + 360) % 360, s: dist / (r.width / 2) };
    setHsl(next);
    emit(next, alpha);
  };

  const current = hslToHex(hsl, alpha);
  const knobX = SIZE / 2 + Math.cos(((hsl.h - 90) * Math.PI) / 180) * (hsl.s * SIZE) / 2;
  const knobY = SIZE / 2 + Math.sin(((hsl.h - 90) * Math.PI) / 180) * (hsl.s * SIZE) / 2;

  if (typeof document === 'undefined') return null;
  const left = Math.max(10, Math.min(x, window.innerWidth - 250));
  const top = Math.max(10, Math.min(y, window.innerHeight - 420));

  const track: React.CSSProperties = {
    width: '100%', height: 14, appearance: 'none', WebkitAppearance: 'none',
    border: '1px solid var(--line2)', cursor: 'pointer', background: 'transparent',
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 300 }} onClick={onClose}>
      <div
        role="dialog" aria-label="Choose a colour"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left, top, width: 224, padding: 14,
          display: 'flex', flexDirection: 'column', gap: 12,
          background: 'var(--card)', border: '1px solid var(--line2)', boxShadow: 'var(--shl)',
        }}
      >
        <div
          ref={wheel}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); }}
          onPointerMove={(e) => { if (e.buttons === 1) fromPointer(e); }}
          style={{
            position: 'relative', width: SIZE, height: SIZE, alignSelf: 'center', borderRadius: '50%',
            cursor: 'crosshair', touchAction: 'none',
            background:
              `radial-gradient(circle at 50% 50%, #fff 0%, transparent 70%),`
              + ` conic-gradient(from 90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)`,
            filter: `brightness(${0.35 + hsl.l * 1.3})`,
          }}
        >
          <span aria-hidden style={{
            position: 'absolute', left: knobX - 7, top: knobY - 7, width: 14, height: 14,
            borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.5)',
          }} />
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx3)' }}>Lightness</span>
          <input
            type="range" min={0} max={100} value={Math.round(hsl.l * 100)} aria-label="Lightness"
            onChange={(e) => { const next = { ...hsl, l: +e.target.value / 100 }; setHsl(next); emit(next, alpha); }}
            style={{ ...track, background: `linear-gradient(to right, #000, ${hslToHex({ ...hsl, l: 0.5 }, 1)}, #fff)` }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx3)' }}>Opacity</span>
          <input
            type="range" min={0} max={100} value={Math.round(alpha * 100)} aria-label="Opacity"
            onChange={(e) => { const a = +e.target.value / 100; setAlpha(a); emit(hsl, a); }}
            style={{
              ...track,
              background: `linear-gradient(to right, transparent, ${hslToHex(hsl, 1)}), ${CHECKER}`,
            }}
          />
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden style={{
            flex: 'none', width: 30, height: 30, border: '1px solid var(--line2)',
            background: `linear-gradient(${current}, ${current}), ${CHECKER}`,
          }} />
          <input
            value={text}
            aria-label="Colour value"
            spellCheck={false}
            onChange={(e) => {
              const v = e.target.value.trim();
              setText(v);
              if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) {
                const p = hexToRgba(v);
                setHsl(rgbToHsl(p.r, p.g, p.b));
                setAlpha(p.a);
                onChange(v);
              }
            }}
            style={{
              flex: 1, minWidth: 0, height: 30, padding: '0 8px',
              border: '1px solid var(--line2)', background: 'var(--bg)',
              fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--tx)',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {PRESETS.map((c) => (
            <button
              key={c} onClick={() => { const p = hexToRgba(c); setHsl(rgbToHsl(p.r, p.g, p.b)); setAlpha(1); setText(c); onChange(c); }}
              aria-label={`Use ${c}`} title={c}
              style={{ flex: 1, height: 20, background: c, border: '1px solid var(--line2)', cursor: 'pointer' }}
            />
          ))}
        </div>

        <button onClick={onClose} className="tap acc k-glass" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 34,
          background: 'var(--acc)', color: 'var(--accInk)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
        }}>
          <Icon name="check" size={13} color="var(--accInk)" />Done
        </button>
      </div>
    </div>,
    document.body,
  );
}
