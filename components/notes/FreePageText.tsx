'use client';

/**
 * The writing inside a free page's containers: how a container reads when it
 * is not being written in, the editor mounted in the one that is, and the
 * small formatting bar that floats over it, the way OneNote's does.
 */

import { memo, useEffect } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import { Icon, type IconName } from '@/components/Icon';
import { richText, type RichNode } from '@/lib/pageKinds';

export const FONTS = [
  { label: 'Sans', value: '' },
  { label: 'Calibri', value: 'Calibri, Carlito, "Segoe UI", sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: 'ui-monospace, Consolas, "Courier New", monospace' },
  { label: 'Hand', value: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive' },
];
export const SIZES = [10, 11, 12, 14, 15, 16, 18, 20, 24, 28, 32, 40];
export const TEXT_COLORS = ['', '#e5484d', '#f76b15', '#e2a400', '#30a46c', '#2454ed', '#8e4ec6'];
export const HIGHLIGHTS = ['#fff3a3', '#c8f2cf', '#cfe4ff', '#ffd6e7', '#e7dcff'];

/* ----------------------------------------------------------------- reading */

/** A stored style value is only ever a colour, one of our fonts, or a size in px, so nothing else reaches a style. */
const safeColor = (v: unknown) => (typeof v === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(v) ? v : undefined);
const safeFont = (v: unknown) => (typeof v === 'string' && FONTS.some((f) => f.value === v) ? v : undefined);
const safeSize = (v: unknown) => (typeof v === 'string' && /^\d{1,3}(\.\d+)?px$/.test(v) ? v : undefined);

function Marks({ node }: { node: RichNode }) {
  let out: React.ReactNode = node.text ?? '';
  for (const mark of node.marks ?? []) {
    const a = mark.attrs ?? {};
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'underline') out = <u>{out}</u>;
    else if (mark.type === 'strike') out = <s>{out}</s>;
    else if (mark.type === 'code') out = <code>{out}</code>;
    else if (mark.type === 'highlight') out = <mark style={{ background: safeColor(a.color) }}>{out}</mark>;
    else if (mark.type === 'textStyle') out = <span style={{ color: safeColor(a.color), fontFamily: safeFont(a.fontFamily), fontSize: safeSize(a.fontSize) }}>{out}</span>;
  }
  return <>{out}</>;
}

function Nodes({ list }: { list?: RichNode[] }) {
  return <>{(list ?? []).map((node, i) => <Block key={i} node={node} />)}</>;
}

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

/**
 * A container that is not being written in is drawn from its own data, never
 * from stored markup. Only the container with the cursor mounts an editor, so a
 * page of forty notes is not forty editors. Memoised, so the formatting bar
 * asking how the cursor looks redraws nothing else.
 */
export const BoxBody = memo(function BoxBody({ doc }: { doc: RichNode }) {
  return <div className="fp-view"><Nodes list={doc.content} /></div>;
});

/* ----------------------------------------------------------------- writing */

export function BoxEditor({ doc, onReady, onChange, onDone, onLook }: {
  doc: RichNode;
  onReady: (editor: Editor | null) => void;
  onChange: (doc: RichNode) => void;
  onDone: () => void;
  /** The formatting bar reads the cursor's own formatting, so it is told to look again. */
  onLook: () => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    autofocus: 'end',
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList, TaskItem.configure({ nested: true }),
      TextStyle, Color, FontFamily, FontSize,
      Highlight.configure({ multicolor: true }),
    ],
    content: doc as JSONContent,
    editorProps: { attributes: { class: 'fp-text' } },
    onUpdate: ({ editor: live }) => { onChange(live.getJSON() as RichNode); onLook(); },
    onSelectionUpdate: () => onLook(),
    onBlur: ({ event }) => {
      // Reaching for the formatting bar is not leaving the container.
      const to = (event as FocusEvent | undefined)?.relatedTarget as HTMLElement | null;
      if (to?.closest('.fp-format')) return;
      onDone();
    },
  });
  useEffect(() => { onReady(editor ?? null); return () => onReady(null); }, [editor, onReady]);
  return <EditorContent editor={editor} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onDone(); } }} />;
}

/* ----------------------------------------------------- the formatting bar */

