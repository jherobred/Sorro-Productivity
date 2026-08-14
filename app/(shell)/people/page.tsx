'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';

type Person = { id: string; name: string; category: string; color: string; email: string; note: string };

const KEY = ['people'] as const;

const ADD = defineMutation('people.add', async (v: { id: string; name: string; category: string; color: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_people').insert({ ...v, user_id });
  if (error) throw error;
});

const SAVE = defineMutation('people.save', async (v: { id: string; patch: Partial<Person> }) => {
  const { error } = await supabase.from('bd_people').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

// bd_people has no deleted_at, so this is a hard delete — no undo to offer.
const DEL = defineMutation('people.del', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_people').delete().eq('id', v.id);
  if (error) throw error;
});

const CATEGORIES = ['Classmate', 'Groupmate', 'Friend', 'Family', 'Prof'];

export default function PeoplePage() {
  const qc = useQueryClient();
  const settle = () => void qc.invalidateQueries({ queryKey: KEY });

  const { data: people = [] } = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase
        .from('bd_people')
        .select('id,name,category,color,email,note')
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation<unknown, Error, { id: string; name: string; category: string; color: string }>({ mutationKey: ADD, onSettled: settle });
  const save = useMutation({
    mutationKey: SAVE,
    onMutate: (v: { id: string; patch: Partial<Person> }) => {
      const prev = queryClient.getQueryData<Person[]>(KEY) ?? [];
      queryClient.setQueryData<Person[]>(KEY, prev.map((p) => (p.id === v.id ? { ...p, ...v.patch } : p)));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(KEY, ctx); },
    onSettled: settle,
  });
  const del = useMutation({
    mutationKey: DEL,
    onMutate: (v: { id: string }) => {
      const prev = queryClient.getQueryData<Person[]>(KEY) ?? [];
      queryClient.setQueryData<Person[]>(KEY, prev.filter((p) => p.id !== v.id));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(KEY, ctx); },
    onSettled: settle,
  });

  const [name, setName] = useState('');
  const [cat, setCat] = useState(CATEGORIES[0]);

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    add.mutate({ id: crypto.randomUUID(), name: n, category: cat, color: PAL.indigo });
    setName('');
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em', marginBottom: 20 }}>People</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Add someone"
          style={{ flex: 2, minWidth: 150, minHeight: 44, padding: '12px 14px', borderRadius: 9, border: '1px solid var(--line2)', background: 'var(--card)', color: 'var(--tx)', fontSize: 13.5 }} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}
          style={{ minHeight: 44, padding: '12px 10px', borderRadius: 9, border: '1px solid var(--line2)', background: 'var(--card)', color: 'var(--tx)', fontSize: 12.5 }}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={submit} className="acc" style={{ minHeight: 44, padding: '0 18px', borderRadius: 14, background: 'var(--acc)', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700 }}>Add</button>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--sh)', overflow: 'hidden' }}>
        {people.length === 0 && <p style={{ padding: 16, fontSize: 12.5, color: 'var(--tx3)' }}>Nobody yet.</p>}
        {people.map((p, i) => (
          <div key={p.id} className="lensrow" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', animationDelay: `${Math.min(i, 8) * 0.02}s` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: `color-mix(in srgb, ${p.color} 30%, var(--card2))`, display: 'grid', placeItems: 'center', fontSize: 11.5, fontWeight: 700, color: p.color, flex: 'none' }}>
                {p.name.slice(0, 2).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--tx3)', fontWeight: 600 }}>{p.category}</div>
              </div>
              <button onClick={() => { del.mutate({ id: p.id }); toast(`Removed ${p.name}`); }} aria-label={`Remove ${p.name}`}
                style={{ padding: 5, minWidth: 24, minHeight: 24 }}>
                <Icon name="trash" size={13} color="var(--tx3)" />
              </button>
            </div>
            <input
              defaultValue={p.note}
              onBlur={(e) => e.target.value !== p.note && save.mutate({ id: p.id, patch: { note: e.target.value } })}
              placeholder="What you want to remember about them…"
              style={{ width: '100%', marginTop: 8, fontSize: 12, color: 'var(--tx2)', minHeight: 24 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
