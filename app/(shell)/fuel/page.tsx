'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon, type IconName } from '@/components/Icon';
import { SectionLabel, Meter, VitalTile, EmptyBlock, CountUp } from '@/components/Vitals';
import { FuelWaterCard } from '@/components/fuel/WaterFlask';
import { FoodPhotoCard, DEFAULT_PRESETS, type FoodPreset } from '@/components/fuel/FoodPhotoCard';
import { MealEditor } from '@/components/fuel/MealEditor';
const MealSheet = dynamic(() => import('@/components/body/MealSheet').then((m) => m.MealSheet), { ssr: false });
import { SleepArc } from '@/components/body/Instruments';
import { ContextMenu, type CtxItem } from '@/components/ContextMenu';
import { useOverlayBack } from '@/lib/nav';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import { toast } from '@/lib/toast';
import { ask } from '@/lib/ask';
import { ymd } from '@/lib/series';
import { hourOf, CUP_ML, GOAL_ML } from '@/lib/hydration';
import { useWater, useWaterActions, waterTotals, setCups, type Sip } from '@/lib/water';
import {
  useBodyDays, useMeals, useBodyActions, sleepHours, dayOf, GOALS, type Meal,
} from '@/lib/body';

const HUE_LIME = '#A3E635';
const HUE_SLEEP = '#FFC24B';
const HUE_CYAN = '#38BDF8';
const HUE_PINK = '#F472B6';
const HUE_VIOLET = '#B07CFF';

const MAX_DAY_PHOTOS = 20;

/** Rough splits of the calorie goal. Enough to draw a bar against. */
const MACRO_GOALS = { protein: 140, carbs: 240, fat: 70 };

/** The order a day is eaten in, so the slot columns are never alphabetical. */
const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
const SLOT_HUE: Record<string, string> = {
  Breakfast: HUE_SLEEP, Lunch: HUE_LIME, Dinner: HUE_VIOLET, Snack: HUE_PINK,
};
const SLOT_ICON: Record<string, IconName> = {
  Breakfast: 'spark', Lunch: 'food', Dinner: 'moon', Snack: 'cup',
};

