'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useNotebooks, useSections, useNotes, useNotebookActions, type Note } from '@/lib/notebooks';
import { JournalTab } from '@/components/NotebookTabs';
import { JavaLab } from '@/components/JavaLab';
import { CanvasBoard } from '@/components/CanvasBoard';
import { NoteEditor } from '@/components/NoteEditor';

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

  /**
   * Open a note wherever it lives. A `[[wiki link]]` can point into another
   * notebook entirely, so the rails have to follow it — setting noteId alone
   * would be undone by the effect above the moment the section did not match.
   */
  const goToNote = (id: string) => {
    const target = notes.find((n) => n.id === id);
    if (!target) return;
    const section = sections.find((s) => s.id === target.section_id);
    if (section) { setNbId(section.notebook_id); setSecId(section.id); }
    setNoteId(id);
  };

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

          <NoteEditor
            note={note}
            phone={phone}
            notes={notes}
            onPickNote={goToNote}
            onNewNote={(title) => {
              if (!secId) return;
              const id = crypto.randomUUID();
              A.newNote.mutate({ id, section_id: secId, title });
              setNoteId(id);
            }}
            onSave={(p) => note && A.saveNote.mutate({ id: note.id, patch: p })}
            onDelete={() => note && A.removeWithUndo(note)} />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: phone ? '0 14px 20px' : '0 22px 20px' }}>
          {tab === 'journal' && <JournalTab />}
          {tab === 'canvas' && <CanvasBoard />}
          {tab === 'code' && <JavaLab />}
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
