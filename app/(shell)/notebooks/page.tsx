'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { SECHUE, PAL } from '@/lib/pal';
import { useLayout } from '@/lib/useLayout';
import { useNotebooks, useSections, useNotes, useNotebookActions, type Note } from '@/lib/notebooks';

export default function NotebooksPage() {
  const { phone } = useLayout();
  const { data: notebooks = [] } = useNotebooks();
  const { data: sections = [] } = useSections();
  const { data: notes = [] } = useNotes();
  const A = useNotebookActions();

  const [nbId, setNbId] = useState<string | null>(null);
  const [secId, setSecId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);

  // Default into the first notebook / section / note as data arrives.
  useEffect(() => { if (!nbId && notebooks.length) setNbId(notebooks[0].id); }, [notebooks, nbId]);
  const mySecs = useMemo(() => sections.filter((s) => s.notebook_id === nbId), [sections, nbId]);
  useEffect(() => { if (mySecs.length && !mySecs.some((s) => s.id === secId)) setSecId(mySecs[0].id); }, [mySecs, secId]);
  const myNotes = useMemo(() => notes.filter((n) => n.section_id === secId), [notes, secId]);
  useEffect(() => { if (!myNotes.some((n) => n.id === noteId)) setNoteId(myNotes[0]?.id ?? null); }, [myNotes, noteId]);

  const note = myNotes.find((n) => n.id === noteId) ?? null;

  // Phone portrait collapses to one spacious column: list, or editor once picked.
  if (phone) {
    return (
      <div>
        {note ? (
          <>
            <button onClick={() => setNoteId(null)} className="hov"
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)', marginBottom: 12, minHeight: 40 }}>
              <Icon name="back" size={14} color="var(--tx2)" /> Notes
            </button>
            <Editor note={note} onSave={(p) => A.saveNote.mutate({ id: note.id, patch: p })} onDelete={() => { A.removeWithUndo(note); setNoteId(null); }} />
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em', marginBottom: 16 }}>Notebooks</h1>
            <Rail notebooks={notebooks} nbId={nbId} onPick={setNbId} onAdd={(n, c) => A.newNotebook.mutate({ id: crypto.randomUUID(), name: n, color: c })} />
            <SectionTabs secs={mySecs} secId={secId} onPick={setSecId} onAdd={(n) => nbId && A.newSection.mutate({ id: crypto.randomUUID(), notebook_id: nbId, name: n })} />
            <NoteList notes={myNotes} noteId={noteId} onPick={setNoteId} onAdd={() => secId && A.newNote.mutate({ id: crypto.randomUUID(), section_id: secId, title: 'Untitled' })} />
          </>
        )}
      </div>
    );
  }

  // Desktop: sidebar + note list + editor.
  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em', marginBottom: 16 }}>Notebooks</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '190px 230px 1fr', gap: 14, alignItems: 'start' }}>
        <div>
          <Rail notebooks={notebooks} nbId={nbId} onPick={setNbId} onAdd={(n, c) => A.newNotebook.mutate({ id: crypto.randomUUID(), name: n, color: c })} />
          <SectionTabs secs={mySecs} secId={secId} onPick={setSecId} onAdd={(n) => nbId && A.newSection.mutate({ id: crypto.randomUUID(), notebook_id: nbId, name: n })} vertical />
        </div>
        <NoteList notes={myNotes} noteId={noteId} onPick={setNoteId} onAdd={() => secId && A.newNote.mutate({ id: crypto.randomUUID(), section_id: secId, title: 'Untitled' })} />
        {note ? (
          <Editor note={note} onSave={(p) => A.saveNote.mutate({ id: note.id, patch: p })} onDelete={() => A.removeWithUndo(note)} />
        ) : (
          <p style={{ fontSize: 12.5, color: 'var(--tx3)', padding: 20 }}>Pick a note, or make one.</p>
        )}
      </div>
    </div>
  );
}

