'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useNotebooks, useSections, useNotes, useNotebookActions, type Note } from '@/lib/notebooks';
import { JournalTab, CanvasTab, JavaTab } from '@/components/NotebookTabs';

/**
 * Ported from Basedly.dc.html — markup 1703–1762, styles 5472–5486 (tab bar +
 * sliding pill), 5815–5851 (doc shell, rail, notes column, toolbar).
 */

const TABS = ['notes', 'journal', 'canvas', 'code'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { notes: 'Notes', journal: 'Journal', canvas: 'Canvas', code: 'Java' };

const KICKER: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)',
};

const DOC_TOOLS = ['Text', 'H1', 'H2', 'List', 'Todo', 'Quote', 'Callout', 'Divider', 'Code'];

export default function NotebooksPage() {
  const { phone } = useLayout();
  const { prefs } = usePrefs();
  const [tab, setTab] = useState<Tab>('notes');

  const { data: notebooks = [] } = useNotebooks();
  const { data: sections = [] } = useSections();
  const { data: notes = [] } = useNotes();
  const A = useNotebookActions();

  const [nbId, setNbId] = useState<string | null>(null);
  const [secId, setSecId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);

  useEffect(() => { if (!nbId && notebooks.length) setNbId(notebooks[0].id); }, [notebooks, nbId]);
  const mySecs = useMemo(() => sections.filter((s) => s.notebook_id === nbId), [sections, nbId]);
  useEffect(() => { if (mySecs.length && !mySecs.some((s) => s.id === secId)) setSecId(mySecs[0].id); }, [mySecs, secId]);
  const myNotes = useMemo(() => notes.filter((n) => n.section_id === secId), [notes, secId]);
  useEffect(() => { if (!myNotes.some((n) => n.id === noteId)) setNoteId(myNotes[0]?.id ?? null); }, [myNotes, noteId]);

  const book = notebooks.find((b) => b.id === nbId);
  const sec = mySecs.find((s) => s.id === secId);
  const note = myNotes.find((n) => n.id === noteId) ?? null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        flex: 'none', padding: phone ? '12px 14px 10px' : '16px 22px 12px',
        display: 'flex', alignItems: 'center', gap: phone ? 0 : 14,
      }}>
        {/* Segmented tab bar — the accent pill slides on transform. */}
        <div style={{
          position: 'relative', display: 'flex', flex: phone ? '1 1 auto' : '0 0 auto',
          width: phone ? '100%' : 'auto', padding: 3, borderRadius: 12, background: 'var(--card)',
        }}>
          <div style={{
            position: 'absolute', top: 3, bottom: 3, left: 3, width: 'calc((100% - 6px)/4)',
            borderRadius: 9, background: prefs.accent,
            transform: `translateX(${TABS.indexOf(tab) * 100}%)`,
            transition: 'transform .34s cubic-bezier(0.16,1,0.3,1)',
          }} />
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              position: 'relative', zIndex: 1, flex: phone ? '1 1 0' : '0 0 auto', minWidth: 0,
              padding: phone ? '7px 6px' : '6px 17px', borderRadius: 9, textAlign: 'center',
              fontSize: phone ? 11.5 : 12, fontWeight: 700, whiteSpace: 'nowrap',
              color: tab === t ? '#0C0F16' : 'var(--tx2)', transition: 'color .24s',
            }}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        {!phone && (
          <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--tx3)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {book?.name ?? '—'} › {sec?.name ?? '—'} › {note?.title ?? '—'}
          </div>
        )}
      </div>

      {tab === 'notes' ? (
        <div style={phone
          ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 14px 20px', gap: 10 }
          : { flex: 1, minHeight: 0, display: 'flex', padding: '0 22px 20px', gap: 14 }}>

          {phone && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <ChipRow items={notebooks.map((b) => ({ id: b.id, n: b.name, c: b.color }))} sel={nbId} onPick={setNbId}
                onAdd={() => A.newNotebook.mutate({ id: crypto.randomUUID(), name: 'New notebook', color: PAL.violet })} />
              <ChipRow items={mySecs.map((s) => ({ id: s.id, n: s.name }))} sel={secId} onPick={setSecId}
                onAdd={() => nbId && A.newSection.mutate({ id: crypto.randomUUID(), notebook_id: nbId, name: 'New section' })} />
            </div>
          )}

          {!phone && (
            <div style={{ display: 'flex', width: 184, flex: 'none', flexDirection: 'column', gap: 2, transition: 'width .35s cubic-bezier(0.16,1,0.3,1)' }}>
              <RailHead label="Notebooks" onAdd={() => A.newNotebook.mutate({ id: crypto.randomUUID(), name: 'New notebook', color: PAL.violet })} />
              {notebooks.map((b) => (
                <button key={b.id} onClick={() => setNbId(b.id)} className="hov" style={railBtn(b.id === nbId)}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: b.color, flex: 'none' }} />
                  <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                </button>
              ))}

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14 }}>
                <div style={KICKER}>Sections</div>
                <button onClick={() => nbId && A.newSection.mutate({ id: crypto.randomUUID(), notebook_id: nbId, name: 'New section' })}
                  className="hov" title="New section" style={addBtn}>
                  <Icon name="plus" size={13} color="var(--tx3)" />
                </button>
              </div>
              {mySecs.map((s) => (
                <button key={s.id} onClick={() => setSecId(s.id)} className="hov" style={railBtn(s.id === secId)}>
                  <span style={{ flex: 1, textAlign: 'left' }}>{s.name}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{notes.filter((n) => n.section_id === s.id).length}</span>
                </button>
              ))}
            </div>
          )}

          {!phone && (
            <div style={{ display: 'flex', width: 206, flex: 'none', flexDirection: 'column', gap: 5, transition: 'width .35s cubic-bezier(0.16,1,0.3,1)' }}>
              <RailHead label="Notes" onAdd={() => secId && A.newNote.mutate({ id: crypto.randomUUID(), section_id: secId, title: 'Untitled' })} />
              {myNotes.map((n) => (
                <button key={n.id} onClick={() => setNoteId(n.id)} style={{
                  padding: '9px 11px', borderRadius: 10, textAlign: 'left', fontSize: 12.5, fontWeight: 600,
                  background: n.id === noteId ? 'var(--card2)' : 'transparent',
                  color: n.id === noteId ? 'var(--tx)' : 'var(--tx2)',
                  border: `1px solid ${n.id === noteId ? 'var(--line2)' : 'transparent'}`,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {n.title}
                </button>
              ))}
            </div>
          )}

          <Doc note={note} phone={phone}
            notes={myNotes} noteId={noteId} onPickNote={setNoteId}
            onAddNote={() => secId && A.newNote.mutate({ id: crypto.randomUUID(), section_id: secId, title: 'Untitled' })}
            onSave={(p) => note && A.saveNote.mutate({ id: note.id, patch: p })}
            onDelete={() => note && A.removeWithUndo(note)} />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: phone ? '0 14px 20px' : '0 22px 20px' }}>
          {tab === 'journal' && <JournalTab />}
          {tab === 'canvas' && <CanvasTab />}
          {tab === 'code' && <JavaTab />}
        </div>
      )}
    </div>
  );
}

