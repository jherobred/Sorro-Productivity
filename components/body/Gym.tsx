'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../Icon';
import { ExerciseShot } from './ExerciseShot';
import { toast } from '@/lib/toast';
import { ask, confirmAsk } from '@/lib/ask';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useOverlayBack } from '@/lib/nav';
import { ymd } from '@/lib/series';
import { useSets, useSetActions } from '@/lib/gym';
import { useBodyDays, useBodyActions, type Workout, type Group } from '@/lib/body';
import {
  EXERCISES, ROUTINES, volumeOf, bestByExercise, groupsOfSets, lastTime, nextSet,
  kindOf, gearOf, workedOf, routineOf, slotFor, progression, setsLine,
  type WorkoutSet, type Routine, type Gear,
} from '@/lib/lift';
import { AsciiBar } from '../AsciiBar';

/**
 * Training, wearing openGym — as pieces the Body page lays out itself.
 *
 * This file used to export one `<Gym>` that owned a segmented control and four
 * screens, and the Body page dropped it inside a tab. That is what made Trained
 * read as a window pane: a black, bordered, rounded box cut into a lavender
 * page, with its own header and its own date a centimetre below the page's own.
 *
 * There are no tabs now. Body is one black scroll and this is three blocks in
 * it — the week and today's session, the year and the numbers, and the session
 * itself when it is running. The state they share lives in `useTraining`, so
 * the page can put Fuel between two of them without any of them knowing.
 *
 * Plan and Exercises were destinations behind that control. They are sheets
 * now, because both are things you open, do one thing in, and close.
 */

const REST_S = 90;
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const GEARS: Gear[] = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Cardio'];

/* ------------------------------------------------------------------ state */

export type Training = ReturnType<typeof useTraining>;

export function useTraining({
  today, workouts, addWorkout, editWorkout, delWorkout,
}: {
  today: string;
  workouts: Workout[];
  addWorkout: (w: Workout) => void;
  editWorkout: (id: string, patch: Partial<Workout>) => void;
  delWorkout: (id: string) => void;
}) {
  const { prefs, update } = usePrefs();
  const [weekOff, setWeekOff] = useState(0);
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  /** Which sheet is up. Plan and Exercises used to be tabs. */
  const [sheet, setSheet] = useState<'plan' | 'exercises' | null>(null);

  const ids = useMemo(() => workouts.map((w) => w.id), [workouts]);
  const order = useMemo(
    () => [...workouts].sort((a, b) => b.on_date.localeCompare(a.on_date)).map((w) => w.id),
    [workouts],
  );
  const { data: sets = [] } = useSets(ids);
  const S = useSetActions(ids);

  // A year of readings, because the chart offers 1M / 3M / 1Y / All.
  const { data: days = [] } = useBodyDays(400);
  const A = useBodyActions(400, today);

  const session = workouts.find((w) => w.on_date === today) ?? null;
  const mine = useMemo(
    () => sets.filter((s) => s.workout_id === session?.id).sort((a, b) => a.position - b.position),
    [sets, session?.id],
  );
  const previously = useMemo(() => lastTime(sets, order, session?.id), [sets, order, session?.id]);
  const bests = useMemo(
    () => bestByExercise(sets.filter((s) => s.workout_id !== session?.id)),
    [sets, session?.id],
  );

  const plan = prefs.gymPlan?.length === 7 ? prefs.gymPlan : ['', '', '', '', '', '', ''];
  const todayRoutine = routineOf(plan[slotFor(new Date().getDay())]);

  /** Exercises the split named but nothing has been logged for yet. */
  const blocks = useMemo(() => {
    const out: { exercise: string; sets: WorkoutSet[] }[] = [];
    for (const s of mine) {
      const hit = out.find((b) => b.exercise === s.exercise);
      if (hit) hit.sets.push(s);
      else out.push({ exercise: s.exercise, sets: [s] });
    }
    const named = out.map((b) => b.exercise);
    return [...out, ...pending.filter((p) => !named.includes(p)).map((p) => ({ exercise: p, sets: [] as WorkoutSet[] }))];
  }, [mine, pending]);

  const doneDays = useMemo(() => new Set(workouts.map((w) => w.on_date)), [workouts]);

  /* --------------------------------------------------------------- verbs */

  const start = (routine: Routine | null) => {
    if (!session) {
      addWorkout({
        id: crypto.randomUUID(), on_date: today,
        name: routine?.name ?? 'Workout', groups: [], minutes: 0,
      });
    }
    if (routine) setPending(routine.exercises);
    setRunning(true);
  };

  const restamp = (after: WorkoutSet[]) => {
    if (!session) return;
    const groups = groupsOfSets(after) as Group[];
    // ponytail: 2.5 min a set stands in for a stopwatch nobody remembers to
    // start. Swap for real elapsed time if a session ever gets a started_at.
    const minutes = Math.max(1, Math.round(after.length * 2.5));
    if (groups.join() !== session.groups.join() || minutes !== session.minutes) {
      editWorkout(session.id, { groups, minutes });
    }
  };

  const logSet = (exercise: string, seed?: { weight_kg: number; reps: number }) => {
    if (!session) return;
    const inSession = [...mine].reverse().find((s) => s.exercise === exercise);
    const v = seed ?? nextSet(inSession ?? previously[exercise], kindOf(exercise));
    const row: WorkoutSet = {
      id: crypto.randomUUID(), workout_id: session.id, exercise,
      position: mine.length, done: false, ...v,
    };
    S.addSet.mutate(row);
    restamp([...mine, row]);
    setPending((p) => p.filter((x) => x !== exercise));
  };

  const change = (s: WorkoutSet, patch: Partial<WorkoutSet>) => {
    S.editSet.mutate({ id: s.id, patch });
    restamp(mine.map((x) => (x.id === s.id ? { ...x, ...patch } : x)));
  };

  const drop = (s: WorkoutSet) => {
    S.delSet.mutate({ id: s.id });
    restamp(mine.filter((x) => x.id !== s.id));
  };

  const finish = async () => {
    if (!session) return;
    if (mine.length === 0) {
      const yes = await confirmAsk('Nothing logged — throw it away?', {
        message: 'The session has no sets in it.', confirmLabel: 'Discard', danger: true,
      });
      if (yes) { delWorkout(session.id); setPending([]); setRunning(false); }
      return;
    }
    setRunning(false);
    setPending([]);
    toast(`${session.name} done — ${volumeOf(mine).toLocaleString()} kg moved`);
  };

  const logWeight = () =>
    void ask('Log your weight', {
      initial: String(days.find((d) => d.on_date === today)?.weight ?? ''),
      placeholder: 'kg', confirmLabel: 'Save',
    }).then((v) => {
      if (v) A.setDay.mutate({ on_date: today, patch: { weight: Number(v) || null } });
    });

  const addExercise = (name: string) => {
    if (!session) start(null);
    setPending((p) => (p.includes(name) ? p : [...p, name]));
    setRunning(true);
  };

  const setPlanDay = (i: number, id: string) => {
    const next = [...plan];
    next[i] = id;
    void update({ gymPlan: next });
  };

  return {
    today, workouts, sets, days, session, mine, previously, bests, blocks, plan, todayRoutine,
    doneDays, weekOff, setWeekOff, running, setRunning, sheet, setSheet, setPending,
    start, logSet, change, drop, finish, logWeight, addExercise, setPlanDay, editWorkout,
  };
}

