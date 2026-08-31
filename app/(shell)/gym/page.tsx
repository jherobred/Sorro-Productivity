'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { MovementSheet } from '@/components/gym/MovementSheet';
import { useTraining, TrainingOverlays } from '@/components/body/Gym';
import { useLayout } from '@/lib/useLayout';
import { ymd } from '@/lib/series';
import { useTap } from '@/hooks/useTap';
import { PAL } from '@/lib/pal';
import {
  routineOf, slotFor, shotOf, lbs, volumeOf, ROUTINES, type Routine, type WorkoutSet,
} from '@/lib/lift';
import { useWorkouts, useBodyActions } from '@/lib/body';

/**
 * Gym — the session, and one button to start it.
 *
 * Split out of Body so a training screen is not sharing a scroll with a glass
 * of water. Food, water, steps and sleep went the other way, to `/fuel`.
 *
 * The old tab kept three separate lists — what is on the card, what has been
 * done, and volume per muscle — which meant reading the same six lifts three
 * times in three places to answer one question. There is one list now. Each
 * lift is a button carrying its own set count, working weight and volume, with
 * a bar across its bottom edge and a NOW tag on the live one, and tapping it
 * opens the movement.
 *
 * Tapping, specifically. These rows live inside a scrolling column, so they use
 * `useTap` rather than `onClick`: a finger that travelled was scrolling past,
 * not choosing. See hooks/useTap.ts.
 */

