'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { ShelfSkeleton } from '@/components/Skeleton';
import { TabRail } from '@/components/TabRail';
import { PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useOverlayBack } from '@/lib/nav';
import { ask, confirmAsk } from '@/lib/ask';
import { toast } from '@/lib/toast';
import { preview } from '@/lib/md';
import {
  useNotebooks, useNotes, useTrash, useTags, useNoteActions, whenLabel, type Note,
} from '@/lib/notes';
import { NotebookTable } from '@/components/notes/NotebookTable';
import { BoardShelf } from '@/components/notes/BoardShelf';
import { NoteList } from '@/components/notes/NoteList';
import { NoteEditor } from '@/components/notes/NoteEditor';
import { GraphView } from '@/components/notes/GraphView';
import { Canvas } from '@/components/notes/Canvas';
import { Journal } from '@/components/notes/Journal';
import { JavaLab } from '@/components/JavaLab';
import { useBoards, useCanvasActions, useAllNodes, CANVAS_COLORS, DEFAULT_GRAPH, type Board } from '@/lib/canvas';

/**
 * Notebooks, rebuilt on Evernote's model.
 *
 * You land on the shelf — every notebook, with its count and when it last
 * changed — and open one. Inside, the note list is on the left and the note
 * fills the rest, which is the layout Evernote, Bear and Apple Notes all
 * settled on because it puts the writing surface where the eye already is.
 *
 * The other tabs are Obsidian's: Graph draws the `[[links]]` between notes,
 * Canvas is the infinite board. Journal and Java are unchanged.
 */

