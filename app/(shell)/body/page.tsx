'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon, type IconName } from '@/components/Icon';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { ymd, lastDays } from '@/lib/habits';
import { settler } from '@/lib/settle';

/** Ported from Basedly.dc.html markup 870–1019. */

type Day = { on_date: string; sleep_h: number | null; water: number | null; steps: number | null; weight: number | null };
type Meal = { id: string; on_date: string; name: string; slot: string; kcal: number; protein: number; carbs: number; fat: number };
type GymDay = { id: string; weekday: number; name: string; done: boolean };
type Vital = { id: string; name: string; kind: string; at: string; color: string };

const DAY_KEY = ['body_days'] as const;
const MEAL_KEY = ['meals'] as const;
const GYM_KEY = ['gym'] as const;
const VITAL_KEY = ['vitals'] as const;

const TABS = ['health', 'food', 'gym'] as const;
type Tab = (typeof TABS)[number];
const SLOTS = ['Breakfast', 'Lunch', 'Snack', 'Dinner'];
const DAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const KICKER: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' };
const CARD: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, padding: '15px 16px', boxShadow: 'var(--sh)' };
const STEP: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 7, border: '1px solid var(--line2)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, fontWeight: 700, color: 'var(--tx2)',
};

const SAVE_DAY = defineMutation('body.saveDay', async (v: { patch: Partial<Day> & { on_date: string } }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_body_days').upsert({ user_id, ...v.patch }, { onConflict: 'user_id,on_date' });
  if (error) throw error;
});
const ADD_MEAL = defineMutation('body.addMeal', async (v: Omit<Meal, 'id'>) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_meals').insert({ ...v, user_id });
  if (error) throw error;
});
const DEL_MEAL = defineMutation('body.delMeal', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_meals').delete().eq('id', v.id);
  if (error) throw error;
});
const TOGGLE_GYM = defineMutation('body.toggleGym', async (v: { id: string; done: boolean }) => {
  const { error } = await supabase.from('bd_gym_days').update({ done: v.done }).eq('id', v.id);
  if (error) throw error;
});
const ADD_VITAL = defineMutation('body.addVital', async (v: { name: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_vitals').insert({ user_id, name: v.name, kind: 'note', color: PAL.mint });
  if (error) throw error;
});
const DEL_VITAL = defineMutation('body.delVital', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_vitals').delete().eq('id', v.id);
  if (error) throw error;
});