export default function FuelPage() {
  const { phone } = useLayout();
  const { prefs } = usePrefs();
  const animate = prefs.motion;

  const today = ymd(new Date());
  const now = new Date();

  const { data: days = [] } = useBodyDays(30);
  const { data: meals = [] } = useMeals(today);
  const { data: sips = [] } = useWater(now);
  const A = useBodyActions(30, today);
  const W = useWaterActions(now);

  const [editing, setEditing] = useState<Meal | undefined>(undefined);
  const [scanning, setScanning] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxItem[] } | null>(null);

  const day = dayOf(days, today);
  const steps = day?.steps ?? 0;
  const from = day?.sleep_from ?? null;
  const to = day?.sleep_to ?? null;
  const slept = sleepHours(from, to) ?? day?.sleep_h ?? null;

  const { total, lastHour } = useMemo(() => waterTotals(sips, now), [sips, now]);
  const hour = hourOf(now);

  const dayMealsWithPhotos = useMemo(() => meals.filter((m) => Boolean(m.photo_path)), [meals]);
  const photoCount = dayMealsWithPhotos.length;
  const isPhotoLimitReached = photoCount >= MAX_DAY_PHOTOS;

  const macros = useMemo(() => meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + (m.kcal || 0),
      protein: acc.protein + (m.protein || 0),
      carbs: acc.carbs + (m.carbs || 0),
      fat: acc.fat + (m.fat || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  ), [meals]);

  const setDayPatch = (patch: Parameters<typeof A.setDay.mutate>[0]['patch']) =>
    A.setDay.mutate({ on_date: today, patch });

  const addSteps = (delta: number) => {
    setDayPatch({ steps: Math.max(0, steps + delta) });
    toast(`+${delta.toLocaleString()} steps`);
  };

  const askSteps = () => void ask('Steps today', { initial: String(steps), placeholder: 'e.g. 8400' })
    .then((v) => { if (v !== null) setDayPatch({ steps: Math.max(0, Math.round(Number(v) || 0)) }); });

  const addWaterMl = (ml: number) => {
    W.add.mutate({ id: crypto.randomUUID(), at: new Date().toISOString(), ml });
    toast(`+${ml} ml`);
  };

  const undoLastSip = () => {
    if (!sips.length) return;
    const latest = [...sips].sort((a, b) => b.at.localeCompare(a.at))[0];
    W.remove.mutate({ id: latest.id });
    toast(`Removed ${latest.ml} ml`);
  };

  const deleteSip = (id: string, ml: number) => {
    W.remove.mutate({ id });
    toast(`Removed ${ml} ml`);
  };

  const logPresetMeal = (p: FoodPreset) => {
    const keepPhoto = !(p.photo_path && isPhotoLimitReached);
    A.addMeal.mutate({
      id: crypto.randomUUID(),
      on_date: today,
      name: p.name,
      slot: p.slot,
      kcal: p.kcal,
      protein: p.protein,
      carbs: p.carbs,
      fat: p.fat,
      photo_path: keepPhoto ? p.photo_path : null,
      place: null,
    });
    toast(keepPhoto
      ? `${p.name} logged · +${p.kcal} kcal`
      : `${p.name} logged without photo — daily limit reached`);
  };

  /** Meals and sips on one clock. Meals without a time sort to when they were eaten. */
  const timeline = useMemo(() => {
    const rows = [
      ...sips.map((s) => ({ id: s.id, at: s.at, kind: 'water' as const, ml: s.ml, meal: null as Meal | null, sip: s })),
      ...meals.map((m) => ({
        id: m.id,
        at: `${m.on_date}T${slotClock(m.slot)}:00`,
        kind: 'meal' as const,
        ml: 0,
        meal: m,
        sip: null as Sip | null,
      })),
    ];
    return rows.sort((a, b) => a.at.localeCompare(b.at));
  }, [sips, meals]);

  const bySlot = useMemo(() => SLOTS.map((s) => ({
    slot: s,
    items: meals.filter((m) => (m.slot || 'Snack') === s),
  })).filter((g) => g.items.length > 0), [meals]);

  const openTimelineMenu = (row: (typeof timeline)[number], x: number, y: number) => {
    if (row.meal) {
      const m = row.meal;
      setMenu({
        x, y, label: m.name,
        items: [
          { label: 'Edit meal', icon: 'edit', run: () => setEditing(m) },
          {
            label: 'Log again now', icon: 'copy',
            run: () => {
              A.addMeal.mutate({ ...m, id: crypto.randomUUID() });
              toast(`${m.name} logged again`);
            },
          },
          {
            label: 'Delete meal', icon: 'trash', danger: true,
            run: () => { A.delMeal.mutate({ id: m.id }); toast(`${m.name} removed`); },
          },
        ],
      });
      return;
    }
    if (row.sip) {
      const s = row.sip;
      setMenu({
        x, y, label: `${s.ml} ml`,
        items: [
          { label: 'Add the same again', icon: 'plus', run: () => addWaterMl(s.ml) },
          { label: 'Remove this log', icon: 'trash', danger: true, run: () => deleteSip(s.id, s.ml) },
        ],
      });
    }
  };

  const waterPct = Math.min(100, (total / GOAL_ML) * 100);
  const kcalPct = Math.min(100, (macros.kcal / GOALS.kcal) * 100);
  const stepsPct = Math.min(100, (steps / GOALS.steps) * 100);
  const proteinPct = Math.min(100, (macros.protein / MACRO_GOALS.protein) * 100);

  return (
    <div style={{
      padding: '0 0 32px',
      maxWidth: 1720,
      marginInline: 'auto',
      color: 'var(--tx)',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* ------------------------------------------------------------- Hero */}
      <motion.div
        initial={animate ? { opacity: 0, y: -8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        style={{
          position: 'relative', overflow: 'hidden',
          background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20,
          boxShadow: 'var(--sh)', padding: phone ? '15px 15px 17px' : '18px 22px 20px',
        }}
      >

        <div style={{
          position: 'relative', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <h1 style={{
                fontSize: phone ? 30 : 40, fontWeight: 800, margin: 0,
                letterSpacing: '-.03em', color: 'var(--tx)',
              }}>
                Fuel
              </h1>
              <span style={{
                fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999,
                background: `color-mix(in srgb, ${HUE_LIME} 16%, transparent)`, color: HUE_LIME,
              }}>
                {meals.length === 0 && sips.length === 0
                  ? 'Nothing logged yet'
                  : `${meals.length} meal${meals.length === 1 ? '' : 's'} · ${(total / 1000).toFixed(1)} L`}
              </span>
            </div>
            <div className="metaline" style={{ marginTop: 3, fontSize: 12 }}>
              {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              {macros.kcal > 0 && <> · {Math.round(kcalPct)}% of the calorie goal</>}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <MacroChip label="Protein" val={macros.protein} goal={MACRO_GOALS.protein} hue={HUE_LIME} animate={animate} />
            <MacroChip label="Carbs" val={macros.carbs} goal={MACRO_GOALS.carbs} hue={HUE_CYAN} animate={animate} />
            <MacroChip label="Fat" val={macros.fat} goal={MACRO_GOALS.fat} hue={HUE_PINK} animate={animate} />

            <motion.button
              onClick={() => {
                if (isPhotoLimitReached) {
                  toast(`Photo limit reached (${MAX_DAY_PHOTOS}). Remove one to add more.`);
                  return;
                }
                setScanning(true);
              }}
              whileTap={animate ? { scale: 0.95 } : undefined}
              whileHover={animate ? { scale: 1.04 } : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 11,
                background: HUE_LIME, color: '#0B0A13', fontSize: 12.5, fontWeight: 800,
                border: 'none', cursor: 'pointer',
                boxShadow: `0 3px 16px color-mix(in srgb, ${HUE_LIME} 40%, transparent)`,
              }}
            >
              <Icon name="photo" size={14} color="#0B0A13" />
              Log a plate
            </motion.button>
          </div>
        </div>

        <div style={{ position: 'relative', marginTop: 15, display: 'grid', gap: 10 }}>
          <Meter
            label="Calories"
            right={`${macros.kcal.toLocaleString()} / ${GOALS.kcal.toLocaleString()} kcal`}
            pct={kcalPct}
            hue={HUE_LIME}
            animate={animate}
            thick
          />
          <Meter
            label="Water"
            right={`${(total / 1000).toFixed(2)} / ${(GOAL_ML / 1000).toFixed(1)} L`}
            pct={waterPct}
            hue={HUE_CYAN}
            animate={animate}
          />
        </div>
      </motion.div>

      {/* ---------------------------------------------------------- Vitals */}
      <section style={{ marginTop: 18 }}>
        <SectionLabel icon="target" hue={HUE_LIME} title="Today's numbers" note="Against your daily goals" />
        <div style={{
          display: 'grid',
          gridTemplateColumns: phone ? '1fr 1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
        }}>
          <VitalTile
            icon="food" hue={HUE_LIME} label="Calories" value={macros.kcal} unit="kcal"
            goal={`of ${GOALS.kcal.toLocaleString()}`} pct={kcalPct} animate={animate}
            sub={macros.kcal === 0 ? 'No meals logged yet' : `${Math.max(0, GOALS.kcal - macros.kcal).toLocaleString()} kcal left`}
            actions={[{ label: 'Log meal', run: () => setScanning(true) }]}
          />
          <VitalTile
            icon="drop" hue={HUE_CYAN} label="Water" value={total} unit="ml"
            goal={`of ${GOAL_ML.toLocaleString()}`} pct={waterPct} animate={animate}
            sub={sips.length === 0 ? 'No sips logged yet' : `${sips.length} log${sips.length === 1 ? '' : 's'} · ${Math.round(total / CUP_ML)} cups`}
            actions={[
              { label: '+1 cup', run: () => addWaterMl(CUP_ML) },
              { label: '+500', run: () => addWaterMl(500) },
              ...(sips.length ? [{ label: 'Undo', run: undoLastSip }] : []),
            ]}
          />
          <VitalTile
            icon="steps" hue={HUE_VIOLET} label="Steps" value={steps} unit="steps"
            goal={`of ${GOALS.steps.toLocaleString()}`} pct={stepsPct} animate={animate}
            sub={steps === 0 ? 'Nothing recorded today' : `${Math.max(0, GOALS.steps - steps).toLocaleString()} to go`}
            actions={[
              { label: '+1k', run: () => addSteps(1000) },
              { label: '+2k', run: () => addSteps(2000) },
              { label: 'Set', run: askSteps },
            ]}
          />
          <VitalTile
            icon="gym" hue={HUE_PINK} label="Protein" value={macros.protein} unit="g"
            goal={`of ${MACRO_GOALS.protein}g`} pct={proteinPct} animate={animate}
            sub={macros.protein === 0 ? 'Logs a meal to fill this' : `${Math.max(0, MACRO_GOALS.protein - macros.protein)}g short`}
          />
        </div>
      </section>

      {/* ------------------------------------------------------- Main grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: phone ? '1fr' : 'minmax(300px, 0.95fr) minmax(320px, 1.15fr) minmax(300px, 1fr)',
        gap: 'clamp(12px, 1.6vw, 18px)',
        alignItems: 'start',
        marginTop: 20,
      }}>
        {/* Column 1 — hydration and sleep */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section>
            <SectionLabel icon="drop" hue={HUE_CYAN} title="Hydration"
              note={sips.length ? `${sips.length} logs today` : 'Nothing yet'} />
            <div data-tour="fuel-water">
              <FuelWaterCard
                total={total}
                lastHour={lastHour}
                hour={hour}
                hasSips={sips.length > 0}
                onSetCups={(n) => setCups(sips, n, (s) => W.add.mutate(s), (id) => W.remove.mutate({ id }))}
                onAddSip={addWaterMl}
                onUndoLastSip={undoLastSip}
              />
            </div>
          </section>

          <section>
            <SectionLabel icon="moon" hue={HUE_SLEEP} title="Sleep"
              note={slept !== null ? `${slept} h` : 'Not set'} />
            <motion.div
              onClick={() => setSleeping(true)}
              role="button"
              tabIndex={0}
              whileHover={animate ? { y: -2 } : undefined}
              whileTap={animate ? { scale: 0.99 } : undefined}
              style={{
                background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16,
                padding: 'clamp(13px, 1.6vw, 17px)', display: 'flex', flexDirection: 'column', gap: 11,
                cursor: 'pointer', boxShadow: 'var(--sh)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span className="num" style={{
                  fontSize: 24, fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1,
                }}>
                  {slept !== null ? <><CountUp value={slept} animate={animate} format={(n) => String(n)} /> h</> : '—'}
                </span>
                <span className="num metaline" style={{ fontSize: 11 }}>
                  {from && to ? `${from} – ${to}` : 'tap to set your window'}
                </span>
              </div>
              <Meter
                label=""
                pct={slept !== null ? Math.min(100, (slept / GOALS.sleep) * 100) : 0}
                hue={HUE_SLEEP}
                animate={animate}
              />
              <span className="metaline" style={{ fontSize: 10.5 }}>
                {slept === null
                  ? 'No sleep logged for last night'
                  : slept >= GOALS.sleep
                    ? `Over the ${GOALS.sleep} h target`
                    : `${(GOALS.sleep - slept).toFixed(1)} h under target`}
              </span>
            </motion.div>
          </section>
        </div>

        {/* Column 2 — the day as it happened */}
        <section>
          <SectionLabel
            icon="agenda" hue={HUE_LIME} title="Today so far"
            note={timeline.length ? `${(total / 1000).toFixed(2)} L · ${macros.kcal.toLocaleString()} kcal` : undefined}
          />
          <div style={{
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16,
            padding: 'clamp(13px, 1.6vw, 17px)', boxShadow: 'var(--sh)',
          }}>
            {timeline.length === 0 ? (
              <EmptyBlock
                icon="agenda"
                hue={HUE_LIME}
                title="The day hasn't started"
                body="Every meal and sip you log lands here in order, so you can see the shape of the day rather than one total."
                action={{ label: 'Log your first meal', run: () => setScanning(true) }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <AnimatePresence initial={false}>
                  {timeline.map((r, i) => {
                    const isWater = r.kind === 'water';
                    const timeStr = r.at.includes('T') ? r.at.split('T')[1].slice(0, 5) : '--:--';
                    const dotHue = isWater ? HUE_CYAN : HUE_LIME;

                    return (
                      <motion.div
                        key={r.id}
                        layout={animate}
                        initial={animate ? { opacity: 0, x: -8 } : false}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{ type: 'spring', stiffness: 460, damping: 32, delay: Math.min(i * 0.025, 0.3) }}
                        onContextMenu={(e) => { e.preventDefault(); openTimelineMenu(r, e.clientX, e.clientY); }}
                        onClick={() => { if (r.meal) setEditing(r.meal); }}
                        className="hov"
                        style={{
                          display: 'flex', gap: 11, alignItems: 'center',
                          padding: '8px 8px', borderRadius: 10, cursor: 'pointer',
                        }}
                      >
                        <span className="num" style={{
                          fontSize: 11, color: 'var(--tx3)', width: 38, flex: 'none',
                        }}>
                          {timeStr}
                        </span>

                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', flex: 'none',
                          background: dotHue, boxShadow: `0 0 8px ${dotHue}66`,
                        }} />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 700, color: 'var(--tx)', lineHeight: 1.25,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {isWater
                              ? `${Math.max(1, Math.round(r.ml / CUP_ML))} cup${r.ml >= CUP_ML * 2 ? 's' : ''}`
                              : r.meal?.name}
                          </div>
                          <div className="num metaline" style={{ fontSize: 10.5, marginTop: 1 }}>
                            {isWater
                              ? `${r.ml} ml`
                              : `${r.meal?.kcal ?? 0} kcal · ${r.meal?.protein ?? 0}p ${r.meal?.carbs ?? 0}c ${r.meal?.fat ?? 0}f`}
                          </div>
                        </div>

                        <motion.button
                          onClick={(e) => { e.stopPropagation(); openTimelineMenu(r, e.clientX, e.clientY); }}
                          whileTap={animate ? { scale: 0.9 } : undefined}
                          aria-label="Entry actions"
                          style={{
                            width: 26, height: 26, borderRadius: 8, flex: 'none', display: 'grid',
                            placeItems: 'center', border: '1px solid var(--line2)', background: 'transparent',
                            cursor: 'pointer',
                          }}
                        >
                          <Icon name="dots" size={13} color="var(--tx3)" />
                        </motion.button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* What was eaten, grouped the way a day is eaten */}
          {bySlot.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <SectionLabel icon="list" hue={HUE_VIOLET} title="By meal"
                note={`${meals.length} logged`} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {bySlot.map((g, gi) => {
                  const kcal = g.items.reduce((n, m) => n + (m.kcal || 0), 0);
                  const shareOfDay = macros.kcal ? Math.round((kcal / macros.kcal) * 100) : 0;
                  const shue = SLOT_HUE[g.slot] ?? HUE_LIME;

                  return (
                    <motion.div
                      key={g.slot}
                      initial={animate ? { opacity: 0, y: 8 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30, delay: gi * 0.05 }}
                      style={{
                        background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14,
                        padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center',
                          background: `color-mix(in srgb, ${shue} 18%, transparent)`,
                        }}>
                          <Icon name={SLOT_ICON[g.slot] ?? 'food'} size={11} color={shue} />
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--tx)' }}>{g.slot}</span>
                        <span className="num metaline" style={{ marginLeft: 'auto', fontSize: 11 }}>
                          {kcal.toLocaleString()} kcal · {shareOfDay}%
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {g.items.map((m) => (
                          <motion.button
                            key={m.id}
                            onClick={() => setEditing(m)}
                            whileTap={animate ? { scale: 0.94 } : undefined}
                            whileHover={animate ? { y: -1 } : undefined}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                              border: '1px solid var(--line2)', background: 'var(--card2)',
                              fontSize: 11, fontWeight: 700, color: 'var(--tx2)',
                            }}
                          >
                            {m.name}
                            <span className="num" style={{ color: shue, fontSize: 10 }}>{m.kcal}</span>
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Column 3 — logging surfaces */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {dayMealsWithPhotos.length > 0 && (
            <section>
              <SectionLabel
                icon="photo" hue={HUE_LIME} title="Photographed today"
                note={`${photoCount} / ${MAX_DAY_PHOTOS}`}
              />
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))',
                gap: 'clamp(7px, 1vw, 10px)',
              }}>
                {dayMealsWithPhotos.map((m) => (
                  <FoodPhotoCard
                    key={m.id}
                    name={m.name}
                    kcal={m.kcal}
                    photo_path={m.photo_path!}
                    isLoggedToday
                    slot={m.slot}
                    onLogAgain={() => setEditing(m)}
                  />
                ))}
              </div>
            </section>
          )}

          <section data-tour="fuel-meals">
            <SectionLabel icon="food" hue={HUE_VIOLET} title="Quick log" note="One tap, straight to the timeline" />
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))',
              gap: 'clamp(7px, 1vw, 10px)',
            }}>
              {DEFAULT_PRESETS.map((p) => (
                <FoodPhotoCard
                  key={`preset-${p.name}`}
                  name={p.name}
                  kcal={p.kcal}
                  photo_path={p.photo_path}
                  onLogAgain={() => logPresetMeal(p)}
                />
              ))}
            </div>
          </section>

          <motion.button
            onClick={() => {
              if (isPhotoLimitReached) {
                toast(`Maximum ${MAX_DAY_PHOTOS} photographs today. Remove or edit one to add more.`);
                return;
              }
              setScanning(true);
            }}
            whileTap={animate ? { scale: 0.98 } : undefined}
            whileHover={animate && !isPhotoLimitReached ? { y: -2 } : undefined}
            style={{
              width: '100%', minHeight: 50, borderRadius: 14, cursor: 'pointer',
              background: isPhotoLimitReached ? 'var(--card2)' : HUE_LIME,
              color: isPhotoLimitReached ? 'var(--tx3)' : '#0B0A13',
              fontSize: 14, fontWeight: 800,
              border: isPhotoLimitReached ? '1px solid var(--line2)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              boxShadow: isPhotoLimitReached ? undefined : `0 4px 20px color-mix(in srgb, ${HUE_LIME} 40%, transparent)`,
            }}
          >
            <Icon name="photo" size={18} color={isPhotoLimitReached ? 'var(--tx3)' : '#0B0A13'} />
            {isPhotoLimitReached ? `Photo limit reached (${MAX_DAY_PHOTOS})` : 'Photograph a plate'}
          </motion.button>
        </div>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x} y={menu.y} kind="global" label={menu.label} items={menu.items}
          accent={prefs.accent} dark={prefs.theme === 'dark'} onClose={() => setMenu(null)}
        />
      )}

      {sleeping && (
        <SleepSheet
          from={from ?? '23:00'}
          to={to ?? '07:00'}
          onClose={() => setSleeping(false)}
          onChange={(f, t) => setDayPatch({ sleep_from: f, sleep_to: t, sleep_h: sleepHours(f, t) })}
        />
      )}

      {scanning && (
        <MealSheet
          on={today}
          currentPhotoCount={photoCount}
          maxPhotos={MAX_DAY_PHOTOS}
          onClose={() => setScanning(false)}
          onSave={(m) => {
            if (m.photo_path && photoCount >= MAX_DAY_PHOTOS) {
              toast(`Daily limit of ${MAX_DAY_PHOTOS} photos reached.`);
              return;
            }
            A.addMeal.mutate(m);
            toast(`${m.name} added`);
          }}
        />
      )}

      {editing !== undefined && (
        <MealEditor
          meal={editing}
          on={today}
          onClose={() => setEditing(undefined)}
          onSave={(m) => {
            if (m.photo_path && !editing?.photo_path && photoCount >= MAX_DAY_PHOTOS) {
              toast(`Daily limit of ${MAX_DAY_PHOTOS} photos reached.`);
              return;
            }
            A.editMeal.mutate({ id: m.id, patch: m });
            toast(`${m.name} saved`);
          }}
          onDelete={() => {
            A.delMeal.mutate({ id: editing.id });
            toast(`${editing.name} removed`);
          }}
        />
      )}
    </div>
  );
}

/** Where a meal sits on the clock when it was logged without a timestamp. */
function slotClock(slot: string | null | undefined): string {
  switch (slot) {
    case 'Breakfast': return '07:30';
    case 'Lunch': return '12:30';
    case 'Dinner': return '19:00';
    default: return '15:30';
  }
}

function MacroChip({
  label, val, goal, hue, animate,
}: { label: string; val: number; goal: number; hue: string; animate: boolean }) {
  const pct = Math.min(100, (val / goal) * 100);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4, minWidth: 78,
      padding: '6px 10px', borderRadius: 10,
      background: 'var(--card2)', border: '1px solid var(--line2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span className="metaline" style={{ fontSize: 10 }}>{label}</span>
        <span className="num" style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: hue }}>
          <CountUp value={val} animate={animate} />g
        </span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: 'var(--line2)', overflow: 'hidden' }}>
        <motion.span
          initial={animate ? { width: 0 } : false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 150, damping: 26 }}
          style={{ display: 'block', height: '100%', borderRadius: 2, background: hue }}
        />
      </div>
    </div>
  );
}

function SleepSheet({
  from, to, onClose, onChange,
}: {
  from: string;
  to: string;
  onClose: () => void;
  onChange: (f: string, t: string) => void;
}) {
  useOverlayBack(true, onClose);
  return (
    <div
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(6,5,11,.74)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        className="rise"
        style={{
          width: '100%', maxWidth: 420, background: 'var(--panel)',
          border: '1px solid var(--line2)', borderBottom: 'none',
          borderRadius: '18px 18px 0 0',
          padding: '10px 16px calc(20px + env(safe-area-inset-bottom))',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <div style={{ width: 34, height: 3.5, borderRadius: 2, background: 'var(--line2)', margin: '0 auto 2px' }} />
        <div className="kicker">Sleep — drag the ends</div>
        <SleepArc from={from} to={to} onChange={onChange} />
        <button
          onClick={onClose}
          className="acc k-squish"
          style={{
            width: '100%', minHeight: 44, borderRadius: 11, background: 'var(--acc)',
            color: 'var(--ink)', fontSize: 13.5, fontWeight: 800, border: 'none', cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
