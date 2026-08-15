'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon, type IconName } from '@/components/Icon';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { useRealtime } from '@/lib/realtime';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useLongPress } from '@/lib/useLongPress';
import { ContextMenu } from '@/components/ContextMenu';

/** Ported from Basedly.dc.html markup 1549–1702. */

type Project = { id: string; name: string; tag: string; color: string; progress: number; deadline: string | null };
type Card = { id: string; project_id: string; title: string; col: string; color: string; position: number };
type Comment = { id: string; project_id: string; author_id: string; body: string; created_at: string };

const PROJ = ['projects'] as const;
const CARDS = ['cards'] as const;
const CMTS = ['project_comments'] as const;

const COLS: { id: string; n: string }[] = [
  { id: 'backlog', n: 'Backlog' }, { id: 'doing', n: 'Doing' }, { id: 'done', n: 'Done' },
];
const VIEWS = ['board', 'list', 'timeline'] as const;
type View = (typeof VIEWS)[number];
const VIEW_ICON: Record<View, IconName> = { board: 'grid', list: 'agenda', timeline: 'week' };

const KICKER: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' };

const NEW_PROJ = defineMutation('proj.new', async (v: { name: string; color: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_projects').insert({ user_id, name: v.name, color: v.color });
  if (error) throw error;
});
const DEL_PROJ = defineMutation('proj.del', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_projects').update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});
const RESTORE_PROJ = defineMutation('proj.restore', async (v: { id: string }) => {
  const { error } = await supabase.rpc('bd_restore', { p_table: 'bd_projects', p_id: v.id });
  if (error) throw error;
});
const NEW_CARD = defineMutation('proj.newCard', async (v: { project_id: string; title: string; col: string; color: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_cards').insert({ ...v, user_id });
  if (error) throw error;
});
const MOVE_CARD = defineMutation('proj.moveCard', async (v: { id: string; col: string; position: number }) => {
  const { error } = await supabase.from('bd_cards').update({ col: v.col, position: v.position }).eq('id', v.id);
  if (error) throw error;
});
const DEL_CARD = defineMutation('proj.delCard', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_cards').update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});
const RESTORE_CARD = defineMutation('proj.restoreCard', async (v: { id: string }) => {
  const { error } = await supabase.rpc('bd_restore', { p_table: 'bd_cards', p_id: v.id });
  if (error) throw error;
});
const ADD_CMT = defineMutation('proj.addComment', async (v: { project_id: string; body: string }) => {
  const author_id = await currentUserId();
  const { error } = await supabase.from('bd_project_comments').insert({ ...v, author_id });
  if (error) throw error;
});

export default function ProjectsPage() {
  const { phone } = useLayout();
  const { prefs } = usePrefs();
  const qc = useQueryClient();
  const lp = useLongPress();

  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<View>('board');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'Custom' | 'Name' | 'Cards'>('Custom');
  const [dragId, setDragId] = useState<string | null>(null);

  const settle = () => { for (const k of [PROJ, CARDS, CMTS]) void qc.invalidateQueries({ queryKey: k }); };

  const { data: projects = [] } = useQuery({
    queryKey: PROJ,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase.from('bd_projects')
        .select('id,name,tag,color,progress,deadline').is('deleted_at', null).order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: cards = [] } = useQuery({
    queryKey: CARDS,
    queryFn: async (): Promise<Card[]> => {
      const { data, error } = await supabase.from('bd_cards')
        .select('id,project_id,title,col,color,position').is('deleted_at', null).order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: comments = [] } = useQuery({
    queryKey: [...CMTS, open],
    enabled: !!open,
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase.from('bd_project_comments')
        .select('id,project_id,author_id,body,created_at').eq('project_id', open!).is('deleted_at', null).order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });

  useRealtime('bd_cards', CARDS);
  useRealtime('bd_project_comments', CMTS);

  const newProj = useMutation<unknown, Error, { name: string; color: string }>({ mutationKey: NEW_PROJ, onSettled: settle });
  const delProj = useMutation<unknown, Error, { id: string }>({ mutationKey: DEL_PROJ, onSettled: settle });
  const restoreProj = useMutation<unknown, Error, { id: string }>({ mutationKey: RESTORE_PROJ, onSettled: settle });
  const newCard = useMutation<unknown, Error, { project_id: string; title: string; col: string; color: string }>({ mutationKey: NEW_CARD, onSettled: settle });
  const restoreCard = useMutation<unknown, Error, { id: string }>({ mutationKey: RESTORE_CARD, onSettled: settle });
  const addCmt = useMutation<unknown, Error, { project_id: string; body: string }>({ mutationKey: ADD_CMT, onSettled: settle });

  const moveCard = useMutation({
    mutationKey: MOVE_CARD,
    onMutate: (v: { id: string; col: string; position: number }) => {
      const prev = queryClient.getQueryData<Card[]>(CARDS) ?? [];
      queryClient.setQueryData<Card[]>(CARDS, prev.map((c) => (c.id === v.id ? { ...c, col: v.col, position: v.position } : c)));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(CARDS, ctx); },
    onSettled: settle,
  });
  const delCard = useMutation({
    mutationKey: DEL_CARD,
    onMutate: (v: { id: string }) => {
      const prev = queryClient.getQueryData<Card[]>(CARDS) ?? [];
      queryClient.setQueryData<Card[]>(CARDS, prev.filter((c) => c.id !== v.id));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(CARDS, ctx); },
    onSettled: settle,
  });

  const shown = projects
    .filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => sort === 'Name' ? a.name.localeCompare(b.name)
      : sort === 'Cards' ? cards.filter((c) => c.project_id === b.id).length - cards.filter((c) => c.project_id === a.id).length
        : 0);

  const proj = projects.find((p) => p.id === open);
  const mine = cards.filter((c) => c.project_id === open);

  const pad = phone ? '16px 14px 26px' : '20px 24px 30px';

  if (!proj) {
    return (
      <div style={{ padding: pad }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', borderRadius: 11, background: 'var(--card)', border: '1px solid var(--line)', flex: '1 1 220px', minWidth: 0 }}>
            <Icon name="search" size={14} color="var(--tx3)" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search folders"
              style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, color: 'var(--tx)' }} />
          </div>
          <button onClick={() => setSort(sort === 'Custom' ? 'Name' : sort === 'Name' ? 'Cards' : 'Custom')} className="hov" title="Change sort"
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 12px', borderRadius: 11, border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)' }}>
            <Icon name="sort" size={14} color="var(--tx2)" />{sort}
          </button>
          <button onClick={() => newProj.mutate({ name: 'New project', color: PAL.amber })} className="acc"
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', borderRadius: 11, background: 'var(--acc)', color: '#0C0F16', fontSize: 12, fontWeight: 800 }}>
            <Icon name="plus" size={15} color="#0C0F16" />New project
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14 }}>
          {shown.map((p) => (
            <button key={p.id} onClick={() => { setOpen(p.id); setView('board'); }} className="tilt"
              onPointerDown={(e) => lp.start(e, 'project', p.id, p.name)}
              onContextMenu={(e) => lp.onContextMenu(e, 'project', p.id, p.name)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                padding: '16px 15px 15px', borderRadius: 16, background: 'var(--card)',
                border: '1px solid var(--line)', boxShadow: 'var(--sh)', textAlign: 'left',
              }}>
              {/* Layered folder: back plate, paper with three rules, front flap. */}
              <span style={{ position: 'relative', width: 74, height: 56, display: 'block' }}>
                <span style={{ position: 'absolute', left: 0, top: 0, width: 30, height: 9, borderRadius: '5px 5px 0 0', background: `color-mix(in srgb, ${p.color} 70%, #000)` }} />
                <span style={{ position: 'absolute', left: 0, top: 7, right: 0, bottom: 10, borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--line2)', padding: '7px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ height: 3, width: '76%', borderRadius: 2, background: 'var(--line2)' }} />
                  <span style={{ height: 3, width: '58%', borderRadius: 2, background: 'var(--line2)' }} />
                  <span style={{ height: 3, width: '40%', borderRadius: 2, background: 'var(--line2)' }} />
                </span>
                <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 34, borderRadius: '4px 8px 8px 8px', background: `linear-gradient(160deg, ${p.color}, color-mix(in srgb, ${p.color} 62%, #000))` }} />
              </span>

              <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13, width: '100%' }}>
                <span style={{ minWidth: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                {p.tag && <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 9.5, fontWeight: 800, color: p.color, background: `color-mix(in srgb, ${p.color} 16%, transparent)` }}>{p.tag}</span>}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, width: '100%' }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--tx2)' }}>{cards.filter((c) => c.project_id === p.id).length} cards</span>
                <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 500, color: 'var(--tx3)' }}>
                  {p.deadline ? new Date(p.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : `${p.progress}%`}
                </span>
              </span>
            </button>
          ))}
        </div>

        {shown.length === 0 && <div style={{ padding: '44px 2px', fontSize: 12.5, color: 'var(--tx3)' }}>Nothing matches that search.</div>}

        {lp.ctx && (
          <ContextMenu x={lp.ctx.x} y={lp.ctx.y} kind="project" label={lp.ctx.label}
            accent={prefs.accent} dark={prefs.theme === 'dark'} onClose={lp.close}
            items={[
              { label: 'Open', icon: 'proj', run: () => setOpen(lp.ctx!.id) },
              { label: 'Delete', icon: 'trash', danger: true, run: () => { const id = lp.ctx!.id; delProj.mutate({ id }); toast('Project deleted', () => restoreProj.mutate({ id })); } },
            ]} />
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: pad }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={() => setOpen(null)} className="hov" title="All projects"
          style={{ width: 32, height: 32, flex: 'none', borderRadius: 10, border: '1px solid var(--line2)', display: 'grid', placeItems: 'center' }}>
          <Icon name="back" size={15} color="var(--tx2)" />
        </button>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.025em' }}>{proj.name}</div>
        <div style={{ display: 'flex' }}>
          {[{ i: 'MR', c: PAL.indigo }, { i: 'JL', c: PAL.mint }, { i: 'RT', c: PAL.amber }].map((m, i) => (
            <div key={m.i} style={{
              width: 24, height: 24, borderRadius: '50%', background: m.c, marginLeft: i ? -7 : 0,
              border: '2px solid var(--bg)', display: 'grid', placeItems: 'center', fontSize: 8.5, fontWeight: 700, color: '#0C0F16',
            }}>{m.i}</div>
          ))}
        </div>
        <button onClick={() => setView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length])} className="acc" title="Switch view"
          style={{ marginLeft: 'auto', width: 38, height: 38, borderRadius: 19, background: 'var(--acc)', display: 'grid', placeItems: 'center' }}>
          <Icon name={VIEW_ICON[view]} size={16} color="#0C0F16" />
        </button>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx3)', width: 62, textTransform: 'capitalize' }}>{view}</div>
      </div>

      {view === 'board' && (
        <div className="hbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 6 }}>
          {COLS.map((col) => (
            <div key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId) { moveCard.mutate({ id: dragId, col: col.id, position: mine.filter((c) => c.col === col.id).length }); setDragId(null); } }}
              style={{
                flex: phone ? 'none' : 1, width: phone ? 196 : 'auto', minWidth: 0,
                display: 'flex', flexDirection: 'column', gap: 9, padding: 11, borderRadius: 14,
                background: 'var(--panel)', border: '1px solid var(--line)', transition: 'background .2s, border-color .2s',
              }}>
              <div style={{ display: 'flex', alignItems: 'baseline', padding: '0 2px 4px' }}>
                <div style={KICKER}>{col.n}</div>
                <div style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--tx3)' }}>{mine.filter((c) => c.col === col.id).length}</div>
              </div>

              {mine.filter((c) => c.col === col.id).map((c) => (
                <div key={c.id} draggable onDragStart={() => setDragId(c.id)} onDragEnd={() => setDragId(null)}
                  style={{
                    background: 'var(--card)', borderRadius: 12, padding: '11px 12px',
                    boxShadow: dragId === c.id ? 'var(--shl)' : 'var(--sh)',
                    borderLeft: `2.5px solid ${c.color}`, cursor: dragId === c.id ? 'grabbing' : 'grab',
                    userSelect: 'none', opacity: dragId === c.id ? 0.65 : 1,
                    transform: dragId === c.id ? 'scale(1.03)' : 'scale(1)',
                    transition: dragId === c.id ? 'none' : 'transform .42s cubic-bezier(0.34,1.56,0.64,1), opacity .42s, box-shadow .2s',
                  }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, marginBottom: 9, textWrap: 'pretty' }}>{c.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: PAL.indigo, display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, color: '#0C0F16' }}>MR</div>
                    <button onClick={() => { delCard.mutate({ id: c.id }); toast(`Deleted “${c.title}”`, () => restoreCard.mutate({ id: c.id })); }}
                      style={{ marginLeft: 'auto', padding: 3 }} aria-label="Delete card">
                      <Icon name="trash" size={12} color="var(--tx3)" />
                    </button>
                  </div>
                </div>
              ))}

              <AddCard onAdd={(t) => newCard.mutate({ project_id: proj.id, title: t, col: col.id, color: proj.color })} />
            </div>
          ))}
        </div>
      )}

      {view === 'list' && (
        <div style={{ background: 'var(--card)', borderRadius: 16, padding: '15px 16px', boxShadow: 'var(--sh)' }}>
          {COLS.map((col) => (
            <div key={col.id} style={{ marginBottom: 14 }}>
              <div style={KICKER}>{col.n}</div>
              {mine.filter((c) => c.col === col.id).map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ width: 3, height: 20, borderRadius: 2, background: c.color }} />
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{c.title}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {view === 'timeline' && (
        <div style={{ background: 'var(--card)', borderRadius: 16, padding: '15px 16px', boxShadow: 'var(--sh)' }}>
          {mine.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0' }}>
              <span style={{ fontSize: 10.5, color: 'var(--tx3)', width: 34, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
              <div style={{ flex: 1, height: 22, borderRadius: 6, background: `color-mix(in srgb, ${c.color} 30%, var(--card2))`, display: 'flex', alignItems: 'center', padding: '0 9px', fontSize: 11.5, fontWeight: 600 }}>
                {c.title}
              </div>
            </div>
          ))}
        </div>
      )}

      <section style={{ marginTop: 22 }}>
        <div style={{ ...KICKER, marginBottom: 9 }}>Thread</div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--sh)', overflow: 'hidden' }}>
          {comments.map((c) => (
            <div key={c.id} className="lensrow" style={{ padding: '11px 14px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, textWrap: 'pretty' }}>{c.body}</div>
              <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 3, fontWeight: 600 }}>
                {new Date(c.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>
          ))}
          <AddComment onAdd={(b) => addCmt.mutate({ project_id: proj.id, body: b })} />
        </div>
      </section>
    </div>
  );
}

function AddCard({ onAdd }: { onAdd: (t: string) => void }) {
  const [v, setV] = useState('');
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setV(''); }, [editing]);

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="hov"
        style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px dashed var(--line2)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx3)' }}>
        <Icon name="plus" size={13} color="var(--tx3)" />Add card
      </button>
    );
  }
  return (
    <input autoFocus value={v} onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); } if (e.key === 'Escape') setEditing(false); }}
      onBlur={() => { if (v.trim()) onAdd(v.trim()); setEditing(false); }}
      placeholder="Card title"
      style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card)', color: 'var(--tx)', fontSize: 12 }} />
  );
}

function AddComment({ onAdd }: { onAdd: (b: string) => void }) {
  const [v, setV] = useState('');
  const submit = () => { const b = v.trim(); if (!b) return; onAdd(b); setV(''); };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px' }}>
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Say something" style={{ flex: 1, fontSize: 13.5, color: 'var(--tx)', minHeight: 26 }} />
      <button onClick={submit} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accTx)', padding: '5px 8px', minHeight: 28 }}>Post</button>
    </div>
  );
}
