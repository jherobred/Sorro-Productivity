import { Extension, Mark, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, Slice } from '@tiptap/pm/model';

/* ----------------------------------------------------------- paragraph */

export type DocStyleName = 'title' | 'subtitle';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormat: {
      setLineSpacing: (value: string | null) => ReturnType;
      setParagraphSpacing: (edge: 'before' | 'after', px: number | null) => ReturnType;
      indentBlock: () => ReturnType;
      outdentBlock: () => ReturnType;
      setIndents: (indent: number | null, firstLine: number | null) => ReturnType;
      setDocStyle: (style: DocStyleName | null) => ReturnType;
    };
    listStyle: {
      setListStyle: (kind: 'bullet' | 'number', style: string) => ReturnType;
    };
    comments: {
      addComment: (id: string) => ReturnType;
      removeComment: (id: string) => ReturnType;
    };
    suggestions: {
      resolveSuggestion: (id: string | null, accept: boolean) => ReturnType;
    };
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
    find: {
      setSearch: (query: string, caseSensitive: boolean) => ReturnType;
      stepSearch: (delta: number) => ReturnType;
      replaceCurrent: (text: string) => ReturnType;
      replaceAllMatches: (text: string) => ReturnType;
    };
  }
  interface Storage {
    suggestions: { enabled: boolean };
  }
}

const BLOCKS = ['paragraph', 'heading'];
const pixels = (value: string) => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n !== 0 ? Math.round(n) : null;
};

/** In half-inch steps, as Google Docs indents. */
export const INDENT_STEP = 48;

/**
 * Paragraph-level formatting: line spacing, space before and after, left and
 * first-line indent, and the Title and Subtitle styles. Spacing is padding, not
 * margin, so a page break inserted between two paragraphs cannot change how
 * far apart they sit.
 */
export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',
  addGlobalAttributes() {
    return [{
      types: BLOCKS,
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: (el) => el.style.lineHeight || null,
          renderHTML: (a) => (a.lineHeight ? { style: `line-height: ${a.lineHeight}` } : {}),
        },
        spaceBefore: {
          default: null,
          parseHTML: (el) => pixels(el.style.paddingTop),
          renderHTML: (a) => (a.spaceBefore ? { style: `padding-top: ${a.spaceBefore}px` } : {}),
        },
        spaceAfter: {
          default: null,
          parseHTML: (el) => pixels(el.style.paddingBottom),
          renderHTML: (a) => (a.spaceAfter ? { style: `padding-bottom: ${a.spaceAfter}px` } : {}),
        },
        indent: {
          default: null,
          parseHTML: (el) => pixels(el.style.marginLeft),
          renderHTML: (a) => (a.indent ? { style: `margin-left: ${a.indent}px` } : {}),
        },
        firstLine: {
          default: null,
          parseHTML: (el) => pixels(el.style.textIndent),
          renderHTML: (a) => (a.firstLine ? { style: `text-indent: ${a.firstLine}px` } : {}),
        },
        docStyle: {
          default: null,
          parseHTML: (el) => (['title', 'subtitle'].includes(el.getAttribute('data-style') ?? '') ? el.getAttribute('data-style') : null),
          renderHTML: (a) => (a.docStyle ? { 'data-style': a.docStyle } : {}),
        },
      },
    }];
  },
  addCommands() {
    const each = (state: EditorState, tr: Transaction, patch: (attrs: Record<string, unknown>, node: PMNode) => Record<string, unknown>) => {
      const { from, to } = state.selection;
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (!BLOCKS.includes(node.type.name)) return true;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch(node.attrs, node) });
        return false;
      });
    };
    return {
      setLineSpacing: (value) => ({ state, tr, dispatch }) => { if (dispatch) each(state, tr, () => ({ lineHeight: value })); return true; },
      setParagraphSpacing: (edge, px) => ({ state, tr, dispatch }) => {
        if (dispatch) each(state, tr, () => (edge === 'before' ? { spaceBefore: px } : { spaceAfter: px }));
        return true;
      },
      indentBlock: () => ({ editor, commands, state, tr, dispatch }) => {
        if (editor.isActive('taskItem')) return commands.sinkListItem('taskItem');
        if (editor.isActive('listItem')) return commands.sinkListItem('listItem');
        if (dispatch) each(state, tr, (a) => ({ indent: Math.min(INDENT_STEP * 10, (Number(a.indent) || 0) + INDENT_STEP) }));
        return true;
      },
      outdentBlock: () => ({ editor, commands, state, tr, dispatch }) => {
        if (editor.isActive('taskItem')) return commands.liftListItem('taskItem');
        if (editor.isActive('listItem')) return commands.liftListItem('listItem');
        if (dispatch) each(state, tr, (a) => ({ indent: Math.max(0, (Number(a.indent) || 0) - INDENT_STEP) || null }));
        return true;
      },
      setIndents: (indent, firstLine) => ({ state, tr, dispatch }) => {
        if (dispatch) each(state, tr, () => ({ indent: indent || null, firstLine: firstLine || null }));
        return true;
      },
      setDocStyle: (style) => ({ state, tr, dispatch }) => {
        const paragraph = state.schema.nodes.paragraph;
        if (dispatch) {
          const { from, to } = state.selection;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (!BLOCKS.includes(node.type.name)) return true;
            tr.setNodeMarkup(pos, paragraph, { ...(node.type === paragraph ? node.attrs : {}), lineHeight: node.attrs.lineHeight, textAlign: node.attrs.textAlign, docStyle: style });
            return false;
          });
        }
        return true;
      },
    };
  },
  addKeyboardShortcuts() {
    return {
      'Mod-]': () => this.editor.commands.indentBlock(),
      'Mod-[': () => this.editor.commands.outdentBlock(),
      'Mod-Alt-0': () => this.editor.chain().setParagraph().setDocStyle(null).run(),
    };
  },
});

