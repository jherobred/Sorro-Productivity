'use client';

/**
 * A free page: a sheet you can write on anywhere, in any order.
 *
 * A Document is one column of text from top to bottom, and a Board is drawing
 * and photos. This is the third thing OneNote gets right and neither of those
 * covers — a lecture where the diagram belongs beside the definition, and the
 * question you thought of belongs in the margin next to both. Click any empty
 * spot and a note box opens there. Inside a box the writing is properly
 * structured: headings, bullets, numbers, to-dos and quotes, with the shortcut
 * keys they come with.
 *
 * Boxes are the page's own objects, so copy, cut, paste, duplicate, undo and
 * redo work on them as well as on the words inside them.
 */

import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as PE } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Icon, type IconName } from '@/components/Icon';
import { ContextMenu, type CtxItem } from '@/components/ContextMenu';
import { toast } from '@/lib/toast';
import { useTapGuard } from '@/lib/tapGuard';
import { readFreePage, richText, writeFreePage, type FreeBox, type FreePageDocument, type RichNode } from '@/lib/pageKinds';
import type { Note } from '@/lib/notes';
import { usePageDraft } from './usePageDraft';

/** Where a dropped box lands, so a page stays tidy without anyone lining it up. */
const GRID = 8;
const MIN_W = 150;
const NEW_W = 340;
const ROOM_BELOW = 280;
const BLANK: RichNode = { type: 'doc', content: [{ type: 'paragraph' }] };
const TINTS = ['', '#fff3b8', '#d4e8ff', '#d8f0e0', '#ffdfeb', '#e8e1ff'];

type Structure = { id: string; label: string; icon: IconName; run: (e: Editor) => void; on: (e: Editor) => boolean };
const STRUCTURE: Structure[] = [
  { id: 'title', label: 'Title', icon: 'heading', run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), on: (e) => e.isActive('heading', { level: 1 }) },
  { id: 'heading', label: 'Heading', icon: 'text', run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), on: (e) => e.isActive('heading', { level: 2 }) },
  { id: 'body', label: 'Body', icon: 'alignLeft', run: (e) => e.chain().focus().setParagraph().run(), on: (e) => e.isActive('paragraph') },
  { id: 'bullets', label: 'Bullets', icon: 'listBullet', run: (e) => e.chain().focus().toggleBulletList().run(), on: (e) => e.isActive('bulletList') },
  { id: 'numbers', label: 'Numbers', icon: 'listNumber', run: (e) => e.chain().focus().toggleOrderedList().run(), on: (e) => e.isActive('orderedList') },
  { id: 'todo', label: 'To-do', icon: 'listCheck', run: (e) => e.chain().focus().toggleTaskList().run(), on: (e) => e.isActive('taskList') },
  { id: 'quote', label: 'Quote', icon: 'quote', run: (e) => e.chain().focus().toggleBlockquote().run(), on: (e) => e.isActive('blockquote') },
];

const snap = (n: number) => Math.round(n / GRID) * GRID;
const empty = (doc: RichNode) => !richText(doc).trim();
const textDoc = (text: string): RichNode => ({
  type: 'doc',
  content: text.split(/\n{2,}/).map((block) => ({
    type: 'paragraph',
    content: block.trim() ? [{ type: 'text', text: block.replace(/\n/g, ' ').trim() }] : undefined,
  })),
});

/* ------------------------------------------------------------------ reading */

/**
 * A box that is not being written in is drawn from its own data, never from
 * stored markup. The editor is only mounted where the cursor is, so a page of
 * forty notes stays a page of forty notes rather than forty editors.
 */
function Marks({ node }: { node: RichNode }) {
  let out: React.ReactNode = node.text ?? '';
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'underline') out = <u>{out}</u>;
    else if (mark.type === 'strike') out = <s>{out}</s>;
    else if (mark.type === 'code') out = <code>{out}</code>;
    else if (mark.type === 'highlight') out = <mark>{out}</mark>;
  }
  return <>{out}</>;
}

