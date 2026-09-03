'use client';

import { useMemo } from 'react';
import { motion } from 'motion/react';
import { Icon, type IconName } from '@/components/Icon';
import { usePrefs } from '@/lib/prefs';
import { streak, maxStreak, ymd, useStreakFreezes, type Habit, type Tick } from '@/lib/habits';

/**
 * Four things the numbers know that the grid does not say out loud.
 *
 * The trophy wall next door rewards having used the app. These read the ticks
 * and name the one thing worth acting on before midnight: the run about to
 * break, the record within reach, the weekday that keeps failing, and the
 * freeze sitting unused while a streak dies.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function HabitInsights({
  habits,
  ticks,
  today,
  phone = false,
  onTick,
}: {
  habits: Habit[];
  ticks: Tick[];
  today: string;
  phone?: boolean;
  onTick: (habitId: string, date: string, value?: number) => void;
}) {
  const { prefs } = usePrefs();
  const { freezes, useFreeze } = useStreakFreezes();

  const insight = useMemo(() => {
    const active = habits.filter((h) => !h.archived_at);
    const doneToday = new Set(ticks.filter((t) => t.on_date === today).map((t) => t.habit_id));

    const runs = active.map((h) => ({
      h, run: streak(ticks, h.id), best: maxStreak(ticks, h.id), done: doneToday.has(h.id),
    }));

    // A run only counts as at risk once it is long enough to be worth losing.
    const atRisk = runs
      .filter((r) => !r.done && r.run >= 2)
      .sort((a, b) => b.run - a.run);

    const chasing = runs
      .filter((r) => r.best > 0 && r.run > 0 && r.run < r.best && r.best - r.run <= 5)
      .sort((a, b) => (a.best - a.run) - (b.best - b.run));

    // Hit counts per weekday, weighted against how often that weekday came up.
    const hit = [0, 0, 0, 0, 0, 0, 0];
    const seen = [0, 0, 0, 0, 0, 0, 0];
    const byDay = new Map<string, number>();
    for (const t of ticks) byDay.set(t.on_date, (byDay.get(t.on_date) ?? 0) + 1);

    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 30; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      const wd = d.getDay();
      seen[wd] += 1;
      hit[wd] += byDay.get(ymd(d)) ?? 0;
    }
    const avg = hit.map((n, i) => (seen[i] ? n / seen[i] : 0));
    const bestDow = avg.indexOf(Math.max(...avg));
    const worstDow = avg.indexOf(Math.min(...avg));
    const anyData = avg.some((n) => n > 0);

    // Yesterday, which is the day a freeze would be spent on.
    const y = new Date(base);
    y.setDate(base.getDate() - 1);
    const yesterday = ymd(y);
    const missedYesterday = runs.filter((r) => !ticks.some((t) => t.habit_id === r.h.id && t.on_date === yesterday)).length;

    return { runs, atRisk, chasing, bestDow, worstDow, anyData, avg, yesterday, missedYesterday, activeCount: active.length };
  }, [habits, ticks, today]);

  const cards: {
    key: string; kicker: string; icon: IconName; hue: string;
    headline: string; sub: string;
    action?: { label: string; run: () => void };
  }[] = [];

  if (insight.atRisk.length > 0) {
    const top = insight.atRisk[0];
    cards.push({
      key: 'risk',
      kicker: 'At risk tonight',
      icon: 'flame',
      hue: '#FF6B6B',
      headline: `${top.run}-day run on ${top.h.name}`,
      sub: insight.atRisk.length > 1
        ? `and ${insight.atRisk.length - 1} other run${insight.atRisk.length > 2 ? 's' : ''} still open today`
        : 'not ticked yet today',
      action: { label: 'Tick it', run: () => onTick(top.h.id, today, top.h.target ?? 1) },
    });
  } else {
    const longest = [...insight.runs].sort((a, b) => b.run - a.run)[0];
    cards.push({
      key: 'safe',
      kicker: 'Nothing at risk',
      icon: 'check',
      hue: '#34D9A0',
      headline: longest && longest.run > 0 ? `${longest.run} days on ${longest.h.name}` : 'No runs going yet',
      sub: longest && longest.run > 0 ? 'every live run is safe for today' : 'tick anything to start one',
    });
  }

  if (insight.chasing.length > 0) {
    const c = insight.chasing[0];
    cards.push({
      key: 'record',
      kicker: 'Record in reach',
      icon: 'trophy',
      hue: '#FFC24B',
      headline: `${c.best - c.run} day${c.best - c.run === 1 ? '' : 's'} from best`,
      sub: `${c.h.name} sits at ${c.run}, record is ${c.best}`,
    });
  } else {
    const best = insight.runs.reduce((m, r) => Math.max(m, r.best), 0);
    cards.push({
      key: 'record-none',
      kicker: 'All-time best',
      icon: 'trophy',
      hue: '#FFC24B',
      headline: `${best} day${best === 1 ? '' : 's'}`,
      sub: best > 0 ? 'the number to beat' : 'no record set yet',
    });
  }

  cards.push({
    key: 'dow',
    kicker: 'Weekday pattern',
    icon: 'week',
    hue: '#38BDF8',
    headline: insight.anyData ? `${DAY_NAMES[insight.bestDow]}s are strongest` : 'Not enough history',
    sub: insight.anyData
      ? `${DAY_NAMES[insight.worstDow]} is where it slips`
      : 'tick a few days to see the shape',
  });

  cards.push({
    key: 'freeze',
    kicker: 'Streak freezes',
    icon: 'lock',
    hue: '#38D6F2',
    headline: `${freezes} left`,
    sub: insight.missedYesterday > 0
      ? `${insight.missedYesterday} habit${insight.missedYesterday === 1 ? '' : 's'} missed yesterday`
      : 'yesterday was covered',
    action: freezes > 0 && insight.missedYesterday > 0
      ? { label: 'Freeze yesterday', run: () => useFreeze(insight.yesterday) }
      : undefined,
  });

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: phone ? '1fr 1fr' : 'repeat(auto-fit, minmax(210px, 1fr))',
      gap: 10,
    }}>
      {cards.map((c, i) => (
        <motion.div
          key={c.key}
          initial={prefs.motion ? { opacity: 0, y: 12 } : false}
          animate={{ opacity: 1, y: 0 }}
          whileHover={prefs.motion ? { y: -3 } : undefined}
          transition={{ type: 'spring', stiffness: 380, damping: 28, delay: i * 0.05 }}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            padding: '12px 13px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            position: 'relative',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {/* A hue wash so four cards do not read as one grey block. */}
          <span aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, ${c.hue} 13%, transparent) 0%, transparent 62%)`,
          }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
            <Icon name={c.icon} size={12} color={c.hue} />
            <span className="kicker" style={{ color: c.hue }}>{c.kicker}</span>
          </div>

          <div style={{
            fontSize: phone ? 13 : 14.5, fontWeight: 800, letterSpacing: '-.02em',
            color: 'var(--tx)', lineHeight: 1.2, position: 'relative',
          }}>
            {c.headline}
          </div>

          <div className="metaline" style={{ fontSize: 11, lineHeight: 1.35, position: 'relative' }}>
            {c.sub}
          </div>

          {c.action && (
            <motion.button
              onClick={c.action.run}
              whileTap={prefs.motion ? { scale: 0.94 } : undefined}
              whileHover={prefs.motion ? { scale: 1.03 } : undefined}
              style={{
                marginTop: 2, alignSelf: 'flex-start', position: 'relative',
                padding: '5px 11px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid color-mix(in srgb, ${c.hue} 40%, transparent)`,
                background: `color-mix(in srgb, ${c.hue} 15%, transparent)`,
                color: c.hue, fontSize: 11, fontWeight: 800,
              }}
            >
              {c.action.label}
            </motion.button>
          )}
        </motion.div>
      ))}
    </div>
  );
}