/* ----------------------------------------------------------------- train */

/**
 * The week, and what today is. openGym's home screen, minus its header — the
 * page has one, and two of them a centimetre apart reads as a bug.
 */
export function TrainCard({ T }: { T: Training }) {
  const { session, todayRoutine, plan, doneDays, today, weekOff, setWeekOff } = T;

  return (
    <>
      <div className="og-card">
        <div className="og-row og-between" style={{ marginBottom: 8 }}>
          <button className="og-iconbtn" style={{ width: 30, height: 30 }}
            onClick={() => setWeekOff((w) => w - 1)} aria-label="Previous week">
            <Icon name="back" size={14} color="currentColor" />
          </button>
          <div className="og-small og-muted" style={{ fontWeight: 500 }}>
            {weekOff === 0 ? 'This week' : `Week of ${weekLabel(weekOff)}`}
          </div>
          <button className="og-iconbtn" style={{ width: 30, height: 30 }}
            onClick={() => setWeekOff((w) => w + 1)} aria-label="Next week">
            <Icon name="chev" size={14} color="currentColor" />
          </button>
        </div>

        <div className="og-week">
          {weekDays(weekOff).map((d) => {
            const iso = ymd(d);
            const done = doneDays.has(iso);
            const planned = !!plan[slotFor(d.getDay())];
            return (
              <button key={iso} className={`og-wday${iso === today ? ' og-today' : ''}`}
                onClick={() => T.setSheet('plan')}
                aria-label={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}>
                <div className="og-lbl">{WEEK[slotFor(d.getDay())].slice(0, 2)}</div>
                <div className="og-num">{d.getDate()}</div>
                <div className={`og-dot${done ? ' done' : planned ? ' plan' : ''}`} />
              </button>
            );
          })}
        </div>

        <button className="og-today-row" onClick={() => T.start(session ? null : todayRoutine)}>
          <div className="og-row" style={{ gap: 9, minWidth: 0 }}>
            <span className="og-lrow-i" style={{
              background: session ? 'var(--og-orange)' : todayRoutine ? 'var(--og-acc)' : 'var(--og-surface-3)',
              color: session || todayRoutine ? '#000' : '#fff',
            }}>
              <Icon name="gym" size={15} color="currentColor" />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="og-lbl2">Today</div>
              <div className="og-ttl">
                {session ? `${session.name} — in progress` : todayRoutine ? todayRoutine.name : 'Rest day'}
              </div>
            </div>
          </div>
          <span className={`og-tag${session ? '' : ' og-on'}`}
            style={session ? { color: 'var(--og-orange)', background: 'color-mix(in srgb, var(--og-orange) 16%, transparent)' } : undefined}>
            {session ? 'Resume' : todayRoutine ? 'Start' : 'Plan'}
          </span>
        </button>

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="og-btn og-sm" style={{ flex: 1 }} onClick={() => T.setSheet('plan')}>
            <Icon name="cal" size={14} color="currentColor" />Weekly plan
          </button>
          <button className="og-btn og-sm" style={{ flex: 1 }} onClick={() => T.setSheet('exercises')}>
            <Icon name="gym" size={14} color="currentColor" />Exercises
          </button>
        </div>
      </div>

      <StreakCard workouts={T.workouts} plan={plan} />
    </>
  );
}

