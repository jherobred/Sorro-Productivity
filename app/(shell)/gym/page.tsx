'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { Page } from '@/components/Page';
import { Counter } from '@/components/core/Counter';
import { MovementSheet } from '@/components/gym/MovementSheet';
import { useTraining, TrainingOverlays } from '@/components/body/Gym';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import { ymd } from '@/lib/series';
import { useTap } from '@/hooks/useTap';
import { PAL } from '@/lib/pal';
import { ask, confirmAsk } from '@/lib/ask';
import { toast } from '@/lib/toast';
import {
  routineOf, slotFor, shotOf, volumeOf, workedOf, gearOf,
  type Routine, type WorkoutSet,
} from '@/lib/lift';
import { useWorkouts, useBodyActions } from '@/lib/body';

const HUE = PAL.pink;
const MINT = PAL.mint;
const AMBER = PAL.amber;
const REST_S = 90;
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEK_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function GymPage() {
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const today = ymd(new Date());
  const [open, setOpen] = useState<{ exercise: string; sub: string } | null>(null);
  const [editingExercise, setEditingExercise] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number>(() => slotFor(new Date().getDay()));

  const { data: workouts = [] } = useWorkouts(28);
  const A = useBodyActions(30, today);
  const T = useTraining({
    today, workouts,
    addWorkout: (w) => A.addWorkout.mutate(w),
    editWorkout: (id, patch) => A.editWorkout.mutate({ id, patch }),
    delWorkout: (id) => A.delWorkout.mutate({ id }),
  });

  const { session, blocks, plan, todayRoutine, mine, previously, sets, bests } = T;
  const currentDaySlot = slotFor(new Date().getDay());

  // Active viewed routine based on selected slot in the week strip
  const activeRoutine = useMemo(() => {
    const routineId = plan[selectedSlot];
    return routineOf(routineId) ?? todayRoutine;
  }, [plan, selectedSlot, todayRoutine]);

  // Track dynamically removed / added exercises for today's workout
  const [removedExercises, setRemovedExercises] = useState<string[]>([]);
  const [addedExercises, setAddedExercises] = useState<string[]>([]);

  // Base routine exercises list
  const baseExercises = useMemo(() => {
    return activeRoutine?.exercises ?? ['Bench press', 'Incline press', 'Overhead press', 'Cable pushdown'];
  }, [activeRoutine]);

  // Combined reactive list of exercises for the viewed day
  const displayExercises = useMemo(() => {
    const viewingToday = selectedSlot === currentDaySlot;
    const fromMine = viewingToday ? mine.map((s) => s.exercise) : [];
    const fromBlocks = viewingToday ? blocks.map((b) => b.exercise) : [];
    const combined = [...new Set([...fromMine, ...fromBlocks, ...addedExercises, ...baseExercises])];
    return combined.filter((ex) => !removedExercises.includes(ex));
  }, [mine, blocks, addedExercises, baseExercises, removedExercises, selectedSlot, currentDaySlot]);

  /** Consecutive days trained. Zero is a fine answer. */
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

  /** Which week of the plan this is. */
  const week = useMemo(() => {
    if (!workouts.length) return 1;
    const first = [...workouts].sort((a, b) => a.on_date.localeCompare(b.on_date))[0];
    const ms = Date.now() - new Date(`${first.on_date}T12:00`).getTime();
    return Math.max(1, Math.floor(ms / (7 * 864e5)) + 1);
  }, [workouts]);

  /** Month sessions */
  const thisMonthCount = useMemo(() => {
    return workouts.filter((w) => w.on_date.startsWith(today.slice(0, 7))).length;
  }, [workouts, today]);

  /** Week volume compared against last week. No baseline, no percentage. */
  const weekVol = useMemo(() => {
    const from = ymd(new Date(Date.now() - 7 * 864e5));
    const ids = new Set(workouts.filter((w) => w.on_date >= from).map((w) => w.id));
    const prevIds = new Set(workouts.filter((w) => w.on_date < from).map((w) => w.id));
    const now = volumeOf(sets.filter((s) => ids.has(s.workout_id)));
    const before = volumeOf(sets.filter((s) => prevIds.has(s.workout_id)));
    const pct = before > 0 ? Math.round(Math.min(100, (now / before) * 100)) : 0;
    return { now, target: before, comparable: before > 0, pct };
  }, [workouts, sets]);

  /** Next set up */
  const next = useMemo(() => {
    for (const b of blocks) {
      if (removedExercises.includes(b.exercise)) continue;
      const undone = b.sets.find((s) => !s.done);
      if (undone) return { exercise: b.exercise, set: undone, index: b.sets.indexOf(undone) + 1, of: b.sets.length };
      if (b.sets.length === 0) return { exercise: b.exercise, set: null, index: 0, of: 0 };
    }
    return null;
  }, [blocks, removedExercises]);

  const totalSets = blocks.reduce((n, b) => (removedExercises.includes(b.exercise) ? n : n + b.sets.length), 0);
  const doneSets = mine.filter((s) => s.done && !removedExercises.includes(s.exercise)).length;

  const exerciseCount = displayExercises.length || activeRoutine?.exercises.length || 0;
  const plannedSets = totalSets || exerciseCount * 4;
  const estMinutes = Math.max(1, Math.round(plannedSets * 2.2));
  const viewingToday = selectedSlot === currentDaySlot;

  /** Rest clock. Ticking is an interval started once the timer turns on. */
  const [rest, setRest] = useState(0);
  const lastDone = useRef(doneSets);
  useEffect(() => {
    if (doneSets > lastDone.current) setRest(REST_S);
    lastDone.current = doneSets;
  }, [doneSets]);
  const restOn = rest > 0;
  useEffect(() => {
    if (!restOn) return;
    const t = setInterval(() => setRest((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [restOn]);

  /**
   * Session stopwatch, anchored to a stored start time so a reload does not
   * invent a number. A session from before this existed (or from another day,
   * after a crashed tab) re-anchors to now: honest is better than grand.
   */
  const startAt = prefs.gymStartAt;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!session) return;
    if (!startAt || !startAt.startsWith(today)) {
      void update({ gymStartAt: new Date().toISOString() });
      return;
    }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(startAt).getTime()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [session?.id, startAt, today, update]);

  const formatClock = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  };

  /** Current Movement being performed / demonstrated */
  const currentMovement = next?.exercise ?? displayExercises[0] ?? 'Bench press';
  const heroShot = shotOf(currentMovement) ?? 'bench';

  /** Animated Movement Demo Loop (two frames crossfaded on a slow beat) */
  const [heroFrame, setHeroFrame] = useState(0);
  useEffect(() => {
    if (!prefs.motion) return;
    const timer = setInterval(() => setHeroFrame((f) => (f === 0 ? 1 : 0)), 1600);
    return () => clearInterval(timer);
  }, [heroShot, prefs.motion]);

  /** Top PRs, strongest first */
  const prs = useMemo(
    () => Object.entries(bests).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4),
    [bests],
  );

  /** Start or resume the session; the stopwatch anchor is set here. */
  const handleStart = () => {
    T.start(session ? null : activeRoutine);
    if (!session) void update({ gymStartAt: new Date().toISOString() });
  };

  /** End and save */
  const handleEnd = async () => {
    await T.finish();
    void update({ gymStartAt: undefined });
  };

  /** Rename Workout Handler */
  const handleRenameWorkout = async () => {
    const initial = session?.name ?? activeRoutine?.name ?? 'Workout';
    const name = await ask('Workout name', { initial, placeholder: 'e.g. Heavy Push Day' });
    if (name) {
      if (session) {
        T.editWorkout(session.id, { name });
      } else {
        T.addWorkout({
          id: crypto.randomUUID(), on_date: today,
          name, groups: [], minutes: 0,
        });
      }
      toast(`Workout named "${name}"`);
    }
  };

  /** Delete Workout Handler */
  const handleDeleteWorkout = async () => {
    if (session) {
      await T.deleteSession();
    } else {
      toast('Nothing to delete yet');
      return;
    }
    setRemovedExercises([]);
    setAddedExercises([]);
    void update({ gymStartAt: undefined });
  };

  const card: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--line)',
    borderRadius: 'var(--r-lg, 24)', boxShadow: 'var(--sh)',
  };

  return (
    <Page
      name="Gym"
      width="full"
      meta={
        <span>
          Week {week} · {streak > 0 ? `${streak} day streak` : 'no streak yet'} ·{' '}
          {activeRoutine?.name ?? 'Rest day'}
        </span>
      }
      actions={
        <>
          <button
            onClick={T.logWeight}
            className="hov k-squish"
            style={{
              minHeight: 36, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
              border: '1px solid var(--line2)', background: 'var(--card)',
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)',
            }}
          >
            <Icon name="scale" size={14} color="var(--tx3)" /> Log weight
          </button>
          <button
            onClick={() => T.setSheet('plan')}
            className="hov k-squish"
            style={{
              minHeight: 36, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
              border: '1px solid var(--line2)', background: 'var(--card)',
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)',
            }}
          >
            <Icon name="cal" size={14} color="var(--tx3)" /> Weekly plan
          </button>
        </>
      }
    >
      <div
        className="k-stagger"
        style={{
          display: 'grid',
          gridTemplateColumns: phone ? '1fr' : 'repeat(12, 1fr)',
          gap: phone ? 10 : 12,
          alignItems: 'start',
        }}
      >
        {/* ------------------------------------------------ stat strip, full width */}
        <div style={{ gridColumn: phone ? undefined : 'span 12', '--i': 0 } as React.CSSProperties}>
          <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr 1fr' : 'repeat(4, 1fr)', gap: phone ? 10 : 12 }}>
            <StatTile icon="flame" hue={AMBER} kicker="Day streak" value={streak} suffix={streak === 1 ? 'day' : 'days'} />
            <StatTile icon="cal" hue={PAL.sky} kicker="This month" value={thisMonthCount} suffix={thisMonthCount === 1 ? 'session' : 'sessions'} />
            <StatTile icon="check" hue={MINT} kicker="Sets done" value={doneSets} sub={plannedSets > 0 ? `of ${plannedSets} planned` : 'log a set to begin'} />
            <StatTile icon="target" hue={HUE} kicker="Volume this week" value={weekVol.now} format={(v) => `${Math.round(v).toLocaleString()} kg`} />
          </div>
        </div>

        {/* ------------------------------------------------ hero movement, span 5 */}
        <div
          onClick={() => setOpen({ exercise: currentMovement, sub: 'Movement demonstration and form coaching' })}
          style={{
            ...(phone ? {} : { gridColumn: 'span 5' }),
            position: 'relative', borderRadius: 'var(--r-lg, 24)', overflow: 'hidden',
            background: 'var(--panel)', padding: 'clamp(16px, 2vw, 22px) clamp(14px, 1.8vw, 20px)',
            minHeight: phone ? 220 : 'clamp(280px, 24vw, 330px)',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            border: '1px solid var(--line2)', cursor: 'pointer', boxShadow: 'var(--sh)',
          }}
        >
          {/* Animated 2-Frame Crossfade Movement Loop */}
          {[0, 1].map((n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={n}
              src={`/ex/${heroShot}-${n}.jpg`}
              alt=""
              aria-hidden
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                opacity: heroFrame === n ? 1 : 0,
                transition: 'opacity 0.7s ease-in-out',
              }}
              onError={(e) => {
                if (n === 1) (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ))}

          {/* Ambient gradient scrim so white text survives any photo */}
          <span aria-hidden style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(20,17,32,0.42) 0%, rgba(20,17,32,0.18) 42%, rgba(20,17,32,0.92) 88%)',
          }} />

          {/* Top strip: demo tag and cues affordance */}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(20,17,32,0.72)', backdropFilter: 'blur(6px)',
              padding: '5px 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)',
            }}>
              {session && <span className="k-pulse" style={{
                width: 7, height: 7, borderRadius: '50%', background: HUE,
                display: 'inline-block',
              }} />}
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 800,
                letterSpacing: '.1em', textTransform: 'uppercase', color: '#FFFFFF',
              }}>
                {session ? 'Live session' : 'Movement demo'}
              </span>
            </div>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700,
              background: 'rgba(20,17,32,0.72)', color: 'rgba(255,255,255,0.85)',
              padding: '5px 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)',
              backdropFilter: 'blur(6px)',
            }}>
              Cues and steps
            </span>
          </div>

          {/* Bottom details */}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, letterSpacing: '.13em',
              textTransform: 'uppercase', color: HUE,
            }}>
              {viewingToday ? 'Next up' : `Preview · ${WEEK_FULL[selectedSlot]}`}
            </div>
            <div style={{
              fontSize: 'clamp(21px, 2.2vw, 28px)', fontWeight: 800, letterSpacing: '-.025em',
              lineHeight: 1.15, color: '#FFFFFF',
            }}>
              {currentMovement}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 2 }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700,
                color: '#FFFFFF', background: 'color-mix(in srgb, ' + HUE + ' 72%, rgba(0,0,0,0.4))',
                padding: '3px 9px', borderRadius: 999,
              }}>
                {workedOf(currentMovement)}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700,
                color: 'rgba(255,255,255,0.88)', background: 'rgba(255,255,255,0.14)',
                padding: '3px 9px', borderRadius: 999,
              }}>
                {gearOf(currentMovement)}
              </span>
              {exerciseCount > 0 && (
                <span className="num" style={{ fontSize: 'clamp(10.5px, 1vw, 12px)', color: 'rgba(255,255,255,0.78)' }}>
                  {exerciseCount} exercises · ~{estMinutes} min
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------ session HUD, span 4 */}
        <div style={{
          ...(phone ? {} : { gridColumn: 'span 4' }),
          ...card,
          padding: 'clamp(14px, 1.8vw, 20px)', display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {session && <span className="k-pulse" style={{
                  width: 7, height: 7, borderRadius: '50%', background: HUE, flex: 'none',
                  display: 'inline-block',
                }} />}
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
                  letterSpacing: '.12em', textTransform: 'uppercase', color: session ? HUE : 'var(--tx3)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {session
                    ? `${session.name} · in progress`
                    : `${activeRoutine?.name ?? 'Workout'} · ready`}
                </span>
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 'clamp(30px, 3vw, 40px)', fontWeight: 900,
                letterSpacing: '-.03em', lineHeight: 1.1, marginTop: 4, color: session ? 'var(--tx)' : 'var(--tx2)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {formatClock(elapsed)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
              <button
                onClick={handleRenameWorkout}
                title="Rename workout"
                className="hov k-squish"
                style={{
                  width: 30, height: 30, borderRadius: 999, border: '1px solid var(--line2)',
                  background: 'var(--card2)', display: 'grid', placeItems: 'center', cursor: 'pointer',
                  color: 'var(--tx3)',
                }}
              >
                <Icon name="edit" size={12} color="currentColor" />
              </button>
              {session && (
                <button
                  onClick={handleDeleteWorkout}
                  title="Delete workout"
                  className="hov k-squish"
                  style={{
                    width: 30, height: 30, borderRadius: 999, border: '1px solid var(--line2)',
                    background: 'var(--card2)', display: 'grid', placeItems: 'center', cursor: 'pointer',
                    color: PAL.coral,
                  }}
                >
                  <Icon name="trash" size={12} color="currentColor" />
                </button>
              )}
            </div>
          </div>

          {/* Sets progress, real numbers only */}
          <AsciiBar
            value={plannedSets > 0 ? (doneSets / plannedSets) * 100 : 0}
            hue={HUE}
            text={plannedSets > 0 ? `${doneSets} of ${plannedSets} sets` : 'No sets logged yet'}
            label="Workout sets completed"
          />

          {/* Actions */}
          {session ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                onClick={() => T.setRunning(true)}
                className="hov k-squish"
                style={{
                  minHeight: 42, borderRadius: 999, cursor: 'pointer',
                  border: '1px solid var(--line2)', background: 'var(--card2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  fontSize: 13, fontWeight: 700, color: 'var(--tx2)',
                }}
              >
                <Icon name="focus" size={14} color="currentColor" /> Focus mode
              </button>
              <button
                onClick={() => void handleEnd()}
                className="k-glass k-squish"
                style={{
                  minHeight: 42, borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: MINT, color: '#141120',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  fontSize: 13, fontWeight: 800,
                  boxShadow: `0 6px 20px color-mix(in srgb, ${MINT} 30%, transparent)`,
                }}
              >
                <Icon name="check" size={14} color="#141120" /> End and save
              </button>
            </div>
          ) : (
            <button
              data-tour="gym-start"
              onClick={handleStart}
              className="k-glass k-squish"
              style={{
                minHeight: 46, borderRadius: 999, border: 'none', cursor: 'pointer',
                background: HUE, color: '#141120',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontSize: 14.5, fontWeight: 800, letterSpacing: '-.01em',
                boxShadow: `0 8px 26px color-mix(in srgb, ${HUE} 38%, transparent)`,
              }}
            >
              <Icon name="play" size={16} color="#141120" />
              Start today&apos;s routine
            </button>
          )}
        </div>

        {/* ------------------------------------------------ week split, span 3 */}
        <div
          data-tour="gym-week"
          style={{
            ...(phone ? {} : { gridColumn: 'span 3' }),
            ...card,
            padding: 'clamp(12px, 1.5vw, 16px)', display: 'flex', flexDirection: 'column', gap: 4,
          }}
        >
          <div style={{ ...KICKER, padding: '2px 4px 8px' }}>The week</div>
          {DAYS.map((d, i) => {
            const r = routineOf(plan[i]);
            const isToday = i === currentDaySlot;
            const isSelected = i === selectedSlot;
            return (
              <button
                key={i}
                onClick={() => setSelectedSlot(i)}
                className="k-chip hov"
                aria-pressed={isSelected}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                  padding: phone ? '9px 10px' : '7px 10px', borderRadius: 14, cursor: 'pointer',
                  textAlign: 'left',
                  border: `1.5px solid ${isSelected ? `color-mix(in srgb, ${HUE} 55%, transparent)` : isToday ? 'color-mix(in srgb, var(--tx) 22%, transparent)' : 'transparent'}`,
                  background: isSelected
                    ? `color-mix(in srgb, ${HUE} 14%, var(--card2))`
                    : 'transparent',
                  opacity: r ? 1 : 0.55,
                }}
              >
                <b style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 800,
                  width: 16, flex: 'none',
                  color: isSelected ? HUE : isToday ? 'var(--tx)' : 'var(--tx3)',
                }}>{d}</b>
                <span style={{
                  flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700,
                  color: isSelected ? 'var(--tx)' : 'var(--tx2)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {r ? r.name : 'Rest day'}
                </span>
                {isToday && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 800, letterSpacing: '.08em',
                    color: HUE, flex: 'none',
                  }}>TODAY</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ------------------------------------------------ lift cards, span 8 */}
        <div style={{
          ...(phone ? {} : { gridColumn: 'span 8' }),
          ...card,
          padding: 'clamp(14px, 1.8vw, 20px)', display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <div style={KICKER}>{viewingToday ? 'Today’s session' : 'Routine preview'}</div>
              {viewingToday && mine.length > 0 && (
                <div className="num" style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 3 }}>
                  {doneSets} of {totalSets} sets done
                </div>
              )}
            </div>
            <button
              data-tour="gym-lifts"
              onClick={() => T.setSheet('exercises')}
              className="hov k-squish"
              style={{
                minHeight: 36, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid color-mix(in srgb, ${HUE} 40%, transparent)`,
                background: `color-mix(in srgb, ${HUE} 12%, transparent)`, color: HUE,
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800,
              }}
            >
              <Icon name="plus" size={12} color={HUE} /> Add exercise
            </button>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 10,
          }}>
            {displayExercises.length === 0 ? (
              <MascotEmpty
                title="Nothing planned for this day yet"
                body="Add a movement and it will show up here, ready to log sets against."
              >
                <button
                  onClick={() => T.setSheet('exercises')}
                  className="k-glass k-squish"
                  style={{
                    minHeight: 38, padding: '0 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: HUE, color: '#141120', fontSize: 12.5, fontWeight: 800,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Icon name="plus" size={13} color="#141120" /> Add an exercise
                </button>
              </MascotEmpty>
            ) : (
              displayExercises.map((exName, idx) => {
                const b = blocks.find((x) => x.exercise === exName);
                const exSets = viewingToday
                  ? (b?.sets ?? mine.filter((s) => s.exercise === exName))
                  : [];
                const doneCount = exSets.filter((s) => s.done).length;
                const setsCount = exSets.length || 4;
                const isLive = viewingToday && ((next?.exercise === exName && !!session) || (idx === 0 && !next && !!session));
                const shorthand = exSets.length > 0
                  ? exSets.map((s) => `${s.weight_kg}×${s.reps}`).join(' · ')
                  : previously[exName]
                    ? `Last: ${previously[exName].weight_kg}×${previously[exName].reps}`
                    : '4 sets planned';

                return (
                  <LiftCard
                    key={exName}
                    exercise={exName}
                    setsCount={setsCount}
                    doneCount={doneCount}
                    weightShorthand={shorthand}
                    pr={bests[exName] ?? 0}
                    isLive={isLive}
                    onOpen={() => setOpen({ exercise: exName, sub: `${doneCount} of ${setsCount} sets done` })}
                    onQuickLog={() => {
                      if (!viewingToday) setSelectedSlot(currentDaySlot);
                      T.logSet(exName);
                    }}
                    onEdit={() => setEditingExercise(exName)}
                    onRemove={async () => {
                      const yes = await confirmAsk(`Remove ${exName}?`, {
                        message: 'This removes the exercise and its logged sets from today’s workout.',
                        confirmLabel: 'Remove', danger: true,
                      });
                      if (!yes) return;
                      setRemovedExercises((r) => [...r, exName]);
                      setAddedExercises((a) => a.filter((x) => x !== exName));
                      T.removeExercise(exName);
                    }}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* ------------------------------------------------ right rail, span 4 */}
        <div style={{
          ...(phone ? {} : { gridColumn: 'span 4' }),
          display: 'flex', flexDirection: 'column', gap: phone ? 10 : 12,
        }}>
          {/* Rest clock with ring, controls, and up next */}
          <div style={{
            ...card,
            padding: 'clamp(14px, 1.6vw, 18px)', display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <RestRing value={restOn ? (rest / REST_S) * 100 : 0} hue={restOn ? AMBER : 'var(--line2)'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={KICKER}>Rest clock</div>
                <div className="num" style={{
                  fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', marginTop: 2,
                  color: restOn ? AMBER : 'var(--tx3)', fontVariantNumeric: 'tabular-nums',
                }}>
                  {restOn ? `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}` : `${REST_S}s`}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 2 }}>
                  {restOn ? 'Breathe. Next set soon.' : 'Starts when you finish a set'}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              <button onClick={() => setRest((r) => Math.max(0, r - 15))} className="hov k-squish" style={REST_BTN}>−15s</button>
              <button onClick={() => setRest((r) => r + 15)} className="hov k-squish" style={REST_BTN}>+15s</button>
              <button onClick={() => setRest(0)} className="hov k-squish" style={REST_BTN}>Skip</button>
              <button onClick={() => setRest(REST_S)} className="hov k-squish" style={{ ...REST_BTN, color: AMBER, borderColor: `color-mix(in srgb, ${AMBER} 40%, transparent)` }}>Start</button>
            </div>

            <div style={{ height: 1, background: 'var(--line)' }} />

            <div>
              <div style={{ ...KICKER, marginBottom: 4 }}>Up next</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {next?.exercise ?? activeRoutine?.exercises[0] ?? 'Nothing queued'}
              </div>
              <div className="num" style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 3 }}>
                {next?.set
                  ? `Set ${next.index} of ${next.of} · ${next.set.weight_kg} kg × ${next.set.reps}`
                  : next
                    ? 'First set · working weight'
                    : 'Log a set to see what is next'}
              </div>
            </div>
          </div>

          {/* Personal bests */}
          <div style={{ ...card, padding: 'clamp(14px, 1.6vw, 18px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={KICKER}>Personal bests</div>
              <Icon name="trophy" size={14} color={AMBER} />
            </div>
            {prs.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mascots/otter.svg" alt="" width={40} height={40} style={{ opacity: 0.9, flex: 'none' }} />
                <span style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.45 }}>
                  No bests yet. Log a few sets and your strongest effort per movement lands here.
                </span>
              </div>
            ) : (
              prs.map(([name, kg]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: 2, background: AMBER, flex: 'none',
                  }} />
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{name}</span>
                  <span className="num" style={{ fontSize: 12.5, fontWeight: 800, color: AMBER, flex: 'none' }}>
                    {Math.round(kg)} kg
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Week volume against last week */}
          <div style={{ ...card, padding: 'clamp(14px, 1.6vw, 18px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={KICKER}>Volume this week</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 900, letterSpacing: '-.02em', color: 'var(--tx)' }}>
                <Counter to={weekVol.now} format={(v) => Math.round(v).toLocaleString()} />
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx3)' }}>kg moved</span>
            </div>
            <AsciiBar
              value={weekVol.comparable ? weekVol.pct : 0}
              hue={HUE}
              text={weekVol.comparable ? `${weekVol.pct}% of last week` : 'First full week sets the bar'}
              label="Week volume against last week"
            />
          </div>
        </div>
      </div>

      <TrainingOverlays T={T} />

      {open && (
        <MovementSheet exercise={open.exercise} subtitle={open.sub} onClose={() => setOpen(null)} />
      )}

      {editingExercise && (
        <ExerciseEditModal
          exercise={editingExercise}
          sets={mine.filter((s) => s.exercise === editingExercise)}
          onClose={() => setEditingExercise(null)}
          onAddSet={() => T.logSet(editingExercise)}
          onChangeSet={(set, patch) => T.change(set, patch)}
          onDropSet={(set) => T.drop(set)}
          onRemoveExercise={async () => {
            const yes = await confirmAsk(`Remove ${editingExercise}?`, {
              message: 'This removes the exercise and all its logged sets from today’s workout.',
              confirmLabel: 'Remove', danger: true,
            });
            if (!yes) return;
            setRemovedExercises((r) => [...r, editingExercise]);
            setAddedExercises((a) => a.filter((x) => x !== editingExercise));
            T.removeExercise(editingExercise);
            setEditingExercise(null);
          }}
        />
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------ pieces */

const KICKER: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 800, letterSpacing: '.12em',
  textTransform: 'uppercase', color: 'var(--tx3)',
};

const REST_BTN: React.CSSProperties = {
  minHeight: 30, borderRadius: 999, border: '1px solid var(--line2)', background: 'var(--card2)',
  color: 'var(--tx2)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
};

/** One stat in the top strip. The number counts; the label does not move. */
function StatTile({
  icon, hue, kicker, value, format, suffix, sub,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  hue: string;
  kicker: string;
  value: number;
  format?: (v: number) => string;
  suffix?: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        ...cardBase,
        padding: 'clamp(12px, 1.4vw, 16px)', display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{
          width: 26, height: 26, borderRadius: 9, display: 'grid', placeItems: 'center',
          background: `color-mix(in srgb, ${hue} 15%, transparent)`, flex: 'none',
        }}>
          <Icon name={icon} size={13} color={hue} />
        </span>
        <span style={KICKER}>{kicker}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'clamp(20px, 1.8vw, 26px)', fontWeight: 900,
          letterSpacing: '-.02em', color: 'var(--tx)',
        }}>
          <Counter to={value} format={format} />
        </span>
        {suffix && (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx3)' }}>{suffix}</span>
        )}
      </div>
      {sub && (
        <div className="num" style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: -4 }}>{sub}</div>
      )}
    </div>
  );
}

const cardBase: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--line)',
  borderRadius: 'var(--r-lg, 24)', boxShadow: 'var(--sh)',
};

/** The rest countdown ring. The `.k-ring.linear` transition matches the 1s tick. */
function RestRing({ value, hue }: { value: number; hue: string }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  const off = C * (1 - Math.min(100, Math.max(0, value)) / 100);
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" role="img" aria-label="Rest remaining" style={{ flex: 'none' }}>
      <circle cx={32} cy={32} r={R} fill="none" stroke="var(--line)" strokeWidth={5} />
      <circle
        className="k-ring linear"
        cx={32} cy={32} r={R} fill="none" stroke={hue} strokeWidth={5}
        strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off}
        transform="rotate(-90 32 32)"
      />
    </svg>
  );
}

/** design.md empty state: mascot, one sentence, one action. */
function MascotEmpty({ title, body, children }: {
  title: string; body: string; children?: React.ReactNode;
}) {
  return (
    <div style={{
      gridColumn: '1 / -1', textAlign: 'center',
      padding: '26px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      background: 'var(--card2)', borderRadius: 'var(--r-md, 18)', border: '1px dashed var(--line2)',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mascots/otter.svg" alt="" width={56} height={56} style={{ opacity: 0.92 }} />
      <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--tx)', marginTop: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--tx3)', maxWidth: 340, lineHeight: 1.5 }}>{body}</div>
      {children && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}

/**
 * One lift. Photo, name, what the sets look like, a PR chip when there is one,
 * the mint fraction, and the pink progress line. Hovers with a spring lift.
 */
function LiftCard({
  exercise, setsCount, doneCount, weightShorthand, pr, isLive,
  onOpen, onQuickLog, onEdit, onRemove,
}: {
  exercise: string;
  setsCount: number;
  doneCount: number;
  weightShorthand: string;
  pr: number;
  isLive: boolean;
  onOpen: () => void;
  onQuickLog: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { prefs } = usePrefs();
  const { phone } = useLayout();
  const shot = shotOf(exercise) ?? 'bench';
  const tap = useTap(onOpen);
  const fraction = `${doneCount}/${setsCount}`;
  const pct = setsCount > 0 ? (doneCount / setsCount) * 100 : 0;
  const lift = prefs.motion === false ? undefined : {
    whileHover: { y: -3 },
    whileTap: { scale: 0.985 },
    transition: { type: 'spring' as const, stiffness: 420, damping: 26 },
  };

  return (
    <motion.div
      {...lift}
      style={{
        borderRadius: 'var(--r-md, 18)',
        background: isLive
          ? `color-mix(in srgb, ${HUE} 8%, var(--card2))`
          : 'var(--card2)',
        border: `1.2px solid ${isLive ? `color-mix(in srgb, ${HUE} 50%, var(--line2))` : 'var(--line2)'}`,
        overflow: 'hidden',
        boxShadow: isLive ? `0 0 18px color-mix(in srgb, ${HUE} 18%, transparent)` : 'none',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '9px 10px 7px', gap: 4 }}>
        <button
          {...tap}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0,
            background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer',
            font: 'inherit', color: 'inherit', padding: 0,
          }}
        >
          {/* Exercise thumbnail */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/ex/${shot}-0.jpg`}
            alt=""
            style={{
              width: 44, height: 44, borderRadius: 10, objectFit: 'cover',
              flex: 'none', border: '1px solid var(--line2)',
            }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />

          {/* Title and set line */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {exercise}
              </span>
              {isLive && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
                  color: HUE, textTransform: 'uppercase', letterSpacing: '.08em', flex: 'none',
                }}>
                  now
                </span>
              )}
            </div>
            <div className="num" style={{
              fontSize: 10.5, color: 'var(--tx3)', marginTop: 3, display: 'flex', gap: 6,
              alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{weightShorthand}</span>
            </div>
          </div>

          {/* PR chip */}
          {pr > 0 && (
            <span title={`Best estimated one-rep max: ${Math.round(pr)} kg`} style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800, flex: 'none',
              color: AMBER, background: `color-mix(in srgb, ${AMBER} 14%, transparent)`,
              padding: '3px 7px', borderRadius: 999, marginRight: 2,
            }}>
              {Math.round(pr)} kg
            </span>
          )}

          {/* Completion fraction */}
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800,
            color: doneCount >= setsCount && setsCount > 0 ? MINT : 'var(--tx3)',
            letterSpacing: '-.02em', flex: 'none', marginRight: 4,
          }}>
            {fraction}
          </div>
        </button>

        {/* Quick actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
          <button
            onClick={onQuickLog}
            title="Log a set"
            className="hov k-squish"
            style={{
              width: 28, height: 28, borderRadius: 999, border: '1px solid var(--line2)',
              background: 'var(--card)', color: HUE, display: 'grid', placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={12} color={HUE} />
          </button>
          <button
            onClick={onEdit}
            title="Edit sets and reps"
            className="hov k-squish"
            style={{
              width: 28, height: 28, borderRadius: 999, border: '1px solid var(--line2)',
              background: 'var(--card)', color: 'var(--tx2)', display: 'grid', placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon name="edit" size={11} color="currentColor" />
          </button>
          {!phone && (
            <button
              onClick={onRemove}
              title="Remove exercise"
              className="hov k-squish"
              style={{
                width: 28, height: 28, borderRadius: 999, border: '1px solid var(--line2)',
                background: 'var(--card)', color: 'var(--tx3)', display: 'grid', placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              <Icon name="trash" size={11} color="currentColor" />
            </button>
          )}
        </div>
      </div>

      {/* Progress line */}
      <div style={{ padding: '0 10px 9px' }}>
        <AsciiBar shape="slim" value={pct} hue={HUE} showValue={false} label={`${exercise} progress`} />
      </div>
    </motion.div>
  );
}

