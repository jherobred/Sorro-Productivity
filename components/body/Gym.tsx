'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { BodyMap } from './Instruments';
import { PAL } from '@/lib/pal';
import { toast } from '@/lib/toast';
import { ask, confirmAsk } from '@/lib/ask';
import { ymd } from '@/lib/series';
import { useSets, useSetActions } from '@/lib/gym';
import {
  EXERCISES, MUSCLES, e1rm, volumeOf, bestByExercise, groupsOfSets, lastTime, nextSet,
  groupOf, kindOf, type WorkoutSet, type Muscle,
} from '@/lib/lift';
import { GROUP_LABEL, heatOf, type Group, type Workout } from '@/lib/body';

/**
 * Trained, rebuilt as a gym log.
 *
 * What was here: a silhouette you tapped, which wrote a session called "Legs"
 * lasting a made-up forty-five minutes, and a list of those sessions. It could
 * tell you that you went. It could not tell you what you did, and so there was
 * no reason to open it a second time.
 *
 * This is openGym's shape in Basedly's clothes. A session is a card you fill
 * while you are standing there: exercises, and under each one a numbered row
 * per set carrying a weight and a rep count. The next set arrives already
 * filled in with the last one, so logging is a tap. Ticking a set starts the
 * rest clock, because the clock is the reason people hold their phone between
 * sets in the first place.
 *
 * Three numbers do the work of a progress screen. **Volume** — the weight
 * actually moved — is the honest measure of a session. **An estimated max**
 * makes two different sets comparable. **A best** turns the second into a
 * thing worth beating, and beating one says so on the row, once, and then gets
 * out of the way.
 *
 * The silhouette stays, because "what have I not trained this week" is a real
 * question and a picture answers it faster than a list. It no longer invents a
 * session when you tap it; it opens the exercises for that muscle.
 */

const CARD: React.CSSProperties = {
  background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--sh)', border: '1px solid var(--line)',
};
const KICKER: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)',
};

/** How long the rest clock runs. Ninety seconds is the usual compromise. */
const REST_S = 90;

const GROUP_HUE: Record<Muscle, string> = {
  chest: PAL.coral, back: PAL.indigo, arms: PAL.violet,
  core: PAL.amber, legs: PAL.mint, cardio: PAL.cyan,
};

/**
 * Routines, as three taps rather than a builder.
 *
 * openGym ships a routine editor; this ships the four splits a student
 * actually uses. Picking one drops its exercises into the session empty — no
 * sets, no numbers, nothing claimed to have happened. You still log what you
 * lift.
 */
const ROUTINES: { id: string; name: string; icon: IconName; hue: string; exercises: string[] }[] = [
  { id: 'push', name: 'Push', icon: 'up', hue: PAL.coral, exercises: ['Bench press', 'Incline press', 'Overhead press', 'Cable pushdown'] },
  { id: 'pull', name: 'Pull', icon: 'download', hue: PAL.indigo, exercises: ['Deadlift', 'Barbell row', 'Lat pulldown', 'Barbell curl'] },
  { id: 'legs', name: 'Legs', icon: 'walk', hue: PAL.mint, exercises: ['Back squat', 'Romanian deadlift', 'Leg press', 'Calf raise'] },
  { id: 'cardio', name: 'Cardio', icon: 'flame', hue: PAL.cyan, exercises: ['Run'] },
];

