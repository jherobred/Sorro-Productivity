'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { RowsSkeleton } from '@/components/Skeleton';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { useLayout } from '@/lib/useLayout';
import { settler } from '@/lib/settle';

import { useFollows } from '@/lib/follows';
import { PersonAvatar, PersonCard, type PersonRecord } from '@/components/people/PersonCard';
import { GhostRoster } from '@/components/people/GhostRoster';

/** Ported from Basedly.dc.html markup 2351–2420. */

type Person = PersonRecord;

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
  const router = useRouter();
  const { phone } = useLayout();
  const qc = useQueryClient();
  const settle = settler(qc, KEY);
  const { isFollowing, toggleFollow } = useFollows();

  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const { data: people = [], isPending } = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Person[]> => {
      // select('*') rather than a column list: the contact-card columns
      // (0017) come back when they exist and are simply absent before, so the
      // page works either side of that migration instead of erroring on a
      // column the database has not got yet.
      const { data, error } = await supabase.from('bd_people')
        .select('*').order('created_at');
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

  /**
   * One click makes the person. The form it replaces asked for a name before
   * it would create anything, which is the wrong order: you add someone
   * because you just met them, and the details arrive over the next week. The
   * card opens with the name field focused, so typing still works — it just
   * is not a gate any more.
   */
  const create = () => {
    const id = crypto.randomUUID();
    add.mutate({ id, name: 'Untitled Person', category: CATS[0], color: hueFor(CATS[0]), email: '' });
    setSel(id);
    setQ('');
    toast('Added — give them a name');
  };

  const filteredPeople = people.filter((p) => {
    if (!q.trim()) return true;
    const term = q.trim().toLowerCase();
    return p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term) || p.email.toLowerCase().includes(term);
  });

  const isFollowed = person ? (isFollowing(person.name.toLowerCase().replace(/\s+/g, '')) || isFollowing(person.id)) : false;

  const list = isPending ? (
    <RowsSkeleton rows={6} label="Loading your people" lead="circle" />
  ) : (
    <div data-tour="people-roster" style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={KICKER}>All people ({people.length})</div>
        <button onClick={create} className="hov" aria-label="Add someone" title="Add someone"
          style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
          <Icon name="plus" size={13} color="var(--tx3)" />
        </button>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
        borderRadius: 10, background: 'var(--card)', border: '1px solid var(--line2)',
        marginBottom: 8,
      }}>
        <Icon name="search" size={13} color="var(--tx3)" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search contacts…"
          style={{ flex: 1, minWidth: 0, fontSize: 12, border: 'none', background: 'transparent', color: 'var(--tx)', outline: 'none' }}
        />
        {q && (
          <button onClick={() => setQ('')} style={{ border: 'none', background: 'transparent', color: 'var(--tx3)', cursor: 'pointer', fontSize: 11 }}>✕</button>
        )}
      </div>

      {filteredPeople.map((p) => (
        <button key={p.id} onClick={() => setSel(p.id)} className="row" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 11, textAlign: 'left',
          background: p.id === sel ? 'var(--hov)' : 'transparent',
        }}>
          <PersonAvatar name={p.name} color={p.color} path={p.photo_path} size={32} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{
              display: 'block', fontSize: 13, fontWeight: 600,
              color: p.name === 'Untitled Person' ? 'var(--tx3)' : 'var(--tx)',
            }}>{p.name}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>{p.category}</span>
          </span>
        </button>
      ))}

      {filteredPeople.length === 0 && (
        q ? (
          <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: '8px 2px' }}>
            No contacts match “{q}”.
          </div>
        ) : (
          <>
            <GhostRoster />
            <button onClick={create} className="acc k-squish" style={{
              marginTop: 10, padding: '9px 14px', borderRadius: 10, background: 'var(--acc)',
              color: 'var(--ink)', fontSize: 12, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}>
              <Icon name="plus" size={14} color="var(--ink)" />Add the first person
            </button>
          </>
        )
      )}
    </div>
  );

  const detail = person && (
    <PersonCard
      // Keyed, so switching person remounts rather than handing new props to
      // state that only initialises once — without it a fresh "Untitled
      // Person" opens with the previous person's editing state.
      key={person.id}
      person={person} cats={CATS} hueFor={hueFor} phone={phone}
      onPatch={(patch) => save.mutate({ id: person.id, patch })}
      onDelete={() => { del.mutate({ id: person.id }); setSel(null); toast(`Removed ${person.name}`); }}
      onOpenProfile={() => router.push(`/profile/?u=${encodeURIComponent(person.basedly_handle || person.name.toLowerCase().replace(/\s+/g, ''))}`)}
      onMessage={() => router.push('/community/?tab=messages')}
      follow={{
        on: isFollowed,
        toggle: () => toggleFollow({
          userId: person.id,
          handle: person.name.toLowerCase().replace(/\s+/g, ''),
          name: person.name,
        }),
      }} />
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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          {list}
          {detail ?? <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: 20 }}>Pick someone.</div>}
        </div>
      )}
    </div>
  );
}