const TABS = [
  { id: 'notebooks', label: 'Notebooks', icon: 'book' },
  { id: 'canvas', label: 'Canvas', icon: 'grid' },
  { id: 'graph', label: 'Graph', icon: 'link' },
  { id: 'journal', label: 'Journal', icon: 'pen' },
  { id: 'code', label: 'Java', icon: 'code' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function NotebooksPage() {
  const { phone } = useLayout();
  const { prefs } = usePrefs();
  const [tab, setTab] = useState<Tab>('notebooks');

  const { data: notebooks = [], isPending } = useNotebooks();
  const { data: notes = [] } = useNotes();
  const { data: trash = [] } = useTrash();
  const { data: tags = {} } = useTags();
  const A = useNoteActions();

  // Canvases and graph views are notebooks too, so the shelf lists them and the
  // page owns making one — a tab is a place to work, not the only door in.
  const { data: boards = [] } = useBoards();
  const { data: allNodes = [] } = useAllNodes();
  const B = useCanvasActions(null);

  const [nbId, setNbId] = useState<string | null>(null);
  /** Which canvas is open. Here rather than in Canvas, so a dot in the graph
      can open the board it belongs to. */
  const [boardId, setBoardId] = useState<string | null>(null);
  /** Graph tab: null shows the shelf, 'auto' the all-notes view, else a board id. */
  const [graphId, setGraphId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [inTrash, setInTrash] = useState(false);

  // Back closes the note, then the notebook, before it changes section.
  useOverlayBack(!!nbId, () => { setNbId(null); setNoteId(null); });
  useOverlayBack(!!noteId && phone, () => setNoteId(null));
  useOverlayBack(inTrash, () => setInTrash(false));
  useOverlayBack(tab === 'canvas' && !!boardId, () => setBoardId(null));
  useOverlayBack(tab === 'graph' && !!graphId, () => setGraphId(null));

  const notebook = notebooks.find((b) => b.id === nbId) ?? null;
  const mine = useMemo(() => notes.filter((n) => n.notebook_id === nbId), [notes, nbId]);
  const note = mine.find((n) => n.id === noteId) ?? null;

  // Synchronize tab with dropdown picks and URL query parameter
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFocus = () => {
      const sp = new URLSearchParams(window.location.search);
      const focus = sp.get('focus') || sp.get('tab');
      if (focus) {
        const lower = focus.toLowerCase();
        if (lower === 'notebooks' || lower === 'notes') setTab('notebooks');
        else if (lower === 'canvas' || lower === 'canvases') setTab('canvas');
        else if (lower === 'graph') setTab('graph');
        else if (lower === 'journal') setTab('journal');
        else if (lower === 'java' || lower === 'code') setTab('code');
      }
    };

    syncFocus();
    window.addEventListener('popstate', syncFocus);
    const onCustomFocus = (e: Event) => {
      const detail = (e as CustomEvent<{ section: string; focus: string }>).detail;
      if (detail && detail.section === 'notebooks' && detail.focus) {
        const lower = detail.focus.toLowerCase();
        if (lower === 'notebooks' || lower === 'notes') setTab('notebooks');
        else if (lower === 'canvas' || lower === 'canvases') setTab('canvas');
        else if (lower === 'graph') setTab('graph');
        else if (lower === 'journal') setTab('journal');
        else if (lower === 'java' || lower === 'code') setTab('code');
      }
    };
    window.addEventListener('basedly:focus', onCustomFocus);

    return () => {
      window.removeEventListener('popstate', syncFocus);
      window.removeEventListener('basedly:focus', onCustomFocus);
    };
  }, []);

  // A notebook that goes away (deleted, or the last note moved out from under
  // the selection) must not leave the screen pointing at nothing.
  useEffect(() => { if (nbId && !notebook) { setNbId(null); setNoteId(null); } }, [nbId, notebook]);
  useEffect(() => { if (!phone && !note && mine.length) setNoteId(mine[0].id); }, [phone, note, mine]);

  const newBoard = (kind: 'canvas' | 'graph') => {
    const id = crypto.randomUUID();
    const mine = boards.filter((b) => b.kind === kind);
    B.newBoard.mutate({
      id, kind,
      name: kind === 'graph'
        ? (mine.length ? `Graph ${mine.length + 1}` : 'Everything')
        : `Canvas ${mine.length + 1}`,
      color: CANVAS_COLORS[(mine.length + (kind === 'graph' ? 2 : 0)) % CANVAS_COLORS.length],
      position: mine.length,
      viewport: { x: 0, y: 0, z: 1 },
      settings: kind === 'graph' ? DEFAULT_GRAPH : {},
    });
    if (kind === 'canvas') setBoardId(id); else setGraphId(id);
    setTab(kind === 'graph' ? 'graph' : 'canvas');
  };

  const openBoard = (b: Board) => {
    if (b.kind === 'graph') { setGraphId(b.id); setTab('graph'); return; }
    setBoardId(b.id);
    setTab('canvas');
  };

  // What "back" means on this screen, in the order things were opened.
  const canGoBack = inTrash || !!nbId || !!(phone && noteId);
  const stepBack = () => {
    if (inTrash) { setInTrash(false); return; }
    if (noteId && phone) { setNoteId(null); return; }
    if (nbId) { setNbId(null); setNoteId(null); return; }
  };

  const openNotebook = (id: string, pick?: string) => {
    setNbId(id);
    setNoteId(pick ?? null);
    setInTrash(false);
  };

  const newNotebook = () => {
    const id = crypto.randomUUID();
    const formattedDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const name = `Notebook · ${formattedDate}`;
    A.newNotebook.mutate({ id, name, color: PAL.violet, position: notebooks.length });
    setNbId(id);
    setNoteId(null);
  };

  const newNote = (title?: string) => {
    if (!nbId) return;
    const id = crypto.randomUUID();
    const formattedDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const noteTitle = title || `Note · ${formattedDate}`;
    A.newNote.mutate({ id, notebook_id: nbId, title: noteTitle, body: '' });
    setNoteId(id);
  };

  const newMathNote = () => {
    if (!nbId) return;
    const id = crypto.randomUUID();
    const formattedDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const title = `Math Equation · ${formattedDate}`;
    const body = `# ${title}

$$
f(x) = \\int_{0}^{\\infty} e^{-x^2} \\, dx = \\frac{\\sqrt{\\pi}}{2}
$$

### Proof & Derivation
1. Let $I = \\int_{0}^{\\infty} e^{-x^2} dx$
2. In polar coordinates:
$$
I^2 = \\int_{0}^{\\pi/2} \\int_{0}^{\\infty} e^{-r^2} r \\, dr \\, d\\theta = \\frac{\\pi}{4}
$$
3. Therefore $I = \\frac{\\sqrt{\\pi}}{2}$.
`;
    A.newNote.mutate({ id, notebook_id: nbId, title, body });
    setNoteId(id);
    toast('Created Math Equation Note');
  };

  /** Open a note wherever it lives — a `[[link]]` can point into another notebook. */
  const goToNote = (id: string) => {
    const target = notes.find((n) => n.id === id);
    if (!target) return;
    setNbId(target.notebook_id);
    setNoteId(id);
  };

  const removeNote = (n: Note) => {
    A.deleteWithUndo(n);
    if (noteId === n.id) setNoteId(null);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        flex: 'none', padding: phone ? '12px 14px 10px' : '16px 22px 12px',
        display: 'flex', alignItems: 'center', gap: phone ? 0 : 14,
      }}>
        {/* Back out of wherever you are, one step at a time: the open note,
            then the notebook, then the shelf. The mouse's side button does the
            same thing; this is the one you can see. */}
        {canGoBack && (
          <button onClick={stepBack} className="hov k-squish" aria-label="Back"
            style={{
              flex: 'none', width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center',
              border: '1px solid var(--line2)', marginRight: 2,
            }}>
            <Icon name="back" size={15} color="var(--tx2)" />
          </button>
        )}

        <TabRail tabs={TABS} value={tab} onChange={setTab} phone={phone} label="Notebook views" />

        {!phone && tab === 'notebooks' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, marginLeft: 'auto' }}>
            <Crumbs
              notebook={notebook?.name ?? null}
              note={note?.title ?? null}
              inTrash={inTrash}
              onRoot={() => { setNbId(null); setNoteId(null); setInTrash(false); }} />
            <button onClick={() => { setInTrash((v) => !v); setNbId(null); }} className="hov"
              aria-pressed={inTrash} title="Trash"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 11px', minHeight: 32,
                borderRadius: 9, border: `1px solid ${inTrash ? 'var(--acc)' : 'var(--line2)'}`,
                fontSize: 11.5, fontWeight: 700, color: inTrash ? 'var(--accTx)' : 'var(--tx2)',
              }}>
              <Icon name="trash" size={13} color={inTrash ? 'var(--accTx)' : 'var(--tx3)'} />
              Trash{trash.length ? ` ${trash.length}` : ''}
            </button>
          </div>
        )}
      </div>

      <div style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        padding: phone ? '0 14px 20px' : '0 22px 20px',
      }}>
        {/* Only the shelf waits on a query; the tab rail and the trash list
            above it are already drawn. */}
        {tab === 'notebooks' && isPending && !inTrash && !notebook && <ShelfSkeleton count={6} />}

        {tab === 'notebooks' && !(isPending && !inTrash && !notebook) && (
          inTrash ? (
            <TrashList
              notes={trash}
              onRestore={(n) => { A.restoreNote.mutate({ id: n.id }); toast(`Restored “${n.title || 'Untitled'}”`); }}
              onEmpty={() => void confirmAsk('Empty the trash?', {
                message: `${trash.length} note${trash.length === 1 ? '' : 's'} will be gone for good.`,
                confirmLabel: 'Delete forever', danger: true,
              }).then((yes) => { if (yes) { A.purge.mutate({ ids: trash.map((n) => n.id) }); toast('Trash emptied'); } })} />
          ) : !notebook ? (
            <>
              {phone && (
                <button onClick={() => setInTrash(true)} className="hov" style={{
                  display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 8,
                  padding: '6px 11px', minHeight: 32, borderRadius: 9, border: '1px solid var(--line2)',
                  fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)',
                }}>
                  <Icon name="trash" size={13} color="var(--tx3)" />Trash{trash.length ? ` ${trash.length}` : ''}
                </button>
              )}
              <div data-tour="notebooks-sidebar" style={{ width: '100%' }}>
                <NotebookTable
                  notebooks={notebooks} notes={notes} boards={boards}
                  onOpen={(id) => openNotebook(id)}
                  onOpenNote={(bid, nid) => openNotebook(bid, nid)}
                  onNew={newNotebook}
                  onRename={(b, name) => { A.editNotebook.mutate({ id: b.id, patch: { name } }); toast('Renamed'); }}
                  onRecolour={(b, color) => A.editNotebook.mutate({ id: b.id, patch: { color } })}
                  onDelete={(b) => { A.delNotebook.mutate({ id: b.id }); toast(`Deleted “${b.name}”`); }}
                  onNewBoard={newBoard}
                  onOpenBoard={openBoard}
                  onRenameBoard={(b) => void ask(`Rename ${b.kind === 'graph' ? 'graph' : 'canvas'}`, { initial: b.name, placeholder: 'Name' })
                    .then((n) => { if (n) B.saveBoard.mutate({ id: b.id, patch: { name: n } }); })}
                  onDeleteBoard={(b) => {
                    B.delBoard.mutate({ id: b.id });
                    toast(`Deleted “${b.name}”`, () => B.restoreBoard.mutate({ id: b.id }));
                  }} />
              </div>
            </>
          ) : (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14 }}>
              {(!phone || !note) && (
                <div data-tour="notebooks-sidebar" style={{ height: '100%', display: 'flex' }}>
                  <NoteList
                    notebook={notebook} notes={mine} tags={tags} notebooks={notebooks}
                    selected={noteId} phone={phone}
                    onPick={setNoteId}
                    onNew={() => newNote()}
                    onNewMathNote={newMathNote}
                    onDelete={removeNote}
                    onMove={(n, id) => { A.moveNote.mutate({ id: n.id, notebook_id: id }); toast('Moved'); }}
                    onRename={(n, title) => A.saveNote.mutate({ id: n.id, notebook_id: n.notebook_id, title, body: n.body })} />
                </div>
              )}

              {note ? (
                <div data-tour="notebooks-editor" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                  <NoteEditor
                    key={note.id}
                    note={note} notes={notes} tags={tags[note.id] ?? []} phone={phone}
                    onSave={(v) => A.saveNote.mutate({ id: note.id, notebook_id: note.notebook_id, ...v })}
                    onDelete={() => removeNote(note)}
                    onPickNote={goToNote}
                    onNewNote={(title) => newNote(title)}
                    onSetTags={(t) => A.setTags.mutate({ note_id: note.id, tags: t })}
                    onBack={() => setNoteId(null)} />
                </div>
              ) : !phone && (
                <div style={{
                  flex: 1, display: 'grid', placeItems: 'center', background: 'var(--card)',
                  borderRadius: 14, boxShadow: 'var(--sh)', fontSize: 12.5, color: 'var(--tx3)',
                }}>
                  Pick a note, or make one.
                </div>
              )}
            </div>
          )
        )}

        {/* Canvas and Graph land on a shelf, the way Notebooks does. Opening a
            board is a choice you make from a list, not one the tab makes for
            you out of whichever board happened to be last. */}
        {tab === 'graph' && !graphId && (
          <BoardShelf
            kind="graph" boards={boards} nodes={allNodes}
            onOpen={openBoard}
            onNew={() => newBoard('graph')}
            onOpenAuto={() => setGraphId('auto')}
            onRename={(b) => void ask('Rename graph', { initial: b.name, placeholder: 'Name' })
              .then((n) => { if (n) B.saveBoard.mutate({ id: b.id, patch: { name: n } }); })}
            onRecolour={(b, color) => B.saveBoard.mutate({ id: b.id, patch: { color } })}
            onDelete={(b) => {
              B.delBoard.mutate({ id: b.id });
              toast(`Deleted “${b.name}”`, () => B.restoreBoard.mutate({ id: b.id }));
            }} />
        )}

        {tab === 'graph' && graphId && (
          <GraphView notes={notes} notebooks={notebooks} phone={phone}
            boardId={graphId === 'auto' ? null : graphId}
            onBack={() => setGraphId(null)}
            onOpenNote={(id) => { setTab('notebooks'); goToNote(id); }}
            onOpenBoard={(id) => { setTab('canvas'); setBoardId(id); }} />
        )}

        {tab === 'canvas' && !boardId && (
          <BoardShelf
            kind="canvas" boards={boards} nodes={allNodes}
            onOpen={openBoard}
            onNew={() => newBoard('canvas')}
            onRename={(b) => void ask('Rename canvas', { initial: b.name, placeholder: 'Name' })
              .then((n) => { if (n) B.saveBoard.mutate({ id: b.id, patch: { name: n } }); })}
            onRecolour={(b, color) => B.saveBoard.mutate({ id: b.id, patch: { color } })}
            onDelete={(b) => {
              B.delBoard.mutate({ id: b.id });
              toast(`Deleted “${b.name}”`, () => B.restoreBoard.mutate({ id: b.id }));
            }} />
        )}

        {tab === 'canvas' && boardId && (
          <Canvas notes={notes} phone={phone} boardId={boardId} onBoard={setBoardId}
            onOpenNote={(id) => { setTab('notebooks'); goToNote(id); }} />
        )}
        {tab === 'journal' && <Journal />}
        {tab === 'code' && <JavaLab />}
      </div>
    </div>
  );
}