function Nodes({ list }: { list?: RichNode[] }) {
  return <>{(list ?? []).map((node, i) => <Block key={i} node={node} />)}</>;
}

/** Only the box that changed redraws, however often the toolbar is asked how it looks. */
const BoxBody = memo(function BoxBody({ doc }: { doc: RichNode }) {
  return <div className="fp-view"><Nodes list={doc.content} /></div>;
});

function Block({ node }: { node: RichNode }) {
  const kids = <Nodes list={node.content} />;
  switch (node.type) {
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level) || 1));
      const Tag = (['h1', 'h2', 'h3'] as const)[level - 1];
      return <Tag>{kids}</Tag>;
    }
    case 'paragraph': return <p>{node.content?.length ? kids : <br />}</p>;
    case 'bulletList': return <ul>{kids}</ul>;
    case 'orderedList': return <ol start={Number(node.attrs?.start) || undefined}>{kids}</ol>;
    case 'taskList': return <ul className="fp-tasks">{kids}</ul>;
    case 'listItem': return <li>{kids}</li>;
    case 'taskItem': return <li data-checked={node.attrs?.checked ? 'true' : 'false'}><span className="fp-tick" aria-hidden="true">{node.attrs?.checked ? '✓' : ''}</span><div>{kids}</div></li>;
    case 'blockquote': return <blockquote>{kids}</blockquote>;
    case 'codeBlock': return <pre><code>{richText(node)}</code></pre>;
    case 'horizontalRule': return <hr />;
    case 'hardBreak': return <br />;
    case 'text': return <Marks node={node} />;
    default: return kids;
  }
}

/* ------------------------------------------------------------------ writing */

function BoxEditor({ box, onReady, onChange, onDone, onLook }: {
  box: FreeBox;
  onReady: (editor: Editor | null) => void;
  onChange: (doc: RichNode) => void;
  onDone: () => void;
  /** The toolbar reads the cursor's own formatting, so it is told to look again. */
  onLook: () => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    autofocus: 'end',
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), TaskList, TaskItem.configure({ nested: true })],
    content: box.doc as JSONContent,
    editorProps: { attributes: { class: 'fp-text' } },
    onUpdate: ({ editor: live }) => { onChange(live.getJSON() as RichNode); onLook(); },
    onSelectionUpdate: () => onLook(),
    onBlur: () => onDone(),
  });
  useEffect(() => { onReady(editor ?? null); return () => onReady(null); }, [editor, onReady]);
  return <EditorContent editor={editor} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onDone(); } }} />;
}

/* --------------------------------------------------------------------- page */

