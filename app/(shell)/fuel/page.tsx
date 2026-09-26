'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { SleepArc } from '@/components/body/Instruments';
import { ContextMenu } from '@/components/ContextMenu';
import { DEFAULT_PRESETS, type FoodPreset } from '@/components/fuel/FoodPhotoCard';
import { MemoriesPanel } from '@/components/memories/Memories';
import type { CaptureDraft } from '@/components/memories/MemoryCapture';
import { useOverlayBack } from '@/lib/nav';
import { usePrefs } from '@/lib/prefs';
import { toast } from '@/lib/toast';
import { ask } from '@/lib/ask';
import { ymd } from '@/lib/series';
import { hydration, hourOf, fillPct, GOAL_MARK, CUP_ML, GOAL_ML, HOUR_CAP, DAY_MAX } from '@/lib/hydration';
import { useWater, useWaterActions, waterTotals, backfillAt, type Sip } from '@/lib/water';
import { useBodyDays, useMeals, useBodyActions, sleepHours, dayOf, GOALS, MAX_DAY_MEAL_PHOTOS, type Meal } from '@/lib/body';
import { useMemories, useMemoryPhotos, removeMemory, type Memory } from '@/lib/memories';
import { useSignedUrls } from '@/lib/uploads';
import './fuel.css';

const MemoryCapture = dynamic(() => import('@/components/memories/MemoryCapture').then((m) => m.MemoryCapture), { ssr: false });

const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
const SLOT_ICON: Record<string, IconName> = { Breakfast: 'sun', Lunch: 'food', Dinner: 'moon', Snack: 'cup' };
/** Rough splits of the calorie goal. Enough to draw a bar against. */
const MACROS = [
  { key: 'protein', label: 'Protein', goal: 140 },
  { key: 'carbs', label: 'Carbs', goal: 240 },
  { key: 'fat', label: 'Fat', goal: 70 },
] as const;
const CUPS = GOAL_ML / CUP_ML;

const slotOf = (m: Meal) => ((SLOTS as readonly string[]).includes(m.slot) ? m.slot : 'Snack');
function guessSlot(at: number): string {
  const h = new Date(at).getHours();
  return h < 10 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snack';
}
const isRealPhoto = (path: string | null) => !!path && !path.startsWith('/');

/**
 * A plate's picture: the memory it was captured with, an illustration that
 * ships with the app, or a photo uploaded before memories existed.
 */
function useMealPhotos(meals: Meal[], memories: Memory[]): Record<string, string> {
  const byMeal = useMemo(() => {
    const out = new Map<string, Memory>();
    for (const m of memories) if (m.ref?.startsWith('meal:')) out.set(m.ref.slice(5), m);
    return out;
  }, [memories]);
  const linked = useMemo(() => meals.map((m) => byMeal.get(m.id)).filter((m): m is Memory => !!m), [meals, byMeal]);
  const fromMemories = useMemoryPhotos(linked);
  const unlinked = meals.filter((m) => isRealPhoto(m.photo_path) && !fromMemories[byMeal.get(m.id)?.id ?? '']);
  const kept = unlinked.filter((m) => m.photo_path!.includes('/memories/img/'));
  const older = unlinked.filter((m) => !m.photo_path!.includes('/memories/img/'));
  const keptUrls = useSignedUrls('bd-files', kept.map((m) => m.photo_path!));
  const olderUrls = useSignedUrls('bd-feed', older.map((m) => m.photo_path!));

  const out: Record<string, string> = {};
  for (const m of meals) {
    const memory = byMeal.get(m.id);
    if (memory && fromMemories[memory.id]) out[m.id] = fromMemories[memory.id];
    else if (m.photo_path?.startsWith('/')) out[m.id] = m.photo_path;
  }
  kept.forEach((m, i) => { if (keptUrls[i]) out[m.id] = keptUrls[i]!; });
  older.forEach((m, i) => { if (olderUrls[i]) out[m.id] = olderUrls[i]!; });
  return out;
}