/** Bullet and number styles, as Google Docs offers them in the list menus. */
export const ListStyle = Extension.create({
  name: 'listStyle',
  addGlobalAttributes() {
    return [{
      types: ['bulletList', 'orderedList'],
      attributes: {
        listStyle: {
          default: null,
          parseHTML: (el) => el.style.listStyleType || null,
          renderHTML: (a) => (a.listStyle ? { style: `list-style-type: ${a.listStyle}` } : {}),
        },
      },
    }];
  },
  addCommands() {
    return {
      setListStyle: (kind, style) => ({ editor, chain }) => {
        const name = kind === 'bullet' ? 'bulletList' : 'orderedList';
        const run = chain();
        if (!editor.isActive(name)) run.focus()[kind === 'bullet' ? 'toggleBulletList' : 'toggleOrderedList']();
        return run.updateAttributes(name, { listStyle: style }).run();
      },
    };
  },
});

/* ------------------------------------------------------------- comments */

/**
 * A comment is anchored by a mark on the text it is about, so it moves with
 * that text through every edit instead of pointing at a character offset.
 * The comment itself lives in the document record, keyed by the same id.
 */
export const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  excludes: '',
  addAttributes() {
    return { id: { default: null, parseHTML: (el) => el.getAttribute('data-comment-id'), renderHTML: (a) => ({ 'data-comment-id': a.id }) } };
  },
  parseHTML() { return [{ tag: 'span[data-comment-id]', consuming: false }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { class: 'doc-comment' }), 0]; },
  addCommands() {
    return {
      addComment: (id) => ({ commands }) => commands.setMark(this.name, { id }),
      removeComment: (id) => ({ state, tr, dispatch }) => {
        if (!dispatch) return true;
        state.doc.descendants((node, pos) => {
          const mark = node.marks.find((m) => m.type.name === 'comment' && m.attrs.id === id);
          if (mark) tr.removeMark(pos, pos + node.nodeSize, mark);
        });
        return true;
      },
    };
  },
});

