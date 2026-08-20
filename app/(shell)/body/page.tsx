'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { TabRail } from '@/components/TabRail';
import { Rings, Vessel, SleepArc, BodyMap, Ribbon } from '@/components/body/Instruments';
import { MealSheet } from '@/components/body/MealSheet';
import { PAL } from '@/lib/pal';
import { useLayout } from '@/lib/useLayout';
import { toast } from '@/lib/toast';
import { ask } from '@/lib/ask';
import { ymd } from '@/lib/series';
import {
  useBodyDays, useMeals, useWorkouts, useBodyActions,
  sleepHours, heatOf, dayOf, GOALS, GROUP_LABEL, type Group, type Meal,
} from '@/lib/body';

/**
 * Body, as instruments.
 *
 * What was here: six rows of numbers, each with a minus and a plus. It held the
 * right data and asked you to read it as a spreadsheet, so nobody read it.
 *
 * What is here now answers the three questions a body screen is for. **Today**
 * is one object — three rings, a glass you tap, an arc you drag. **Trained** is
 * a silhouette that warms where you worked, so cold legs on a Thursday is an
 * argument you can see rather than a row you have to compare. **Eaten** is a
 * plate you photograph.
 *
 * Every control here is the picture itself. There is not a stepper on the page.
 */

const CARD: React.CSSProperties = {
  background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--sh)', border: '1px solid var(--line)',
};
const KICKER: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)',
};

const TABS = [
  { id: 'today' as const, label: 'Today', icon: 'focus' as const },
  { id: 'trained' as const, label: 'Trained', icon: 'gym' as const },
  { id: 'eaten' as const, label: 'Eaten', icon: 'food' as const },
];

