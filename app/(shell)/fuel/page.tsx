'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { WaterCard } from '@/components/fuel/WaterColumn';
import { MealEditor } from '@/components/fuel/MealEditor';
import { MealSheet } from '@/components/body/MealSheet';
import { SleepArc } from '@/components/body/Instruments';
import { useOverlayBack } from '@/lib/nav';
import { useLayout } from '@/lib/useLayout';
import { toast } from '@/lib/toast';
import { ask } from '@/lib/ask';
import { ymd } from '@/lib/series';
import { useTap } from '@/hooks/useTap';
import { hydration, hourOf, CUP_ML } from '@/lib/hydration';
import { useWater, useWaterActions, waterTotals, setCups } from '@/lib/water';
import {
  useBodyDays, useMeals, useBodyActions, sleepHours, dayOf, GOALS, type Meal,
} from '@/lib/body';

/**
 * Fuel — everything the body takes in.
 *
 * Split out of Body so that logging a glass of water never means scrolling past
 * a squat rack. Gym went the other way, to `/gym`.
 *
 * The order is the order of a day: how you are doing on water right now, what
 * has already happened if you want to check, what you ate, and how far the
 * other two dials have moved. Water leads because it is the only thing here
 * that can be wrong in both directions and the only one that warns you.
 */

const HUE = '#A3E635';

