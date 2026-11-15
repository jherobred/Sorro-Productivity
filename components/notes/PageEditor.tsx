'use client';
/**
 * N.editor for Note and Recall: write in place, formatting appears as you type
 * (# for a heading, - for a list, [ ] for a task, > for a quote, ``` for code),
 * a / menu for blocks, undo and redo up in the strip. A Note is arranged the
 * way Notes is: its tools across the top (checklist, the Aa menu, table, scan),
 * then the time it was edited, the title and the body. Every format in the Aa
 * menu applies to the selection, not the whole note. Recall keeps its block
 * tools along the bottom and adds Test me: every heading is a question on a
 * spaced schedule.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Icon } from '../Icon';
import { usePageDraft } from './usePageDraft';
import { textHtml, writeText, readRecall, writeRecall, recallCards, nextReview, type RecallDoc } from '@/lib/noteTypes';
import { ymd } from '@/lib/days';
import type { Note } from '@/lib/notes';
import type { ScanResult } from './ScanSheet';
import './page-editor.css';

const ScanSheet = dynamic(() => import('./ScanSheet').then(m => m.ScanSheet), { ssr: false });

type Block = { label: string; hint: string; run: (e: Editor) => void };
const BLOCKS: Block[] = [
  { label: 'Heading', hint: '#', run: e => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'Subheading', hint: '###', run: e => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: 'Bullet list', hint: '-', run: e => e.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', hint: '1.', run: e => e.chain().focus().toggleOrderedList().run() },
  { label: 'Task list', hint: '[ ]', run: e => e.chain().focus().toggleTaskList().run() },
  { label: 'Quote', hint: '>', run: e => e.chain().focus().toggleBlockquote().run() },
  { label: 'Code', hint: '```', run: e => e.chain().focus().toggleCodeBlock().run() },
  { label: 'Divider', hint: '---', run: e => e.chain().focus().setHorizontalRule().run() },
];

/** The Aa menu's paragraph styles, as Notes names them. Each applies to the paragraph the cursor is in. */
const STYLES: { label: string; active: (e: Editor) => boolean; run: (e: Editor) => void }[] = [
  { label: 'Title', active: e => e.isActive('heading', { level: 1 }), run: e => e.chain().focus().setHeading({ level: 1 }).run() },
  { label: 'Heading', active: e => e.isActive('heading', { level: 2 }), run: e => e.chain().focus().setHeading({ level: 2 }).run() },
  { label: 'Subheading', active: e => e.isActive('heading', { level: 3 }), run: e => e.chain().focus().setHeading({ level: 3 }).run() },
  { label: 'Body', active: e => e.isActive('paragraph'), run: e => e.chain().focus().setParagraph().run() },
  { label: 'Monospaced', active: e => e.isActive('codeBlock'), run: e => e.chain().focus().toggleCodeBlock().run() },
];

/** Inline formats. Each toggles a mark on the selection only. */
const MARKS = [
  { name: 'bold', label: 'Bold', icon: 'bold', run: (e: Editor) => e.chain().focus().toggleBold().run() },
  { name: 'italic', label: 'Italic', icon: 'italic', run: (e: Editor) => e.chain().focus().toggleItalic().run() },
  { name: 'underline', label: 'Underline', icon: 'underline', run: (e: Editor) => e.chain().focus().toggleUnderline().run() },
  { name: 'strike', label: 'Strikethrough', icon: 'strike', run: (e: Editor) => e.chain().focus().toggleStrike().run() },
  { name: 'highlight', label: 'Highlight', icon: 'highlighter', run: (e: Editor) => e.chain().focus().toggleHighlight().run() },
] as const;

const editedAt = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) + ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

