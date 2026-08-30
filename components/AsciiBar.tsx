'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrefs } from '@/lib/prefs';
import { barParts } from '@/lib/asciiBar';

/**
 * The one progress bar in the app.
 *
 * Every screen used to draw its own — a 7px track div with a coloured child
 * whose width was a percentage string, and a `transition: width` that each
 * caller wrote out again with its own duration. Same shape twelve times, and
 * twelve chances for one of them to animate differently from the rest.
 *
 * This one is drawn in text. A bar of `█` on a track of `░` at the app's mono
 * face, which means it lines up with every other number on the screen and
 * needs no track element, no overflow clip and no border-radius.
 *
 * The sub-cell geometry lives in lib/asciiBar.ts so it can be checked without
 * a DOM; this file is only the frame loop and the markup.
 */

/** How long the fill takes to travel the whole bar, at any distance. */
const RUN_MS = 620;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function AsciiBar({
  value,
  cells = 24,
  hue,
  label,
  showValue = true,
  suffix = '%',
  size = 12,
}: {
  /** 0–100. Values outside are clamped rather than overflowing the track. */
  value: number;
  /** Track length in characters. */
  cells?: number;
  /** Section hue for the filled run. Defaults to the accent. */
  hue?: string;
  /** Announced to screen readers, which never see the blocks. */
  label?: string;
  showValue?: boolean;
  /** Written after the number. Pass '' for a bare count. */
  suffix?: string;
  size?: number;
}) {
  const { prefs } = usePrefs();
  const target = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  // Motion off means the bar is simply drawn at its value — no frame loop, no
  // state, and no first-paint sweep from zero.
  const [shown, setShown] = useState(prefs.motion ? 0 : target);
  const raf = useRef(0);
  const from = useRef(0);

  useEffect(() => {
    if (!prefs.motion) { setShown(target); return; }

    from.current = shown;
    const delta = target - from.current;
    if (delta === 0) return;

    // Short hops finish quickly; the full sweep gets the whole budget.
    const dur = Math.max(120, RUN_MS * (Math.abs(delta) / 100));
    const t0 = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      setShown(from.current + delta * easeOut(t));
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // `shown` is the animation's own output — reading it here seeds the next
    // run from wherever this one stopped, but depending on it would restart
    // the loop on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, prefs.motion, cells]);

  const { filled, edge, rest } = barParts(shown, cells);

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(target)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
        fontFamily: 'var(--font-mono)', fontSize: size, lineHeight: 1.1,
      }}
    >
      <span aria-hidden style={{ whiteSpace: 'pre', letterSpacing: '-.04em', minWidth: 0, overflow: 'hidden' }}>
        <span style={{ color: hue || 'var(--accTx)' }}>{filled}{edge}</span>
        <span style={{ color: 'var(--line2)' }}>{rest}</span>
      </span>
      {showValue && (
        <span className="num" style={{ flex: 'none', color: 'var(--tx2)', fontSize: size - .5, fontWeight: 600 }}>
          {Math.round(shown)}{suffix}
        </span>
      )}
    </div>
  );
}

/**
 * The same bar with nothing but the track — for rows that already state the
 * number next to it, which most of them do.
 */
export function AsciiBarBare(props: Omit<Parameters<typeof AsciiBar>[0], 'showValue'>) {
  return <AsciiBar {...props} showValue={false} />;
}