export function Gym({
  today, workouts, phone, addWorkout, editWorkout, delWorkout,
}: {
  today: string;
  workouts: Workout[];
  phone: boolean;
  addWorkout: (w: Workout) => void;
  editWorkout: (id: string, patch: Partial<Workout>) => void;
  delWorkout: (id: string) => void;
}) {
  // Newest first, which is also the order `lastTime` ranks by.
  const order = useMemo(
    () => [...workouts].sort((a, b) => b.on_date.localeCompare(a.on_date)).map((w) => w.id),
    [workouts],
  );
  const ids = useMemo(() => workouts.map((w) => w.id), [workouts]);
  const { data: sets = [] } = useSets(ids);
  const S = useSetActions(ids);

  const session = workouts.find((w) => w.on_date === today) ?? null;
  const [picking, setPicking] = useState<Muscle | 'all' | null>(null);
  const [rest, setRest] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const mine = useMemo(
    () => sets.filter((s) => s.workout_id === session?.id).sort((a, b) => a.position - b.position),
    [sets, session?.id],
  );

  /** What each exercise looked like before today — the prefill, and the bar to beat. */
  const previously = useMemo(() => lastTime(sets, order, session?.id), [sets, order, session?.id]);
  const bests = useMemo(
    () => bestByExercise(sets.filter((s) => s.workout_id !== session?.id)),
    [sets, session?.id],
  );

  /** Exercises in the session, in the order they were first logged. */
  const blocks = useMemo(() => {
    const out: { exercise: string; sets: WorkoutSet[] }[] = [];
    for (const s of mine) {
      const hit = out.find((b) => b.exercise === s.exercise);
      if (hit) hit.sets.push(s);
      else out.push({ exercise: s.exercise, sets: [s] });
    }
    return out;
  }, [mine]);

  const heat = useMemo(() => heatOf(workouts, 7), [workouts]);
  const volume = volumeOf(mine);

  /* ------------------------------------------------------------ the clock */

  useEffect(() => {
    if (rest === null) return;
    if (rest <= 0) { setRest(null); return; }
    const t = setTimeout(() => setRest((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(t);
  }, [rest]);

  /* ------------------------------------------------------------ the verbs */

  const start = (routine?: typeof ROUTINES[number]) => {
    const id = crypto.randomUUID();
    addWorkout({ id, on_date: today, name: routine?.name ?? 'Session', groups: [], minutes: 0 });
    if (routine) {
      // The routine names the movements; it does not claim any were done.
      setEmptyBlocks(routine.exercises);
      setPicking(null);
    } else {
      setPicking('all');
    }
  };

  /** Exercises chosen but not yet logged — a heading with an Add set under it. */
  const [empties, setEmpties] = useState<string[]>([]);
  const setEmptyBlocks = (list: string[]) => setEmpties(list);

  const shown = useMemo(() => {
    const named = blocks.map((b) => b.exercise);
    return [...blocks, ...empties.filter((e) => !named.includes(e)).map((e) => ({ exercise: e, sets: [] as WorkoutSet[] }))];
  }, [blocks, empties]);

  /** Whatever the session now contains, written back to the row the map reads. */
  const restamp = (after: WorkoutSet[]) => {
    if (!session) return;
    const groups = groupsOfSets(after) as Group[];
    // Two and a half minutes a set is a rough but honest stand-in for a stopwatch
    // nobody remembers to start. ponytail: swap for real elapsed time if the
    // session ever gets a start timestamp.
    const minutes = Math.max(1, Math.round(after.length * 2.5));
    if (groups.join() !== session.groups.join() || minutes !== session.minutes) {
      editWorkout(session.id, { groups, minutes });
    }
  };

  const logSet = (exercise: string) => {
    if (!session) return;
    const inSession = [...mine].reverse().find((s) => s.exercise === exercise);
    const seed = nextSet(inSession ?? previously[exercise], kindOf(exercise));
    const row: WorkoutSet = {
      id: crypto.randomUUID(), workout_id: session.id, exercise,
      position: mine.length, done: true, ...seed,
    };
    S.addSet.mutate(row);
    restamp([...mine, row]);
    setRest(REST_S);
    setEmpties((e) => e.filter((x) => x !== exercise));
    if (bests[exercise] && e1rm(row.weight_kg, row.reps) > bests[exercise]) announce(exercise);
  };

  const change = (s: WorkoutSet, patch: Partial<WorkoutSet>) => {
    S.editSet.mutate({ id: s.id, patch });
    const next = { ...s, ...patch };
    if (patch.done !== false && bests[s.exercise] && e1rm(next.weight_kg, next.reps) > bests[s.exercise]) {
      announce(s.exercise);
    }
  };

  const announce = (exercise: string) => {
    setFlash(exercise);
    toast(`New best on ${exercise.toLowerCase()}`);
    window.setTimeout(() => setFlash((f) => (f === exercise ? null : f)), 2200);
  };

  const drop = (s: WorkoutSet) => {
    S.delSet.mutate({ id: s.id });
    restamp(mine.filter((x) => x.id !== s.id));
  };

  const addExercise = (name: string) => {
    setPicking(null);
    setEmpties((e) => (e.includes(name) || blocks.some((b) => b.exercise === name) ? e : [...e, name]));
  };

  const endSession = async () => {
    if (!session) return;
    if (mine.length === 0) {
      // Nothing was logged, so there is nothing to keep — and an empty session
      // left on the calendar is a gym day that never happened.
      const yes = await confirmAsk('Nothing logged — throw it away?', {
        message: 'The session has no sets in it.', confirmLabel: 'Discard', danger: true,
      });
      if (yes) { delWorkout(session.id); setEmpties([]); }
      return;
    }
    setRest(null);
    setEmpties([]);
    toast(`${session.name} done — ${volume.toLocaleString()} kg moved`);
  };

  /* --------------------------------------------------------------- render */

  return (
    <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'minmax(0,1fr) 320px', gap: 14, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 14 }}>
        {session ? (
          <div style={{ ...CARD, padding: '15px 15px 14px', position: 'relative', overflow: 'hidden' }}>
            <span aria-hidden className="aur" style={{
              position: 'absolute', right: '-10%', top: '-60%', width: '46%', height: '200%', borderRadius: '50%',
              background: 'radial-gradient(circle, color-mix(in srgb, var(--acc) 26%, transparent) 0%, transparent 70%)',
              filter: 'blur(34px)', pointerEvents: 'none',
            }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 11, position: 'relative' }}>
              <span className="glowring" style={{
                width: 40, height: 40, flex: 'none', borderRadius: 13, display: 'grid', placeItems: 'center',
                background: 'color-mix(in srgb, var(--acc) 18%, var(--card2))',
                border: '1px solid color-mix(in srgb, var(--acc) 45%, transparent)',
              }}>
                <Icon name="gym" size={19} color="var(--accTx)" />
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={KICKER}>Today</div>
                <button
                  onClick={() => void ask('Name this session', { initial: session.name, placeholder: 'Push, Legs, Leg day 2…' })
                    .then((v) => { if (v) editWorkout(session.id, { name: v }); })}
                  className="k-underline"
                  style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.022em', textAlign: 'left' }}>
                  {session.name || 'Session'}
                </button>
              </div>

              <Readout label="sets" value={String(mine.length)} hue="var(--tx2)" />
              <Readout label="kg moved" value={volume.toLocaleString()} hue="var(--accTx)" />
            </div>

            {shown.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.7, margin: '14px 0 0' }}>
                Empty so far. Add an exercise and the first set arrives already filled in with whatever
                you did last time.
              </p>
            )}

            <div className="k-stagger" style={{ display: 'grid', gap: 10, marginTop: 13 }}>
              {shown.map((b, i) => (
                <div key={b.exercise} style={{ '--i': i } as React.CSSProperties}>
                  <Block
                    exercise={b.exercise}
                    sets={b.sets}
                    last={previously[b.exercise]}
                    best={bests[b.exercise] ?? 0}
                    flashing={flash === b.exercise}
                    onAdd={() => logSet(b.exercise)}
                    onChange={change}
                    onDrop={drop}
                    onRemove={() => setEmpties((e) => e.filter((x) => x !== b.exercise))} />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 13, flexWrap: 'wrap' }}>
              <button onClick={() => setPicking('all')} className="k-squish"
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 11,
                  background: 'var(--acc)', color: 'var(--ink)', fontSize: 12, fontWeight: 800, minHeight: 40,
                }}>
                <Icon name="plus" size={14} color="var(--ink)" />Add an exercise
              </button>
              <button onClick={() => void endSession()} className="hov k-squish"
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 11,
                  border: '1px solid var(--line2)', fontSize: 12, fontWeight: 700, color: 'var(--tx2)', minHeight: 40,
                }}>
                <Icon name="check" size={14} color="var(--tx3)" />Finish
              </button>
            </div>

            {rest !== null && <RestClock left={rest} onAdd={() => setRest((r) => (r ?? 0) + 30)} onSkip={() => setRest(null)} />}
          </div>
        ) : (
          <Start onStart={start} last={workouts[0] ?? null} sets={sets} />
        )}

        <History workouts={workouts.filter((w) => w.on_date !== today)} sets={sets} onDelete={delWorkout} />
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ ...CARD, padding: '16px 14px 14px', display: 'grid', gap: 10 }}>
          <div style={KICKER}>This week — tap a muscle to train it</div>
          <BodyMap heat={heat} onTap={(g) => { if (!session) start(); setPicking(g as Muscle); }} />
        </div>

        <Consistency workouts={workouts} sets={sets} />
        <Bests bests={bests} sets={sets} />
      </div>

      {picking && (
        <Picker group={picking} onClose={() => setPicking(null)} onPick={addExercise}
          recent={Object.keys(previously)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- one exercise */

function Block({
  exercise, sets, last, best, flashing, onAdd, onChange, onDrop, onRemove,
}: {
  exercise: string;
  sets: WorkoutSet[];
  last?: WorkoutSet;
  best: number;
  flashing: boolean;
  onAdd: () => void;
  onChange: (s: WorkoutSet, patch: Partial<WorkoutSet>) => void;
  onDrop: (s: WorkoutSet) => void;
  onRemove: () => void;
}) {
  const hue = GROUP_HUE[groupOf(exercise)];
  const kind = kindOf(exercise);
  const top = sets.reduce((n, s) => Math.max(n, s.done ? e1rm(s.weight_kg, s.reps) : 0), 0);

  return (
    <div style={{
      borderRadius: 13, border: `1px solid ${flashing ? hue : 'var(--line)'}`,
      background: 'var(--card2)', padding: '10px 11px 9px',
      boxShadow: flashing ? `0 0 0 3px color-mix(in srgb, ${hue} 22%, transparent)` : undefined,
      transition: 'box-shadow .3s ease, border-color .3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: hue, flex: 'none' }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '-.01em', flex: 1, minWidth: 0 }}>
          {exercise}
        </span>

        {flashing && (
          <span className="pop" style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999,
            background: `color-mix(in srgb, ${hue} 20%, transparent)`, color: hue,
            fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em',
          }}>
            <Icon name="trophy" size={10} color={hue} />BEST
          </span>
        )}

        {!flashing && best > 0 && (
          <span title={`Your best estimated single: ${best} kg`}
            style={{ fontSize: 10, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
            best {best}
          </span>
        )}

        {sets.length === 0 && (
          <button onClick={onRemove} className="hov" aria-label={`Remove ${exercise}`}
            style={{ width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={11} color="var(--tx3)" />
          </button>
        )}
      </div>

      {sets.length === 0 && (
        <div style={{ fontSize: 10.5, color: 'var(--tx3)', margin: '5px 0 0', paddingLeft: 16 }}>
          {last
            ? `Last time: ${last.weight_kg > 0 ? `${last.weight_kg} kg × ` : ''}${last.reps}`
            : 'Nothing logged for this one yet'}
        </div>
      )}

      {sets.map((s, i) => (
        <SetRow key={s.id} n={i + 1} set={s} hue={hue} kind={kind}
          top={top > 0 && e1rm(s.weight_kg, s.reps) === top}
          onChange={(p) => onChange(s, p)} onDrop={() => onDrop(s)} />
      ))}

      <button onClick={onAdd} className="hov k-squish"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '6px 10px', minHeight: 32,
          borderRadius: 9, border: '1px dashed var(--line2)', fontSize: 11, fontWeight: 700, color: 'var(--tx2)',
        }}>
        <Icon name="plus" size={12} color="var(--tx3)" />
        {sets.length ? 'Another set' : 'First set'}
      </button>
    </div>
  );
}

/**
 * One set. The tick is the control that matters — it is what says the set
 * happened, and it is what starts the rest clock. The two numbers beside it are
 * already correct most of the time, which is the point of prefilling them.
 */
function SetRow({
  n, set: s, hue, kind, top, onChange, onDrop,
}: {
  n: number; set: WorkoutSet; hue: string; kind: string; top: boolean;
  onChange: (p: Partial<WorkoutSet>) => void;
  onDrop: () => void;
}) {
  const num = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, '')) || 0);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0 5px 16px',
      opacity: s.done ? 1 : 0.55,
    }}>
      <span style={{
        width: 17, height: 17, flex: 'none', borderRadius: 5, display: 'grid', placeItems: 'center',
        background: 'var(--card)', fontSize: 9.5, fontWeight: 800, color: 'var(--tx3)',
      }}>
        {n}
      </span>

      {kind !== 'bodyweight' && (
        <>
          <input value={s.weight_kg || ''} inputMode="decimal" aria-label={`Weight for set ${n}`}
            onChange={(e) => onChange({ weight_kg: num(e.target.value) })}
            placeholder="0" style={NUM} />
          <span style={UNIT}>kg</span>
        </>
      )}

      <input value={s.reps || ''} inputMode="numeric" aria-label={`Reps for set ${n}`}
        onChange={(e) => onChange({ reps: Math.round(num(e.target.value)) })}
        placeholder="0" style={NUM} />
      <span style={UNIT}>{kind === 'cardio' ? 'min' : 'reps'}</span>

      {top && s.done && kind === 'weight' && (
        <span title="Heaviest set of this exercise today"
          style={{ fontSize: 9.5, fontWeight: 800, color: hue, letterSpacing: '.04em' }}>TOP</span>
      )}

      <button onClick={() => onChange({ done: !s.done })} aria-pressed={s.done}
        aria-label={s.done ? `Set ${n} done` : `Mark set ${n} done`} className="k-squish"
        style={{
          marginLeft: 'auto', width: 26, height: 26, flex: 'none', borderRadius: 999,
          display: 'grid', placeItems: 'center',
          border: `1.5px solid ${s.done ? hue : 'var(--line2)'}`,
          background: s.done ? `color-mix(in srgb, ${hue} 22%, transparent)` : 'transparent',
        }}>
        <Icon name="check" size={12} color={s.done ? hue : 'var(--tx3)'} />
      </button>

      <button onClick={onDrop} className="hov" aria-label={`Delete set ${n}`}
        style={{ width: 24, height: 24, flex: 'none', borderRadius: 7, display: 'grid', placeItems: 'center' }}>
        <Icon name="close" size={11} color="var(--tx3)" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------- rest clock */

/** A ring that empties. It is the reason a phone is in your hand between sets. */
function RestClock({ left, onAdd, onSkip }: { left: number; onAdd: () => void; onSkip: () => void }) {
  const R = 15;
  const C = 2 * Math.PI * R;
  const frac = Math.max(0, Math.min(1, left / REST_S));

  return (
    <div className="rise" style={{
      display: 'flex', alignItems: 'center', gap: 11, marginTop: 12, padding: '9px 12px',
      borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--line2)',
    }}>
      <span style={{ position: 'relative', width: 36, height: 36, flex: 'none' }}>
        <svg viewBox="0 0 36 36" width={36} height={36} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="18" cy="18" r={R} fill="none" stroke="var(--line)" strokeWidth="3" />
          <circle cx="18" cy="18" r={R} fill="none" stroke="var(--acc)" strokeWidth="3" strokeLinecap="round"
            className="k-ring linear" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
        </svg>
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...KICKER, marginBottom: 1 }}>Rest</div>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </div>
      </div>

      <button onClick={onAdd} className="hov k-squish" style={CLOCK_BTN}>+30s</button>
      <button onClick={onSkip} className="hov k-squish" style={CLOCK_BTN}>Skip</button>
    </div>
  );
}

