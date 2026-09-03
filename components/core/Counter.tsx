'use client';

import { useEffect, useRef } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { usePrefs } from '@/lib/prefs';

/**
 * A number that travels to its value instead of snapping to it.
 *
 * Dashboards lie when a stat changes and nothing moves: the eye never catches
 * it, so the number may as well have always been there. Counting from the old
 * value to the new one is what makes a live number feel live — the same reason
 * the shelf hero counts. Extracted from GlobalShelf so every tab counts the
 * same way, on the same curve.
 *
 * Motion off (`.nomo`, the product setting) jumps straight to the value — the
 * number is information first, delight second.
 */
export function Counter({
  to, format, duration = 0.9,
}: {
  to: number;
  /** Defaults to a grouped integer. Pass one for units ("82 kg") or decimals. */
  format?: (v: number) => string;
  duration?: number;
}) {
  const { prefs } = usePrefs();
  const fmt = format ?? ((v: number) => Math.round(v).toLocaleString());

  const mv = useMotionValue(to);
  const text = useTransform(mv, fmt);
  const mounted = useRef(false);

  useEffect(() => {
    // First paint shows the value; only *changes* count. Without this a card
    // mounting under an open tab plays every stat from zero, every switch.
    if (!mounted.current) { mounted.current = true; mv.set(to); return; }
    if (prefs.motion === false) { mv.set(to); return; }
    const controls = animate(mv, to, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [to, mv, prefs.motion, duration]);

  return <motion.span style={{ fontVariantNumeric: 'tabular-nums' }}>{text}</motion.span>;
}
