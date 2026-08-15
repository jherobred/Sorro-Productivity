'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { ymd, lastDays } from '@/lib/habits';
import { uploadTo, useSignedUrl } from '@/lib/uploads';

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
    queryFn: async (): Promise<{ id: string; entry_date: string; text: string }[]> => {
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
          style={{ width: '100%', minHeight: 200, resize: 'vertical', fontSize: 13.5, lineHeight: 1.7, color: 'var(--tx)', fontFamily: 'inherit' }} />

        <JournalPhotos entryId={current?.id ?? null} entryDate={sel} onNeedEntry={() => save.mutate({ entry_date: sel, text })} />
      </div>
    </div>
  );
}

type Photo = { id: string; name: string; storage_path: string; position: number };

/**
 * Journal photos with annotation pins. Annotation coordinates are stored as
 * 0–100 percentages (BACKEND.md), so pins stay put at any render size.
 */
function JournalPhotos({ entryId, entryDate, onNeedEntry }: { entryId: string | null; entryDate: string; onNeedEntry: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const { data: photos = [] } = useQuery({
    queryKey: ['journal_photos', entryId],
    enabled: !!entryId,
    queryFn: async (): Promise<Photo[]> => {
      const { data, error } = await supabase.from('bd_journal_photos')
        .select('id,name,storage_path,position').eq('entry_id', entryId!).order('position');
      if (error) throw error;
      return data ?? [];
    },
  });

  async function add(file: File) {
    if (!entryId) { onNeedEntry(); toast('Write something first, then add photos'); return; }
    setBusy(true);
    try {
      const user_id = await currentUserId();
      const path = await uploadTo('bd-journal', file);
      const { error } = await supabase.from('bd_journal_photos')
        .insert({ user_id, entry_id: entryId, name: file.name, storage_path: path, position: photos.length });
      if (error) throw error;
      void qc.invalidateQueries({ queryKey: ['journal_photos'] });
      toast('Photo added');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={KICKER}>Photos</div>
        <label className="hov" title="Add a photo"
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px',
            borderRadius: 9, border: '1px solid var(--line2)', fontSize: 11, fontWeight: 700,
            color: 'var(--tx2)', cursor: 'pointer', opacity: busy ? 0.5 : 1,
          }}>
          <Icon name="photo" size={13} color="var(--tx2)" />{busy ? 'Uploading…' : 'Add'}
          <input type="file" accept="image/*" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void add(f); e.target.value = ''; }} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
        {photos.map((p) => <JournalPhoto key={p.id} photo={p} open={open === p.id} onOpen={() => setOpen(open === p.id ? null : p.id)} />)}
        {photos.length === 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>No photos for {entryDate}.</div>
        )}
      </div>
    </div>
  );
}

function JournalPhoto({ photo, open, onOpen }: { photo: Photo; open: boolean; onOpen: () => void }) {
  const url = useSignedUrl('bd-journal', photo.storage_path);
  const qc = useQueryClient();
  const [anns, setAnns] = useState<{ id: string; x: number; y: number; text: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    supabase.from('bd_photo_annotations').select('id,x,y,text').eq('photo_id', photo.id)
      .then(({ data }) => setAnns((data ?? []).map((a) => ({ ...a, x: Number(a.x), y: Number(a.y) }))));
  }, [open, photo.id]);

  // Click-to-pin: store x/y as percentages so pins survive any resize.
  const pin = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!open) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = +(((e.clientX - r.left) / r.width) * 100).toFixed(2);
    const y = +(((e.clientY - r.top) / r.height) * 100).toFixed(2);
    const text = window.prompt('Note for this spot');
    if (!text) return;
    const user_id = await currentUserId();
    const { error } = await supabase.from('bd_photo_annotations').insert({ user_id, photo_id: photo.id, x, y, text });
    if (error) return toast(error.message);
    setAnns((a) => [...a, { id: crypto.randomUUID(), x, y, text }]);
    void qc.invalidateQueries({ queryKey: ['journal_photos'] });
  };

  return (
    <div onClick={onOpen} onDoubleClick={pin} title={open ? 'Double-click to pin a note' : photo.name}
      style={{
        position: 'relative', aspectRatio: open ? '16/10' : '1', gridColumn: open ? '1 / -1' : 'auto',
        borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
        background: 'linear-gradient(140deg, var(--card2), var(--panel))',
        border: `1px solid ${open ? 'var(--acc)' : 'var(--line)'}`,
        transition: 'aspect-ratio .3s cubic-bezier(.22,1,.36,1), border-color .24s',
      }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.name} className="fade"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
      {open && anns.map((a) => (
        <span key={a.id} title={a.text} className="pop"
          style={{
            position: 'absolute', left: `${a.x}%`, top: `${a.y}%`, transform: 'translate(-50%,-50%)',
            width: 18, height: 18, borderRadius: '50%', background: 'var(--acc)', color: '#0C0F16',
            display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800,
            boxShadow: '0 2px 8px rgba(0,0,0,.5)',
          }}>
          {anns.indexOf(a) + 1}
        </span>
      ))}
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