/** Where each comment's text starts in the document, in document order. */
export function commentAnchors(doc: PMNode): Map<string, { from: number; text: string }> {
  const anchors = new Map<string, { from: number; text: string }>();
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type.name !== 'comment') continue;
      const found = anchors.get(mark.attrs.id);
      if (!found) anchors.set(mark.attrs.id, { from: pos, text: node.text ?? '' });
      else if (found.text.length < 200) found.text += node.text ?? '';
    }
  });
  return anchors;
}

/* ---------------------------------------------------------- suggestions */

export const SUGGEST = new PluginKey('suggest');
const suggestionId = () => 'sg-' + Math.random().toString(36).slice(2, 10);

const suggestionAttrs = (tag: string) => ({
  id: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-suggestion'), renderHTML: (a: Record<string, unknown>) => ({ 'data-suggestion': a.id }) },
  created: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-created'), renderHTML: (a: Record<string, unknown>) => (a.created ? { 'data-created': a.created } : {}) },
  tag: { default: tag, rendered: false },
});

export const Insertion = Mark.create({
  name: 'insertion',
  inclusive: false,
  excludes: 'deletion',
  addAttributes() { return suggestionAttrs('ins'); },
  parseHTML() { return [{ tag: 'ins[data-suggestion]' }]; },
  renderHTML({ HTMLAttributes }) { return ['ins', mergeAttributes(HTMLAttributes, { class: 'doc-insertion' }), 0]; },
});

export const Deletion = Mark.create({
  name: 'deletion',
  inclusive: false,
  excludes: 'insertion',
  addAttributes() { return suggestionAttrs('del'); },
  parseHTML() { return [{ tag: 'del[data-suggestion]' }]; },
  renderHTML({ HTMLAttributes }) { return ['del', mergeAttributes(HTMLAttributes, { class: 'doc-deletion' }), 0]; },
});

/** Strike text through as a suggested deletion, except text that was itself only a suggestion, which just goes. */
function suggestDeletion(tr: Transaction, from: number, to: number, id: string, created: string) {
  const { insertion, deletion } = tr.doc.type.schema.marks;
  const own: [number, number][] = [];
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return;
    const start = Math.max(pos, from), end = Math.min(pos + node.nodeSize, to);
    if (end <= start) return;
    if (node.marks.some((m) => m.type === insertion)) own.push([start, end]);
    else if (!node.marks.some((m) => m.type === deletion)) tr.addMark(start, end, deletion.create({ id, created }));
  });
  for (const [start, end] of own.reverse()) tr.delete(start, end);
}

function resolve(tr: Transaction, doc: PMNode, id: string | null, accept: boolean) {
  const { insertion, deletion } = doc.type.schema.marks;
  const removals: [number, number][] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if ((mark.type !== insertion && mark.type !== deletion) || (id !== null && mark.attrs.id !== id)) continue;
      const keepsText = (mark.type === insertion) === accept;
      if (keepsText) tr.removeMark(pos, pos + node.nodeSize, mark);
      else removals.push([pos, pos + node.nodeSize]);
    }
  });
  for (const [from, to] of removals.reverse()) tr.delete(tr.mapping.map(from), tr.mapping.map(to));
}

