import type { Editor } from '@tiptap/core';
import type { MenuEntry, MenuItem } from './DocMenu';
import { applyStyle, capitalize, copyOrCut, currentFontSize, currentStyle, insertDate, paste, setFontSize, type DocMode } from './docCommands';
import { BULLET_STYLES, FONT_SIZES, LINE_SPACINGS, NUMBER_STYLES, PARAGRAPH_STYLES, ZOOMS } from './palette';

export type DocDialog = 'link' | 'pageSetup' | 'wordCount' | 'specialChars' | 'emoji' | 'shortcuts' | 'tags' | 'find' | 'replace' | 'table';

/** Everything the menus, toolbar and shortcuts can ask the document to do. */
export type DocContext = {
  editor: Editor;
  mode: DocMode;
  setMode: (mode: DocMode) => void;
  zoom: number | 'fit';
  setZoom: (zoom: number | 'fit') => void;
  pageless: boolean;
  togglePageless: () => void;
  ruler: boolean;
  toggleRuler: () => void;
  outline: boolean;
  toggleOutline: () => void;
  comments: boolean;
  toggleComments: () => void;
  menusHidden: boolean;
  toggleMenus: () => void;
  spellcheck: boolean;
  toggleSpellcheck: () => void;
  liveCount: boolean;
  toggleLiveCount: () => void;
  open: (dialog: DocDialog) => void;
  insertImage: (from: 'upload' | 'url' | 'camera') => void;
  insertDrawing: () => void;
  insertEquation: (block: boolean) => void;
  print: () => void;
  download: (format: 'html' | 'txt' | 'md') => void;
  newDocument: () => void;
  copyDocument: () => void;
  renameDocument: () => void;
  moveToBin: () => void;
  restoreSource?: () => void;
  startPainter: (sticky: boolean) => void;
  fullScreen: () => void;
  addComment: () => void;
  hasSuggestions: boolean;
};

const FORMAT_MARKS = ['bold', 'italic', 'underline', 'strike', 'code', 'textStyle', 'highlight', 'subscript', 'superscript'];

export function clearFormatting(editor: Editor) {
  const chain = editor.chain().focus();
  for (const mark of FORMAT_MARKS) if (editor.schema.marks[mark]) chain.unsetMark(mark, { extendEmptyMarkRange: true });
  chain.unsetTextAlign().setLineSpacing(null).setParagraphSpacing('before', null).setParagraphSpacing('after', null).setIndents(null, null).run();
}

export const MODES: { id: DocMode; name: string; hint: string; icon: 'edit' | 'suggest' | 'eye' }[] = [
  { id: 'editing', name: 'Editing', hint: 'Edit the document directly', icon: 'edit' },
  { id: 'suggesting', name: 'Suggesting', hint: 'Edits become suggestions you can accept or reject', icon: 'suggest' },
  { id: 'viewing', name: 'Viewing', hint: 'Read the document without changing it', icon: 'eye' },
];

export function zoomEntries(c: Pick<DocContext, 'zoom' | 'setZoom'>): MenuEntry[] {
  return [
    { label: 'Fit', checked: c.zoom === 'fit', run: () => c.setZoom('fit') },
    ...ZOOMS.map((z): MenuItem => ({ label: `${Math.round(z * 100)}%`, checked: c.zoom === z, run: () => c.setZoom(z) })),
  ];
}

export function styleEntries(editor: Editor): MenuEntry[] {
  const now = currentStyle(editor);
  return PARAGRAPH_STYLES.map((style): MenuItem => ({
    label: style.name, checked: now === style.id, shortcut: style.shortcut || undefined,
    style: { fontSize: `${Math.min(22, style.size + 2)}px`, fontWeight: style.id.startsWith('h') && Number(style.id[1]) <= 2 ? 500 : 400, color: style.id === 'subtitle' || style.id === 'h4' || style.id === 'h5' || style.id === 'h6' ? '#666' : undefined, fontStyle: style.id === 'h6' ? 'italic' : undefined },
    run: () => applyStyle(editor, style.id),
  }));
}