/** A Note's tools, across the top. A press keeps the selection, so a format lands on what was selected. */
function NoteTools({ editor, onScan }: { editor: Editor; onScan: () => void }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const block = (run: () => void) => () => { run(); setOpen(false); };
  return <div className="pe-tools" role="toolbar" aria-label="Note tools">
    <button aria-label="Checklist" title="Checklist" aria-pressed={editor.isActive('taskList')} onMouseDown={keep} onClick={() => editor.chain().focus().toggleTaskList().run()}><Icon name="listCheck" size={18} /></button>
    <div className="pe-aa" ref={menu}>
      <button aria-label="Format" title="Format" aria-haspopup="menu" aria-expanded={open} onMouseDown={keep} onClick={() => setOpen(v => !v)}><Icon name="caseText" size={18} /></button>
      {open && <div className="pe-format" role="menu" aria-label="Format">
        {STYLES.map(st => <button key={st.label} role="menuitemradio" aria-checked={st.active(editor)} className={'pe-style-' + st.label.toLowerCase()} onMouseDown={keep} onClick={block(() => st.run(editor))}>{st.label}</button>)}
        <hr />
        <button role="menuitemcheckbox" aria-checked={editor.isActive('bulletList')} onMouseDown={keep} onClick={block(() => editor.chain().focus().toggleBulletList().run())}><Icon name="listBullet" size={15} />Bulleted list</button>
        <button role="menuitemcheckbox" aria-checked={editor.isActive('orderedList')} onMouseDown={keep} onClick={block(() => editor.chain().focus().toggleOrderedList().run())}><Icon name="listNumber" size={15} />Numbered list</button>
        <button role="menuitemcheckbox" aria-checked={editor.isActive('taskList')} onMouseDown={keep} onClick={block(() => editor.chain().focus().toggleTaskList().run())}><Icon name="listCheck" size={15} />Checklist</button>
        <button role="menuitemcheckbox" aria-checked={editor.isActive('blockquote')} onMouseDown={keep} onClick={block(() => editor.chain().focus().toggleBlockquote().run())}><Icon name="quote" size={15} />Block quote</button>
        <hr />
        <span className="pe-marks" role="group" aria-label="Text style">
          {MARKS.map(m => <button key={m.name} aria-label={m.label} title={m.label} aria-pressed={editor.isActive(m.name)} onMouseDown={keep} onClick={() => m.run(editor)}><Icon name={m.icon} size={15} /></button>)}
        </span>
      </div>}
    </div>
    <button aria-label="Table" title="Table" onMouseDown={keep} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()}><Icon name="table" size={18} /></button>
    <button aria-label="Scan a page" title="Scan a page into this note" onMouseDown={keep} onClick={onScan}><Icon name="camera" size={18} /></button>
    <span className="pe-grow" />
    <button aria-label="Divider" title="Divider" onMouseDown={keep} onClick={() => editor.chain().focus().setHorizontalRule().run()}><Icon name="horizontalLine" size={18} /></button>
  </div>;
}

function StripTools({ editor }: { editor: Editor }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById('strip-actions')), []);
  if (!slot) return null;
  return createPortal(<span className="pe-strip">
    <button className="sx-icon" aria-label="Undo" title="Undo (Ctrl Z)" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Icon name="rotate" size={16} /></button>
    <button className="sx-icon pe-redo" aria-label="Redo" title="Redo (Ctrl Shift Z)" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Icon name="rotate" size={16} /></button>
  </span>, slot);
}

function Test({ doc, onGrade }: { doc: RecallDoc; onGrade: (key: string, grade: 0 | 1 | 2 | 3) => void }) {
  const today = ymd(new Date());
  const cards = recallCards(doc.html);
  const due = cards.filter(c => !doc.schedule[c.key] || doc.schedule[c.key].due <= today);
  const [shown, setShown] = useState(false);
  const card = due[0];
  if (!cards.length) return <p className="pe-empty">Add a heading for each question and write the answer under it. Then come back to test yourself.</p>;
  if (!card) {
    const next = cards.map(c => doc.schedule[c.key]?.due).filter(Boolean).sort()[0];
    return <p className="pe-empty">{cards.length === 1 ? 'The question is' : `All ${cards.length} questions are`} done for today.{next ? ` Next review on ${next}.` : ''}</p>;
  }
  return <div className="pe-card" key={card.key}>
    <p className="pe-count">{due.length} to review</p>
    <h2>{card.question}</h2>
    {shown ? <><div className="pe-answer" dangerouslySetInnerHTML={{ __html: card.answer || '<p>No answer written under this heading yet.</p>' }} />
      <div className="pe-grades" role="group" aria-label="How did you do?">
        {(['Missed it', 'Hard', 'Good', 'Easy'] as const).map((g, i) => <button key={g} onClick={() => { setShown(false); onGrade(card.key, i as 0 | 1 | 2 | 3); }}>{g}</button>)}
      </div></>
      : <button className="sx-pill" onClick={() => setShown(true)}>Show the answer</button>}
  </div>;
}