export default function FuelPage() {
  const { phone } = useLayout();
  const today = ymd(new Date());
  const now = new Date();

  const { data: days = [] } = useBodyDays(30);
  const { data: meals = [] } = useMeals(today);
  const { data: sips = [] } = useWater(now);
  const A = useBodyActions(30, today);
  const W = useWaterActions(now);

  /** A meal being edited. `undefined` closed, a Meal for edit. */
  const [editing, setEditing] = useState<Meal | undefined>(undefined);
  /** Adding goes through the scanner instead, which estimates the macros. */
  const [scanning, setScanning] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const [showDay, setShowDay] = useState(false);

  const day = dayOf(days, today);
  const steps = day?.steps ?? 0;
  const from = day?.sleep_from ?? '23:00';
  const to = day?.sleep_to ?? '07:00';
  const slept = sleepHours(from, to) ?? day?.sleep_h ?? 0;

  const { total, lastHour } = useMemo(() => waterTotals(sips, now), [sips, now]);
  const hour = hourOf(now);
  const state = hydration(total, lastHour, hour);
  const kcal = meals.reduce((s, m) => s + m.kcal, 0);

  const set = (patch: Parameters<typeof A.setDay.mutate>[0]['patch']) =>
    A.setDay.mutate({ on_date: today, patch });

  /** Water and meals on one clock, so a burst of cups reads as a burst. */
  const timeline = useMemo(() => {
    const rows = [
      ...sips.map((s) => ({ at: s.at, kind: 'water' as const, ml: s.ml, meal: null })),
      ...meals.map((m) => ({ at: `${m.on_date}T12:00:00`, kind: 'meal' as const, ml: 0, meal: m })),
    ];
    return rows.sort((a, b) => a.at.localeCompare(b.at));
  }, [sips, meals]);

  return (
    <div style={{ padding: phone ? '14px 14px 28px' : '20px 24px 32px', maxWidth: 720, marginInline: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <h1 className="sronly">Fuel</h1>
          {!phone && (
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1 }}>Fuel</div>
          )}
          <div style={{
            fontSize: phone ? 22 : 10.5, fontWeight: phone ? 800 : 400,
            letterSpacing: phone ? '-.03em' : 0,
            color: phone ? 'var(--tx)' : 'var(--tx3)', marginTop: phone ? 0 : 3,
          }}>
            {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <span style={TAG}>{kcal.toLocaleString()} kcal</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>

        <div data-tour="fuel-water">
        <WaterCard
          total={total}
          lastHour={lastHour}
          hour={hour}
          onSetCups={(n) => setCups(sips, n, (s) => W.add.mutate(s), (id) => W.remove.mutate({ id }))}
        />
        </div>

        {/* Everything so far, folded away until asked for. */}
        <div style={{ border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 12, overflow: 'hidden' }}>
          <button
            onClick={() => setShowDay((s) => !s)}
            aria-expanded={showDay}
            className="hov"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, padding: '10px 12px', background: 'none', border: 'none', color: 'inherit',
              cursor: 'pointer', minHeight: 40, font: 'inherit',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600 }}>
              <span style={{
                display: 'inline-block', transition: 'transform .25s ease', fontSize: 11, color: 'var(--tx3)',
                transform: showDay ? 'rotate(90deg)' : 'none',
              }}>▸</span>
              {showDay ? 'Hide today so far' : 'Check today so far?'}
            </span>
            <span className="num" style={{ fontSize: 9, color: 'var(--tx3)' }}>
              {(total / 1000).toFixed(2)} L · {kcal.toLocaleString()} KCAL
            </span>
          </button>
          <div style={{
            display: 'grid', gridTemplateRows: showDay ? '1fr' : '0fr',
            transition: 'grid-template-rows .3s cubic-bezier(.16,1,.3,1)',
          }}>
            <div style={{ overflow: 'hidden', minHeight: 0 }}>
              <div style={{ padding: '2px 12px 11px' }}>
                {timeline.length === 0 && (
                  <p style={{ fontSize: 11, color: 'var(--tx3)', margin: 0 }}>Nothing logged yet today.</p>
                )}
                {timeline.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span className="num" style={{ fontSize: 8.5, color: 'var(--tx3)', width: 32, flex: 'none', paddingTop: 3 }}>
                      {new Date(r.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flex: 'none', marginTop: 3,
                      background: r.kind === 'water' ? '#38BDF8' : HUE,
                    }} />
                    <span style={{ flex: 1, fontSize: 10.5, fontWeight: 500, paddingBottom: 9, lineHeight: 1.3 }}>
                      {r.kind === 'water' ? `${r.ml} ml` : r.meal?.name}
                      <em style={{
                        fontStyle: 'normal', color: 'var(--tx3)', fontFamily: 'var(--font-mono)',
                        fontSize: 9, display: 'block', marginTop: 1,
                      }}>
                        {r.kind === 'water'
                          ? 'water'
                          : `${r.meal?.kcal} kcal${r.meal?.place ? ` · ${r.meal.place}` : ''}`}
                      </em>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Meals: tap a photograph to edit it, the last tile to add one. */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: 1 }}>
          <div style={KICKER}>Meals — tap to edit</div>
          <span className="num" style={{ fontSize: 9, color: 'var(--tx3)' }}>{meals.length} TODAY</span>
        </div>

        <div data-tour="fuel-meals" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {meals.slice(0, 5).map((m) => <MealChip key={m.id} meal={m} onOpen={() => setEditing(m)} />)}
          <AddChip onOpen={() => setScanning(true)} />
        </div>

        {/* Steps and sleep, as two fat verticals. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <VCard
            label="Steps" hue={HUE}
            pct={Math.min(100, (steps / GOALS.steps) * 100)}
            value={steps.toLocaleString()}
            sub={`of ${GOALS.steps.toLocaleString()}`}
            onClick={() => void ask('Steps today', { initial: String(steps), placeholder: 'e.g. 8400' })
              .then((v) => { if (v !== null) set({ steps: Math.max(0, Math.round(Number(v) || 0)) }); })}
          />
          <VCard
            label="Sleep" hue="#FFC24B"
            pct={Math.min(100, (slept / GOALS.sleep) * 100)}
            value={String(slept)} unit=" h"
            sub={`of ${GOALS.sleep} h · ${from}–${to}`}
            onClick={() => setSleeping(true)}
          />
        </div>
      </div>

      {/* The bar is the read-out; the arc is still how sleep is set. Dropping
          it with the old Body page would have left sleep unloggable. */}
      {sleeping && (
        <SleepSheet
          from={from} to={to}
          onClose={() => setSleeping(false)}
          onChange={(f, t) => set({ sleep_from: f, sleep_to: t, sleep_h: sleepHours(f, t) })}
        />
      )}

      {scanning && (
        <MealSheet
          on={today}
          onClose={() => setScanning(false)}
          onSave={(m) => { A.addMeal.mutate(m); toast(`${m.name} added`); }}
        />
      )}

      {editing !== undefined && (
        <MealEditor
          meal={editing}
          on={today}
          onClose={() => setEditing(undefined)}
          onSave={(m) => { A.editMeal.mutate({ id: m.id, patch: m }); toast(`${m.name} saved`); }}
          onDelete={() => { A.delMeal.mutate({ id: editing.id }); toast(`${editing.name} removed`); }}
        />
      )}
    </div>
  );
}

