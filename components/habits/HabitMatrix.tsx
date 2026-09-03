'use client';

import { useMemo } from 'react';
import { motion } from 'motion/react';
import { Icon, type IconName } from '@/components/Icon';
import { usePrefs } from '@/lib/prefs';
import { streak, maxStreak, ymd, type Habit, type Tick } from '@/lib/habits';

/**
 * One habit, one row, the full width of the page.
 *
 * The card grid this replaces put a 266px week strip in a 1200px card and left
 * the rest empty, and it stacked one habit per row anyway — so a page of six
 * habits was six screens of mostly nothing. A row that runs edge to edge fits
 * a month of days at the same cell size the week used, which is the only
 * change that makes a slide visible before the streak counter admits to it.
 *
 * `span` picks the window: 7 and 30 lay the days out left to right, 365
 * switches to week columns because 365 cells in a line are 2px wide.
 */

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type MatrixSpan = 7 | 30 | 365;

/** The last `n` days as ymd strings, oldest first. */
export function windowDays(n: number): string[] {
  const out: string[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    out.push(ymd(d));
  }
  return out;
}

/** Intensity of a day's cell: 0 when untouched, 1 when the target is met. */
function fillOf(value: number | undefined, target: number): number {
  if (value === undefined) return 0;
  if (target <= 1) return 1;
  return Math.min(1, Math.max(0.25, value / target));
}

export function HabitMatrix({
  habits,
  ticks,
  days,
  span,
  today,
  phone = false,
  onTick,
  onSetValue,
  onOpenDetail,
  onOpenTimer,
  onMenu,
}: {
  habits: Habit[];
  ticks: Tick[];
  days: string[];
  span: MatrixSpan;
  today: string;
  phone?: boolean;
  onTick: (habitId: string, date: string, value?: number) => void;
  onSetValue: (habitId: string, date: string, value: number) => void;
  onOpenDetail: (h: Habit) => void;
  onOpenTimer: (h: Habit) => void;
  onMenu: (h: Habit, x: number, y: number) => void;
}) {
  const { prefs } = usePrefs();

  /** habit id → date → value. One pass instead of a find() per cell. */
  const index = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const t of ticks) {
      let row = m.get(t.habit_id);
      if (!row) { row = new Map(); m.set(t.habit_id, row); }
      row.set(t.on_date, Number(t.value) || 1);
    }
    return m;
  }, [ticks]);

  const nameCol = phone ? '1fr' : span === 365 ? 'minmax(180px, 220px)' : 'minmax(190px, 250px)';
  const statCol = phone ? 'auto' : span === 365 ? '104px' : '140px';

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--line)',
      borderRadius: 18,
      boxShadow: 'var(--sh)',
      overflow: 'hidden',
    }}>
      {/* The scale above the strip. Without it a wall of squares has no dates,
          and "which Tuesday did I stop" is the question the wall exists for. */}
      {!phone && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `${nameCol} 1fr ${statCol}`,
          gap: 14,
          alignItems: 'end',
          padding: '11px 16px 8px',
          borderBottom: '1px solid var(--line2)',
        }}>
          <span className="kicker">Habit</span>
          <ScaleRow days={days} span={span} today={today} />
          <span className="kicker" style={{ textAlign: 'right' }}>Run · Hit</span>
        </div>
      )}

      <div>
        {habits.map((h, i) => (
          <MatrixRow
            key={h.id}
            habit={h}
            values={index.get(h.id)}
            ticks={ticks}
            days={days}
            span={span}
            today={today}
            phone={phone}
            index={i}
            last={i === habits.length - 1}
            animate={prefs.motion}
            nameCol={nameCol}
            statCol={statCol}
            onTick={onTick}
            onSetValue={onSetValue}
            onOpenDetail={onOpenDetail}
            onOpenTimer={onOpenTimer}
            onMenu={onMenu}
          />
        ))}
      </div>
    </div>
  );
}

