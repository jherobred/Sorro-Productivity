'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SelfViews } from '@/components/SelfViews';
import '@/app/self-workspace.css';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { ContextMenu, type CtxItem } from '@/components/ContextMenu';
import { HabitDetail, HabitEditor, HabitTimer, TIMES, habitIcon, inkFor, type HabitDraft } from '@/components/habits/HabitSheets';
import { toast } from '@/lib/toast';
import { playCelebration } from '@/lib/audio';
import {
  calculateHabitGamification, readFrozenDays, useHabitActions, useHabits, useStreakFreezes, useTicks,
  HABIT_MILESTONES, HABIT_PRESETS, type Habit, type HabitPreset, type Tick,
} from '@/lib/habits';
import {
  addDays, currentStreak, dayKey, dayScore, hitRate, isDueOn, keptThisWeek, parseDay, progress, scheduleLabel, ticksByDay, weekStart,
} from '@/lib/habitSchedule';
import './habits.css';

/** A year of ticks in one query, so streaks, the history and the heatmap share one cache. */
const TICK_WINDOW = 365;
const INK = '#3a0b0b';
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type Row = {
  h: Habit;
  p: ReturnType<typeof progress>;
  due: boolean;
  weekly: boolean;
  weekDone: boolean;
  done: boolean;
  streak: number;
  last7: { key: string; done: boolean; due: boolean }[];
  yesterdayDone: boolean;
  atRisk: boolean;
};

const hueStyle = (color: string) => ({ '--h': color, '--hink': inkFor(color) }) as React.CSSProperties;

