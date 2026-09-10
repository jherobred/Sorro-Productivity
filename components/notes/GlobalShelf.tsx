'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { RowsSkeleton } from '../Skeleton';
import { useOverlayBack } from '@/lib/nav';
import { Icon, type IconName } from '../Icon';
import { whenLabel, type Note, type Notebook } from '@/lib/notes';
import { preview } from '@/lib/md';
import { useScratch, TAG_COLOR } from '@/lib/scratch';
import type { Board } from '@/lib/canvas';

const QuickNotes = dynamic(() => import('./QuickNotes').then(m => m.QuickNotes), { loading: () => <RowsSkeleton label="Loading quick thoughts" rows={3}/> });

/**
 * The library — paper, not cover art.
 *
 * A notebook is an index card with a coloured spine and the first three notes
 * showing through ruled lines, so "what is in there?" is answered without
 * opening anything. Clicking one peeks inside over the page rather than
 * navigating away; only Open notebook leaves the library.
 *
 * The generative gradient covers are gone on purpose: they were placeholder
 * art standing where the notebook's own contents should be.
 */

interface GlobalShelfProps {
  notebooks: Notebook[];
  notes: Note[];
  boards: Board[];
  onOpenNotebook: (id: string) => void;
  onOpenNote: (notebookId: string, noteId: string) => void;
  onOpenBoard: (board: Board) => void;
  onJumpTab: (tab: 'notebooks'|'canvas'|'graph'|'journal'|'code') => void;
  onNewNotebook: () => void;
  onMoveNote?: (noteId: string, notebookId: string) => void;
  /** Create a note inside a given notebook and open it. */
  onNewNote?: (notebookId: string) => void;
}

const MODES: { id: 'notebooks'|'canvas'|'graph'|'journal'|'code'|'quick'; name: string; desc: string; icon: IconName }[] = [
  { id: 'notebooks', name: 'Write', desc: 'Notes, lists & documents', icon: 'pen' },
  { id: 'canvas', name: 'Whiteboard', desc: 'Draw & arrange ideas', icon: 'grid' },
  { id: 'graph', name: 'Graph', desc: 'Find the connections', icon: 'link' },
  { id: 'journal', name: 'Journal', desc: 'Make sense of your day', icon: 'book' },
  { id: 'code', name: 'Java', desc: 'Code, trace & learn', icon: 'code' },
  { id: 'quick', name: 'Quick note', desc: 'Catch it before it goes', icon: 'spark' },
];

/** How many notebooks the library shows before "See all" takes over. */
const SHELF = 4;
/** Note titles visible through a card's ruled lines. */
const PEEK_LINES = 3;