/* ------------------------------------------------------------- no session */

function Start({
  onStart, last, sets,
}: {
  onStart: (r?: typeof ROUTINES[number]) => void;
  last: Workout | null;
  sets: WorkoutSet[];
}) {
  const lastSets = last ? sets.filter((s) => s.workout_id === last.id) : [];

  return (
    <div style={{ ...CARD, padding: '20px 16px 16px', display: 'grid', gap: 14, justifyItems: 'center', textAlign: 'center' }}>
      <span className="glowring" style={{
        width: 54, height: 54, borderRadius: 17, display: 'grid', placeItems: 'center',
        background: 'color-mix(in srgb, var(--acc) 16%, var(--card2))',
        border: '1px solid color-mix(in srgb, var(--acc) 42%, transparent)',
      }}>
        <Icon name="gym" size={26} color="var(--accTx)" />
      </span>

      <div>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.025em' }}>Nothing logged today</div>
        <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 4, lineHeight: 1.6 }}>
          {last
            ? `Last in: ${last.name || 'Session'} on ${last.on_date}${lastSets.length ? ` · ${lastSets.length} set${lastSets.length === 1 ? '' : 's'} · ${volumeOf(lastSets).toLocaleString()} kg` : ''}`
            : 'Pick a split, or start empty and add as you go.'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {ROUTINES.map((r) => (
          <button key={r.id} onClick={() => onStart(r)} className="hov k-squish"
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', minHeight: 40, borderRadius: 11,
              border: `1px solid color-mix(in srgb, ${r.hue} 40%, transparent)`,
              background: `color-mix(in srgb, ${r.hue} 10%, transparent)`,
              fontSize: 12, fontWeight: 800, color: r.hue,
            }}>
            <Icon name={r.icon} size={14} color={r.hue} />{r.name}
          </button>
        ))}
      </div>

      <button onClick={() => onStart()} className="k-squish"
        style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', minHeight: 44, borderRadius: 12,
          background: 'var(--acc)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 800,
        }}>
        <Icon name="play" size={14} color="var(--ink)" />Start an empty session
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- picker */

