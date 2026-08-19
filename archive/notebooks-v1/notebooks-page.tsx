'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useNotebooks, useSections, useNotes, useNotebookActions, type Note, type Sec, type Notebook } from '@/lib/notebooks';
import { ContextMenu, type CtxGroup } from '@/components/ContextMenu';
import { useNotePreviews } from '@/lib/blocks';
import { ask } from '@/lib/ask';
import { toast } from '@/lib/toast';

/** The notebook spine colours, named so the submenu reads as words. */
const NB_COLOURS = [
  { n: 'Violet', v: '#B07CFF' }, { n: 'Indigo', v: '#7C6CFF' }, { n: 'Cyan', v: '#38D6F2' },
  { n: 'Mint', v: '#34D9A0' }, { n: 'Amber', v: '#FFC24B' }, { n: 'Coral', v: '#FF6B6B' },
];
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
  /** Hide the tree entirely, the way Obsidian and Notion both let you. */
  const [tree, setTree] = useState(true);
  const [menu, setMenu] = useState<{ x: number; y: number; kind: string; label: string; items: CtxGroup[] } | null>(null);

  /**
   * Right-click menus for the tree.
   *
   * Grouped rather than listed: create, then change, then move, then the
   * destructive one behind a rule of its own. A flat list of nine rows makes
   * you read all nine to find the one you want, and puts Delete one slip away
   * from Rename.
   */
  const sectionMenu = (sec: Sec): CtxGroup[] => {
    const kids = notes.filter((n) => n.section_id === sec.id);
    const siblings = sections.filter((x) => x.notebook_id === sec.notebook_id && x.id !== sec.id);
    const elsewhere = notebooks.filter((b) => b.id !== sec.notebook_id);

    return [
      { items: [
        { label: 'New note', icon: 'bookPlus', shortcut: 'N',
          run: () => { const id = crypto.randomUUID(); A.newNote.mutate({ id, section_id: sec.id, title: 'Untitled' }); setSecId(sec.id); setNoteId(id); } },
      ] },
      { label: 'Section', items: [
        { label: 'Rename', icon: 'edit', shortcut: 'F2',
          run: () => void ask('Rename section', { initial: sec.name, placeholder: 'Section name' })
            .then((n) => { if (n && n !== sec.name) { A.editSection.mutate({ id: sec.id, patch: { name: n } }); toast('Section renamed'); } }) },
        { label: 'Duplicate', icon: 'copy',
          run: () => {
            const id = crypto.randomUUID();
            A.newSection.mutate({ id, notebook_id: sec.notebook_id, name: `${sec.name} copy` });
            kids.forEach((n) => A.newNote.mutate({ id: crypto.randomUUID(), section_id: id, title: n.title }));
            toast(`Duplicated “${sec.name}”`);
          } },
        { label: 'Copy section name', icon: 'copy',
          run: () => { void navigator.clipboard?.writeText(sec.name); toast('Copied'); } },
      ] },
      { label: 'Move', items: [
        { label: 'Move to notebook', icon: 'proj',
          disabled: elsewhere.length === 0,
          hint: elsewhere.length === 0 ? 'There is only one notebook' : undefined,
          items: elsewhere.map((b) => ({
            label: b.name, icon: 'proj' as IconName,
            run: () => { A.editSection.mutate({ id: sec.id, patch: { notebook_id: b.id } }); toast(`Moved to ${b.name}`); },
          })) },
        { label: 'Move notes into', icon: 'agenda',
          disabled: kids.length === 0 || siblings.length === 0,
          hint: kids.length === 0 ? 'This section is empty'
            : siblings.length === 0 ? 'There is nowhere else in this notebook' : undefined,
          items: siblings.map((t) => ({
            label: t.name, icon: 'agenda' as IconName,
            run: () => { kids.forEach((n) => A.moveNote.mutate({ id: n.id, section_id: t.id })); toast(`Moved ${kids.length} notes`); },
          })) },
      ] },
      { items: [
        { label: kids.length ? `Delete and keep ${kids.length} notes` : 'Delete section',
          icon: 'trash', danger: true, shortcut: '⌫',
          hint: kids.length && siblings.length ? `Notes move to ${siblings[0].name}` : undefined,
          run: () => {
            if (kids.length && !siblings.length) return toast('Make another section first — these notes need somewhere to go');
            A.delSection.mutate({ id: sec.id, moveTo: siblings[0]?.id ?? null });
            if (secId === sec.id) setSecId(null);
            toast(kids.length ? `Deleted “${sec.name}” — notes moved to ${siblings[0].name}` : `Deleted “${sec.name}”`);
          } },
      ] },
    ];
  };

  const notebookMenu = (b: Notebook): CtxGroup[] => [
    { items: [
      { label: 'New section', icon: 'plus', run: () => A.newSection.mutate({ id: crypto.randomUUID(), notebook_id: b.id, name: 'New section' }) },
    ] },
    { label: 'Notebook', items: [
      { label: 'Rename', icon: 'edit', shortcut: 'F2',
        run: () => void ask('Rename notebook', { initial: b.name, placeholder: 'Notebook name' })
          .then((n) => { if (n && n !== b.name) { A.editNotebook.mutate({ id: b.id, patch: { name: n } }); toast('Notebook renamed'); } }) },
      { label: 'Colour', icon: 'palette',
        items: NB_COLOURS.map((c) => ({
          label: c.n, icon: 'palette' as IconName, checked: b.color === c.v,
          run: () => A.editNotebook.mutate({ id: b.id, patch: { color: c.v } }),
        })) },
    ] },
  ];

  const noteMenu = (n: Note): CtxGroup[] => {
    const targets = sections.filter((x) => x.id !== n.section_id);
    return [
      { items: [
        { label: 'Open', icon: 'book', run: () => setNoteId(n.id) },
        { label: 'Rename', icon: 'edit', shortcut: 'F2',
          run: () => void ask('Rename note', { initial: n.title, placeholder: 'Note title' })
            .then((t) => { if (t && t !== n.title) A.saveNote.mutate({ id: n.id, patch: { title: t } }); }) },
        { label: 'Duplicate', icon: 'copy',
          run: () => { A.newNote.mutate({ id: crypto.randomUUID(), section_id: n.section_id, title: `${n.title} copy` }); toast('Duplicated'); } },
      ] },
      { label: 'Move', items: [
        { label: 'Move to section', icon: 'agenda',
          disabled: targets.length === 0,
          hint: targets.length === 0 ? 'There is nowhere else to put it' : undefined,
          items: targets.map((t) => ({
            label: t.name, icon: 'agenda' as IconName,
            run: () => { A.moveNote.mutate({ id: n.id, section_id: t.id }); toast(`Moved to ${t.name}`); },
          })) },
      ] },
      { items: [
        { label: 'Delete note', icon: 'trash', danger: true, shortcut: '⌫',
          run: () => { A.removeWithUndo(n); if (noteId === n.id) setNoteId(null); } },
      ] },
    ];
  };

  const openMenu = (e: React.MouseEvent, kind: string, label: string, items: CtxGroup[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, kind, label, items });
  };
  const { data: sections = [] } = useSections();
  const { data: notes = [] } = useNotes();
  const A = useNotebookActions();
  const { data: previews = {} } = useNotePreviews();

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
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} kind={menu.kind} label={menu.label} items={menu.items}
          onClose={() => setMenu(null)} accent={prefs.accent} dark={prefs.theme === 'dark'} />
      )}
      <div style={{
        flex: 'none', padding: phone ? '12px 14px 10px' : '16px 22px 12px',
        display: 'flex', alignItems: 'center', gap: phone ? 0 : 14,
      }}>
        {/* Hide the tree and hand its 240px to the note. */}
        {!phone && tab === 'notes' && (
          <button onClick={() => setTree((v) => !v)} className="hov k-squish"
            title={tree ? 'Hide the notebook tree' : 'Show the notebook tree'}
            aria-label={tree ? 'Hide the notebook tree' : 'Show the notebook tree'}
            aria-pressed={tree}
            style={{ width: 34, height: 34, flex: 'none', borderRadius: 10, border: '1px solid var(--line2)', display: 'grid', placeItems: 'center' }}>
            <Icon name={tree ? 'collapse' : 'expand'} size={15} color="var(--tx2)" />
          </button>
        )}

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

          {/* One tree, not two lists.
              Notebooks+sections sat in one column and notes in another, so
              390px of a 1044px area was navigation and the note itself got
              582px — below a comfortable reading measure, and the reason this
              page always felt cramped. Obsidian and Notion both use a single
              nested explorer that collapses; so does this now, which hands the
              editor 780px open and about a thousand closed. */}
          {!phone && tree && (
            <div className="navsb" style={{
              display: 'flex', width: 240, flex: 'none', flexDirection: 'column', gap: 1,
              overflowY: 'auto', minHeight: 0, paddingRight: 4,
            }}>
              <RailHead label="Notebooks"
                onAdd={() => A.newNotebook.mutate({ id: crypto.randomUUID(), name: 'New notebook', color: PAL.violet })} />

              {notebooks.map((b) => {
                const openBook = b.id === nbId;
                const secs = sections.filter((x) => x.notebook_id === b.id);
                return (
                  <div key={b.id}>
                    <button onClick={() => setNbId(openBook ? null : b.id)} className="hov"
                      onContextMenu={(e) => openMenu(e, 'project', b.name, notebookMenu(b))}
                      aria-expanded={openBook}
                      style={{ ...railBtn(openBook), fontWeight: 700 }}>
                      <Icon name={openBook ? 'collapse' : 'expand'} size={11} color="var(--tx3)" />
                      <span style={{ width: 7, height: 7, borderRadius: 2, background: b.color, flex: 'none' }} />
                      <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                    </button>

                    {openBook && (
                      <div className="rise" style={{ marginLeft: 10, borderLeft: '1px solid var(--line)', paddingLeft: 6 }}>
                        {secs.map((sec) => {
                          const openSec = sec.id === secId;
                          const kids = notes.filter((n) => n.section_id === sec.id);
                          return (
                            <div key={sec.id}>
                              <button onClick={() => setSecId(openSec ? null : sec.id)} className="hov"
                                onContextMenu={(e) => openMenu(e, 'node', sec.name, sectionMenu(sec))}
                                aria-expanded={openSec} style={railBtn(openSec)}>
                                <Icon name={openSec ? 'collapse' : 'expand'} size={10} color="var(--tx3)" />
                                <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sec.name}</span>
                                <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{kids.length}</span>
                              </button>

                              {openSec && (
                                <div className="rise" style={{ marginLeft: 8, borderLeft: '1px solid var(--line)', paddingLeft: 6 }}>
                                  {kids.map((n) => (
                                    <button key={n.id} onClick={() => setNoteId(n.id)}
                                      onContextMenu={(e) => openMenu(e, 'scratch', n.title, noteMenu(n))}
                                      style={{
                                        display: 'block', width: '100%', padding: '7px 9px', borderRadius: 8, textAlign: 'left',
                                        background: n.id === noteId ? 'var(--card2)' : 'transparent',
                                        color: n.id === noteId ? 'var(--tx)' : 'var(--tx2)',
                                      }}>
                                      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {n.title}
                                      </span>
                                      {/* One line of the note under its title.
                                          A list of titles is only findable if you
                                          named things well months ago; a line of
                                          the actual text is how you recognise the
                                          note you half-remember. */}
                                      {previews[n.id] && (
                                        <span style={{
                                          display: 'block', fontSize: 10.5, lineHeight: 1.4, color: 'var(--tx3)',
                                          marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        }}>
                                          {previews[n.id].slice(0, 60)}
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                  <button onClick={() => A.newNote.mutate({ id: crypto.randomUUID(), section_id: sec.id, title: 'Untitled' })}
                                    className="hov" style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 9px', borderRadius: 8, fontSize: 11, color: 'var(--tx3)' }}>
                                    <Icon name="plus" size={11} color="var(--tx3)" />New note
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <button onClick={() => A.newSection.mutate({ id: crypto.randomUUID(), notebook_id: b.id, name: 'New section' })}
                          className="hov" style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 9px', borderRadius: 8, fontSize: 11, color: 'var(--tx3)' }}>
                          <Icon name="plus" size={11} color="var(--tx3)" />New section
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
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
