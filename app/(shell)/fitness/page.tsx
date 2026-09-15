'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { ExerciseShot } from '@/components/body/ExerciseShot';
import { useTraining, TrainingOverlays, type Training } from '@/components/body/Gym';
import { MemoriesPanel } from '@/components/memories/Memories';
import { usePrefs } from '@/lib/prefs';
import { toast } from '@/lib/toast';
import { ask, confirmAsk } from '@/lib/ask';
import { ymd } from '@/lib/series';
import { useWorkouts, useBodyActions, heatOf, GROUPS, GROUP_LABEL, type Workout } from '@/lib/body';
import { useSetActions } from '@/lib/gym';
import { useMemories } from '@/lib/memories';
import { routineOf, slotFor, volumeOf, kindOf, gearOf, workedOf, setsLine, ROUTINES, type WorkoutSet } from '@/lib/lift';
import type { CaptureDraft } from '@/components/memories/MemoryCapture';
import './fitness.css';

const MemoryCapture = dynamic(() => import('@/components/memories/MemoryCapture').then((m) => m.MemoryCapture), { ssr: false });

const REST_S = 90;
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const clock = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

/** Monday-first days of the week containing `today`. */
function weekOf(today: string): Date[] {
  const [y, m, d] = today.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  const monday = new Date(base);
  monday.setDate(base.getDate() - slotFor(base.getDay()));
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
}