export function spacingEntries(editor: Editor): MenuEntry[] {
  const paragraph = { ...editor.getAttributes('heading'), ...editor.getAttributes('paragraph') };
  const line = paragraph.lineHeight ?? '1.15';
  return [
    ...LINE_SPACINGS.map((s): MenuItem => ({ label: s.name, checked: line === s.value, run: () => editor.chain().focus().setLineSpacing(s.value === '1.15' ? null : s.value).run() })),
    'separator',
    paragraph.spaceBefore
      ? { label: 'Remove space before paragraph', run: () => editor.chain().focus().setParagraphSpacing('before', null).run() }
      : { label: 'Add space before paragraph', run: () => editor.chain().focus().setParagraphSpacing('before', 12).run() },
    paragraph.spaceAfter
      ? { label: 'Remove space after paragraph', run: () => editor.chain().focus().setParagraphSpacing('after', null).run() }
      : { label: 'Add space after paragraph', run: () => editor.chain().focus().setParagraphSpacing('after', 12).run() },
  ];
}

export function listEntries(editor: Editor, kind: 'bullet' | 'number'): MenuEntry[] {
  const name = kind === 'bullet' ? 'bulletList' : 'orderedList';
  const active = editor.isActive(name) ? editor.getAttributes(name).listStyle ?? (kind === 'bullet' ? 'disc' : 'decimal') : null;
  return (kind === 'bullet' ? BULLET_STYLES : NUMBER_STYLES).map((s): MenuItem => ({
    label: s.name, checked: active === s.value, run: () => editor.chain().focus().setListStyle(kind, s.value).run(),
  }));
}