/** One press of Backspace or Delete while suggesting. */
function deleteAsSuggestion(view: EditorView, backward: boolean): boolean {
  const { state } = view;
  const { selection } = state;
  const { deletion } = state.schema.marks;
  const created = new Date().toISOString();
  const tr = state.tr.setMeta(SUGGEST, true);
  if (!selection.empty) {
    suggestDeletion(tr, selection.from, selection.to, suggestionId(), created);
    tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(backward ? selection.from : selection.to, backward ? -1 : 1)));
    view.dispatch(tr);
    return true;
  }
  const $pos = selection.$from;
  const edge = backward ? $pos.start() : $pos.end();
  const next = (p: number) => { const r = state.doc.resolve(p); return backward ? r.nodeBefore : r.nodeAfter; };
  const behind = (p: number) => { const r = state.doc.resolve(p); return backward ? r.nodeAfter : r.nodeBefore; };
  // Keep deleting into the same suggestion: the text just struck through sits
  // on the far side of the caret.
  const adjacent = behind(selection.from)?.marks.find((m) => m.type === deletion);
  let id: string | null = adjacent?.attrs.id ?? null;
  let when: string = adjacent?.attrs.created ?? created;
  let pos = selection.from;
  while (pos !== edge) {
    const node = next(pos);
    const struck = node?.isText ? node.marks.find((m) => m.type === deletion) : undefined;
    if (!struck) break;
    id = struck.attrs.id;
    when = struck.attrs.created ?? when;
    pos += backward ? -1 : 1;
  }
  if (pos === edge) {
    if (pos === selection.from) return false;
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos)));
    return true;
  }
  if (!next(pos)?.isText) return false;
  const from = backward ? pos - 1 : pos, to = backward ? pos : pos + 1;
  suggestDeletion(tr, from, to, id ?? suggestionId(), id ? when : created);
  tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(backward ? from : to, backward ? -1 : 1)));
  view.dispatch(tr);
  return true;
}

export type SuggestionSummary = { id: string; inserted: string; deleted: string; created: string | null; from: number };
export function listSuggestions(doc: PMNode): SuggestionSummary[] {
  const found = new Map<string, SuggestionSummary>();
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      const kind = mark.type.name;
      if (kind !== 'insertion' && kind !== 'deletion') continue;
      const entry = found.get(mark.attrs.id) ?? { id: mark.attrs.id, inserted: '', deleted: '', created: mark.attrs.created, from: pos };
      if (kind === 'insertion') entry.inserted += node.text ?? ''; else entry.deleted += node.text ?? '';
      found.set(mark.attrs.id, entry);
    }
  });
  return [...found.values()].sort((a, b) => a.from - b.from);
}

/**
 * Suggesting mode. Typing, pasting, cutting and deleting are turned into
 * marked insertions and struck-through deletions that can each be accepted or
 * rejected. Formatting and new paragraphs still apply directly.
 */