/**
 * Edit modal for one exercise's sets: weights, reps, done ticks, add and drop.
 */
function ExerciseEditModal({
  exercise, sets, onClose, onAddSet, onChangeSet, onDropSet, onRemoveExercise,
}: {
  exercise: string;
  sets: WorkoutSet[];
  onClose: () => void;
  onAddSet: () => void;
  onChangeSet: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void;
  onDropSet: (set: WorkoutSet) => void;
  onRemoveExercise: () => void;
}) {
  const { phone } = useLayout();

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(20,17,32,.7)',
        backdropFilter: 'blur(4px)', display: 'flex',
        alignItems: phone ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: phone ? 0 : 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className={phone ? 'rise' : 'k-bloom'}
        style={{
          width: 480, maxWidth: '100%', maxHeight: phone ? '88dvh' : '82dvh', overflowY: 'auto',
          background: 'var(--panel)', border: '1px solid var(--line2)',
          borderRadius: phone ? '18px 18px 0 0' : 'var(--r-xl, 32)', padding: 18,
          boxShadow: phone ? 'none' : 'var(--shl, 0 24px 64px rgba(0,0,0,0.5))',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, letterSpacing: '-.02em', color: 'var(--tx)' }}>
              Edit sets · {exercise}
            </h3>
            <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
              {sets.length} {sets.length === 1 ? 'set' : 'sets'} logged
            </div>
          </div>
          <button
            onClick={onClose}
            className="hov k-squish"
            aria-label="Close"
            style={{
              width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center',
              background: 'var(--card2)', border: '1px solid var(--line2)', cursor: 'pointer',
              color: 'var(--tx2)', flex: 'none',
            }}
          >
            <Icon name="close" size={13} color="currentColor" />
          </button>
        </div>

        {/* Set rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sets.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--tx3)', fontSize: 12 }}>
              No sets recorded yet. Add your first one below.
            </div>
          )}

          {sets.map((s, idx) => (
            <div
              key={s.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                background: 'var(--card2)', borderRadius: 14, border: '1px solid var(--line)',
              }}
            >
              <button
                onClick={() => onChangeSet(s, { done: !s.done })}
                className="k-squish"
                aria-pressed={s.done}
                aria-label={`Set ${idx + 1} done`}
                style={{
                  width: 26, height: 26, borderRadius: 999, border: `1.5px solid ${s.done ? MINT : 'var(--line2)'}`,
                  background: s.done ? `color-mix(in srgb, ${MINT} 20%, transparent)` : 'transparent',
                  color: s.done ? MINT : 'var(--tx3)', display: 'grid', placeItems: 'center', cursor: 'pointer',
                  flex: 'none',
                }}
              >
                {s.done ? <Icon name="check" size={13} color={MINT} /> : <span style={{ fontSize: 10, fontWeight: 700 }}>{idx + 1}</span>}
              </button>

              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <input
                  type="number"
                  value={s.weight_kg || ''}
                  onChange={(e) => onChangeSet(s, { weight_kg: Number(e.target.value) || 0 })}
                  aria-label={`Weight for set ${idx + 1}, kilograms`}
                  style={{
                    width: 58, padding: '5px 6px', borderRadius: 8, background: 'var(--card)',
                    border: '1px solid var(--line2)', color: 'var(--tx)', fontFamily: 'var(--font-mono)',
                    fontSize: 12, fontWeight: 700, textAlign: 'center',
                  }}
                />
                <span style={{ fontSize: 10.5, color: 'var(--tx3)', fontWeight: 600 }}>kg</span>
                <span style={{ color: 'var(--line2)' }}>×</span>
                <input
                  type="number"
                  value={s.reps || ''}
                  onChange={(e) => onChangeSet(s, { reps: Number(e.target.value) || 0 })}
                  aria-label={`Reps for set ${idx + 1}`}
                  style={{
                    width: 48, padding: '5px 6px', borderRadius: 8, background: 'var(--card)',
                    border: '1px solid var(--line2)', color: 'var(--tx)', fontFamily: 'var(--font-mono)',
                    fontSize: 12, fontWeight: 700, textAlign: 'center',
                  }}
                />
                <span style={{ fontSize: 10.5, color: 'var(--tx3)', fontWeight: 600 }}>reps</span>
              </div>

              <button
                onClick={() => onDropSet(s)}
                className="hov k-squish"
                title="Delete set"
                aria-label={`Delete set ${idx + 1}`}
                style={{
                  width: 26, height: 26, borderRadius: 999, border: 'none',
                  background: 'transparent', color: 'var(--tx3)', display: 'grid', placeItems: 'center',
                  cursor: 'pointer', flex: 'none',
                }}
              >
                <Icon name="close" size={12} color="currentColor" />
              </button>
            </div>
          ))}
        </div>

        {/* Modal actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={onAddSet}
            className="k-glass k-squish"
            style={{
              flex: 1, minHeight: 38, borderRadius: 999, border: 'none',
              background: HUE, color: '#141120',
              fontSize: 12.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={13} color="#141120" /> Add set
          </button>
          <button
            onClick={onRemoveExercise}
            className="hov k-squish"
            style={{
              minHeight: 38, padding: '0 14px', borderRadius: 999, border: '1px solid var(--line2)',
              background: 'var(--card)', color: PAL.coral,
              fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, cursor: 'pointer',
            }}
          >
            <Icon name="trash" size={13} color="currentColor" /> Remove exercise
          </button>
        </div>
      </div>
    </div>
  );
}
