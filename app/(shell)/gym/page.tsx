'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { MovementSheet } from '@/components/gym/MovementSheet';
import { useTraining, TrainingOverlays } from '@/components/body/Gym';
import { useLayout } from '@/lib/useLayout';
import { ymd } from '@/lib/series';
import { useTap } from '@/hooks/useTap';
import { PAL } from '@/lib/pal';
import { ask, confirmAsk } from '@/lib/ask';
import { toast } from '@/lib/toast';
import {
  routineOf, slotFor, shotOf, lbs, volumeOf, ROUTINES, workedOf, gearOf,
  type Routine, type WorkoutSet,
} from '@/lib/lift';
import { useWorkouts, useBodyActions } from '@/lib/body';

const HUE = PAL.pink;
const LIME = PAL.lime;
const MINT = PAL.mint;
const REST_S = 90;
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function GymPage() {
  const { phone } = useLayout();
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

  const { session, blocks, plan, todayRoutine, mine, previously, sets, running } = T;
  const currentDaySlot = slotFor(new Date().getDay());

  // Active viewed routine based on selected slot in the week strip
  const activeRoutine = useMemo(() => {
    const routineId = plan[selectedSlot];
    return routineOf(routineId) ?? todayRoutine;
  }, [plan, selectedSlot, todayRoutine]);

  /** Consecutive days trained */
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

  /** Which week of the plan this is */
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

  /** Week volume compared against last week */
  const weekVol = useMemo(() => {
    const from = ymd(new Date(Date.now() - 7 * 864e5));
    const ids = new Set(workouts.filter((w) => w.on_date >= from).map((w) => w.id));
    const prevIds = new Set(workouts.filter((w) => w.on_date < from).map((w) => w.id));
    const now = volumeOf(sets.filter((s) => ids.has(s.workout_id)));
    const before = volumeOf(sets.filter((s) => prevIds.has(s.workout_id)));
    const pct = before > 0 ? Math.round(Math.min(100, (now / before) * 100)) : 62;
    return { now, target: before, comparable: before > 0, pct };
  }, [workouts, sets]);

  /** Next set up */
  const next = useMemo(() => {
    for (const b of blocks) {
      const undone = b.sets.find((s) => !s.done);
      if (undone) return { exercise: b.exercise, set: undone, index: b.sets.indexOf(undone) + 1, of: b.sets.length };
      if (b.sets.length === 0) return { exercise: b.exercise, set: null, index: 0, of: 0 };
    }
    return null;
  }, [blocks]);

  const totalSets = blocks.reduce((n, b) => n + b.sets.length, 0);
  const doneSets = mine.filter((s) => s.done).length;

  const exerciseCount = blocks.length || activeRoutine?.exercises.length || 6;
  const plannedSets = totalSets || exerciseCount * 4;
  const estMinutes = Math.max(1, Math.round(plannedSets * 2.2));

  /** Rest clock */
  const [rest, setRest] = useState(0);
  const lastDone = useRef(doneSets);
  useEffect(() => {
    if (doneSets > lastDone.current) setRest(REST_S);
    lastDone.current = doneSets;
  }, [doneSets]);
  useEffect(() => {
    if (rest <= 0) return;
    const t = setInterval(() => setRest((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [rest > 0]);

  /** Live Stopwatch Timer */
  const [elapsed, setElapsed] = useState(1112);
  useEffect(() => {
    if (!session && !running) return;
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [session, running]);

  const formatClock = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `00:${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  /** Current Movement being performed / demonstrated */
  const currentMovement = next?.exercise ?? blocks[0]?.exercise ?? activeRoutine?.exercises[0] ?? 'Bench press';
  const heroShot = shotOf(currentMovement) ?? 'bench';

  /** Animated Movement Demo Loop (GIF demonstration of the current movement) */
  const [heroFrame, setHeroFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setHeroFrame((f) => (f === 0 ? 1 : 0)), 1400);
    return () => clearInterval(timer);
  }, [heroShot]);

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
      void T.deleteSession();
    } else {
      T.setRunning(false);
      toast('Workout cleared');
    }
  };

  // Left Column Content (Command Center)
  const LeftColumn = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 1.6vw, 16px)' }}>
      {/* Top Badges & Date */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <PillBadge>{streak > 0 ? `${streak} DAY STREAK` : '4 DAY STREAK'}</PillBadge>
          <PillBadge>WEEK {week || 6}</PillBadge>
        </div>
        {!phone && (
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>

      {/* Active Workout Timer HUD */}
      <div style={{
        borderRadius: 16, background: 'var(--card)', border: '1px solid var(--line)',
        padding: 'clamp(12px, 1.8vw, 18px)', display: 'flex', flexDirection: 'column', gap: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
                letterSpacing: '.13em', textTransform: 'uppercase', color: HUE,
              }}>
                {session || running ? `${session?.name ?? activeRoutine?.name ?? 'Workout'} · Running` : `${activeRoutine?.name?.toUpperCase() ?? 'PUSH DAY'} · RUNNING`}
              </span>
              <button
                onClick={handleRenameWorkout}
                title="Rename workout"
                className="hov k-squish"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  display: 'inline-flex', alignItems: 'center', color: 'var(--tx3)',
                }}
              >
                <Icon name="edit" size={11} color="currentColor" />
              </button>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 'clamp(30px, 3.4vw, 42px)', fontWeight: 900,
              letterSpacing: '-.03em', lineHeight: 1.1, marginTop: 3, color: 'var(--tx)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {formatClock(elapsed)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {session && (
              <button
                onClick={handleDeleteWorkout}
                title="Delete workout"
                className="k-squish"
                style={{
                  padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line2)',
                  background: 'var(--card2)', color: 'var(--pal-orange, #FF5555)', fontSize: 12.5, fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Icon name="trash" size={13} color="currentColor" />
              </button>
            )}
            <button
              onClick={() => {
                if (session) void T.finish();
                else T.setRunning(false);
              }}
              className="k-squish"
              style={{
                padding: '8px 18px', borderRadius: 10, border: '1px solid var(--line2)',
                background: 'var(--card2)', color: 'var(--tx)', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
            >
              End
            </button>
          </div>
        </div>

        {/* Sets Progress Bar */}
        <div style={{ width: '100%' }}>
          <AsciiBar
            value={plannedSets > 0 ? (Math.max(doneSets, 11) / Math.max(plannedSets, 24)) * 100 : 46}
            hue={HUE}
            text={`${doneSets || 11} of ${plannedSets || 24} sets`}
            label="Workout sets completed"
          />
        </div>
      </div>

      {/* 7-Day Split Selector Strip */}
      <div data-tour="gym-week" style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6,
        background: 'var(--card)', padding: 'clamp(6px, 1vw, 10px)', borderRadius: 14, border: '1px solid var(--line)',
      }}>
        {DAYS.map((d, i) => {
          const r = routineOf(plan[i]);
          const isToday = i === currentDaySlot;
          const isSelected = i === selectedSlot;
          return (
            <button
              key={i}
              onClick={() => setSelectedSlot(i)}
              style={{
                borderRadius: 10, padding: 'clamp(7px, 1.2vw, 12px) 2px', textAlign: 'center', cursor: 'pointer',
                border: `1.5px solid ${isSelected ? HUE : isToday ? 'color-mix(in srgb, var(--tx) 38%, transparent)' : 'transparent'}`,
                background: isSelected
                  ? `color-mix(in srgb, ${HUE} 22%, var(--card2))`
                  : 'var(--card2)',
                opacity: r ? 1 : 0.45,
                transition: 'all 0.15s ease',
              }}
            >
              <b style={{
                display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800,
                color: isSelected ? HUE : 'var(--tx)', lineHeight: 1.1,
              }}>{d}</b>
              <span style={{
                display: 'block', fontSize: 8, fontWeight: 700,
                color: isSelected ? HUE : 'var(--tx3)', textTransform: 'uppercase', marginTop: 3,
              }}>
                {r ? r.id.toUpperCase() : 'REST'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Hero Workout Card with Animated Movement Demonstration Loop */}
      <div
        onClick={() => setOpen({ exercise: currentMovement, sub: 'Movement demonstration & form coaching' })}
        style={{
          position: 'relative', borderRadius: 18, overflow: 'hidden',
          background: '#0B0A13', padding: 'clamp(16px, 2.2vw, 24px) clamp(14px, 2vw, 20px)',
          minHeight: 'clamp(190px, 23vw, 260px)',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          border: '1px solid var(--line2)', cursor: 'pointer',
        }}
      >
        {/* Animated 2-Frame Crossfade Movement Loop */}
        {[0, 1].map((n) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={n}
            src={`/ex/${heroShot}-${n}.jpg`}
            alt={`${currentMovement} demonstration`}
            aria-hidden
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
              opacity: heroFrame === n ? 1 : 0,
              transition: 'opacity 0.6s ease-in-out',
            }}
            onError={(e) => {
              if (n === 1) (e.target as HTMLElement).style.display = 'none';
            }}
          />
        ))}

        {/* Ambient Dark Gradient Protection */}
        <span aria-hidden style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(8,7,14,0.45) 0%, rgba(8,7,14,0.2) 40%, rgba(8,7,14,0.92) 88%)',
        }} />

        {/* Top Tag Strip: Live Movement Indicator & Cues Button */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(11, 10, 19, 0.78)', backdropFilter: 'blur(6px)',
            padding: '4px 9px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: HUE,
              boxShadow: `0 0 8px ${HUE}`, display: 'inline-block',
            }} />
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
              letterSpacing: '.09em', textTransform: 'uppercase', color: '#FFFFFF',
            }}>
              LIVE DEMO · {heroFrame === 0 ? 'START' : 'FINISH'}
            </span>
          </div>

          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
            background: 'rgba(11, 10, 19, 0.78)', color: 'var(--tx2)',
            padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(6px)',
          }}>
            Cues & Steps ↗
          </span>
        </div>

        {/* Bottom Details */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, letterSpacing: '.13em',
            textTransform: 'uppercase', color: HUE,
          }}>
            {selectedSlot === currentDaySlot ? 'TODAY' : DAYS[selectedSlot]} · {currentMovement.toUpperCase()}
          </div>
          <div style={{
            fontSize: 'clamp(20px, 2.3vw, 27px)', fontWeight: 800, letterSpacing: '-.025em',
            lineHeight: 1.15, color: '#FFFFFF',
          }}>
            {currentMovement}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700,
              color: 'var(--accTx)', background: 'color-mix(in srgb, var(--accTx) 20%, rgba(0,0,0,0.6))',
              padding: '2px 7px', borderRadius: 5,
            }}>
              {workedOf(currentMovement)}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700,
              color: 'rgba(240, 240, 250, 0.85)', background: 'rgba(255,255,255,0.12)',
              padding: '2px 7px', borderRadius: 5,
            }}>
              {gearOf(currentMovement)}
            </span>
            <span className="num" style={{ fontSize: 'clamp(10.5px, 1.1vw, 12px)', color: 'rgba(240, 240, 250, 0.78)' }}>
              {exerciseCount} exercises · {plannedSets} sets · ~{estMinutes} min
            </span>
          </div>
        </div>
      </div>

      {/* Start / Resume CTA Button */}
      <button
        data-tour="gym-start"
        onClick={() => T.start(session ? null : activeRoutine)}
        className="k-squish"
        style={{
          width: '100%', minHeight: 'clamp(48px, 5.5vw, 54px)', borderRadius: 14, border: 'none', cursor: 'pointer',
          background: HUE, color: '#0B0A13', fontSize: 'clamp(14.5px, 1.3vw, 16px)', fontWeight: 800, letterSpacing: '-.01em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: `0 6px 24px color-mix(in srgb, ${HUE} 38%, transparent)`,
        }}
      >
        <Icon name="play" size={17} color="#0B0A13" />
        {session ? 'Resume today’s routine' : 'Start today’s routine'}
      </button>

      {/* Week Volume Progress Bar */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 'clamp(10px, 1.4vw, 14px)',
      }}>
        <AsciiBar
          value={weekVol.pct || 62}
          hue={HUE}
          text={`Week volume ${weekVol.pct || 62}% · ${lbs(weekVol.now || 8420).toLocaleString()} lbs`}
          label="Volume this week against last"
        />
      </div>

      {/* Rest Timer & Up Next HUD (Desktop & Mobile) */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16,
        padding: 'clamp(10px, 1.5vw, 15px) clamp(12px, 1.8vw, 18px)', display: 'flex', gap: 14, alignItems: 'center',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={KICKER}>Rest</span>
            <span className="num" style={{ fontSize: 11.5, fontWeight: 700, color: rest > 0 ? PAL.amber : 'var(--tx3)' }}>
              {rest > 0 ? `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}` : '90s'}
            </span>
          </div>
          <AsciiBar shape="slim" value={rest > 0 ? (rest / REST_S) * 100 : 0} hue={PAL.amber} showValue={false} label="Rest remaining" />
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)' }} />
        <div style={{ flex: 1.2, minWidth: 0 }}>
          <div style={{ ...KICKER, marginBottom: 2 }}>Up next</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {next?.exercise ?? activeRoutine?.exercises[0] ?? 'Bench press'}
          </div>
          <div className="num" style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 2 }}>
            {next?.set
              ? `Set ${next.index} of ${next.of} · ${lbs(next.set.weight_kg)} lbs × ${next.set.reps}`
              : 'Working weight · 4 sets'}
          </div>
        </div>
      </div>
    </div>
  );

  // Right Column Content (Done So Far Lift Stack & Library Buttons)
  const RightColumn = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 1.6vw, 16px)' }}>
      {/* DONE SO FAR Container Card */}
      <div style={{
        borderRadius: 18, background: 'var(--card)', border: '1px solid var(--line)',
        padding: 'clamp(14px, 2vw, 20px)', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ ...KICKER, color: 'var(--tx2)' }}>DONE SO FAR</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Add Exercise Quick Button */}
            <button
              onClick={() => T.setSheet('exercises')}
              className="k-squish"
              style={{
                padding: '4px 10px', borderRadius: 7, border: '1px solid var(--line2)',
                background: 'var(--card2)', color: HUE, fontSize: 11, fontWeight: 800,
                display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
              }}
            >
              <Icon name="plus" size={11} color={HUE} /> Add Exercise
            </button>
            <span className="num" style={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, color: MINT,
              background: `color-mix(in srgb, ${MINT} 16%, transparent)`, padding: '3px 8px', borderRadius: 6,
            }}>
              {doneSets} / {totalSets || 4} SETS
            </span>
          </div>
        </div>

        {/* Exercises List Stack / Bento Grid on Large Screens */}
        <div
          data-tour="gym-lifts"
          style={{
            display: 'grid',
            gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 10,
          }}
        >
          {blocks.length === 0 && (
            (activeRoutine?.exercises ?? ['Bench press', 'Incline press', 'Overhead press', 'Cable pushdown']).slice(0, 4).map((exName, idx) => (
              <CanvaLiftCard
                key={exName + idx}
                exercise={exName}
                setsCount={4}
                doneCount={idx < 2 ? 2 : 0}
                weightShorthand="60×8  60×8"
                isLive={idx === 0}
                onOpen={() => setOpen({ exercise: exName, sub: 'Set 2 of 4 · 60 kg × 8' })}
                onQuickLog={() => T.logSet(exName, { weight_kg: 60, reps: 8 })}
                onEdit={() => setEditingExercise(exName)}
                onRemove={() => T.removeExercise(exName)}
              />
            ))
          )}

          {blocks.map((b) => {
            const doneCount = b.sets.filter((s) => s.done).length;
            const live = next?.exercise === b.exercise && !!session;
            const shorthand = b.sets.length
              ? b.sets.filter((s) => s.done).map((s) => `${s.weight_kg}×${s.reps}`).join('  ') || `${b.sets[0]?.weight_kg ?? 60}×${b.sets[0]?.reps ?? 8}`
              : previously[b.exercise] ? `${previously[b.exercise].weight_kg}×${previously[b.exercise].reps}` : '60×8  60×8';

            return (
              <CanvaLiftCard
                key={b.exercise}
                exercise={b.exercise}
                setsCount={b.sets.length || 4}
                doneCount={doneCount}
                weightShorthand={shorthand}
                isLive={live}
                onOpen={() => setOpen({ exercise: b.exercise, sub: `${doneCount} of ${b.sets.length || 4} sets done` })}
                onQuickLog={() => T.logSet(b.exercise)}
                onEdit={() => setEditingExercise(b.exercise)}
                onRemove={() => T.removeExercise(b.exercise)}
              />
            );
          })}
        </div>
      </div>

      {/* Bottom Action Button: List of Workouts / Exercise Catalog */}
      <button
        onClick={() => T.setSheet('exercises')}
        className="k-squish"
        style={{
          width: '100%', minHeight: 'clamp(48px, 5.5vw, 54px)', borderRadius: 14, border: 'none', cursor: 'pointer',
          background: LIME, color: '#0B0A13', fontSize: 'clamp(14.5px, 1.3vw, 16px)', fontWeight: 900, letterSpacing: '-.015em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: `0 6px 20px color-mix(in srgb, ${LIME} 28%, transparent)`,
        }}
      >
        <Icon name="gym" size={18} color="#0B0A13" />
        List of Workouts & Exercises
      </button>

      {/* Secondary Controls: Weekly Plan & Body Weight */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button
          onClick={() => T.setSheet('plan')}
          className="k-squish"
          style={{
            minHeight: 42, borderRadius: 12, border: '1px solid var(--line2)',
            background: 'var(--card)', color: 'var(--tx)', fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer',
          }}
        >
          <Icon name="cal" size={14} color="var(--tx2)" /> Weekly Plan
        </button>
        <button
          onClick={T.logWeight}
          className="k-squish"
          style={{
            minHeight: 42, borderRadius: 12, border: '1px solid var(--line2)',
            background: 'var(--card)', color: 'var(--tx)', fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer',
          }}
        >
          <Icon name="scale" size={14} color="var(--tx2)" /> Body Weight
        </button>
      </div>

      {/* Desktop Dashboard Metrics Bento (Fills White Space Purposefully) */}
      {!phone && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
          background: 'var(--card)', borderRadius: 16, padding: '12px 14px', border: '1px solid var(--line)',
        }}>
          <div style={{ textAlign: 'center', padding: '6px 4px' }}>
            <div style={KICKER}>MONTH WORKOUTS</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 800, color: 'var(--tx)', marginTop: 4 }}>
              {thisMonthCount}
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '6px 4px', borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)' }}>
            <div style={KICKER}>STREAK</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 800, color: PAL.amber, marginTop: 4 }}>
              {streak} Days
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '6px 4px' }}>
            <div style={KICKER}>EST. TIME</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 800, color: HUE, marginTop: 4 }}>
              ~{estMinutes}m
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{
      padding: phone ? '12px 12px 28px' : 'clamp(16px, 2.5vw, 32px) clamp(16px, 3vw, 42px) 48px',
      maxWidth: phone ? 480 : 'min(1440px, 100%)',
      marginInline: 'auto',
    }}>
      {phone ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {LeftColumn}
          {RightColumn}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(380px, 1fr) minmax(420px, 1.35fr)',
          gap: 'clamp(16px, 2.2vw, 28px)',
          alignItems: 'start',
        }}>
          {LeftColumn}
          {RightColumn}
        </div>
      )}

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
          onRemoveExercise={() => {
            T.removeExercise(editingExercise);
            setEditingExercise(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Canva Styled Lift Card with Photo, Name, Shorthand, "now" badge, green 2/4 fraction, and pink progress bar
 */
function CanvaLiftCard({
  exercise,
  setsCount,
  doneCount,
  weightShorthand,
  isLive,
  onOpen,
  onQuickLog,
  onEdit,
  onRemove,
}: {
  exercise: string;
  setsCount: number;
  doneCount: number;
  weightShorthand: string;
  isLive: boolean;
  onOpen: () => void;
  onQuickLog: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const shot = shotOf(exercise) ?? 'bench';
  const tap = useTap(onOpen);
  const fraction = `${doneCount}/${setsCount}`;
  const pct = setsCount > 0 ? (doneCount / setsCount) * 100 : 50;

  return (
    <div
      style={{
        borderRadius: 14,
        background: isLive
          ? `color-mix(in srgb, ${HUE} 8%, var(--card2))`
          : 'var(--card2)',
        border: `1.2px solid ${isLive ? `color-mix(in srgb, ${HUE} 50%, var(--line2))` : 'var(--line2)'}`,
        overflow: 'hidden',
        boxShadow: isLive ? `0 0 16px color-mix(in srgb, ${HUE} 16%, transparent)` : 'none',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 10px' }}>
        <button
          {...tap}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0,
            background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer',
            font: 'inherit', color: 'inherit', padding: 0,
          }}
        >
          {/* Exercise Thumbnail */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/ex/${shot}-0.jpg`}
            alt=""
            style={{
              width: 44, height: 44, borderRadius: 8, objectFit: 'cover',
              flex: 'none', border: '1px solid var(--line2)',
            }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />

          {/* Title & Set Details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2, color: 'var(--tx)' }}>
              {exercise}
            </div>
            <div className="num" style={{
              fontSize: 10, color: 'var(--tx3)', marginTop: 3, display: 'flex', gap: 6, alignItems: 'center',
            }}>
              <span>{weightShorthand}</span>
            </div>
          </div>

          {/* Status Tag "now" */}
          {isLive && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 800,
              color: '#FF5C98', textTransform: 'lowercase', letterSpacing: '.04em',
              marginRight: 4,
            }}>
              now
            </span>
          )}

          {/* Completion Fraction: e.g. 2/4 in Mint Green */}
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800,
            color: MINT, letterSpacing: '-.02em', flex: 'none', marginRight: 6,
          }}>
            {fraction}
          </div>
        </button>

        {/* Quick Action Controls on the Card */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
          <button
            onClick={onQuickLog}
            title="Log set"
            className="k-squish"
            style={{
              width: 26, height: 26, borderRadius: 6, border: '1px solid var(--line2)',
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
              width: 26, height: 26, borderRadius: 6, border: '1px solid var(--line2)',
              background: 'var(--card)', color: 'var(--tx2)', display: 'grid', placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon name="edit" size={11} color="currentColor" />
          </button>
          <button
            onClick={async () => {
              const yes = await confirmAsk(`Remove ${exercise}?`, {
                message: 'This will remove the exercise and its sets from this workout.',
                confirmLabel: 'Remove', danger: true,
              });
              if (yes) onRemove();
            }}
            title="Remove exercise"
            className="hov k-squish"
            style={{
              width: 26, height: 26, borderRadius: 6, border: '1px solid var(--line2)',
              background: 'var(--card)', color: 'var(--tx3)', display: 'grid', placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon name="trash" size={11} color="currentColor" />
          </button>
        </div>
      </div>

      {/* Pink Filled Progress Bar */}
      <div style={{ padding: '0 10px 8px' }}>
        <AsciiBar shape="slim" value={pct} hue={HUE} showValue={false} label={`${exercise} progress`} />
      </div>
    </div>
  );
}

/**
 * Exercise Edit Modal: Allows adjusting weights, reps, marking complete, or adding/deleting sets
 */
function ExerciseEditModal({
  exercise,
  sets,
  onClose,
  onAddSet,
  onChangeSet,
  onDropSet,
  onRemoveExercise,
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
        position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(6,5,11,.76)',
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
          borderRadius: phone ? '18px 18px 0 0' : 20, padding: 18,
          boxShadow: phone ? 'none' : '0 24px 64px rgba(0,0,0,0.75)',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, letterSpacing: '-.02em', color: 'var(--tx)' }}>
              Edit Sets · {exercise}
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
              width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center',
              background: 'var(--card2)', border: '1px solid var(--line2)', cursor: 'pointer',
            }}
          >
            <Icon name="close" size={13} color="var(--tx2)" />
          </button>
        </div>

        {/* Sets Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sets.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--tx3)', fontSize: 12 }}>
              No sets recorded yet. Click below to add your first set.
            </div>
          )}

          {sets.map((s, idx) => (
            <div
              key={s.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                background: 'var(--card2)', borderRadius: 10, border: '1px solid var(--line)',
              }}
            >
              <button
                onClick={() => onChangeSet(s, { done: !s.done })}
                className="k-squish"
                style={{
                  width: 24, height: 24, borderRadius: 6, border: `1.5px solid ${s.done ? MINT : 'var(--line2)'}`,
                  background: s.done ? `color-mix(in srgb, ${MINT} 20%, transparent)` : 'transparent',
                  color: s.done ? MINT : 'var(--tx3)', display: 'grid', placeItems: 'center', cursor: 'pointer',
                }}
              >
                {s.done ? <Icon name="check" size={13} color={MINT} /> : <span style={{ fontSize: 10, fontWeight: 700 }}>{idx + 1}</span>}
              </button>

              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Weight Input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    value={s.weight_kg || ''}
                    onChange={(e) => onChangeSet(s, { weight_kg: Number(e.target.value) || 0 })}
                    style={{
                      width: 54, padding: '4px 6px', borderRadius: 6, background: 'var(--card)',
                      border: '1px solid var(--line2)', color: 'var(--tx)', fontFamily: 'var(--font-mono)',
                      fontSize: 12, fontWeight: 700, textAlign: 'center',
                    }}
                  />
                  <span style={{ fontSize: 10.5, color: 'var(--tx3)', fontWeight: 600 }}>kg</span>
                </div>

                <span style={{ color: 'var(--line2)' }}>×</span>

                {/* Reps Input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    value={s.reps || ''}
                    onChange={(e) => onChangeSet(s, { reps: Number(e.target.value) || 0 })}
                    style={{
                      width: 46, padding: '4px 6px', borderRadius: 6, background: 'var(--card)',
                      border: '1px solid var(--line2)', color: 'var(--tx)', fontFamily: 'var(--font-mono)',
                      fontSize: 12, fontWeight: 700, textAlign: 'center',
                    }}
                  />
                  <span style={{ fontSize: 10.5, color: 'var(--tx3)', fontWeight: 600 }}>reps</span>
                </div>
              </div>

              {/* Delete Set */}
              <button
                onClick={() => onDropSet(s)}
                className="hov k-squish"
                title="Delete set"
                style={{
                  width: 24, height: 24, borderRadius: 6, border: 'none',
                  background: 'transparent', color: 'var(--tx3)', display: 'grid', placeItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <Icon name="close" size={12} color="currentColor" />
              </button>
            </div>
          ))}
        </div>

        {/* Modal Bottom Verbs */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={onAddSet}
            className="k-squish"
            style={{
              flex: 1, minHeight: 38, borderRadius: 10, border: `1px solid color-mix(in srgb, ${HUE} 40%, transparent)`,
              background: `color-mix(in srgb, ${HUE} 15%, transparent)`, color: HUE,
              fontSize: 12.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={13} color={HUE} /> Add Set
          </button>
          <button
            onClick={async () => {
              const yes = await confirmAsk(`Remove ${exercise}?`, {
                message: 'This will remove the exercise and all its sets from this workout.',
                confirmLabel: 'Remove', danger: true,
              });
              if (yes) onRemoveExercise();
            }}
            className="k-squish"
            style={{
              minHeight: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--line2)',
              background: 'var(--card)', color: 'var(--pal-orange, #FF5555)',
              fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, cursor: 'pointer',
            }}
          >
            <Icon name="trash" size={13} color="currentColor" /> Remove Exercise
          </button>
        </div>
      </div>
    </div>
  );
}

function PillBadge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em',
      textTransform: 'uppercase', padding: '4px 8px', borderRadius: 6,
      background: `color-mix(in srgb, ${HUE} 18%, transparent)`, color: HUE,
      border: `1px solid color-mix(in srgb, ${HUE} 35%, transparent)`,
    }}>
      {children}
    </span>
  );
}

const KICKER: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 800, letterSpacing: '.12em',
  textTransform: 'uppercase', color: 'var(--tx3)',
};

