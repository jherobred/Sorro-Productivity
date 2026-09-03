'use client';

import { useMemo } from 'react';
import { motion } from 'motion/react';
import { usePrefs } from '@/lib/prefs';
import { SECHUE } from '@/lib/pal';
import type { Habit, Tick } from '@/lib/habits';

/**
 * The whole year in one grid: 53 week columns, 7 weekday rows, one square per
 * day shaded by the share of that day's habits you finished.
 *
 * The Year Grid button used to fetch 365 days of ticks and then render the
 * same seven squares the week view drew — the data was already paid for and
 * thrown away. This spends it.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ROW_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

export function YearHeatmap({
  habits,
  ticks,
  days,
  today,
  phone = false,
}: {
  habits: Habit[];
  ticks: Tick[];
  days: string[];
  today: string;
  phone?: boolean;
}) {
  const { prefs } = usePrefs();
  const hue = SECHUE.habits;

  const { weeks, monthMarks, perDay, total, bestDay, activeDays } = useMemo(() => {
    const active = Math.max(1, habits.filter((h) => !h.archived_at).length);

    const counts = new Map<string, number>();
    for (const t of ticks) counts.set(t.on_date, (counts.get(t.on_date) ?? 0) + 1);

    const pad = days.length ? new Date(`${days[0]}T00:00:00`).getDay() : 0;
    const cells: string[] = [...Array(pad).fill(''), ...days];
    const w: string[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      const slice = cells.slice(i, i + 7);
      w.push(slice.length === 7 ? slice : [...slice, ...Array(7 - slice.length).fill('')]);
    }

    const marks: { at: number; label: string }[] = [];
    w.forEach((col, i) => {
      const first = col.find(Boolean);
      if (!first) return;
      const label = MONTHS[new Date(`${first}T00:00:00`).getMonth()];
      if (!marks.length || marks[marks.length - 1].label !== label) marks.push({ at: i, label });
    });

    let sum = 0;
    let peak = 0;
    let touched = 0;
    for (const d of days) {
      const n = counts.get(d) ?? 0;
      sum += n;
      if (n > peak) peak = n;
      if (n > 0) touched += 1;
    }

    return {
      weeks: w,
      monthMarks: marks,
      perDay: (d: string) => Math.min(1, (counts.get(d) ?? 0) / active),
      total: sum,
      bestDay: peak,
      activeDays: touched,
    };
  }, [habits, ticks, days]);

  const cell = phone ? 8 : 11;

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--line)',
      borderRadius: 18,
      boxShadow: 'var(--sh)',
      padding: phone ? '14px 13px' : '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 700, letterSpacing: '-.02em',
        }}>
          The year so far
        </span>
        <span className="metaline">
          {total.toLocaleString()} ticks over {activeDays} active days · best day {bestDay}
        </span>
      </div>

      {/* The grid scrolls inside itself rather than pushing the page wide. */}
      <div className="navsb" style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ minWidth: weeks.length * (cell + 2) + 34 }}>
          {/* Month scale */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `30px repeat(${weeks.length}, ${cell}px)`,
            gap: 2,
            marginBottom: 4,
          }}>
            <span />
            {weeks.map((_, i) => {
              const mark = monthMarks.find((m) => m.at === i);
              return (
                <span key={i} style={{
                  fontSize: 9, fontWeight: 700, color: 'var(--tx3)', whiteSpace: 'nowrap',
                }}>
                  {mark ? mark.label : ''}
                </span>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `30px repeat(${weeks.length}, ${cell}px)`, gap: 2 }}>
            {/* Weekday rail */}
            <div style={{ display: 'grid', gridTemplateRows: `repeat(7, ${cell}px)`, gap: 2 }}>
              {ROW_LABELS.map((l, i) => (
                <span key={i} style={{
                  fontSize: 8.5, fontWeight: 700, color: 'var(--tx3)', lineHeight: `${cell}px`,
                }}>
                  {l}
                </span>
              ))}
            </div>

            {weeks.map((col, wi) => (
              <div key={wi} style={{ display: 'grid', gridTemplateRows: `repeat(7, ${cell}px)`, gap: 2 }}>
                {col.map((d, di) => {
                  if (!d) return <span key={di} />;
                  const v = perDay(d);
                  return (
                    <motion.span
                      key={d}
                      title={`${d} — ${Math.round(v * 100)}% of habits`}
                      initial={prefs.motion ? { opacity: 0, scale: 0.4 } : false}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={prefs.motion ? { scale: 1.9, zIndex: 4 } : undefined}
                      transition={{
                        type: 'spring', stiffness: 500, damping: 26,
                        delay: prefs.motion ? Math.min(wi * 0.006, 0.35) : 0,
                      }}
                      style={{
                        borderRadius: 2,
                        display: 'block',
                        border: d === today ? `1px solid ${hue}` : 'none',
                        background: v === 0
                          ? 'var(--card2)'
                          : `color-mix(in srgb, ${hue} ${Math.round(22 + v * 78)}%, transparent)`,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="metaline" style={{ fontSize: 10.5 }}>Less</span>
        {[0, 25, 50, 75, 100].map((n) => (
          <span key={n} style={{
            width: cell, height: cell, borderRadius: 2,
            background: n === 0 ? 'var(--card2)' : `color-mix(in srgb, ${hue} ${Math.round(22 + (n / 100) * 78)}%, transparent)`,
          }} />
        ))}
        <span className="metaline" style={{ fontSize: 10.5 }}>More</span>
      </div>
    </div>
  );
}
