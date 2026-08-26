'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon, type IconName } from '@/components/Icon';
import { FolderGridSkeleton } from '@/components/Skeleton';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { RowActions } from '@/components/MoneyRows';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useLongPress } from '@/lib/useLongPress';
import { ContextMenu } from '@/components/ContextMenu';
import { FolderIcon, LookSheet, Cover } from '@/components/projects/Look';
import { PixelIconPickerModal } from '@/components/projects/PixelIconPickerModal';
import { PIXEL_FOLDER_ICONS } from '@/components/projects/PixelFolderIcons';
import { Crew } from '@/components/projects/Crew';
import { roomFor } from '@/lib/presence';
import { useProfiles, displayOf } from '@/lib/people';
import { currentUserId as whoAmI } from '@/lib/supabase';
import { settler } from '@/lib/settle';

/** Ported from Basedly.dc.html markup 1549–1702. */

type Project = {
  id: string; name: string; tag: string; color: string; progress: number;
  deadline: string | null; position: number;
  /** How the folder looks — see components/projects/Look.tsx and 0010. */
  icon: string; cover: string; user_id: string;
};
type Card = { id: string; project_id: string; title: string; col: string; color: string; position: number; assignee_id: string | null };
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
const EDIT_PROJ = defineMutation('proj.edit', async (v: { id: string; patch: { name?: string; tag?: string; icon?: string; cover?: string } }) => {
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

  type FolderSize = 'small' | 'medium' | 'large';
  const [folderSize, setFolderSizeState] = useState<FolderSize>('medium');
  const [pixelPicker, setPixelPicker] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('basedly_proj_folder_size') as FolderSize | null;
      if (saved && ['small', 'medium', 'large'].includes(saved)) {
        setFolderSizeState(saved);
      }
    } catch {}
  }, []);

  const setFolderSize = (size: FolderSize) => {
    setFolderSizeState(size);
    try {
      localStorage.setItem('basedly_proj_folder_size', size);
    } catch {}
    toast(`Folder size: ${size}`);
  };

  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<View>('board');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'Custom' | 'Name' | 'Cards'>('Custom');
  const [dragId, setDragId] = useState<string | null>(null);
  /** `proj:<id>` while renaming a folder, 'proj:new' while naming a new one. */
  const [editing, setEditing] = useState<string | null>(null);
  /** Which folder's icon and cover are being chosen. */
  const [look, setLook] = useState<string | null>(null);
  /** For card assignees: real names instead of the "MR" that used to be typed in. */
  const { data: profiles = {} } = useProfiles();
  const [me, setMe] = useState('');
  useEffect(() => { void whoAmI().then(setMe).catch(() => setMe('')); }, []);

  const settle = settler(qc, PROJ, CARDS, CMTS);

  const { data: projects = [], isPending: projectsPending } = useQuery({
    queryKey: PROJ,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase.from('bd_projects')
        .select('id,name,tag,color,progress,deadline,position,icon,cover,user_id')
        .is('deleted_at', null).order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: cards = [] } = useQuery({
    queryKey: CARDS,
    queryFn: async (): Promise<Card[]> => {
      const { data, error } = await supabase.from('bd_cards')
        .select('id,project_id,title,col,color,position,assignee_id').is('deleted_at', null).order('position');
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

  const newProj = useMutation<unknown, Error, { id: string; name: string; color: string }>({
    mutationKey: NEW_PROJ,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Project[]>(PROJ) ?? [];
      queryClient.setQueryData<Project[]>(PROJ, [
        ...prev,
        { id: v.id, name: v.name, tag: '', color: v.color, progress: 0, deadline: null, position: prev.length, icon: '', cover: '', user_id: '' },
      ]);
    },
    onSettled: settle,
  });
  const editProj = useMutation<unknown, Error, { id: string; patch: { name?: string; tag?: string; icon?: string; cover?: string } }>({
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

  const [folderDragId, setFolderDragId] = useState<string | null>(null);
  const [folderDropTargetId, setFolderDropTargetId] = useState<string | null>(null);

  const handleFolderReorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const order = shown.map((x) => x.id);
    const fromIdx = order.indexOf(fromId);
    const toIdx = order.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0) return;

    const newOrder = [...order];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);

    // Optimistic update
    const prev = queryClient.getQueryData<Project[]>(PROJ) ?? [];
    const idToPos = new Map(newOrder.map((id, idx) => [id, idx]));
    queryClient.setQueryData<Project[]>(
      PROJ,
      prev.map((p) => (idToPos.has(p.id) ? { ...p, position: idToPos.get(p.id)! } : p))
    );

    newOrder.forEach((pid, n) => reorderProj.mutate({ id: pid, position: n }));
    setSort('Custom');
    toast('Folders reordered');
  };

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
    const colWidth = folderSize === 'small' ? (phone ? 78 : 96) : folderSize === 'large' ? (phone ? 144 : 168) : (phone ? 104 : 124);
    const iconSize = folderSize === 'small' ? (phone ? 38 : 44) : folderSize === 'large' ? (phone ? 72 : 84) : (phone ? 52 : 60);
    const folderPad = folderSize === 'small' ? (phone ? '6px 2px' : '8px 4px') : folderSize === 'large' ? (phone ? '14px 6px' : '16px 8px') : (phone ? '10px 4px' : '12px 6px');
    const titleFont = folderSize === 'small' ? 10.5 : folderSize === 'large' ? 13 : 11.5;

    return (
      <div style={{ padding: pad }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', borderRadius: 11, background: 'var(--card)', border: '1px solid var(--line)', flex: '1 1 220px', minWidth: 0 }}>
            <Icon name="search" size={14} color="var(--tx3)" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search folders"
              style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, color: 'var(--tx)' }} />
          </div>

          {/* Size Switcher (Small / Medium / Large) */}
          <div style={{ display: 'inline-flex', alignItems: 'center', height: 36, padding: 3, borderRadius: 11, background: 'var(--card)', border: '1px solid var(--line2)', gap: 2 }}>
            {(['small', 'medium', 'large'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFolderSize(s)}
                className="k-squish"
                title={`Folder size: ${s}`}
                style={{
                  height: 28,
                  padding: '0 9px',
                  borderRadius: 8,
                  border: 'none',
                  background: folderSize === s ? 'var(--card2)' : 'transparent',
                  color: folderSize === s ? 'var(--tx)' : 'var(--tx3)',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: folderSize === s ? 'var(--sh)' : 'none',
                }}
              >
                {s === 'small' ? 'S' : s === 'medium' ? 'M' : 'L'}
              </button>
            ))}
          </div>

          <button onClick={() => setSort(sort === 'Custom' ? 'Name' : sort === 'Name' ? 'Cards' : 'Custom')} className="hov" title="Change sort"
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 12px', borderRadius: 11, border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)' }}>
            <Icon name="sort" size={14} color="var(--tx2)" />{sort}
          </button>

          <button onClick={() => {
            const id = crypto.randomUUID();
            newProj.mutate({ id, name: 'Untitled project', color: PAL.amber });
            setEditing(`proj:${id}`);
          }} className="acc k-squish"
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', borderRadius: 11, background: 'var(--acc)', color: '#0C0F16', fontSize: 12, fontWeight: 800 }}>
            <Icon name="plus" size={15} color="#0C0F16" />New project
          </button>
        </div>

        {projectsPending && <FolderGridSkeleton phone={phone} count={8} label="Loading your projects" />}

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(${colWidth}px,1fr))`, gap: phone ? 6 : 10 }}>
          {!projectsPending && shown.map((p) => {
            const n = cards.filter((c) => c.project_id === p.id).length;
            if (editing === `proj:${p.id}`) {
              return (
                <NameField key={p.id} initial={p.name} color={p.color} phone={phone}
                  onCancel={() => setEditing(null)}
                  onSave={(name) => { editProj.mutate({ id: p.id, patch: { name } }); setEditing(null); toast('Folder renamed'); }} />
              );
            }
            const isDragging = folderDragId === p.id;
            const isDropTarget = folderDropTargetId === p.id && folderDragId !== p.id;

            return (
            <button key={p.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', p.id);
                e.dataTransfer.effectAllowed = 'move';
                setFolderDragId(p.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (folderDropTargetId !== p.id) {
                  setFolderDropTargetId(p.id);
                }
              }}
              onDragLeave={() => {
                if (folderDropTargetId === p.id) {
                  setFolderDropTargetId(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const fromId = e.dataTransfer.getData('text/plain') || folderDragId;
                if (fromId) {
                  handleFolderReorder(fromId, p.id);
                }
                setFolderDragId(null);
                setFolderDropTargetId(null);
              }}
              onDragEnd={() => {
                setFolderDragId(null);
                setFolderDropTargetId(null);
              }}
              onClick={() => {
                if (folderDragId) return;
                setOpen(p.id);
                setView('board');
              }}
              onDoubleClick={() => setEditing(`proj:${p.id}`)}
              onPointerDown={(e) => lp.start(e, 'project', p.id, p.name)}
              onContextMenu={(e) => lp.onContextMenu(e, 'project', p.id, p.name)}
              className="hov k-squish"
              title={`${p.name} — ${n} card${n === 1 ? '' : 's'}. Drag to reorder.`}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                padding: folderPad, borderRadius: 12, textAlign: 'center',
                userSelect: 'none',
                cursor: isDragging ? 'grabbing' : 'grab',
                opacity: isDragging ? 0.45 : 1,
                transform: isDropTarget ? 'scale(1.06)' : 'scale(1)',
                border: isDropTarget ? '2px dashed var(--acc)' : '2px solid transparent',
                background: isDropTarget ? 'color-mix(in srgb, var(--acc) 12%, var(--card2))' : 'transparent',
                transition: 'transform .18s ease, border-color .18s ease, background .18s ease, opacity .18s ease',
              }}>
              <FolderIcon color={p.color} count={n} size={iconSize} icon={p.icon} />
              <span style={{ width: '100%', fontSize: titleFont, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--tx)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
                {p.name}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                {p.deadline ? new Date(p.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : `${p.progress}%`}
              </span>
            </button>
            );
          })}
        </div>

        {!projectsPending && shown.length === 0 && (
          <div style={{ padding: '44px 2px', fontSize: 12.5, color: 'var(--tx3)' }}>
            {projects.length === 0 ? 'No projects yet. Press New project.' : 'Nothing matches that search.'}
          </div>
        )}

        {look && (() => {
          const p = projects.find((x) => x.id === look);
          return p ? (
            <LookSheet name={p.name} icon={p.icon} cover={p.cover} color={p.color}
              onClose={() => setLook(null)}
              onSave={(patch) => editProj.mutate({ id: p.id, patch })} />
          ) : null;
        })()}

        {pixelPicker && (() => {
          const p = projects.find((x) => x.id === pixelPicker);
          return p ? (
            <PixelIconPickerModal
              projectName={p.name}
              currentIcon={p.icon}
              onSelect={(iconId) => {
                editProj.mutate({ id: p.id, patch: { icon: iconId } });
                toast('Folder icon updated');
              }}
              onClose={() => setPixelPicker(null)}
            />
          ) : null;
        })()}

        {lp.ctx && (
          <ContextMenu x={lp.ctx.x} y={lp.ctx.y} kind="project" label={lp.ctx.label}
            accent={prefs.accent} dark={prefs.theme === 'dark'} onClose={lp.close}
            items={[
              { label: 'Open', icon: 'proj', run: () => setOpen(lp.ctx!.id) },
              { label: 'Rename', icon: 'edit', run: () => setEditing(`proj:${lp.ctx!.id}`) },
              {
                label: 'Change icon', icon: 'spark',
                items: [
                  { label: 'Choose 8-bit shiny icon...', icon: 'spark', run: () => setPixelPicker(lp.ctx!.id) },
                  ...PIXEL_FOLDER_ICONS.slice(0, 6).map((px) => ({
                    label: px.name,
                    icon: 'star' as IconName,
                    run: () => {
                      editProj.mutate({ id: lp.ctx!.id, patch: { icon: px.id } });
                      toast(`Icon: ${px.name}`);
                    },
                  })),
                  { label: 'More icons and cover...', icon: 'photo', run: () => setLook(lp.ctx!.id) },
                  { label: 'Reset to plain folder', icon: 'undo', run: () => { editProj.mutate({ id: lp.ctx!.id, patch: { icon: '' } }); toast('Reset to plain folder'); } },
                ],
              },
              {
                label: 'Folder size', icon: 'grid',
                items: [
                  { label: 'Small icons', icon: 'grid', checked: folderSize === 'small', run: () => setFolderSize('small') },
                  { label: 'Medium icons', icon: 'grid', checked: folderSize === 'medium', run: () => setFolderSize('medium') },
                  { label: 'Large icons', icon: 'grid', checked: folderSize === 'large', run: () => setFolderSize('large') },
                ],
              },
              { label: 'Delete', icon: 'trash', danger: true, run: () => { const id = lp.ctx!.id; const row = projects.find((x) => x.id === id); delProj.mutate({ id }); toast('Project deleted', () => restoreProj.mutate({ id, row })); } },
            ]} />
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: pad }}>
      {/* The cover, when there is one — Notion's band, and the header sits on
          it rather than under it, so a project with a picture still opens on
          its board rather than on a hero. */}
      <Cover cover={proj.cover} color={proj.color}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => setOpen(null)} className="hov" title="All projects"
            style={{ width: 32, height: 32, flex: 'none', borderRadius: 10, border: '1px solid var(--line2)', display: 'grid', placeItems: 'center' }}>
            <Icon name="back" size={15} color="var(--tx2)" />
          </button>

          <button onClick={() => setLook(proj.id)} className="hov k-squish" title="Change icon and cover"
            aria-label="Change icon and cover"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 6px 2px 2px', borderRadius: 10 }}>
            <FolderIcon color={proj.color} count={0} size={34} icon={proj.icon} />
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.025em' }}>{proj.name}</span>
          </button>

          {/* Who is actually on this. It used to be three invented initials,
              the same three on every board. */}
          <Crew projectId={proj.id} ownerId={proj.user_id} color={proj.color}
            room={roomFor('projects', proj.id)} />

          <button onClick={() => setView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length])} className="acc" title="Switch view"
            style={{ marginLeft: 'auto', width: 38, height: 38, borderRadius: 19, background: 'var(--acc)', display: 'grid', placeItems: 'center' }}>
            <Icon name={VIEW_ICON[view]} size={16} color="#0C0F16" />
          </button>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx3)', width: 62, textTransform: 'capitalize' }}>{view}</div>
        </div>
      </Cover>

      {look === proj.id && (
        <LookSheet name={proj.name} icon={proj.icon} cover={proj.cover} color={proj.color}
          onClose={() => setLook(null)}
          onSave={(patch) => editProj.mutate({ id: proj.id, patch })} />
      )}

      {pixelPicker === proj.id && (
        <PixelIconPickerModal
          projectName={proj.name}
          currentIcon={proj.icon}
          onSelect={(iconId) => {
            editProj.mutate({ id: proj.id, patch: { icon: iconId } });
            toast('Folder icon updated');
          }}
          onClose={() => setPixelPicker(null)}
        />
      )}

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
                    {/* The assignee, or nothing. This drew a hardcoded "MR" on
                        every card of every board — a name that was not even
                        read from the row it was sitting on. */}
                    {c.assignee_id ? (() => {
                      const who = displayOf(profiles, c.assignee_id, me);
                      return (
                        <span title={who.label} style={{
                          width: 20, height: 20, borderRadius: '50%', background: who.hue,
                          display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, color: '#0C0F16',
                        }}>{who.initials}</span>
                      );
                    })() : (
                      <span style={{ fontSize: 10, color: 'var(--tx3)' }}>Unassigned</span>
                    )}
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

/** Rename in place, on the tile, the way a file manager does it. */
function NameField({ initial, color, phone, placeholder, onSave, onCancel }: {
  initial: string; color: string; phone: boolean; placeholder?: string;
  onSave: (name: string) => void; onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const box = useRef<HTMLInputElement>(null);

  // Focus *and select*, from an effect rather than `autoFocus` + `onFocus`.
  // The field usually opens on a name the app chose ("Untitled project"), so
  // the first keystroke has to replace it rather than append to it — and
  // React's autoFocus focuses during commit, before onFocus is any use, which
  // left the caret sitting at the end of the placeholder name.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: phone ? '10px 4px' : '12px 6px' }}>
      <FolderIcon color={color} count={0} size={phone ? 52 : 60} />
      <input ref={box} value={v} onChange={(e) => setV(e.target.value)}
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