/** Date labels above the strip: weekday letters at 7, month names past that. */
function ScaleRow({ days, span, today }: { days: string[]; span: MatrixSpan; today: string }) {
  if (span === 7) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gap: 5 }}>
        {days.map((d) => (
          <span key={d} style={{
            fontSize: 9.5, fontWeight: 800, textAlign: 'center', letterSpacing: '.04em',
            color: d === today ? 'var(--accTx)' : 'var(--tx3)',
          }}>
            {DOW[new Date(`${d}T00:00:00`).getDay()]}
          </span>
        ))}
      </div>
    );
  }

  if (span === 365) {
    // One label per month, positioned on the week column that month starts in.
    const weeks = toWeeks(days);
    const marks: { at: number; label: string }[] = [];
    weeks.forEach((w, i) => {
      const first = w.find(Boolean);
      if (!first) return;
      const m = new Date(`${first}T00:00:00`).getMonth();
      if (!marks.length || marks[marks.length - 1].label !== MONTHS[m]) marks.push({ at: i, label: MONTHS[m] });
    });
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`, gap: 2 }}>
        {weeks.map((_, i) => {
          const mark = marks.find((m) => m.at === i);
          return (
            <span key={i} style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
              {mark && i % 2 === 0 ? mark.label : ''}
            </span>
          );
        })}
      </div>
    );
  }

  // 30 days: the 1st of a month, and every 5th day, keep the eye anchored.
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gap: 4 }}>
      {days.map((d, i) => {
        const dt = new Date(`${d}T00:00:00`);
        const dom = dt.getDate();
        const show = dom === 1 || i === days.length - 1 || i % 5 === 0;
        return (
          <span key={d} style={{
            fontSize: 9, fontWeight: 700, textAlign: 'center',
            color: d === today ? 'var(--accTx)' : 'var(--tx3)',
          }}>
            {show ? (dom === 1 ? MONTHS[dt.getMonth()] : dom) : ''}
          </span>
        );
      })}
    </div>
  );
}

/** 365 dates padded into full Sunday-start columns. Empty slots are ''. */
function toWeeks(days: string[]): string[][] {
  if (!days.length) return [];
  const pad = new Date(`${days[0]}T00:00:00`).getDay();
  const cells: string[] = [...Array(pad).fill(''), ...days];
  const weeks: string[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const w = cells.slice(i, i + 7);
    weeks.push(w.length === 7 ? w : [...w, ...Array(7 - w.length).fill('')]);
  }
  return weeks;
}

function MatrixRow({
  habit, values, ticks, days, span, today, phone, index, last, animate,
  nameCol, statCol, onTick, onSetValue, onOpenDetail, onOpenTimer, onMenu,
}: {
  habit: Habit;
  values: Map<string, number> | undefined;
  ticks: Tick[];
  days: string[];
  span: MatrixSpan;
  today: string;
  phone: boolean;
  index: number;
  last: boolean;
  animate: boolean;
  nameCol: string;
  statCol: string;
  onTick: (habitId: string, date: string, value?: number) => void;
  onSetValue: (habitId: string, date: string, value: number) => void;
  onOpenDetail: (h: Habit) => void;
  onOpenTimer: (h: Habit) => void;
  onMenu: (h: Habit, x: number, y: number) => void;
}) {
  const run = streak(ticks, habit.id);
  const best = maxStreak(ticks, habit.id);
  const target = habit.target ?? 1;
  const hits = days.reduce((n, d) => n + (values?.has(d) ? 1 : 0), 0);
  const rate = days.length ? Math.round((hits / days.length) * 100) : 0;
  const doneToday = values?.has(today) ?? false;
  const todayVal = values?.get(today) ?? 0;

  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34, delay: Math.min(index * 0.035, 0.5) }}
      onContextMenu={(e) => { e.preventDefault(); onMenu(habit, e.clientX, e.clientY); }}
      className="habit-row"
      style={{
        display: 'grid',
        gridTemplateColumns: phone ? '1fr' : `${nameCol} 1fr ${statCol}`,
        gap: phone ? 10 : 14,
        alignItems: 'center',
        padding: phone ? '12px 13px' : '11px 16px',
        borderBottom: last ? 'none' : '1px solid var(--line2)',
        borderLeft: `3px solid ${doneToday ? habit.color : 'transparent'}`,
        transition: 'background .18s ease, border-color .25s ease',
      }}
    >
      {/* Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <motion.button
          onClick={() => onOpenDetail(habit)}
          whileHover={animate ? { scale: 1.08, rotate: -4 } : undefined}
          whileTap={animate ? { scale: 0.92 } : undefined}
          title={`${habit.name} — insights`}
          style={{
            width: 32, height: 32, borderRadius: 10, flex: 'none', border: 'none', cursor: 'pointer',
            display: 'grid', placeItems: 'center',
            background: `color-mix(in srgb, ${habit.color} ${doneToday ? 30 : 16}%, transparent)`,
            boxShadow: doneToday ? `0 0 0 1px color-mix(in srgb, ${habit.color} 45%, transparent)` : 'none',
          }}
        >
          <Icon name={(habit.icon as IconName) || 'check'} size={16} color={habit.color} />
        </motion.button>

        <button
          onClick={() => onOpenDetail(habit)}
          style={{
            flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none',
            padding: 0, cursor: 'pointer',
          }}
        >
          <div style={{
            fontSize: 13.5, fontWeight: 700, color: 'var(--tx)', letterSpacing: '-.015em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {habit.name}
          </div>
          <div className="metaline" style={{
            fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            textTransform: habit.cue ? 'none' : 'capitalize',
          }}>
            {habit.cue || `${habit.time_of_day || 'anytime'} · ${habit.frequency || 'daily'}`}
          </div>
        </button>

        {phone && (
          <button
            onClick={(e) => onMenu(habit, e.clientX, e.clientY)}
            className="hov k-squish"
            aria-label={`Actions for ${habit.name}`}
            style={{
              width: 28, height: 28, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center',
              border: '1px solid var(--line2)', background: 'var(--card2)',
            }}
          >
            <Icon name="dots" size={14} color="var(--tx3)" />
          </button>
        )}
      </div>

      {/* The days */}
      {span === 365
        ? <YearStrip days={days} values={values} target={target} today={today} habit={habit} onTick={onTick} animate={animate} />
        : <LinearStrip days={days} values={values} target={target} today={today} habit={habit} span={span} phone={phone} onTick={onTick} animate={animate} />}

      {/* Run, hit rate, and the one control this habit's kind actually needs */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: phone ? 'space-between' : 'flex-end',
        gap: 8, flex: 'none',
      }}>
        <span
          title={`Best run: ${best} days`}
          className="num"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, fontWeight: 800,
            color: run > 0 ? habit.color : 'var(--tx3)',
          }}
        >
          <Icon name="flame" size={12} color={run > 0 ? habit.color : 'var(--tx3)'} />
          {run}d
        </span>

        <span className="num" style={{
          fontSize: 11, fontWeight: 700, color: 'var(--tx3)', minWidth: 30, textAlign: 'right',
        }}>
          {rate}%
        </span>

        {habit.kind === 'count' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <StepButton label="−" onClick={() => onSetValue(habit.id, today, todayVal - 1)} animate={animate} disabled={todayVal <= 0} />
            <span className="num" style={{
              fontSize: 11, fontWeight: 800, minWidth: 34, textAlign: 'center',
              color: todayVal >= target ? habit.color : 'var(--tx2)',
            }}>
              {todayVal}/{target}
            </span>
            <StepButton label="+" onClick={() => onSetValue(habit.id, today, todayVal + 1)} animate={animate} accent={habit.color} />
          </div>
        ) : habit.kind === 'dur' ? (
          <motion.button
            onClick={() => onOpenTimer(habit)}
            whileTap={animate ? { scale: 0.9 } : undefined}
            whileHover={animate ? { scale: 1.05 } : undefined}
            title="Start focus timer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 9,
              border: `1px solid color-mix(in srgb, ${habit.color} 35%, var(--line2))`,
              background: `color-mix(in srgb, ${habit.color} 12%, transparent)`,
              color: habit.color, fontSize: 11, fontWeight: 800, cursor: 'pointer',
            }}
          >
            <Icon name="clock" size={12} color={habit.color} />
            {todayVal > 0 ? `${todayVal}m` : 'Start'}
          </motion.button>
        ) : (
          <motion.button
            onClick={() => onTick(habit.id, today, target)}
            whileTap={animate ? { scale: 0.88 } : undefined}
            whileHover={animate ? { scale: 1.05 } : undefined}
            title={doneToday ? 'Undo today' : 'Mark done today'}
            style={{
              width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', cursor: 'pointer',
              border: doneToday ? 'none' : '1px solid var(--line2)',
              background: doneToday ? habit.color : 'var(--card2)',
            }}
          >
            <Icon name="check" size={14} color={doneToday ? '#0C0F16' : 'var(--tx3)'} />
          </motion.button>
        )}

        {!phone && (
          <button
            onClick={(e) => onMenu(habit, e.clientX, e.clientY)}
            className="hov k-squish habit-row-more"
            aria-label={`Actions for ${habit.name}`}
            style={{
              width: 26, height: 26, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center',
              border: '1px solid var(--line2)', background: 'transparent',
            }}
          >
            <Icon name="dots" size={13} color="var(--tx3)" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

function StepButton({
  label, onClick, animate, accent, disabled,
}: {
  label: string; onClick: () => void; animate: boolean; accent?: string; disabled?: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={animate && !disabled ? { scale: 0.85 } : undefined}
      whileHover={animate && !disabled ? { scale: 1.12 } : undefined}
      style={{
        width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center',
        border: `1px solid ${accent ? `color-mix(in srgb, ${accent} 40%, var(--line2))` : 'var(--line2)'}`,
        background: accent ? `color-mix(in srgb, ${accent} 14%, transparent)` : 'var(--card2)',
        color: accent ?? 'var(--tx2)', fontSize: 13, fontWeight: 800, lineHeight: 1,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </motion.button>
  );
}

function LinearStrip({
  days, values, target, today, habit, span, phone, onTick, animate,
}: {
  days: string[];
  values: Map<string, number> | undefined;
  target: number;
  today: string;
  habit: Habit;
  span: MatrixSpan;
  phone: boolean;
  onTick: (habitId: string, date: string, value?: number) => void;
  animate: boolean;
}) {
  const gap = span === 7 ? 5 : 4;
  const h = phone ? (span === 7 ? 34 : 22) : span === 7 ? 34 : 26;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
      gap,
      minWidth: 0,
    }}>
      {days.map((d) => {
        const v = values?.get(d);
        const on = v !== undefined;
        const isToday = d === today;
        const strength = fillOf(v, target);

        return (
          <motion.button
            key={d}
            onClick={() => onTick(habit.id, d, target)}
            whileTap={animate ? { scale: 0.82 } : undefined}
            whileHover={animate ? { scale: 1.18, zIndex: 2 } : undefined}
            transition={{ type: 'spring', stiffness: 600, damping: 22 }}
            title={`${d}${on ? ` — ${v}` : ' — not done'}`}
            aria-label={`${habit.name} on ${d}`}
            style={{
              height: h,
              borderRadius: span === 7 ? 9 : 6,
              cursor: 'pointer',
              border: isToday
                ? `1.5px solid ${on ? 'transparent' : 'var(--acc)'}`
                : '1px solid transparent',
              background: on
                ? `color-mix(in srgb, ${habit.color} ${Math.round(35 + strength * 65)}%, transparent)`
                : 'var(--card2)',
              boxShadow: on && isToday ? `0 0 0 1.5px ${habit.color}` : 'none',
              color: '#0C0F16',
              fontSize: 10,
              fontWeight: 800,
              display: 'grid',
              placeItems: 'center',
              padding: 0,
            }}
          >
            {span === 7 && on ? (habit.kind === 'dur' ? `${Math.round(v!)}m` : habit.kind === 'count' ? v : '✓') : ''}
          </motion.button>
        );
      })}
    </div>
  );
}

function YearStrip({
  days, values, target, today, habit, onTick, animate,
}: {
  days: string[];
  values: Map<string, number> | undefined;
  target: number;
  today: string;
  habit: Habit;
  onTick: (habitId: string, date: string, value?: number) => void;
  animate: boolean;
}) {
  const weeks = useMemo(() => toWeeks(days), [days]);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
      gap: 2,
      minWidth: 0,
    }}>
      {weeks.map((w, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gap: 2 }}>
          {w.map((d, di) => {
            if (!d) return <span key={di} style={{ height: 9 }} />;
            const v = values?.get(d);
            const on = v !== undefined;
            const strength = fillOf(v, target);
            return (
              <motion.button
                key={d}
                onClick={() => onTick(habit.id, d, target)}
                whileHover={animate ? { scale: 2.2, zIndex: 3 } : undefined}
                whileTap={animate ? { scale: 1.4 } : undefined}
                transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                title={`${d}${on ? ` — ${v}` : ''}`}
                style={{
                  height: 9, borderRadius: 2, padding: 0, cursor: 'pointer',
                  border: d === today ? `1px solid ${habit.color}` : 'none',
                  background: on
                    ? `color-mix(in srgb, ${habit.color} ${Math.round(35 + strength * 65)}%, transparent)`
                    : 'var(--card2)',
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