export function GlobalShelf({
  notebooks, notes, boards, onOpenNotebook, onOpenNote, onOpenBoard, onJumpTab, onNewNotebook, onMoveNote, onNewNote,
}: GlobalShelfProps) {
  const [quick, setQuick] = useState(false);
  const [query, setQuery] = useState('');
  const [dropTarget, setDropTarget] = useState<string|null>(null);
  /** Which notebook is peeked, and where its card was when it was clicked. */
  const [peek, setPeek] = useState<{ id: string; x: number; y: number }|null>(null);
  const { data: scratch = [] } = useScratch();

  const term = query.toLocaleLowerCase().trim();
  const match = (s: string) => !term || s.toLocaleLowerCase().includes(term);

  const byBook = useMemo(() => {
    const m = new Map<string, Note[]>();
    for (const n of notes) {
      const list = m.get(n.notebook_id);
      if (list) list.push(n);
      else m.set(n.notebook_id, [n]);
    }
    for (const list of m.values()) list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return m;
  }, [notes]);

  const recent = useMemo(
    () => notes.filter(n => match(`${n.title} ${n.body}`)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6),
    [notes, term],
  );
  const shelf = useMemo(() => notebooks.filter(b => match(b.name)), [notebooks, term]);
  const shown = shelf.slice(0, SHELF);

  /** "New note" with no notebook picked lands in the one you touched last. */
  const defaultNotebook = notes.length
    ? [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0].notebook_id
    : notebooks[0]?.id;
  const defaultName = notebooks.find(b => b.id === defaultNotebook)?.name;

  const peeked = peek ? notebooks.find(b => b.id === peek.id) ?? null : null;
  const colour = (id: string) => notebooks.find(b => b.id === id)?.color ?? 'var(--line2)';

  if (quick) return <QuickNotes onBack={() => setQuick(false)}/>;

  return <div className="notes-library">

    <div className="library-bar">
      <div className="library-heading">
        <h1>Library</h1>
        <span className="library-meta">{notebooks.length} notebook{notebooks.length === 1 ? '' : 's'} · {notes.length} note{notes.length === 1 ? '' : 's'}</span>
      </div>
      <label className="library-search">
        <Icon name="search" size={15}/>
        <input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search your notes and notebooks" placeholder="Search notes and notebooks"/>
      </label>
      {onNewNote && defaultNotebook && (
        <button className="studio-button" title={defaultName ? `New note in ${defaultName}` : 'New note'} onClick={() => onNewNote(defaultNotebook)}>
          <Icon name="pen" size={15}/>New note
        </button>
      )}
      <button className="studio-button primary" onClick={onNewNotebook}><Icon name="bookPlus" size={15}/>New notebook</button>
    </div>

    <div className="library-modes-label">Ways to work</div>
    <div className="library-modes" aria-label="Ways to take notes">
      {MODES.map(m => (
        <button className="library-mode" key={m.id} onClick={() => m.id === 'quick' ? setQuick(true) : onJumpTab(m.id)}>
          <Icon name={m.icon} size={20} color="var(--studio-blue)"/>
          <strong>{m.name}</strong>
          <small>{m.desc}</small>
        </button>
      ))}
    </div>

    <div className="library-section-head">
      <h2>Notebooks</h2>
      {shelf.length > SHELF && <button className="studio-text-button" onClick={() => onJumpTab('notebooks')}>See all {shelf.length}</button>}
    </div>
    <div className="notebook-grid">
      {shown.map(nb => {
        const kids = byBook.get(nb.id) ?? [];
        return <button
          key={nb.id}
          className={`notebook-card ${dropTarget === nb.id ? 'is-drop-target' : ''}`}
          aria-label={`Peek inside ${nb.name}`}
          onDragOver={e => { if (e.dataTransfer.types.includes('application/x-basedly-note')) { e.preventDefault(); setDropTarget(nb.id); } }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={e => {
            e.preventDefault(); setDropTarget(null);
            const id = e.dataTransfer.getData('application/x-basedly-note');
            if (notes.some(n => n.id === id)) onMoveNote?.(id, nb.id);
          }}
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect();
            setPeek({ id: nb.id, x: r.left, y: r.top });
          }}
        >
          <span className="notebook-spine" style={{ background: nb.color }}/>
          <span className="notebook-card-body">
            <span className="notebook-card-head">
              <strong>{nb.name}</strong>
              <Icon name="dots" size={15} color="var(--tx3)"/>
            </span>
            <small className="library-meta">{kids.length} note{kids.length === 1 ? '' : 's'}{kids[0] ? ` · ${whenLabel(kids[0].updated_at)}` : ''}</small>
            <span className="notebook-peek-lines">
              {kids.slice(0, PEEK_LINES).map(n => <span key={n.id}>{n.title || 'Untitled note'}</span>)}
              {!kids.length && <span className="is-empty">Nothing written yet.</span>}
            </span>
          </span>
        </button>;
      })}
      {!shelf.length && (
        <div className="today-empty">
          <strong>{term ? 'No notebook by that name.' : 'Your first notebook starts here.'}</strong>
          {term ? 'Try a different word or clear the search.' : 'A notebook keeps a subject, project, or collection together.'}
        </div>
      )}
    </div>

    <div className="library-columns">
      <section>
        <div className="library-section-head">
          <h2>Recent</h2>
          <span className="library-meta">Across all notebooks</span>
        </div>
        {recent.map(n => <button
          className="recent-row"
          key={n.id}
          draggable={!!onMoveNote}
          onDragStart={e => { e.dataTransfer.setData('application/x-basedly-note', n.id); e.dataTransfer.effectAllowed = 'move'; }}
          onClick={() => onOpenNote(n.notebook_id, n.id)}
        >
          <span className="recent-spine" style={{ background: colour(n.notebook_id) }}/>
          <span>
            <strong>{n.title || 'Untitled note'}</strong>
            <small>{preview(n.body) || 'A fresh page.'}</small>
          </span>
          <time className="library-meta">{whenLabel(n.updated_at)}</time>
        </button>)}
        {!recent.length && (
          <div className="today-empty">
            <strong>{term ? 'No matching thoughts yet.' : 'Nothing written yet.'}</strong>
            {term ? 'Try a different word or clear your search.' : 'Create a notebook, then add your first note.'}
          </div>
        )}
      </section>

      <section>
        <div className="library-section-head">
          <h2>Quick notes</h2>
          <button className="library-icon-button" aria-label="Add a quick note" onClick={() => setQuick(true)}><Icon name="plus" size={14}/></button>
        </div>
        <div className="sticky-grid">
          {scratch.slice(0, 3).map(s => {
            const tint = s.color || TAG_COLOR[s.tag] || 'var(--studio-blue)';
            return <button className="sticky-note" key={s.id} onClick={() => setQuick(true)} style={{ ['--sticky' as string]: tint }}>
              <span className="sticky-body">{s.text}</span>
              <span className="sticky-foot"><em>{s.tag}</em><time>{whenLabel(s.created_at)}</time></span>
            </button>;
          })}
          {!scratch.length && <div className="today-empty">The idea before it becomes a document goes here.</div>}
        </div>

        <div className="library-section-head" style={{ marginTop: 26 }}><h2>Boards</h2></div>
        {boards.slice(0, 4).map(b => <button className="recent-row" key={b.id} onClick={() => onOpenBoard(b)}>
          <span className="recent-spine" style={{ background: b.color }}/>
          <span><strong>{b.name}</strong><small>{b.kind === 'graph' ? 'Graph' : 'Whiteboard'}</small></span>
          <Icon name="chev" size={15}/>
        </button>)}
        {!boards.length && <button className="studio-text-button" onClick={() => onJumpTab('canvas')}>Open a whiteboard<Icon name="chev" size={15}/></button>}
      </section>
    </div>

    {peeked && peek && <NotebookPeek
      notebook={peeked}
      notes={byBook.get(peeked.id) ?? []}
      at={peek}
      onClose={() => setPeek(null)}
      onOpenNote={id => { setPeek(null); onOpenNote(peeked.id, id); }}
      onOpen={() => { setPeek(null); onOpenNotebook(peeked.id); }}
      onNewNote={onNewNote && (() => { setPeek(null); onNewNote(peeked.id); })}
    />}
  </div>;
}