export default function FitnessPage() {
  const { prefs, update } = usePrefs();
  const today = ymd(new Date());
  const { data: workouts = [] } = useWorkouts(28);
  const A = useBodyActions(30, today);
  const T = useTraining({
    today, workouts,
    addWorkout: (w) => A.addWorkout.mutate(w),
    editWorkout: (id, patch) => A.editWorkout.mutate({ id, patch }),
    delWorkout: (id) => A.delWorkout.mutate({ id }),
  });
  const S = useSetActions(useMemo(() => workouts.map((w) => w.id), [workouts]));
  const { list: memories } = useMemories(['workout', 'run', 'moment']);
  const [capture, setCapture] = useState<null | 'photo' | 'run'>(null);
  const [open, setOpen] = useState<string | null>(null);

  const { session, blocks, plan, todayRoutine, mine, previously, sets, bests } = T;
  const planned = session ? routineOf(plan[slotFor(new Date().getDay())]) : todayRoutine;
  const doneSets = mine.filter((s) => s.done).length;
  const totalSets = Math.max(mine.length, blocks.length * 3);
  const minutesGuess = Math.max(10, Math.round((planned?.exercises.length ?? 4) * 3 * 2.6));

  /* ---- numbers */
  const streak = useMemo(() => {
    const done = new Set(workouts.map((w) => w.on_date));
    let n = 0;
    for (let i = 0; i < 60; i++) {
      const d = ymd(new Date(Date.now() - i * 864e5));
      if (done.has(d)) n++;
      else if (i > 0) break;
    }
    return n;
  }, [workouts]);
  const week = weekOf(today);
  const weekDates = week.map(ymd);
  const sessionsThisWeek = workouts.filter((w) => weekDates.includes(w.on_date)).length;
  const plannedThisWeek = plan.filter(Boolean).length;
  const strength = (s: WorkoutSet) => kindOf(s.exercise) !== 'cardio';
  const weekIds = new Set(workouts.filter((w) => weekDates.includes(w.on_date)).map((w) => w.id));
  const weekVolume = volumeOf(sets.filter((s) => weekIds.has(s.workout_id) && strength(s)));
  const runKm = memories.filter((m) => m.kind === 'run' && weekDates.includes(ymd(new Date(m.at)))).reduce((sum, m) => sum + (m.km ?? 0), 0);
  const latestWeight = [...T.days].reverse().find((d) => d.weight)?.weight ?? null;
  const heat = useMemo(() => heatOf(workouts, 7), [workouts]);
  const topLifts = Object.entries(bests).filter(([name, v]) => v > 0 && kindOf(name) !== 'cardio').sort((a, b) => b[1] - a[1]).slice(0, 4);

  /*
   * A workout is in progress only once it has been started. Today's workout
   * can also exist because a run was logged or a session was finished, and
   * neither should read as a clock still running.
   */
  const startAt = prefs.gymStartAt;
  const active = !!session && !!startAt && startAt.startsWith(today);
  /** Today's workout holds lifting, rather than only a logged run. */
  const lifting = !!session && (active || blocks.some((b) => kindOf(b.exercise) !== 'cardio'));
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active || !startAt) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(startAt)) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [active, startAt]);

  /* ---- rest clock: starts on its own when a set is ticked */
  const [rest, setRest] = useState(0);
  const lastDone = useRef(doneSets);
  useEffect(() => {
    if (doneSets > lastDone.current) setRest(REST_S);
    lastDone.current = doneSets;
  }, [doneSets]);
  useEffect(() => {
    if (rest <= 0) return;
    const t = setTimeout(() => setRest((r) => Math.max(0, r - 1)), 1000);
    return () => clearTimeout(t);
  }, [rest]);

  /**
   * Starts the session clock. A day that so far only holds a run keeps the
   * run's workout, renamed for what is being trained now.
   */
  const beginLifting = (name = planned?.name ?? 'Workout') => {
    if (session && session.name === 'Run' && !mine.some(strength)) T.editWorkout(session.id, { name });
    void update({ gymStartAt: new Date().toISOString() });
  };

  const startWorkout = (guided: boolean) => {
    if (!active) beginLifting();
    T.start(active ? null : planned, guided);
  };

  /** Adding a set to a lift that is not under way yet starts the session around it. */
  const addSetTo = (exercise: string) => {
    if (!active && kindOf(exercise) !== 'cardio') {
      beginLifting();
      if (planned) T.setPending(planned.exercises);
    }
    T.logSet(exercise);
  };

  const finishWorkout = async () => {
    if (!session) return;
    if (!mine.length) {
      const yes = await confirmAsk('Nothing logged. Throw it away?', { message: 'The session has no sets in it.', confirmLabel: 'Discard', danger: true });
      if (!yes) return;
      T.delWorkout(session.id);
      T.setPending([]);
      T.setRunning(false);
    } else {
      await T.finish();
    }
    setRest(0);
    void update({ gymStartAt: undefined });
  };

  /** Guided mode and the exercise sheet go through the same clock as the page. */
  const overlays: Training = {
    ...T,
    finish: finishWorkout,
    addExercise: (name: string) => { if (!active) beginLifting(); T.addExercise(name); },
  };

  /** A run joins that day's workout, or starts one, and keeps its minutes as a cardio set. */
  const commitCapture = (d: CaptureDraft): string | null => {
    const day = ymd(new Date(d.at));
    if (d.kind === 'run') {
      const minutes = Math.round(d.minutes ?? 0);
      let workout: Workout | undefined = workouts.find((w) => w.on_date === day);
      if (!workout) {
        workout = { id: crypto.randomUUID(), on_date: day, name: 'Run', groups: ['cardio'], minutes };
        A.addWorkout.mutate(workout);
      } else {
        A.editWorkout.mutate({ id: workout.id, patch: { groups: [...new Set([...workout.groups, 'cardio'])], minutes: workout.minutes + minutes } });
      }
      S.addSet.mutate({ id: crypto.randomUUID(), workout_id: workout.id, exercise: 'Run', position: sets.filter((s) => s.workout_id === workout!.id).length, weight_kg: 0, reps: minutes, done: true });
      toast(`Run saved${d.km ? `: ${d.km} km` : ''}${minutes ? ` in ${minutes} min` : ''}`, undefined, { tone: 'success', icon: 'walk' });
      return `workout:${workout.id}`;
    }
    const linked = workouts.find((w) => w.on_date === day);
    toast(linked ? `Kept with ${linked.name}` : 'Memory kept', undefined, { tone: 'success', icon: 'camera' });
    return linked ? `workout:${linked.id}` : null;
  };

  const describe = (m: { ref: string | null }) => {
    const id = m.ref?.startsWith('workout:') ? m.ref.slice(8) : null;
    const w = id ? workouts.find((x) => x.id === id) : null;
    return w ? `${w.name} · ${new Date(`${w.on_date}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : null;
  };

  const todayRun = memories.find((m) => m.kind === 'run' && m.ref === `workout:${session?.id}`);
  const headline = active && session
    ? { kicker: 'In progress', title: session.name, sub: `${clock(elapsed)} · ${doneSets} of ${totalSets} sets` }
    : session
      ? { kicker: 'Done today', title: session.name, sub: [todayRun?.km ? `${todayRun.km} km` : null, session.minutes ? `${session.minutes} min` : null, doneSets ? `${doneSets} ${doneSets === 1 ? 'set' : 'sets'}` : null].filter(Boolean).join(' · ') || 'Logged. Nice work.' }
      : planned
      ? { kicker: 'Today', title: planned.name, sub: `${planned.exercises.length} exercises · about ${minutesGuess} min · ${planned.focus}` }
      : { kicker: 'Today', title: 'Rest day', sub: 'Nothing planned. A walk or a run still counts.' };

  const recent = [...workouts].sort((a, b) => b.on_date.localeCompare(a.on_date)).slice(0, 6);

  return (
    <div className="fit">
      <header className="fit-hero">
        <div className="fit-hero-copy">
          <span className="fit-kicker">{headline.kicker}</span>
          <h1>{headline.title}</h1>
          <p>{headline.sub}</p>
          {active && totalSets > 0 && <AsciiBar value={(doneSets / totalSets) * 100} hue="#ff6fa8" showValue={false} label={`${doneSets} of ${totalSets} sets done`} />}
        </div>
        <div className="fit-hero-actions">
          <button type="button" className="fit-primary" onClick={() => startWorkout(true)}>
            <Icon name="play" size={18} />{active ? 'Open guided mode' : session ? 'Keep training' : planned ? `Start ${planned.name}` : 'Start a workout'}
          </button>
          <div className="fit-hero-row">
            <button type="button" className="fit-secondary" onClick={() => setCapture('run')}><Icon name="walk" size={16} />Log a run</button>
            <button type="button" className="fit-secondary" onClick={() => setCapture('photo')}><Icon name="camera" size={16} />Capture</button>
          </div>
        </div>
      </header>

      <section className="fit-stats" aria-label="This week">
        <div className="fit-stat"><Icon name="flame" size={16} /><b>{streak}</b><span>day streak</span></div>
        <div className="fit-stat"><Icon name="cal" size={16} /><b>{sessionsThisWeek}<small>/{plannedThisWeek || '–'}</small></b><span>sessions this week</span></div>
        <div className="fit-stat"><Icon name="target" size={16} /><b>{weekVolume.toLocaleString()}<small> kg</small></b><span>lifted this week</span></div>
        <div className="fit-stat"><Icon name="walk" size={16} /><b>{Math.round(runKm * 10) / 10}<small> km</small></b><span>run this week</span></div>
        <button type="button" className="fit-stat is-button" onClick={T.logWeight}><Icon name="scale" size={16} /><b>{latestWeight ?? '–'}<small>{latestWeight ? ' kg' : ''}</small></b><span>{latestWeight ? 'weight, tap to log' : 'log your weight'}</span></button>
      </section>

      <div className="fit-grid">
        <div className="fit-main">
          <section className="fit-card" aria-label="This week's plan">
            <header className="fit-card-head">
              <h2>This week</h2>
              <button type="button" className="fit-link" onClick={() => T.setSheet('plan')}><Icon name="edit" size={14} />Edit plan</button>
            </header>
            <div className="fit-week">
              {week.map((d, i) => {
                const iso = ymd(d);
                const routine = routineOf(plan[i]);
                const done = T.doneDays.has(iso);
                const isToday = iso === today;
                return (
                  <button key={iso} type="button" className={'fit-day' + (isToday ? ' is-today' : '') + (done ? ' is-done' : '') + (routine ? '' : ' is-rest')}
                    onClick={() => T.setSheet('plan')} aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long' })}: ${routine?.name ?? 'Rest'}${done ? ', done' : ''}`}>
                    <span>{WEEK[i]}</span>
                    <b>{d.getDate()}</b>
                    <small>{routine ? routine.name.replace(/ Day| Body/, '') : 'Rest'}</small>
                    <i aria-hidden="true">{done && <Icon name="check" size={10} />}</i>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="fit-card" aria-label="Today's workout">
            <header className="fit-card-head">
              <div>
                <h2>{lifting && session ? session.name : planned ? `Today: ${planned.name}` : 'Today'}</h2>
                <p>{lifting ? (active ? `${doneSets} of ${totalSets} sets done` : `${mine.length} ${mine.length === 1 ? 'set' : 'sets'} logged`) : planned ? 'Tap a set to log it. The rest clock starts on its own.' : 'Pick exercises for a session of your own.'}</p>
              </div>
              {lifting && session && (
                <button type="button" className="fit-icon" aria-label="Rename workout" onClick={() => void ask('Name this workout', { initial: session.name, confirmLabel: 'Rename' }).then((v) => { if (v) T.editWorkout(session.id, { name: v }); })}>
                  <Icon name="edit" size={16} />
                </button>
              )}
            </header>

            {(lifting ? blocks.map((b) => b.exercise) : planned?.exercises ?? []).length === 0 ? (
              <div className="fit-empty">
                <p>No exercises yet.</p>
                <button type="button" className="fit-secondary" onClick={() => T.setSheet('exercises')}><Icon name="plus" size={15} />Add an exercise</button>
              </div>
            ) : (
              <ul className="fit-exercises">
                {(lifting ? blocks : (planned?.exercises ?? []).map((exercise) => ({ exercise, sets: [] as WorkoutSet[] }))).map((b) => {
                  const done = b.sets.filter((s) => s.done).length;
                  const expanded = open === b.exercise;
                  const last = previously[b.exercise];
                  return (
                    <li key={b.exercise} className={'fit-ex' + (expanded ? ' is-open' : '') + (b.sets.length && done === b.sets.length ? ' is-complete' : '')}>
                      <button type="button" className="fit-ex-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : b.exercise)}>
                        <span className="fit-thumb"><ExerciseShot exercise={b.exercise} compact still /></span>
                        <span className="fit-ex-copy">
                          <b>{b.exercise}</b>
                          <small>{last ? `Last time ${setsLine([last])}` : `${workedOf(b.exercise)} · ${gearOf(b.exercise)}`}</small>
                        </span>
                        <span className="fit-ex-dots" aria-label={`${done} of ${b.sets.length} sets done`}>
                          {b.sets.length ? b.sets.map((s) => <i key={s.id} className={s.done ? 'is-done' : ''} />) : <em>no sets</em>}
                        </span>
                      </button>
                      {expanded && (
                        <div className="fit-sets">
                          {b.sets.map((s, n) => (
                            <SetLine key={s.id} set={s} n={n + 1} cardio={kindOf(s.exercise) === 'cardio'}
                              onChange={(patch) => T.change(s, patch)} onDrop={() => T.drop(s)} />
                          ))}
                          <div className="fit-sets-actions">
                            <button type="button" className="fit-secondary" onClick={() => addSetTo(b.exercise)}><Icon name="plus" size={15} />Add a set</button>
                            {lifting && <button type="button" className="fit-text is-danger" onClick={() => T.removeExercise(b.exercise)}>Remove exercise</button>}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="fit-card-foot">
              <button type="button" className="fit-text" onClick={() => T.setSheet('exercises')}><Icon name="plus" size={15} />Add exercise</button>
              {active && <button type="button" className="fit-finish" onClick={() => void finishWorkout()}><Icon name="check" size={16} />Finish workout</button>}
              {!active && planned && <button type="button" className="fit-finish" onClick={() => startWorkout(false)}><Icon name="play" size={15} />{session ? 'Train again' : 'Start here'}</button>}
            </div>
          </section>

          <MemoriesPanel kinds={['workout', 'run', 'moment']} title="Fitness memories" onCapture={() => setCapture('photo')}
            describe={describe} empty="No workout memories yet. Snap your next session or run." />
        </div>

        <aside className="fit-side">
          <section className="fit-card" aria-label="Muscles worked">
            <header className="fit-card-head"><h2>Muscles, last 7 days</h2></header>
            <ul className="fit-heat">
              {GROUPS.map((g) => (
                <li key={g}>
                  <span>{GROUP_LABEL[g]}</span>
                  <AsciiBar value={heat[g] * 100} hue="#ff6fa8" showValue={false} label={`${GROUP_LABEL[g]} worked`} />
                  <em>{heat[g] >= 0.66 ? 'Worked hard' : heat[g] >= 0.25 ? 'Worked' : 'Fresh'}</em>
                </li>
              ))}
            </ul>
          </section>

          <section className="fit-card" aria-label="Best lifts">
            <header className="fit-card-head"><h2>Best lifts</h2></header>
            {topLifts.length ? (
              <ol className="fit-bests">
                {topLifts.map(([name, v]) => (
                  <li key={name}><span className="fit-thumb is-small"><ExerciseShot exercise={name} compact still /></span><b>{name}</b><em>{v} kg</em></li>
                ))}
              </ol>
            ) : <p className="fit-muted">Your estimated one-rep maxes appear after a few logged sets.</p>}
          </section>

          <section className="fit-card" aria-label="Recent sessions">
            <header className="fit-card-head"><h2>Recent sessions</h2></header>
            {recent.length ? (
              <ul className="fit-recent">
                {recent.map((w) => {
                  const own = sets.filter((s) => s.workout_id === w.id);
                  const lifted = volumeOf(own.filter(strength));
                  const run = memories.find((m) => m.ref === `workout:${w.id}` && m.kind === 'run');
                  return (
                    <li key={w.id}>
                      <span className={'fit-recent-mark' + (w.groups.includes('cardio') && !lifted ? ' is-run' : '')}><Icon name={w.groups.includes('cardio') && !lifted ? 'walk' : 'gym'} size={15} /></span>
                      <span className="fit-recent-copy">
                        <b>{w.name}</b>
                        <small>{new Date(`${w.on_date}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{w.minutes ? ` · ${w.minutes} min` : ''}</small>
                      </span>
                      <em>{run?.km ? `${run.km} km` : lifted ? `${lifted.toLocaleString()} kg` : `${own.length} ${own.length === 1 ? 'set' : 'sets'}`}</em>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="fit-muted">Your sessions will line up here.</p>}
          </section>

          <section className="fit-card is-routines" aria-label="Routines">
            <header className="fit-card-head"><h2>Routines</h2></header>
            <div className="fit-routines">
              {ROUTINES.map((r) => (
                <button key={r.id} type="button" onClick={() => { if (!active) beginLifting(r.name); T.start(r, true); }}>
                  <b>{r.name}</b><small>{r.focus}</small>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {rest > 0 && (
        <div className="fit-rest" role="timer" aria-live="off">
          <span>Rest</span>
          <b>{clock(rest)}</b>
          <button type="button" onClick={() => setRest((r) => Math.max(0, r - 15))} aria-label="Fifteen seconds less">−15</button>
          <button type="button" onClick={() => setRest((r) => r + 15)} aria-label="Fifteen seconds more">+15</button>
          <button type="button" onClick={() => setRest(0)}>Skip</button>
        </div>
      )}

      <TrainingOverlays T={overlays} />

      {capture && (
        <MemoryCapture mode="fitness" detailsOnly={capture === 'run'} initialKind={capture === 'run' ? 'run' : 'workout'}
          kinds={capture === 'run' ? ['run'] : ['workout', 'run', 'moment']}
          title={capture === 'run' ? 'Log a run' : 'Capture a memory'}
          onClose={() => setCapture(null)} onCommit={commitCapture} />
      )}
    </div>
  );
}

function SetLine({ set, n, cardio, onChange, onDrop }: {
  set: WorkoutSet; n: number; cardio: boolean;
  onChange: (patch: Partial<WorkoutSet>) => void;
  onDrop: () => void;
}) {
  const step = (field: 'weight_kg' | 'reps', by: number) => onChange({ [field]: Math.max(0, Math.round((set[field] + by) * 10) / 10) });
  return (
    <div className={'fit-set' + (set.done ? ' is-done' : '')}>
      <span className="fit-set-n">{n}</span>
      {!cardio && (
        <span className="fit-stepper" aria-label="Weight">
          <button type="button" onClick={() => step('weight_kg', -2.5)} aria-label="Less weight">−</button>
          <b>{set.weight_kg}<small> kg</small></b>
          <button type="button" onClick={() => step('weight_kg', 2.5)} aria-label="More weight">+</button>
        </span>
      )}
      <span className="fit-stepper" aria-label={cardio ? 'Minutes' : 'Reps'}>
        <button type="button" onClick={() => step('reps', cardio ? -5 : -1)} aria-label={cardio ? 'Fewer minutes' : 'Fewer reps'}>−</button>
        <b>{set.reps}<small>{cardio ? ' min' : ' reps'}</small></b>
        <button type="button" onClick={() => step('reps', cardio ? 5 : 1)} aria-label={cardio ? 'More minutes' : 'More reps'}>+</button>
      </span>
      <button type="button" className="fit-set-done" aria-pressed={set.done} aria-label={set.done ? `Set ${n} done` : `Mark set ${n} done`} onClick={() => onChange({ done: !set.done })}>
        <Icon name="check" size={16} />
      </button>
      <button type="button" className="fit-set-drop" aria-label={`Remove set ${n}`} onClick={onDrop}><Icon name="close" size={13} /></button>
    </div>
  );
}
