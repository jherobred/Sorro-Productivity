'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon, type IconName } from '@/components/Icon';
import { ContextMenu, type CtxGroup } from '@/components/ContextMenu';
import { RowsSkeleton } from '@/components/Skeleton';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { ask, confirmAsk } from '@/lib/ask';
import { PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
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

/** Typed-but-unwritten updates overlay to prevent refetches from erasing user edits */
const pendingPeople = new Map<string, Partial<Person>>();
const markPendingPerson = (id: string, patch: Partial<Person>) => {
  const existing = pendingPeople.get(id) ?? {};
  pendingPeople.set(id, { ...existing, ...patch });
};
const clearPendingPerson = (id: string) => {
  pendingPeople.delete(id);
};

const overlayPeople = (rows: Person[]): Person[] => {
  const map = new Map<string, Person>();
  for (const r of rows) map.set(r.id, r);

  // Overlay in-flight local updates
  for (const [id, patch] of pendingPeople.entries()) {
    if (map.has(id)) {
      map.set(id, { ...map.get(id)!, ...patch });
    } else if (patch.name) {
      // New person not yet returned by select
      map.set(id, {
        id,
        name: patch.name || 'Untitled Person',
        category: patch.category || CATS[0],
        color: patch.color || hueFor(CATS[0]),
        email: patch.email || '',
        phone: patch.phone || null,
        note: patch.note || '',
        photo_path: patch.photo_path || null,
        basedly_handle: patch.basedly_handle || null,
        links: patch.links || [],
        gallery: patch.gallery || [],
        osint: patch.osint || {},
        deleted_at: null,
        ...patch,
      });
    }
  }

  return Array.from(map.values());
};

const ADD = defineMutation('people.add', async (v: { id: string; name: string; category: string; color: string; email: string }) => {
  const user_id = await currentUserId();
  markPendingPerson(v.id, v);
  const { error } = await supabase.from('bd_people').upsert({
    ...v,
    user_id,
    phone: null,
    note: '',
    photo_path: null,
    basedly_handle: null,
    links: [],
    gallery: [],
    osint: {},
    deleted_at: null,
  }, { onConflict: 'id' });
  if (error) throw error;
  clearPendingPerson(v.id);
});

const SAVE = defineMutation('people.save', async (v: { id: string; patch: Partial<Person> }) => {
  markPendingPerson(v.id, v.patch);
  // Perform an atomic update on existing row so ONLY changed fields are modified without resetting photo_path or defaults
  const { data, error } = await supabase.from('bd_people').update(v.patch).eq('id', v.id).select('id');
  if (error) throw error;

  // Fallback: If row doesn't exist on server yet (e.g. offline created), upsert the full merged cache record
  if (!data || data.length === 0) {
    const user_id = await currentUserId();
    const prev = queryClient.getQueryData<Person[]>(KEY) ?? [];
    const full = prev.find((p) => p.id === v.id);
    const { error: insErr } = await supabase.from('bd_people').upsert({
      id: v.id,
      user_id,
      name: full?.name || 'Untitled Person',
      category: full?.category || CATS[0],
      color: full?.color || hueFor(CATS[0]),
      email: full?.email || '',
      phone: full?.phone || null,
      note: full?.note || '',
      photo_path: full?.photo_path || null,
      basedly_handle: full?.basedly_handle || null,
      links: full?.links || [],
      gallery: full?.gallery || [],
      osint: full?.osint || {},
      deleted_at: full?.deleted_at || null,
      ...v.patch,
    }, { onConflict: 'id' });
    if (insErr) throw insErr;
  }
  clearPendingPerson(v.id);
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
  const { prefs } = usePrefs();
  const qc = useQueryClient();
  const settle = settler(qc, KEY);
  const { isFollowing, toggleFollow } = useFollows();

  const [viewTab, setViewTab] = useState<'roster' | 'trash'>('roster');
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxGroup[] } | null>(null);

  const { data: rawPeople = [], isPending } = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase.from('bd_people')
        .select('*').order('created_at');
      if (error) throw error;
      return (data ?? []) as Person[];
    },
  });

  const people = useMemo(() => overlayPeople(rawPeople), [rawPeople]);

  const activePeople = useMemo(() => people.filter((p) => !p.deleted_at), [people]);
  const trashedPeople = useMemo(() => people.filter((p) => !!p.deleted_at), [people]);

  useEffect(() => {
    if (viewTab === 'roster' && !sel && activePeople.length && !phone) {
      setSel(activePeople[0].id);
    }
  }, [activePeople, sel, phone, viewTab]);

  const add = useMutation<unknown, Error, { id: string; name: string; category: string; color: string; email: string }>({
    mutationKey: ADD,
    onMutate: (v) => {
      markPendingPerson(v.id, v);
      const prev = queryClient.getQueryData<Person[]>(KEY) ?? [];
      queryClient.setQueryData<Person[]>(KEY, [
        ...prev,
        {
          ...v,
          phone: null,
          note: '',
          photo_path: null,
          basedly_handle: null,
          links: [],
          gallery: [],
          osint: {},
          deleted_at: null,
        },
      ]);
    },
    onSettled: settle,
  });

  const save = useMutation({
    mutationKey: SAVE,
    onMutate: (v: { id: string; patch: Partial<Person> }) => {
      markPendingPerson(v.id, v.patch);
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
    const newRecord = { id, name: 'Untitled Person', category: CATS[0], color: hueFor(CATS[0]), email: '' };
    markPendingPerson(id, newRecord);
    add.mutate(newRecord);
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
    toast(`Moved ${p.name} to Bin`, () => restore.mutate({ id: p.id }));
  };

  const filteredPeople = activePeople.filter((p) => {
    if (!q.trim()) return true;
    const term = q.trim().toLowerCase();
    return p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term) || (p.email && p.email.toLowerCase().includes(term));
  });

  const isFollowed = person ? (isFollowing(person.name.toLowerCase().replace(/\s+/g, '')) || isFollowing(person.id)) : false;

  const personContextMenu = (p: Person): CtxGroup[] => {
    return [
      { items: [
        {
          label: 'Open Details',
          icon: 'people',
          run: () => { setSel(p.id); },
        },
        {
          label: 'Rename Contact',
          icon: 'edit',
          shortcut: 'F2',
          run: () => void ask('Rename contact', { initial: p.name, placeholder: 'Full Name' }).then((newName) => {
            if (newName && newName.trim() && newName.trim() !== p.name) {
              save.mutate({ id: p.id, patch: { name: newName.trim() } });
            }
          }),
        },
      ] },
      {
        label: 'Category',
        items: CATS.map((c) => ({
          label: c,
          icon: 'tag' as IconName,
          checked: p.category === c,
          run: () => save.mutate({ id: p.id, patch: { category: c, color: hueFor(c) } }),
        })),
      },
      {
        label: 'Info & Copy',
        items: [
          {
            label: 'Copy Contact Details',
            icon: 'copy',
            run: () => {
              const details = `${p.name}\nCategory: ${p.category}${p.email ? `\nEmail: ${p.email}` : ''}${p.phone ? `\nPhone: ${p.phone}` : ''}${p.basedly_handle ? `\nBasedly: @${p.basedly_handle}` : ''}`;
              void navigator.clipboard?.writeText(details);
              toast('Contact details copied');
            },
          },
        ],
      },
      {
        items: [
          {
            label: 'Move to Bin',
            icon: 'trash',
            danger: true,
            run: () => void confirmAsk(`Move “${p.name}” to Bin?`, {
              message: 'You can restore them anytime from the Bin tab.',
              confirmLabel: 'Move to Bin',
              danger: true,
            }).then((yes) => { if (yes) deleteWithUndo(p); }),
          },
        ],
      },
    ];
  };

  const rosterList = isPending ? (
    <RowsSkeleton rows={6} label="Loading your people" lead="circle" />
  ) : (
    <div data-tour="people-roster" style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      {/* Top Segment: All People vs Bin */}
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
          <span>Bin ({trashedPeople.length})</span>
        </button>

        <button onClick={create} className="hov k-squish" aria-label="Add someone" title="Add someone"
          style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer', flex: 'none' }}>
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

      {filteredPeople.map((p) => {
        return (
          <button
            key={p.id}
            onClick={() => setSel(p.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, label: p.name || 'Untitled Person', items: personContextMenu(p) });
            }}
            className="row"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 11, textAlign: 'left',
              background: p.id === sel ? 'var(--hov)' : 'transparent', border: 'none', cursor: 'pointer', width: '100%',
            }}
          >
            <PersonAvatar name={p.name} color={p.color} path={p.photo_path} size={32} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                display: 'block', fontSize: 13, fontWeight: 600,
                color: p.name === 'Untitled Person' ? 'var(--tx3)' : 'var(--tx)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{p.name}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>{p.category}</span>
            </span>
          </button>
        );
      })}

      {/* If search query matches contacts in bin, allow instant 1-click restore */}
      {q.trim() && trashedPeople.some((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())) && (
        <div style={{
          marginTop: 6, marginBottom: 8, padding: '10px 12px', borderRadius: 10,
          background: 'color-mix(in srgb, var(--pal-coral) 12%, var(--card2))',
          border: '1px solid color-mix(in srgb, var(--pal-coral) 30%, transparent)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--pal-coral)', letterSpacing: '.06em' }}>
            Found in Bin:
          </div>
          {trashedPeople.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).map((tp) => (
            <div key={tp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <PersonAvatar name={tp.name} color={tp.color} path={tp.photo_path} size={24} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tp.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  restore.mutate({ id: tp.id });
                  setSel(tp.id);
                  toast(`Restored ${tp.name}`);
                }}
                className="hov k-squish"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 6,
                  background: 'var(--card)', border: '1px solid var(--line2)',
                  fontSize: 11, fontWeight: 800, color: 'var(--pal-mint)', cursor: 'pointer', flex: 'none',
                }}
              >
                <Icon name="undo" size={11} color="var(--pal-mint)" /> Restore
              </button>
            </div>
          ))}
        </div>
      )}

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
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: 'none', cursor: 'pointer',
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
            Bin ({trashedPeople.length})
          </span>
        </div>

        {trashedPeople.length > 0 && (
          <button
            type="button"
            onClick={() => void confirmAsk('Empty all people in Bin?', {
              message: 'This will permanently remove all deleted contacts in the bin.',
              confirmLabel: 'Empty Bin',
              danger: true,
            }).then((yes) => {
              if (yes) {
                emptyTrash.mutate({ ids: trashedPeople.map((p) => p.id) });
                toast('Bin emptied');
              }
            })}
            className="hov k-squish"
            style={{
              padding: '5px 10px', borderRadius: 7, border: '1px solid var(--line2)',
              background: 'var(--card2)', color: 'var(--pal-coral)', fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
            }}
          >
            Empty Bin
          </button>
        )}
      </div>

      {trashedPeople.length === 0 ? (
        <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>
          Bin is empty. Deleted contacts will appear here and can be restored anytime.
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
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          kind="project"
          label={menu.label}
          items={menu.items}
          onClose={() => setMenu(null)}
          accent={prefs.accent}
          dark={prefs.theme === 'dark'}
        />
      )}

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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 300px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          {rosterList}
          {viewTab === 'trash'
            ? trashView
            : (detail ?? <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: 20 }}>Pick someone to inspect.</div>)}
        </div>
      )}
    </div>
  );
}
