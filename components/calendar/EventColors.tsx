'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { contrastRatio, hexToHsv, hsvToHex, normalizeHex, readableInk, type Hsv } from '@/lib/calendarAppearance';
import type { Ev } from '@/lib/events';

export const EVENT_COLORS = [
  ['Tomato', '#d50000'], ['Flamingo', '#e67c73'], ['Tangerine', '#f4511e'], ['Banana', '#f6bf26'],
  ['Sage', '#33b679'], ['Basil', '#0b8043'], ['Peacock', '#039be5'], ['Blueberry', '#3f51b5'],
  ['Lavender', '#7986cb'], ['Grape', '#8e24aa'], ['Graphite', '#616161'],
  ['Radicchio', '#ad1457'], ['Cherry blossom', '#d81b60'], ['Pumpkin', '#ef6c00'], ['Mango', '#f09300'],
  ['Citron', '#e4c441'], ['Avocado', '#c0ca33'], ['Pistachio', '#7cb342'], ['Eucalyptus', '#009688'],
  ['Cobalt', '#4285f4'], ['Wisteria', '#b39ddb'], ['Amethyst', '#9e69af'], ['Cocoa', '#795548'], ['Birch', '#a79b8e'],
] as const;

export const colorName = (color?: string | null) => EVENT_COLORS.find(([, hex]) => hex === color?.toLowerCase())?.[0] ?? 'Custom color';
export const isLightColor = (color: string) => readableInk(color) === '#000000';

/** Always visible, touch/pen friendly, and commits one write per gesture. */
export function EventColors({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return <div className="event-colors">
    <ColorWheel value={value} onChange={onChange}/>
    <details className="calendar-presets"><summary>Google Calendar colors</summary>
      <div className="calendar-color-picker" role="group" aria-label="Color presets">
        {EVENT_COLORS.map(([name, color]) => <button type="button" key={color} aria-label={name} title={name}
          aria-pressed={value.toLowerCase() === color} style={{ background: color }} onClick={() => onChange(color)}>
          {value.toLowerCase() === color && <Icon name="check" size={14} color={readableInk(color)}/>}
        </button>)}
      </div>
    </details>
  </div>;
}

function ColorWheel({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [code, setCode] = useState(value.toUpperCase());
  const [invalid, setInvalid] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(hsv);
  const dragging = useRef(false);
  const hex = hsvToHex(hsv);
  const preview = (next: Hsv) => { latest.current = next; setHsv(next); setCode(hsvToHex(next).toUpperCase()); setInvalid(false); };
  useEffect(() => {
    if (!dragging.current) { const next = hexToHsv(value); latest.current = next; setHsv(next); setCode(value.toUpperCase()); setInvalid(false); }
  }, [value]);
  const pick = (x: number, y: number) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = x - r.left - r.width / 2, dy = y - r.top - r.height / 2;
    const next = { h: (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360, s: Math.min(1, Math.hypot(dx, dy) / (r.width / 2)), v: latest.current.v };
    preview(next);
    return next;
  };
  const applyCode = () => {
    const normalized = normalizeHex(code);
    setInvalid(!normalized);
    if (normalized) { preview(hexToHsv(normalized)); onChange(normalized); }
  };
  const angle = hsv.h * Math.PI / 180;
  return <div className="color-wheel">
    <div ref={ref} className="color-wheel-disc" role="slider" tabIndex={0} aria-label="Color wheel hue and saturation"
      aria-valuetext={`${hex}, saturation ${Math.round(hsv.s * 100)} percent`} aria-valuenow={Math.round(hsv.h)} aria-valuemin={0} aria-valuemax={360}
      aria-description="Drag to select a color. Left and right change hue; up and down change saturation."
      style={{ '--v': 1 - hsv.v } as React.CSSProperties}
      onPointerDown={e => { e.preventDefault(); dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientX, e.clientY); }}
      onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX, e.clientY); }}
      onPointerUp={e => { if (!dragging.current) return; const next = pick(e.clientX, e.clientY); dragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId); onChange(hsvToHex(next)); }}
      onPointerCancel={() => { dragging.current = false; preview(hexToHsv(value)); }}
      onKeyDown={e => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const next = { ...latest.current };
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') next.h = (next.h + (e.key === 'ArrowRight' ? 3 : 357)) % 360;
        else next.s = Math.max(0, Math.min(1, next.s + (e.key === 'ArrowUp' ? .02 : -.02)));
        preview(next); onChange(hsvToHex(next));
      }}>
      <span className="color-wheel-mark" style={{ left: `${50 + Math.sin(angle) * hsv.s * 50}%`, top: `${50 - Math.cos(angle) * hsv.s * 50}%`, background: hex }}/>
    </div>
    <div className="color-wheel-side">
      <span className="color-wheel-swatch" style={{ background: hex }}/>
      <label>Hex color<input aria-label="Hex color" value={code} maxLength={7} spellCheck={false} aria-invalid={invalid}
        onChange={e => { setCode(e.target.value); setInvalid(false); }} onBlur={applyCode}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCode(); } }}/></label>
      {invalid && <small role="alert">Use 3 or 6 hex digits, e.g. #4285F4.</small>}
      <label>Brightness<input type="range" min={0} max={100} value={Math.round(hsv.v * 100)} aria-label="Color brightness"
        className="color-wheel-bright" style={{ background: `linear-gradient(to right, #000, ${hsvToHex({ ...hsv, v: 1 })})` }}
        onPointerDown={() => { dragging.current = true; }}
        onChange={e => preview({ ...latest.current, v: Number(e.target.value) / 100 })}
        onPointerUp={() => { dragging.current = false; onChange(hsvToHex(latest.current)); }}
        onPointerCancel={() => { dragging.current = false; preview(hexToHsv(value)); }}
        onKeyUp={() => onChange(hsvToHex(latest.current))}/></label>
    </div>
  </div>;
}

export function EventAppearance({ event, onChange }: { event: Pick<Ev, 'color' | 'text_color' | 'title_color' | 'detail_color'>; onChange: (patch: Partial<Ev>) => void }) {
  const [target, setTarget] = useState<'color' | 'text_color' | 'title_color' | 'detail_color'>('color');
  const ink = event.text_color || readableInk(event.color);
  const value = event[target] || ink;
  const lowContrast = target !== 'color' && contrastRatio(value, event.color) < 4.5;
  return <div className="cal-appearance">
    <div className="cal-chips" role="group" aria-label="Color applies to">
      {([['color', 'Background'], ['text_color', 'All text'], ['title_color', 'Title'], ['detail_color', 'Time & details']] as const).map(([key, label]) =>
        <button type="button" key={key} aria-pressed={target === key} onClick={() => setTarget(key)}>{label}</button>)}
    </div>
    <EventColors value={value} onChange={color => onChange(target === 'text_color' ? { text_color: color, title_color: null, detail_color: null } : { [target]: color })}/>
    {target !== 'color' && <button type="button" className="cal-color-auto" onClick={() => onChange(target === 'text_color' ? { text_color: null, title_color: null, detail_color: null } : { [target]: null })}>Use automatic contrast</button>}
    {lowContrast && <small className="cal-contrast-hint">Low contrast ({contrastRatio(value, event.color).toFixed(1)}:1). Automatic contrast improves readability.</small>}
    <div className="cal-color-preview" style={{ background: event.color }}>
      <b style={{ color: event.title_color || ink }}>Event title</b><span style={{ color: event.detail_color || ink }}>9:00 – 10:00 AM · Event details</span>
    </div>
  </div>;
}
