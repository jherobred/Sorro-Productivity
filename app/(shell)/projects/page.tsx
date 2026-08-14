'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { useRealtime } from '@/lib/realtime';
import { toast } from '@/lib/toast';
import { SECHUE, PAL } from '@/lib/pal';

type Project = { id: string; name: string; tag: string; goal: string; color: string; progress: number };
type Card = { id: string; project_id: string; title: string; col: string; color: string; position: number };
type Comment = { id: string; project_id: string; author_id: string; body: string; created_at: string };

const PROJ_KEY = ['projects'] as const;
const CARD_KEY = ['cards'] as const;
const CMT_KEY = ['project_comments'] as const;

const COLUMNS: { id: string; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'doing', label: 'Doing' },
  { id: 'done', label: 'Done' },
];

const NEW_PROJ = defineMutation('proj.new', async (v: { id: string; name: string; color: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_projects').insert({ ...v, user_id });
  if (error) throw error;
});

const NEW_CARD = defineMutation('proj.newCard', async (v: { id: string; project_id: string; title: string; col: string; color: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_cards').insert({ ...v, user_id });
  if (error) throw error;
});

// Drag between columns updates col + order.
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

const ADD_CMT = defineMutation('proj.addComment', async (v: { id: string; project_id: string; body: string }) => {
  const author_id = await currentUserId();
  const { error } = await supabase.from('bd_project_comments').insert({ ...v, author_id });
  if (error) throw error;
});

export default function ProjectsPage() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const settle = () => {
    void qc.invalidateQueries({ queryKey: PROJ_KEY });
    void qc.invalidateQueries({ queryKey: CARD_KEY });
    void qc.invalidateQueries({ queryKey: CMT_KEY });
  };

  const { data: projects = [] } = useQuery({
    queryKey: PROJ_KEY,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from('bd_projects').select('id,name,tag,goal,color,progress').is('deleted_at', null).order('position');
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => { if (!sel && projects.length) setSel(projects[0].id); }, [projects, sel]);

  const { data: cards = [] } = useQuery({
    queryKey: [...CARD_KEY, sel],
    enabled: !!sel,
    queryFn: async (): Promise<Card[]> => {
      const { data, error } = await supabase
        .from('bd_cards').select('id,project_id,title,col,color,position')
        .eq('project_id', sel!).is('deleted_at', null).order('position');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: comments = [] } = useQuery({
    queryKey: [...CMT_KEY, sel],
    enabled: !!sel,
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from('bd_project_comments').select('id,project_id,author_id,body,created_at')
        .eq('project_id', sel!).is('deleted_at', null).order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Shared boards: another member's move or comment should land here in place.
  useRealtime('bd_cards', CARD_KEY, sel ? `project_id=eq.${sel}` : undefined);
  useRealtime('bd_project_comments', CMT_KEY, sel ? `project_id=eq.${sel}` : undefined);

  const newProject = useMutation<unknown, Error, { id: string; name: string; color: string }>({ mutationKey: NEW_PROJ, onSettled: settle });
  const newCard = useMutation<unknown, Error, { id: string; project_id: string; title: string; col: string; color: string }>({ mutationKey: NEW_CARD, onSettled: settle });
  const restoreCard = useMutation<unknown, Error, { id: string }>({ mutationKey: RESTORE_CARD, onSettled: settle });
  const addCmt = useMutation<unknown, Error, { id: string; project_id: string; body: string }>({ mutationKey: ADD_CMT, onSettled: settle });

  const cardsKey = [...CARD_KEY, sel];
  const moveCard = useMutation({
    mutationKey: MOVE_CARD,
    onMutate: (v: { id: string; col: string; position: number }) => {
      const prev = queryClient.getQueryData<Card[]>(cardsKey) ?? [];
      queryClient.setQueryData<Card[]>(cardsKey, prev.map((c) => (c.id === v.id ? { ...c, col: v.col, position: v.position } : c)));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(cardsKey, ctx); },
    onSettled: settle,
  });
  const delCard = useMutation({
    mutationKey: DEL_CARD,
    onMutate: (v: { id: string }) => {
      const prev = queryClient.getQueryData<Card[]>(cardsKey) ?? [];
      queryClient.setQueryData<Card[]>(cardsKey, prev.filter((c) => c.id !== v.id));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(cardsKey, ctx); },
    onSettled: settle,
  });

  const project = projects.find((p) => p.id === sel);

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em' }}>Projects</h1>
        <NewProject onAdd={(n) => newProject.mutate({ id: crypto.randomUUID(), name: n, color: PAL.amber })} />
      </header>

      <div style={{ display: 'flex', gap: 7, marginBottom: 16, flexWrap: 'wrap' }}>
        {projects.map((p) => (
          <button key={p.id} onClick={() => setSel(p.id)} className="tt"
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 10, minHeight: 38,
              border: `1px solid ${p.id === sel ? p.color : 'var(--line)'}`,
              background: p.id === sel ? 'var(--hov)' : 'transparent',
              fontSize: 12.5, fontWeight: 700, color: p.id === sel ? 'var(--tx)' : 'var(--tx3)',
            }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color }} />
            {p.name}
          </button>
        ))}
      </div>

      {!project && <p style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Make a project to get a board.</p>}

      {project && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: 22 }}>
            {COLUMNS.map((col) => (
              <div
                key={col.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (!dragId) return;
                  const n = cards.filter((c) => c.col === col.id).length;
                  moveCard.mutate({ id: dragId, col: col.id, position: n });
                  setDragId(null);
                }}
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: 10, minHeight: 160 }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 9, paddingLeft: 3 }}>
                  {col.label} <span style={{ opacity: .7 }}>{cards.filter((c) => c.col === col.id).length}</span>
                </div>

                {cards.filter((c) => c.col === col.id).map((c) => (
                  <div key={c.id} draggable onDragStart={() => setDragId(c.id)} onDragEnd={() => setDragId(null)}
                    className="rise"
                    style={{
                      background: 'var(--card)', border: '1px solid var(--line)', borderLeft: `2px solid ${c.color}`,
                      borderRadius: 10, padding: '10px 11px', marginBottom: 7, cursor: 'grab',
                      display: 'flex', alignItems: 'center', gap: 8,
                      opacity: dragId === c.id ? 0.5 : 1, boxShadow: 'var(--sh)',
                    }}>
                    <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45, textWrap: 'pretty' }}>{c.title}</span>
                    <button onClick={() => { delCard.mutate({ id: c.id }); toast(`Deleted “${c.title}”`, () => restoreCard.mutate({ id: c.id })); }}
                      aria-label="Delete card" style={{ padding: 4, minWidth: 22, minHeight: 22 }}>
                      <Icon name="trash" size={12} color="var(--tx3)" />
                    </button>
                  </div>
                ))}

                <AddCard onAdd={(t) => newCard.mutate({ id: crypto.randomUUID(), project_id: project.id, title: t, col: col.id, color: project.color })} />
              </div>
            ))}
          </div>

          <section>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 9 }}>Thread</div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--sh)', overflow: 'hidden' }}>
              {comments.map((c) => (
                <div key={c.id} className="lensrow" style={{ padding: '11px 14px', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.6, textWrap: 'pretty' }}>{c.body}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 3, fontWeight: 600 }}>
                    {new Date(c.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
              ))}
              <AddComment onAdd={(b) => addCmt.mutate({ id: crypto.randomUUID(), project_id: project.id, body: b })} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function NewProject({ onAdd }: { onAdd: (name: string) => void }) {
  const [v, setV] = useState('');
  return (
    <input value={v} onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); } }}
      placeholder="+ new project"
      style={{ marginLeft: 'auto', minHeight: 40, padding: '10px 14px', borderRadius: 10, border: '1px dashed var(--line2)', color: 'var(--tx)', fontSize: 12.5, minWidth: 160 }} />
  );
}

function AddCard({ onAdd }: { onAdd: (title: string) => void }) {
  const [v, setV] = useState('');
  return (
    <input value={v} onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); } }}
      placeholder="+ card"
      style={{ width: '100%', minHeight: 36, padding: '8px 11px', borderRadius: 9, border: '1px dashed var(--line2)', color: 'var(--tx)', fontSize: 12 }} />
  );
}

function AddComment({ onAdd }: { onAdd: (body: string) => void }) {
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
