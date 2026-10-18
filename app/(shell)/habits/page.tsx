'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { ContextMenu, type CtxItem } from '@/components/ContextMenu';
import { HabitDetail, HabitEditor, HabitTimer, TIMES, habitIcon, inkFor, type HabitDraft } from '@/components/habits/HabitSheets';
import { toast } from '@/lib/toast';
import { playCelebration } from '@/lib/audio';
import {
  readFrozenDays, useHabitActions, useHabits, useStreakFreezes, useTicks,
  HABIT_PRESETS, type Habit, type HabitPreset, type Tick,
} from '@/lib/habits';
import {
  addDays, bestStreak, currentStreak, dayKey, dayScore, hitRate, isDueOn, keptThisWeek, parseDay, progress, scheduleLabel, ticksByDay, weekStart,
} from '@/lib/habitSchedule';
import './habits.css';

/** A year of ticks in one query, so streaks, history, and heatmap share one cache. */
const TICK_WINDOW = 365;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type Row = {
  h: Habit;
  p: ReturnType<typeof progress>;
  due: boolean;
  weekly: boolean;
  weekDone: boolean;
  done: boolean;
  streak: number;
  best: number;
  rate30: number;
  last7: { key: string; d: Date; done: boolean; part: boolean; due: boolean; isToday: boolean }[];
  yesterdayDone: boolean;
  atRisk: boolean;
};

const hueStyle = (color: string) => ({ '--h': color, '--hink': inkFor(color) }) as React.CSSProperties;