export function PageEditor({ note, onSave, recall = false }: { note: Note; onSave: (v: { title: string; body: string }) => void; recall?: boolean }) {
  const { draft, change, waiting } = usePageDraft(note, onSave);
  const initial = useMemo(() => recall ? readRecall(note.body) ?? { html: textHtml(note.body) ?? '', schedule: {} } : { html: textHtml(note.body) ?? '', schedule: {} }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [doc, setDoc] = useState<RecallDoc>(initial);
  const [testing, setTesting] = useState(false);
  const [slash, setSlash] = useState<{ x: number; y: number; q: string } | null>(null);
  const [pick, setPick] = useState(0);
  const [scanning, setScanning] = useState(false);
  const save = (next: RecallDoc) => { setDoc(next); change({ body: recall ? writeRecall(next) : writeText(next.html) }); };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), Highlight, TaskList, TaskItem.configure({ nested: true }), ...(recall ? [] : [TableKit.configure({ table: { resizable: false } })])],
    content: initial.html,
    editorProps: { attributes: { class: 'pe-prose', 'aria-label': 'Page text' } },
    onUpdate: ({ editor: e }) => {
      save({ ...doc, html: e.getHTML() });
      const { $from } = e.state.selection;
      const text = $from.parent.textContent;
      if (text.startsWith('/') && $from.parent.type.name === 'paragraph' && !text.includes(' ')) {
        const c = e.view.coordsAtPos($from.pos);
        setSlash({ x: c.left, y: c.bottom + 6, q: text.slice(1).toLowerCase() }); setPick(0);
      } else setSlash(null);
    },
  }, [note.id]);

  const matches = slash ? BLOCKS.filter(b => b.label.toLowerCase().includes(slash.q)) : [];
  const runBlock = (b: Block) => {
    if (!editor) return;
    const { $from } = editor.state.selection;
    editor.chain().focus().deleteRange({ from: $from.start(), to: $from.end() }).run();
    b.run(editor); setSlash(null);
  };
  useEffect(() => {
    if (!slash || !editor) return;
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); setPick(p => (p + 1) % Math.max(1, matches.length)); }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); setPick(p => (p - 1 + matches.length) % Math.max(1, matches.length)); }
      if (ev.key === 'Enter' && matches[pick]) { ev.preventDefault(); ev.stopPropagation(); runBlock(matches[pick]); }
      if (ev.key === 'Escape') setSlash(null);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });

  // The words read off a scan go in where the cursor is, a paragraph a line.
  const addScan = ({ text }: ScanResult) => {
    setScanning(false);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (editor && lines.length) editor.chain().focus().insertContent(lines.map(l => ({ type: 'paragraph', content: [{ type: 'text', text: l }] }))).run();
  };
  const words = (editor?.getText() ?? '').trim().split(/\s+/).filter(Boolean).length;
  return <div className={'pe' + (recall ? '' : ' pe-note')} data-part="N.editor">
    {editor && <StripTools editor={editor} />}
    {!recall && editor && <NoteTools editor={editor} onScan={() => setScanning(true)} />}
    {!recall && <p className="pe-edited">{editedAt(note.updated_at)}<span role="status">{waiting ? 'Saving' : 'Saved'}</span></p>}
    <input className="pe-title" value={draft.title} placeholder="Untitled" aria-label="Title" onChange={e => change({ title: e.target.value })} />
    {recall && <div className="pe-mode" role="tablist" aria-label="Recall mode">
      <button role="tab" aria-selected={!testing} onClick={() => setTesting(false)}>Write</button>
      <button role="tab" aria-selected={testing} onClick={() => setTesting(true)}>Test me</button>
    </div>}
    {testing ? <Test doc={doc} onGrade={(k, g) => save({ ...doc, schedule: { ...doc.schedule, [k]: nextReview(doc.schedule[k], g, ymd(new Date())) } })} />
      : <EditorContent editor={editor} className="pe-body" />}
    {slash && matches.length > 0 && <ul className="pe-slash" role="listbox" aria-label="Insert a block" style={{ left: slash.x, top: slash.y }}>
      {matches.map((b, i) => <li key={b.label} role="option" aria-selected={i === pick}><button onMouseDown={e => { e.preventDefault(); runBlock(b); }}><span>{b.label}</span><kbd>{b.hint}</kbd></button></li>)}
    </ul>}
    {scanning && <ScanSheet doneLabel="Add to this note" onClose={() => setScanning(false)} onDone={addScan} />}
    {recall && !testing && editor && <div className="pe-bar" role="toolbar" aria-label="Blocks">
      {BLOCKS.map(b => <button key={b.label} title={`${b.label} (${b.hint})`} onClick={() => b.run(editor)}>{b.hint}</button>)}
      <button title="Bold (Ctrl B)" aria-pressed={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
      <button title="Highlight (==text==)" aria-pressed={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()}>==</button>
      <span className="pe-status" role="status">{waiting ? 'Saving' : 'Saved'}<span>{words} words</span><span>{Math.max(1, Math.round(words / 220))} min read</span></span>
    </div>}
  </div>;
}
