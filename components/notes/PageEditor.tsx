'use client';
/**
 * N.editor for Page and Recall: write in place, formatting appears as you type
 * (# for a heading, - for a list, [ ] for a task, > for a quote, ``` for code),
 * a / menu for blocks, undo and redo up in the strip, block tools along the
 * bottom. Recall adds Test me: every heading is a question on a spaced schedule.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Icon } from '../Icon';
import { usePageDraft } from './usePageDraft';
import { textHtml, writeText, readRecall, writeRecall, recallCards, nextReview, type RecallDoc } from '@/lib/noteTypes';
import { ymd } from '@/lib/days';
import type { Note } from '@/lib/notes';
import './page-editor.css';

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
  const save = (next: RecallDoc) => { setDoc(next); change({ body: recall ? writeRecall(next) : writeText(next.html) }); };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), Highlight, TaskList, TaskItem.configure({ nested: true })],
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

  const words = (editor?.getText() ?? '').trim().split(/\s+/).filter(Boolean).length;
  return <div className="pe" data-part="N.editor">
    {editor && <StripTools editor={editor} />}
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
    {!testing && editor && <div className="pe-bar" role="toolbar" aria-label="Blocks">
      {BLOCKS.map(b => <button key={b.label} title={`${b.label} (${b.hint})`} onClick={() => b.run(editor)}>{b.hint}</button>)}
      <button title="Bold (Ctrl B)" aria-pressed={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
      <button title="Highlight (==text==)" aria-pressed={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()}>==</button>
      <span className="pe-status" role="status">{waiting ? 'Saving' : 'Saved'}<span>{words} words</span><span>{Math.max(1, Math.round(words / 220))} min read</span></span>
    </div>}
  </div>;
}
