'use client';

import type { CSSProperties } from 'react';
import { PAL } from './pal';

/**
 * The "liquid glass" surface — `LG()` in the original prototype (renderVals, ~line 4299).
 * Ported verbatim: two tinted radial washes over a vertical scrim, a heavy
 * backdrop blur, a bright inner top edge and a deep drop shadow.
 *
 * This is the signature of the chrome (phone nav bar, sheets, glass cards) —
 * without it those surfaces read as flat panels.
 */
export function lg(opts: {
  tint: string;
  strength?: number;
  radius?: number | string;
  dark?: boolean;
}): CSSProperties {
  const t = opts.tint;
  const k = opts.strength ?? 1;
  const dark = opts.dark ?? true;
  const base = dark ? '18,16,28' : '255,255,255';

  const a1 = (dark ? 0.3 * k : 0.52 * k).toFixed(3);
  const a2 = (dark ? 0.52 * k : 0.7 * k).toFixed(3);
  const a3 = (dark ? 0.4 * k : 0.6 * k).toFixed(3);
  const blur = `blur(${Math.round(30 * k)}px) saturate(2.2) brightness(${dark ? 1.14 : 1.04})`;

  return {
    background:
      `linear-gradient(160deg, rgba(${base},${a1}) 0%, rgba(${base},${a2}) 52%, rgba(${base},${a3}) 100%), ` +
      `radial-gradient(120% 100% at 12% 0%, color-mix(in srgb, ${t} ${Math.round((dark ? 26 : 18) * k)}%, transparent) 0%, transparent 62%), ` +
      `radial-gradient(110% 90% at 92% 100%, color-mix(in srgb, ${PAL.cyan} ${Math.round((dark ? 16 : 11) * k)}%, transparent) 0%, transparent 60%)`,
    backdropFilter: blur,
    WebkitBackdropFilter: blur,
    border: `1px solid ${dark ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.85)'}`,
    borderRadius: opts.radius,
    boxShadow: [
      `inset 0 1px 0 ${dark ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.95)'}`,
      `inset 0 -1px 0 ${dark ? 'rgba(255,255,255,.06)' : 'rgba(38,32,54,.05)'}`,
      `inset 0 -14px 22px -14px ${dark ? 'rgba(0,0,0,.55)' : 'rgba(38,32,54,.14)'}`,
      `0 14px 40px ${dark ? 'rgba(0,0,0,.5)' : 'rgba(40,34,60,.16)'}`,
    ].join(', '),
  };
}

/** Text/icon colour that sits on an accent fill. Hardcoded in the prototype. */
export const ON_ACCENT = '#0C0F16';