function Picker({
  group, recent, onClose, onPick,
}: { group: Muscle | 'all'; recent: string[]; onClose: () => void; onPick: (name: string) => void }) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Muscle | 'all'>(group);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { box.current?.focus(); }, []);

  const needle = q.trim().toLowerCase();
  const list = EXERCISES.filter((e) =>
    (needle ? e.name.toLowerCase().includes(needle) : tab === 'all' || e.group === tab));

  const typed = needle && !EXERCISES.some((e) => e.name.toLowerCase() === needle) ? q.trim() : null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 92, background: 'rgba(0,0,0,.55)',
      display: 'grid', placeItems: 'center', padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add an exercise"
        className="k-bloom" style={{
          width: 460, maxWidth: '100%', maxHeight: '80dvh', display: 'flex', flexDirection: 'column',
          background: 'var(--card)', border: '1px solid var(--line2)', borderRadius: 18,
          boxShadow: 'var(--shl)', overflow: 'hidden',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px 10px' }}>
          <Icon name="gym" size={16} color="var(--accTx)" />
          <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>Add an exercise</h2>
          <button onClick={onClose} className="hov k-squish" aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        <div style={{ padding: '0 15px 10px' }}>
          <input ref={box} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search, or type something of your own" aria-label="Search exercises"
            style={{
              width: '100%', minHeight: 38, padding: '9px 12px', borderRadius: 11,
              border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 12.5,
            }} />
        </div>

        {!needle && (
          <div className="hbar" style={{ display: 'flex', gap: 5, padding: '0 15px 10px', overflowX: 'auto' }}>
            {(['all', ...MUSCLES] as const).map((g) => (
              <button key={g} onClick={() => setTab(g)} className="k-chip" aria-pressed={tab === g}
                style={{
                  flex: 'none', padding: '5px 11px', minHeight: 30, borderRadius: 999,
                  fontSize: 11, fontWeight: 700,
                  border: `1px solid ${tab === g ? (g === 'all' ? 'var(--acc)' : GROUP_HUE[g]) : 'var(--line2)'}`,
                  color: tab === g ? (g === 'all' ? 'var(--accTx)' : GROUP_HUE[g]) : 'var(--tx3)',
                  background: tab === g ? `color-mix(in srgb, ${g === 'all' ? 'var(--acc)' : GROUP_HUE[g]} 14%, transparent)` : 'transparent',
                }}>
                {g === 'all' ? 'Everything' : GROUP_LABEL[g]}
              </button>
            ))}
          </div>
        )}

        <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 9px 10px' }}>
          {typed && (
            <button onClick={() => onPick(typed)} className="hov"
              style={{ ...PICK_ROW, border: '1px dashed var(--line2)' }}>
              <Icon name="plus" size={14} color="var(--accTx)" />
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>Add “{typed}”</span>
            </button>
          )}

          {list.map((e) => (
            <button key={e.id} onClick={() => onPick(e.name)} className="hov" style={PICK_ROW}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: GROUP_HUE[e.group], flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, textAlign: 'left' }}>{e.name}</span>
              {recent.includes(e.name) && (
                <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--tx3)', letterSpacing: '.06em' }}>DONE BEFORE</span>
              )}
              <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{GROUP_LABEL[e.group]}</span>
            </button>
          ))}

          {list.length === 0 && !typed && (
            <p style={{ fontSize: 11.5, color: 'var(--tx3)', textAlign: 'center', padding: 24 }}>Nothing matching.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- the week */

/**
 * Four weeks as squares, warmest where the most was moved. openGym's activity
 * map, and the only view in the section that answers "am I actually going"
 * without any reading.
 */
function Consistency({ workouts, sets }: { workouts: Workout[]; sets: WorkoutSet[] }) {
  const cells = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const w of workouts) {
      const v = volumeOf(sets.filter((s) => s.workout_id === w.id));
      byDate.set(w.on_date, (byDate.get(w.on_date) ?? 0) + Math.max(v, 1));
    }
    const peak = Math.max(1, ...byDate.values());
    return Array.from({ length: 28 }, (_, i) => {
      const d = ymd(new Date(Date.now() - (27 - i) * 864e5));
      const v = byDate.get(d) ?? 0;
      return { day: d, level: v === 0 ? 0 : Math.min(3, Math.ceil((v / peak) * 3)) };
    });
  }, [workouts, sets]);

  const went = cells.filter((c) => c.level > 0).length;

  return (
    <div style={{ ...CARD, padding: '14px 14px 12px', display: 'grid', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={KICKER}>Four weeks</div>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)' }}>{went} of 28 days</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((c) => (
          <span key={c.day} title={c.day} style={{
            aspectRatio: '1', borderRadius: 5,
            background: c.level === 0 ? 'var(--card2)' : `color-mix(in srgb, var(--acc) ${[0, 26, 55, 100][c.level]}%, transparent)`,
          }} />
        ))}
      </div>
    </div>
  );
}