const HUE = PAL.pink;
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function GymPage() {
  const { phone } = useLayout();
  const today = ymd(new Date());
  const [open, setOpen] = useState<{ exercise: string; sub: string } | null>(null);

  const { data: workouts = [] } = useWorkouts(28);
  const A = useBodyActions(30, today);
  const T = useTraining({
    today, workouts,
    addWorkout: (w) => A.addWorkout.mutate(w),
    editWorkout: (id, patch) => A.editWorkout.mutate({ id, patch }),
    delWorkout: (id) => A.delWorkout.mutate({ id }),
  });

  const { session, blocks, plan, todayRoutine, mine, previously, sets } = T;
  const slot = slotFor(new Date().getDay());

  /** Consecutive days trained, back from today. */
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

  /** Which week of the plan this is, counted from the first session ever logged. */
  const week = useMemo(() => {
    if (!workouts.length) return 1;
    const first = [...workouts].sort((a, b) => a.on_date.localeCompare(b.on_date))[0];
    const ms = Date.now() - new Date(`${first.on_date}T12:00`).getTime();
    return Math.max(1, Math.floor(ms / (7 * 864e5)) + 1);
  }, [workouts]);

  /** This week's volume against the last full week, so the bar has a yardstick. */
  const weekVol = useMemo(() => {
    const from = ymd(new Date(Date.now() - 7 * 864e5));
    const ids = new Set(workouts.filter((w) => w.on_date >= from).map((w) => w.id));
    const prevIds = new Set(workouts.filter((w) => w.on_date < from).map((w) => w.id));
    const now = volumeOf(sets.filter((s) => ids.has(s.workout_id)));
    const before = volumeOf(sets.filter((s) => prevIds.has(s.workout_id)));
    return { now, target: Math.max(before, 1) };
  }, [workouts, sets]);

  /** The next set that has not been ticked, which is what "up next" means. */
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
  const hero = blocks[0]?.exercise ?? todayRoutine?.exercises[0] ?? 'Bench press';
  const heroShot = shotOf(hero);

  return (
    <div style={{ padding: phone ? '14px 14px 28px' : '20px 24px 32px', maxWidth: 720, marginInline: 'auto' }}>

      {/* Week and streak read as one fact, so they sit together. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <h1 className="sronly">Gym</h1>
          {!phone && (
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1 }}>Gym</div>
          )}
          <div style={{
            fontSize: phone ? 22 : 10.5, fontWeight: phone ? 800 : 400,
            letterSpacing: phone ? '-.03em' : 0,
            color: phone ? 'var(--tx)' : 'var(--tx3)', marginTop: phone ? 0 : 3,
          }}>
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, flex: 'none' }}>
          <Tag>Week {week}</Tag>
          {streak > 0 && <Tag>{streak} day streak</Tag>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>

        {/* The week and today's session are one block, directly above START. */}
        <div style={{
          position: 'relative', borderRadius: 13, overflow: 'hidden',
          background: 'var(--card2)', padding: 9, minHeight: 150,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        }}>
          {heroShot && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/ex/${heroShot}-0.jpg`} alt="" aria-hidden
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          <span aria-hidden style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(11,10,19,.2) 18%, rgba(11,10,19,.93) 100%)',
          }} />
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div data-tour="gym-week" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {DAYS.map((d, i) => {
                const r = routineOf(plan[i]);
                const on = i === slot;
                return (
                  <button
                    key={i}
                    onClick={() => T.setSheet('plan')}
                    style={{
                      borderRadius: 8, padding: '6px 2px', textAlign: 'center', cursor: 'pointer',
                      border: `1px solid ${on ? HUE : 'var(--line)'}`,
                      background: on ? `color-mix(in srgb, ${HUE} 22%, transparent)` : 'rgba(22,21,31,.72)',
                      opacity: r ? 1 : 0.45,
                    }}
                  >
                    <b style={{
                      display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                      marginBottom: 3, color: 'var(--tx)',
                    }}>{d}</b>
                    <span style={{
                      display: 'block', fontSize: 7.5, fontWeight: 600,
                      color: on ? HUE : 'var(--tx3)', textTransform: 'uppercase',
                    }}>{r ? r.name.replace(/ (Day|Body)$/, '') : 'Rest'}</span>
                  </button>
                );
              })}
            </div>
            <div>
              <div style={{ ...KICKER, color: HUE, marginBottom: 3 }}>
                Today · {todayRoutine?.name ?? 'No split set'}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.15 }}>
                {blocks.length ? blocks.map((b) => b.exercise).slice(0, 3).join(' · ') : todayRoutine?.exercises.slice(0, 3).join(' · ') ?? 'Pick a split'}
              </div>
              <div className="num" style={{ fontSize: 10, color: 'var(--tx2)', marginTop: 4 }}>
                {blocks.length || todayRoutine?.exercises.length || 0} exercises · {totalSets} sets
                {session ? ` · ${session.minutes} min` : ''}
              </div>
            </div>
          </div>
        </div>

        <button
          data-tour="gym-start"
          onClick={() => T.start(session ? null : todayRoutine)}
          className="k-squish"
          style={{
            width: '100%', minHeight: 46, borderRadius: 11, border: 'none', cursor: 'pointer',
            background: HUE, color: '#0B0A13', fontSize: 14, fontWeight: 800, letterSpacing: '-.01em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            boxShadow: `0 0 24px color-mix(in srgb, ${HUE} 32%, transparent)`,
          }}
        >
          <Icon name="play" size={15} color="#0B0A13" />
          {session ? 'Resume today’s routine' : 'Start today’s routine'}
        </button>

        {/* Volume, rest and what is next — one strip, split by a hairline. */}
        <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <AsciiBar
            value={Math.min(100, (weekVol.now / weekVol.target) * 100)}
            hue={HUE}
            text={`Week volume · ${lbs(weekVol.now).toLocaleString()} lbs`}
            label="Volume this week against last"
          />
          <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={KICKER}>Sets</span>
                <span className="num" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--tx2)' }}>
                  {doneSets} / {totalSets || 0}
                </span>
              </div>
              <AsciiBar shape="slim" value={totalSets ? (doneSets / totalSets) * 100 : 0}
                hue={PAL.amber} showValue={false} label="Sets done" />
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)' }} />
            <div style={{ flex: 1.15, minWidth: 0 }}>
              <div style={{ ...KICKER, marginBottom: 3 }}>Up next</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.15 }}>
                {next?.exercise ?? 'Nothing queued'}
              </div>
              <div className="num" style={{ fontSize: 9.5, color: 'var(--tx3)', marginTop: 2 }}>
                {next?.set
                  ? `Set ${next.index} of ${next.of} · ${lbs(next.set.weight_kg)} lbs × ${next.set.reps}`
                  : session ? 'Add a set to begin' : 'Not started'}
              </div>
            </div>
          </div>
        </div>

        {/* One list. Tap a lift for the movement. */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '2px 1px 0' }}>
          <div style={KICKER}>Today’s lifts — tap for the movement</div>
          <span className="num" style={{ fontSize: 9, color: 'var(--tx3)' }}>
            {doneSets} / {totalSets} SETS
          </span>
        </div>

        <div data-tour="gym-lifts" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {blocks.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--tx3)', margin: '4px 2px' }}>
              Nothing on the card yet. Start the routine and the split fills this in.
            </p>
          )}
          {blocks.map((b, i) => (
            <LiftRow
              key={b.exercise}
              exercise={b.exercise}
              sets={b.sets}
              last={previously[b.exercise] ?? null}
              live={next?.exercise === b.exercise && !!session}
              onOpen={(sub) => setOpen({ exercise: b.exercise, sub })}
            />
          ))}
        </div>
      </div>

      <TrainingOverlays T={T} />

      {open && (
        <MovementSheet exercise={open.exercise} subtitle={open.sub} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

/**
 * A lift, as one button.
 *
 * The whole box is the target — there is no separate chevron to hit — and the
 * bar sits flush along the bottom edge rather than inside the padding, so the
 * row reads as a thing with a progress state rather than a row containing a
 * bar.
 */
function LiftRow({
  exercise, sets, last, live, onOpen,
}: {
  exercise: string;
  sets: WorkoutSet[];
  last: WorkoutSet | null;
  live: boolean;
  onOpen: (subtitle: string) => void;
}) {
  const done = sets.filter((s) => s.done).length;
  const vol = lbs(volumeOf(sets));
  const working = sets.find((s) => !s.done) ?? sets[sets.length - 1] ?? last;
  const shot = shotOf(exercise);

  const line = sets.length
    ? `${done} of ${sets.length} done`
    : last ? 'Not started' : 'New';
  const weight = working
    ? `${lbs(working.weight_kg)} lbs × ${working.reps}`
    : '—';
  const subtitle = `${line} · ${weight} · ${vol.toLocaleString()} lbs`;

  const tap = useTap(() => onOpen(subtitle));
  const pct = sets.length ? (done / sets.length) * 100 : 0;
  const hue = done && done === sets.length ? PAL.mint : HUE;

  return (
    <button
      {...tap}
      aria-label={`${exercise}. ${subtitle}. Open the movement.`}
      style={{
        display: 'block', width: '100%', textAlign: 'left', padding: 0, cursor: 'pointer',
        borderRadius: 12, overflow: 'hidden', font: 'inherit', color: 'inherit',
        background: live ? `color-mix(in srgb, ${HUE} 9%, var(--card))` : 'var(--card)',
        border: `1px solid ${live ? `color-mix(in srgb, ${HUE} 55%, transparent)` : 'var(--line)'}`,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px' }}>
        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/ex/${shot}-0.jpg`} alt="" style={{ width: 42, height: 42, borderRadius: 9, objectFit: 'cover', flex: 'none' }} />
        ) : (
          <span style={{
            width: 42, height: 42, borderRadius: 9, flex: 'none', display: 'grid',
            placeItems: 'center', background: 'var(--card2)',
          }}>
            <Icon name="heart" size={16} color="var(--tx3)" />
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exercise}</span>
            {live && (
              <span style={{
                flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 7.5, fontWeight: 700,
                letterSpacing: '.11em', textTransform: 'uppercase', padding: '3px 5px',
                borderRadius: 4, background: HUE, color: '#0B0A13',
              }}>Now</span>
            )}
          </span>
          <span className="num" style={{
            fontSize: 9.5, color: 'var(--tx3)', marginTop: 3, display: 'flex', gap: 7, flexWrap: 'wrap',
          }}>
            <b style={{ color: 'var(--tx2)', fontWeight: 600 }}>{line}</b>
            <span>{weight}</span>
            <span>{vol.toLocaleString()} lbs</span>
          </span>
        </span>
      </span>
      <AsciiBar shape="edge" value={pct} hue={hue} showValue={false} label={`${exercise} progress`} />
    </button>
  );
}

const KICKER: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.13em',
  textTransform: 'uppercase', color: 'var(--tx3)',
};

const CARD: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 15, padding: 10,
};

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 700, letterSpacing: '.09em',
      textTransform: 'uppercase', padding: '3px 6px', borderRadius: 5, whiteSpace: 'nowrap',
      background: `color-mix(in srgb, ${HUE} 18%, transparent)`, color: HUE,
      border: `1px solid color-mix(in srgb, ${HUE} 32%, transparent)`,
    }}>{children}</span>
  );
}
