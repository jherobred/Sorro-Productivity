'use client';
import {PageSaveStatus} from '../PageSaveStatus';

import 'katex/dist/katex.min.css';
import './docs.css';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import type { EditorView } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { CharacterCount } from '@tiptap/extensions';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Icon, type IconName } from '@/components/Icon';
import { ContextMenu, type CtxItem } from '@/components/ContextMenu';
import { ask, confirmAsk } from '@/lib/ask';
import { toast } from '@/lib/toast';
import type { Note } from '@/lib/notes';
import { loadPageAsset, savePageAsset } from '@/lib/pageAssets';
import { preparePhoto } from '@/lib/preparePhoto';
import {
  DEFAULT_PAGE, docText, isDocBody, openDoc, pagePixels, readDoc, writeDoc,
  type DocComment, type DocPage, type DocRecord, type DocTab, type OpenedDoc,
} from '@/lib/docFormat';
import {
  CommentMark, Deletion, FindHighlight, Insertion, ListStyle, PageBreak, Pagination, ParagraphFormat, Suggestions, TabKey, WikiLinks,
  listSuggestions, repaginate, type PageLayout, type SuggestionSummary,
} from './extensions';
import { DocImage, MathBlock, MathInline } from './nodes';
import { MenuBar, MenuPanel, type MenuEntry, type MenuItem, type MenuTree } from './DocMenu';
import { DocToolbar } from './DocToolbar';
import { DocSidebar, type Heading } from './DocSidebar';
import { DocComments, type CommentDraft } from './DocComments';
import { DocRuler, DocVerticalRuler } from './DocRuler';
import { DocFind } from './DocFind';
import { DocTooltip } from './DocTooltip';
import {
  EmojiDialog, LinkDialog, PageSetupDialog, ShortcutsDialog, SpecialCharactersDialog, TableDialog, TagsDialog, WordCountDialog,
  countText, defaultPage, noteIdFromHref,
} from './DocDialogs';
import { buildMenus, clearFormatting, type DocContext, type DocDialog } from './docMenus';
import { copyOrCut, currentFontSize, fontsInHtml, paste, setFontSize, type DocMode } from './docCommands';
import { downloadDocument, printDocument } from './exporters';
import { FONT_SIZES, loadFonts } from './palette';
import { usePageDraft } from '../usePageDraft';

const MathEquationEditor = dynamic(() => import('../MathEquationEditor').then((m) => m.MathEquationEditor), { ssr: false });
const NoteSketchpad = dynamic(() => import('../NoteSketchpad').then((m) => m.NoteSketchpad), { ssr: false });
const PhotoCapture = dynamic(() => import('../PhotoCapture').then((m) => m.PhotoCapture), { ssr: false });

/** Space between pages, in page pixels. */
const GAP = 16;
const FORMAT_MARKS = ['bold', 'italic', 'underline', 'strike', 'code', 'textStyle', 'highlight', 'subscript', 'superscript'];
const BLOCK_KEYS = ['textAlign', 'lineHeight', 'spaceBefore', 'spaceAfter', 'indent', 'firstLine'];
const MENU_ICONS: Record<string, IconName> = { File: 'files', Edit: 'edit', View: 'eye', Insert: 'plus', Format: 'textColor', Tools: 'set' };

type Props = {
  note: Note;
  notes: Note[];
  tags: string[];
  phone: boolean;
  onSave: (v: { title: string; body: string }) => void;
  onDelete: () => void;
  onPickNote: (id: string) => void;
  onNewNote: (title: string) => void;
  onCopy: (title: string, body: string) => void;
  onSetTags: (tags: string[]) => void;
  taskButton?: ReactNode;
};

function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw === null ? fallback : (JSON.parse(raw) as T); } catch { return fallback; }
  });
  const set = useCallback((next: T) => {
    setValue(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* a view preference, fine to lose */ }
  }, [key]);
  return [value, set] as const;
}

function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, data] = dataUrl.split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] ?? 'image/png';
  const bytes = atob(data);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new File([buffer], name, { type });
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/** Private images carry an asset reference, not an address. Give each one a source for printing or saving. */
async function withImageSources(html: string, embed: boolean): Promise<string> {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  for (const img of Array.from(doc.querySelectorAll('img[data-local-id]'))) {
    if (img.getAttribute('src')) continue;
    try {
      const blob = await loadPageAsset({ localId: img.getAttribute('data-local-id') ?? '', path: img.getAttribute('data-path') ?? undefined, name: img.getAttribute('data-name') ?? 'image' });
      img.setAttribute('src', embed ? await blobToDataUrl(blob) : URL.createObjectURL(blob));
    } catch { img.remove(); }
  }
  return doc.body.innerHTML;
}

function collectHeadings(editor: Editor): Heading[] {
  const out: Heading[] = [];
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'heading') out.push({ pos: offset, level: Number(node.attrs.level) || 1, text: node.textContent });
    else if (node.type.name === 'paragraph' && node.attrs.docStyle === 'title' && node.textContent) out.push({ pos: offset, level: 1, text: node.textContent });
  });
  return out;
}

const sameJson = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The Document page: a word processor laid out like Google Docs.
 *
 * Every change goes through the same debounced page save as the other page
 * types, with the pending-text overlay in lib/notes.ts. A Markdown page is
 * shown converted but only written back once something in it changes.
 */
export function DocEditor(props: Props) {
  const { draft, change, waiting } = usePageDraft(props.note, props.onSave);
  const [generation, setGeneration] = useState(0);
  const body = useRef(props.note.body);
  const opened = useMemo(() => openDoc(body.current), [props.note.id, generation]); // eslint-disable-line react-hooks/exhaustive-deps

  if (opened.state === 'unreadable') return <UnreadableDoc title={draft.title} raw={opened.raw} />;
  return (
    <Workspace key={generation} {...props} opened={opened} title={draft.title} saving={waiting}
      onTitle={(title) => change({ title })}
      saveBody={(next) => { body.current = next; change({ body: next }); }}
      reopen={(next) => { body.current = next; change({ body: next }); setGeneration((g) => g + 1); }} />
  );
}