export const Suggestions = Extension.create<Record<string, never>, { enabled: boolean }>({
  name: 'suggestions',
  addStorage() { return { enabled: false }; },
  addCommands() {
    return {
      resolveSuggestion: (id, accept) => ({ state, tr, dispatch }) => {
        if (dispatch) { resolve(tr, state.doc, id, accept); tr.setMeta(SUGGEST, true); }
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    const storage = this.storage;
    let view: EditorView | null = null;
    const now = () => new Date().toISOString();
    const insertSlice = (state: EditorState, slice: Slice) => {
      const { from, to } = state.selection;
      const tr = state.tr.setMeta(SUGGEST, true);
      const id = suggestionId(), created = now();
      if (from < to) suggestDeletion(tr, from, to, id, created);
      const at = tr.mapping.map(to);
      const before = tr.mapping.maps.length;
      tr.replace(at, at, slice);
      const end = tr.mapping.slice(before).map(at, 1);
      tr.addMark(at, end, state.schema.marks.insertion.create({ id, created }));
      tr.setSelection(TextSelection.near(tr.doc.resolve(end)));
      return tr.scrollIntoView();
    };
    return [new Plugin({
      key: SUGGEST,
      view(editorView) { view = editorView; return { destroy() { view = null; } }; },
      filterTransaction(tr, state) {
        if (!storage.enabled || !tr.docChanged || tr.getMeta(SUGGEST)) return true;
        if (tr.getMeta('uiEvent') !== 'cut') return true;
        const { from, to } = state.selection;
        queueMicrotask(() => {
          if (!view) return;
          const next = view.state.tr.setMeta(SUGGEST, true);
          suggestDeletion(next, from, to, suggestionId(), now());
          next.setSelection(TextSelection.create(next.doc, next.mapping.map(from)));
          view.dispatch(next);
        });
        return false;
      },
      props: {
        handleTextInput(editorView, from, to, text) {
          if (!storage.enabled) return false;
          const { state } = editorView;
          const { insertion, deletion } = state.schema.marks;
          const $from = state.doc.resolve(from);
          const created = now();
          const continued = $from.nodeBefore?.marks.find((m) => m.type === insertion);
          const id = continued?.attrs.id ?? suggestionId();
          const tr = state.tr.setMeta(SUGGEST, true);
          if (from < to) suggestDeletion(tr, from, to, id, created);
          const at = tr.mapping.map(to);
          const marks = (state.storedMarks ?? $from.marks()).filter((m) => m.type !== insertion && m.type !== deletion);
          tr.insert(at, state.schema.text(text, [...marks, insertion.create({ id, created: continued?.attrs.created ?? created })]));
          tr.setSelection(TextSelection.create(tr.doc, at + text.length));
          editorView.dispatch(tr.scrollIntoView());
          return true;
        },
        handleKeyDown(editorView, event) {
          if (!storage.enabled || (event.key !== 'Backspace' && event.key !== 'Delete')) return false;
          return deleteAsSuggestion(editorView, event.key === 'Backspace');
        },
        handleDOMEvents: {
          // Phone keyboards delete through beforeinput without a Backspace keydown.
          beforeinput(editorView, event) {
            const type = (event as InputEvent).inputType;
            if (!storage.enabled || !type?.startsWith('delete')) return false;
            event.preventDefault();
            return deleteAsSuggestion(editorView, !/Forward$/.test(type));
          },
        },
        handlePaste(editorView, _event, slice) {
          if (!storage.enabled) return false;
          editorView.dispatch(insertSlice(editorView.state, slice));
          return true;
        },
        handleDrop() { return storage.enabled; },
      },
    })];
  },
});

/* ----------------------------------------------------------- page break */

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() { return [{ tag: 'div[data-type="page-break"]' }]; },
  renderHTML() { return ['div', { 'data-type': 'page-break', class: 'doc-page-break' }]; },
  addCommands() {
    return {
      setPageBreak: () => ({ chain }) => chain().insertContent({ type: this.name }).run(),
    };
  },
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.setPageBreak() };
  },
});

/* ------------------------------------------------------------ wiki links */

/** `[[Another note]]` written in a document stays text and is shown as a link to that note. */
export const WikiLinks = Extension.create<{ open: (name: string) => void; known: (name: string) => boolean }>({
  name: 'wikiLinks',
  addOptions() { return { open: () => {}, known: () => false }; },
  addProseMirrorPlugins() {
    const options = this.options;
    const find = (doc: PMNode) => {
      const decorations: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (!node.isText || !node.text?.includes('[[')) return;
        for (const match of node.text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
          const name = match[1].trim();
          const from = pos + (match.index ?? 0);
          decorations.push(Decoration.inline(from, from + match[0].length, {
            class: 'doc-wiki' + (options.known(name) ? '' : ' is-missing'), 'data-wiki': name, title: `Ctrl+click to open ${name}`,
          }));
        }
      });
      return DecorationSet.create(doc, decorations);
    };
    return [new Plugin({
      key: new PluginKey('wikiLinks'),
      state: { init: (_, state) => find(state.doc), apply: (tr, old) => (tr.docChanged ? find(tr.doc) : old) },
      props: {
        decorations(state) { return this.getState(state); },
        handleClick(view, _pos, event) {
          const target = (event.target as HTMLElement).closest<HTMLElement>('[data-wiki]');
          if (!target || !(event.ctrlKey || event.metaKey || !view.editable)) return false;
          options.open(target.dataset.wiki ?? '');
          return true;
        },
      },
    })];
  },
});

/* ------------------------------------------------------------------ find */

export type FindState = { query: string; caseSensitive: boolean; matches: { from: number; to: number }[]; current: number };
export const FIND = new PluginKey<FindState & { decorations: DecorationSet }>('find');