export function FreePage({ note, onSave }: { note: Note; onSave: (v: { title: string; body: string }) => void }) {
  const { draft, change, waiting } = usePageDraft(note, onSave);
  const [page, setPage] = useState<FreePageDocument>(() => readFreePage(note.body) ?? { version: 1, kind: 'freepage', boxes: [] });
  const pageRef = useRef(page); pageRef.current = page;
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const editingRef = useRef<string | null>(null); editingRef.current = editing;
  const [menu, setMenu] = useState<{ x: number; y: number; items: CtxItem[]; label: string } | null>(null);
  const [step, setStep] = useState(0);
  const [, setLook] = useState(0);
  const look = useCallback(() => setLook((n) => n + 1), []);
  const history = useRef<FreePageDocument[]>([page]); const at = useRef(0);
  const sheet = useRef<HTMLDivElement>(null);
  const editor = useRef<Editor | null>(null);
  /** The box being typed in, kept out of React so a keystroke redraws nothing. */
  const live = useRef<{ id: string; doc: RichNode } | null>(null);
  const waitingFormat = useRef<string | null>(null);
  const clip = useRef<FreeBox[]>([]);
  const gesture = useRef<{ id: string; mode: 'move' | 'width'; x: number; y: number; box: FreeBox } | null>(null);
  const tap = useTapGuard();

  /** Whatever is on the page right now, including words not yet committed. */
  const now = useCallback((): FreePageDocument => {
    const pending = live.current;
    if (!pending) return pageRef.current;
    return { ...pageRef.current, boxes: pageRef.current.boxes.map((b) => (b.id === pending.id ? { ...b, doc: pending.doc } : b)) };
  }, []);

  const commit = useCallback((next: FreePageDocument, record = true) => {
    pageRef.current = next;
    setPage(next);
    change({ body: writeFreePage(next) });
    if (record) {
      const list = history.current.slice(0, at.current + 1);
      list.push(next);
      if (list.length > 60) list.shift();
      history.current = list; at.current = list.length - 1; setStep(at.current);
    }
  }, [change]);

  const undo = (direction: number) => {
    const index = at.current + direction;
    if (index < 0 || index >= history.current.length) return;
    live.current = null;
    setEditing(null);
    at.current = index; setStep(index);
    commit(history.current[index], false);
    setSelected([]);
  };

  /* ---- the boxes */
  const put = (boxes: FreeBox[], record = true) => commit({ ...now(), boxes }, record);
  const patch = (id: string, fields: Partial<FreeBox>, record = true) =>
    put(now().boxes.map((b) => (b.id === id ? { ...b, ...fields } : b)), record);

  const width = () => sheet.current?.clientWidth ?? 900;
  /** Nothing starts off the side of the sheet, however far right it was asked for. */
  const acrossFrom = (x: number, w: number) => Math.max(0, Math.min(snap(x), snap(Math.max(0, width() - w - GRID))));
  const addBox = (x: number, y: number, doc: RichNode = BLANK, focus = true) => {
    const w = Math.min(NEW_W, Math.max(MIN_W, width() - 2 * GRID));
    const box: FreeBox = { id: crypto.randomUUID(), x: acrossFrom(x, w), y: Math.max(0, snap(y)), w, doc };
    put([...now().boxes, box]);
    setSelected([box.id]);
    if (focus) setEditing(box.id);
    return box;
  };
  const removeBoxes = (ids: string[], record = true) => {
    put(now().boxes.filter((b) => !ids.includes(b.id)), record);
    setSelected((list) => list.filter((id) => !ids.includes(id)));
  };
  const duplicate = (ids = selected) => {
    const copies = now().boxes.filter((b) => ids.includes(b.id)).map((b) => ({ ...b, id: crypto.randomUUID(), x: acrossFrom(b.x + 24, b.w), y: snap(b.y + 24) }));
    if (!copies.length) return;
    put([...now().boxes, ...copies]);
    setSelected(copies.map((b) => b.id));
  };
  const nudge = (dx: number, dy: number) => {
    if (!selected.length) return;
    put(now().boxes.map((b) => (selected.includes(b.id) ? { ...b, x: Math.max(0, b.x + dx), y: Math.max(0, b.y + dy) } : b)));
  };

  /** Leaving a box empty takes it away again, so a stray click costs nothing. */
  const stopEditing = useCallback(() => {
    const pending = live.current;
    const id = pending?.id ?? editingRef.current;
    live.current = null;
    setEditing(null);
    const box = id ? pageRef.current.boxes.find((b) => b.id === id) : undefined;
    if (!box) return;
    const doc = pending?.doc ?? box.doc;
    if (empty(doc)) {
      put(pageRef.current.boxes.filter((b) => b.id !== box.id), false);
      setSelected((list) => list.filter((other) => other !== box.id));
      // Its own creation is the only thing that step of history holds, so it goes with it.
      if (at.current > 0 && history.current[at.current].boxes.some((b) => b.id === box.id)) {
        history.current = history.current.slice(0, at.current);
        at.current -= 1; setStep(at.current);
      }
      return;
    }
    if (pending && JSON.stringify(box.doc) !== JSON.stringify(doc)) {
      commit({ ...pageRef.current, boxes: pageRef.current.boxes.map((b) => (b.id === box.id ? { ...b, doc } : b)) });
    }
  }, [commit]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- dragging a box by its bar, and widening it by its edge */
  const drag = (e: PE, box: FreeBox, mode: 'move' | 'width') => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    setSelected([box.id]);
    gesture.current = { id: box.id, mode, x: e.clientX, y: e.clientY, box };
    const scale = (sheet.current?.clientWidth ?? 1) / (sheet.current?.getBoundingClientRect().width ?? 1);
    const onMove = (m: PointerEvent) => {
      const g = gesture.current;
      if (!g) return;
      const dx = (m.clientX - g.x) * scale, dy = (m.clientY - g.y) * scale;
      const next = g.mode === 'width'
        ? { w: Math.max(MIN_W, Math.min(width() - g.box.x - GRID, g.box.w + dx)) }
        : { x: Math.max(0, Math.min(width() - g.box.w, g.box.x + dx)), y: Math.max(0, g.box.y + dy) };
      const boxes = pageRef.current.boxes.map((b) => (b.id === g.id ? { ...b, ...next } : b));
      pageRef.current = { ...pageRef.current, boxes };
      setPage(pageRef.current);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const g = gesture.current;
      gesture.current = null;
      if (!g) return;
      const box2 = pageRef.current.boxes.find((b) => b.id === g.id);
      if (!box2 || (box2.x === g.box.x && box2.y === g.box.y && box2.w === g.box.w)) return;
      put(pageRef.current.boxes.map((b) => (b.id === g.id ? { ...b, x: snap(b.x), y: snap(b.y), w: snap(b.w) } : b)));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /* ---- the sheet itself */
  /**
   * A click on bare paper opens a note there, the way OneNote does, even while
   * another note has the cursor — that one is put away first. Nothing is lost
   * by a stray click, because a note left empty takes itself away again.
   */
  const openAt = (e: React.MouseEvent) => {
    if (!tap.tapped(e)) return;                                   // a scroll, not a tap
    if ((e.target as HTMLElement).closest('[data-box]')) return;
    stopEditing();
    const rect = sheet.current!.getBoundingClientRect();
    addBox(e.clientX - rect.left, e.clientY - rect.top + sheet.current!.scrollTop);
  };

  const format = (item: Structure) => {
    if (editor.current && editing) { item.run(editor.current); return; }
    const id = selected[0];
    if (!id) return;
    waitingFormat.current = item.id;
    setEditing(id);
  };
  const ready = useCallback((live2: Editor | null) => {
    editor.current = live2;
    const wanted = waitingFormat.current;
    if (live2 && wanted) { waitingFormat.current = null; STRUCTURE.find((s) => s.id === wanted)?.run(live2); }
  }, []);

  /* ---- copy, cut and paste of whole boxes */
  const copySelected = (e: React.ClipboardEvent) => {
    const boxes = now().boxes.filter((b) => selected.includes(b.id));
    if (!boxes.length) return null;
    e.preventDefault();
    clip.current = boxes.map((b) => ({ ...b, id: crypto.randomUUID() }));
    e.clipboardData.setData('text/plain', boxes.map((b) => richText(b.doc)).join('\n\n'));
    return boxes;
  };

  /* ---- the page grows to hold whatever is on it */
  const floor = page.boxes.reduce((low, b) => Math.max(low, b.y + (b.h ?? 120)), 0);
  const edge = page.boxes.reduce((right, b) => Math.max(right, b.x + b.w), 0);

  // A box measures itself once it is on the page, so the sheet knows how far it
  // reaches and the notebook list can draw a thumbnail of it.
  useEffect(() => {
    if (editing || !sheet.current) return;
    let changed = false;
    const boxes = pageRef.current.boxes.map((b) => {
      const node = sheet.current!.querySelector<HTMLElement>(`[data-box="${b.id}"]`);
      if (!node) return b;
      const h = Math.round(node.offsetHeight);
      if (Math.abs((b.h ?? 0) - h) < 3) return b;
      changed = true;
      return { ...b, h };
    });
    if (changed) commit({ ...pageRef.current, boxes }, false);
  }, [page.boxes.length, editing, commit]);

  useEffect(() => () => { if (live.current) stopEditing(); }, [stopEditing]);

  const boxMenu = (e: React.MouseEvent, box: FreeBox) => {
    e.preventDefault();
    const ids = selected.includes(box.id) ? selected : [box.id];
    setSelected(ids);
    setMenu({
      x: e.clientX, y: e.clientY, label: 'Note box', items: [
        { icon: 'edit', label: 'Write in it', run: () => setEditing(box.id) },
        { icon: 'copy', label: 'Duplicate', shortcut: 'Ctrl D', run: () => duplicate(ids) },
        { icon: 'layers', label: 'Bring to front', run: () => put([...now().boxes.filter((b) => !ids.includes(b.id)), ...now().boxes.filter((b) => ids.includes(b.id))]) },
        { icon: 'trash', label: 'Delete', danger: true, shortcut: 'Delete', run: () => removeBoxes(ids) },
      ],
    });
  };

  const keys = (e: React.KeyboardEvent) => {
    const typing = !!editing;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z' && !typing) { e.preventDefault(); undo(e.shiftKey ? 1 : -1); return; }
    if (mod && key === 'y' && !typing) { e.preventDefault(); undo(1); return; }
    if (typing) return;                                  // the box owns every other key while it has the cursor
    if (mod && key === 'a') { e.preventDefault(); setSelected(page.boxes.map((b) => b.id)); return; }
    if (mod && key === 'd') { e.preventDefault(); duplicate(); return; }
    if (e.key === 'Escape') { setSelected([]); return; }
    if (e.key === 'Enter' && selected.length === 1) { e.preventDefault(); setEditing(selected[0]); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) { e.preventDefault(); removeBoxes(selected); return; }
    const step2 = e.shiftKey ? 1 : GRID;
    if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-step2, 0); }
    if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step2, 0); }
    if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -step2); }
    if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, step2); }
  };

  const one = selected.length === 1 ? page.boxes.find((b) => b.id === selected[0]) : undefined;
  return (
    <section className="free-page" aria-label="Free page">
      <div className="page-edit-header">
        <input className="page-title-input note-editor-clean-input" aria-label="Page title" value={draft.title} onChange={(e) => change({ title: e.target.value })} />
        <span className="page-save-status">{waiting ? 'Saving changes…' : 'Autosave on'}</span>
      </div>

      <div className="fp-toolbar" role="toolbar" aria-label="Page tools" onPointerDown={(e) => { if ((e.target as HTMLElement).closest('button,input')) e.preventDefault(); }}>
        {STRUCTURE.map((item) => (
          <button key={item.id} className="fp-tool" title={item.label} aria-label={item.label}
            aria-pressed={!!(editing && editor.current && item.on(editor.current))}
            disabled={!editing && !selected.length}
            onClick={() => format(item)}>
            <Icon name={item.icon} size={17} /><span>{item.label}</span>
          </button>
        ))}
        <span className="fp-divider" />
        <div className="fp-tints" role="group" aria-label="Note colour">
          {TINTS.map((tint) => (
            <button key={tint || 'plain'} style={{ background: tint || 'var(--card)' }} aria-label={tint ? `Colour ${tint}` : 'No colour'}
              aria-pressed={!!one && (one.tint ?? '') === tint} disabled={!selected.length}
              onClick={() => selected.forEach((id) => patch(id, { tint: tint || undefined }))} />
          ))}
        </div>
        <span className="fp-divider" />
        <button className="fp-tool" aria-label="Undo" title="Undo (Ctrl Z)" disabled={step === 0} onClick={() => undo(-1)}><Icon name="undo" size={17} /></button>
        <button className="fp-tool" aria-label="Redo" title="Redo (Ctrl Y)" disabled={step === history.current.length - 1} onClick={() => undo(1)}><Icon name="redo" size={17} /></button>
        <button className="fp-tool" aria-label="Duplicate" title="Duplicate (Ctrl D)" disabled={!selected.length} onClick={() => duplicate()}><Icon name="copy" size={17} /></button>
        <button className="fp-tool" aria-label="Delete note" title="Delete (Del)" disabled={!selected.length} onClick={() => removeBoxes(selected)}><Icon name="trash" size={17} /></button>
        <span className="fp-help">Click anywhere to write · drag the bar on top to move a note</span>
      </div>

      <div ref={sheet} className="fp-sheet" tabIndex={0} role="application" aria-label="Page sheet"
        onPointerDown={tap.press} onClick={openAt} onKeyDown={keys}
        onCopy={(e) => { if (!editing) copySelected(e); }}
        onCut={(e) => { if (editing) return; const boxes = copySelected(e); if (boxes) removeBoxes(boxes.map((b) => b.id)); }}
        onPaste={(e) => {
          if (editing) return;
          const text = e.clipboardData.getData('text/plain');
          const mine = clip.current;
          e.preventDefault();
          if (mine.length && text === mine.map((b) => richText(b.doc)).join('\n\n')) {
            const copies = mine.map((b) => ({ ...b, id: crypto.randomUUID(), x: acrossFrom(b.x + 24, b.w), y: snap(b.y + 24) }));
            clip.current = copies;
            put([...now().boxes, ...copies]);
            setSelected(copies.map((b) => b.id));
            return;
          }
          if (!text.trim()) { toast('There is no text on the clipboard to paste.'); return; }
          addBox(GRID * 3, floor + GRID * 3, textDoc(text), false);
        }}>
        <div className="fp-canvas" style={{ height: Math.max(floor + ROOM_BELOW, 560), width: edge + GRID * 2 }}>
          {page.boxes.map((box) => (
            <div key={box.id} data-box={box.id}
              className={'fp-box' + (box.tint ? ' is-tinted' : '') + (selected.includes(box.id) ? ' is-selected' : '') + (editing === box.id ? ' is-editing' : '')}
              style={{ left: box.x, top: box.y, width: box.w, '--tint': box.tint ?? 'transparent' } as CSSProperties}
              onContextMenu={(e) => boxMenu(e, box)}
              onClick={(e) => { e.stopPropagation(); if (!tap.tapped(e)) return; if (editing !== box.id) { setSelected([box.id]); setEditing(box.id); } }}
              onPointerDown={(e) => { tap.press(e); if (e.shiftKey) { e.stopPropagation(); setSelected((list) => (list.includes(box.id) ? list.filter((id) => id !== box.id) : [...list, box.id])); } }}>
              <span className="fp-grip" aria-hidden="true" onPointerDown={(e) => drag(e, box, 'move')} />
              {editing === box.id
                ? <BoxEditor box={box} onReady={ready} onChange={(doc) => { live.current = { id: box.id, doc }; }} onDone={stopEditing} onLook={look} />
                : <BoxBody doc={box.doc} />}
              <span className="fp-edge" aria-hidden="true" onPointerDown={(e) => drag(e, box, 'width')} />
            </div>
          ))}
          {!page.boxes.length && (
            <p className="fp-blank">Click anywhere on this sheet and write.<small>Notes stay where you put them. Ctrl B for bold, “- ” starts a list, “# ” a heading.</small></p>
          )}
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} kind="notes" label={menu.label} items={menu.items} onClose={() => setMenu(null)} />}
    </section>
  );
}