export function buildMenus(c: DocContext): { label: string; entries: MenuEntry[] }[] {
  const e = c.editor;
  const editing = c.mode !== 'viewing';
  const inTable = e.isActive('table');
  const chain = () => e.chain().focus();
  const toggle = (label: string, mark: string, shortcut: string, run: () => void, icon?: MenuItem['icon']): MenuItem =>
    ({ label, icon, shortcut, checked: e.isActive(mark), disabled: !editing, run });
  const size = currentFontSize(e);

  return [
    {
      label: 'File',
      entries: [
        { label: 'New document', icon: 'docPage', run: c.newDocument },
        { label: 'Make a copy', icon: 'copy', run: c.copyDocument },
        'separator',
        { label: 'Download', icon: 'download2', items: [
          { label: 'Web page (.html)', run: () => c.download('html') },
          { label: 'Plain text (.txt)', run: () => c.download('txt') },
          { label: 'Markdown (.md)', run: () => c.download('md') },
          { label: 'PDF document (.pdf)', run: c.print },
        ] },
        { label: 'Rename', icon: 'edit', run: c.renameDocument },
        { label: 'Move to bin', icon: 'trash', run: c.moveToBin },
        ...(c.restoreSource ? ['separator' as const, { label: 'Restore the Markdown before conversion', icon: 'undo' as const, run: c.restoreSource }] : []),
        'separator',
        { label: 'Page setup', icon: 'docPage', run: () => c.open('pageSetup') },
        { label: 'Print', icon: 'print', shortcut: 'Ctrl+P', run: c.print },
      ],
    },
    {
      label: 'Edit',
      entries: [
        { label: 'Undo', icon: 'undo', shortcut: 'Ctrl+Z', disabled: !editing || !e.can().undo(), run: () => chain().undo().run() },
        { label: 'Redo', icon: 'redo', shortcut: 'Ctrl+Y', disabled: !editing || !e.can().redo(), run: () => chain().redo().run() },
        'separator',
        { label: 'Cut', icon: 'scissors', shortcut: 'Ctrl+X', disabled: !editing, run: () => copyOrCut(e, true) },
        { label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', run: () => copyOrCut(e, false) },
        { label: 'Paste', icon: 'clipboard', shortcut: 'Ctrl+V', disabled: !editing, run: () => void paste(e, false) },
        { label: 'Paste without formatting', icon: 'clipboard', shortcut: 'Ctrl+Shift+V', disabled: !editing, run: () => void paste(e, true) },
        'separator',
        { label: 'Select all', shortcut: 'Ctrl+A', run: () => chain().selectAll().run() },
        { label: 'Delete', icon: 'trash', disabled: !editing, run: () => chain().deleteSelection().run() },
        'separator',
        { label: 'Find and replace', icon: 'search', shortcut: 'Ctrl+H', run: () => c.open(editing ? 'replace' : 'find') },
      ],
    },
    {
      label: 'View',
      entries: [
        { label: 'Mode', icon: 'edit', items: MODES.map((m): MenuItem => ({ label: m.name, icon: m.icon, checked: c.mode === m.id, run: () => c.setMode(m.id) })) },
        'separator',
        { label: 'Show print layout', checked: !c.pageless, run: c.togglePageless },
        { label: 'Show ruler', checked: c.ruler, run: c.toggleRuler },
        { label: 'Show tabs & outlines', checked: c.outline, run: c.toggleOutline },
        { label: 'Show comments', checked: c.comments, run: c.toggleComments },
        { label: 'Show word count while typing', checked: c.liveCount, run: c.toggleLiveCount },
        'separator',
        { label: 'Zoom', icon: 'zoomIn', items: zoomEntries(c) },
        { label: 'Full screen', icon: 'fullscreen', run: c.fullScreen },
        { label: c.menusHidden ? 'Show the menus' : 'Hide the menus', icon: 'chevronUp', shortcut: 'Ctrl+Shift+F', run: c.toggleMenus },
      ],
    },
    {
      label: 'Insert',
      entries: [
        { label: 'Image', icon: 'image', disabled: !editing, items: [
          { label: 'Upload from computer', icon: 'upload', run: () => c.insertImage('upload') },
          { label: 'By URL', icon: 'link', run: () => c.insertImage('url') },
          { label: 'Camera', icon: 'camera', run: () => c.insertImage('camera') },
        ] },
        { label: 'Table', icon: 'table', disabled: !editing, run: () => c.open('table') },
        { label: 'Drawing', icon: 'pen', disabled: !editing, run: c.insertDrawing },
        { label: 'Link', icon: 'link', shortcut: 'Ctrl+K', disabled: !editing, run: () => c.open('link') },
        { label: 'Equation', icon: 'sigma', disabled: !editing, items: [
          { label: 'In the line', run: () => c.insertEquation(false) },
          { label: 'On its own line', run: () => c.insertEquation(true) },
        ] },
        'separator',
        { label: 'Emoji', icon: 'emoji', disabled: !editing, run: () => c.open('emoji') },
        { label: 'Special characters', icon: 'omega', disabled: !editing, run: () => c.open('specialChars') },
        { label: 'Horizontal line', icon: 'horizontalLine', disabled: !editing, run: () => chain().setHorizontalRule().run() },
        { label: 'Date', icon: 'cal', disabled: !editing, run: () => insertDate(e) },
        { label: 'Checklist', icon: 'listCheck', shortcut: 'Ctrl+Shift+9', disabled: !editing, run: () => chain().toggleTaskList().run() },
        { label: 'Break', icon: 'pageBreak', disabled: !editing, items: [
          { label: 'Page break', shortcut: 'Ctrl+Enter', run: () => chain().setPageBreak().run() },
          { label: 'Line break', shortcut: 'Shift+Enter', run: () => chain().setHardBreak().run() },
        ] },
        'separator',
        { label: 'Comment', icon: 'comment', shortcut: 'Ctrl+Alt+M', disabled: e.state.selection.empty, run: c.addComment },
      ],
    },
    {
      label: 'Format',
      entries: [
        { label: 'Text', icon: 'bold', disabled: !editing, items: [
          toggle('Bold', 'bold', 'Ctrl+B', () => chain().toggleBold().run(), 'bold'),
          toggle('Italic', 'italic', 'Ctrl+I', () => chain().toggleItalic().run(), 'italic'),
          toggle('Underline', 'underline', 'Ctrl+U', () => chain().toggleUnderline().run(), 'underline'),
          toggle('Strikethrough', 'strike', 'Alt+Shift+5', () => chain().toggleStrike().run(), 'strike'),
          toggle('Superscript', 'superscript', 'Ctrl+.', () => chain().toggleSuperscript().run(), 'superscript'),
          toggle('Subscript', 'subscript', 'Ctrl+,', () => chain().toggleSubscript().run(), 'subscript'),
          'separator',
          { label: 'Size', items: [
            { label: 'Increase font size', shortcut: 'Ctrl+Shift+.', run: () => setFontSize(e, FONT_SIZES.find((s) => s > size) ?? size + 12) },
            { label: 'Decrease font size', shortcut: 'Ctrl+Shift+,', run: () => setFontSize(e, [...FONT_SIZES].reverse().find((s) => s < size) ?? Math.max(1, size - 1)) },
          ] },
          { label: 'Capitalization', items: [
            { label: 'lowercase', run: () => capitalize(e, 'lower') },
            { label: 'UPPERCASE', run: () => capitalize(e, 'upper') },
            { label: 'Title Case', run: () => capitalize(e, 'title') },
          ] },
        ] },
        { label: 'Paragraph styles', icon: 'heading', disabled: !editing, items: styleEntries(e) },
        { label: 'Align & indent', icon: 'alignLeft', disabled: !editing, items: [
          { label: 'Left', icon: 'alignLeft', shortcut: 'Ctrl+Shift+L', checked: e.isActive({ textAlign: 'left' }), run: () => chain().setTextAlign('left').run() },
          { label: 'Center', icon: 'alignCenter', shortcut: 'Ctrl+Shift+E', checked: e.isActive({ textAlign: 'center' }), run: () => chain().setTextAlign('center').run() },
          { label: 'Right', icon: 'alignRight', shortcut: 'Ctrl+Shift+R', checked: e.isActive({ textAlign: 'right' }), run: () => chain().setTextAlign('right').run() },
          { label: 'Justified', icon: 'alignJustify', shortcut: 'Ctrl+Shift+J', checked: e.isActive({ textAlign: 'justify' }), run: () => chain().setTextAlign('justify').run() },
          'separator',
          { label: 'Increase indent', icon: 'indentMore', shortcut: 'Ctrl+]', run: () => chain().indentBlock().run() },
          { label: 'Decrease indent', icon: 'indentLess', shortcut: 'Ctrl+[', run: () => chain().outdentBlock().run() },
        ] },
        { label: 'Line & paragraph spacing', icon: 'lineSpacing', disabled: !editing, items: spacingEntries(e) },
        { label: 'Bullets & numbering', icon: 'listBullet', disabled: !editing, items: [
          { label: 'Bulleted list', icon: 'listBullet', items: listEntries(e, 'bullet') },
          { label: 'Numbered list', icon: 'listNumber', items: listEntries(e, 'number') },
          { label: 'Checklist', icon: 'listCheck', checked: e.isActive('taskList'), run: () => chain().toggleTaskList().run() },
        ] },
        { label: 'Table', icon: 'table', disabled: !editing || !inTable, items: [
          { label: 'Insert row above', run: () => chain().addRowBefore().run() },
          { label: 'Insert row below', run: () => chain().addRowAfter().run() },
          { label: 'Insert column left', run: () => chain().addColumnBefore().run() },
          { label: 'Insert column right', run: () => chain().addColumnAfter().run() },
          'separator',
          { label: 'Delete row', run: () => chain().deleteRow().run() },
          { label: 'Delete column', run: () => chain().deleteColumn().run() },
          { label: 'Delete table', run: () => chain().deleteTable().run() },
          'separator',
          { label: 'Merge cells', disabled: !e.can().mergeCells(), run: () => chain().mergeCells().run() },
          { label: 'Unmerge cells', disabled: !e.can().splitCell(), run: () => chain().splitCell().run() },
          { label: 'Header row', checked: e.isActive('tableHeader'), run: () => chain().toggleHeaderRow().run() },
        ] },
        'separator',
        { label: 'Clear formatting', icon: 'clearFormat', shortcut: 'Ctrl+\\', disabled: !editing, run: () => clearFormatting(e) },
      ],
    },
    {
      label: 'Tools',
      entries: [
        { label: 'Word count', icon: 'text', shortcut: 'Ctrl+Shift+C', run: () => c.open('wordCount') },
        { label: 'Spelling', icon: 'spellcheck', items: [{ label: 'Show spelling suggestions', checked: c.spellcheck, run: c.toggleSpellcheck }] },
        { label: 'Review suggested edits', icon: 'suggest', disabled: !c.hasSuggestions || !editing, items: [
          { label: 'Accept all', icon: 'check', run: () => chain().resolveSuggestion(null, true).run() },
          { label: 'Reject all', icon: 'close', run: () => chain().resolveSuggestion(null, false).run() },
        ] },
        'separator',
        { label: 'Tags', icon: 'tag', run: () => c.open('tags') },
        { label: 'Paint format', icon: 'paintFormat', shortcut: 'Ctrl+Alt+C', disabled: !editing, run: () => c.startPainter(false) },
        { label: 'Keyboard shortcuts', icon: 'keyboard', shortcut: 'Ctrl+/', run: () => c.open('shortcuts') },
      ],
    },
  ];
}
