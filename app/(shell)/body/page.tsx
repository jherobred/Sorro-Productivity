'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon, type IconName } from '@/components/Icon';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { SECHUE } from '@/lib/pal';
import { ymd } from '@/lib/habits';

type Day = { on_date: string; sleep_h: number | null; water: number | null; steps: number | null; weight: number | null };
type Meal = { id: string; on_date: string; name: string; slot: string; kcal: number; protein: number; carbs: number; fat: number };
type GymDay = { id: string; weekday: number; name: string; done: boolean };

const DAY_KEY = ['body_day'] as const;
const MEAL_KEY = ['meals'] as const;
const GYM_KEY = ['gym'] as const;

const SLOTS = ['Breakfast', 'Lunch', 'Snack', 'Dinner'];
const DAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

// Upsert on (user_id, on_date) — the table's primary key.
const SAVE_DAY = defineMutation('body.saveDay', async (v: { patch: Partial<Day> & { on_date: string } }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_body_days').upsert({ user_id, ...v.patch }, { onConflict: 'user_id,on_date' });
  if (error) throw error;
});

const ADD_MEAL = defineMutation('body.addMeal', async (v: Omit<Meal, 'id'> & { id: string }) => {
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

export default function BodyPage() {
  const [tab, setTab] = useState<'health' | 'food' | 'gym'>('health');
  const today = ymd(new Date());

  const qc = useQueryClient();
  const settle = () => {
    void qc.invalidateQueries({ queryKey: DAY_KEY });
    void qc.invalidateQueries({ queryKey: MEAL_KEY });
    void qc.invalidateQueries({ queryKey: GYM_KEY });
  };

  const { data: day } = useQuery({
    queryKey: [...DAY_KEY, today],
    queryFn: async (): Promise<Day | null> => {
      const { data, error } = await supabase
        .from('bd_body_days').select('on_date,sleep_h,water,steps,weight').eq('on_date', today).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: meals = [] } = useQuery({
    queryKey: [...MEAL_KEY, today],
    queryFn: async (): Promise<Meal[]> => {
      const { data, error } = await supabase
        .from('bd_meals').select('id,on_date,name,slot,kcal,protein,carbs,fat').eq('on_date', today);
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

  const saveDay = useMutation<unknown, Error, { patch: Partial<Day> & { on_date: string } }>({ mutationKey: SAVE_DAY, onSettled: settle });
  const addMeal = useMutation<unknown, Error, Omit<Meal, 'id'> & { id: string }>({ mutationKey: ADD_MEAL, onSettled: settle });
  const delMeal = useMutation<unknown, Error, { id: string }>({ mutationKey: DEL_MEAL, onSettled: settle });
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

  const kcal = meals.reduce((s, m) => s + m.kcal, 0);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em' }}>Body</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['health', 'food', 'gym'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="hov"
              style={{
                padding: '7px 11px', borderRadius: 9, fontSize: 11.5, fontWeight: 700, minHeight: 34,
                color: tab === t ? SECHUE.body : 'var(--tx3)', background: tab === t ? 'var(--hov)' : undefined,
              }}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {tab === 'health' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <Metric icon="moon" label="Sleep" unit="h" value={day?.sleep_h ?? null} step={0.5}
            onSet={(v) => saveDay.mutate({ patch: { on_date: today, sleep_h: v } })} />
          <Metric icon="drop" label="Water" unit="glasses" value={day?.water ?? null} step={1}
            onSet={(v) => saveDay.mutate({ patch: { on_date: today, water: v } })} />
          <Metric icon="steps" label="Steps" unit="" value={day?.steps ?? null} step={500}
            onSet={(v) => saveDay.mutate({ patch: { on_date: today, steps: v } })} />
          <Metric icon="scale" label="Weight" unit="kg" value={day?.weight ?? null} step={0.1}
            onSet={(v) => saveDay.mutate({ patch: { on_date: today, weight: v } })} />
        </div>
      )}

      {tab === 'food' && (
        <>
          <div className="rise" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 18, marginBottom: 16, boxShadow: 'var(--sh)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' }}>Today</div>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', marginTop: 4 }}>{kcal} <span style={{ fontSize: 13.5, color: 'var(--tx2)' }}>kcal</span></div>
          </div>

          <AddMeal onAdd={(name, slot, k) => addMeal.mutate({ id: crypto.randomUUID(), on_date: today, name, slot, kcal: k, protein: 0, carbs: 0, fat: 0 })} />

          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--sh)', overflow: 'hidden' }}>
            {meals.length === 0 && <p style={{ padding: 16, fontSize: 12.5, color: 'var(--tx3)' }}>Nothing logged today.</p>}
            {meals.map((m) => (
              <div key={m.id} className="lensrow" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5 }}>{m.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--tx3)', fontWeight: 600 }}>{m.slot}</div>
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)' }}>{m.kcal} kcal</span>
                <button onClick={() => { delMeal.mutate({ id: m.id }); toast(`Removed “${m.name}”`); }} aria-label="Delete" style={{ padding: 5, minWidth: 24, minHeight: 24 }}>
                  <Icon name="trash" size={13} color="var(--tx3)" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'gym' && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--sh)', overflow: 'hidden' }}>
          {gym.length === 0 && <p style={{ padding: 16, fontSize: 12.5, color: 'var(--tx3)' }}>No week plan yet.</p>}
          {gym.map((g) => (
            <button key={g.id} onClick={() => toggleGym.mutate({ id: g.id, done: !g.done })} className="row"
              style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '12px 14px', borderBottom: '1px solid var(--line)', minHeight: 48, textAlign: 'left' }}>
              <span style={{ width: 30, fontSize: 10, fontWeight: 700, letterSpacing: '.11em', color: 'var(--tx3)' }}>{DAYS_SHORT[g.weekday]}</span>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, opacity: g.done ? 0.55 : 1 }}>{g.name}</span>
              <span className={g.done ? 'cellpop' : undefined}
                style={{ width: 19, height: 19, borderRadius: 7, border: '1px solid var(--line2)', background: g.done ? SECHUE.body : 'transparent', display: 'grid', placeItems: 'center' }}>
                {g.done && <Icon name="task" size={11} color="var(--ink)" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({
  icon, label, unit, value, step, onSet,
}: {
  icon: IconName; label: string; unit: string; value: number | null; step: number; onSet: (v: number) => void;
}) {
  const v = value ?? 0;
  return (
    <div className="rise" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, boxShadow: 'var(--sh)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon name={icon} size={14} color={SECHUE.body} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => onSet(Math.max(0, +(v - step).toFixed(1)))} className="hov" aria-label={`Less ${label}`}
          style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid var(--line2)', fontSize: 15, fontWeight: 700, color: 'var(--tx2)' }}>−</button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>
          {value === null ? '—' : v}{unit && <span style={{ fontSize: 11, color: 'var(--tx3)', marginLeft: 3 }}>{unit}</span>}
        </span>
        <button onClick={() => onSet(+(v + step).toFixed(1))} className="hov" aria-label={`More ${label}`}
          style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid var(--line2)', fontSize: 15, fontWeight: 700, color: 'var(--tx2)' }}>+</button>
      </div>
    </div>
  );
}

function AddMeal({ onAdd }: { onAdd: (name: string, slot: string, kcal: number) => void }) {
  const [name, setName] = useState('');
  const [slot, setSlot] = useState(SLOTS[1]);
  const [kcal, setKcal] = useState('');

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    onAdd(n, slot, parseInt(kcal, 10) || 0);
    setName(''); setKcal('');
  };

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="What did you eat?"
        style={{ flex: 2, minWidth: 140, minHeight: 44, padding: '12px 14px', borderRadius: 9, border: '1px solid var(--line2)', background: 'var(--card)', color: 'var(--tx)', fontSize: 13.5 }} />
      <select value={slot} onChange={(e) => setSlot(e.target.value)}
        style={{ minHeight: 44, padding: '12px 10px', borderRadius: 9, border: '1px solid var(--line2)', background: 'var(--card)', color: 'var(--tx)', fontSize: 12.5 }}>
        {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input value={kcal} onChange={(e) => setKcal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
        inputMode="numeric" placeholder="kcal"
        style={{ width: 90, minHeight: 44, padding: '12px 14px', borderRadius: 9, border: '1px solid var(--line2)', background: 'var(--card)', color: 'var(--tx)', fontSize: 13.5 }} />
      <button onClick={submit} className="acc" style={{ minHeight: 44, padding: '0 16px', borderRadius: 14, background: 'var(--acc)', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700 }}>Add</button>
    </div>
  );
}
