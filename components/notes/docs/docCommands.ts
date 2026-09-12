import type { Editor } from '@tiptap/core';
import { toast } from '@/lib/toast';
import { FONTS, DEFAULT_FONT, fontNameOf, loadFonts, PARAGRAPH_STYLES, type ParagraphStyle } from './palette';

export type DocMode = 'editing' | 'suggesting' | 'viewing';

/** Which paragraph style the selection is in, for the style box. */
export function currentStyle(editor: Editor): ParagraphStyle {
  for (let level = 1; level <= 6; level++) if (editor.isActive('heading', { level })) return `h${level}` as ParagraphStyle;
  const docStyle = editor.getAttributes('paragraph').docStyle;
  return docStyle === 'title' || docStyle === 'subtitle' ? docStyle : 'normal';
}

export function applyStyle(editor: Editor, style: ParagraphStyle) {
  const chain = editor.chain().focus();
  if (style.startsWith('h')) chain.setHeading({ level: Number(style.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 });
  else chain.setParagraph().setDocStyle(style === 'normal' ? null : (style as 'title' | 'subtitle'));
  chain.run();
}

/** Point size at the selection: an explicit size if one is set, otherwise what the style gives. */
export function currentFontSize(editor: Editor): number {
  const size = parseFloat(editor.getAttributes('textStyle').fontSize ?? '');
  if (Number.isFinite(size)) return size;
  const style = currentStyle(editor);
  return PARAGRAPH_STYLES.find((s) => s.id === style)?.size ?? 11;
}

export function setFontSize(editor: Editor, points: number) {
  const size = Math.max(1, Math.min(400, Math.round(points * 2) / 2));
  editor.chain().focus().setFontSize(`${size}pt`).run();
}

export function currentFont(editor: Editor): string {
  return fontNameOf(editor.getAttributes('textStyle').fontFamily) ?? DEFAULT_FONT;
}

export function setFont(editor: Editor, name: string) {
  const font = FONTS.find((f) => f.name === name);
  if (!font) return;
  loadFonts([font.name]);
  editor.chain().focus().setFontFamily(font.stack).run();
}

/** lowercase, UPPERCASE or Title Case for the selected text, keeping its formatting. */
export function capitalize(editor: Editor, mode: 'lower' | 'upper' | 'title') {
  const { state } = editor;
  const { from, to } = state.selection;
  if (from === to) return;
  const tr = state.tr;
  let wordStart = true;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) { wordStart = true; return; }
    const start = Math.max(from, pos), end = Math.min(to, pos + node.nodeSize);
    const text = node.text!.slice(start - pos, end - pos);
    let next = text;
    if (mode === 'lower') next = text.toLowerCase();
    else if (mode === 'upper') next = text.toUpperCase();
    else next = Array.from(text).map((ch) => { const out = wordStart ? ch.toUpperCase() : ch.toLowerCase(); wordStart = /\s/.test(ch); return out; }).join('');
    if (next !== text) tr.replaceWith(tr.mapping.map(start), tr.mapping.map(end), state.schema.text(next, node.marks));
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

export function insertDate(editor: Editor) {
  const text = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  editor.chain().focus().insertContent(text).run();
}

export function copyOrCut(editor: Editor, cut: boolean) {
  editor.commands.focus();
  // A menu click is a user gesture, so the browser allows these, and the
  // editor serialises the selection itself through its copy handler.
  if (!document.execCommand(cut ? 'cut' : 'copy')) toast(`Press ${cut ? 'Ctrl+X' : 'Ctrl+C'} to ${cut ? 'cut' : 'copy'}`);
}

export async function paste(editor: Editor, plain: boolean) {
  try {
    if (!plain && navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes('text/html')) {
          const html = await (await item.getType('text/html')).text();
          editor.chain().focus().insertContent(html).run();
          return;
        }
      }
    }
    const text = await navigator.clipboard.readText();
    if (!text) return;
    const paragraphs = text.replace(/\r\n?/g, '\n').split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] }));
    editor.chain().focus().insertContent(paragraphs.length === 1 ? paragraphs[0].content : paragraphs).run();
  } catch {
    toast(plain ? 'Press Ctrl+Shift+V to paste without formatting' : 'Press Ctrl+V to paste');
  }
}

/** Font names the document already uses, so their web fonts load before they are seen. */
export function fontsInHtml(html: string): string[] {
  const names = new Set<string>();
  for (const match of html.matchAll(/font-family:\s*([^;"]+)/gi)) {
    const name = fontNameOf(match[1].replace(/&quot;/g, '"'));
    if (name) names.add(name);
  }
  return [...names];
}
