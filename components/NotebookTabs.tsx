'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { ymd, lastDays } from '@/lib/habits';

/** Journal / Canvas / Java tabs — Basedly.dc.html markup 1822–2101. */

const CARD: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, padding: '15px 16px', boxShadow: 'var(--sh)' };
const KICKER: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' };

/* ------------------------------------------------------------------ Journal */

const JOURNAL = ['journal'] as const;

const SAVE_ENTRY = defineMutation('journal.save', async (v: { entry_date: string; text: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_journal_entries')
    .upsert({ user_id, entry_date: v.entry_date, text: v.text }, { onConflict: 'user_id,entry_date' });
  if (error) throw error;
});

export function JournalTab() {
  const qc = useQueryClient();
  const [sel, setSel] = useState(() => ymd(new Date()));
  const [text, setText] = useState('');

  const { data: entries = [] } = useQuery({
    queryKey: JOURNAL,
    queryFn: async () => {
      const from = ymd(lastDays(30)[0]);
      const { data, error } = await supabase.from('bd_journal_entries')
        .select('id,entry_date,text').is('deleted_at', null).gte('entry_date', from);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation<unknown, Error, { entry_date: string; text: string }>({
    mutationKey: SAVE_ENTRY,
    onSettled: () => void qc.invalidateQueries({ queryKey: JOURNAL }),
  });

  const current = entries.find((e) => e.entry_date === sel);
  useEffect(() => { setText(current?.text ?? ''); }, [sel, current?.text]);

  // Debounced autosave, same feel as the note editor.
  useEffect(() => {
    if (text === (current?.text ?? '')) return;
    const t = setTimeout(() => save.mutate({ entry_date: sel, text }), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const week = lastDays(7);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {week.map((d) => {
          const key = ymd(d);
          const on = key === sel;
          const has = entries.some((e) => e.entry_date === key && e.text.trim());
          return (
            <button key={key} onClick={() => setSel(key)} className="tt" style={{
              flex: 1, minHeight: 56, borderRadius: 12, padding: '8px 0', textAlign: 'center',
              border: `1px solid ${on ? 'var(--acc)' : 'var(--line)'}`,
              background: on ? 'var(--acc)' : 'var(--card)',
              color: on ? '#0C0F16' : 'var(--tx2)',
            }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', opacity: 0.75 }}>
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][(d.getDay() + 6) % 7]}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{d.getDate()}</div>
              <div style={{ width: 4, height: 4, borderRadius: 3, margin: '4px auto 0', background: has ? (on ? '#0C0F16' : 'var(--tx3)') : 'transparent' }} />
            </button>
          );
        })}
      </div>

      <div style={{ ...CARD, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={KICKER}>
            {new Date(sel + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--tx3)' }}>
            {text.trim() ? `${text.trim().split(/\s+/).length} words` : 'Empty'}
          </div>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="How was today?"
          style={{ flex: 1, minHeight: 260, width: '100%', resize: 'vertical', fontSize: 13.5, lineHeight: 1.7, color: 'var(--tx)', fontFamily: 'inherit' }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Canvas */

type Node = { id: string; text: string; kind: string; x: number; y: number; w: number; h: number; color: string };

const CANVAS = ['canvas'] as const;
const NODE_COLOR: Record<string, string> = { hub: PAL.violet, note: PAL.indigo, flag: PAL.coral, muted: PAL.cyan };

const ADD_NODE = defineMutation('canvas.addNode', async (v: { canvas_id: string; text: string; x: number; y: number; color: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_canvas_nodes').insert({ ...v, user_id, kind: 'note' });
  if (error) throw error;
});
const MOVE_NODE = defineMutation('canvas.moveNode', async (v: { id: string; x: number; y: number }) => {
  const { error } = await supabase.from('bd_canvas_nodes').update({ x: v.x, y: v.y }).eq('id', v.id);
  if (error) throw error;
});

export function CanvasTab() {
  const qc = useQueryClient();
  const [canvasId, setCanvasId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const board = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const user_id = await currentUserId();
      const { data } = await supabase.from('bd_canvases').select('id').is('deleted_at', null).order('created_at').limit(1).maybeSingle();
      if (data) return setCanvasId(data.id);
      const { data: made } = await supabase.from('bd_canvases').insert({ user_id, name: 'Untitled canvas' }).select('id').single();
      if (made) setCanvasId(made.id);
    })();
  }, []);

  const { data: nodes = [] } = useQuery({
    queryKey: [...CANVAS, canvasId],
    enabled: !!canvasId,
    queryFn: async (): Promise<Node[]> => {
      const { data, error } = await supabase.from('bd_canvas_nodes')
        .select('id,text,kind,x,y,w,h,color').eq('canvas_id', canvasId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const settle = () => void qc.invalidateQueries({ queryKey: CANVAS });
  const addNode = useMutation<unknown, Error, { canvas_id: string; text: string; x: number; y: number; color: string }>({ mutationKey: ADD_NODE, onSettled: settle });
  const moveNode = useMutation<unknown, Error, { id: string; x: number; y: number }>({ mutationKey: MOVE_NODE, onSettled: settle });

  const press = (e: React.PointerEvent, n: Node) => {
    e.preventDefault();
    const ox = e.clientX - n.x;
    const oy = e.clientY - n.y;
    const move = (m: PointerEvent) => setDrag({ id: n.id, x: m.clientX - ox, y: m.clientY - oy });
    const up = (m: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      moveNode.mutate({ id: n.id, x: Math.round(m.clientX - ox), y: Math.round(m.clientY - oy) });
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div style={{ ...CARD, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
        <div style={KICKER}>Canvas</div>
        <button onClick={() => canvasId && addNode.mutate({ canvas_id: canvasId, text: 'New node', x: 40 + Math.random() * 200, y: 40 + Math.random() * 160, color: PAL.indigo })}
          className="acc" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'var(--acc)', color: '#0C0F16', fontSize: 11.5, fontWeight: 800 }}>
          <Icon name="plus" size={13} color="#0C0F16" />Node
        </button>
      </div>

      <div ref={board} style={{
        position: 'relative', flex: 1, minHeight: 340, overflow: 'auto',
        backgroundImage: 'radial-gradient(circle, var(--line2) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }}>
        {nodes.map((n) => {
          const d = drag?.id === n.id ? drag : null;
          return (
            <div key={n.id} onPointerDown={(e) => press(e, n)} style={{
              position: 'absolute', left: d ? d.x : n.x, top: d ? d.y : n.y,
              width: n.w || 160, minHeight: n.h || 56,
              padding: '10px 12px', borderRadius: 12, cursor: 'grab', touchAction: 'none', userSelect: 'none',
              background: 'var(--card2)', border: `1px solid ${n.color || NODE_COLOR[n.kind] || PAL.indigo}`,
              boxShadow: d ? 'var(--shl)' : 'var(--sh)',
              transform: d ? 'scale(1.03)' : 'scale(1)',
              transition: d ? 'none' : 'transform .3s cubic-bezier(0.34,1.56,0.64,1), box-shadow .2s',
              fontSize: 12, fontWeight: 600, lineHeight: 1.4,
            }}>
              {n.text}
            </div>
          );
        })}
        {nodes.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 12.5, color: 'var(--tx3)' }}>
            Add a node to start mapping.
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- Java */

const JAVA = ['java'] as const;

const SAVE_JAVA = defineMutation('java.save', async (v: { id: string; src: string }) => {
  const { error } = await supabase.from('bd_java_files').update({ src: v.src }).eq('id', v.id);
  if (error) throw error;
});

export function JavaTab() {
  const qc = useQueryClient();
  const [id, setId] = useState<string | null>(null);
  const [src, setSrc] = useState('');
  const [out, setOut] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const user_id = await currentUserId();
      const { data } = await supabase.from('bd_java_files').select('id,src').order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (data) { setId(data.id); setSrc(data.src); return; }
      const seed = 'class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, Basedly");\n  }\n}';
      const { data: made } = await supabase.from('bd_java_files').insert({ user_id, name: 'Main.java', src: seed }).select('id,src').single();
      if (made) { setId(made.id); setSrc(made.src); }
    })();
  }, []);

  const save = useMutation<unknown, Error, { id: string; src: string }>({
    mutationKey: SAVE_JAVA,
    onSettled: () => void qc.invalidateQueries({ queryKey: JAVA }),
  });

  useEffect(() => {
    if (!id) return;
    const t = setTimeout(() => save.mutate({ id, src }), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, id]);

  /**
   * ponytail: the prototype runs a toy client-side interpreter. This pulls the
   * System.out.println literals so the console shows something real; swap for a
   * proper interpreter or an execution service if you want it to actually run.
   */
  const run = () => {
    const lines = [...src.matchAll(/System\.out\.println\(\s*"([^"]*)"\s*\)/g)].map((m) => m[1]);
    setOut(lines.length ? lines : ['(no println output found)']);
    toast('Ran Main.java');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      <div style={{ ...CARD, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={KICKER}>Main.java</div>
          <button onClick={run} className="acc"
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 9, background: 'var(--acc)', color: '#0C0F16', fontSize: 11.5, fontWeight: 800 }}>
            <Icon name="play" size={12} color="#0C0F16" />Run
          </button>
        </div>
        <textarea value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false}
          style={{
            flex: 1, minHeight: 240, width: '100%', resize: 'vertical',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12.5, lineHeight: 1.6, color: 'var(--tx)',
          }} />
      </div>

      <div style={{ ...CARD, background: 'var(--card2)' }}>
        <div style={{ ...KICKER, marginBottom: 8 }}>Console</div>
        <pre style={{
          margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12, lineHeight: 1.65, color: out.length ? PAL.mint : 'var(--tx3)', whiteSpace: 'pre-wrap',
        }}>
          {out.length ? out.join('\n') : 'Run to see output.'}
        </pre>
      </div>
    </div>
  );
}
