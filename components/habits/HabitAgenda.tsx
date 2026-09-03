'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon, type IconName } from '@/components/Icon';
import { usePrefs } from '@/lib/prefs';
import type { Habit, Tick, TimeOfDay } from '@/lib/habits';

/**
 * What is due, in the order the day happens.
 *
 * The filters below this answer "show me habits matching X". This answers the
 * question you actually opened the tab with — what is left before tonight —
 * and it puts the block you are standing in first, so the top of the page is
 * never a list of things you already did at 6am.
 */

const BLOCKS: { id: TimeOfDay; label: string; icon: IconName; hue: string; from: number; to: number }[] = [
  { id: 'morning', label: 'Morning', icon: 'spark', hue: '#FFC24B', from: 5, to: 11 },
  { id: 'afternoon', label: 'Afternoon', icon: 'focus', hue: '#38BDF8', from: 12, to: 17 },
  { id: 'evening', label: 'Evening', icon: 'moon', hue: '#B07CFF', from: 18, to: 23 },
  { id: 'anytime', label: 'Anytime', icon: 'refresh', hue: '#34D9A0', from: -1, to: -1 },
];

export function HabitAgenda({
  habits,
  ticks,
  today,
  phone = false,
  onTick,
  onOpenTimer,
  onMenu,
}: {
  habits: Habit[];
  ticks: Tick[];
  today: string;
  phone?: boolean;
  onTick: (habitId: string, date: string, value?: number) => void;
  onOpenTimer: (h: Habit) => void;
  onMenu: (h: Habit, x: number, y: number) => void;
}) {
  const { prefs } = usePrefs();
  const hour = new Date().getHours();

  const doneIds = useMemo(
    () => new Set(ticks.filter((t) => t.on_date === today).map((t) => t.habit_id)),
    [ticks, today],
  );

  const groups = useMemo(
    () => BLOCKS.map((b) => ({
      ...b,
      current: b.from >= 0 && hour >= b.from && hour <= b.to,
      items: habits.filter((h) => (h.time_of_day || 'anytime') === b.id),
    })),
    [habits, hour],
  );

  const live = groups.filter((g) => g.items.length > 0);
  if (live.length === 0) return null;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: phone ? '1fr' : `repeat(${Math.min(live.length, 4)}, minmax(0, 1fr))`,
      gap: 10,
    }}>
      {live.map((g, gi) => {
        const done = g.items.filter((h) => doneIds.has(h.id)).length;
        const all = done === g.items.length;

        return (
          <motion.div
            key={g.id}
            initial={prefs.motion ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30, delay: gi * 0.06 }}
            style={{
              background: g.current
                ? `color-mix(in srgb, ${g.hue} 8%, var(--card))`
                : 'var(--card)',
              border: `1px solid ${g.current ? `color-mix(in srgb, ${g.hue} 32%, transparent)` : 'var(--line)'}`,
              borderRadius: 16,
              padding: '12px 13px',
              display: 'flex',
              flexDirection: 'column',
              gap: 9,
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <motion.span
                animate={prefs.motion && g.current ? { scale: [1, 1.16, 1] } : undefined}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  width: 22, height: 22, borderRadius: 7, display: 'grid', placeItems: 'center', flex: 'none',
                  background: `color-mix(in srgb, ${g.hue} 18%, transparent)`,
                }}
              >
                <Icon name={g.icon} size={12} color={g.hue} />
              </motion.span>

              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--tx)', letterSpacing: '-.01em' }}>
                {g.label}
              </span>

              {g.current && (
                <span style={{
                  fontSize: 8.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase',
                  padding: '2px 6px', borderRadius: 5, color: g.hue,
                  background: `color-mix(in srgb, ${g.hue} 16%, transparent)`,
                }}>
                  Now
                </span>
              )}

              <span className="num metaline" style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700 }}>
                {done}/{g.items.length}
              </span>
            </div>

            {/* A hairline that fills, so a block reads as finished at a glance. */}
            <div style={{ height: 3, borderRadius: 2, background: 'var(--line2)', overflow: 'hidden' }}>
              <motion.div
                initial={false}
                animate={{ width: `${g.items.length ? (done / g.items.length) * 100 : 0}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 30 }}
                style={{ height: '100%', borderRadius: 2, background: g.hue }}
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <AnimatePresence initial={false}>
                {g.items.map((h, i) => {
                  const on = doneIds.has(h.id);
                  return (
                    <motion.button
                      key={h.id}
                      layout={prefs.motion}
                      initial={prefs.motion ? { opacity: 0, scale: 0.85 } : false}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30, delay: prefs.motion ? i * 0.02 : 0 }}
                      whileTap={prefs.motion ? { scale: 0.9 } : undefined}
                      whileHover={prefs.motion ? { y: -2 } : undefined}
                      onClick={() => {
                        if (h.kind === 'dur' && !on) onOpenTimer(h);
                        else onTick(h.id, today, h.target ?? 1);
                      }}
                      onContextMenu={(e) => { e.preventDefault(); onMenu(h, e.clientX, e.clientY); }}
                      title={h.cue || h.name}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%',
                        padding: '5px 10px 5px 6px', borderRadius: 999, cursor: 'pointer',
                        border: `1px solid ${on ? 'transparent' : 'var(--line2)'}`,
                        background: on ? `color-mix(in srgb, ${h.color} 22%, transparent)` : 'var(--card2)',
                        color: on ? 'var(--tx)' : 'var(--tx2)',
                        fontSize: 11.5, fontWeight: 700,
                      }}
                    >
                      <span style={{
                        width: 17, height: 17, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center',
                        background: on ? h.color : `color-mix(in srgb, ${h.color} 20%, transparent)`,
                      }}>
                        <Icon
                          name={on ? 'check' : ((h.icon as IconName) || 'check')}
                          size={10}
                          color={on ? '#0C0F16' : h.color}
                        />
                      </span>
                      <span style={{
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        textDecoration: on ? 'line-through' : 'none',
                        textDecorationColor: `color-mix(in srgb, ${h.color} 70%, transparent)`,
                        opacity: on ? 0.72 : 1,
                      }}>
                        {h.short_name || h.name}
                      </span>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>

            {all && (
              <motion.div
                initial={prefs.motion ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                className="metaline"
                style={{ fontSize: 10.5, color: g.hue, fontWeight: 700 }}
              >
                Block cleared
              </motion.div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
