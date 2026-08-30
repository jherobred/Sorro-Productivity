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

  // Current displayed percentage held in a ref so concurrent frames, rapid
  // updates, and uncommitted re-renders never lose the true instantaneous position.
  const currentVal = useRef(prefs.motion ? 0 : target);
  const [shown, setShown] = useState(prefs.motion ? 0 : target);
  const raf = useRef(0);
  const from = useRef(0);

  useEffect(() => {
    if (!prefs.motion) {
      currentVal.current = target;
      setShown(target);
      return;
    }

    from.current = currentVal.current;
    const delta = target - from.current;
    if (Math.abs(delta) < 0.05) {
      currentVal.current = target;
      setShown(target);
      return;
    }

    // Dynamic duration with a minimum threshold so eighth-block progression
    // (192 sub-cell steps) stays clearly visible and animated on both short hops
    // and full sweeps.
    const dur = Math.max(380, Math.min(750, 280 + 470 * (Math.abs(delta) / 100)));
    const t0 = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const next = from.current + delta * easeOut(t);
      currentVal.current = next;
      setShown(next);
      if (t < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        currentVal.current = target;
        setShown(target);
      }
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
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
      <span aria-hidden style={{ whiteSpace: 'pre', letterSpacing: '0', minWidth: 0, overflow: 'hidden' }}>
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