export default function HabitsPage() {
  const [detailed, setDetailed] = useState(false);
  // The day can turn over while the page is open.
  const [, redraw] = useState(0);
  useEffect(() => {
    const t = setInterval(() => redraw((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const todayKey = dayKey(new Date());
  const today = parseDay(todayKey);
  const yesterdayKey = dayKey(addDays(today, -1));

  const { data: habits = [], isPending } = useHabits();
  const ticksQuery = useTicks(TICK_WINDOW);
  const ticks: Tick[] = ticksQuery.data ?? [];
  const A = useHabitActions(TICK_WINDOW);
  const { freezes, useFreeze: spendFreeze } = useStreakFreezes();
  // Spending a freeze is the only thing that adds a frozen day, and it changes the count.
  const frozen = useMemo(() => new Set(readFrozenDays()), [freezes]); // eslint-disable-line react-hooks/exhaustive-deps

  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [timingId, setTimingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [span, setSpan] = useState<7 | 30>(7);
  const [showOff, setShowOff] = useState(false);

  const rows: Row[] = useMemo(() => {
    const day = parseDay(todayKey);
    const yesterday = addDays(day, -1);
    return habits.map((h) => {
      const days = ticksByDay(ticks, h.id);
      const p = progress(h, days.get(todayKey));
      const weekly = h.frequency === 'weekly';
      const weekDone = weekly && keptThisWeek(h, ticks, day);
      const streak = currentStreak(h, ticks, day, frozen);
      const yesterdayDone = progress(h, days.get(yesterdayKey)).done;
      const atRisk = !weekly && !yesterdayDone && isDueOn(h, yesterday) && !frozen.has(yesterdayKey)
        && currentStreak(h, ticks, day, new Set([...frozen, yesterdayKey])) > streak;
      return {
        h, p, weekly, weekDone, streak, yesterdayDone, atRisk,
        due: weekly || isDueOn(h, day),
        done: p.done || weekDone,
        last7: Array.from({ length: 7 }, (_, i) => {
          const d = addDays(day, i - 6);
          return { key: dayKey(d), done: progress(h, days.get(dayKey(d))).done, due: weekly || isDueOn(h, d) };
        }),
      };
    });
  }, [habits, ticks, todayKey, yesterdayKey, frozen]);

  const dueRows = rows.filter((r) => r.due);
  const offRows = rows.filter((r) => !r.due);
  const doneCount = dueRows.filter((r) => r.done).length;
  const topStreak = rows.reduce((m, r) => Math.max(m, r.streak), 0);
  const atRisk = rows.filter((r) => r.atRisk);
  const groups = TIMES.map((t) => ({ ...t, items: dueRows.filter((r) => (r.h.time_of_day ?? 'anytime') === t.id) })).filter((g) => g.items.length);
  const g = useMemo(() => calculateHabitGamification(habits, ticks), [habits, ticks]);

  /** This week, Monday first, and the last 26 weeks as a heatmap. */
  const { week, heat, active } = useMemo(() => {
    const day = parseDay(todayKey);
    const byDay = new Map<string, Tick[]>();
    for (const t of ticks) byDay.set(t.on_date, [...(byDay.get(t.on_date) ?? []), t]);
    const score = (d: Date) => dayScore(habits, byDay.get(dayKey(d)) ?? [], d);
    const monday = weekStart(day);
    const start = addDays(monday, -25 * 7);
    let activeDays = 0;
    const cells = Array.from({ length: 26 * 7 }, (_, i) => {
      const d = addDays(start, i);
      if (d > day) return null;
      const s = score(d);
      if (s.done) activeDays++;
      return { key: dayKey(d), d, level: !s.due || !s.done ? 0 : s.done === s.due ? 4 : Math.ceil((s.done / s.due) * 3), ...s };
    });
    return {
      week: Array.from({ length: 7 }, (_, i) => { const d = addDays(monday, i); return { d, key: dayKey(d), future: d > day, ...score(d) }; }),
      heat: cells,
      active: activeDays,
    };
  }, [habits, ticks, todayKey]);

  /* ---- writing ticks */
  const setValue = (h: Habit, date: string, value: number) => A.tick.mutate({ habitId: h.id, date, value, mode: 'set' });
  /** Makes a day kept or not, whatever kind of habit it is. */
  const setDay = (h: Habit, date: string, done: boolean) => {
    if (h.kind === 'bin') {
      const has = ticks.some((t) => t.habit_id === h.id && t.on_date === date);
      if (has !== done) A.tick.mutate({ habitId: h.id, date, value: 1 });
      return;
    }
    setValue(h, date, done ? Math.max(1, h.target ?? 1) : 0);
  };

  const press = (r: Row) => {
    if (r.h.kind === 'dur') { setTimingId(r.h.id); return; }
    if (r.h.kind === 'count') { setValue(r.h, todayKey, r.p.value + 1); return; }
    if (r.weekly && r.weekDone && !r.p.done) { toast(`${r.h.name} is already done this week`, undefined, { icon: 'check' }); return; }
    A.tick.mutate({ habitId: r.h.id, date: todayKey, value: 1 });
  };

  const keepAll = () => {
    const open = dueRows.filter((r) => !r.done);
    if (!open.length) { toast('Everything due today is done', undefined, { icon: 'check' }); return; }
    open.forEach((r) => setDay(r.h, todayKey, true));
    toast(`${open.length} ${open.length === 1 ? 'habit' : 'habits'} marked done`, () => open.forEach((r) => {
      if (r.h.kind === 'bin') A.tick.mutate({ habitId: r.h.id, date: todayKey, value: 1 });
      else setValue(r.h, todayKey, r.p.value);
    }), { tone: 'success', icon: 'check' });
  };

  const protect = () => {
    if (spendFreeze(yesterdayKey)) toast(`Yesterday is forgiven for ${atRisk.length} ${atRisk.length === 1 ? 'streak' : 'streaks'}`, undefined, { icon: 'lock' });
  };

  const createFrom = (p: HabitPreset) => {
    A.create.mutate({
      id: crypto.randomUUID(), name: p.name, short_name: p.name.split(/\s+/)[0], color: p.color, kind: p.kind, target: p.kind === 'bin' ? 1 : p.target,
      target_unit: p.target_unit, category: p.category, frequency: 'daily', time_of_day: p.time_of_day, icon: p.icon, cue: p.cue, show_in_home: true,
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
      toast('Habit saved', undefined, { tone: 'success', icon: 'check' });
    }
    setEditing(null);
  };

  const menuItems = (r: Row): CtxItem[] => [
    { label: r.p.done ? 'Undo today' : 'Mark done today', icon: r.p.done ? 'undo' : 'check', run: () => setDay(r.h, todayKey, !r.p.done) },
    { label: r.yesterdayDone ? 'Undo yesterday' : 'I did it yesterday', icon: 'cal', run: () => setDay(r.h, yesterdayKey, !r.yesterdayDone) },
    ...(r.h.kind === 'dur' ? [{ label: 'Start the timer', icon: 'play' as const, run: () => setTimingId(r.h.id) }] : []),
    { label: 'Details and notes', icon: 'eye', run: () => setDetailId(r.h.id) },
    { label: 'Edit', icon: 'edit', run: () => setEditing(r.h) },
    {
      label: 'Duplicate', icon: 'copy', disabled: !!r.h.challenge_id, hint: 'Challenge habits follow the challenge',
      run: () => { A.create.mutate({ ...r.h, id: crypto.randomUUID(), name: `${r.h.name} copy`, challenge_id: null }); toast(`Copied ${r.h.name}`, undefined, { icon: 'copy' }); },
    },
    { label: 'Archive', icon: 'archive', danger: true, disabled: !!r.h.challenge_id, hint: 'Leave the challenge to remove it', run: () => A.removeWithUndo(r.h) },
  ];

  // A celebration for the moment the last one is done, not for opening a finished day.
  const lastDone = useRef<number | null>(null);
  const loaded = !isPending && !ticksQuery.isPending;
  useEffect(() => {
    if (!loaded) return;
    const before = lastDone.current;
    lastDone.current = doneCount;
    if (before !== null && before < doneCount && dueRows.length > 0 && doneCount === dueRows.length) {
      playCelebration();
      toast('Everything done for today', undefined, { tone: 'success', icon: 'flame' });
    }
  }, [loaded, doneCount, dueRows.length]);

  const title = !habits.length ? (isPending ? 'Habits' : 'Build a habit')
    : !dueRows.length ? 'Nothing due today'
      : doneCount === dueRows.length ? 'All done today'
        : `${doneCount} of ${dueRows.length} done`;
  const sub = !habits.length ? 'Small things, most days. Start with one you already almost do.'
    : !dueRows.length ? `${offRows.length} ${offRows.length === 1 ? 'habit rests' : 'habits rest'} today.`
      : doneCount === dueRows.length ? `Longest streak ${topStreak} ${topStreak === 1 ? 'day' : 'days'}. See you tomorrow.`
        : `${dueRows.length - doneCount} left${topStreak ? ` · longest streak ${topStreak} ${topStreak === 1 ? 'day' : 'days'}` : ''}`;

  const detail = rows.find((r) => r.h.id === detailId) ?? null;
  const timing = rows.find((r) => r.h.id === timingId) ?? null;
  const menuRow = rows.find((r) => r.h.id === menu?.id) ?? null;
  const history = Array.from({ length: span }, (_, i) => addDays(today, i - span + 1));
  const streakRows = [...rows].sort((a, b) => b.streak - a.streak);

  const habitRow = (r: Row) => (
    <li key={r.h.id} className={'hab-row' + (r.done ? ' is-done' : '') + (r.due ? '' : ' is-off')} style={hueStyle(r.h.color)}>
      <button type="button" className={'hab-check is-' + r.h.kind} aria-pressed={r.done} onClick={() => press(r)}
        aria-label={r.h.kind === 'dur' ? `Start the timer for ${r.h.name}` : r.h.kind === 'count' ? `Add one to ${r.h.name}, ${r.p.value} of ${r.p.target}` : `${r.h.name}, ${r.done ? 'done' : 'not done'}`}>
        {r.h.kind === 'count' && !r.done ? <span>{r.p.value}</span>
          : r.h.kind === 'dur' && !r.done ? <Icon name="play" size={18} />
            : r.done ? <Icon name="check" size={20} /> : habitIcon(r.h) !== 'check' && <Icon name={habitIcon(r.h)} size={19} />}
      </button>
      <button type="button" className="hab-main" onClick={() => setDetailId(r.h.id)}>
        <b>{r.h.name}</b>
        <span className="hab-meta">
          {r.streak > 0 && <span className="hab-flame"><Icon name="flame" size={12} />{r.streak}</span>}
          {r.h.challenge_id && <span className="hab-badge"><Icon name="trophy" size={11} />Challenge</span>}
          <span>
            {r.h.kind === 'count' ? `${r.p.value} of ${r.p.target} ${r.h.target_unit ?? 'times'}`
              : r.h.kind === 'dur' ? `${r.p.value} of ${r.p.target} min`
                : r.weekly ? (r.weekDone ? 'Done this week' : 'Once this week')
                  : r.h.cue || scheduleLabel(r.h)}
          </span>
        </span>
        {r.h.kind !== 'bin' && <AsciiBar value={r.p.pct} hue={r.h.color} showValue={false} shape="slim" label={`${r.h.name} progress`} />}
      </button>
      {r.h.kind === 'count' && (
        <span className="hab-stepper">
          <button type="button" aria-label={`One less for ${r.h.name}`} disabled={!r.p.value} onClick={() => setValue(r.h, todayKey, Math.max(0, r.p.value - 1))}>−</button>
          <button type="button" aria-label={`One more for ${r.h.name}`} onClick={() => setValue(r.h, todayKey, r.p.value + 1)}>+</button>
        </span>
      )}
      <span className="hab-dots" aria-label={`Last 7 days: ${r.last7.filter((d) => d.done).length} done`}>
        {r.last7.map((d) => <i key={d.key} className={d.done ? 'is-done' : d.due ? '' : 'is-off'} />)}
      </span>
      <button type="button" className="hab-more" aria-label={`More for ${r.h.name}`}
        onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); setMenu({ x: b.left - 170, y: b.bottom + 4, id: r.h.id }); }}>
        <Icon name="dots" size={16} />
      </button>
    </li>
  );

  return (
    <div className="hab self-workspace" data-self-view={detailed?'details':'daily'}>
      <header className="hab-hero">
        <div className="hab-hero-copy">
          <h1>Habits</h1>
          <SelfViews detailed={detailed} onChange={setDetailed} details="History & streaks"/><p className="self-date">{today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <p><strong>{title}</strong> {sub}</p>
          {dueRows.length > 0 && <AsciiBar value={(doneCount / dueRows.length) * 100} hue={INK} showValue={false} label="Habits done today" />}
          {habits.length > 0 && (
            <ol className="hab-weekstrip" aria-label="This week">
              {week.map((w) => (
                <li key={w.key} className={(w.key === todayKey ? 'is-today' : '') + (w.future ? ' is-future' : '') + (w.due && w.done === w.due ? ' is-perfect' : '')}>
                  <b>{WEEKDAY[w.d.getDay()]}</b>
                  <AsciiBar value={w.due ? (w.done / w.due) * 100 : 0} hue={INK} showValue={false} shape="slim"
                    label={`${w.d.toLocaleDateString(undefined, { weekday: 'long' })}: ${w.future ? 'ahead' : `${w.done} of ${w.due} done`}`} />
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="hab-hero-actions">
          <button type="button" className="hab-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} />New habit</button>
          {dueRows.length > 0 && (
            <button type="button" className="hab-secondary" onClick={keepAll} disabled={doneCount === dueRows.length}>
              <Icon name="check" size={16} />Mark all done
            </button>
          )}
        </div>
      </header>


      {!isPending && habits.length === 0 ? (
        <section className="hab-card hab-empty" aria-label="Start a habit">
          <span className="hab-empty-mark"><Icon name="habit" size={26} /></span>
          <h2>Start with one small habit</h2>
          <p>Tap one to add it now. Name, schedule and target can all change later.</p>
          <div className="hab-starters">
            {HABIT_PRESETS.slice(0, 8).map((p) => (
              <button key={p.id} type="button" style={hueStyle(p.color)} onClick={() => createFrom(p)}>
                <i><Icon name={habitIcon({ icon: p.icon, kind: p.kind })} size={17} /></i>
                <span><b>{p.name}</b><small>{p.kind === 'dur' ? `${p.target} minutes` : p.kind === 'count' ? `${p.target} ${p.target_unit}` : 'Check it off'}</small></span>
              </button>
            ))}
          </div>
          <button type="button" className="hab-link" onClick={() => setEditing('new')}><Icon name="edit" size={14} />Make your own</button>
        </section>
      ) : (
        <div className="hab-grid">
          <div className="hab-main-col">
            <section className="hab-card self-daily" aria-label="Today">
              <header className="hab-card-head">
                <div>
                  <h2>Today</h2>
                  <p>{dueRows.length ? 'Tap the circle when it is done. Tap the name for history and notes.' : 'Nothing is scheduled today.'}</p>
                </div>
              </header>
              {groups.map((grp) => (
                <div key={grp.id} className="hab-group">
                  <h3><Icon name={grp.icon} size={14} />{grp.label}<small>{grp.items.filter((r) => r.done).length} of {grp.items.length}</small></h3>
                  <ul className="hab-list">{grp.items.map(habitRow)}</ul>
                </div>
              ))}
              {offRows.length > 0 && (
                <div className="hab-group is-off">
                  <button type="button" className="hab-off-toggle" aria-expanded={showOff} onClick={() => setShowOff((v) => !v)}>
                    <Icon name={showOff ? 'chevronUp' : 'chevronDown'} size={14} />
                    {offRows.length} not due today
                  </button>
                  {showOff && <ul className="hab-list">{offRows.map(habitRow)}</ul>}
                </div>
              )}
            </section>

            <section className="hab-card self-details" aria-label="History">
              <header className="hab-card-head">
                <div>
                  <h2>History</h2>
                  <p>Forgot to log a day? Tap its square.</p>
                </div>
                <div className="hab-seg" role="radiogroup" aria-label="How far back">
                  <button type="button" role="radio" aria-checked={span === 7} onClick={() => setSpan(7)}>7 days</button>
                  <button type="button" role="radio" aria-checked={span === 30} onClick={() => setSpan(30)}>30 days</button>
                </div>
              </header>
              <div className="hab-table-wrap">
                <table className={'hab-table is-' + span}>
                  <thead>
                    <tr>
                      <th scope="col"><span className="sr-only">Habit</span></th>
                      {history.map((d) => (
                        <th key={dayKey(d)} scope="col" className={dayKey(d) === todayKey ? 'is-today' : undefined}>
                          <span>{WEEKDAY[d.getDay()]}</span>{span === 7 && <b>{d.getDate()}</b>}
                        </th>
                      ))}
                      <th scope="col" className="hab-rate">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const days = ticksByDay(ticks, r.h.id);
                      return (
                        <tr key={r.h.id} style={hueStyle(r.h.color)}>
                          <th scope="row"><i />{r.h.name}</th>
                          {history.map((d) => {
                            const key = dayKey(d);
                            const p = progress(r.h, days.get(key));
                            const due = r.weekly || isDueOn(r.h, d);
                            const cls = p.done ? 'is-done' : p.value > 0 ? 'is-part' : frozen.has(key) ? 'is-frozen' : !due ? 'is-off' : key === todayKey ? 'is-open' : '';
                            return (
                              <td key={key}>
                                <button type="button" className={'hab-cell ' + cls} aria-pressed={p.done} onClick={() => setDay(r.h, key, !p.done)}
                                  aria-label={`${r.h.name}, ${d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: ${p.done ? 'done' : p.value ? `${p.value} of ${p.target}` : due ? 'not done' : 'not due'}`} />
                              </td>
                            );
                          })}
                          <td className="hab-rate">{hitRate(r.h, ticks, today, span).pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="hab-side self-details">
            <section className="hab-card" aria-label="Streaks">
              <header className="hab-card-head">
                <div>
                  <h2>Streaks</h2>
                  <p>Days you are not scheduled never break one.</p>
                </div>
                <span className="hab-freeze" title="Streak freezes"><Icon name="lock" size={13} />{freezes}</span>
              </header>
              {atRisk.length > 0 && (
                <div className="hab-risk">
                  <p><b>Yesterday was missed.</b> {atRisk.map((r) => r.h.name).join(', ')} {atRisk.length === 1 ? 'loses its streak' : 'lose their streaks'} unless you use a freeze.</p>
                  <button type="button" onClick={protect} disabled={freezes <= 0}>{freezes > 0 ? 'Use a freeze' : 'No freezes left'}</button>
                </div>
              )}
              <ul className="hab-streaks">
                {streakRows.map((r) => {
                  const next = HABIT_MILESTONES.find((m) => r.streak < m.days);
                  const unit = r.weekly ? 'week' : 'day';
                  return (
                    <li key={r.h.id} style={hueStyle(r.h.color)}>
                      <span className="hab-streak-icon" aria-hidden="true"><Icon name={habitIcon(r.h)} size={16} /></span>
                      <b>{r.h.name}</b>
                      <em>{r.streak}<small> {unit}{r.streak === 1 ? '' : 's'}</small></em>
                      <AsciiBar value={next ? (r.streak / next.days) * 100 : 100} hue={r.h.color} showValue={false} shape="slim" label={`${r.h.name} streak`} />
                      <small>{next ? `${next.days - r.streak} to ${next.title}` : 'Every milestone reached'}</small>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="hab-card" aria-label="Last six months">
              <header className="hab-card-head">
                <div>
                  <h2>Six months</h2>
                  <p>{active} {active === 1 ? 'day' : 'days'} with at least one habit done</p>
                </div>
              </header>
              <div className="hab-heat" role="img" aria-label={`Heatmap of the last 26 weeks, ${active} active days`}>
                {heat.map((c, i) => <i key={c?.key ?? `f${i}`} data-l={c?.level ?? 0} className={c ? undefined : 'is-future'} title={c ? `${c.d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${c.done} of ${c.due}` : undefined} />)}
              </div>
              <div className="hab-legend" aria-hidden="true">Less<i data-l="0" /><i data-l="1" /><i data-l="2" /><i data-l="3" /><i data-l="4" />More</div>
            </section>

            <section className="hab-card" aria-label="Level">
              <div className="hab-level">
                <b>Level {g.level}</b>
                <small>{g.currentLevelXp} of 250 XP to level {g.level + 1}</small>
              </div>
              <AsciiBar value={g.levelProgress} hue="#ff6b6b" showValue={false} label="Progress to the next level" />
              <dl className="hab-facts">
                <div><dt>Check-ins</dt><dd>{g.totalCompletions}</dd></div>
                <div><dt>Perfect days</dt><dd>{g.perfectDays}</dd></div>
                <div><dt>Bonus</dt><dd>{g.multiplier}×</dd></div>
              </dl>
            </section>
          </aside>
        </div>
      )}

      {menu && menuRow && (
        <ContextMenu x={menu.x} y={menu.y} kind="habit" label={menuRow.h.name} items={menuItems(menuRow)} onClose={() => setMenu(null)} />
      )}

      {editing && (
        <HabitEditor initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={saveHabit}
          onArchive={editing !== 'new' && !editing.challenge_id ? () => { A.removeWithUndo(editing); setEditing(null); } : undefined} />
      )}

      {detail && (
        <HabitDetail habit={detail.h} ticks={ticks} today={today} frozen={frozen} onClose={() => setDetailId(null)}
          onEdit={() => { setDetailId(null); setEditing(detail.h); }}
          onArchive={detail.h.challenge_id ? undefined : () => { A.removeWithUndo(detail.h); setDetailId(null); }}
          onSetDay={(date, done) => setDay(detail.h, date, done)} />
      )}

      {timing && (
        <HabitTimer habit={timing.h} minutesToday={timing.p.value} onClose={() => setTimingId(null)}
          onLog={(minutes) => {
            setValue(timing.h, todayKey, timing.p.value + minutes);
            toast(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'} logged for ${timing.h.name}`, () => setValue(timing.h, todayKey, timing.p.value), { tone: 'success', icon: 'clock' });
          }} />
      )}
    </div>
  );
}