const KICKER: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.13em',
  textTransform: 'uppercase', color: 'var(--tx3)',
};

const TAG: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 700, letterSpacing: '.09em',
  textTransform: 'uppercase', padding: '3px 6px', borderRadius: 5,
  background: `color-mix(in srgb, ${HUE} 18%, transparent)`, color: HUE,
  border: `1px solid color-mix(in srgb, ${HUE} 32%, transparent)`, flex: 'none',
};

/** A meal, as its own photograph. Taps, so scrolling the grid never opens one. */
function MealChip({ meal, onOpen }: { meal: Meal; onOpen: () => void }) {
  const tap = useTap(onOpen);
  return (
    <button {...tap} style={{ ...CHIP, padding: 0 }} aria-label={`Edit ${meal.name}`}>
      {meal.photo_path
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={meal.photo_path} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: .94 }} />
        : <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <Icon name="food" size={18} color="var(--tx3)" />
          </span>}
      <span style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '13px 5px 4px', textAlign: 'left',
        background: 'linear-gradient(180deg, transparent, rgba(11,10,19,.94))',
        fontSize: 8.5, fontWeight: 600, lineHeight: 1.15, color: '#EFEDF5',
      }}>
        {meal.name}
        <span className="num" style={{ display: 'block', fontSize: 7.5, color: '#A29EBB', fontWeight: 600 }}>
          {meal.kcal} kcal
        </span>
      </span>
    </button>
  );
}

function AddChip({ onOpen }: { onOpen: () => void }) {
  const tap = useTap(onOpen);
  return (
    <button {...tap} aria-label="Photograph a meal" style={{
      ...CHIP, border: '1px dashed var(--line2)', background: 'transparent', color: 'var(--tx3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2,
      fontSize: 9, fontWeight: 600,
    }}>
      <Icon name="photo" size={17} color="var(--tx3)" />
      Photograph
    </button>
  );
}

const CHIP: React.CSSProperties = {
  position: 'relative', borderRadius: 10, overflow: 'hidden', aspectRatio: '1 / .84',
  background: 'var(--card2)', border: '1px solid var(--line)', cursor: 'pointer',
};

function VCard({
  label, hue, pct, value, unit, sub, onClick,
}: {
  label: string; hue: string; pct: number; value: string; unit?: string; sub: string; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={onClick ? 'hov' : undefined}
      style={{
        background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 10,
        display: 'flex', gap: 9, alignItems: 'stretch', textAlign: 'left', color: 'inherit',
        cursor: onClick ? 'pointer' : 'default', font: 'inherit', width: '100%',
      }}
    >
      <AsciiBar shape="vertical" value={pct} hue={hue} length={88} label={label} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
        <span style={KICKER}>{label}</span>
        <span className="num" style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.035em', lineHeight: 1, color: hue }}>
          {value}{unit && <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{unit}</span>}
        </span>
        <span style={{ fontSize: 9.5, color: 'var(--tx3)', lineHeight: 1.35 }}>{sub}</span>
      </span>
    </Tag>
  );
}

/**
 * Sleep, still set by dragging.
 *
 * The vertical bar reads it at a glance; the arc is how it is entered. Two
 * clock times you drag beat two numbers you type, which is why the arc
 * survived the split even though the card that used to hold it did not.
 */
function SleepSheet({
  from, to, onClose, onChange,
}: {
  from: string; to: string; onClose: () => void; onChange: (f: string, t: string) => void;
}) {
  useOverlayBack(true, onClose);
  return (
    <div
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(6,5,11,.74)',
        backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div className="rise" style={{
        width: '100%', maxWidth: 420, background: 'var(--panel)', border: '1px solid var(--line2)',
        borderBottom: 'none', borderRadius: '18px 18px 0 0',
        padding: '10px 16px calc(20px + env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ width: 34, height: 3.5, borderRadius: 2, background: 'var(--line2)', margin: '0 auto 2px' }} />
        <div style={KICKER}>Sleep — drag the ends</div>
        <SleepArc from={from} to={to} onChange={onChange} />
        <button onClick={onClose} className="acc k-squish" style={{
          width: '100%', minHeight: 44, borderRadius: 11, background: 'var(--acc)',
          color: 'var(--ink)', fontSize: 13.5, fontWeight: 800, border: 'none', cursor: 'pointer',
        }}>Done</button>
      </div>
    </div>
  );
}