const addBtn: React.CSSProperties = {
  marginLeft: 'auto', width: 20, height: 20, borderRadius: 6,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const railBtn = (on: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 9px',
  borderRadius: 8, fontSize: 12, fontWeight: on ? 700 : 500,
  color: on ? 'var(--tx)' : 'var(--tx2)',
  background: on ? 'var(--hov)' : 'transparent',
});

function RailHead({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={KICKER}>{label}</div>
      <button onClick={onAdd} className="hov" title={`New ${label.toLowerCase()}`} style={addBtn}>
        <Icon name="plus" size={13} color="var(--tx3)" />
      </button>
    </div>
  );
}

function ChipRow({
  items, sel, onPick, onAdd,
}: {
  items: { id: string; n: string; c?: string }[];
  sel: string | null; onPick: (id: string) => void; onAdd: () => void;
}) {
  return (
    <div className="hbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 1, minWidth: 0 }}>
      {items.map((it) => (
        <button key={it.id} onClick={() => onPick(it.id)} style={{
          flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
          fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
          border: `1px solid ${it.id === sel ? 'var(--acc)' : 'var(--line2)'}`,
          background: it.id === sel ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent',
          color: it.id === sel ? 'var(--accTx)' : 'var(--tx2)',
        }}>
          {it.c && <span style={{ width: 6, height: 6, borderRadius: '50%', background: it.c }} />}
          {it.n}
        </button>
      ))}
      <button onClick={onAdd} className="hov" title="Add" style={{
        flex: 'none', width: 28, height: 28, borderRadius: 999, border: '1px dashed var(--line2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="plus" size={13} color="var(--tx3)" />
      </button>
    </div>
  );
}

function Doc({
  note, phone, notes, noteId, onPickNote, onAddNote, onSave, onDelete,
}: {
  note: Note | null; phone: boolean;
  notes: Note[]; noteId: string | null; onPickNote: (id: string) => void; onAddNote: () => void;
  onSave: (p: Partial<Note>) => void; onDelete: () => void;
}) {
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [prog, setProg] = useState(0);

  useEffect(() => { setTitle(note?.title ?? ''); setBody(note?.body ?? ''); }, [note?.id, note?.title, note?.body]);

  useEffect(() => {
    if (!note || (title === note.title && body === note.body)) return;
    const t = setTimeout(() => onSave({ title, body }), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Reading-progress bar pinned to the top of the document. */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: 3, zIndex: 4, borderRadius: 2,
        background: 'rgba(124,108,255,.16)', overflow: 'hidden', pointerEvents: 'none',
      }}>
        <div style={{ height: '100%', width: `${prog}%`, borderRadius: 2, background: 'var(--acc)', transition: 'width .12s linear' }} />
      </div>

      <div
        onScroll={(e) => {
          const el = e.currentTarget;
          const max = el.scrollHeight - el.clientHeight;
          setProg(max > 0 ? Math.round((el.scrollTop / max) * 100) : 0);
        }}
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto',
          background: 'var(--card)', borderRadius: 16, padding: '15px 16px', boxShadow: 'var(--sh)',
        }}
      >
        {phone && (
          <div className="hbar" style={{
            display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto',
            paddingBottom: 10, marginBottom: 12, borderBottom: '1px solid var(--line)',
          }}>
            {notes.map((n) => (
              <button key={n.id} onClick={() => onPickNote(n.id)} style={{
                flex: 'none', padding: '6px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                border: `1px solid ${n.id === noteId ? 'var(--acc)' : 'var(--line2)'}`,
                background: n.id === noteId ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent',
                color: n.id === noteId ? 'var(--accTx)' : 'var(--tx2)',
              }}>{n.title}</button>
            ))}
            <button onClick={onAddNote} className="hov" title="New note" style={{
              flex: 'none', width: 24, height: 24, borderRadius: 8, border: '1px dashed var(--line2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="plus" size={12} color="var(--tx3)" />
            </button>
          </div>
        )}

        {!note ? (
          <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: 8 }}>Pick a note, or make one.</div>
        ) : (
          <>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 9, paddingBottom: 12, marginBottom: 16,
              borderBottom: '2px solid var(--line2)', fontSize: 11, fontWeight: 700, color: 'var(--tx3)',
            }}>
              {DOC_TOOLS.map((t) => (
                <button key={t} className="hov" title={`Insert ${t}`} style={{ padding: '3px 7px', borderRadius: 7 }}>{t}</button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                style={{ flex: 1, fontSize: 24, fontWeight: 800, letterSpacing: '-.025em', minWidth: 0, color: 'var(--tx)', overflowWrap: 'anywhere' }} />
              <button onClick={onDelete} className="hov" title="Delete note" style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="trash" size={14} color="var(--tx3)" />
              </button>
            </div>

            <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginBottom: 14 }}>
              {body.trim() ? `${body.trim().split(/\s+/).length} words` : 'Empty'}
            </div>

            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Start writing…"
              style={{ width: '100%', minHeight: 320, resize: 'vertical', fontSize: 13.5, lineHeight: 1.65, color: 'var(--tx)', fontFamily: 'inherit' }} />
          </>
        )}
      </div>
    </div>
  );
}
