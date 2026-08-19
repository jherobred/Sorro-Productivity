'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon, type IconName } from '@/components/Icon';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { RowActions } from '@/components/MoneyRows';
import { useRealtime } from '@/lib/realtime';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useLongPress } from '@/lib/useLongPress';
import { useDragCard } from '@/lib/useDragCard';
import { ContextMenu } from '@/components/ContextMenu';

/** Ported from Basedly.dc.html markup 1549–1702. */

type Project = { id: string; name: string; tag: string; color: string; progress: number; deadline: string | null; position: number };
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

const NEW_PROJ = defineMutation('proj.new', async (v: { id: string; name: string; color: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_projects').insert({ ...v, user_id });
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
const EDIT_PROJ = defineMutation('proj.edit', async (v: { id: string; patch: { name?: string; tag?: string } }) => {
  const { error } = await supabase.from('bd_projects').update(v.patch).eq('id', v.id);
  if (error) throw error;
});
const EDIT_CARD = defineMutation('proj.editCard', async (v: { id: string; title: string }) => {
  const { error } = await supabase.from('bd_cards').update({ title: v.title }).eq('id', v.id);
  if (error) throw error;
});
const NEW_CARD = defineMutation('proj.newCard', async (v: { project_id: string; title: string; col: string; color: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_cards').insert({ ...v, user_id });
  if (error) throw error;
});
const REORDER_PROJ = defineMutation('proj.reorder', async (v: { id: string; position: number }) => {
  const { error } = await supabase.from('bd_projects').update({ position: v.position }).eq('id', v.id);
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
  /** `proj:<id>` while renaming a folder, 'proj:new' while naming a new one. */
  const [editing, setEditing] = useState<string | null>(null);

  const settle = () => { for (const k of [PROJ, CARDS, CMTS]) void qc.invalidateQueries({ queryKey: k }); };

  const { data: projects = [] } = useQuery({
    queryKey: PROJ,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase.from('bd_projects')
        .select('id,name,tag,color,progress,deadline,position').is('deleted_at', null).order('position');
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

  const newProj = useMutation<unknown, Error, { id: string; name: string; color: string }>({
    mutationKey: NEW_PROJ,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Project[]>(PROJ) ?? [];
      queryClient.setQueryData<Project[]>(PROJ, [
        ...prev,
        { id: v.id, name: v.name, tag: '', color: v.color, progress: 0, deadline: null, position: prev.length },
      ]);
    },
    onSettled: settle,
  });
  const editProj = useMutation<unknown, Error, { id: string; patch: { name?: string; tag?: string } }>({
    mutationKey: EDIT_PROJ,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Project[]>(PROJ) ?? [];
      queryClient.setQueryData<Project[]>(PROJ, prev.map((x) => (x.id === v.id ? { ...x, ...v.patch } : x)));
    },
    onSettled: settle,
  });
  const editCard = useMutation<unknown, Error, { id: string; title: string }>({
    mutationKey: EDIT_CARD,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Card[]>(CARDS) ?? [];
      queryClient.setQueryData<Card[]>(CARDS, prev.map((c) => (c.id === v.id ? { ...c, title: v.title } : c)));
    },
    onSettled: settle,
  });
  const delProj = useMutation<unknown, Error, { id: string }, Project[]>({
    mutationKey: DEL_PROJ,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Project[]>(PROJ) ?? [];
      queryClient.setQueryData<Project[]>(PROJ, prev.filter((x) => x.id !== v.id));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(PROJ, ctx); },
    onSettled: settle,
  });

  /**
   * Folders sort by drag: sideways past 100px flings the card away and archives
   * it (undoable from the toast), up or down swaps it with its neighbour.
   */
  const cardDrag = useDragCard({
    onDismiss: (id) => {
      const p = projects.find((x) => x.id === id);
      delProj.mutate({ id });
      toast(`${p?.name ?? 'Project'} archived`, () => restoreProj.mutate({ id, row: p }));
    },
    onReorder: (id, dir) => {
      const order = shown.map((x) => x.id);
      const i = order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return;
      [order[i], order[j]] = [order[j], order[i]];
      order.forEach((pid, n) => reorderProj.mutate({ id: pid, position: n }));
      setSort('Custom');
      toast('Custom order saved');
    },
  });
  // Undo carries the row it removed, so the folder comes back the moment you
  // press it rather than one refetch later.
  const restoreProj = useMutation<unknown, Error, { id: string; row?: Project }>({
    mutationKey: RESTORE_PROJ,
    onMutate: (v) => {
      if (!v.row) return;
      const prev = queryClient.getQueryData<Project[]>(PROJ) ?? [];
      if (prev.some((x) => x.id === v.id)) return;
      queryClient.setQueryData<Project[]>(PROJ, [...prev, v.row].sort((a, b) => a.position - b.position));
    },
    onSettled: settle,
  });
  const reorderProj = useMutation<unknown, Error, { id: string; position: number }>({
    mutationKey: REORDER_PROJ,
    onMutate: (v) => {
      // Optimistic, so the folders settle into their new order on release
      // rather than after a round trip per card.
      const prev = queryClient.getQueryData<Project[]>(PROJ) ?? [];
      queryClient.setQueryData<Project[]>(PROJ, prev.map((p) => (p.id === v.id ? { ...p, position: v.position } : p)));
    },
    onSettled: settle,
  });
  const newCard = useMutation<unknown, Error, { project_id: string; title: string; col: string; color: string }>({ mutationKey: NEW_CARD, onSettled: settle });
  const restoreCard = useMutation<unknown, Error, { id: string; row?: Card }>({
    mutationKey: RESTORE_CARD,
    onMutate: (v) => {
      if (!v.row) return;
      const prev = queryClient.getQueryData<Card[]>(CARDS) ?? [];
      if (prev.some((x) => x.id === v.id)) return;
      queryClient.setQueryData<Card[]>(CARDS, [...prev, v.row].sort((a, b) => a.position - b.position));
    },
    onSettled: settle,
  });
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
        // Custom is the drag order, so it has to read `position` — leaving it
        // at 0 meant a reorder saved fine and then rendered in the old order.
        : a.position - b.position);

  const proj = projects.find((p) => p.id === open);
  const mine = cards.filter((c) => c.project_id === open);

  const pad = phone ? '14px 14px 24px' : '20px 24px 28px';

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
          <button onClick={() => setEditing('proj:new')} className="acc k-squish"
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', borderRadius: 11, background: 'var(--acc)', color: '#0C0F16', fontSize: 12, fontWeight: 800 }}>
            <Icon name="plus" size={15} color="#0C0F16" />New project
          </button>
        </div>

        {/* A folder is a folder. The card that used to sit behind each one
            added a border, a shadow and 15px of padding to say "this is a
            thing you can click", which the folder already said by itself —
            and it cost half the row's width, so six folders filled a screen
            that now holds fifteen. Finder, Explorer and Drive all draw the
            icon on the bare background; so do we. */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(${phone ? 104 : 124}px,1fr))`, gap: phone ? 6 : 10 }}>
          {shown.map((p) => {
            const dragProps = cardDrag.propsFor(p.id);
            const n = cards.filter((c) => c.project_id === p.id).length;
            if (editing === `proj:${p.id}`) {
              return (
                <NameField key={p.id} initial={p.name} color={p.color} phone={phone}
                  onCancel={() => setEditing(null)}
                  onSave={(name) => { editProj.mutate({ id: p.id, patch: { name } }); setEditing(null); toast('Folder renamed'); }} />
              );
            }
            return (
            <button key={p.id} onClick={() => { if (cardDrag.wasDrag()) return; setOpen(p.id); setView('board'); }}
              onDoubleClick={() => setEditing(`proj:${p.id}`)}
              onPointerDown={(e) => { dragProps.onPointerDown(e); lp.start(e, 'project', p.id, p.name); }}
              onContextMenu={(e) => lp.onContextMenu(e, 'project', p.id, p.name)}
              className={`hov k-squish ${dragProps.className}`}
              title={`${p.name} — ${n} card${n === 1 ? '' : 's'}. Drag sideways to archive, up or down to reorder.`}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                padding: phone ? '10px 4px' : '12px 6px', borderRadius: 12, textAlign: 'center',
                ...dragProps.style,
              }}>
              <FolderIcon color={p.color} count={n} size={phone ? 52 : 60} />
              <span style={{ width: '100%', fontSize: 11.5, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--tx)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
                {p.name}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                {p.deadline ? new Date(p.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : `${p.progress}%`}
              </span>
            </button>
            );
          })}

          {editing === 'proj:new' && (
            <NameField initial="" color={PAL.amber} phone={phone} placeholder="Folder name"
              onCancel={() => setEditing(null)}
              onSave={(name) => {
                newProj.mutate({ id: crypto.randomUUID(), name, color: PAL.amber });
                setEditing(null);
                toast(`Created \u201C${name}\u201D`);
              }} />
          )}
        </div>

        {shown.length === 0 && <div style={{ padding: '44px 2px', fontSize: 12.5, color: 'var(--tx3)' }}>Nothing matches that search.</div>}

        {lp.ctx && (
          <ContextMenu x={lp.ctx.x} y={lp.ctx.y} kind="project" label={lp.ctx.label}
            accent={prefs.accent} dark={prefs.theme === 'dark'} onClose={lp.close}
            items={[
              { label: 'Open', icon: 'proj', run: () => setOpen(lp.ctx!.id) },
              { label: 'Rename', icon: 'edit', run: () => setEditing(`proj:${lp.ctx!.id}`) },
              { label: 'Delete', icon: 'trash', danger: true, run: () => { const id = lp.ctx!.id; const row = projects.find((x) => x.id === id); delProj.mutate({ id }); toast('Project deleted', () => restoreProj.mutate({ id, row })); } },
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
                  {editing === `card:${c.id}` ? (
                    <CardTitle initial={c.title}
                      onCancel={() => setEditing(null)}
                      onSave={(t) => { editCard.mutate({ id: c.id, title: t }); setEditing(null); toast('Card updated'); }} />
                  ) : (
                    <div onDoubleClick={() => setEditing(`card:${c.id}`)}
                      style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, marginBottom: 9, textWrap: 'pretty' }}>{c.title}</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: PAL.indigo, display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, color: '#0C0F16' }}>MR</div>
                    <span style={{ marginLeft: 'auto' }}>
                      <RowActions label={c.title}
                        onEdit={() => setEditing(`card:${c.id}`)}
                        onDelete={() => { delCard.mutate({ id: c.id }); toast(`Deleted \u201C${c.title}\u201D`, () => restoreCard.mutate({ id: c.id, row: c })); }} />
                    </span>
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
                  {editing === `card:${c.id}` ? (
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <CardTitle initial={c.title}
                        onCancel={() => setEditing(null)}
                        onSave={(t) => { editCard.mutate({ id: c.id, title: t }); setEditing(null); toast('Card updated'); }} />
                    </span>
                  ) : (
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600 }}>{c.title}</span>
                  )}
                  <RowActions label={c.title}
                    onEdit={() => setEditing(`card:${c.id}`)}
                    onDelete={() => { delCard.mutate({ id: c.id }); toast(`Deleted \u201C${c.title}\u201D`, () => restoreCard.mutate({ id: c.id, row: c })); }} />
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

/** A card's title, edited where it sits. */
function CardTitle({ initial, onSave, onCancel }: {
  initial: string; onSave: (t: string) => void; onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <input autoFocus value={v} onChange={(e) => setV(e.target.value)}
      onBlur={() => (v.trim() ? onSave(v.trim()) : onCancel())}
      onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) onSave(v.trim()); if (e.key === 'Escape') onCancel(); }}
      style={{ width: '100%', minHeight: 32, padding: '6px 8px', marginBottom: 9, borderRadius: 8, border: '1px solid var(--acc)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 12.5, fontWeight: 600 }} />
  );
}

/**
 * The folder glyph itself: back plate, ruled paper, front flap, and the card
 * count printed on the flap where a paper folder would have its label.
 */
function FolderIcon({ color, count, size }: { color: string; count: number; size: number }) {
  const h = Math.round(size * 0.78);
  return (
    <span style={{ position: 'relative', width: size, height: h, display: 'block', flex: 'none' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, width: size * 0.42, height: h * 0.17, borderRadius: '4px 4px 0 0', background: `color-mix(in srgb, ${color} 70%, #000)` }} />
      <span style={{ position: 'absolute', left: 0, top: h * 0.13, right: 0, bottom: h * 0.2, borderRadius: 6, background: 'var(--card2)', border: '1px solid var(--line2)', padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ height: 2.5, width: '76%', borderRadius: 2, background: 'var(--line2)' }} />
        <span style={{ height: 2.5, width: '54%', borderRadius: 2, background: 'var(--line2)' }} />
      </span>
      <span style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: h * 0.6,
        borderRadius: '3px 7px 7px 7px', display: 'grid', placeItems: 'center',
        background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 62%, #000))`,
      }}>
        {count > 0 && (
          <span style={{ fontSize: 10, fontWeight: 800, color: '#0C0F16', opacity: 0.72, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
        )}
      </span>
    </span>
  );
}

/** Rename in place, on the tile, the way a file manager does it. */
function NameField({ initial, color, phone, placeholder, onSave, onCancel }: {
  initial: string; color: string; phone: boolean; placeholder?: string;
  onSave: (name: string) => void; onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: phone ? '10px 4px' : '12px 6px' }}>
      <FolderIcon color={color} count={0} size={phone ? 52 : 60} />
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        onBlur={() => (v.trim() ? onSave(v.trim()) : onCancel())}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && v.trim()) onSave(v.trim());
          if (e.key === 'Escape') onCancel();
        }}
        style={{
          width: '100%', minHeight: 30, padding: '5px 7px', borderRadius: 7, textAlign: 'center',
          border: '1px solid var(--acc)', background: 'var(--card)', color: 'var(--tx)', fontSize: 11.5, fontWeight: 600,
        }} />
    </div>
  );
}