type Toggle = { icon: IconName; label: string; keys?: string; run: (e: Editor) => void; on: (e: Editor) => boolean };
const TOGGLES: Toggle[] = [
  { icon: 'bold', label: 'Bold', keys: 'Ctrl B', run: (e) => e.chain().focus().toggleBold().run(), on: (e) => e.isActive('bold') },
  { icon: 'italic', label: 'Italic', keys: 'Ctrl I', run: (e) => e.chain().focus().toggleItalic().run(), on: (e) => e.isActive('italic') },
  { icon: 'underline', label: 'Underline', keys: 'Ctrl U', run: (e) => e.chain().focus().toggleUnderline().run(), on: (e) => e.isActive('underline') },
  { icon: 'strike', label: 'Strikethrough', run: (e) => e.chain().focus().toggleStrike().run(), on: (e) => e.isActive('strike') },
];
const BLOCKS: Toggle[] = [
  { icon: 'listBullet', label: 'Bullets', keys: 'Ctrl Shift 8', run: (e) => e.chain().focus().toggleBulletList().run(), on: (e) => e.isActive('bulletList') },
  { icon: 'listNumber', label: 'Numbering', keys: 'Ctrl Shift 7', run: (e) => e.chain().focus().toggleOrderedList().run(), on: (e) => e.isActive('orderedList') },
  { icon: 'listCheck', label: 'To do', keys: 'Ctrl Shift 9', run: (e) => e.chain().focus().toggleTaskList().run(), on: (e) => e.isActive('taskList') },
  { icon: 'heading', label: 'Heading', run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), on: (e) => e.isActive('heading') },
  { icon: 'quote', label: 'Quote', run: (e) => e.chain().focus().toggleBlockquote().run(), on: (e) => e.isActive('blockquote') },
];

/** The indent that applies here: a list item nests, anything else has nothing to indent into. */
const indent = (e: Editor, out: boolean) => {
  const item = e.isActive('taskItem') ? 'taskItem' : 'listItem';
  if (out) e.chain().focus().liftListItem(item).run();
  else e.chain().focus().sinkListItem(item).run();
};

export function FormatBar({ editor }: { editor: Editor }) {
  const style = editor.getAttributes('textStyle') as { fontFamily?: string; fontSize?: string; color?: string };
  const keep = (e: React.PointerEvent) => { if (!(e.target as HTMLElement).closest('select')) e.preventDefault(); };
  return (
    <div className="fp-format" role="toolbar" aria-label="Text formatting" onPointerDown={keep}>
      <div className="fp-format-row">
        <select aria-label="Font" value={FONTS.find((f) => f.value === (style.fontFamily ?? ''))?.value ?? ''}
          onChange={(e) => { const v = e.target.value; if (v) editor.chain().focus().setFontFamily(v).run(); else editor.chain().focus().unsetFontFamily().run(); }}>
          {FONTS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
        </select>
        <select aria-label="Size" className="is-size" value={style.fontSize ? parseInt(style.fontSize, 10) : ''}
          onChange={(e) => { const v = e.target.value; if (v) editor.chain().focus().setFontSize(`${v}px`).run(); else editor.chain().focus().unsetFontSize().run(); }}>
          <option value="">Size</option>
          {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button type="button" title="Indent less" aria-label="Indent less" onClick={() => indent(editor, true)}><Icon name="indentLess" size={15} /></button>
        <button type="button" title="Indent more (Tab in a list)" aria-label="Indent more" onClick={() => indent(editor, false)}><Icon name="indentMore" size={15} /></button>
        <button type="button" title="Clear formatting" aria-label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Icon name="clearFormat" size={15} /></button>
      </div>
      <div className="fp-format-row">
        {TOGGLES.map((t) => (
          <button key={t.label} type="button" title={t.keys ? `${t.label} (${t.keys})` : t.label} aria-label={t.label} aria-pressed={t.on(editor)} onClick={() => t.run(editor)}><Icon name={t.icon} size={15} /></button>
        ))}
        <span className="fp-format-divider" />
        <span className="fp-swatches" role="group" aria-label="Highlight">
          <Icon name="highlighter" size={14} />
          {HIGHLIGHTS.map((c) => <button key={c} type="button" aria-label={`Highlight ${c}`} style={{ background: c }} aria-pressed={editor.isActive('highlight', { color: c })}
            onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()} />)}
        </span>
        <span className="fp-swatches" role="group" aria-label="Text colour">
          <Icon name="textColor" size={14} />
          {TEXT_COLORS.map((c) => <button key={c || 'auto'} type="button" aria-label={c ? `Text colour ${c}` : 'Automatic colour'} style={{ background: c || 'var(--tx)' }} aria-pressed={(style.color ?? '') === c}
            onClick={() => (c ? editor.chain().focus().setColor(c).run() : editor.chain().focus().unsetColor().run())} />)}
        </span>
        <span className="fp-format-divider" />
        {BLOCKS.map((t) => (
          <button key={t.label} type="button" title={t.keys ? `${t.label} (${t.keys})` : t.label} aria-label={t.label} aria-pressed={t.on(editor)} onClick={() => t.run(editor)}><Icon name={t.icon} size={15} /></button>
        ))}
      </div>
    </div>
  );
}