export default function BodyPage() {
  const { phone } = useLayout();
  const today = ymd(new Date());
  const [tab, setTab] = useState<'today' | 'trained' | 'eaten'>('today');
  const [adding, setAdding] = useState(false);

  const { data: days = [] } = useBodyDays(30);
  const { data: meals = [] } = useMeals(today);
  const { data: workouts = [] } = useWorkouts(28);
  const A = useBodyActions(30, today);

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

  const heat = useMemo(() => heatOf(workouts, 7), [workouts]);
  // Sorted here rather than trusted from the query: the ribbon's last point is
  // "now", and a source that hands them back newest-first would draw the month
  // backwards and label the oldest reading as today's.
  const weights = days.filter((d) => d.weight)
    .map((d) => ({ day: d.on_date, value: Number(d.weight) }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const set = (patch: Parameters<typeof A.setDay.mutate>[0]['patch']) =>
    A.setDay.mutate({ on_date: today, patch });

  const logWorkout = (g: Group) => {
    A.addWorkout.mutate({
      id: crypto.randomUUID(), on_date: today,
      name: GROUP_LABEL[g], groups: [g], minutes: 45,
    });
    toast(`${GROUP_LABEL[g]} logged`);
  };

  return (
    <div style={{ padding: phone ? '14px 14px 24px' : '20px 24px 28px', maxWidth: 1240, marginInline: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 className="sronly">Body</h1>
        <TabRail tabs={TABS} value={tab} onChange={setTab} phone={phone} label="Body sections" />
        <div style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: 'var(--tx3)' }}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {/* ------------------------------------------------------------ today */}
      {tab === 'today' && (
        <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, alignItems: 'start' }}>
          <div style={{ ...CARD, padding: '18px 16px', display: 'grid', placeItems: 'center', gap: 12 }}>
            <div style={{ ...KICKER, justifySelf: 'start' }}>Today</div>
            <Rings rings={[
              { label: 'Move', value: steps, goal: GOALS.steps, color: PAL.pink, unit: 'steps' },
              { label: 'Fuel', value: kcal, goal: GOALS.kcal, color: PAL.amber, unit: 'kcal' },
              { label: 'Rest', value: slept, goal: GOALS.sleep, color: PAL.cyan, unit: 'hours' },
            ]} />
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Stat label="Move" value={steps.toLocaleString()} unit="steps" color={PAL.pink} />
              <Stat label="Fuel" value={String(kcal)} unit="kcal" color={PAL.amber} />
              <Stat label="Rest" value={String(slept)} unit="hours" color={PAL.cyan} />
            </div>
            <button
              onClick={() => void ask('Steps today', { initial: String(steps), placeholder: 'e.g. 8400' })
                .then((v) => { if (v !== null) set({ steps: Math.max(0, Math.round(Number(v) || 0)) }); })}
              className="hov k-squish"
              style={{ padding: '7px 13px', borderRadius: 999, border: '1px solid var(--line2)', fontSize: 11, fontWeight: 700, color: 'var(--tx2)' }}>
              Set steps
            </button>
          </div>

          <div style={{ ...CARD, padding: '18px 16px', display: 'grid', gap: 12, justifyItems: 'center' }}>
            <div style={{ ...KICKER, justifySelf: 'start' }}>Water — tap a cup</div>
            <Vessel cups={water} goal={GOALS.water} onSet={(n) => set({ water: n })} />
          </div>

          <div style={{ ...CARD, padding: '18px 16px', display: 'grid', gap: 10 }}>
            <div style={KICKER}>Sleep — drag the ends</div>
            <SleepArc from={from} to={to}
              onChange={(f, t) => set({ sleep_from: f, sleep_to: t, sleep_h: sleepHours(f, t) })} />
            <div style={{ textAlign: 'center', fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', color: PAL.cyan }}>
              {slept}<span style={{ fontSize: 12, color: 'var(--tx3)', fontWeight: 600 }}> hours</span>
            </div>
          </div>

          <div style={{ ...CARD, padding: '18px 16px', display: 'grid', gap: 10 }}>
            <div style={KICKER}>Weight, this month</div>
            <Ribbon points={weights} />
            <button
              onClick={() => void ask('Weight today', { initial: String(day?.weight ?? ''), placeholder: 'kg' })
                .then((v) => { if (v) set({ weight: Number(v) || null }); })}
              className="hov k-squish"
              style={{ justifySelf: 'start', padding: '7px 13px', borderRadius: 999, border: '1px solid var(--line2)', fontSize: 11, fontWeight: 700, color: 'var(--tx2)' }}>
              Log today's
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- trained */}
      {tab === 'trained' && (
        <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '340px minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
          <div style={{ ...CARD, padding: '18px 16px', display: 'grid', gap: 12 }}>
            <div style={KICKER}>This week — tap where you trained</div>
            <BodyMap heat={heat} onTap={logWorkout} />
          </div>

          <div style={{ ...CARD, padding: '16px 16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={KICKER}>Sessions</div>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)' }}>
                {workouts.length} in four weeks
              </span>
            </div>

            {workouts.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.7, margin: 0 }}>
                Nothing logged yet. Tap a muscle group on the body and it goes in with today's date —
                that is also what the gym challenges count.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {workouts.map((w) => (
                <div key={w.id} className="row" style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px',
                  borderBottom: '1px solid var(--line)',
                }}>
                  <Icon name="gym" size={14} color={PAL.mint} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>{w.name || 'Session'}</span>
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)' }}>
                      {w.groups.map((g) => GROUP_LABEL[g as Group] ?? g).join(' · ') || '—'} · {w.minutes} min
                    </span>
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{w.on_date}</span>
                  <button onClick={() => A.delWorkout.mutate({ id: w.id })} className="hov" aria-label={`Delete ${w.name}`}
                    style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
                    <Icon name="close" size={12} color="var(--tx3)" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ eaten */}
      {tab === 'eaten' && (
        <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '300px minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
          <div style={{ ...CARD, padding: '18px 16px', display: 'grid', gap: 12, justifyItems: 'center' }}>
            <div style={{ ...KICKER, justifySelf: 'start' }}>Fuel today</div>
            <Rings size={150} rings={[
              { label: 'Calories', value: kcal, goal: GOALS.kcal, color: PAL.amber, unit: 'kcal' },
              { label: 'Protein', value: macro.p, goal: 110, color: PAL.coral, unit: 'g' },
              { label: 'Carbs', value: macro.c, goal: 260, color: PAL.mint, unit: 'g' },
            ]} />
            <div style={{ display: 'flex', gap: 14 }}>
              <Stat label="kcal" value={String(kcal)} unit={`of ${GOALS.kcal}`} color={PAL.amber} />
              <Stat label="protein" value={`${macro.p}g`} unit="" color={PAL.coral} />
              <Stat label="carbs" value={`${macro.c}g`} unit="" color={PAL.mint} />
              <Stat label="fat" value={`${macro.f}g`} unit="" color={PAL.violet} />
            </div>
          </div>

          <div style={{ ...CARD, padding: '16px 16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={KICKER}>Meals</div>
              <button onClick={() => setAdding(true)} className="k-squish"
                style={{
                  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px',
                  borderRadius: 10, background: 'var(--acc)', color: 'var(--ink)', fontSize: 11.5, fontWeight: 800, minHeight: 34,
                }}>
                <Icon name="photo" size={13} color="var(--ink)" />Photograph one
              </button>
            </div>

            {meals.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.7, margin: 0 }}>
                Nothing today. Point the camera at a plate — it estimates the numbers and you check them
                before anything is saved.
              </p>
            )}

            {meals.map((m) => <MealRow key={m.id} meal={m} onDelete={() => A.delMeal.mutate({ id: m.id })} />)}
          </div>
        </div>
      )}

      {adding && (
        <MealSheet on={today} onClose={() => setAdding(false)}
          onSave={(m) => { A.addMeal.mutate(m); toast(`${m.name} added`); }} />
      )}
    </div>
  );
}

function MealRow({ meal: m, onDelete }: { meal: Meal; onDelete: () => void }) {
  return (
    <div className="row" style={{
      display: 'flex', alignItems: 'center', gap: 11, padding: '9px 4px', borderBottom: '1px solid var(--line)',
    }}>
      <span style={{
        width: 34, height: 34, flex: 'none', borderRadius: 10, display: 'grid', placeItems: 'center',
        background: 'var(--card2)',
      }}>
        <Icon name="food" size={15} color={PAL.amber} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>{m.name}</span>
        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)' }}>
          {m.slot} · {m.protein}p {m.carbs}c {m.fat}f
        </span>
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{m.kcal}</span>
      <button onClick={onDelete} className="hov" aria-label={`Delete ${m.name}`}
        style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
        <Icon name="close" size={12} color="var(--tx3)" />
      </button>
    </div>
  );
}

function Stat({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ ...KICKER, marginTop: 2 }}>{label}{unit ? ` ${unit}` : ''}</div>
    </div>
  );
}
