'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/**
 * The streak badge. Shared by Habits, Home, Journal and Body so a run of days
 * looks the same wherever it is counted.
 *
 * Motion is doing work here rather than decorating: the number pops when it
 * changes (kinetics "Number Counter"), the flame breathes only while a streak
 * is alive, and the intensity of both scales with length — a 30-day run should
 * feel different from a 2-day one. All of it collapses under the motion
 * setting, and the count is still legible without any of it.
 */

export function Streak({
  days, label = 'day streak', hue = 'var(--pal-coral)', size = 'md', best,
}: {
  days: number;
  label?: string;
  hue?: string;
  size?: 'sm' | 'md' | 'lg';
  best?: number;
}) {
  const [pop, setPop] = useState(false);
  const prev = useRef(days);

  useEffect(() => {
    if (days !== prev.current) {
      prev.current = days;
      setPop(true);
      const t = setTimeout(() => setPop(false), 420);
      return () => clearTimeout(t);
    }
  }, [days]);

  const alive = days > 0;
  const heat = Math.min(1, days / 30);   // 0 → 1 across the first month
  const S = SIZES[size];

  return (
    <span
      title={best ? `Best run: ${best} days` : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: S.gap,
        padding: S.pad, borderRadius: 999,
        background: alive ? `color-mix(in srgb, ${hue} ${8 + heat * 14}%, transparent)` : 'var(--card2)',
        border: `1px solid ${alive ? `color-mix(in srgb, ${hue} ${28 + heat * 34}%, transparent)` : 'var(--line)'}`,
        transition: 'background .5s var(--k-expo), border-color .5s var(--k-expo)',
      }}>
      <span style={{ position: 'relative', display: 'grid', placeItems: 'center', flex: 'none' }}>
        {/* The halo only runs while the streak is alive, and its period shortens
            as the run grows — a long streak visibly burns harder. */}
        {alive && (
          <span aria-hidden style={{
            position: 'absolute', inset: -S.icon * 0.35, borderRadius: '50%',
            background: `radial-gradient(circle, color-mix(in srgb, ${hue} ${20 + heat * 30}%, transparent), transparent 70%)`,
            animation: `streakbreathe ${2.6 - heat * 1.1}s ease-in-out infinite`,
            animationPlayState: 'var(--anim, running)' as unknown as 'running',
          }} />
        )}
        <Icon name="flame" size={S.icon} color={alive ? hue : 'var(--tx3)'} />
      </span>

      <span className={`k-count${pop ? ' on' : ''}`} style={{
        fontSize: S.num, fontWeight: 800, letterSpacing: '-.02em',
        color: alive ? hue : 'var(--tx3)', fontVariantNumeric: 'tabular-nums',
      }}>
        {days}
      </span>

      {label && (
        <span style={{ fontSize: S.label, fontWeight: 700, color: alive ? 'var(--tx2)' : 'var(--tx3)', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
    </span>
  );
}

const SIZES = {
  sm: { pad: '3px 9px 3px 7px', gap: 5, icon: 12, num: 12, label: 10 },
  md: { pad: '5px 12px 5px 9px', gap: 6, icon: 15, num: 15, label: 11 },
  lg: { pad: '8px 16px 8px 12px', gap: 8, icon: 20, num: 21, label: 12 },
} as const;

/**
 * The longest run of consecutive days ending today (or yesterday — today not
 * being ticked yet should not break a live streak).
 */
export function streakFrom(dates: Iterable<string>): number {
  const set = new Set(dates);
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!set.has(key(cursor))) cursor.setDate(cursor.getDate() - 1);

  let n = 0;
  while (set.has(key(cursor)) && n < 3650) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

/** The longest run anywhere in the history, for the "best" tooltip. */
export function bestStreakFrom(dates: Iterable<string>): number {
  const sorted = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of sorted) {
    const t = new Date(`${d}T00:00:00`).getTime();
    run = prev !== null && t - prev === 86_400_000 ? run + 1 : 1;
    prev = t;
    best = Math.max(best, run);
  }
  return best;
}