function Crumbs({
  notebook, note, inTrash, onRoot,
}: { notebook: string | null; note: string | null; inTrash: boolean; onRoot: () => void }) {
  const s: React.CSSProperties = {
    fontSize: 11.5, fontWeight: 500, color: 'var(--tx3)', minWidth: 0,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  };
  if (inTrash) return <div style={s}>Trash</div>;
  if (!notebook) return <div style={s}>All notebooks</div>;
  return (
    <div style={{ ...s, display: 'flex', gap: 6, alignItems: 'center' }}>
      <button onClick={onRoot} className="k-underline" style={{ font: 'inherit', color: 'var(--tx2)' }}>Notebooks</button>
      <span>›</span><span>{notebook}</span>
      {note && <><span>›</span><span style={{ color: 'var(--tx2)' }}>{note}</span></>}
    </div>
  );
}

function TrashList({
  notes, onRestore, onEmpty,
}: { notes: Note[]; onRestore: (n: Note) => void; onEmpty: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>
          {notes.length ? `${notes.length} deleted note${notes.length === 1 ? '' : 's'}` : 'The trash is empty.'}
        </div>
        {notes.length > 0 && (
          <button onClick={onEmpty} className="hov" style={{
            marginLeft: 'auto', padding: '6px 12px', minHeight: 32, borderRadius: 9,
            border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700, color: PAL.coral,
          }}>
            Empty trash
          </button>
        )}
      </div>

      <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {notes.map((n) => (
          <div key={n.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
            background: 'var(--card)', boxShadow: 'var(--sh)', flex: 'none',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)' }}>{n.title || 'Untitled'}</div>
              <div style={{ fontSize: 11, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preview(n.body, 90) || 'Empty'}
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--tx3)', flex: 'none' }}>
              {n.deleted_at ? whenLabel(n.deleted_at) : ''}
            </div>
            <button onClick={() => onRestore(n)} className="hov" style={{
              flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 11px', minHeight: 32,
              borderRadius: 9, border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)',
            }}>
              <Icon name="undo" size={13} color="var(--tx3)" />Restore
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
