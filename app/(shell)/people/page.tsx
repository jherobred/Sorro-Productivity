'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { RowsSkeleton } from '@/components/Skeleton';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { confirmAsk } from '@/lib/ask';
import { PAL } from '@/lib/pal';
import { useLayout } from '@/lib/useLayout';
import { settler } from '@/lib/settle';

import { useFollows } from '@/lib/follows';
import { PersonAvatar, PersonCard, type PersonRecord } from '@/components/people/PersonCard';
import { GhostRoster } from '@/components/people/GhostRoster';

type Person = PersonRecord;

const KEY = ['people'] as const;
const CATS = ['Classmate', 'Groupmate', 'Friend', 'Family', 'Prof'];
const KICKER: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' };

const hueFor = (c: string) =>
  ({ Classmate: PAL.indigo, Groupmate: PAL.violet, Friend: PAL.mint, Family: PAL.amber, Prof: PAL.cyan }[c] ?? PAL.indigo);

const ADD = defineMutation('people.add', async (v: { id: string; name: string; category: string; color: string; email: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_people').insert({
    ...v,
    user_id,
    links: [],
    gallery: [],
    osint: {},
    deleted_at: null,
  });
  if (error) throw error;
});

const SAVE = defineMutation('people.save', async (v: { id: string; patch: Partial<Person> }) => {
  const { error } = await supabase.from('bd_people').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

const SOFT_DEL = defineMutation('people.soft_del', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_people').update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});

const RESTORE = defineMutation('people.restore', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_people').update({ deleted_at: null }).eq('id', v.id);
  if (error) throw error;
});

const HARD_DEL = defineMutation('people.hard_del', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_people').delete().eq('id', v.id);
  if (error) throw error;
});

const EMPTY_TRASH = defineMutation('people.empty_trash', async (v: { ids: string[] }) => {
  if (!v.ids.length) return;
  const { error } = await supabase.from('bd_people').delete().in('id', v.ids);
  if (error) throw error;
});

export default function PeoplePage() {
  const router = useRouter();
  const { phone } = useLayout();
  const qc = useQueryClient();
  const settle = settler(qc, KEY);
  const { isFollowing, toggleFollow } = useFollows();

  const [viewTab, setViewTab] = useState<'roster' | 'trash'>('roster');
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const { data: people = [], isPending } = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase.from('bd_people')
        .select('*').order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });

  const activePeople = people.filter((p) => !p.deleted_at);
  const trashedPeople = people.filter((p) => !!p.deleted_at);

  useEffect(() => {
    if (viewTab === 'roster' && !sel && activePeople.length && !phone) {
      setSel(activePeople[0].id);
    }
  }, [activePeople, sel, phone, viewTab]);

  const add = useMutation<unknown, Error, { id: string; name: string; category: string; color: string; email: string }>({
    mutationKey: ADD,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Person[]>(KEY) ?? [];
      queryClient.setQueryData<Person[]>(KEY, [...prev, { ...v, note: '', links: [], gallery: [], osint: {}, deleted_at: null }]);
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

  const softDel = useMutation({
    mutationKey: SOFT_DEL,
    onMutate: (v: { id: string }) => {
      const prev = queryClient.getQueryData<Person[]>(KEY) ?? [];
      queryClient.setQueryData<Person[]>(KEY, prev.map((p) => (p.id === v.id ? { ...p, deleted_at: new Date().toISOString() } : p)));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(KEY, ctx); },
    onSettled: settle,
  });

  const restore = useMutation({
    mutationKey: RESTORE,
    onMutate: (v: { id: string }) => {
      const prev = queryClient.getQueryData<Person[]>(KEY) ?? [];
      queryClient.setQueryData<Person[]>(KEY, prev.map((p) => (p.id === v.id ? { ...p, deleted_at: null } : p)));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(KEY, ctx); },
    onSettled: settle,
  });

  const hardDel = useMutation({
    mutationKey: HARD_DEL,
    onMutate: (v: { id: string }) => {
      const prev = queryClient.getQueryData<Person[]>(KEY) ?? [];
      queryClient.setQueryData<Person[]>(KEY, prev.filter((p) => p.id !== v.id));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(KEY, ctx); },
    onSettled: settle,
  });

  const emptyTrash = useMutation({
    mutationKey: EMPTY_TRASH,
    onMutate: (v: { ids: string[] }) => {
      const prev = queryClient.getQueryData<Person[]>(KEY) ?? [];
      const set = new Set(v.ids);
      queryClient.setQueryData<Person[]>(KEY, prev.filter((p) => !set.has(p.id)));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(KEY, ctx); },
    onSettled: settle,
  });

  const person = activePeople.find((p) => p.id === sel) ?? null;

  const create = () => {
    const id = crypto.randomUUID();
    add.mutate({ id, name: 'Untitled Person', category: CATS[0], color: hueFor(CATS[0]), email: '' });
    setSel(id);
    setViewTab('roster');
    setQ('');
    toast('Added — give them a name');
  };

  const deleteWithUndo = (p: Person) => {
    softDel.mutate({ id: p.id });
    if (sel === p.id) {
      const remaining = activePeople.filter((item) => item.id !== p.id);
      setSel(remaining.length ? remaining[0].id : null);
    }
    toast(`Moved ${p.name} to Trash`, () => restore.mutate({ id: p.id }));
  };

  const filteredPeople = activePeople.filter((p) => {
    if (!q.trim()) return true;
    const term = q.trim().toLowerCase();
    return p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term) || (p.email && p.email.toLowerCase().includes(term));
  });

  const isFollowed = person ? (isFollowing(person.name.toLowerCase().replace(/\s+/g, '')) || isFollowing(person.id)) : false;

  const rosterList = isPending ? (
    <RowsSkeleton rows={6} label="Loading your people" lead="circle" />
  ) : (
    <div data-tour="people-roster" style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      {/* Top Segment: All People vs Trash Archive */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: 3, borderRadius: 9, background: 'var(--card2)',
        border: '1px solid var(--line2)', marginBottom: 8,
      }}>
        <button
          type="button"
          onClick={() => setViewTab('roster')}
          className="k-squish"
          style={{
            flex: 1, padding: '5px 8px', borderRadius: 7, fontSize: 11.5, fontWeight: viewTab === 'roster' ? 800 : 600,
            background: viewTab === 'roster' ? 'var(--card)' : 'transparent',
            color: viewTab === 'roster' ? 'var(--tx)' : 'var(--tx3)',
            boxShadow: viewTab === 'roster' ? 'var(--sh)' : 'none',
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <Icon name="people" size={12} color={viewTab === 'roster' ? 'var(--accTx)' : 'var(--tx3)'} />
          <span>All ({activePeople.length})</span>
        </button>

        <button
          type="button"
          onClick={() => { setViewTab('trash'); setSel(null); }}
          className="k-squish"
          style={{
            flex: 1, padding: '5px 8px', borderRadius: 7, fontSize: 11.5, fontWeight: viewTab === 'trash' ? 800 : 600,
            background: viewTab === 'trash' ? 'var(--card)' : 'transparent',
            color: viewTab === 'trash' ? 'var(--tx)' : 'var(--tx3)',
            boxShadow: viewTab === 'trash' ? 'var(--sh)' : 'none',
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <Icon name="trash" size={12} color={viewTab === 'trash' ? 'var(--pal-coral)' : 'var(--tx3)'} />
          <span>Trash ({trashedPeople.length})</span>
        </button>

        <button onClick={create} className="hov k-squish" aria-label="Add someone" title="Add someone"
          style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer' }}>
          <Icon name="plus" size={13} color="var(--tx)" />
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

  const trashView = (
    <div style={{
      background: 'var(--card)', borderRadius: 16, padding: '18px 20px',
      boxShadow: 'var(--sh)', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="trash" size={16} color="var(--pal-coral)" />
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--tx)' }}>
            Trash Archive ({trashedPeople.length})
          </span>
        </div>

        {trashedPeople.length > 0 && (
          <button
            type="button"
            onClick={() => void confirmAsk('Empty all people in trash?', {
              message: 'This will permanently remove all trashed contacts.',
              confirmLabel: 'Empty Trash',
              danger: true,
            }).then((yes) => {
              if (yes) {
                emptyTrash.mutate({ ids: trashedPeople.map((p) => p.id) });
                toast('Trash emptied');
              }
            })}
            className="hov k-squish"
            style={{
              padding: '5px 10px', borderRadius: 7, border: '1px solid var(--line2)',
              background: 'var(--card2)', color: 'var(--pal-coral)', fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
            }}
          >
            Empty Trash
          </button>
        )}
      </div>

      {trashedPeople.length === 0 ? (
        <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>
          Trash is empty. Deleted contacts will appear here and can be restored anytime.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {trashedPeople.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
                background: 'var(--card2)', border: '1px solid var(--line2)',
              }}
            >
              <PersonAvatar name={p.name} color={p.color} path={p.photo_path} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tx)' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                  {p.category} {p.deleted_at && `· Deleted ${new Date(p.deleted_at).toLocaleDateString()}`}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                <button
                  type="button"
                  onClick={() => {
                    restore.mutate({ id: p.id });
                    toast(`Restored ${p.name}`);
                  }}
                  className="hov k-squish"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8,
                    background: 'var(--card)', border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 800,
                    color: 'var(--pal-mint)', cursor: 'pointer',
                  }}
                >
                  <Icon name="undo" size={12} color="var(--pal-mint)" /> Restore
                </button>

                <button
                  type="button"
                  onClick={() => void confirmAsk(`Permanently delete ${p.name}?`, {
                    message: 'This cannot be undone.', confirmLabel: 'Delete Forever', danger: true,
                  }).then((yes) => {
                    if (yes) {
                      hardDel.mutate({ id: p.id });
                      toast(`Deleted ${p.name} permanently`);
                    }
                  })}
                  className="hov k-squish"
                  title="Delete permanently"
                  style={{
                    padding: '6px 10px', borderRadius: 8, background: 'transparent',
                    border: '1px solid var(--line2)', color: 'var(--tx3)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const detail = person && (
    <PersonCard
      key={person.id}
      person={person} cats={CATS} hueFor={hueFor} phone={phone}
      onPatch={(patch) => save.mutate({ id: person.id, patch })}
      onDelete={() => deleteWithUndo(person)}
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
        viewTab === 'trash' ? (
          <>
            <button onClick={() => setViewTab('roster')} className="hov"
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)', marginBottom: 12 }}>
              <Icon name="back" size={14} color="var(--tx2)" /> Back to People
            </button>
            {trashView}
          </>
        ) : person ? (
          <>
            <button onClick={() => setSel(null)} className="hov"
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)', marginBottom: 12 }}>
              <Icon name="back" size={14} color="var(--tx2)" /> People
            </button>
            {detail}
          </>
        ) : rosterList
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(230px, 280px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          {rosterList}
          {viewTab === 'trash'
            ? trashView
            : (detail ?? <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: 20 }}>Pick someone to inspect.</div>)}
        </div>
      )}
    </div>
  );
}