/* -------------------------------------------------------------- progress */

/** The numbers, the year and the curve — openGym's Stats, inline. */
export function ProgressCards({ T }: { T: Training }) {
  return <StatsView workouts={T.workouts} sets={T.sets} days={T.days} today={T.today} onLog={T.logWeight} />;
}

/* -------------------------------------------------------------- overlays */

/** Everything that covers the page: the running session and the two sheets. */
export function TrainingOverlays({ T }: { T: Training }) {
  return (
    <>
      {T.running && T.session && (
        <Session
          session={T.session} blocks={T.blocks} mine={T.mine} previously={T.previously} bests={T.bests}
          onClose={() => T.setRunning(false)}
          onFinish={() => void T.finish()}
          onLog={T.logSet} onChange={T.change} onDrop={T.drop}
          onAddExercise={(name) => T.setPending((p) => (p.includes(name) ? p : [...p, name]))}
          onRename={() => void ask('Name this session', { initial: T.session?.name ?? '', placeholder: 'Push Day' })
            .then((v) => { if (v && T.session) T.editWorkout(T.session.id, { name: v }); })} />
      )}

      {T.sheet === 'plan' && (
        <Sheet title="Weekly plan" onClose={() => T.setSheet(null)}>
          <PlanView plan={T.plan} onSet={T.setPlanDay} />
        </Sheet>
      )}

      {T.sheet === 'exercises' && (
        <Sheet title="Exercises" onClose={() => T.setSheet(null)}>
          <ExercisesView bests={T.bests} sets={T.sets}
            onPick={(name) => { T.setSheet(null); T.addExercise(name); }} />
        </Sheet>
      )}
    </>
  );
}

/**
 * openGym's bottom sheet: a grabber, a title, a scroll. Portalled to the body
 * because `main` carries the font-scale zoom and a page transform, either of
 * which would make it the containing block for anything fixed — the rule that
 * has now bitten this codebase four times.
 */