/** The lifts you are strongest at, as estimated singles. The thing to beat. */
function Bests({ bests, sets }: { bests: Record<string, number>; sets: WorkoutSet[] }) {
  const rows = Object.entries(bests)
    .filter(([name]) => kindOf(name) === 'weight')
    .sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div style={{ ...CARD, padding: '14px 14px 12px', display: 'grid', gap: 8 }}>
      <div style={KICKER}>Personal bests</div>
      {rows.length === 0 && (
        <p style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.6, margin: 0 }}>
          Log a set with a weight on it and the estimate appears here.
        </p>
      )}
      {rows.map(([name, kg]) => {
        const hue = GROUP_HUE[groupOf(name)];
        const done = sets.filter((s) => s.exercise === name && s.done).length;
        return (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: hue, flex: 'none' }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </span>
            <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{done} set{done === 1 ? '' : 's'}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: hue, fontVariantNumeric: 'tabular-nums' }}>
              {kg}<span style={{ fontSize: 9.5, color: 'var(--tx3)', fontWeight: 700 }}> kg</span>
            </span>
          </div>
        );
      })}
      {rows.length > 0 && (
        <p style={{ fontSize: 9.5, color: 'var(--tx3)', margin: '2px 0 0', lineHeight: 1.5 }}>
          Estimated from your heaviest set, not a single you have actually pulled.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- past days */

function History({
  workouts, sets, onDelete,
}: { workouts: Workout[]; sets: WorkoutSet[]; onDelete: (id: string) => void }) {
  const past = [...workouts].sort((a, b) => b.on_date.localeCompare(a.on_date));

  return (
    <div style={{ ...CARD, padding: '14px 15px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={KICKER}>Before today</div>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)' }}>
          {past.length} session{past.length === 1 ? '' : 's'} in four weeks
        </span>
      </div>

      {past.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.7, margin: 0 }}>
          Nothing yet. What you log here is also what the gym challenges count.
        </p>
      )}

      {past.map((w) => {
        const mine = sets.filter((s) => s.workout_id === w.id);
        const v = volumeOf(mine);
        return (
          <div key={w.id} className="row" style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 3px', borderBottom: '1px solid var(--line)',
          }}>
            <span style={{
              width: 30, height: 30, flex: 'none', borderRadius: 9, display: 'grid', placeItems: 'center',
              background: 'var(--card2)',
            }}>
              <Icon name="gym" size={14} color={GROUP_HUE[(w.groups[0] as Muscle) ?? 'core'] ?? PAL.mint} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>{w.name || 'Session'}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)' }}>
                {w.groups.map((g) => GROUP_LABEL[g as Group] ?? g).join(' · ') || '—'}
                {mine.length > 0 && ` · ${mine.length} set${mine.length === 1 ? '' : 's'} · ${v.toLocaleString()} kg`}
              </span>
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{w.on_date}</span>
            <button onClick={() => onDelete(w.id)} className="hov" aria-label={`Delete ${w.name}`}
              style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
              <Icon name="close" size={12} color="var(--tx3)" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

function Readout({ label, value, hue }: { label: string; value: string; hue: string }) {
  return (
    <div style={{ textAlign: 'right', flex: 'none' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: hue, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ ...KICKER, marginTop: 1 }}>{label}</div>
    </div>
  );
}

const NUM: React.CSSProperties = {
  width: 46, minHeight: 30, padding: '4px 7px', borderRadius: 8, textAlign: 'center',
  border: '1px solid var(--line2)', background: 'var(--card)', color: 'var(--tx)',
  fontSize: 12.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
};
const UNIT: React.CSSProperties = { fontSize: 9.5, color: 'var(--tx3)', fontWeight: 700 };
const CLOCK_BTN: React.CSSProperties = {
  flex: 'none', padding: '6px 11px', minHeight: 32, borderRadius: 9,
  border: '1px solid var(--line2)', fontSize: 11, fontWeight: 700, color: 'var(--tx2)',
};
const PICK_ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 10px',
  minHeight: 42, borderRadius: 10, textAlign: 'left',
};
