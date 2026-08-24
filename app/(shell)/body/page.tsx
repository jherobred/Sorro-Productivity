'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { Rings, Vessel, SleepArc } from '@/components/body/Instruments';
import { useTraining, TrainCard, ProgressCards, TrainingOverlays } from '@/components/body/Gym';
import { MealSheet } from '@/components/body/MealSheet';
import { useLayout } from '@/lib/useLayout';
import { toast } from '@/lib/toast';
import { ask } from '@/lib/ask';
import { ymd } from '@/lib/series';
import {
  useBodyDays, useMeals, useWorkouts, useBodyActions,
  sleepHours, dayOf, GOALS, type Meal,
} from '@/lib/body';

/**
 * Body — one page, one ground.
 *
 * What was here: a tab rail over three panes. Today and Eaten were Basedly's
 * lavender cards; Trained was openGym's black tracker rendered inside a
 * rounded, bordered box. So the section that mattered most looked like a
 * different app viewed through a window cut into this one, and switching to it
 * changed the palette, the type and the shape of every control on screen.
 *
 * There are no tabs now, and no pane. The whole tab is openGym's black ground
 * and everything is laid on it in one scroll, in the order a day is actually
 * lived: what today looks like, what you drank and slept, what you are
 * training, what you ate, and what all of it adds up to. `app/gym.css` maps
 * Basedly's own --card / --line / --tx / --acc onto openGym's surfaces inside
 * `.ogym`, so the rings, the glass and the sleep arc came across without being
 * rewritten — they are simply on the black now.
 *
 * Every control here is still the picture itself: you tap the glass, you drag
 * the arc, you tick a set. There is not a stepper on the page.
 */

const KICKER = 'og-h2';