export default function BodyPage() {
  const { phone } = useLayout();
  const { prefs } = usePrefs();
  const [tab, setTab] = useState<Tab>('health');
  const today = ymd(new Date());

  const qc = useQueryClient();
  const settle = settler(qc, DAY_KEY, MEAL_KEY, GYM_KEY, VITAL_KEY);

  const { data: days = [] } = useQuery({
    queryKey: DAY_KEY,
    queryFn: async (): Promise<Day[]> => {
      const from = ymd(lastDays(7)[0]);
      const { data, error } = await supabase.from('bd_body_days')
        .select('on_date,sleep_h,water,steps,weight').gte('on_date', from).order('on_date');
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: meals = [] } = useQuery({
    queryKey: [...MEAL_KEY, today],
    queryFn: async (): Promise<Meal[]> => {
      const { data, error } = await supabase.from('bd_meals')
        .select('id,on_date,name,slot,kcal,protein,carbs,fat').eq('on_date', today);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: gym = [] } = useQuery({
    queryKey: GYM_KEY,
    queryFn: async (): Promise<GymDay[]> => {
      const { data, error } = await supabase.from('bd_gym_days').select('id,weekday,name,done').order('weekday');
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: vitals = [] } = useQuery({
    queryKey: VITAL_KEY,
    queryFn: async (): Promise<Vital[]> => {
      const { data, error } = await supabase.from('bd_vitals').select('id,name,kind,at,color').order('at', { ascending: false }).limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveDay = useMutation<unknown, Error, { patch: Partial<Day> & { on_date: string } }>({ mutationKey: SAVE_DAY, onSettled: settle });
  const addMeal = useMutation<unknown, Error, Omit<Meal, 'id'>>({ mutationKey: ADD_MEAL, onSettled: settle });
  const delMeal = useMutation<unknown, Error, { id: string }>({ mutationKey: DEL_MEAL, onSettled: settle });
  const addVital = useMutation<unknown, Error, { name: string }>({ mutationKey: ADD_VITAL, onSettled: settle });
  const delVital = useMutation<unknown, Error, { id: string }>({ mutationKey: DEL_VITAL, onSettled: settle });
  const toggleGym = useMutation({
    mutationKey: TOGGLE_GYM,
    onMutate: (v: { id: string; done: boolean }) => {
      const prev = queryClient.getQueryData<GymDay[]>(GYM_KEY) ?? [];
      queryClient.setQueryData<GymDay[]>(GYM_KEY, prev.map((g) => (g.id === v.id ? { ...g, done: v.done } : g)));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(GYM_KEY, ctx); },
    onSettled: settle,
  });

  const d = days.find((x) => x.on_date === today);
  const set = (patch: Partial<Day>) => saveDay.mutate({ patch: { on_date: today, ...patch } });

  const stats: { n: string; ic: IconName; v: number; unit: string; target: number; step: number; c: string; meta: string; onSet: (v: number) => void }[] = [
    { n: 'Sleep', ic: 'moon', v: Number(d?.sleep_h ?? 0), unit: 'h', target: 8, step: 0.5, c: PAL.violet, meta: 'Target 8h', onSet: (v) => set({ sleep_h: v }) },
    { n: 'Water', ic: 'drop', v: Number(d?.water ?? 0), unit: 'glasses', target: 8, step: 1, c: PAL.cyan, meta: 'Target 8 glasses', onSet: (v) => set({ water: v }) },
    { n: 'Steps', ic: 'steps', v: Number(d?.steps ?? 0), unit: '', target: 10000, step: 500, c: PAL.mint, meta: 'Target 10,000', onSet: (v) => set({ steps: v }) },
    { n: 'Weight', ic: 'scale', v: Number(d?.weight ?? 0), unit: 'kg', target: 0, step: 0.1, c: PAL.amber, meta: 'Logged today', onSet: (v) => set({ weight: v }) },
  ];

  const kcal = meals.reduce((s, m) => s + m.kcal, 0);
  const macro = { p: meals.reduce((s, m) => s + m.protein, 0), c: meals.reduce((s, m) => s + m.carbs, 0), f: meals.reduce((s, m) => s + m.fat, 0) };

  return (
    <div style={{ padding: phone ? '14px 14px 24px' : '20px 24px 28px', maxWidth: 1240, marginInline: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 className="sronly">Body</h1>
        <div style={{ position: 'relative', display: 'flex', padding: 3, borderRadius: 12, background: 'var(--card)' }}>
          <div style={{
            position: 'absolute', top: 3, bottom: 3, left: 3, width: 'calc((100% - 6px)/3)',
            borderRadius: 9, background: prefs.accent,
            transform: `translateX(${TABS.indexOf(tab) * 100}%)`,
            transition: 'transform .34s cubic-bezier(0.16,1,0.3,1)',
          }} />
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              position: 'relative', zIndex: 1, padding: '6px 17px', borderRadius: 9,
              fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
              color: tab === t ? '#0C0F16' : 'var(--tx2)', transition: 'color .24s',
            }}>{t}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: 'var(--tx3)' }}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {tab === 'health' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3,1fr)', gap: 12, alignContent: 'start' }}>
            {stats.map((h) => (
              <div key={h.n} style={CARD}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name={h.ic} size={14} color={h.c} />
                  <div style={KICKER}>{h.n}</div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                    <button onClick={() => h.onSet(Math.max(0, +(h.v - h.step).toFixed(1)))} className="hov" title="Less" style={STEP}>−</button>
                    <button onClick={() => h.onSet(+(h.v + h.step).toFixed(1))} className="hov" title="More" style={STEP}>+</button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, margin: '10px 0 9px' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.035em', fontVariantNumeric: 'tabular-nums' }}>
                    {h.n === 'Steps' ? h.v.toLocaleString() : h.v}
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx3)' }}>{h.unit}</div>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--line2)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3, background: h.c,
                    width: `${h.target ? Math.min(100, (h.v / h.target) * 100) : 0}%`,
                    transition: 'width .4s cubic-bezier(0.16,1,0.3,1)',
                  }} />
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 8 }}>{h.meta}</div>
              </div>
            ))}
          </div>

          <div style={{ ...CARD, marginTop: 12 }}>
            <div style={KICKER}>Sleep — last seven nights</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110, marginTop: 14 }}>
              {lastDays(7).map((day) => {
                const key = ymd(day);
                const row = days.find((x) => x.on_date === key);
                const h = Number(row?.sleep_h ?? 0);
                return (
                  <div key={key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{h || ''}</div>
                    <div style={{
                      width: '100%', height: `${Math.min(100, (h / 10) * 100)}%`, minHeight: h ? 4 : 0,
                      borderRadius: 6, background: `color-mix(in srgb, ${PAL.violet} ${h >= 7 ? 100 : 55}%, transparent)`,
                      transition: 'height .4s cubic-bezier(0.16,1,0.3,1)',
                    }} />
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--tx3)' }}>{DAYS_SHORT[(day.getDay() + 6) % 7]}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ ...CARD, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={KICKER}>Symptoms and meds</div>
              <div style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--tx3)' }}>{vitals.length} logged</div>
            </div>
            {vitals.map((v) => (
              <div key={v.id} className="row" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 2px', borderBottom: '1px solid var(--line)' }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: v.color, flex: 'none' }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, textWrap: 'pretty' }}>{v.name}</span>
                <span style={{ flex: 'none', fontSize: 11, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
                  {new Date(v.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
                <button onClick={() => { delVital.mutate({ id: v.id }); toast('Entry deleted'); }} className="hov" title="Delete entry"
                  style={{ flex: 'none', width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="trash" size={13} color="var(--tx3)" />
                </button>
              </div>
            ))}
            <InlineAdd placeholder="Log a symptom, dose or reading" cta="Log" onAdd={(v) => addVital.mutate({ name: v })} />
          </div>
        </>
      )}

      {tab === 'food' && (
        <>
          <div style={CARD}>
            <div style={KICKER}>Today</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '10px 0 12px' }}>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.035em', fontVariantNumeric: 'tabular-nums' }}>{kcal.toLocaleString()}</div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx3)' }}>kcal</div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, fontWeight: 600, color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>
              <span>P {macro.p}g</span><span>C {macro.c}g</span><span>F {macro.f}g</span>
            </div>
          </div>

          {SLOTS.map((slot) => {
            const items = meals.filter((m) => m.slot === slot);
            return (
              <div key={slot} style={{ ...CARD, marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={KICKER}>{slot}</div>
                  <div style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--tx3)' }}>
                    {items.reduce((s, m) => s + m.kcal, 0)} kcal
                  </div>
                </div>
                {items.map((m) => (
                  <div key={m.id} className="row" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 2px', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{m.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>{m.kcal}</span>
                    <button onClick={() => { delMeal.mutate({ id: m.id }); toast(`Removed “${m.name}”`); }} className="hov" title="Delete"
                      style={{ width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="trash" size={13} color="var(--tx3)" />
                    </button>
                  </div>
                ))}
                <InlineAdd placeholder={`Add to ${slot.toLowerCase()}`} cta="Add"
                  onAdd={(v) => addMeal.mutate({ on_date: today, name: v, slot, kcal: 0, protein: 0, carbs: 0, fat: 0 })} />
              </div>
            );
          })}
        </>
      )}

      {tab === 'gym' && (
        <div style={CARD}>
          <div style={KICKER}>Week plan</div>
          <div style={{ marginTop: 10 }}>
            {gym.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: '10px 2px' }}>No plan yet.</div>}
            {gym.map((g) => (
              <button key={g.id} onClick={() => toggleGym.mutate({ id: g.id, done: !g.done })} className="row"
                style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '12px 2px', borderBottom: '1px solid var(--line)', minHeight: 48, textAlign: 'left' }}>
                <span style={{ width: 30, fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', color: 'var(--tx3)' }}>{DAYS_SHORT[g.weekday]}</span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, opacity: g.done ? 0.55 : 1 }}>{g.name}</span>
                <span className={g.done ? 'cellpop' : undefined} style={{
                  width: 24, height: 24, borderRadius: 8, display: 'grid', placeItems: 'center',
                  border: g.done ? 'none' : '1.5px solid var(--line2)',
                  background: g.done ? PAL.mint : 'transparent',
                  color: '#0C0F16', fontSize: 11, fontWeight: 700,
                }}>{g.done ? '✓' : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InlineAdd({ placeholder, cta, onAdd }: { placeholder: string; cta: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState('');
  const submit = () => { const t = v.trim(); if (!t) return; onAdd(t); setV(''); };
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={placeholder}
        style={{ flex: 1, minHeight: 36, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 12.5 }} />
      <button onClick={submit} className="acc"
        style={{ flex: 'none', padding: '0 15px', minHeight: 36, borderRadius: 10, background: 'var(--acc)', color: '#0C0F16', fontSize: 12, fontWeight: 800 }}>
        {cta}
      </button>
    </div>
  );
}