function Rail({
  notebooks, nbId, onPick, onAdd,
}: {
  notebooks: { id: string; name: string; color: string }[];
  nbId: string | null;
  onPick: (id: string) => void;
  onAdd: (name: string, color: string) => void;
}) {
  const [adding, setAdding] = useState('');
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 7, marginBottom: 12, boxShadow: 'var(--sh)' }}>
      {notebooks.map((n) => (
        <button key={n.id} onClick={() => onPick(n.id)} className="row"
          style={{
            display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 10px', borderRadius: 9,
            fontSize: 12.5, fontWeight: n.id === nbId ? 700 : 500, minHeight: 38, textAlign: 'left',
            color: n.id === nbId ? 'var(--tx)' : 'var(--tx2)', background: n.id === nbId ? 'var(--hov)' : undefined,
          }}>
          <span style={{ width: 3, height: 16, borderRadius: 2, background: n.color, flex: 'none' }} />
          {n.name}
        </button>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px' }}>
        <Icon name="plus" size={13} color="var(--tx3)" />
        <input value={adding} onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && adding.trim()) { onAdd(adding.trim(), PAL.violet); setAdding(''); } }}
          placeholder="New notebook" style={{ flex: 1, fontSize: 12, color: 'var(--tx)', minHeight: 22 }} />
      </div>
    </div>
  );
}

function SectionTabs({
  secs, secId, onPick, onAdd, vertical,
}: {
  secs: { id: string; name: string }[];
  secId: string | null;
  onPick: (id: string) => void;
  onAdd: (name: string) => void;
  vertical?: boolean;
}) {
  const [adding, setAdding] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: 5, marginBottom: 12, flexWrap: vertical ? 'nowrap' : 'wrap' }}>
      {secs.map((s) => (
        <button key={s.id} onClick={() => onPick(s.id)} className="tt"
          style={{
            padding: '8px 11px', borderRadius: 9, fontSize: 11.5, fontWeight: 700, minHeight: 38, textAlign: 'left',
            border: `1px solid ${s.id === secId ? SECHUE.notebooks : 'var(--line)'}`,
            color: s.id === secId ? SECHUE.notebooks : 'var(--tx3)',
            background: s.id === secId ? 'var(--hov)' : 'transparent',
          }}>
          {s.name}
        </button>
      ))}
      <input value={adding} onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && adding.trim()) { onAdd(adding.trim()); setAdding(''); } }}
        placeholder="+ section"
        style={{ padding: '8px 11px', borderRadius: 9, fontSize: 11.5, color: 'var(--tx)', border: '1px dashed var(--line2)', minHeight: 38, minWidth: 90 }} />
    </div>
  );
}

function NoteList({
  notes, noteId, onPick, onAdd,
}: {
  notes: Note[]; noteId: string | null; onPick: (id: string) => void; onAdd: () => void;
}) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--sh)' }}>
      {notes.map((n, i) => (
        <button key={n.id} onClick={() => onPick(n.id)} className="lensrow row"
          style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px',
            borderBottom: '1px solid var(--line)', minHeight: 44,
            background: n.id === noteId ? 'var(--hov)' : undefined,
            animationDelay: `${Math.min(i, 8) * 0.02}s`,
          }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
          <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {n.body.slice(0, 60) || 'Empty'}
          </div>
        </button>
      ))}
      <button onClick={onAdd} className="row" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', fontSize: 12.5, color: 'var(--tx3)', minHeight: 44 }}>
        <Icon name="plus" size={14} color="var(--tx3)" /> New note
      </button>
    </div>
  );
}

function Editor({ note, onSave, onDelete }: { note: Note; onSave: (p: Partial<Note>) => void; onDelete: () => void }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);

  useEffect(() => { setTitle(note.title); setBody(note.body); }, [note.id, note.title, note.body]);

  // Debounced autosave — the toast/undo path is for deletes, not every keystroke.
  useEffect(() => {
    if (title === note.title && body === note.body) return;
    const t = setTimeout(() => onSave({ title, body }), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  return (
    <div className="lens" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 18, boxShadow: 'var(--sh)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          style={{ flex: 1, fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--tx)', minHeight: 30 }} />
        <button onClick={onDelete} aria-label="Delete note" style={{ padding: 6, minWidth: 28, minHeight: 28 }}>
          <Icon name="trash" size={14} color="var(--tx3)" />
        </button>
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Start writing…"
        style={{ width: '100%', minHeight: 340, resize: 'vertical', fontSize: 13.5, lineHeight: 1.65, color: 'var(--tx)' }} />
    </div>
  );
}