function searchDoc(doc: PMNode, query: string, caseSensitive: boolean) {
  const matches: { from: number; to: number }[] = [];
  if (!query) return matches;
  const needle = caseSensitive ? query : query.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // One string per paragraph, with a map back to document positions, so a
    // match can run across bold and plain text in the same line.
    let text = '';
    const at: number[] = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText) { for (let i = 0; i < child.text!.length; i++) at.push(start + i); text += child.text; }
      else { at.push(start); text += '￼'; }
    });
    const haystack = caseSensitive ? text : text.toLowerCase();
    let index = haystack.indexOf(needle);
    while (index >= 0 && needle) {
      matches.push({ from: at[index], to: at[index + needle.length - 1] + 1 });
      index = haystack.indexOf(needle, index + needle.length);
    }
    return false;
  });
  return matches;
}

const findDecorations = (doc: PMNode, state: FindState) =>
  DecorationSet.create(doc, state.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: 'doc-find-match' + (i === state.current ? ' is-current' : '') })));

export const FindHighlight = Extension.create({
  name: 'findHighlight',
  addCommands() {
    const select = (tr: Transaction, state: FindState) => {
      const match = state.matches[state.current];
      if (match) tr.setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView();
    };
    return {
      setSearch: (query, caseSensitive) => ({ tr, dispatch }) => { if (dispatch) tr.setMeta(FIND, { query, caseSensitive, current: 0 }); return true; },
      stepSearch: (delta) => ({ state, tr, dispatch }) => {
        const find = FIND.getState(state);
        if (!find?.matches.length) return false;
        if (dispatch) {
          const current = (find.current + delta + find.matches.length) % find.matches.length;
          tr.setMeta(FIND, { current });
          select(tr, { ...find, current });
        }
        return true;
      },
      replaceCurrent: (text) => ({ state, tr, dispatch }) => {
        const find = FIND.getState(state);
        const match = find?.matches[find.current];
        if (!find || !match) return false;
        if (dispatch) { tr.insertText(text, match.from, match.to).setMeta(SUGGEST, true); }
        return true;
      },
      replaceAllMatches: (text) => ({ state, tr, dispatch }) => {
        const find = FIND.getState(state);
        if (!find?.matches.length) return false;
        if (dispatch) { for (const match of [...find.matches].reverse()) tr.insertText(text, match.from, match.to); tr.setMeta(SUGGEST, true); }
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      key: FIND,
      state: {
        init: (): FindState & { decorations: DecorationSet } => ({ query: '', caseSensitive: false, matches: [], current: 0, decorations: DecorationSet.empty }),
        apply(tr, prev) {
          const meta = tr.getMeta(FIND) as Partial<FindState> | undefined;
          if (!meta && !tr.docChanged) return prev;
          const next = { ...prev, ...meta };
          if (meta?.query !== undefined || meta?.caseSensitive !== undefined || tr.docChanged) {
            next.matches = searchDoc(tr.doc, next.query, next.caseSensitive);
          }
          next.current = next.matches.length ? Math.min(next.current, next.matches.length - 1) : 0;
          return { ...next, decorations: findDecorations(tr.doc, next) };
        },
      },
      props: { decorations(state) { return FIND.getState(state)?.decorations; } },
    })];
  },
});

/* ------------------------------------------------------------ pagination */

export type PageLayout = { enabled: boolean; pageHeight: number; top: number; bottom: number; gap: number };
type Gap = { pos: number; height: number };
export const PAGINATION = new PluginKey<DecorationSet>('pagination');

/**
 * Real pages. After every change the top-level blocks are measured, and any
 * block that would cross the bottom margin of a page is pushed to the top of
 * the next one by a spacer widget in front of it. The spacers are view-only
 * decorations, never part of the document, so they cannot be saved, copied or
 * undone. A block taller than a whole page simply runs on.
 */