/** Panel size, used to keep the popup on screen next to the card that opened it. */
const PEEK_W = 520;
const PEEK_H = 460;

function NotebookPeek({
  notebook, notes, at, onClose, onOpenNote, onOpen, onNewNote,
}: {
  notebook: Notebook;
  notes: Note[];
  at: { x: number; y: number };
  onClose: () => void;
  onOpenNote: (id: string) => void;
  onOpen: () => void;
  onNewNote?: (() => void) | undefined;
}) {
  const [q, setQ] = useState('');
  useOverlayBack(true, onClose);
  // Back gesture is useOverlayBack's; Escape is this overlay's own.
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const term = q.toLocaleLowerCase().trim();
  const shown = notes.filter(n => !term || `${n.title} ${n.body}`.toLocaleLowerCase().includes(term));
  const listed = shown.slice(0, 6);

  if (typeof document === 'undefined') return null;
  // Grow out of the card, but never off the edge of the window.
  const left = Math.max(12, Math.min(at.x, window.innerWidth - PEEK_W - 16));
  const top = Math.max(12, Math.min(at.y, window.innerHeight - PEEK_H - 16));

  return createPortal(
    <div className="peek-scrim" onClick={onClose} >
      <div className="peek-panel" role="dialog" aria-modal="true" aria-label={notebook.name}
        style={{ left, top }} onClick={e => e.stopPropagation()}>
        <span className="notebook-spine" style={{ background: notebook.color }}/>
        <div className="peek-body">
          <div className="peek-head">
            <div>
              <strong>{notebook.name}</strong>
              <small className="library-meta">{notes.length} note{notes.length === 1 ? '' : 's'}{notes[0] ? ` · edited ${whenLabel(notes[0].updated_at)}` : ''}</small>
            </div>
            <button className="library-icon-button" aria-label="Close" onClick={onClose}><Icon name="close" size={13}/></button>
          </div>

          <label className="peek-search">
            <Icon name="search" size={14}/>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} aria-label={`Find in ${notebook.name}`} placeholder="Find in this notebook"/>
          </label>

          <div className="peek-lines">
            {listed.map(n => <button key={n.id} onClick={() => onOpenNote(n.id)}>
              <span>{n.title || 'Untitled note'}</span>
              <time className="library-meta">{whenLabel(n.updated_at)}</time>
            </button>)}
            {!listed.length && <p className="library-meta">{term ? 'Nothing matches.' : 'This notebook is empty.'}</p>}
          </div>

          <div className="peek-foot">
            {shown.length > listed.length && <span className="library-meta">{shown.length - listed.length} more</span>}
            {onNewNote && <button className="studio-button" onClick={onNewNote}><Icon name="plus" size={14}/>New note</button>}
            <button className="studio-button primary" onClick={onOpen}>Open notebook<Icon name="chev" size={14}/></button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
