'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { useLayout } from '@/lib/useLayout';

/** Ported from Basedly.dc.html markup 2351–2420. */

type Person = { id: string; name: string; category: string; color: string; email: string; note: string };

const KEY = ['people'] as const;
const CATS = ['Classmate', 'Groupmate', 'Friend', 'Family', 'Prof'];
const KICKER: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' };

const hueFor = (c: string) =>
  ({ Classmate: PAL.indigo, Groupmate: PAL.violet, Friend: PAL.mint, Family: PAL.amber, Prof: PAL.cyan }[c] ?? PAL.indigo);

const ADD = defineMutation('people.add', async (v: { id: string; name: string; category: string; color: string; email: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_people').insert({ ...v, user_id });
  if (error) throw error;
});
const SAVE = defineMutation('people.save', async (v: { id: string; patch: Partial<Person> }) => {
  const { error } = await supabase.from('bd_people').update(v.patch).eq('id', v.id);
  if (error) throw error;
});
const DEL = defineMutation('people.del', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_people').delete().eq('id', v.id);
  if (error) throw error;
});

export default function PeoplePage() {
  const { phone } = useLayout();
  const qc = useQueryClient();
  const settle = () => void qc.invalidateQueries({ queryKey: KEY });

  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dName, setDName] = useState('');
  const [dEmail, setDEmail] = useState('');
  const [dCat, setDCat] = useState(CATS[0]);

  const { data: people = [] } = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase.from('bd_people')
        .select('id,name,category,color,email,note').order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => { if (!sel && people.length && !phone) setSel(people[0].id); }, [people, sel, phone]);

  // The id comes from the client so the row that appears now is the same row
  // the server ends up with — and so it can be selected before the write lands.
  const add = useMutation<unknown, Error, { id: string; name: string; category: string; color: string; email: string }>({
    mutationKey: ADD,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Person[]>(KEY) ?? [];
      queryClient.setQueryData<Person[]>(KEY, [...prev, { ...v, note: '' }]);
    },
    onSettled: settle,
  });
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

  const person = people.find((p) => p.id === sel) ?? null;

  const create = () => {
    const n = dName.trim();
    if (!n) return;
    const id = crypto.randomUUID();
    add.mutate({ id, name: n, category: dCat, color: hueFor(dCat), email: dEmail.trim() });
    setSel(id);
    setDName(''); setDEmail(''); setAdding(false);
  };

  const list = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={KICKER}>All people</div>
        <button onClick={() => setAdding((v) => !v)} className="hov" aria-label="Add someone" aria-expanded={adding} title="Add someone"
          style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
          <Icon name="plus" size={13} color="var(--tx3)" />
        </button>
      </div>

      {adding && (
        <div className="rise" style={{ padding: '13px 14px', borderRadius: 14, background: 'var(--card)', boxShadow: 'var(--sh)', marginBottom: 8 }}>
          <input value={dName} onChange={(e) => setDName(e.target.value)} placeholder="Full name"
            style={{ width: '100%', padding: '8px 11px', borderRadius: 10, border: '1px solid var(--line2)', fontSize: 12.5, fontWeight: 600, color: 'var(--tx)', marginBottom: 8 }} />
          <input value={dEmail} onChange={(e) => setDEmail(e.target.value)} placeholder="Email"
            style={{ width: '100%', padding: '8px 11px', borderRadius: 10, border: '1px solid var(--line2)', fontSize: 12.5, fontWeight: 500, color: 'var(--tx)', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
            {CATS.map((c) => (
              <button key={c} onClick={() => setDCat(c)} style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                border: `1px solid ${dCat === c ? 'var(--acc)' : 'var(--line2)'}`,
                color: dCat === c ? 'var(--accTx)' : 'var(--tx2)',
              }}>{c}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button onClick={create} className="acc"
              style={{ padding: '8px 15px', borderRadius: 9, background: 'var(--acc)', color: '#0C0F16', fontSize: 11.5, fontWeight: 800 }}>Add</button>
            <button onClick={() => setAdding(false)} className="hov"
              style={{ padding: '8px 15px', borderRadius: 9, border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)' }}>Cancel</button>
          </div>
        </div>
      )}

      {people.map((p) => (
        <button key={p.id} onClick={() => setSel(p.id)} className="row" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 11, textAlign: 'left',
          background: p.id === sel ? 'var(--hov)' : 'transparent',
        }}>
          <span style={{
            width: 32, height: 32, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: `color-mix(in srgb, ${p.color} 28%, var(--card2))`, color: p.color, fontSize: 11, fontWeight: 700,
          }}>
            {p.name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{p.name}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>{p.category}</span>
          </span>
        </button>
      ))}

      {people.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: '8px 2px' }}>Nobody yet.</div>}
    </div>
  );

  const detail = person && (
    <div style={{ background: 'var(--card)', borderRadius: 16, padding: '18px 18px 20px', boxShadow: 'var(--sh)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{
          width: 54, height: 54, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: `color-mix(in srgb, ${person.color} 28%, var(--card2))`, color: person.color, fontSize: 17, fontWeight: 800,
        }}>
          {person.name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>{person.name}</div>
          <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 3 }}>
            {person.category}{person.email ? ` · ${person.email}` : ''}
          </div>
        </div>
        <button onClick={() => { del.mutate({ id: person.id }); setSel(null); toast(`Removed ${person.name}`); }}
          className="hov" aria-label={`Remove ${person.name}`} title="Remove" style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center' }}>
          <Icon name="trash" size={14} color="var(--tx2)" />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
        {CATS.map((c) => (
          <button key={c} onClick={() => save.mutate({ id: person.id, patch: { category: c, color: hueFor(c) } })} style={{
            padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            border: `1px solid ${person.category === c ? 'var(--acc)' : 'var(--line2)'}`,
            color: person.category === c ? 'var(--accTx)' : 'var(--tx2)',
          }}>{c}</button>
        ))}
      </div>

      <div style={{ ...KICKER, marginBottom: 6 }}>What you want to remember</div>
      <textarea key={person.id} defaultValue={person.note}
        onBlur={(e) => e.target.value !== person.note && save.mutate({ id: person.id, patch: { note: e.target.value } })}
        rows={5} placeholder="How you met, what they're working on, what to ask next time…"
        style={{ width: '100%', padding: '11px 13px', borderRadius: 12, border: '1px solid var(--line2)', background: 'var(--card2)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--tx)', resize: 'vertical', fontFamily: 'inherit' }} />
    </div>
  );

  return (
    <div style={{ padding: phone ? '14px 14px 24px' : '20px 24px 28px' }}>
      {phone ? (
        person ? (
          <>
            <button onClick={() => setSel(null)} className="hov"
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)', marginBottom: 12 }}>
              <Icon name="back" size={14} color="var(--tx2)" /> People
            </button>
            {detail}
          </>
        ) : list
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>
          {list}
          {detail ?? <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: 20 }}>Pick someone.</div>}
        </div>
      )}
    </div>
  );
}