export default function HabitsPage() {
  // Re-evaluate local date if the day turns over while the tab stays open.
  const [, redraw] = useState(0);
  useEffect(() => {
    const t = setInterval(() => redraw((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const todayKey = dayKey(new Date());
  const today = parseDay(todayKey);
  const yesterdayKey = dayKey(addDays(today, -1));

  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey);
  const activeDateKey = selectedDateKey > todayKey ? todayKey : selectedDateKey;
  const activeDate = parseDay(activeDateKey);
  const isViewingToday = activeDateKey === todayKey;

  const { data: habits = [], isPending } = useHabits();
  const ticksQuery = useTicks(TICK_WINDOW);
  const ticks: Tick[] = ticksQuery.data ?? [];
  const A = useHabitActions(TICK_WINDOW);
  const { freezes, useFreeze: spendFreeze } = useStreakFreezes();
  const frozen = useMemo(() => new Set(readFrozenDays()), [freezes]); // eslint-disable-line react-hooks/exhaustive-deps

  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [timingId, setTimingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [consistencyView, setConsistencyView] = useState<'14d' | '6m'>('14d');
  const [showOff, setShowOff] = useState(false);

  const rows: Row[] = useMemo(() => {
    const day = parseDay(todayKey);
    const focusDay = parseDay(activeDateKey);
    const yesterday = addDays(day, -1);

    return habits.map((h) => {
      const days = ticksByDay(ticks, h.id);
      const p = progress(h, days.get(activeDateKey));
      const weekly = h.frequency === 'weekly';
      const weekDone = weekly && keptThisWeek(h, ticks, focusDay);
      const streak = currentStreak(h, ticks, day, frozen);
      const best = bestStreak(h, ticks, day, frozen);
      const rate30 = hitRate(h, ticks, day, 30).pct;
      const yesterdayDone = progress(h, days.get(yesterdayKey)).done;
      const atRisk =
        !weekly &&
        !yesterdayDone &&
        isDueOn(h, yesterday) &&
        !frozen.has(yesterdayKey) &&
        currentStreak(h, ticks, day, new Set([...frozen, yesterdayKey])) > streak;

      return {
        h,
        p,
        weekly,
        weekDone,
        streak,
        best,
        rate30,
        yesterdayDone,
        atRisk,
        due: weekly || isDueOn(h, focusDay),
        done: p.done || weekDone,
        last7: Array.from({ length: 7 }, (_, i) => {
          const d = addDays(day, i - 6);
          const k = dayKey(d);
          const dp = progress(h, days.get(k));
          return {
            key: k,
            d,
            done: dp.done,
            part: !dp.done && dp.value > 0,
            due: weekly || isDueOn(h, d),
            isToday: k === todayKey,
          };
        }),
      };
    });
  }, [habits, ticks, todayKey, activeDateKey, yesterdayKey, frozen]);

  const dueRows = rows.filter((r) => r.due);
  const offRows = rows.filter((r) => !r.due);
  const doneCount = dueRows.filter((r) => r.done).length;
  const topStreak = rows.reduce((m, r) => Math.max(m, r.streak), 0);
  const avgRate30 = rows.length ? Math.round(rows.reduce((sum, r) => sum + r.rate30, 0) / rows.length) : 0;
  const atRisk = rows.filter((r) => r.atRisk);

  const groups = useMemo(() => {
    const built = TIMES.map((t) => ({
      ...t,
      items: dueRows.filter((r) => (r.h.time_of_day ?? 'anytime') === t.id),
    })).filter((g) => g.items.length > 0);
    return built;
  }, [dueRows]);

  const showGroupHeaders = groups.length > 1 || (groups.length === 1 && groups[0].id !== 'anytime');

  /** Current week (Monday first) and 26-week heatmap. */
  const { week, heat, activeDays } = useMemo(() => {
    const day = parseDay(todayKey);
    const byDay = new Map<string, Tick[]>();
    for (const t of ticks) {
      const list = byDay.get(t.on_date);
      if (list) list.push(t);
      else byDay.set(t.on_date, [t]);
    }
    const score = (d: Date) => dayScore(habits, byDay.get(dayKey(d)) ?? [], d);
    const monday = weekStart(day);
    const start = addDays(monday, -25 * 7);
    let countActive = 0;

    const cells = Array.from({ length: 26 * 7 }, (_, i) => {
      const d = addDays(start, i);
      if (d > day) return null;
      const s = score(d);
      if (s.done > 0) countActive++;
      return {
        key: dayKey(d),
        d,
        level: !s.due || !s.done ? 0 : s.done === s.due ? 4 : Math.ceil((s.done / s.due) * 3),
        ...s,
      };
    });

    return {
      week: Array.from({ length: 7 }, (_, i) => {
        const d = addDays(monday, i);
        const k = dayKey(d);
        return { d, key: k, future: d > day, ...score(d) };
      }),
      heat: cells,
      activeDays: countActive,
    };
  }, [habits, ticks, todayKey]);

  /* ---- mutations */
  const setValue = (h: Habit, date: string, value: number) =>
    A.tick.mutate({ habitId: h.id, date, value, mode: 'set' });

  const setDay = (h: Habit, date: string, done: boolean) => {
    if (h.kind === 'bin') {
      const has = ticks.some((t) => t.habit_id === h.id && t.on_date === date);
      if (has !== done) A.tick.mutate({ habitId: h.id, date, value: 1 });
      return;
    }
    setValue(h, date, done ? Math.max(1, h.target ?? 1) : 0);
  };

  const press = (r: Row) => {
    if (r.h.kind === 'dur' && isViewingToday) {
      setTimingId(r.h.id);
      return;
    }
    if (r.h.kind === 'count') {
      const nextVal = r.p.done ? 0 : r.p.value + 1;
      setValue(r.h, activeDateKey, nextVal);
      return;
    }
    if (r.weekly && r.weekDone && !r.p.done) {
      toast(`${r.h.name} is already kept this week`, undefined, { icon: 'check' });
      return;
    }
    setDay(r.h, activeDateKey, !r.p.done);
  };

  const keepAll = () => {
    const open = dueRows.filter((r) => !r.done);
    if (!open.length) {
      toast('Everything due is already done', undefined, { icon: 'check' });
      return;
    }
    open.forEach((r) => setDay(r.h, activeDateKey, true));
    toast(
      `${open.length} ${open.length === 1 ? 'habit' : 'habits'} marked done`,
      () =>
        open.forEach((r) => {
          if (r.h.kind === 'bin') A.tick.mutate({ habitId: r.h.id, date: activeDateKey, value: 1 });
          else setValue(r.h, activeDateKey, r.p.value);
        }),
      { tone: 'success', icon: 'check' },
    );
  };

  const protect = () => {
    if (spendFreeze(yesterdayKey)) {
      toast(
        `Yesterday forgiven for ${atRisk.length} ${atRisk.length === 1 ? 'streak' : 'streaks'}`,
        undefined,
        { icon: 'lock' },
      );
    }
  };

  const createFrom = (p: HabitPreset) => {
    A.create.mutate({
      id: crypto.randomUUID(),
      name: p.name,
      short_name: p.name.split(/\s+/)[0],
      color: p.color,
      kind: p.kind,
      target: p.kind === 'bin' ? 1 : p.target,
      target_unit: p.target_unit,
      category: p.category,
      frequency: 'daily',
      time_of_day: p.time_of_day,
      icon: p.icon,
      cue: p.cue,
      show_in_home: true,
    });
    toast(`${p.name} added`, undefined, { tone: 'success', icon: 'check' });
  };

  const saveHabit = (d: HabitDraft) => {
    if (editing === 'new') {
      A.create.mutate(d);
      toast(`${d.name} added`, undefined, { tone: 'success', icon: 'check' });
    } else if (editing) {
      const { id, ...patch } = d;
      A.edit.mutate({ id, patch });
      toast('Habit updated', undefined, { tone: 'success', icon: 'check' });
    }
    setEditing(null);
  };

  const menuItems = (r: Row): CtxItem[] => [
    {
      label: r.p.done ? `Undo ${isViewingToday ? 'today' : activeDateKey}` : `Mark done ${isViewingToday ? 'today' : activeDateKey}`,
      icon: r.p.done ? 'undo' : 'check',
      run: () => setDay(r.h, activeDateKey, !r.p.done),
    },
    ...(isViewingToday
      ? [
          {
            label: r.yesterdayDone ? 'Undo yesterday' : 'Mark done yesterday',
            icon: 'cal' as const,
            run: () => setDay(r.h, yesterdayKey, !r.yesterdayDone),
          },
        ]
      : []),
    ...(r.h.kind === 'dur' ? [{ label: 'Open focus timer', icon: 'play' as const, run: () => setTimingId(r.h.id) }] : []),
    { label: 'History & notes', icon: 'eye', run: () => setDetailId(r.h.id) },
    { label: 'Edit habit', icon: 'edit', run: () => setEditing(r.h) },
    {
      label: 'Duplicate',
      icon: 'copy',
      disabled: !!r.h.challenge_id,
      hint: 'Challenge habits follow the challenge',
      run: () => {
        A.create.mutate({ ...r.h, id: crypto.randomUUID(), name: `${r.h.name} copy`, challenge_id: null });
        toast(`Copied ${r.h.name}`, undefined, { icon: 'copy' });
      },
    },
    {
      label: 'Archive',
      icon: 'archive',
      danger: true,
      disabled: !!r.h.challenge_id,
      hint: 'Leave the challenge to remove it',
      run: () => A.removeWithUndo(r.h),
    },
  ];

  // Celebrate when completing the final habit due today.
  const lastDone = useRef<number | null>(null);
  const loaded = !isPending && !ticksQuery.isPending;
  useEffect(() => {
    if (!loaded || !isViewingToday) return;
    const before = lastDone.current;
    lastDone.current = doneCount;
    if (before !== null && before < doneCount && dueRows.length > 0 && doneCount === dueRows.length) {
      playCelebration();
      toast('All rituals completed for today', undefined, { tone: 'success', icon: 'flame' });
    }
  }, [loaded, isViewingToday, doneCount, dueRows.length]);

  const activeDateLabel = isViewingToday
    ? today.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    : activeDateKey === yesterdayKey
      ? `Yesterday · ${activeDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
      : activeDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const headline = !habits.length
    ? isPending
      ? 'Loading rituals…'
      : 'Build your daily rhythm'
    : !dueRows.length
      ? 'Rest day — nothing scheduled'
      : doneCount === dueRows.length
        ? isViewingToday
          ? 'All rituals complete for today'
          : `All ${dueRows.length} completed`
        : `${doneCount} of ${dueRows.length} completed`;

  const detail = rows.find((r) => r.h.id === detailId) ?? null;
  const timing = rows.find((r) => r.h.id === timingId) ?? null;
  const menuRow = rows.find((r) => r.h.id === menu?.id) ?? null;
  const matrixDays = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)), [todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const streakRows = useMemo(() => [...rows].sort((a, b) => b.streak - a.streak || b.rate30 - a.rate30), [rows]);

  const renderHabitRow = (r: Row) => {
    const scheduleText = r.h.frequency && r.h.frequency !== 'daily' ? scheduleLabel(r.h) : '';
    const progressText =
      r.h.kind === 'count'
        ? `${r.p.value}/${r.p.target} ${r.h.target_unit ?? 'times'}`
        : r.h.kind === 'dur'
          ? `${r.p.value}/${r.p.target} min`
          : r.weekly
            ? r.weekDone
              ? 'Kept this week'
              : 'Once a week'
            : '';

    const metaParts = [progressText, r.h.cue, scheduleText].filter(Boolean);

    return (
      <li
        key={r.h.id}
        className={'hab-row' + (r.done ? ' is-done' : '') + (r.due ? '' : ' is-off')}
        style={hueStyle(r.h.color)}
      >
        <button
          type="button"
          className={'hab-check is-' + r.h.kind}
          aria-pressed={r.done}
          onClick={() => press(r)}
          aria-label={
            r.h.kind === 'dur' && isViewingToday
              ? `Start timer for ${r.h.name}`
              : r.h.kind === 'count'
                ? `Increment ${r.h.name}, ${r.p.value} of ${r.p.target}`
                : `${r.h.name}, ${r.done ? 'completed' : 'mark complete'}`
          }
        >
          {r.done ? (
            <Icon name="check" size={18} />
          ) : r.h.kind === 'count' && r.p.value > 0 ? (
            <span className="hab-check-num">{r.p.value}</span>
          ) : r.h.kind === 'dur' ? (
            <Icon name="play" size={16} />
          ) : (
            <Icon name={habitIcon(r.h)} size={17} />
          )}
        </button>

        <button type="button" className="hab-main" onClick={() => setDetailId(r.h.id)}>
          <div className="hab-title-row">
            <b className="hab-name">{r.h.name}</b>
            {r.h.challenge_id && (
              <span className="hab-chip is-challenge">
                <Icon name="trophy" size={11} />
                Challenge
              </span>
            )}
          </div>
          {metaParts.length > 0 && <span className="hab-meta">{metaParts.join(' · ')}</span>}
          {r.h.kind !== 'bin' && r.p.value > 0 && !r.done && (
            <div className="hab-row-bar">
              <AsciiBar value={r.p.pct} hue={r.h.color} showValue={false} shape="slim" label={`${r.h.name} progress`} />
            </div>
          )}
        </button>

        <div className="hab-trail">
          {r.h.kind === 'count' && (
            <span className="hab-stepper" role="group" aria-label={`Adjust count for ${r.h.name}`}>
              <button
                type="button"
                aria-label={`Decrease ${r.h.name}`}
                disabled={!r.p.value}
                onClick={() => setValue(r.h, activeDateKey, Math.max(0, r.p.value - 1))}
              >
                −
              </button>
              <button
                type="button"
                aria-label={`Increase ${r.h.name}`}
                onClick={() => setValue(r.h, activeDateKey, r.p.value + 1)}
              >
                +
              </button>
            </span>
          )}

          {r.h.kind === 'dur' && isViewingToday && (
            <button
              type="button"
              className="hab-timer-btn"
              onClick={() => setTimingId(r.h.id)}
              aria-label={`Open timer for ${r.h.name}`}
            >
              <Icon name="clock" size={13} />
              <span>{r.p.value > 0 ? `${r.p.value}m` : `${r.p.target}m`}</span>
            </button>
          )}

          <div className="hab-week-dots" role="group" aria-label={`Last 7 days for ${r.h.name}`}>
            {r.last7.map((d) => {
              const cls = d.done ? 'is-done' : d.part ? 'is-part' : d.due ? '' : 'is-off';
              const label = `${r.h.name}, ${d.d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${d.done ? 'completed' : 'not completed'}`;
              return (
                <button
                  key={d.key}
                  type="button"
                  className={'hab-dot-btn ' + cls + (d.isToday ? ' is-today' : '')}
                  aria-pressed={d.done}
                  aria-label={label}
                  title={`${WEEKDAY_SHORT[d.d.getDay()]} · ${d.done ? 'Done' : 'Tap to toggle'}`}
                  onClick={() => setDay(r.h, d.key, !d.done)}
                >
                  <span aria-hidden="true">{WEEKDAY_LETTER[d.d.getDay()]}</span>
                </button>
              );
            })}
          </div>

          <span className={'hab-streak-badge' + (r.streak > 0 ? ' is-active' : '')} title={`Current streak: ${r.streak}`}>
            <Icon name="flame" size={12} />
            <b>{r.streak}</b>
          </span>
        </div>

        <button
          type="button"
          className="hab-more"
          aria-label={`Options for ${r.h.name}`}
          onClick={(e) => {
            const b = e.currentTarget.getBoundingClientRect();
            setMenu({ x: b.left - 170, y: b.bottom + 4, id: r.h.id });
          }}
        >
          <Icon name="dots" size={16} />
        </button>
      </li>
    );
  };

  return (
    <div className="hab">
      <header className="hab-header">
        <div className="hab-header-top">
          <div className="hab-header-copy">
            <div className="hab-eyebrow">
              <span>{activeDateLabel}</span>
              {!isViewingToday && (
                <button type="button" className="hab-today-reset" onClick={() => setSelectedDateKey(todayKey)}>
                  Back to today
                </button>
              )}
            </div>
            <h1>{headline}</h1>
            {habits.length > 0 && (
              <div className="hab-kpis">
                <span>
                  <Icon name="flame" size={13} />
                  <b>{topStreak}d</b> top streak
                </span>
                <span>
                  <b>{avgRate30}%</b> 30d consistency
                </span>
                <span>
                  <Icon name="lock" size={12} />
                  <b>{freezes}</b> {freezes === 1 ? 'freeze' : 'freezes'}
                </span>
              </div>
            )}
          </div>

          <div className="hab-header-actions">
            {dueRows.length > 0 && doneCount < dueRows.length && (
              <button type="button" className="hab-secondary" onClick={keepAll}>
                <Icon name="check" size={15} />
                Mark all done
              </button>
            )}
            <button type="button" className="hab-primary" onClick={() => setEditing('new')}>
              <Icon name="plus" size={16} />
              New habit
            </button>
          </div>
        </div>

        {dueRows.length > 0 && (
          <div className="hab-header-bar">
            <AsciiBar
              value={(doneCount / dueRows.length) * 100}
              hue="var(--hab)"
              showValue={false}
              shape="slim"
              label={`${doneCount} of ${dueRows.length} habits completed`}
            />
          </div>
        )}

        {habits.length > 0 && (
          <div className="hab-weekstrip" role="group" aria-label="This week's rhythm">
            {week.map((w) => {
              const isSelected = w.key === activeDateKey;
              const isToday = w.key === todayKey;
              const isPerfect = w.due > 0 && w.done === w.due;
              const pct = w.due > 0 ? Math.round((w.done / w.due) * 100) : 0;
              return (
                <button
                  key={w.key}
                  type="button"
                  disabled={w.future}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedDateKey(w.key)}
                  className={
                    'hab-weekday' +
                    (isSelected ? ' is-selected' : '') +
                    (isToday ? ' is-today' : '') +
                    (w.future ? ' is-future' : '') +
                    (isPerfect ? ' is-perfect' : '')
                  }
                  aria-label={`${w.d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: ${w.future ? 'upcoming' : `${w.done} of ${w.due} completed`}`}
                >
                  <span className="hab-weekday-name">{WEEKDAY_SHORT[w.d.getDay()]}</span>
                  <strong className="hab-weekday-num">{w.d.getDate()}</strong>
                  <span className="hab-weekday-status" aria-hidden="true">
                    {w.future ? (
                      <i className="hab-pip is-future" />
                    ) : isPerfect ? (
                      <i className="hab-pip is-perfect" />
                    ) : w.done > 0 ? (
                      <i className="hab-pip is-partial" style={{ '--pct': `${pct}%` } as React.CSSProperties} />
                    ) : (
                      <i className="hab-pip" />
                    )}
                    <small>{w.future ? '–' : `${w.done}/${w.due}`}</small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      {!isPending && habits.length === 0 ? (
        <section className="hab-card hab-empty" aria-label="Start a habit">
          <span className="hab-empty-mark">
            <Icon name="habit" size={24} />
          </span>
          <h2>Start with one small ritual</h2>
          <p>Pick a starter below or create your own. Schedule, cue, and target sync across all your devices.</p>
          <div className="hab-starters">
            {HABIT_PRESETS.slice(0, 8).map((p) => (
              <button key={p.id} type="button" style={hueStyle(p.color)} onClick={() => createFrom(p)}>
                <i>
                  <Icon name={habitIcon({ icon: p.icon, kind: p.kind })} size={17} />
                </i>
                <span>
                  <b>{p.name}</b>
                  <small>
                    {p.kind === 'dur' ? `${p.target} mins` : p.kind === 'count' ? `${p.target} ${p.target_unit}` : 'Daily check-in'}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="hab-link" onClick={() => setEditing('new')}>
            <Icon name="plus" size={14} />
            Create custom habit
          </button>
        </section>
      ) : (
        <div className="hab-grid">
          <div className="hab-main-col">
            {atRisk.length > 0 && (
              <section className="hab-risk" aria-label="Streak protection">
                <div className="hab-risk-copy">
                  <b>Protect your streak from yesterday</b>
                  <p>
                    {atRisk.map((r) => r.h.name).join(', ')}{' '}
                    {atRisk.length === 1 ? 'missed yesterday.' : 'missed yesterday.'} Spend 1 freeze to keep the run alive.
                  </p>
                </div>
                <button type="button" onClick={protect} disabled={freezes <= 0}>
                  <Icon name="lock" size={13} />
                  {freezes > 0 ? `Use freeze (${freezes} left)` : 'No freezes left'}
                </button>
              </section>
            )}

            <section className="hab-card" aria-label="Daily rituals">
              <header className="hab-card-head">
                <div>
                  <h2>{isViewingToday ? 'Today’s rituals' : `Rituals for ${activeDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}</h2>
                  <p>
                    {dueRows.length
                      ? 'Tap the circle to log, or tap any day in the 7-day track to fix a past check-in.'
                      : 'No rituals scheduled for this day.'}
                  </p>
                </div>
              </header>

              {showGroupHeaders ? (
                groups.map((grp) => (
                  <div key={grp.id} className="hab-group">
                    <h3 className="hab-group-title">
                      <Icon name={grp.icon} size={13} />
                      <span>{grp.label}</span>
                      <small>
                        {grp.items.filter((r) => r.done).length}/{grp.items.length}
                      </small>
                    </h3>
                    <ul className="hab-list">{grp.items.map(renderHabitRow)}</ul>
                  </div>
                ))
              ) : (
                <ul className="hab-list">{dueRows.map(renderHabitRow)}</ul>
              )}

              {offRows.length > 0 && (
                <div className="hab-off-section">
                  <button
                    type="button"
                    className="hab-off-toggle"
                    aria-expanded={showOff}
                    onClick={() => setShowOff((v) => !v)}
                  >
                    <Icon name={showOff ? 'chevronUp' : 'chevronDown'} size={14} />
                    <span>
                      {offRows.length} resting {isViewingToday ? 'today' : 'this day'}
                    </span>
                  </button>
                  {showOff && <ul className="hab-list">{offRows.map(renderHabitRow)}</ul>}
                </div>
              )}
            </section>
          </div>

          <aside className="hab-side" aria-label="Streaks and consistency">
            <section className="hab-card" aria-label="Streak momentum">
              <header className="hab-card-head">
                <div>
                  <h2>Streaks</h2>
                  <p>Off-days never break a scheduled streak.</p>
                </div>
                <span className="hab-freeze-pill" title="Available streak freezes">
                  <Icon name="lock" size={12} />
                  {freezes}
                </span>
              </header>

              <ul className="hab-streaks">
                {streakRows.map((r) => {
                  const unit = r.weekly ? 'wk' : 'd';
                  return (
                    <li key={r.h.id} style={hueStyle(r.h.color)} onClick={() => setDetailId(r.h.id)}>
                      <span className="hab-streak-icon" aria-hidden="true">
                        <Icon name={habitIcon(r.h)} size={15} />
                      </span>
                      <div className="hab-streak-info">
                        <b>{r.h.name}</b>
                        <small>
                          Best {r.best}
                          {unit} · {r.rate30}% last 30d
                        </small>
                      </div>
                      <em className={r.streak > 0 ? 'is-hot' : ''}>
                        {r.streak}
                        <small>{unit}</small>
                      </em>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="hab-card" aria-label="Consistency">
              <header className="hab-card-head">
                <div>
                  <h2>Consistency</h2>
                  <p>
                    {consistencyView === '14d'
                      ? 'Tap any square to toggle that day.'
                      : `${activeDays} active ${activeDays === 1 ? 'day' : 'days'} in the last 26 weeks.`}
                  </p>
                </div>
                <div className="hab-seg" role="radiogroup" aria-label="Consistency range">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={consistencyView === '14d'}
                    onClick={() => setConsistencyView('14d')}
                  >
                    14d
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={consistencyView === '6m'}
                    onClick={() => setConsistencyView('6m')}
                  >
                    6m
                  </button>
                </div>
              </header>

              {consistencyView === '14d' ? (
                <div className="hab-table-wrap">
                  <table className="hab-table">
                    <thead>
                      <tr>
                        <th scope="col">
                          <span className="sr-only">Habit</span>
                        </th>
                        {matrixDays.map((d) => {
                          const k = dayKey(d);
                          return (
                            <th key={k} scope="col" className={k === todayKey ? 'is-today' : undefined}>
                              <span>{WEEKDAY_LETTER[d.getDay()]}</span>
                              <b>{d.getDate()}</b>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const days = ticksByDay(ticks, r.h.id);
                        return (
                          <tr key={r.h.id} style={hueStyle(r.h.color)}>
                            <th scope="row" title={r.h.name}>
                              <i />
                              <span>{r.h.short_name || r.h.name}</span>
                            </th>
                            {matrixDays.map((d) => {
                              const key = dayKey(d);
                              const p = progress(r.h, days.get(key));
                              const due = r.weekly || isDueOn(r.h, d);
                              const cls = p.done
                                ? 'is-done'
                                : p.value > 0
                                  ? 'is-part'
                                  : frozen.has(key)
                                    ? 'is-frozen'
                                    : !due
                                      ? 'is-off'
                                      : key === todayKey
                                        ? 'is-open'
                                        : '';
                              return (
                                <td key={key}>
                                  <button
                                    type="button"
                                    className={'hab-cell ' + cls}
                                    aria-pressed={p.done}
                                    onClick={() => setDay(r.h, key, !p.done)}
                                    aria-label={`${r.h.name}, ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${p.done ? 'done' : 'not done'}`}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <>
                  <div className="hab-heat" role="img" aria-label={`Heatmap of the last 26 weeks, ${activeDays} active days`}>
                    {heat.map((c, i) => (
                      <i
                        key={c?.key ?? `f${i}`}
                        data-l={c?.level ?? 0}
                        className={c ? undefined : 'is-future'}
                        title={
                          c
                            ? `${c.d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${c.done}/${c.due}`
                            : undefined
                        }
                      />
                    ))}
                  </div>
                  <div className="hab-legend" aria-hidden="true">
                    Less
                    <i data-l="0" />
                    <i data-l="1" />
                    <i data-l="2" />
                    <i data-l="3" />
                    <i data-l="4" />
                    More
                  </div>
                </>
              )}
            </section>
          </aside>
        </div>
      )}

      {menu && menuRow && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          kind="habit"
          label={menuRow.h.name}
          items={menuItems(menuRow)}
          onClose={() => setMenu(null)}
        />
      )}

      {editing && (
        <HabitEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={saveHabit}
          onArchive={
            editing !== 'new' && !editing.challenge_id
              ? () => {
                  A.removeWithUndo(editing);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}

      {detail && (
        <HabitDetail
          habit={detail.h}
          ticks={ticks}
          today={today}
          frozen={frozen}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setDetailId(null);
            setEditing(detail.h);
          }}
          onArchive={
            detail.h.challenge_id
              ? undefined
              : () => {
                  A.removeWithUndo(detail.h);
                  setDetailId(null);
                }
          }
          onSetDay={(date, done) => setDay(detail.h, date, done)}
        />
      )}

      {timing && (
        <HabitTimer
          habit={timing.h}
          minutesToday={timing.p.value}
          onClose={() => setTimingId(null)}
          onLog={(minutes) => {
            setValue(timing.h, todayKey, timing.p.value + minutes);
            toast(
              `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} logged for ${timing.h.name}`,
              () => setValue(timing.h, todayKey, timing.p.value),
              { tone: 'success', icon: 'clock' },
            );
          }}
        />
      )}
    </div>
  );
}