function UnreadableDoc({ title, raw }: { title: string; raw: string }) {
  return (
    <section className="doc-unreadable" role="alert">
      <Icon name="lock" size={26} />
      <h2>{title || 'This document'} could not be opened safely.</h2>
      <p>Its saved format did not read back correctly, so nothing has been changed and nothing will be saved over it. The raw content is below.</p>
      <button type="button" className="doc-button" onClick={() => { void navigator.clipboard?.writeText(raw).then(() => toast('Copied')); }}>Copy the raw content</button>
      <pre>{raw}</pre>
    </section>
  );
}

function Workspace({
  note, notes, tags, phone, onDelete, onPickNote, onNewNote, onCopy, onSetTags, taskButton, opened, title, saving, onTitle, saveBody, reopen,
}: Props & {
  opened: Exclude<OpenedDoc, { state: 'unreadable' }>;
  title: string;
  saving: boolean;
  onTitle: (title: string) => void;
  saveBody: (body: string) => void;
  reopen: (body: string) => void;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const initialPage = useMemo(() => opened.doc.page ?? (opened.state === 'converted' ? defaultPage() : DEFAULT_PAGE), [opened]);
  const docRef = useRef<DocRecord>({ ...opened.doc, page: initialPage });
  const [tabs, setTabs] = useState<DocTab[]>(opened.doc.tabs);
  const [activeTab, setActiveTab] = useState(opened.doc.tabs[0].id);
  const activeRef = useRef(activeTab);
  activeRef.current = activeTab;
  const [page, setPage] = useState<DocPage>(initialPage);
  const [comments, setComments] = useState<DocComment[]>(opened.doc.comments ?? []);
  const [mode, setMode] = useState<DocMode>('editing');
  const [zoomPref, setZoomPref] = useStored<number | 'fit'>('bd_doc_zoom', 1);
  const [rulerOn, setRulerOn] = useStored('bd_doc_ruler', true);
  const [outlineOn, setOutlineOn] = useStored('bd_doc_outline', true);
  const [commentsOn, setCommentsOn] = useStored('bd_doc_comments', true);
  const [menusHidden, setMenusHidden] = useStored('bd_doc_menus_hidden', false);
  const [spellcheck, setSpellcheck] = useStored('bd_doc_spellcheck', true);
  const [liveCount, setLiveCount] = useStored('bd_doc_live_count', false);
  const liveCountRef = useRef(liveCount);
  liveCountRef.current = liveCount;
  const [printLayout, setPrintLayout] = useState<boolean | null>(null);
  const [pages, setPages] = useState(1);
  const [contentBottom, setContentBottom] = useState(0);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [outlineOver, setOutlineOver] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const [dialog, setDialog] = useState<DocDialog | null>(null);
  const [find, setFind] = useState<null | 'find' | 'replace'>(null);
  const [mathEdit, setMathEdit] = useState<{ latex: string; block: boolean; apply?: (latex: string) => void } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [camera, setCamera] = useState(false);
  const [draft, setDraft] = useState<(CommentDraft & { from: number; to: number }) | null>(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [painter, setPainter] = useState<{ sticky: boolean; marks: { type: string; attrs: Record<string, unknown> }[]; block: Record<string, unknown> } | null>(null);
  const copiedFormat = useRef<typeof painter>(null);
  const painterRef = useRef(painter);
  painterRef.current = painter;
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionSummary[]>([]);
  const [words, setWords] = useState(0);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [phoneMenu, setPhoneMenu] = useState(false);
  const [commentSheet, setCommentSheet] = useState(false);
  const [bubble, setBubble] = useState<{ href: string; left: number; top: number } | null>(null);
  const lastPointer = useRef('mouse');

  const editing = mode !== 'viewing';
  const pageless = printLayout === null ? phone || page.pageless : !printLayout;
  const px = pagePixels(page);
  const zoomSetting: number | 'fit' = phone ? 'fit' : zoomPref;
  const zoom = pageless
    ? (zoomSetting === 'fit' ? 1 : zoomSetting)
    : zoomSetting === 'fit' ? (canvasWidth ? Math.max(0.25, Math.min(2, (canvasWidth - (phone ? 12 : 72)) / px.width)) : 1) : zoomSetting;

  // A narrow window cannot hold the outline and a whole page side by side. The
  // outline then floats over the canvas when asked for, as it does in Google Docs.
  const cramped = !phone && bodyWidth > 0 && bodyWidth < px.width * zoom + 64 + 250;
  const sidebarDocked = !phone && outlineOn && !cramped;
  const sidebarFloating = !phone && cramped && outlineOver;

  const layout = useRef<PageLayout>({ enabled: !pageless, pageHeight: px.height, top: px.top, bottom: px.bottom, gap: GAP });
  layout.current = { enabled: !pageless, pageHeight: px.height, top: px.top, bottom: px.bottom, gap: GAP };

  /* ------------------------------------------------------------- saving */

  const editorRef = useRef<Editor | null>(null);
  const baseline = useRef('');
  const recordDirty = useRef(false);
  const discard = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const persist = useRef(() => {});
  persist.current = () => {
    clearTimeout(saveTimer.current);
    if (discard.current) return;
    const ed = editorRef.current;
    if (ed && !ed.isDestroyed) {
      const html = ed.getHTML();
      if (html !== baseline.current) {
        baseline.current = html;
        docRef.current = { ...docRef.current, tabs: docRef.current.tabs.map((t) => (t.id === activeRef.current ? { ...t, html } : t)) };
        recordDirty.current = true;
      }
    }
    if (!recordDirty.current) return;
    recordDirty.current = false;
    saveBody(writeDoc(docRef.current));
  };
  const scheduleSave = () => { clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => persist.current(), 300); };
  const commit = (patch: Partial<DocRecord>) => { docRef.current = { ...docRef.current, ...patch }; recordDirty.current = true; scheduleSave(); };

  // Registered as a layout effect so it runs before the page draft's own
  // flush on unmount and hide: the text has to reach the draft first.
  useLayoutEffect(() => {
    const flush = () => persist.current();
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => { removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); flush(); };
  }, []);

  /* ------------------------------------------------------------- editor */

  const derivedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  type Handlers = {
    update: (ed: Editor) => void;
    selection: (ed: Editor) => void;
    openWiki: (name: string) => void;
    known: (name: string) => boolean;
    editMath: (latex: string, block: boolean, apply: (latex: string) => void) => void;
    pages: (count: number, bottom: number) => void;
    click: (view: EditorView, event: MouseEvent) => boolean;
    pasteFiles: (event: ClipboardEvent) => boolean;
    dropFiles: (view: EditorView, event: DragEvent) => boolean;
    painterUp: () => void;
    context: (event: MouseEvent) => boolean;
  };
  const handlers = useRef<Handlers>({
    update: (_ed: Editor) => {},
    selection: (_ed: Editor) => {},
    openWiki: (_name: string) => {},
    known: (_name: string) => false,
    editMath: (_latex: string, _block: boolean, _apply: (latex: string) => void) => {},
    pages: (_count: number, _bottom: number) => {},
    click: (_view: EditorView, _event: MouseEvent) => false,
    pasteFiles: (_event: ClipboardEvent) => false,
    dropFiles: (_view: EditorView, _event: DragEvent) => false,
    painterUp: () => {},
    context: (_event: MouseEvent) => false,
  });

  const activeHtml = useMemo(() => docRef.current.tabs.find((t) => t.id === activeTab)?.html ?? '<p></p>', [activeTab]);

  // This component only ever renders on the client (it is loaded with ssr off),
  // so the editor can exist on the first render instead of the one after.
  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
        undoRedo: { depth: 300 },
      }),
      TextStyle, Color, FontFamily, FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Subscript, Superscript,
      TaskList, TaskItem.configure({ nested: true }),
      Table.configure({ resizable: !phone }), TableRow, TableHeader, TableCell,
      CharacterCount,
      ParagraphFormat, ListStyle, CommentMark, Insertion, Deletion, Suggestions, PageBreak, FindHighlight, TabKey,
      WikiLinks.configure({ open: (name) => handlers.current.openWiki(name), known: (name) => handlers.current.known(name) }),
      MathInline.configure({ onEdit: (latex, apply) => handlers.current.editMath(latex, false, apply) }),
      MathBlock.configure({ onEdit: (latex, apply) => handlers.current.editMath(latex, true, apply) }),
      DocImage,
      Pagination.configure({ layout: () => layout.current, onPages: (count, bottom) => handlers.current.pages(count, bottom) }),
    ],
    content: activeHtml,
    editable: editing,
    editorProps: {
      attributes: { class: 'doc-prose', spellcheck: spellcheck ? 'true' : 'false', 'aria-label': 'Document text', 'aria-multiline': 'true' },
      handlePaste: (_view, event) => handlers.current.pasteFiles(event),
      handleDrop: (view, event, _slice, moved) => !moved && handlers.current.dropFiles(view, event),
      handleClick: (view, _pos, event) => handlers.current.click(view, event),
      handleDOMEvents: {
        mouseup: () => { handlers.current.painterUp(); return false; },
        contextmenu: (_view, event) => handlers.current.context(event),
        pointerdown: (_view, event) => { lastPointer.current = event.pointerType; return false; },
      },
    },
    onCreate: ({ editor: ed }) => {
      // Let the schema finish settling first (a paragraph after a final table
      // or code block, repaired tables), outside undo. Opening a page must not
      // count as changing it, or every old Markdown page would be rewritten
      // the moment it is looked at.
      ed.view.dispatch(ed.state.tr.setMeta('addToHistory', false));
      baseline.current = ed.getHTML();
      loadFonts(fontsInHtml(baseline.current));
      handlers.current.update(ed);
    },
    onUpdate: ({ editor: ed }) => { scheduleSave(); handlers.current.update(ed); },
    onSelectionUpdate: ({ editor: ed }) => handlers.current.selection(ed),
  }, [activeTab]);
  editorRef.current = editor;

  // In development React mounts twice, and the first editor is destroyed
  // before these run for it, so each one checks it still has an editor.
  useEffect(() => {
    if (editor.isDestroyed) return;
    editor.setEditable(editing, false);
    const suggestions = editor.storage.suggestions as { enabled: boolean } | undefined;
    if (suggestions) suggestions.enabled = mode === 'suggesting';
  }, [editor, editing, mode]);
  useEffect(() => { if (!editor.isDestroyed) editor.view.dom.setAttribute('spellcheck', spellcheck ? 'true' : 'false'); }, [editor, spellcheck]);
  useEffect(() => { repaginate(editor); }, [editor, pageless, px.height, px.top, px.bottom, px.width, px.left, px.right, zoom]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const measure = () => { setCanvasWidth(el.clientWidth); setBodyWidth(body.current?.clientWidth ?? 0); };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (body.current) observer.observe(body.current);
    measure();
    return () => observer.disconnect();
  }, []);

  /* ------------------------------------------------------- derived data */

  const backlinks = useMemo(() => {
    const mine = title.trim().toLowerCase();
    if (!mine) return [];
    return notes.filter((n) => {
      if (n.id === note.id) return false;
      const text = isDocBody(n.body) ? (() => { const d = readDoc(n.body); return d ? docText(d) : ''; })() : n.body;
      return text.toLowerCase().includes(`[[${mine}]]`);
    });
  }, [notes, title, note.id]);

  const knownTitles = useMemo(() => new Map(notes.map((n) => [n.title.trim().toLowerCase(), n.id])), [notes]);

  const openHref = (href: string) => {
    const id = noteIdFromHref(href);
    if (id) { onPickNote(decodeURIComponent(id)); return; }
    if (/^(https?:|mailto:|tel:)/i.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
  };

  const insertFiles = async (files: File[], at?: number) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    for (const file of images) {
      try {
        const prepared = await preparePhoto(file, file.name || 'image');
        const asset = await savePageAsset(prepared);
        const ed = editorRef.current;
        if (!ed || ed.isDestroyed) return;
        const node = { type: 'image', attrs: { localId: asset.localId, path: asset.path ?? null, name: asset.name, alt: (file.name || 'Image').replace(/\.[^.]+$/, '') } };
        if (at !== undefined) ed.chain().insertContentAt(at, node).run(); else ed.chain().focus().insertContent(node).run();
        if (!asset.path) toast('Image kept on this device. It uploads the next time you are online with this page open.');
      } catch (e) { toast(e instanceof Error ? e.message : 'That image could not be added.'); }
    }
  };

  handlers.current = {
    update: (ed) => {
      clearTimeout(derivedTimer.current);
      derivedTimer.current = setTimeout(() => {
        if (ed.isDestroyed) return;
        const nextHeadings = collectHeadings(ed);
        setHeadings((prev) => (sameJson(prev, nextHeadings) ? prev : nextHeadings));
        const nextSuggestions = listSuggestions(ed.state.doc);
        setSuggestions((prev) => (sameJson(prev, nextSuggestions) ? prev : nextSuggestions));
        if (liveCountRef.current) setWords(countText(ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n', ' ')).words);
      }, 180);
    },
    selection: (ed) => {
      const { $from, empty } = ed.state.selection;
      const marks = [...$from.marks(), ...($from.nodeAfter?.marks ?? []), ...($from.nodeBefore?.marks ?? [])];
      const thread = marks.find((m) => m.type.name === 'comment')?.attrs.id ?? marks.find((m) => m.type.name === 'insertion' || m.type.name === 'deletion')?.attrs.id;
      if (thread) setActiveThread(thread);
      if (empty && ed.isActive('link') && ed.isEditable) {
        const coords = ed.view.coordsAtPos($from.pos);
        setBubble({ href: ed.getAttributes('link').href ?? '', left: coords.left, top: coords.bottom + 6 });
      } else setBubble(null);
    },
    openWiki: (name) => {
      const id = knownTitles.get(name.trim().toLowerCase());
      if (id) { onPickNote(id); return; }
      void ask(`Create “${name}”?`, { message: 'That page does not exist yet. Creating it links the two.', initial: name, confirmLabel: 'Create page' })
        .then((value) => { if (value?.trim()) onNewNote(value.trim()); });
    },
    known: (name) => knownTitles.has(name.trim().toLowerCase()),
    editMath: (latex, block, apply) => { if (editing) setMathEdit({ latex, block, apply }); },
    pages: (count, bottom) => { setPages(count); setContentBottom(Math.ceil(bottom / 40) * 40); },
    click: (view, event) => {
      const target = event.target as HTMLElement;
      const commentId = target.closest<HTMLElement>('[data-comment-id]')?.dataset.commentId;
      if (commentId) { setActiveThread(commentId); if (phone) setCommentSheet(true); }
      const link = target.closest<HTMLAnchorElement>('a[href]');
      if (link && (event.ctrlKey || event.metaKey || !view.editable)) { event.preventDefault(); openHref(link.getAttribute('href') ?? ''); return true; }
      return false;
    },
    pasteFiles: (event) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!editing || !files.some((f) => f.type.startsWith('image/'))) return false;
      void insertFiles(files);
      return true;
    },
    dropFiles: (view, event) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (!editing || !files.some((f) => f.type.startsWith('image/'))) return false;
      event.preventDefault();
      void insertFiles(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos);
      return true;
    },
    painterUp: () => {
      const format = painter;
      if (!format) return;
      setTimeout(() => {
        const ed = editorRef.current;
        if (!ed || ed.isDestroyed || ed.state.selection.empty) return;
        applyFormat(ed, format);
        if (!format.sticky) setPainter(null);
      }, 0);
    },
    context: (event) => {
      if (phone || lastPointer.current === 'touch') return false;
      event.preventDefault();
      setMenuAt({ x: event.clientX, y: event.clientY });
      return true;
    },
  };

  /* ------------------------------------------------------------ actions */

  const captureFormat = (ed: Editor, sticky: boolean) => {
    const { $from } = ed.state.selection;
    const marks = (ed.state.storedMarks ?? $from.marks())
      .filter((m) => FORMAT_MARKS.includes(m.type.name))
      .map((m) => ({ type: m.type.name, attrs: { ...m.attrs } }));
    const block = Object.fromEntries(BLOCK_KEYS.map((k) => [k, $from.parent.attrs[k] ?? null]));
    return { sticky, marks, block };
  };
  const applyFormat = (ed: Editor, format: NonNullable<typeof painter>) => {
    const chain = ed.chain();
    for (const mark of FORMAT_MARKS) chain.unsetMark(mark);
    for (const mark of format.marks) chain.setMark(mark.type, mark.attrs);
    chain.updateAttributes('paragraph', format.block).updateAttributes('heading', format.block).run();
  };

  const addComment = () => {
    const { from, to, empty } = editor.state.selection;
    if (empty) { toast('Select the text you want to comment on.'); return; }
    setCommentsOn(true);
    setDraft({ id: 'c-' + crypto.randomUUID(), quote: editor.state.doc.textBetween(from, to, ' ').slice(0, 300), from, to });
    if (phone) setCommentSheet(true);
  };
  const createComment = (text: string) => {
    if (!draft) return;
    const size = editor.state.doc.content.size;
    editor.chain().setTextSelection({ from: Math.min(draft.from, size), to: Math.min(draft.to, size) }).addComment(draft.id).run();
    const next = [...comments, { id: draft.id, text, quote: draft.quote, created: new Date().toISOString() }];
    setComments(next);
    commit({ comments: next });
    setActiveThread(draft.id);
    setDraft(null);
  };
  const updateComments = (next: DocComment[]) => { setComments(next); commit({ comments: next }); };

  const applyPage = (next: DocPage) => { setPage(next); setPrintLayout(null); commit({ page: next }); };

  const selectTab = (id: string) => {
    if (id === activeRef.current) return;
    persist.current();
    setFind(null); setDraft(null); setBubble(null);
    setActiveTab(id);
  };
  const addTab = () => {
    persist.current();
    const id = 'tab-' + crypto.randomUUID();
    const next = [...docRef.current.tabs, { id, title: `Tab ${docRef.current.tabs.length + 1}`, html: '<p></p>' }];
    commit({ tabs: next });
    setTabs(next);
    setActiveTab(id);
  };
  const renameTab = (id: string, name: string) => {
    const next = docRef.current.tabs.map((t) => (t.id === id ? { ...t, title: name.slice(0, 80) } : t));
    commit({ tabs: next });
    setTabs(next);
  };
  const duplicateTab = (id: string) => {
    persist.current();
    const source = docRef.current.tabs.find((t) => t.id === id);
    if (!source) return;
    const copy = { id: 'tab-' + crypto.randomUUID(), title: `${source.title} copy`, html: source.html };
    const index = docRef.current.tabs.indexOf(source);
    const next = [...docRef.current.tabs.slice(0, index + 1), copy, ...docRef.current.tabs.slice(index + 1)];
    commit({ tabs: next });
    setTabs(next);
    setActiveTab(copy.id);
  };
  const deleteTab = async (id: string) => {
    const list = docRef.current.tabs;
    if (list.length < 2) return;
    const tab = list.find((t) => t.id === id);
    if (!await confirmAsk(`Delete “${tab?.title ?? 'this tab'}”?`, { message: 'Its content is removed from this document.', confirmLabel: 'Delete tab', danger: true })) return;
    persist.current();
    const index = list.findIndex((t) => t.id === id);
    const next = docRef.current.tabs.filter((t) => t.id !== id);
    commit({ tabs: next });
    setTabs(next);
    if (activeRef.current === id) setActiveTab(next[Math.max(0, index - 1)].id);
  };

  const exportTabs = async (embed: boolean) => {
    persist.current();
    const list = docRef.current.tabs.map((t) => ({ title: t.title, html: t.html }));
    return Promise.all(list.map(async (t) => ({ title: t.title, html: await withImageSources(t.html, embed) })));
  };
  const print = () => { void exportTabs(false).then((list) => printDocument(title || 'Untitled document', list, page)); };
  const download = (format: 'html' | 'txt' | 'md') => { void exportTabs(format === 'html').then((list) => downloadDocument(format, title || 'Untitled document', list, page)); };

  const insertImage = async (from: 'upload' | 'url' | 'camera') => {
    if (from === 'upload') { imageInput.current?.click(); return; }
    if (from === 'camera') { setCamera(true); return; }
    const url = (await ask('Insert image by URL', { placeholder: 'https://…', confirmLabel: 'Insert image' }))?.trim();
    if (!url) return;
    if (!/^https:\/\//i.test(url)) { toast('Use an image address that starts with https://'); return; }
    editor.chain().focus().insertContent({ type: 'image', attrs: { src: url, alt: '' } }).run();
  };

  const restoreSource = docRef.current.source ? async () => {
    const ok = await confirmAsk('Restore the Markdown version?', {
      message: 'This page goes back to the text it had before it became a formatted document. Formatting, tabs and comments added since then are removed.',
      confirmLabel: 'Restore', danger: true,
    });
    if (!ok || !docRef.current.source) return;
    discard.current = true;
    reopen(docRef.current.source.text);
  } : undefined;

  const context: DocContext = {
    editor, mode, setMode: (m) => { setMode(m); if (m !== 'editing') setPainter(null); }, zoom: zoomSetting, setZoom: setZoomPref,
    pageless, togglePageless: () => setPrintLayout(pageless),
    ruler: rulerOn, toggleRuler: () => setRulerOn(!rulerOn),
    outline: sidebarDocked || sidebarFloating, toggleOutline: () => { if (cramped) setOutlineOver(!outlineOver); else setOutlineOn(!outlineOn); },
    comments: commentsOn, toggleComments: () => (phone ? setCommentSheet((v) => !v) : setCommentsOn(!commentsOn)),
    menusHidden, toggleMenus: () => setMenusHidden(!menusHidden),
    spellcheck, toggleSpellcheck: () => setSpellcheck(!spellcheck),
    liveCount, toggleLiveCount: () => { setLiveCount(!liveCount); if (!liveCount) setWords(countText(editor.getText()).words); },
    open: (d) => { if (d === 'find' || d === 'replace') setFind(d); else setDialog(d); },
    insertImage: (from) => { void insertImage(from); },
    insertDrawing: () => setDrawing(true),
    insertEquation: (block) => setMathEdit({ latex: '', block }),
    print, download,
    newDocument: () => onNewNote('Untitled document'),
    copyDocument: () => { persist.current(); onCopy(`${title || 'Untitled document'} copy`, writeDoc(docRef.current)); },
    renameDocument: () => { setMenusHidden(false); setTimeout(() => { titleInput.current?.focus(); titleInput.current?.select(); }, 0); },
    moveToBin: () => { void confirmAsk('Move this document to the bin?', { message: 'You can restore it from the bin in your library.', confirmLabel: 'Move to bin', danger: true }).then((yes) => { if (yes) onDelete(); }); },
    restoreSource: restoreSource ? () => { void restoreSource(); } : undefined,
    startPainter: (sticky) => setPainter(captureFormat(editor, sticky)),
    fullScreen: () => { void shell.current?.requestFullscreen?.().catch(() => toast('Full screen is not available here.')); },
    addComment,
    hasSuggestions: suggestions.length > 0,
  };
  const contextRef = useRef(context);
  contextRef.current = context;
  const getMenus = useCallback((): MenuTree => buildMenus(contextRef.current), []);

  /* ----------------------------------------------------------- keyboard */

  const keyState = useRef({ context, editing });
  keyState.current = { context, editing };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { context: c, editing: canEdit } = keyState.current;
      const inside = shell.current?.contains(document.activeElement) || document.activeElement === document.body;
      if (!inside) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const take = (run: () => void) => { event.preventDefault(); event.stopPropagation(); run(); };
      const ed = editorRef.current;
      if (!ed) return;
      if (event.key === 'Escape' && painterRef.current) take(() => setPainter(null));
      else if (mod && !event.shiftKey && !event.altKey && key === 'f') take(() => setFind('find'));
      else if (mod && !event.shiftKey && !event.altKey && key === 'h') take(() => setFind(canEdit ? 'replace' : 'find'));
      else if (mod && !event.shiftKey && !event.altKey && key === 'p') take(c.print);
      else if (mod && !event.altKey && key === 'k' && !event.shiftKey) take(() => { if (canEdit) setDialog('link'); });
      else if (mod && event.shiftKey && key === 'c') take(() => setDialog('wordCount'));
      else if (mod && (key === '/' || event.code === 'Slash') && !event.altKey) take(() => setDialog('shortcuts'));
      else if (mod && event.altKey && key === 'm') take(c.addComment);
      else if (mod && event.shiftKey && (event.key === '>' || event.code === 'Period')) take(() => { const s = currentFontSize(ed); setFontSize(ed, FONT_SIZES.find((x) => x > s) ?? s + 12); });
      else if (mod && event.shiftKey && (event.key === '<' || event.code === 'Comma')) take(() => { const s = currentFontSize(ed); setFontSize(ed, [...FONT_SIZES].reverse().find((x) => x < s) ?? Math.max(1, s - 1)); });
      else if (event.altKey && event.shiftKey && event.code === 'Digit5') take(() => ed.chain().focus().toggleStrike().run());
      else if (mod && event.key === '\\') take(() => clearFormatting(ed));
      else if (mod && event.shiftKey && key === 'f') take(c.toggleMenus);
      else if (mod && event.altKey && key === 'c') take(() => { copiedFormat.current = captureFormat(ed, false); toast('Format copied. Select text and press Ctrl+Alt+V.'); });
      else if (mod && event.altKey && key === 'v') take(() => { if (copiedFormat.current && canEdit) applyFormat(ed, copiedFormat.current); });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------------ render */

  const openComments = comments.filter((c) => !c.resolved).length + suggestions.length;
  const showColumn = !phone && commentsOn && (openComments > 0 || !!draft);
  const indents = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return { indent: 0, firstLine: 0 };
      const a = { ...e.getAttributes('heading'), ...e.getAttributes('paragraph') };
      return { indent: Number(a.indent) || 0, firstLine: Number(a.firstLine) || 0 };
    },
  });
  const pagesHeight = pages * px.height + (pages - 1) * GAP;
  const side = phone ? 18 : 48;
  const editorVars = {
    '--doc-top': `${pageless ? (phone ? 22 : 48) : px.top}px`, '--doc-right': `${pageless ? Math.min(px.right, side) : px.right}px`,
    '--doc-bottom': `${pageless ? 96 : px.bottom}px`, '--doc-left': `${pageless ? Math.min(px.left, side) : px.left}px`,
    '--doc-min-height': pageless ? '100%' : `${pagesHeight}px`, '--doc-page-color': page.color,
  } as React.CSSProperties;
  const toCtx = (entries: MenuEntry[]): CtxItem[] => entries
    .filter((e): e is MenuItem => e !== 'separator')
    .map((e) => ({ label: e.label, icon: e.icon ?? 'dots', disabled: e.disabled, checked: e.checked, swatch: e.swatch, run: e.run, items: e.items ? toCtx(e.items) : undefined }));

  const contextEntries = (): MenuEntry[] => {
    const has = !editor.state.selection.empty;
    const format = getMenus().find((m) => m.label === 'Format')!.entries.filter((e): e is MenuItem => e !== 'separator' && !!e.items);
    const table = format.find((e) => e.label === 'Table');
    return [
      { label: 'Cut', icon: 'scissors', shortcut: 'Ctrl+X', disabled: !editing || !has, run: () => copyOrCut(editor, true) },
      { label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', disabled: !has, run: () => copyOrCut(editor, false) },
      { label: 'Paste', icon: 'clipboard', shortcut: 'Ctrl+V', disabled: !editing, run: () => void paste(editor, false) },
      { label: 'Paste without formatting', icon: 'clipboard', shortcut: 'Ctrl+Shift+V', disabled: !editing, run: () => void paste(editor, true) },
      { label: 'Delete', icon: 'trash', disabled: !editing || !has, run: () => editor.chain().focus().deleteSelection().run() },
      'separator',
      { label: 'Comment', icon: 'comment', shortcut: 'Ctrl+Alt+M', disabled: !has, run: addComment },
      { label: mode === 'suggesting' ? 'Stop suggesting' : 'Suggest edits', icon: 'suggest', disabled: mode === 'viewing', run: () => context.setMode(mode === 'suggesting' ? 'editing' : 'suggesting') },
      'separator',
      ...(editor.isActive('link')
        ? [
          { label: 'Open link', icon: 'link' as const, run: () => openHref(editor.getAttributes('link').href ?? '') },
          { label: 'Edit link', icon: 'edit' as const, shortcut: 'Ctrl+K', disabled: !editing, run: () => setDialog('link') },
          { label: 'Remove link', icon: 'close' as const, disabled: !editing, run: () => editor.chain().focus().extendMarkRange('link').unsetLink().run() },
        ]
        : [{ label: 'Insert link', icon: 'link' as const, shortcut: 'Ctrl+K', disabled: !editing, run: () => setDialog('link') }]),
      ...(table && !table.disabled ? ['separator' as const, table] : []),
      'separator',
      { label: page.orientation === 'portrait' ? 'Change page to landscape' : 'Change page to portrait', icon: 'docPage', disabled: !editing, run: () => applyPage({ ...page, orientation: page.orientation === 'portrait' ? 'landscape' : 'portrait' }) },
      { label: 'Format options', icon: 'textColor', disabled: !editing, items: format.filter((e) => e.label !== 'Table') },
      { label: 'Clear formatting', icon: 'clearFormat', shortcut: 'Ctrl+\\', disabled: !editing, run: () => clearFormatting(editor) },
    ];
  };

  return (
    <div ref={shell} className={'doc-shell' + (phone ? ' is-phone' : '') + (menusHidden ? ' is-compact' : '')} data-mode={mode}>
      <DocTooltip root={shell} />
      {!menusHidden && (
        <header className="doc-header">
          <span className="doc-badge" aria-hidden><Icon name="docPage" size={phone ? 18 : 22} /></span>
          <div className="doc-header-main">
            <div className="doc-title-row">
              <input ref={titleInput} className="doc-title" aria-label="Document title" placeholder="Untitled document" value={title}
                size={Math.max(8, Math.min(48, (title || 'Untitled document').length + 1))}
                onChange={(e) => onTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editor.commands.focus(); } }} />
              <button type="button" className="doc-header-icon" aria-label={tags.length ? `Tags: ${tags.join(', ')}` : 'Add tags'} data-doc-tip={tags.length ? `Tags: ${tags.map((t) => '#' + t).join(' ')}` : 'Add tags'} onClick={() => setDialog('tags')}>
                <Icon name="tag" size={15} />{tags.length > 0 && <span className="doc-count">{tags.length}</span>}
              </button>
              <PageSaveStatus id={note.id} waiting={saving}/>
            </div>
            {!phone && <MenuBar getMenus={getMenus} />}
          </div>
          <div className="doc-header-end">
            <button type="button" className="doc-header-icon" aria-label={`Comments and suggestions, ${openComments} open`} data-doc-tip="Comments and suggestions"
              aria-pressed={phone ? commentSheet : commentsOn} onClick={context.toggleComments}>
              <Icon name="comment" size={18} />{openComments > 0 && <span className="doc-count">{openComments}</span>}
            </button>
            {taskButton}
            {phone && <button type="button" className="doc-header-icon" aria-label="Menus" onClick={() => setPhoneMenu(true)}><Icon name="moreVert" size={20} /></button>}
          </div>
        </header>
      )}

      <DocToolbar context={context} getMenus={getMenus} phone={phone} painter={painter ? (painter.sticky ? 'sticky' : 'once') : null}
        onPaint={(action) => setPainter(action === 'off' ? null : captureFormat(editor, action === 'sticky'))} />

      <div className="doc-body" ref={body}>
        {(sidebarDocked || sidebarFloating) && (
          <DocSidebar tabs={tabs} activeId={activeTab} headings={headings} backlinks={backlinks} editable={editing}
            onSelect={selectTab} onAdd={addTab} onRename={renameTab} onDuplicate={duplicateTab} onDelete={(id) => void deleteTab(id)}
            onJump={(pos) => { editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run(); }}
            onHide={() => { if (sidebarFloating) setOutlineOver(false); else setOutlineOn(false); }} onOpenNote={(id) => { setOutlineOver(false); onPickNote(id); }}
            floating={sidebarFloating} />
        )}
        {!phone && !sidebarDocked && !sidebarFloating && (
          <button type="button" className="doc-outline-show" aria-label="Show tabs & outlines" data-doc-tip="Show tabs & outlines" onClick={() => { if (cramped) setOutlineOver(true); else setOutlineOn(true); }}>
            <Icon name="outline" size={18} />
          </button>
        )}
        {phone && tabs.length > 1 && (
          <div className="doc-phone-tabs" role="tablist">
            {tabs.map((t) => <button key={t.id} type="button" role="tab" aria-selected={t.id === activeTab} onClick={() => selectTab(t.id)}>{t.title}</button>)}
          </div>
        )}

        <div ref={canvas} className={'doc-canvas' + (painter ? ' is-painting' : '') + (pageless ? ' is-pageless' : '')} onScroll={() => setBubble(null)}
          onPointerDown={() => { if (sidebarFloating) setOutlineOver(false); }}>
          {!phone && rulerOn && (
            <div className="doc-ruler-bar" style={{ paddingRight: showColumn ? 320 : 0 }}>
              <DocRuler page={page} zoom={zoom} editable={editing} indent={indents.indent} firstLine={indents.firstLine}
                onMargins={(left, right) => applyPage({ ...page, margins: { ...page.margins, left, right } })}
                onIndents={(indent, first) => editor.chain().setIndents(Math.round(indent), Math.round(first)).run()} />
            </div>
          )}
          <div className="doc-stage">
            {!phone && rulerOn && !pageless && <DocVerticalRuler page={page} zoom={zoom} pages={pages} gap={GAP} />}
            <div className="doc-zoom" style={{ zoom }}>
              <div className={'doc-pages' + (pageless ? ' is-pageless' : '')}
                style={pageless ? { width: Math.max(320, Math.min(px.width, canvasWidth ? (canvasWidth - (phone ? 0 : 48)) / zoom : px.width)), minHeight: Math.max(contentBottom, 600), background: page.color } : { width: px.width, height: pagesHeight }}>
                {!pageless && Array.from({ length: pages }, (_, i) => (
                  <div key={i} className="doc-sheet" style={{ top: i * (px.height + GAP), height: px.height, background: page.color }} aria-hidden />
                ))}
                <EditorContent editor={editor} className="doc-editor" style={editorVars} />
              </div>
            </div>
            {showColumn && (
              <DocComments editor={editor} comments={comments} suggestions={suggestions} draft={draft} activeId={activeThread} stacked={false} editable={editing}
                onActivate={setActiveThread} onCreate={createComment} onCancelDraft={() => setDraft(null)}
                onReply={(id, text) => updateComments(comments.map((c) => (c.id === id ? { ...c, replies: [...(c.replies ?? []), { id: 'r-' + crypto.randomUUID(), text, created: new Date().toISOString() }] } : c)))}
                onResolve={(id) => { editor.chain().removeComment(id).run(); updateComments(comments.map((c) => (c.id === id ? { ...c, resolved: true } : c))); }}
                onDelete={(id) => { editor.chain().removeComment(id).run(); updateComments(comments.filter((c) => c.id !== id)); }}
                onEdit={(id, text) => updateComments(comments.map((c) => (c.id === id ? { ...c, text } : c)))}
                onAccept={(id) => editor.chain().resolveSuggestion(id, true).run()}
                onReject={(id) => editor.chain().resolveSuggestion(id, false).run()} />
            )}
          </div>
        </div>
      </div>

      {find && <DocFind editor={editor} replace={find === 'replace'} canReplace={editing} onReplaceToggle={(on) => setFind(on ? 'replace' : 'find')} onClose={() => setFind(null)} />}
      {liveCount && <button type="button" className="doc-live-count" onClick={() => setDialog('wordCount')}>{words.toLocaleString()} {words === 1 ? 'word' : 'words'}</button>}
      {mode === 'suggesting' && <div className="doc-mode-banner" role="status"><Icon name="suggest" size={15} />Suggesting. Your edits show as suggestions.</div>}
      {painter && <div className="doc-mode-banner is-paint" role="status"><Icon name="paintFormat" size={15} />Select text to paint the format{painter.sticky ? '. Press Esc when done.' : '.'}</div>}

      {bubble && editing && typeof document !== 'undefined' && createPortal(
        <div className="doc-link-bubble" style={{ left: Math.max(8, Math.min(bubble.left, innerWidth - 320)), top: bubble.top }} onMouseDown={(e) => e.preventDefault()}>
          <Icon name="link" size={15} />
          <button type="button" className="doc-link-bubble-url" onClick={() => openHref(bubble.href)} title={bubble.href}>
            {noteIdFromHref(bubble.href) ? notes.find((n) => n.id === decodeURIComponent(noteIdFromHref(bubble.href)!))?.title || 'A page in your notebooks' : bubble.href}
          </button>
          <button type="button" className="doc-tool" aria-label="Copy link" data-doc-tip="Copy link" onClick={() => { void navigator.clipboard?.writeText(bubble.href.startsWith('/') ? location.origin + bubble.href : bubble.href); toast('Link copied'); }}><Icon name="copy" size={15} /></button>
          <button type="button" className="doc-tool" aria-label="Edit link" data-doc-tip="Edit link" onClick={() => setDialog('link')}><Icon name="edit" size={15} /></button>
          <button type="button" className="doc-tool" aria-label="Remove link" data-doc-tip="Remove link" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setBubble(null); }}><Icon name="close" size={15} /></button>
        </div>,
        document.body,
      )}

      {menuAt && <MenuPanel entries={contextEntries()} x={menuAt.x} y={menuAt.y} label="Document" onClose={() => setMenuAt(null)} />}
      {phoneMenu && (
        <ContextMenu x={innerWidth - 16} y={64} kind="document" label="Menus" onClose={() => setPhoneMenu(false)}
          items={getMenus().map((m) => ({ label: m.label, icon: MENU_ICONS[m.label] ?? 'dots', items: toCtx(m.entries) }))} />
      )}
      {phone && commentSheet && typeof document !== 'undefined' && createPortal(
        <div className="doc-sheet-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) setCommentSheet(false); }}>
          <section className="doc-comment-sheet" role="dialog" aria-label="Comments and suggestions">
            <header><h2>Comments</h2><button type="button" className="doc-modal-close" aria-label="Close" onClick={() => setCommentSheet(false)}><Icon name="close" size={18} /></button></header>
            <DocComments editor={editor} comments={comments} suggestions={suggestions} draft={draft} activeId={activeThread} stacked editable={editing}
              onActivate={setActiveThread} onCreate={createComment} onCancelDraft={() => setDraft(null)}
              onReply={(id, text) => updateComments(comments.map((c) => (c.id === id ? { ...c, replies: [...(c.replies ?? []), { id: 'r-' + crypto.randomUUID(), text, created: new Date().toISOString() }] } : c)))}
              onResolve={(id) => { editor.chain().removeComment(id).run(); updateComments(comments.map((c) => (c.id === id ? { ...c, resolved: true } : c))); }}
              onDelete={(id) => { editor.chain().removeComment(id).run(); updateComments(comments.filter((c) => c.id !== id)); }}
              onEdit={(id, text) => updateComments(comments.map((c) => (c.id === id ? { ...c, text } : c)))}
              onAccept={(id) => editor.chain().resolveSuggestion(id, true).run()}
              onReject={(id) => editor.chain().resolveSuggestion(id, false).run()} />
          </section>
        </div>,
        document.body,
      )}

      {dialog === 'link' && <LinkDialog editor={editor} notes={notes} noteId={note.id} onClose={() => setDialog(null)} />}
      {dialog === 'pageSetup' && <PageSetupDialog page={page} onApply={applyPage} onClose={() => setDialog(null)} />}
      {dialog === 'wordCount' && <WordCountDialog editor={editor} pages={pageless ? 1 : pages} live={liveCount} onLive={(on) => { setLiveCount(on); if (on) setWords(countText(editor.getText()).words); }} onClose={() => setDialog(null)} />}
      {dialog === 'specialChars' && <SpecialCharactersDialog onInsert={(text) => editor.chain().focus().insertContent(text).run()} onClose={() => setDialog(null)} />}
      {dialog === 'emoji' && <EmojiDialog onInsert={(text) => { editor.chain().focus().insertContent(text).run(); setDialog(null); }} onClose={() => setDialog(null)} />}
      {dialog === 'shortcuts' && <ShortcutsDialog menus={getMenus()} onClose={() => setDialog(null)} />}
      {dialog === 'tags' && <TagsDialog tags={tags} onSet={onSetTags} onClose={() => setDialog(null)} />}
      {dialog === 'table' && <TableDialog onInsert={(rows, cols) => editor.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run()} onClose={() => setDialog(null)} />}

      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden
        onChange={(e) => { const files = Array.from(e.target.files ?? []); e.currentTarget.value = ''; void insertFiles(files); }} />

      {mathEdit && typeof document !== 'undefined' && createPortal(
        <div className="doc-modal-backdrop">
          <MathEquationEditor initialFormula={mathEdit.latex}
            onInsert={(latex) => {
              if (mathEdit.apply) mathEdit.apply(latex);
              else editor.chain().focus().insertContent({ type: mathEdit.block ? 'mathBlock' : 'mathInline', attrs: { latex } }).run();
              setMathEdit(null);
            }}
            onClose={() => setMathEdit(null)} />
        </div>,
        document.body,
      )}
      {drawing && typeof document !== 'undefined' && createPortal(
        <div className="doc-modal-backdrop">
          <NoteSketchpad onClose={() => setDrawing(false)}
            onInsert={(dataUrl) => { setDrawing(false); void insertFiles([dataUrlToFile(dataUrl, 'Drawing.png')]); }} />
        </div>,
        document.body,
      )}
      {camera && (
        <PhotoCapture heading="Add a photo to this document" confirmLabel="Insert photo" onClose={() => setCamera(false)}
          invitation={{ title: <>Show it,<br />don’t describe it.</>, text: 'Take a photo and it goes into the document where your cursor is.' }}
          onKeep={(file) => insertFiles([file])} />
      )}
      {activeThread && <style>{`.doc-prose [data-comment-id="${CSS.escape(activeThread)}"],.doc-prose [data-suggestion="${CSS.escape(activeThread)}"]{box-shadow:0 2px 0 #f9ab00;background-color:rgba(255,212,0,.55)}`}</style>}
    </div>
  );
}