export const Pagination = Extension.create<{ layout: () => PageLayout; onPages: (pages: number, contentBottom: number) => void }>({
  name: 'pagination',
  addOptions() {
    return { layout: () => ({ enabled: false, pageHeight: 1056, top: 96, bottom: 96, gap: 24 }), onPages: () => {} };
  },
  addProseMirrorPlugins() {
    const options = this.options;
    const spacer = (height: number) => {
      const el = document.createElement('div');
      el.className = 'doc-page-gap';
      el.contentEditable = 'false';
      el.style.height = `${height}px`;
      el.setAttribute('aria-hidden', 'true');
      return el;
    };
    const measure = (view: EditorView) => {
      if (!view.dom.isConnected) return;
      const layout = options.layout();
      const existing = new Map<number, number>();
      PAGINATION.getState(view.state)?.find().forEach((d) => existing.set(d.from, (d.spec as { height: number }).height));
      const body = Math.max(40, layout.pageHeight - layout.top - layout.bottom);
      const pitch = layout.pageHeight + layout.gap;
      const contentTop = (p: number) => p * pitch + layout.top;
      const contentBottom = (p: number) => contentTop(p) + body;
      const gaps: Gap[] = [];
      let oldShift = 0, newShift = 0, page = 0, bottom = layout.top, forceNext = false;
      view.state.doc.forEach((node, offset) => {
        oldShift += existing.get(offset) ?? 0;
        const dom = view.nodeDOM(offset);
        if (!(dom instanceof HTMLElement)) return;
        const height = dom.offsetHeight;
        let y = dom.offsetTop - oldShift + newShift;
        if (layout.enabled) {
          while (y >= contentBottom(page)) page++;
          let push = 0;
          if (y < contentTop(page)) push = contentTop(page) - y;
          else if (y > contentTop(page) + 1 && (forceNext || (y + height > contentBottom(page) && height <= body))) { page++; push = contentTop(page) - y; }
          if (push > 0.5) { gaps.push({ pos: offset, height: Math.round(push * 10) / 10 }); newShift += push; y += push; }
        }
        bottom = y + height;
        forceNext = node.type.name === 'pageBreak';
      });
      if (layout.enabled) while (bottom > contentBottom(page)) page++;
      options.onPages(layout.enabled ? page + 1 : 1, bottom);
      const same = gaps.length === existing.size && gaps.every((g) => Math.abs((existing.get(g.pos) ?? -99) - g.height) < 0.6);
      if (!same) view.dispatch(view.state.tr.setMeta(PAGINATION, gaps).setMeta('addToHistory', false));
    };
    return [new Plugin({
      key: PAGINATION,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, set) {
          const gaps = tr.getMeta(PAGINATION) as Gap[] | undefined;
          if (gaps) {
            return DecorationSet.create(tr.doc, gaps.map((gap) => Decoration.widget(gap.pos, () => spacer(gap.height), {
              side: -1, key: `gap-${gap.pos}-${gap.height}`, height: gap.height, ignoreSelection: true,
            })));
          }
          return set.map(tr.mapping, tr.doc);
        },
      },
      props: { decorations(state) { return PAGINATION.getState(state); } },
      view(view) {
        // A short timer rather than an animation frame: frames stop in a
        // background tab, and the page count still has to be right when the
        // tab comes back.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const schedule = () => { clearTimeout(timer); timer = setTimeout(() => measure(view), 40); };
        const observer = new ResizeObserver(schedule);
        observer.observe(view.dom);
        schedule();
        return { update: schedule, destroy() { clearTimeout(timer); observer.disconnect(); } };
      },
    })];
  },
});

/** Ask the pagination plugin to measure again, for changes it cannot see such as a new page size. */
export function repaginate(editor: Editor) {
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('repaginate', true).setMeta('addToHistory', false));
}

/* -------------------------------------------------------------- tabs */

/** Tab inserts a tab character in text, as it does in Google Docs, and still moves between list levels. */
export const TabKey = Extension.create({
  name: 'tabKey',
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const { editor } = this;
        if (editor.isActive('table')) return false;
        if (editor.isActive('listItem') || editor.isActive('taskItem')) return editor.commands.indentBlock();
        return editor.commands.insertContent('\t');
      },
      'Shift-Tab': () => {
        const { editor } = this;
        if (editor.isActive('table')) return false;
        return editor.commands.outdentBlock();
      },
    };
  },
});
