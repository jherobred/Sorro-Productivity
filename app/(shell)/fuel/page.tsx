'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { FuelWaterCard } from '@/components/fuel/WaterFlask';
import { FoodPhotoCard, DEFAULT_PRESETS, type FoodPreset } from '@/components/fuel/FoodPhotoCard';
import { MealEditor } from '@/components/fuel/MealEditor';
import { MealSheet } from '@/components/body/MealSheet';
import { SleepArc } from '@/components/body/Instruments';
import { useOverlayBack } from '@/lib/nav';
import { useLayout } from '@/lib/useLayout';
import { toast } from '@/lib/toast';
import { ask } from '@/lib/ask';
import { ymd } from '@/lib/series';
import { hourOf, CUP_ML } from '@/lib/hydration';
import { useWater, useWaterActions, waterTotals, setCups, type Sip } from '@/lib/water';
import {
  useBodyDays, useMeals, useBodyActions, sleepHours, dayOf, GOALS, type Meal,
} from '@/lib/body';

const HUE_LIME = '#A3E635';
const HUE_SLEEP = '#FFC24B';
const HUE_CYAN = '#38BDF8';
const HUE_PINK = '#F472B6';

const MAX_DAY_PHOTOS = 20;

export default function FuelPage() {
  const { phone } = useLayout();
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
  const [backtrackingSip, setBacktrackingSip] = useState<Sip | null>(null);

  const day = dayOf(days, today);
  const steps = day?.steps ?? 0;
  const from = day?.sleep_from ?? '23:10';
  const to = day?.sleep_to ?? '05:40';
  const slept = sleepHours(from, to) ?? day?.sleep_h ?? 6.5;

  const { total, lastHour } = useMemo(() => waterTotals(sips, now), [sips, now]);
  const hour = hourOf(now);

  // Photos stored today
  const dayMealsWithPhotos = useMemo(() => meals.filter((m) => Boolean(m.photo_path)), [meals]);
  const photoCount = dayMealsWithPhotos.length;
  const isPhotoLimitReached = photoCount >= MAX_DAY_PHOTOS;

  // Total macros and calories today
  const { totalKcal, totalProtein, totalCarbs, totalFat } = useMemo(() => {
    return meals.reduce(
      (acc, m) => ({
        totalKcal: acc.totalKcal + (m.kcal || 0),
        totalProtein: acc.totalProtein + (m.protein || 0),
        totalCarbs: acc.totalCarbs + (m.carbs || 0),
        totalFat: acc.totalFat + (m.fat || 0),
      }),
      { totalKcal: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 },
    );
  }, [meals]);

  const setDayPatch = (patch: Parameters<typeof A.setDay.mutate>[0]['patch']) =>
    A.setDay.mutate({ on_date: today, patch });

  /** Quick step increment helper */
  const addSteps = (delta: number) => {
    const next = Math.max(0, steps + delta);
    setDayPatch({ steps: next });
    toast(`+${delta.toLocaleString()} steps logged`);
  };

  /** Quick water sip helper */
  const addWaterMl = (ml: number) => {
    W.add.mutate({ id: crypto.randomUUID(), at: new Date().toISOString(), ml });
    toast(`+${ml} ml water logged`);
  };

  /** Undo the most recent water sip */
  const undoLastSip = () => {
    if (!sips.length) return;
    const sorted = [...sips].sort((a, b) => b.at.localeCompare(a.at));
    const latest = sorted[0];
    W.remove.mutate({ id: latest.id });
    toast(`Removed ${latest.ml} ml water sip`);
  };

  /** Delete a specific water sip */
  const deleteSip = (id: string, ml: number) => {
    W.remove.mutate({ id });
    toast(`Removed ${ml} ml water log`);
    setBacktrackingSip(null);
  };

  /** Quick re-log meal from presets */
  const logPresetMeal = (p: FoodPreset) => {
    if (p.photo_path && photoCount >= MAX_DAY_PHOTOS) {
      toast(`Photo limit reached (${photoCount}/${MAX_DAY_PHOTOS} today). Logged without photo.`);
      const newMeal: Meal = {
        id: crypto.randomUUID(),
        on_date: today,
        name: p.name,
        slot: p.slot,
        kcal: p.kcal,
        protein: p.protein,
        carbs: p.carbs,
        fat: p.fat,
        photo_path: null,
        place: null,
      };
      A.addMeal.mutate(newMeal);
      return;
    }
    const newMeal: Meal = {
      id: crypto.randomUUID(),
      on_date: today,
      name: p.name,
      slot: p.slot,
      kcal: p.kcal,
      protein: p.protein,
      carbs: p.carbs,
      fat: p.fat,
      photo_path: p.photo_path,
      place: null,
    };
    A.addMeal.mutate(newMeal);
    toast(`${p.name} logged (+${p.kcal} kcal)`);
  };

  /** Combined Chronological Activity Stream */
  const timeline = useMemo(() => {
    const rows = [
      ...sips.map((s) => ({
        id: s.id,
        at: s.at,
        kind: 'water' as const,
        ml: s.ml,
        meal: null,
        sip: s,
      })),
      ...meals.map((m) => ({
        id: m.id,
        at: `${m.on_date}T12:00:00`,
        kind: 'meal' as const,
        ml: 0,
        meal: m,
        sip: null,
      })),
    ];
    return rows.sort((a, b) => a.at.localeCompare(b.at));
  }, [sips, meals]);

  // Fallback demo timeline items when today is freshly opened
  const displayTimeline = timeline.length > 0 ? timeline : [
    { id: 'd1', at: `${today}T07:10:00`, kind: 'meal' as const, ml: 0, meal: { id: 'd1', name: 'Silog', kcal: 520, protein: 38, carbs: 62, fat: 18, on_date: today, slot: 'Breakfast', photo_path: '/food/silog.svg', place: null }, sip: null },
    { id: 'dw1', at: `${today}T07:40:00`, kind: 'water' as const, ml: 500, meal: null, sip: { id: 'dw1', at: `${today}T07:40:00`, ml: 500 } },
    { id: 'dw2', at: `${today}T10:05:00`, kind: 'water' as const, ml: 250, meal: null, sip: { id: 'dw2', at: `${today}T10:05:00`, ml: 250 } },
    { id: 'd2', at: `${today}T12:20:00`, kind: 'meal' as const, ml: 0, meal: { id: 'd2', name: 'Sinigang', kcal: 310, protein: 22, carbs: 30, fat: 9, on_date: today, slot: 'Lunch', photo_path: '/food/sinigang.svg', place: null }, sip: null },
    { id: 'dw3', at: `${today}T15:00:00`, kind: 'water_warning' as const, ml: 1000, meal: null, sip: { id: 'dw3', at: `${today}T15:00:00`, ml: 1000 } },
    { id: 'd3', at: `${today}T15:30:00`, kind: 'meal' as const, ml: 0, meal: { id: 'd3', name: 'Isaw', kcal: 180, protein: 14, carbs: 8, fat: 10, on_date: today, slot: 'Snack', photo_path: '/food/isaw.svg', place: null }, sip: null },
  ];

  const effectiveKcal = totalKcal > 0 ? totalKcal : 1420;
  const effectiveProtein = totalProtein > 0 ? totalProtein : 74;
  const effectiveCarbs = totalCarbs > 0 ? totalCarbs : 100;
  const effectiveFat = totalFat > 0 ? totalFat : 37;
  const effectiveWaterL = total > 0 ? (total / 1000).toFixed(2) : '2.30';

  return (
    <div
      style={{
        padding: phone ? '14px 14px 32px' : 'clamp(20px, 2.5vw, 36px) clamp(24px, 3.5vw, 56px) 56px',
        maxWidth: 1400,
        marginInline: 'auto',
        color: 'var(--tx)',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* 1. Header with Title, Date, and Top Nutrition Dashboard */}
      <div
        style={{
          display: 'flex',
          flexDirection: phone ? 'column' : 'row',
          alignItems: phone ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 'clamp(16px, 2.2vw, 24px)',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 'clamp(28px, 3.2vw, 40px)',
              fontWeight: 800,
              letterSpacing: '-.035em',
              lineHeight: 1,
              margin: 0,
            }}
          >
            Fuel
          </h1>
          <div
            style={{
              fontSize: 'clamp(12px, 1.2vw, 14.5px)',
              fontWeight: 600,
              color: 'var(--tx3)',
              marginTop: 6,
            }}
          >
            {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>

        {/* Top-Right Calorie Badge & Macro Summary Cockpit */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10,
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 14,
            padding: '8px 14px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
          }}
        >
          {/* Main Calorie Badge */}
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11.5,
              fontWeight: 800,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              padding: '6px 12px',
              borderRadius: 8,
              background: `color-mix(in srgb, ${HUE_LIME} 18%, transparent)`,
              color: HUE_LIME,
              border: `1.5px solid color-mix(in srgb, ${HUE_LIME} 42%, transparent)`,
              boxShadow: `0 0 14px color-mix(in srgb, ${HUE_LIME} 25%, transparent)`,
            }}
          >
            {effectiveKcal.toLocaleString()} KCAL
          </div>

          {/* Macro Mini Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MacroPill label="Protein" val={`${effectiveProtein}g`} hue={HUE_LIME} />
            <MacroPill label="Carbs" val={`${effectiveCarbs}g`} hue={HUE_CYAN} />
            <MacroPill label="Fat" val={`${effectiveFat}g`} hue={HUE_PINK} />
          </div>
        </div>
      </div>

      {/* Main Responsive Grid Layout (Fluid scaling across screen sizes) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: phone
            ? '1fr'
            : 'minmax(340px, 1fr) minmax(380px, 1.25fr)',
          gap: 'clamp(14px, 2vw, 24px)',
          alignItems: 'start',
        }}
      >
        {/* ================= LEFT COLUMN: Hydration & Vitals ================= */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 2vw, 22px)' }}>
          {/* Water Flask & Hydration Card with Backtracking */}
          <div data-tour="fuel-water">
            <FuelWaterCard
              total={total > 0 ? total : 1500}
              lastHour={lastHour}
              hour={hour}
              hasSips={sips.length > 0}
              onSetCups={(n) => setCups(sips, n, (s) => W.add.mutate(s), (id) => W.remove.mutate({ id }))}
              onAddSip={addWaterMl}
              onUndoLastSip={undoLastSip}
            />
          </div>

          {/* Steps Tracker Card */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: 16,
              padding: 'clamp(14px, 1.8vw, 20px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: 'var(--tx3)',
                }}
              >
                STEPS
              </span>
              <span
                className="num"
                style={{
                  fontSize: 'clamp(13px, 1.3vw, 15px)',
                  fontWeight: 800,
                  letterSpacing: '-.02em',
                  color: 'var(--tx)',
                }}
              >
                {(steps || 6240).toLocaleString()} <span style={{ color: 'var(--tx3)', fontWeight: 600 }}>/ {GOALS.steps.toLocaleString()}</span>
              </span>
            </div>

            {/* Horizontal Glowing Lime Progress Bar with Dot Matrix */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: 18,
                borderRadius: 6,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--line2)',
                overflow: 'hidden',
              }}
            >
              {/* Dot pattern */}
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.22) 1.2px, transparent 1.2px)',
                  backgroundSize: '5px 5px',
                  opacity: 0.75,
                }}
              />
              {/* Lime Progress Fill */}
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${Math.min(100, ((steps || 6240) / GOALS.steps) * 100)}%`,
                  borderRadius: 5,
                  background: `linear-gradient(90deg, color-mix(in srgb, ${HUE_LIME} 70%, transparent) 0%, ${HUE_LIME} 100%)`,
                  boxShadow: `0 0 12px color-mix(in srgb, ${HUE_LIME} 55%, transparent)`,
                  transition: 'width .6s cubic-bezier(.16,1,.3,1)',
                }}
              />
            </div>

            {/* Steps Action Buttons Row: [+500] [+1k] [+2k] [Set] */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <button
                onClick={() => addSteps(500)}
                className="hov k-squish"
                style={BTN_ACTION}
              >
                +500
              </button>
              <button
                onClick={() => addSteps(1000)}
                className="hov k-squish"
                style={BTN_ACTION}
              >
                +1k
              </button>
              <button
                onClick={() => addSteps(2000)}
                className="hov k-squish"
                style={BTN_ACTION}
              >
                +2k
              </button>
              <button
                onClick={() => void ask('Steps today', { initial: String(steps || 6240), placeholder: 'e.g. 8400' })
                  .then((v) => { if (v !== null) setDayPatch({ steps: Math.max(0, Math.round(Number(v) || 0)) }); })}
                className="hov k-squish"
                style={BTN_ACTION}
              >
                Set
              </button>
            </div>
          </div>

          {/* Sleep Tracker Card */}
          <div
            onClick={() => setSleeping(true)}
            role="button"
            tabIndex={0}
            className="hov k-squish"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: 16,
              padding: 'clamp(14px, 1.8vw, 20px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
              textAlign: 'left',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: 'var(--tx3)',
                }}
              >
                SLEEP
              </span>
              <span
                className="num"
                style={{
                  fontSize: 'clamp(13px, 1.3vw, 15px)',
                  fontWeight: 800,
                  letterSpacing: '-.02em',
                  color: 'var(--tx)',
                }}
              >
                {slept} <span style={{ fontSize: 11.5, color: 'var(--tx3)', fontWeight: 600 }}>h · {from} – {to}</span>
              </span>
            </div>

            {/* Horizontal Glowing Amber Progress Bar with Dot Matrix */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: 18,
                borderRadius: 6,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--line2)',
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.22) 1.2px, transparent 1.2px)',
                  backgroundSize: '5px 5px',
                  opacity: 0.75,
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${Math.min(100, (slept / GOALS.sleep) * 100)}%`,
                  borderRadius: 5,
                  background: `linear-gradient(90deg, color-mix(in srgb, ${HUE_SLEEP} 70%, transparent) 0%, ${HUE_SLEEP} 100%)`,
                  boxShadow: `0 0 12px color-mix(in srgb, ${HUE_SLEEP} 55%, transparent)`,
                  transition: 'width .6s cubic-bezier(.16,1,.3,1)',
                }}
              />
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: Meals & Activity Stream ================= */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 2vw, 22px)' }}>
          {/* Today So Far Timeline Card with Interactive Backtrack */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: 16,
              padding: 'clamp(14px, 1.8vw, 20px)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
                paddingBottom: 8,
                borderBottom: '1px solid var(--line2)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: 'var(--tx3)',
                }}
              >
                TODAY SO FAR
              </span>
              <span
                className="num"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--tx3)',
                }}
              >
                {effectiveWaterL} L · {effectiveKcal.toLocaleString()} KCAL
              </span>
            </div>

            {/* Timeline Stream with Direct Error Prevention / Backtrack Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {displayTimeline.map((r, i) => {
                const isWater = r.kind === 'water';
                const isWarning = r.kind === 'water_warning';
                const timeStr = r.at.includes('T') ? r.at.split('T')[1].slice(0, 5) : '12:00';

                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      padding: '4px 6px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.015)',
                      transition: 'background .15s ease',
                    }}
                  >
                    {/* Timestamp */}
                    <span
                      className="num"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        color: 'var(--tx3)',
                        width: 44,
                        flex: 'none',
                      }}
                    >
                      {timeStr}
                    </span>

                    {/* Status Dot */}
                    <span
                      style={{
                        width: 8.5,
                        height: 8.5,
                        borderRadius: '50%',
                        flex: 'none',
                        background: isWarning ? '#FF6B6B' : isWater ? '#38BDF8' : HUE_LIME,
                        boxShadow: `0 0 8px ${isWarning ? '#FF6B6B' : isWater ? '#38BDF8' : HUE_LIME}88`,
                      }}
                    />

                    {/* Content */}
                    <div
                      onClick={() => {
                        if (r.meal && r.meal.id && !r.meal.id.startsWith('d')) {
                          setEditing(r.meal);
                        } else if (r.sip && r.sip.id && !r.sip.id.startsWith('d')) {
                          setBacktrackingSip(r.sip);
                        }
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        cursor: (r.meal || r.sip) ? 'pointer' : 'default',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 'clamp(12.5px, 1.2vw, 14px)',
                          fontWeight: 700,
                          color: isWarning ? '#FF8585' : 'var(--tx)',
                          lineHeight: 1.25,
                        }}
                      >
                        {isWarning
                          ? '4 cups in 40 minutes'
                          : isWater
                            ? r.ml === 250 ? '1 cup' : `${Math.round(r.ml / CUP_ML)} cups`
                            : r.meal?.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: isWarning ? '#FFB4B4' : 'var(--tx3)',
                          marginTop: 2,
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {isWarning
                          ? '1,000 ml – above the hourly ceiling'
                          : isWater
                            ? `${r.ml} ml (tap to backtrack)`
                            : `${r.meal?.kcal} kcal · ${r.meal?.protein}p ${r.meal?.carbs}c ${r.meal?.fat}f`}
                      </div>
                    </div>

                    {/* Quick Undo / Delete Action for Water Sips */}
                    {r.sip && r.sip.id && !r.sip.id.startsWith('d') && (
                      <button
                        onClick={() => deleteSip(r.sip!.id, r.sip!.ml)}
                        className="hov k-squish"
                        title="Remove this water log"
                        aria-label={`Remove ${r.sip.ml}ml water`}
                        style={{
                          padding: '4px 6px',
                          borderRadius: 6,
                          border: '1px solid rgba(255,107,107,0.3)',
                          background: 'rgba(255,107,107,0.08)',
                          color: '#FF8585',
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          flex: 'none',
                        }}
                      >
                        <Icon name="trash" size={11} color="#FF8585" />
                        Undo
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Meals Photo Grid ("PHOTOGRAPHS GALLERY — MEALS") */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                padding: '0 2px',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: 'var(--tx3)',
                }}
              >
                PHOTOGRAPHS GALLERY — MEALS
              </span>
              <span
                className="num"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: isPhotoLimitReached ? '#FF6B6B' : 'var(--tx3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span>{photoCount} / {MAX_DAY_PHOTOS} PHOTOS TODAY</span>
                {isPhotoLimitReached && (
                  <span
                    style={{
                      fontSize: 9,
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: 'rgba(255,107,107,0.15)',
                      color: '#FF6B6B',
                      fontWeight: 800,
                    }}
                  >
                    MAX
                  </span>
                )}
              </span>
            </div>

            {/* Responsive Photo Grid (auto-fits up to desktop) */}
            <div
              data-tour="fuel-meals"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                gap: 'clamp(8px, 1.2vw, 12px)',
              }}
            >
              {/* 1. Today's Logged Meal Photos (up to 20 max) */}
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

              {/* 2. Preset Meal Photos */}
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
          </div>

          {/* 5. Primary Action Button: "Photograph a plate" */}
          <button
            onClick={() => {
              if (isPhotoLimitReached) {
                toast(`Maximum ${MAX_DAY_PHOTOS} photographs reached for today (${photoCount}/${MAX_DAY_PHOTOS}). Remove or edit a meal photo to add more.`);
                return;
              }
              setScanning(true);
            }}
            className="k-squish"
            style={{
              width: '100%',
              minHeight: 52,
              borderRadius: 14,
              background: isPhotoLimitReached ? 'rgba(255,255,255,0.08)' : HUE_LIME,
              color: isPhotoLimitReached ? 'var(--tx2)' : '#0B0A13',
              fontSize: 'clamp(14px, 1.4vw, 16px)',
              fontWeight: 800,
              border: isPhotoLimitReached ? '1px solid var(--line2)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
              boxShadow: isPhotoLimitReached ? undefined : `0 4px 20px color-mix(in srgb, ${HUE_LIME} 45%, transparent)`,
              transition: 'transform .15s ease, filter .15s ease',
            }}
          >
            <Icon name="photo" size={20} color={isPhotoLimitReached ? 'var(--tx2)' : '#0B0A13'} />
            {isPhotoLimitReached ? `Daily photo limit reached (${MAX_DAY_PHOTOS}/${MAX_DAY_PHOTOS})` : 'Photograph a plate'}
          </button>
        </div>
      </div>

      {/* Water Backtrack Confirmation Modal */}
      {backtrackingSip && (
        <WaterBacktrackModal
          sip={backtrackingSip}
          onClose={() => setBacktrackingSip(null)}
          onDelete={() => deleteSip(backtrackingSip.id, backtrackingSip.ml)}
        />
      )}

      {/* Sheets & Overlays */}
      {sleeping && (
        <SleepSheet
          from={from}
          to={to}
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

function WaterBacktrackModal({
  sip,
  onClose,
  onDelete,
}: {
  sip: Sip;
  onClose: () => void;
  onDelete: () => void;
}) {
  useOverlayBack(true, onClose);
  return (
    <div
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 95,
        background: 'rgba(6,5,11,.74)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="k-bloom"
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          borderRadius: 16,
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tx)' }}>Backtrack Water Sip</div>
          <button onClick={onClose} className="hov" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Icon name="close" size={14} color="var(--tx3)" />
          </button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.5 }}>
          Logged <strong style={{ color: '#38BDF8' }}>{sip.ml} ml</strong> at{' '}
          <span className="num">{new Date(sip.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>.
          Do you want to remove this entry to adjust your total?
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={onClose}
            className="hov k-squish"
            style={{
              flex: 1,
              minHeight: 38,
              borderRadius: 10,
              border: '1px solid var(--line2)',
              background: 'var(--card2)',
              color: 'var(--tx2)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            className="hov k-squish"
            style={{
              flex: 1,
              minHeight: 38,
              borderRadius: 10,
              border: '1px solid rgba(255,107,107,0.4)',
              background: '#FF6B6B',
              color: '#0B0A13',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Remove sip
          </button>
        </div>
      </div>
    </div>
  );
}

function MacroPill({ label, val, hue }: { label: string; val: string; hue: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 6,
        background: 'var(--card2)',
        border: '1px solid var(--line2)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 700,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: hue }} />
      <span style={{ color: 'var(--tx3)' }}>{label}:</span>
      <span style={{ color: 'var(--tx)' }}>{val}</span>
    </div>
  );
}

const BTN_ACTION: React.CSSProperties = {
  padding: '10px 4px',
  borderRadius: 10,
  border: '1px solid var(--line2)',
  background: 'var(--card2)',
  color: 'var(--tx)',
  fontSize: 12,
  fontWeight: 700,
  fontFamily: 'var(--font-mono)',
  cursor: 'pointer',
  textAlign: 'center',
};

function SleepSheet({
  from,
  to,
  onClose,
  onChange,
}: {
  from: string;
  to: string;
  onClose: () => void;
  onChange: (f: string, t: string) => void;
}) {
  useOverlayBack(true, onClose);
  return (
    <div
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(6,5,11,.74)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        className="rise"
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          borderBottom: 'none',
          borderRadius: '18px 18px 0 0',
          padding: '10px 16px calc(20px + env(safe-area-inset-bottom))',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ width: 34, height: 3.5, borderRadius: 2, background: 'var(--line2)', margin: '0 auto 2px' }} />
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '.13em',
            textTransform: 'uppercase',
            color: 'var(--tx3)',
          }}
        >
          Sleep — drag the ends
        </div>
        <SleepArc from={from} to={to} onChange={onChange} />
        <button
          onClick={onClose}
          className="acc k-squish"
          style={{
            width: '100%',
            minHeight: 44,
            borderRadius: 11,
            background: 'var(--acc)',
            color: 'var(--ink)',
            fontSize: 13.5,
            fontWeight: 800,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
