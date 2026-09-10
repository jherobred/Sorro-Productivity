'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useOverlayBack } from '@/lib/nav';
import type { Framing } from '@/lib/shelfPrefs';

/**
 * Repositioning a picture inside its frame.
 *
 * This replaced anchor presets in the context menu, which could not work: a
 * menu row closes the menu, so every nudge meant reopening it and you never
 * saw two positions in a row. The panel stays until Done instead, and the
 * picture moves live behind it.
 *
 * The backdrop swallows clicks but never closes on one. Losing the panel
 * mid-drag because the pointer strayed off the slider is exactly the thing
 * being fixed, so nothing dismisses it but Done, Escape or the back gesture.
 * It sits at the bottom of the screen, clear of the hero band it adjusts.
 */
export function ImageAdjuster({
  title, value, onChange, onClose,
}: {
  title: string;
  value: Framing;
  onChange: (patch: Framing) => void;
  onClose: () => void;
}) {
  useOverlayBack(true, onClose);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const x = value.x ?? 50;
  const y = value.y ?? 50;
  const fit = value.fit ?? 'cover';

  const label: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, letterSpacing: '.08em',
    textTransform: 'uppercase', color: 'var(--tx3)',
  };
  const seg = (on: boolean): React.CSSProperties => ({
    flex: 1, minHeight: 30, padding: '0 10px', cursor: 'pointer',
    border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
    background: on ? 'color-mix(in srgb, var(--acc) 18%, transparent)' : 'var(--card)',
    color: on ? 'var(--accTx)' : 'var(--tx2)', fontSize: 12, fontWeight: 700,
  });

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 260 }}>
      <div
        style={{
          position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
          width: 380, maxWidth: 'calc(100vw - 24px)', padding: 14,
          display: 'flex', gap: 14, alignItems: 'stretch',
          background: 'var(--card)', border: '1px solid var(--line2)', boxShadow: 'var(--shl)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <span style={label}>Up</span>
          <input
            type="range" min={0} max={100} value={y} aria-label="Vertical position"
            onChange={(e) => onChange({ y: +e.target.value })}
            style={{
              writingMode: 'vertical-lr', direction: 'rtl',
              width: 16, height: 96, accentColor: 'var(--acc)', cursor: 'pointer',
            }}
          />
          <span style={label}>Down</span>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...label, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx3)' }}>
              {x}% · {y}%
            </span>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={label}>Horizontal</span>
            <input
              type="range" min={0} max={100} value={x} aria-label="Horizontal position"
              onChange={(e) => onChange({ x: +e.target.value })}
              style={{ width: '100%', accentColor: 'var(--acc)', cursor: 'pointer' }}
            />
          </label>

          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => onChange({ fit: 'cover' })} style={seg(fit === 'cover')}>Fill</button>
            <button onClick={() => onChange({ fit: 'contain' })} style={seg(fit === 'contain')}>Fit</button>
            <button
              onClick={() => onChange({ x: 50, y: 50 })}
              title="Centre the picture" aria-label="Centre the picture"
              style={{ ...seg(false), flex: 'none', width: 34, display: 'grid', placeItems: 'center', padding: 0 }}
            >
              <Icon name="focus" size={14} color="var(--tx2)" />
            </button>
          </div>

          <button onClick={onClose} className="tap acc k-glass" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 34,
            background: 'var(--acc)', color: 'var(--accInk)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
          }}>
            <Icon name="check" size={13} color="var(--accInk)" />Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