function Sheet({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  useOverlayBack(true, onClose);

  const body = (
    <div onClick={onClose} className="ogym" style={{
      position: 'fixed', inset: 0, zIndex: 97, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}
        style={{
          width: '100%', maxWidth: 620, maxHeight: '88dvh', display: 'flex', flexDirection: 'column',
          background: 'var(--og-bg-el)', borderRadius: 'var(--og-r-xl) var(--og-r-xl) 0 0',
          padding: '8px 16px calc(20px + env(safe-area-inset-bottom))',
        }}>
        <span aria-hidden style={{ width: 36, height: 5, borderRadius: 99, background: 'var(--og-label-4)', margin: '6px auto 12px' }} />
        <div className="og-row og-between" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.021em' }}>{title}</h3>
          <button className="og-iconbtn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={15} color="currentColor" />
          </button>
        </div>
        <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}

/* ------------------------------------------------------------ the session */

/**
 * openGym's guided workout, which is the screen the whole app is for: one
 * exercise at a time, its demonstration, what you did last time, and the sets
 * you are on now. Ticking a set starts the rest clock, because the clock is
 * why the phone is in your hand between sets at all.
 */
function Session({
  session, blocks, mine, previously, bests,
  onClose, onFinish, onLog, onChange, onDrop, onAddExercise, onRename,
}: {
  session: Workout;
  blocks: { exercise: string; sets: WorkoutSet[] }[];
  mine: WorkoutSet[];
  previously: Record<string, WorkoutSet>;
  bests: Record<string, number>;
  onClose: () => void;
  onFinish: () => void;
  onLog: (exercise: string, seed?: { weight_kg: number; reps: number }) => void;
  onChange: (s: WorkoutSet, patch: Partial<WorkoutSet>) => void;
  onDrop: (s: WorkoutSet) => void;
  onAddExercise: (name: string) => void;
  onRename: () => void;
}) {
  const [i, setI] = useState(0);
  const [rest, setRest] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [picking, setPicking] = useState(false);
  useOverlayBack(true, onClose);

  useEffect(() => {
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (rest === null) return;
    if (rest <= 0) { setRest(null); toast('Rest over'); return; }
    const t = setTimeout(() => setRest((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(t);
  }, [rest]);

  const at = Math.min(i, Math.max(0, blocks.length - 1));
  const block = blocks[at];
  const doneSets = mine.filter((s) => s.done).length;
  const planned = Math.max(mine.length, blocks.length * 3);

  const prev = block ? previously[block.exercise] : undefined;
  const step = block ? progression(block.sets.length ? block.sets : prev ? [prev] : [], 8) : null;

  const body = (
    <div className="ogym" style={{
      position: 'fixed', inset: 0, zIndex: 96, background: 'var(--og-bg)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', flex: 'none',
        borderBottom: '1px solid var(--og-sep)',
      }}>
        <button className="og-iconbtn" onClick={onClose} aria-label="Minimise">
          <Icon name="close" size={15} color="currentColor" />
        </button>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <button onClick={onRename} style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.012em' }}>
            {session.name}
          </button>
          <div className="og-small og-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {clock(elapsed)} · {doneSets}/{planned} sets
          </div>
        </div>
        <button className="og-iconbtn" onClick={onFinish} aria-label="Finish workout"
          style={{ background: 'var(--og-acc-soft)', color: 'var(--og-acc)' }}>
          <Icon name="check" size={15} color="currentColor" />
        </button>
      </div>

      <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 14px 20px' }}>
        <div style={{ maxWidth: 560, marginInline: 'auto' }}>
          <AsciiBar value={planned ? (doneSets / planned) * 100 : 0} cells={36} showValue={false}
            label={`${doneSets} of ${planned} sets done`} />

          {!block ? (
            <div style={{ textAlign: 'center', padding: '40px 10px' }}>
              <div className="og-muted og-small" style={{ marginBottom: 14 }}>Nothing in this session yet.</div>
              <button className="og-btn og-primary" onClick={() => setPicking(true)}>
                <Icon name="plus" size={15} color="currentColor" />Add an exercise
              </button>
            </div>
          ) : (
            <>
              <div className="og-small og-muted" style={{ marginBottom: 8 }}>
                Exercise {at + 1} / {blocks.length}
              </div>

              <div className="og-exmedia">
                <ExerciseShot exercise={block.exercise} />
                <span className="og-hint og-l">{workedOf(block.exercise)}</span>
                <span className="og-hint og-r">{gearOf(block.exercise)}</span>
              </div>

              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.021em', marginBottom: 7 }}>
                {block.exercise}
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <span className="og-tag">{workedOf(block.exercise)}</span>
                <span className="og-tag">{gearOf(block.exercise)}</span>
                {bests[block.exercise] > 0 && (
                  <span className="og-tag og-warn">Best: {bests[block.exercise]} kg</span>
                )}
              </div>

              {prev && (
                <div className="og-small og-muted" style={{ marginBottom: 2 }}>
                  Last time: {setsLine([prev])}
                </div>
              )}

              {step && (
                <div className={`og-progline${step.hit ? '' : ' og-warn'}`}>
                  <Icon name={step.hit ? 'up' : 'refresh'} size={13} color="currentColor" />
                  {step.hit
                    ? `Last time you hit all reps · try ${step.weight} kg`
                    : `Hold at ${step.weight} kg until every set reaches 8`}
                </div>
              )}

              <div className="og-sethead" style={{ marginTop: 10 }}>
                <span style={{ width: 24, flex: 'none' }}>Set</span>
                <span style={{ flex: 1.4, textAlign: 'center' }}>Weight (kg)</span>
                <span style={{ flex: 1, textAlign: 'center' }}>Reps</span>
                <span style={{ width: 68, flex: 'none' }} />
              </div>

              {block.sets.map((s, n) => (
                <SetRow key={s.id} n={n + 1} set={s}
                  onChange={(p) => onChange(s, p)}
                  onDone={() => { onChange(s, { done: !s.done }); if (!s.done) setRest(REST_S); }}
                  onDrop={() => onDrop(s)} />
              ))}

              <button className="og-btn og-tinted og-sm" style={{ width: '100%', marginTop: 10 }}
                onClick={() => onLog(block.exercise, step ? { weight_kg: step.weight, reps: 8 } : undefined)}>
                <Icon name="plus" size={14} color="currentColor" />
                {block.sets.length ? 'Add a set' : 'First set'}
              </button>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="og-btn og-sm" style={{ flex: 1 }} disabled={at === 0} onClick={() => setI(at - 1)}>
                  <Icon name="back" size={14} color="currentColor" />Previous
                </button>
                <button className="og-btn og-sm" style={{ flex: 1 }} disabled={at >= blocks.length - 1} onClick={() => setI(at + 1)}>
                  Next<Icon name="chev" size={14} color="currentColor" />
                </button>
              </div>

              <button className="og-btn og-sm" style={{ width: '100%', marginTop: 8 }} onClick={() => setPicking(true)}>
                <Icon name="plus" size={14} color="currentColor" />Add an exercise
              </button>
            </>
          )}

          {rest !== null && (
            <div className="og-timer">
              <div className="og-head">
                <span className="og-t">{clock(rest)}</span>
                <AsciiBar value={(rest / REST_S) * 100} cells={18} showValue={false} label="Rest remaining" />
              </div>
              <div className="og-acts">
                <button className="og-btn og-sm" onClick={() => setRest((r) => Math.max(0, (r ?? 0) - 15))}>−15s</button>
                <button className="og-btn og-sm" onClick={() => setRest((r) => (r ?? 0) + 15)}>+15s</button>
                <button className="og-btn og-primary og-sm og-skip" onClick={() => setRest(null)}>Skip</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {picking && (
        <Picker onClose={() => setPicking(false)}
          onPick={(name) => { onAddExercise(name); setPicking(false); setI(blocks.length); }} />
      )}
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}

function SetRow({
  n, set: s, onChange, onDone, onDrop,
}: {
  n: number; set: WorkoutSet;
  onChange: (p: Partial<WorkoutSet>) => void;
  onDone: () => void;
  onDrop: () => void;
}) {
  const bodyweight = kindOf(s.exercise) === 'bodyweight';
  return (
    <div className={`og-setrow${s.done ? ' og-done' : ''}`}>
      <span className="og-n">{n}</span>

      <div className="og-stp" style={{ flex: 1.4, minWidth: 0, opacity: bodyweight ? 0.4 : 1 }}>
        <button onClick={() => onChange({ weight_kg: Math.max(0, s.weight_kg - 2.5) })} aria-label="Less weight">−</button>
        <span className="og-val">
          <input className="og-num" inputMode="decimal" value={s.weight_kg || ''} placeholder="0"
            aria-label={`Weight for set ${n}`}
            onChange={(e) => onChange({ weight_kg: num(e.target.value) })} />
        </span>
        <button onClick={() => onChange({ weight_kg: s.weight_kg + 2.5 })} aria-label="More weight">+</button>
      </div>

      <div className="og-stp" style={{ flex: 1, minWidth: 0 }}>
        <button onClick={() => onChange({ reps: Math.max(0, s.reps - 1) })} aria-label="Fewer reps">−</button>
        <span className="og-val">
          <input className="og-num" inputMode="numeric" value={s.reps || ''} placeholder="0"
            aria-label={`Reps for set ${n}`}
            onChange={(e) => onChange({ reps: Math.round(num(e.target.value)) })} />
        </span>
        <button onClick={() => onChange({ reps: s.reps + 1 })} aria-label="More reps">+</button>
      </div>

      <button className={`og-setgo${s.done ? ' og-on' : ''}`} onClick={onDone}
        aria-pressed={s.done} aria-label={s.done ? `Set ${n} done` : `Mark set ${n} done`}>
        <Icon name="check" size={14} color="currentColor" />
      </button>
      <button className="og-setgo" onClick={onDrop} aria-label={`Delete set ${n}`} style={{ background: 'transparent' }}>
        <Icon name="close" size={12} color="var(--og-label-3)" />
      </button>
    </div>
  );
}

const num = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, '')) || 0);
const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

/* ------------------------------------------------------------- home cards */

function WeightCard({
  days, today, onLog, range,
}: {
  days: { on_date: string; weight: number | null }[];
  today: string; onLog: () => void; range: number;
}) {
  const points = useMemo(() => days
    .filter((d) => d.weight)
    .map((d) => ({ day: d.on_date, value: Number(d.weight) }))
    .sort((a, b) => a.day.localeCompare(b.day)), [days]);

  const shown = range === 0 ? points : points.filter((p) => p.day >= ymd(new Date(Date.now() - range * 864e5)));
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const delta = last && prev ? Math.round((last.value - prev.value) * 10) / 10 : null;

  return (
    <div className="og-card">
      <div className="og-row og-between" style={{ marginBottom: 6 }}>
        <div className="og-h2" style={{ margin: 0 }}>Body weight</div>
        <button className="og-btn og-xs" onClick={onLog}>
          <Icon name="plus" size={12} color="currentColor" />Log
        </button>
      </div>

      {last ? (
        <>
          <div className="og-row" style={{ gap: 8, alignItems: 'baseline' }}>
            <div className="og-big">
              {last.value}<span className="og-muted" style={{ fontSize: 16 }}> kg</span>
            </div>
            {delta !== null && delta !== 0 && (
              <span className="og-small" style={{ fontWeight: 500, color: delta < 0 ? 'var(--og-acc)' : 'var(--og-orange)' }}>
                {delta < 0 ? '↓' : '↑'} {Math.abs(delta)}
              </span>
            )}
            <span className="og-dim og-small" style={{ marginLeft: 'auto' }}>
              {last.day === today ? 'today' : last.day}
            </span>
          </div>
          <div style={{ marginTop: 8 }}><Curve points={shown} /></div>
        </>
      ) : (
        <div className="og-muted og-small">No entries yet — log your weight to start the curve.</div>
      )}
    </div>
  );
}

function StreakCard({ workouts, plan }: { workouts: Workout[]; plan: string[] }) {
  const weeks = streakWeeks(workouts);
  const thisWeek = workouts.filter((w) => w.on_date >= ymd(weekDays(0)[0])).length;
  const perWeek = plan.filter(Boolean).length;

  return (
    <div className="og-card">
      <div className="og-row og-between">
        <div>
          <div className="og-row" style={{ gap: 7, fontSize: 22, fontWeight: 600, letterSpacing: '-.021em' }}>
            <Icon name="flame" size={19} color="var(--og-orange)" />
            {weeks} week streak
          </div>
          <div className="og-muted og-small" style={{ marginTop: 2 }}>
            {thisWeek}{perWeek ? ` / ${perWeek}` : ''} this week · {workouts.length} workout{workouts.length === 1 ? '' : 's'} total
          </div>
        </div>
        <Icon name="cal" size={19} color="var(--og-label-3)" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ plan */

function PlanView({ plan, onSet }: { plan: string[]; onSet: (i: number, id: string) => void }) {
  return (
    <>
      <div className="og-h2">Weekly plan</div>
      {WEEK.map((d, i) => (
        <div key={d} className="og-card" style={{ marginBottom: 8, padding: '11px 13px' }}>
          <div className="og-row og-between" style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{d}</div>
            <div className="og-small og-muted">{routineOf(plan[i])?.name ?? 'Rest day'}</div>
          </div>
          <div className="og-chips">
            <button className={`og-chip${plan[i] ? '' : ' og-on'}`} onClick={() => onSet(i, '')}>Rest</button>
            {ROUTINES.map((r) => (
              <button key={r.id} className={`og-chip${plan[i] === r.id ? ' og-on' : ''}`} onClick={() => onSet(i, r.id)}>
                {r.name.replace(' Day', '')}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="og-muted og-small" style={{ padding: '0 4px' }}>
        A day with a split shows on the week strip and on Today, ready to start.
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- stats */

function StatsView({
  workouts, sets, days, today, onLog,
}: {
  workouts: Workout[]; sets: WorkoutSet[];
  days: { on_date: string; weight: number | null }[];
  today: string; onLog: () => void;
}) {
  const [range, setRange] = useState(90);
  const thisMonth = workouts.filter((w) => w.on_date.startsWith(today.slice(0, 7))).length;

  const points = days.filter((d) => d.weight)
    .map((d) => ({ day: d.on_date, value: Number(d.weight) }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const cut = ymd(new Date(Date.now() - 30 * 864e5));
  const from = points.find((p) => p.day >= cut);
  const last = points[points.length - 1];
  const d30 = from && last ? Math.round((last.value - from.value) * 10) / 10 : null;

  return (
    <>
      <div className="og-tiles">
        <Tile icon="gym" label="Workouts" value={String(workouts.length)} />
        <Tile icon="cal" label="This month" value={String(thisMonth)} />
        <Tile icon="flame" label="Week streak" value={String(streakWeeks(workouts))} />
        <Tile icon="scale" label="Weight 30d"
          value={d30 === null ? '—' : `${d30 > 0 ? '+' : ''}${d30} kg`}
          tone={d30 === null ? undefined : d30 < 0 ? 'var(--og-acc)' : 'var(--og-orange)'} />
      </div>

      <div className="og-card">
        <div className="og-h2">
          Activity — last 12 months{' '}
          <span className="og-dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· by time trained</span>
        </div>
        <Heatmap workouts={workouts} sets={sets} today={today} />
      </div>

      <div className="og-card">
        <div className="og-row og-between" style={{ marginBottom: 8 }}>
          <div className="og-h2" style={{ margin: 0 }}>Body weight</div>
          <button className="og-btn og-xs" onClick={onLog}>
            <Icon name="plus" size={12} color="currentColor" />Log
          </button>
        </div>
        <div className="og-seg" style={{ marginBottom: 10 }}>
          {[{ v: 30, l: '1M' }, { v: 90, l: '3M' }, { v: 365, l: '1Y' }, { v: 0, l: 'All' }].map((r) => (
            <button key={r.l} className={range === r.v ? 'og-on' : undefined} onClick={() => setRange(r.v)}>{r.l}</button>
          ))}
        </div>
        <Curve points={range === 0 ? points : points.filter((p) => p.day >= ymd(new Date(Date.now() - range * 864e5)))} />
      </div>
    </>
  );
}

function Tile({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone?: string }) {
  return (
    <div className="og-tile">
      <div className="og-l"><Icon name={icon} size={14} color="var(--og-label)" />{label}</div>
      <div className="og-v" style={tone ? { color: tone, fontSize: 22 } : undefined}>{value}</div>
    </div>
  );
}

/**
 * The year, as a GitHub grid — openGym's `.hm-*` markup, one column per week,
 * shaded by how long was trained that day.
 */
function Heatmap({ workouts, sets, today }: { workouts: Workout[]; sets: WorkoutSet[]; today: string }) {
  const { cols, months } = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const w of workouts) {
      const v = w.minutes || Math.round(volumeOf(sets.filter((s) => s.workout_id === w.id)) / 40) || 20;
      byDate.set(w.on_date, (byDate.get(w.on_date) ?? 0) + v);
    }
    const peak = Math.max(30, ...byDate.values());

    // Back to the Monday 52 weeks ago, so every column is a whole week.
    const end = new Date();
    end.setHours(12, 0, 0, 0);
    const cursor = new Date(end);
    cursor.setDate(cursor.getDate() - 364);
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));

    const cols: { day: string; level: number; future: boolean }[][] = [];
    const months: { at: number; label: string }[] = [];

    for (let c = 0; c < 54; c++) {
      const col: { day: string; level: number; future: boolean }[] = [];
      for (let r = 0; r < 7; r++) {
        const iso = ymd(cursor);
        const v = byDate.get(iso) ?? 0;
        col.push({ day: iso, level: v === 0 ? 0 : Math.min(4, Math.ceil((v / peak) * 4)), future: iso > today });
        cursor.setDate(cursor.getDate() + 1);
      }
      // A month label sits over the column its first week starts in.
      if (Number(col[0].day.slice(8)) <= 7) {
        months.push({ at: c, label: new Date(`${col[0].day}T12:00`).toLocaleDateString(undefined, { month: 'short' }) });
      }
      cols.push(col);
      if (col[6].day > today) break;
    }
    return { cols, months };
  }, [workouts, sets, today]);

  return (
    <div className="og-hm-wrap">
      <div style={{ minWidth: cols.length * 14 + 28 }}>
        <div className="og-hm-months">
          {cols.map((_, c) => <span key={c}>{months.find((m) => m.at === c)?.label ?? ''}</span>)}
        </div>
        <div className="og-hm-body">
          <div className="og-hm-days">
            {['', 'Tue', '', 'Thu', '', 'Sat', ''].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="og-hm-grid">
            {cols.map((col, c) => (
              <div key={c} className="og-hm-col">
                {col.map((cell) => (
                  <span key={cell.day} title={cell.day}
                    className={`og-hm-c${cell.level ? ` l${cell.level}` : ''}${cell.day === today ? ' og-todaycell' : ''}${cell.future ? ' og-future' : ''}`} />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="og-hm-legend">
          Less time
          {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`og-hm-c${l ? ` l${l}` : ''}`} />)}
          More time
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- exercises */

function ExercisesView({
  bests, sets, onPick,
}: { bests: Record<string, number>; sets: WorkoutSet[]; onPick: (name: string) => void }) {
  const [q, setQ] = useState('');
  const [gear, setGear] = useState<Gear | 'all'>('all');
  const needle = q.trim().toLowerCase();

  const list = EXERCISES.filter((e) =>
    (!needle || e.name.toLowerCase().includes(needle) || e.worked.toLowerCase().includes(needle))
    && (gear === 'all' || e.gear === gear));

  return (
    <>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises"
        aria-label="Search exercises" style={FIELD} />

      <div className="og-chips" style={{ marginBottom: 12 }}>
        <button className={`og-chip${gear === 'all' ? ' og-on' : ''}`} onClick={() => setGear('all')}>All</button>
        {GEARS.map((g) => (
          <button key={g} className={`og-chip${gear === g ? ' og-on' : ''}`} onClick={() => setGear(g)}>{g}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((e) => {
          const n = sets.filter((s) => s.exercise === e.name).length;
          return (
            <button key={e.id} className="og-item" onClick={() => onPick(e.name)}>
              <span className="og-thumb"><ExerciseShot exercise={e.name} compact still /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="og-tt" style={{ display: 'block' }}>{e.name}</span>
                <span className="og-ss" style={{ display: 'block' }}>
                  {e.worked} · {e.gear}{n ? ` · ${n} set${n === 1 ? '' : 's'}` : ''}
                </span>
              </span>
              {bests[e.name] > 0 && <span className="og-tag og-warn">{bests[e.name]} kg</span>}
              <Icon name="chev" size={15} color="var(--og-label-3)" />
            </button>
          );
        })}
        {list.length === 0 && (
          <div className="og-muted og-small" style={{ padding: 20, textAlign: 'center' }}>Nothing matching.</div>
        )}
      </div>
    </>
  );
}

/** The exercise sheet, openGym's shape: a grabber, a search, a list. */
function Picker({ onClose, onPick }: { onClose: () => void; onPick: (name: string) => void }) {
  const [q, setQ] = useState('');
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { box.current?.focus(); }, []);

  const needle = q.trim().toLowerCase();
  const list = EXERCISES.filter((e) => !needle || e.name.toLowerCase().includes(needle) || e.worked.toLowerCase().includes(needle));
  const typed = needle && !EXERCISES.some((e) => e.name.toLowerCase() === needle) ? q.trim() : null;

  return (
    <div onClick={onClose} className="ogym" style={{
      position: 'fixed', inset: 0, zIndex: 98, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add an exercise"
        style={{
          width: '100%', maxWidth: 560, maxHeight: '86dvh', display: 'flex', flexDirection: 'column',
          background: 'var(--og-bg-el)', borderRadius: 'var(--og-r-xl) var(--og-r-xl) 0 0',
          padding: '8px 16px 20px',
        }}>
        <span aria-hidden style={{ width: 36, height: 5, borderRadius: 99, background: 'var(--og-label-4)', margin: '6px auto 14px' }} />
        <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.021em', marginBottom: 12 }}>Add an exercise</h3>
        <input ref={box} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, or type your own"
          aria-label="Search exercises" style={FIELD} />
        <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {typed && (
            <button className="og-item" onClick={() => onPick(typed)}>
              <Icon name="plus" size={15} color="var(--og-acc)" />
              <span className="og-tt">Add “{typed}”</span>
            </button>
          )}
          {list.map((e) => (
            <button key={e.id} className="og-item" onClick={() => onPick(e.name)}>
              <span className="og-thumb"><ExerciseShot exercise={e.name} compact still /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="og-tt" style={{ display: 'block' }}>{e.name}</span>
                <span className="og-ss" style={{ display: 'block' }}>{e.worked} · {e.gear}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const FIELD: React.CSSProperties = {
  width: '100%', minHeight: 38, padding: '9px 12px', borderRadius: 10, marginBottom: 10,
  background: 'var(--og-surface-2)', color: 'var(--og-label)', border: 0, fontSize: 15,
};

/* ---------------------------------------------------------------- charts */

/**
 * The body-weight curve: a filled area, the line over it, the last reading
 * called out at the right edge. openGym draws a goal line in yellow when one
 * is set; Basedly's schema has no goal field, so the period's average stands
 * in as the reference — the same job, without inventing a column.
 */
function Curve({ points }: { points: { day: string; value: number }[] }) {
  if (points.length < 2) {
    return <div className="og-muted og-small" style={{ padding: '18px 0' }}>Two readings and the curve appears.</div>;
  }
  const W = 320;
  const H = 130;
  const lo = Math.min(...points.map((p) => p.value));
  const hi = Math.max(...points.map((p) => p.value));
  const pad = Math.max(0.4, (hi - lo) * 0.18);
  const min = lo - pad;
  const max = hi + pad;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min)) * H;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const avg = points.reduce((n, p) => n + p.value, 0) / points.length;
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ width: '100%', height: 130, display: 'block' }}
      role="img" aria-label={`Body weight, ${points.length} readings, now ${last.value}`}>
      <defs>
        <linearGradient id="ogfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--og-acc)" stopOpacity="0.34" />
          <stop offset="100%" stopColor="var(--og-acc)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="url(#ogfill)" />
      <line x1="0" y1={y(avg)} x2={W} y2={y(avg)} stroke="var(--og-yellow)" strokeWidth="1"
        strokeDasharray="4 4" opacity="0.7" vectorEffect="non-scaling-stroke" />
      <path d={line} fill="none" stroke="var(--og-acc)" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={W - 2} cy={y(last.value)} r="3" fill="var(--og-acc)" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* --------------------------------------------------------------- helpers */

/** The Monday-first week `off` weeks from this one. */
function weekDays(off: number): Date[] {
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  base.setDate(base.getDate() - ((base.getDay() + 6) % 7) + off * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return d;
  });
}

const weekLabel = (off: number) =>
  weekDays(off)[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Consecutive weeks, counting back, in which something was logged. */
function streakWeeks(workouts: Workout[]): number {
  if (!workouts.length) return 0;
  const done = new Set(workouts.map((w) => w.on_date));
  let n = 0;
  for (let off = 0; off > -104; off--) {
    const any = weekDays(off).map(ymd).some((d) => done.has(d));
    if (!any) {
      // A week that has only just started is not a broken streak.
      if (off === 0) continue;
      break;
    }
    n += 1;
  }
  return n;
}