export default function FuelPage() {
  const { prefs } = usePrefs();
  // Hydration is judged against the clock, so the page redraws every minute and
  // reads the time fresh on every render. A drink logged a second ago must count.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const now = new Date();
  const today = ymd(now);
  const yesterday = ymd(new Date(now.getTime() - 864e5));

  const { data: days = [] } = useBodyDays(30);
  const { data: todayRows = [] } = useMeals(today);
  const { data: yesterdayRows = [] } = useMeals(yesterday);
  const { data: sips = [] } = useWater(now);
  const A = useBodyActions(30, today);
  const W = useWaterActions(now);
  const { list: memories } = useMemories(['meal']);

  const [capture, setCapture] = useState<null | { photo: boolean; slot?: string }>(null);
  const [editing, setEditing] = useState<Meal | null>(null);
  const [sleeping, setSleeping] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; meal: Meal } | null>(null);

  const meals = useMemo(() => todayRows.filter((m) => m.on_date === today), [todayRows, today]);
  const photos = useMealPhotos(meals, memories);
  const totals = meals.reduce((t, m) => ({
    kcal: t.kcal + (m.kcal || 0), protein: t.protein + (m.protein || 0), carbs: t.carbs + (m.carbs || 0), fat: t.fat + (m.fat || 0),
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const left = GOALS.kcal - totals.kcal;
  const photosToday = meals.filter((m) => isRealPhoto(m.photo_path)).length;
  const again = useMemo(() => {
    const seen = new Set(meals.map((m) => m.name.toLowerCase()));
    return yesterdayRows.filter((m) => m.on_date === yesterday && !seen.has(m.name.toLowerCase()) && seen.add(m.name.toLowerCase()));
  }, [yesterdayRows, yesterday, meals]);

  const { total, lastHour } = waterTotals(sips, now);
  const water = hydration(total, lastHour, hourOf(now));
  const cups = Math.round(total / CUP_ML);
  const newestFirst = [...sips].sort((a, b) => b.at.localeCompare(a.at));

  const day = dayOf(days, today);
  const steps = day?.steps ?? 0;
  const from = day?.sleep_from ?? null;
  const to = day?.sleep_to ?? null;
  const slept = sleepHours(from, to) ?? day?.sleep_h ?? null;
  const timeText = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !prefs.time24 });

  /* ---- meals */
  const snap = (slot?: string) => {
    if (photosToday >= MAX_DAY_MEAL_PHOTOS) {
      toast(`${MAX_DAY_MEAL_PHOTOS} plate photos today already. This one is logged without a photo.`, undefined, { icon: 'camera' });
      setCapture({ photo: false, slot });
      return;
    }
    setCapture({ photo: true, slot });
  };

  const commitMeal = (d: CaptureDraft): string | null => {
    if (!d.meal) return null;
    const meal: Meal = {
      id: crypto.randomUUID(), on_date: ymd(new Date(d.at)), name: d.meal.name, slot: d.meal.slot,
      kcal: d.meal.kcal, protein: d.meal.protein, carbs: d.meal.carbs, fat: d.meal.fat,
      photo_path: d.photoPath, place: d.place || null,
    };
    A.addMeal.mutate(meal);
    toast(`${meal.name} logged${meal.kcal ? `, ${meal.kcal} kcal` : ''}`, () => {
      A.delMeal.mutate({ id: meal.id });
      void removeMemory(d.memoryId);
    }, { tone: 'success', icon: 'food' });
    return `meal:${meal.id}`;
  };

  const logQuick = (name: string, source: Pick<Meal, 'kcal' | 'protein' | 'carbs' | 'fat'>, photo: string | null) => {
    const meal: Meal = {
      id: crypto.randomUUID(), on_date: today, name, slot: guessSlot(Date.now()),
      kcal: source.kcal, protein: source.protein, carbs: source.carbs, fat: source.fat, photo_path: photo, place: null,
    };
    A.addMeal.mutate(meal);
    toast(`${name} logged as ${meal.slot.toLowerCase()}, ${meal.kcal} kcal`, () => A.delMeal.mutate({ id: meal.id }), { tone: 'success', icon: 'food' });
  };
  const logPreset = (p: FoodPreset) => logQuick(p.name, p, p.photo_path);
  // A copy is a new plate, so a photo of the first one does not come along.
  const logAgain = (m: Meal) => logQuick(m.name, m, m.photo_path?.startsWith('/') ? m.photo_path : null);

  const deleteMeal = (m: Meal) => {
    A.delMeal.mutate({ id: m.id });
    toast(`${m.name} removed`, () => A.addMeal.mutate(m), { tone: 'danger', icon: 'trash' });
  };

  /* ---- water */
  const addWater = (ml: number) => {
    const sip: Sip = { id: crypto.randomUUID(), at: new Date().toISOString(), ml };
    W.add.mutate(sip);
    const undo = () => W.remove.mutate({ id: sip.id });
    const inHour = lastHour + ml, inDay = total + ml;
    if (inHour > HOUR_CAP) toast(`${(inHour / 1000).toFixed(2)} L in the last hour. Pause for 45 minutes.`, undo, { tone: 'danger', icon: 'drop' });
    else if (inDay > DAY_MAX) toast(`${(inDay / 1000).toFixed(2)} L today, past the daily maximum. Stop for today.`, undo, { tone: 'danger', icon: 'drop' });
    else toast(`+${ml} ml, ${(inDay / 1000).toFixed(2)} L today`, undo, { icon: 'drop' });
  };

  const removeSip = (s: Sip) => {
    W.remove.mutate({ id: s.id });
    toast(`Removed ${s.ml} ml`, () => W.add.mutate(s), { icon: 'drop' });
  };

  /**
   * Tapping a cup makes the day that many cups. Several cups at once are spread
   * back across the waking day, so catching up is not read as drinking too fast.
   */
  const setCupCount = (n: number) => {
    if (n > cups) {
      const adding = n - cups;
      if (adding === 1) { addWater(CUP_ML); return; }
      const at = new Date();
      for (let i = 0; i < adding; i++) W.add.mutate({ id: crypto.randomUUID(), at: backfillAt(i, adding, at), ml: CUP_ML });
      toast(`${adding} cups added across today`, undefined, { icon: 'drop' });
      return;
    }
    let over = total - n * CUP_ML;
    for (const s of newestFirst) {
      if (over <= 0) break;
      W.remove.mutate({ id: s.id });
      over -= s.ml;
    }
  };

  /* ---- steps and sleep */
  const setDay = (patch: Parameters<typeof A.setDay.mutate>[0]['patch']) => A.setDay.mutate({ on_date: today, patch });
  const addSteps = (delta: number) => {
    setDay({ steps: steps + delta });
    toast(`+${delta.toLocaleString()} steps`, () => setDay({ steps }), { icon: 'steps' });
  };
  const askSteps = () => void ask('Steps today', { initial: steps ? String(steps) : '', placeholder: '8400', confirmLabel: 'Save' })
    .then((v) => { if (v !== null) setDay({ steps: Math.max(0, Math.round(Number(v.replace(/[^\d]/g, '')) || 0)) }); });

  const describe = (m: Memory) => {
    const id = m.ref?.startsWith('meal:') ? m.ref.slice(5) : null;
    const meal = id ? [...meals, ...yesterdayRows].find((x) => x.id === id) : null;
    return meal ? `${meal.name} · ${meal.kcal} kcal` : null;
  };

  return (
    <div className="fuel">
      <header className="fuel-hero">
        <div className="fuel-hero-copy">
          <span className="fuel-kicker">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          <h1>{totals.kcal.toLocaleString()}<small> kcal</small></h1>
          <p>
            {totals.kcal === 0 ? `No meals logged yet. Your goal is ${GOALS.kcal.toLocaleString()} kcal.`
              : left >= 0 ? `${left.toLocaleString()} kcal left of ${GOALS.kcal.toLocaleString()}`
                : `${(-left).toLocaleString()} kcal over your ${GOALS.kcal.toLocaleString()} goal`}
          </p>
          <AsciiBar value={(totals.kcal / GOALS.kcal) * 100} hue="#1a2e05" showValue={false} label="Calories eaten against goal" />
          <div className="fuel-macros">
            {MACROS.map((x) => (
              <div key={x.key} className="fuel-macro">
                <span>{x.label}</span>
                <b>{totals[x.key]}<small> / {x.goal} g</small></b>
                <AsciiBar value={(totals[x.key] / x.goal) * 100} hue="#1a2e05" showValue={false} shape="slim" label={`${x.label} against goal`} />
              </div>
            ))}
          </div>
        </div>
        <div className="fuel-hero-actions">
          <button type="button" className="fuel-primary" onClick={() => snap()}><Icon name="camera" size={19} />Snap a meal</button>
          <div className="fuel-hero-row">
            <button type="button" className="fuel-secondary" onClick={() => setCapture({ photo: false })}><Icon name="edit" size={16} />Type it in</button>
            <button type="button" className="fuel-secondary" onClick={() => addWater(CUP_ML)}><Icon name="drop" size={16} />+{CUP_ML} ml</button>
          </div>
        </div>
      </header>

      <div className="fuel-grid">
        <div className="fuel-main">
          <section className="fuel-card fuel-plates" aria-label="Today's plates">
            <header className="fuel-card-head">
              <div>
                <h2>Today&apos;s plates</h2>
                <p>{meals.length ? `${meals.length} ${meals.length === 1 ? 'plate' : 'plates'} · ${totals.kcal.toLocaleString()} kcal` : 'Nothing logged yet. Snap your first plate.'}</p>
              </div>
              <button type="button" className="fuel-link" onClick={() => setCapture({ photo: false })}><Icon name="edit" size={14} />Type one in</button>
            </header>
            <div className="fuel-slots">
              {SLOTS.map((slot) => {
                const items = meals.filter((m) => slotOf(m) === slot);
                const kcal = items.reduce((n, m) => n + (m.kcal || 0), 0);
                return (
                  <div key={slot} className={'fuel-slot' + (items.length ? '' : ' is-empty')}>
                    <div className="fuel-slot-head">
                      <span className="fuel-slot-icon" aria-hidden="true"><Icon name={SLOT_ICON[slot]} size={16} /></span>
                      <b>{slot}</b>
                      {items.length > 0 && <em>{kcal.toLocaleString()} kcal</em>}
                      <button type="button" className="fuel-slot-add" onClick={() => snap(slot)} aria-label={`Add to ${slot.toLowerCase()}`}>
                        <Icon name="camera" size={15} />Add
                      </button>
                    </div>
                    {items.length > 0 && (
                      <ul className="fuel-plates-list">
                        {items.map((m) => (
                          <li key={m.id}>
                            <button type="button" className="fuel-plate" onClick={() => setEditing(m)}>
                              <span className="fuel-plate-photo">{photos[m.id] ? <img src={photos[m.id]} alt="" loading="lazy" /> : <Icon name="food" size={20} />}</span>
                              <span className="fuel-plate-copy">
                                <b>{m.name}</b>
                                <small>{m.kcal.toLocaleString()} kcal · {m.protein} g protein</small>
                                {m.place && <small><Icon name="mapPin" size={11} />{m.place}</small>}
                              </span>
                            </button>
                            <button type="button" className="fuel-icon" aria-label={`More for ${m.name}`}
                              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left - 150, y: r.bottom + 4, meal: m }); }}>
                              <Icon name="dots" size={16} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="fuel-mem">
            <MemoriesPanel kinds={['meal']} title="Food memories" onCapture={() => snap()} captureLabel="Snap a meal"
              describe={describe} empty="No food memories yet. Snap your next plate." />
          </div>
        </div>

        <aside className="fuel-side">
          <section className={'fuel-card fuel-water' + (water.alarm ? ' is-alarm' : '')} style={{ '--state': water.hue } as React.CSSProperties} aria-label="Water">
            <header className="fuel-card-head">
              <div>
                <h2>Water</h2>
                <p>{sips.length ? `${sips.length} ${sips.length === 1 ? 'drink' : 'drinks'} today` : 'Nothing logged yet today'}</p>
              </div>
              <span className="fuel-state" role="status">{water.label}</span>
            </header>
            <div className="fuel-water-body">
              <div className="fuel-flask">
                <AsciiBar shape="vertical" length={170} value={fillPct(total)} hue={water.hue} showValue={false} label={`${(total / 1000).toFixed(2)} litres of water today`} />
                <span className="fuel-flask-goal" style={{ bottom: `${GOAL_MARK}%` }} aria-hidden="true"><i>{GOAL_ML / 1000} L</i></span>
              </div>
              <div className="fuel-water-copy">
                <b className="fuel-water-amount">{(total / 1000).toFixed(2)}<small> L</small></b>
                <span className="fuel-water-sub">of {GOAL_ML / 1000} L · {cups} of {CUPS} cups</span>
                <p className="fuel-water-head">{water.head}</p>
                <p className="fuel-water-why">{water.why} {water.act}</p>
              </div>
            </div>
            <div className="fuel-cups" role="group" aria-label="Cups today">
              {Array.from({ length: CUPS }, (_, i) => (
                <button key={i} type="button" aria-pressed={i < cups}
                  aria-label={i + 1 === cups ? `Take back cup ${i + 1}` : `Make it ${i + 1} ${i ? 'cups' : 'cup'}`}
                  onClick={() => setCupCount(i + 1 === cups ? i : i + 1)} />
              ))}
            </div>
            <div className="fuel-water-actions">
              <button type="button" className="fuel-pill" onClick={() => addWater(CUP_ML)}><Icon name="cup" size={16} />+{CUP_ML} ml</button>
              <button type="button" className="fuel-pill" onClick={() => addWater(500)}><Icon name="drop" size={16} />+500 ml</button>
              <button type="button" className="fuel-icon" disabled={!sips.length} onClick={() => newestFirst[0] && removeSip(newestFirst[0])} aria-label="Take back the last drink">
                <Icon name="undo" size={16} />
              </button>
            </div>
            {newestFirst.length > 0 && (
              <ul className="fuel-sips" aria-label="Drinks today">
                {newestFirst.slice(0, 8).map((s) => (
                  <li key={s.id}>
                    {timeText(s.at)}<b>{s.ml} ml</b>
                    <button type="button" aria-label={`Remove ${s.ml} ml at ${timeText(s.at)}`} onClick={() => removeSip(s)}><Icon name="close" size={12} /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="fuel-card fuel-body" aria-label="Steps and sleep">
            <div className="fuel-metric">
              <div className="fuel-metric-top">
                <span aria-hidden="true"><Icon name="steps" size={16} /></span>
                <b>{steps.toLocaleString()}</b><small>steps</small>
                <em>{steps >= GOALS.steps ? 'Goal met' : `${(GOALS.steps - steps).toLocaleString()} to go`}</em>
              </div>
              <AsciiBar value={(steps / GOALS.steps) * 100} hue="#8b5cf6" showValue={false} label="Steps against goal" />
              <div className="fuel-metric-actions">
                <button type="button" className="fuel-pill is-small" onClick={() => addSteps(1000)}>+1,000</button>
                <button type="button" className="fuel-pill is-small" onClick={() => addSteps(2500)}>+2,500</button>
                <button type="button" className="fuel-pill is-small" onClick={askSteps}>Set exact</button>
              </div>
            </div>
            <div className="fuel-metric">
              <div className="fuel-metric-top">
                <span aria-hidden="true"><Icon name="moon" size={16} /></span>
                <b>{slept ?? '–'}</b><small>{slept === null ? 'no sleep logged' : 'h slept'}</small>
                <em>{from && to ? `${from} to ${to}` : `Aim for ${GOALS.sleep} h`}</em>
              </div>
              <AsciiBar value={slept === null ? 0 : (slept / GOALS.sleep) * 100} hue="#f59e0b" showValue={false} label="Sleep against goal" />
              <div className="fuel-metric-actions">
                <button type="button" className="fuel-pill is-small" onClick={() => setSleeping(true)}><Icon name="clock" size={14} />{from && to ? 'Change times' : 'Log last night'}</button>
              </div>
            </div>
          </section>

          <section className="fuel-card fuel-quick" aria-label="Quick add">
            <header className="fuel-card-head">
              <div>
                <h2>Quick add</h2>
                <p>One tap logs it as {guessSlot(now.getTime()).toLowerCase()}.</p>
              </div>
            </header>
            {again.length > 0 && (
              <>
                <h3 className="fuel-sub">Again from yesterday</h3>
                <div className="fuel-again">
                  {again.map((m) => (
                    <button key={m.id} type="button" onClick={() => logAgain(m)}><b>{m.name}</b><small>{m.kcal.toLocaleString()} kcal</small></button>
                  ))}
                </div>
              </>
            )}
            <div className="fuel-presets">
              {DEFAULT_PRESETS.map((p) => (
                <button key={p.name} type="button" className="fuel-preset" onClick={() => logPreset(p)} aria-label={`Log ${p.name}, ${p.kcal} kcal`}>
                  <img src={p.photo_path} alt="" loading="lazy" />
                  <b>{p.name}</b><small>{p.kcal} kcal</small>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} kind="global" label={menu.meal.name} onClose={() => setMenu(null)}
          items={[
            { label: 'Edit', icon: 'edit', run: () => setEditing(menu.meal) },
            { label: 'Eat it again now', icon: 'copy', run: () => logAgain(menu.meal) },
            { label: 'Delete', icon: 'trash', danger: true, run: () => deleteMeal(menu.meal) },
          ]} />
      )}

      {capture && (
        <MemoryCapture mode="meal" initialKind="meal" kinds={['meal']} initialSlot={capture.slot}
          detailsOnly={!capture.photo} title={capture.photo ? 'Snap a meal' : 'Log a meal'}
          onClose={() => setCapture(null)} onCommit={commitMeal} />
      )}

      {editing && (
        <MealSheet meal={editing} photo={photos[editing.id]} onClose={() => setEditing(null)}
          onSave={(m) => { A.editMeal.mutate({ id: m.id, patch: m }); setEditing(null); toast(`${m.name} saved`, undefined, { tone: 'success', icon: 'check' }); }}
          onDelete={() => { deleteMeal(editing); setEditing(null); }} />
      )}

      {sleeping && (
        <SleepSheet from={from ?? '23:00'} to={to ?? '07:00'} onClose={() => setSleeping(false)}
          onChange={(f, t) => setDay({ sleep_from: f, sleep_to: t, sleep_h: sleepHours(f, t) })} />
      )}
    </div>
  );
}

/** Editing a plate that is already logged. A new one goes through the camera sheet. */
function MealSheet({ meal, photo, onClose, onSave, onDelete }: {
  meal: Meal;
  photo?: string;
  onClose: () => void;
  onSave: (m: Meal) => void;
  onDelete: () => void;
}) {
  const [v, setV] = useState(meal);
  useOverlayBack(true, onClose);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="mem-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="mem-sheet" role="dialog" aria-modal="true" aria-labelledby="fuel-meal-title"
        onSubmit={(e) => { e.preventDefault(); onSave({ ...v, name: v.name.trim() || 'Meal' }); }}>
        <header className="mem-sheet-head">
          <h2 id="fuel-meal-title">Edit meal</h2>
          <button type="button" className="mem-icon" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        {photo && <div className="mem-preview"><img src={photo} alt={v.name} /></div>}
        <label className="mem-field is-wide">
          <span>What you ate</span>
          <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Chicken adobo and rice" />
        </label>
        <div className="mem-chips" role="radiogroup" aria-label="Meal">
          {SLOTS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={slotOf(v) === s} onClick={() => setV({ ...v, slot: s })}>{s}</button>
          ))}
        </div>
        <div className="mem-numbers">
          {([['kcal', 'Calories', 'kcal'], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'], ['fat', 'Fat', 'g']] as const).map(([key, label, unit]) => (
            <label key={key} className="mem-field">
              <span>{label}</span>
              <span className="mem-unit">
                <input type="number" inputMode="numeric" min={0} value={v[key] || ''} placeholder="0"
                  onChange={(e) => setV({ ...v, [key]: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                <i>{unit}</i>
              </span>
            </label>
          ))}
        </div>
        <label className="mem-field is-wide">
          <span>Place <em>optional</em></span>
          <input value={v.place ?? ''} onChange={(e) => setV({ ...v, place: e.target.value || null })} placeholder="Canteen, home, the stall by the gate" />
        </label>
        <div className="fuel-sheet-actions">
          <button type="button" className="mem-ghost" onClick={onDelete}><Icon name="trash" size={16} />Delete</button>
          <button type="submit" className="mem-save">Save changes</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function SleepSheet({ from, to, onClose, onChange }: {
  from: string;
  to: string;
  onClose: () => void;
  onChange: (from: string, to: string) => void;
}) {
  useOverlayBack(true, onClose);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="mem-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mem-sheet fuel-sleep-sheet" role="dialog" aria-modal="true" aria-labelledby="fuel-sleep-title">
        <header className="mem-sheet-head">
          <h2 id="fuel-sleep-title">Last night&apos;s sleep</h2>
          <button type="button" className="mem-icon" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        <p className="fuel-muted">Drag the two ends to when you fell asleep and when you woke up.</p>
        <SleepArc from={from} to={to} onChange={onChange} />
        <button type="button" className="mem-save" onClick={onClose}>Done</button>
      </div>
    </div>,
    document.body,
  );
}
