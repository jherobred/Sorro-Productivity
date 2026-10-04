'use client';
import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';

/**
 * Google Calendar's event colours first, then the rest of its calendar
 * palette. A colour is only a colour: nothing reads a meaning off it.
 */
export const EVENT_COLORS = [
  ['Tomato', '#d50000'], ['Flamingo', '#e67c73'], ['Tangerine', '#f4511e'], ['Banana', '#f6bf26'],
  ['Sage', '#33b679'], ['Basil', '#0b8043'], ['Peacock', '#039be5'], ['Blueberry', '#3f51b5'],
  ['Lavender', '#7986cb'], ['Grape', '#8e24aa'], ['Graphite', '#616161'],
  ['Radicchio', '#ad1457'], ['Cherry blossom', '#d81b60'], ['Pumpkin', '#ef6c00'], ['Mango', '#f09300'],
  ['Citron', '#e4c441'], ['Avocado', '#c0ca33'], ['Pistachio', '#7cb342'], ['Eucalyptus', '#009688'],
  ['Cobalt', '#4285f4'], ['Wisteria', '#b39ddb'], ['Amethyst', '#9e69af'], ['Cocoa', '#795548'],
  ['Birch', '#a79b8e'],
] as const;

export function colorName(color: string | null | undefined): string {
  const c = (color ?? '').toLowerCase();
  return EVENT_COLORS.find(([, hex]) => hex === c)?.[0] ?? 'Custom colour';
}

/** Relative luminance, for picking a readable check mark or label. */
export function isLightColor(color: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => lin(c / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
}

export function EventColors({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const current = value.toLowerCase();
  const custom = !EVENT_COLORS.some(([, hex]) => hex === current);
  const [wheel, setWheel] = useState(false);
  return (
    <div className="event-colors">
      <div className="calendar-color-picker" role="group" aria-label="Event colours">
        {EVENT_COLORS.map(([name, color]) => (
          <button type="button" key={color} aria-label={name} title={name} aria-pressed={current === color}
            style={{ background: color }} onClick={() => onChange(color)}>
            {current === color && <Icon name="check" size={14} color={isLightColor(color) ? '#171a1d' : '#fff'} />}
          </button>
        ))}
        <button type="button" className="is-wheel" aria-label="Colour wheel" title="Colour wheel"
          aria-pressed={wheel || custom} aria-expanded={wheel} onClick={() => setWheel((w) => !w)}
          style={custom ? { boxShadow: `inset 0 0 0 5px ${value}` } : undefined} />
      </div>
      {wheel && <ColorWheel value={value} onChange={onChange} />}
    </div>
  );
}

/* ------------------------------------------------------------ colour wheel */

type Hsv = { h: number; s: number; v: number };

function hexToHsv(hex: string): Hsv {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 210, s: 1, v: 1 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255).toString(16).padStart(2, '0');
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

/**
 * Hue round the circle, saturation out from the centre, brightness on the
 * slider. The preview follows the pointer and the colour is saved on release,
 * so a drag across the wheel is one write, not hundreds.
 */
function ColorWheel({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const ref = useRef<HTMLDivElement>(null);
  const hex = hsvToHex(hsv);

  const pick = (x: number, y: number, v: number) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    const next = {
      h: ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360,
      s: Math.min(1, Math.hypot(dx, dy) / (r.width / 2)),
      v,
    };
    setHsv(next);
    return next;
  };

  const angle = (hsv.h * Math.PI) / 180;
  const markX = 50 + Math.sin(angle) * hsv.s * 50;
  const markY = 50 - Math.cos(angle) * hsv.s * 50;

  return (
    <div className="color-wheel">
      <div ref={ref} className="color-wheel-disc" role="slider" aria-label="Hue and saturation"
        aria-valuetext={hex} aria-valuenow={Math.round(hsv.h)} aria-valuemin={0} aria-valuemax={360}
        style={{ '--v': 1 - hsv.v } as React.CSSProperties}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e.clientX, e.clientY, hsv.v);
        }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX, e.clientY, hsv.v); }}
        onPointerUp={(e) => onChange(hsvToHex(pick(e.clientX, e.clientY, hsv.v)))}>
        <span className="color-wheel-mark" style={{ left: `${markX}%`, top: `${markY}%`, background: hex }} />
      </div>
      <div className="color-wheel-side">
        <span className="color-wheel-swatch" style={{ background: hex }} />
        <code>{hex.toUpperCase()}</code>
        <input type="range" min={0} max={100} value={Math.round(hsv.v * 100)} aria-label="Brightness"
          className="color-wheel-bright"
          style={{ background: `linear-gradient(to right, #000, ${hsvToHex({ ...hsv, v: 1 })})` }}
          onChange={(e) => setHsv({ ...hsv, v: Number(e.target.value) / 100 })}
          onPointerUp={() => onChange(hex)}
          onKeyUp={() => onChange(hex)} />
      </div>
    </div>
  );
}