export default function BodyPage() {
  const { phone } = useLayout();
  const today = ymd(new Date());
  const [adding, setAdding] = useState(false);

  const { data: days = [] } = useBodyDays(30);
  const { data: meals = [] } = useMeals(today);
  const { data: workouts = [] } = useWorkouts(28);
  const A = useBodyActions(30, today);

  const T = useTraining({
    today, workouts,
    addWorkout: (w) => A.addWorkout.mutate(w),
    editWorkout: (id, patch) => A.editWorkout.mutate({ id, patch }),
    delWorkout: (id) => A.delWorkout.mutate({ id }),
  });

  const day = dayOf(days, today);
  const water = day?.water ?? 0;
  const steps = day?.steps ?? 0;
  const from = day?.sleep_from ?? '23:00';
  const to = day?.sleep_to ?? '07:00';
  const slept = sleepHours(from, to) ?? day?.sleep_h ?? 0;

  const kcal = meals.reduce((s, m) => s + m.kcal, 0);
  const macro = {
    p: meals.reduce((s, m) => s + m.protein, 0),
    c: meals.reduce((s, m) => s + m.carbs, 0),
    f: meals.reduce((s, m) => s + m.fat, 0),
  };

  const set = (patch: Parameters<typeof A.setDay.mutate>[0]['patch']) =>
    A.setDay.mutate({ on_date: today, patch });

  /** Two columns on a desktop, one on a phone — the same content either way. */
  const pair: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fit, minmax(290px, 1fr))',
    gap: 12, alignItems: 'start',
  };

  return (
    <div className="ogym ogym-page" style={{ padding: phone ? '14px 14px 28px' : '20px 24px 32px' }}>
      <div style={{ maxWidth: 720, marginInline: 'auto' }}>

        {/* One header for the whole tab. The gym used to carry a second one.
            On a phone the Shell's own header already says "Body" a centimetre
            above this, so the word is read out but not drawn twice; the date
            becomes the heading, which is the part that is actually telling you
            something. On a desktop nothing else names the page, so it stays. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, margin: '2px 0 18px' }}>
          <div>
            <h1 className={phone ? 'sronly' : 'og-h1'}>Body</h1>
            <div className={phone ? 'og-h1' : 'og-sub'} style={phone ? { fontSize: 26 } : undefined}>
              {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
          <button className="og-btn og-primary og-sm" style={{ flex: 'none' }}
            onClick={() => T.start(T.session ? null : T.todayRoutine)}>
            <Icon name="play" size={14} color="currentColor" />
            {T.session ? 'Resume' : 'Start'}
          </button>
        </div>

        {/* --------------------------------------------------------- today */}
        <div className="og-card" style={{ display: 'grid', placeItems: 'center', gap: 12, paddingBlock: 18 }}>
          <div className={KICKER} style={{ justifySelf: 'start', margin: 0 }}>Today</div>
          <Rings rings={[
            { label: 'Move', value: steps, goal: GOALS.steps, color: 'var(--og-acc)', unit: 'steps' },
            { label: 'Fuel', value: kcal, goal: GOALS.kcal, color: 'var(--og-orange)', unit: 'kcal' },
            { label: 'Rest', value: slept, goal: GOALS.sleep, color: 'var(--og-yellow)', unit: 'hours' },
          ]} />
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Stat label="Move" value={steps.toLocaleString()} unit="steps" color="var(--og-acc)" />
            <Stat label="Fuel" value={String(kcal)} unit="kcal" color="var(--og-orange)" />
            <Stat label="Rest" value={String(slept)} unit="hours" color="var(--og-yellow)" />
          </div>
          <button className="og-btn og-sm"
            onClick={() => void ask('Steps today', { initial: String(steps), placeholder: 'e.g. 8400' })
              .then((v) => { if (v !== null) set({ steps: Math.max(0, Math.round(Number(v) || 0)) }); })}>
            Set steps
          </button>
        </div>

        <div style={pair}>
          <div className="og-card" style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
            <div className={KICKER} style={{ justifySelf: 'start', margin: 0 }}>Water — tap a cup</div>
            <Vessel cups={water} goal={GOALS.water} onSet={(n) => set({ water: n })} />
          </div>

          <div data-tour="body-sleep-arc" className="og-card" style={{ display: 'grid', gap: 10 }}>
            <div className={KICKER} style={{ margin: 0 }}>Sleep — drag the ends</div>
            <SleepArc from={from} to={to}
              onChange={(f, t) => set({ sleep_from: f, sleep_to: t, sleep_h: sleepHours(f, t) })} />
            <div className="og-big" style={{ textAlign: 'center', color: 'var(--og-yellow)' }}>
              {slept}<span className="og-muted" style={{ fontSize: 15 }}> hours</span>
            </div>
          </div>
        </div>

        {/* --------------------------------------------------------- train */}
        <div className={KICKER} style={{ marginTop: 22 }}>Training</div>
        <div data-tour="body-muscle-map">
          <TrainCard T={T} />
        </div>

        {/* ---------------------------------------------------------- fuel */}
        <div className={KICKER} style={{ marginTop: 22 }}>Fuel</div>

        <div style={pair}>
          <div className="og-card" style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
            <Rings size={150} rings={[
              { label: 'Calories', value: kcal, goal: GOALS.kcal, color: 'var(--og-orange)', unit: 'kcal' },
              { label: 'Protein', value: macro.p, goal: 110, color: 'var(--og-acc)', unit: 'g' },
              { label: 'Carbs', value: macro.c, goal: 260, color: 'var(--og-yellow)', unit: 'g' },
            ]} />
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Stat label="kcal" value={String(kcal)} unit={`of ${GOALS.kcal}`} color="var(--og-orange)" />
              <Stat label="protein" value={`${macro.p}g`} unit="" color="var(--og-acc)" />
              <Stat label="carbs" value={`${macro.c}g`} unit="" color="var(--og-yellow)" />
              <Stat label="fat" value={`${macro.f}g`} unit="" color="var(--og-red)" />
            </div>
          </div>

          <div className="og-card">
            <div className="og-row og-between" style={{ marginBottom: 10 }}>
              <div className={KICKER} style={{ margin: 0 }}>Meals</div>
              <button className="og-btn og-primary og-xs" onClick={() => setAdding(true)}>
                <Icon name="photo" size={12} color="currentColor" />Photograph one
              </button>
            </div>

            {meals.length === 0 && (
              <p className="og-muted og-small" style={{ margin: 0 }}>
                Nothing today. Point the camera at a plate — it estimates the numbers and you check
                them before anything is saved.
              </p>
            )}

            {meals.map((m) => <MealRow key={m.id} meal={m} onDelete={() => A.delMeal.mutate({ id: m.id })} />)}
          </div>
        </div>

        {/* ------------------------------------------------------ progress */}
        <div className={KICKER} style={{ marginTop: 22 }}>Progress</div>
        <ProgressCards T={T} />
      </div>

      <TrainingOverlays T={T} />

      {adding && (
        <MealSheet on={today} onClose={() => setAdding(false)}
          onSave={(m) => { A.addMeal.mutate(m); toast(`${m.name} added`); }} />
      )}
    </div>
  );
}

function MealRow({ meal: m, onDelete }: { meal: Meal; onDelete: () => void }) {
  return (
    <div className="og-setrow" style={{ gap: 11 }}>
      <span style={{
        width: 32, height: 32, flex: 'none', borderRadius: 9, display: 'grid', placeItems: 'center',
        background: 'var(--og-surface-2)',
      }}>
        <Icon name="food" size={15} color="var(--og-orange)" />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="og-tt" style={{ display: 'block', fontSize: 15 }}>{m.name}</span>
        <span className="og-ss" style={{ display: 'block' }}>
          {m.slot} · {m.protein}p {m.carbs}c {m.fat}f
        </span>
      </span>
      <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{m.kcal}</span>
      <button className="og-setgo" onClick={onDelete} aria-label={`Delete ${m.name}`}
        style={{ background: 'transparent', width: 26, height: 26 }}>
        <Icon name="close" size={12} color="var(--og-label-3)" />
      </button>
    </div>
  );
}

function Stat({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: 22, fontWeight: 600, color, letterSpacing: '-.021em', fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
      <div className="og-h2" style={{ margin: '2px 0 0', fontSize: 11 }}>{label}{unit ? ` ${unit}` : ''}</div>
    </div>
  );
}
