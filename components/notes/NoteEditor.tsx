'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { Icon, type IconName } from '../Icon';
import { ContextMenu, type CtxGroup } from '../ContextMenu';
import { usePrefs } from '@/lib/prefs';
import { PAL } from '@/lib/pal';
import { ask, confirmAsk } from '@/lib/ask';
import { toast } from '@/lib/toast';
import { uploadTo } from '@/lib/uploads';
import { playClick } from '@/lib/audio';
import {
  parse, spans, applyKind, wrap, newline, toggleTask, wordCount, taskCount, inlineMarkup,
  type Line, type LineKind,
} from '@/lib/md';
import { markPending, clearPending, whenLabel, type Note } from '@/lib/notes';

/* KaTeX's stylesheet used to sit at the top of globals.css, which made 41 KB of
   render-blocking CSS that every route paid for so that one tab could render
   maths. It rides with this editor now, which is itself loaded on demand. */
import 'katex/dist/katex.min.css';

/**
 * KaTeX and the two modals are loaded on demand.
 */
const MathEquationEditor = dynamic(
  () => import('./MathEquationEditor').then((m) => m.MathEquationEditor),
  { ssr: false },
);
const NoteSketchpad = dynamic(
  () => import('./NoteSketchpad').then((m) => m.NoteSketchpad),
  { ssr: false },
);

type Katex = (typeof import('katex'))['default'];
let katexMod: Katex | null = null;
let katexLoad: Promise<void> | null = null;

function useKatex(needed: boolean): Katex | null {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!needed || katexMod) return;
    let alive = true;
    katexLoad ??= import('katex').then((m) => { katexMod = m.default; });
    void katexLoad.then(() => { if (alive) bump((n) => n + 1); });
    return () => { alive = false; };
  }, [needed]);
  return katexMod;
}

const SAVE_DEBOUNCE_MS = 500;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export type PaperStyle = 'blank' | 'lined' | 'grid' | 'dotted';

function getPaperBackgroundStyle(style: PaperStyle, phone: boolean): React.CSSProperties {
  switch (style) {
    case 'lined':
      return {
        background: 'var(--card)',
        backgroundImage: 'repeating-linear-gradient(transparent, transparent calc(1.76em - 1px), color-mix(in srgb, var(--line2) 80%, transparent) calc(1.76em - 1px), color-mix(in srgb, var(--line2) 80%, transparent) 1.76em)',
        backgroundPosition: '0 10px',
      };
    case 'grid':
      return {
        background: 'var(--card)',
        backgroundImage: 'linear-gradient(to right, color-mix(in srgb, var(--line2) 65%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--line2) 65%, transparent) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      };
    case 'dotted':
      return {
        background: 'var(--card)',
        backgroundImage: 'radial-gradient(color-mix(in srgb, var(--tx3) 30%, transparent) 1.2px, transparent 1.2px)',
        backgroundSize: '20px 20px',
      };
    case 'blank':
    default:
      return {
        background: 'var(--card)',
      };
  }
}

/** Parse video links into embeddable iframe / player info */
function parseVideoUrl(url: string): { type: 'youtube' | 'vimeo' | 'direct'; embedUrl: string } | null {
  if (!url) return null;
  const clean = url.trim();

  // YouTube
  const ytMatch = clean.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i);
  if (ytMatch) {
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0&modestbranding=1`,
    };
  }

  // Vimeo
  const vimeoMatch = clean.match(/(?:vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/[^\/]*\/videos\/|album\/(?:\d+\/)?video\/|video\/|))(\d+)/i);
  if (vimeoMatch) {
    return {
      type: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
    };
  }

  // Direct video
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(clean) || clean.startsWith('data:video/') || clean.startsWith('blob:')) {
    return {
      type: 'direct',
      embedUrl: clean,
    };
  }

  if (/^https?:\/\//i.test(clean)) {
    return {
      type: 'direct',
      embedUrl: clean,
    };
  }

  return null;
}

export function NoteEditor({
  note, notes, tags, phone, onSave, onDelete, onPickNote, onNewNote, onSetTags, onBack,
}: {
  note: Note;
  notes: Note[];
  tags: string[];
  phone: boolean;
  onSave: (v: { title: string; body: string }) => void;
  onDelete: () => void;
  onPickNote: (id: string) => void;
  onNewNote: (title: string) => void;
  onSetTags: (tags: string[]) => void;
  onBack?: () => void;
}) {
  const { prefs } = usePrefs();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [dirty, setDirty] = useState(false);
  const [mathEditorOpen, setMathEditorOpen] = useState(false);
  const [initialMathFormula, setInitialMathFormula] = useState('');
  const [sketchpadOpen, setSketchpadOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxGroup[] } | null>(null);

  // Paper background look: blank | lined | grid | dotted
  const [paperStyle, setPaperStyle] = useState<PaperStyle>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('bd_note_paper_style') as PaperStyle) || 'blank';
    }
    return 'blank';
  });

  // Line numbers toggle: on / off
  const [showLineNumbers, setShowLineNumbers] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('bd_note_line_numbers') === 'true';
    }
    return false;
  });

  const changePaperStyle = (style: PaperStyle) => {
    setPaperStyle(style);
    if (typeof window !== 'undefined') localStorage.setItem('bd_note_paper_style', style);
    toast(`Paper style: ${style}`);
  };

  const toggleLineNumbers = () => {
    setShowLineNumbers((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('bd_note_line_numbers', String(next));
      toast(next ? 'Line numbers enabled' : 'Line numbers hidden');
      return next;
    });
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  /* --------------------------------------------------------------- saving */

  const timer = useRef<number>(0);
  const latest = useRef<{ title: string; body: string } | null>(null);
  const savesMap = useRef(new Map<string, typeof onSave>());
  savesMap.current.set(note.id, onSave);

  const queue = useCallback((t: string, b: string) => {
    markPending(note.id, { title: t, body: b });
    latest.current = { title: t, body: b };
    setDirty(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const v = latest.current;
      latest.current = null;
      const saveFn = savesMap.current.get(note.id);
      if (v && saveFn) { saveFn(v); setDirty(false); }
    }, SAVE_DEBOUNCE_MS);
  }, [note.id]);

  useEffect(() => {
    const id = note.id;
    return () => {
      clearTimeout(timer.current);
      const v = latest.current;
      latest.current = null;
      const saveFn = savesMap.current.get(id);
      if (v && saveFn) saveFn(v);
      else clearPending(id);
    };
  }, [note.id]);

  /* ----------------------------------------------------------- undo / redo */

  const historyRef = useRef<{ title: string; body: string; caret: number }[]>([
    { title: note.title, body: note.body, caret: 0 },
  ]);
  const historyIdxRef = useRef<number>(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateUndoRedoState = () => {
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
  };

  const recordHistory = useCallback((t: string, b: string, caret: number = 0) => {
    const current = historyRef.current[historyIdxRef.current];
    if (current && current.title === t && current.body === b) return;
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1);
    historyRef.current.push({ title: t, body: b, caret });
    if (historyRef.current.length > 120) historyRef.current.shift();
    historyIdxRef.current = historyRef.current.length - 1;
    updateUndoRedoState();
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const snap = historyRef.current[historyIdxRef.current];
    if (snap) {
      setTitle(snap.title);
      setBody(snap.body);
      queue(snap.title, snap.body);
    }
    updateUndoRedoState();
  }, [queue]);

  const handleRedo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const snap = historyRef.current[historyIdxRef.current];
    if (snap) {
      setTitle(snap.title);
      setBody(snap.body);
      queue(snap.title, snap.body);
    }
    updateUndoRedoState();
  }, [queue]);

  // Switching notes loads the new one and resets history
  useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
    setDirty(false);
    historyRef.current = [{ title: note.title, body: note.body, caret: 0 }];
    historyIdxRef.current = 0;
    updateUndoRedoState();
  }, [note.id]);

  const setTitleAndQueue = (t: string) => {
    setTitle(t);
    queue(t, body);
    recordHistory(t, body, 0);
  };

  const setBodyAndQueue = (b: string) => {
    setBody(b);
    queue(title, b);
    recordHistory(title, b, 0);
  };

  /* --------------------------------------------------------------- links */

  const linkTargets = useMemo(() => {
    const byTitle = new Map(notes.map((n) => [n.title.trim().toLowerCase(), n.id]));
    return (name: string) => byTitle.get(name.trim().toLowerCase()) ?? null;
  }, [notes]);

  const backlinks = useMemo(() => {
    const mine = title.trim().toLowerCase();
    if (!mine) return [];
    return notes.filter((n) => n.id !== note.id &&
      n.body.toLowerCase().includes(`[[${mine}]]`));
  }, [notes, title, note.id]);

  const openLink = async (name: string) => {
    const id = linkTargets(name);
    if (id) { onPickNote(id); return; }
    const make = await ask(`Create “${name}”?`, {
      message: 'That note does not exist yet. Creating it links the two.',
      initial: name, confirmLabel: 'Create note',
    });
    if (make) onNewNote(make);
  };

  /* ------------------------------------------------------------- insert helpers */

  const insertBlockAtEnd = (blockText: string) => {
    const nextBody = body.trimEnd() ? `${body.trimEnd()}\n\n${blockText}\n` : `${blockText}\n`;
    setBodyAndQueue(nextBody);
  };

  const insertLatexBlock = (latex: string) => {
    const block = `\n$$\n${latex}\n$$\n`;
    insertBlockAtEnd(block);
    setMathEditorOpen(false);
    toast('Equation inserted');
  };

  const insertSketch = (dataUrl: string) => {
    const sketchMarkdown = `\n![sketch](${dataUrl})\n`;
    insertBlockAtEnd(sketchMarkdown);
    setSketchpadOpen(false);
    toast('Sketch drawing inserted');
  };

  const insertImageFile = async (file: File) => {
    try {
      toast('Uploading image…');
      let url = '';
      try {
        const path = await uploadTo('bd-files', file);
        url = path;
      } catch {
        // Fallback: Read as data URL
        url = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }
      insertBlockAtEnd(`![image](${url})`);
      toast('Image inserted');
    } catch (err) {
      toast('Failed to upload image');
    }
  };

  const insertImageUrl = async () => {
    const url = await ask('Insert Image URL', { placeholder: 'https://images.unsplash.com/...' });
    if (url && url.trim()) {
      insertBlockAtEnd(`![image](${url.trim()})`);
      toast('Image inserted');
    }
  };

  const insertVideoEmbed = async () => {
    const url = await ask('Embed Video', {
      placeholder: 'YouTube, Vimeo, or MP4 URL (e.g. https://www.youtube.com/watch?v=...)',
      confirmLabel: 'Embed Video',
    });
    if (url && url.trim()) {
      insertBlockAtEnd(`![video](${url.trim()})`);
      toast('Video embedded');
    }
  };

  const insertTableBlock = (cols: number = 3, rows: number = 3) => {
    const headers = Array.from({ length: cols }, (_, i) => `Header ${i + 1}`).join(' | ');
    const sep = Array.from({ length: cols }, () => '---').join(' | ');
    const dataRows = Array.from({ length: rows - 1 }, (_, r) =>
      Array.from({ length: cols }, (_, c) => `Item ${r + 1}.${c + 1}`).join(' | ')
    ).map((r) => `| ${r} |`).join('\n');

    const tableMd = `\n| ${headers} |\n| ${sep} |\n${dataRows}\n`;
    insertBlockAtEnd(tableMd);
    toast(`Inserted ${cols}x${rows} Table`);
  };

  const insertColumnsBlock = (numCols: 2 | 3 = 2) => {
    const colsMd = numCols === 2
      ? `\n:::columns 2\n**Column 1**\nLeft column notes...\n:::\n**Column 2**\nRight column notes...\n:::\n`
      : `\n:::columns 3\n**Column 1**\nLeft notes...\n:::\n**Column 2**\nMiddle notes...\n:::\n**Column 3**\nRight notes...\n:::\n`;
    insertBlockAtEnd(colsMd);
    toast(`Inserted ${numCols}-Column Layout`);
  };

  const insertDivider = () => {
    insertBlockAtEnd('---');
    toast('Divider line inserted');
  };

  const insertWikiLinkPrompt = async () => {
    const noteName = await ask('Link to Note', { placeholder: 'Type note title (e.g. Chemistry Notes)' });
    if (noteName && noteName.trim()) {
      insertBlockAtEnd(`[[${noteName.trim()}]]`);
      toast(`Linked to [[${noteName.trim()}]]`);
    }
  };

  /* --------------------------------------------------- formatting & colors */

  const applyTextColor = (colorHex: string) => {
    const tag = `<span style="color: ${colorHex}">colored text</span>`;
    insertBlockAtEnd(tag);
    toast('Color styling applied');
  };

  const applyHighlight = (bgHex: string) => {
    const tag = `<mark style="background: ${bgHex}; padding: 1px 6px; border-radius: 4px;">highlighted text</mark>`;
    insertBlockAtEnd(tag);
    toast('Highlight applied');
  };

  const applyLineFormat = (k: LineKind) => {
    if (k === 'h1') insertBlockAtEnd('# Heading 1');
    else if (k === 'h2') insertBlockAtEnd('## Heading 2');
    else if (k === 'h3') insertBlockAtEnd('### Heading 3');
    else if (k === 'bullet') insertBlockAtEnd('- Bullet item');
    else if (k === 'number') insertBlockAtEnd('1. Numbered item');
    else if (k === 'todo') insertBlockAtEnd('- [ ] New task');
    else if (k === 'quote') insertBlockAtEnd('> Quoted note or insight');
    else if (k === 'callout') insertBlockAtEnd('|| Important highlight or alert');
    else if (k === 'code') insertBlockAtEnd('```\n// Code snippet\n```');
  };

  /* ------------------------------------------------- clipboard paste handler */

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) void insertImageFile(file);
        return;
      }
    }
  };

  /* ------------------------------------------------------------- context menu */

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      label: 'Note Editor',
      items: [
        {
          label: 'Undo / Redo',
          items: [
            { label: 'Undo', icon: 'undo', shortcut: 'Ctrl+Z', disabled: !canUndo, run: handleUndo },
            { label: 'Redo', icon: 'redo', shortcut: 'Ctrl+Y', disabled: !canRedo, run: handleRedo },
          ],
        },
        {
          label: 'Insert Media & Layout',
          items: [
            { label: 'Draw Paint & Sketch', icon: 'pen', run: () => setSketchpadOpen(true) },
            { label: 'Insert Image (Upload)', icon: 'photo', run: () => fileInputRef.current?.click() },
            { label: 'Insert Image (URL)', icon: 'photo', run: insertImageUrl },
            { label: 'Embed Video (YouTube / MP4)', icon: 'spark', run: insertVideoEmbed },
            { label: 'Insert 3-Column Table', icon: 'grid', run: () => insertTableBlock(3, 3) },
            { label: 'Insert 2-Column Layout', icon: 'grid', run: () => insertColumnsBlock(2) },
            { label: 'Divider Line', icon: 'minus', run: insertDivider },
            { label: 'LaTeX Math Equation', icon: 'spark', run: () => setMathEditorOpen(true) },
          ],
        },
        {
          label: 'Text Formatting',
          items: [
            { label: 'Heading 1', icon: 'heading', run: () => applyLineFormat('h1') },
            { label: 'Heading 2', icon: 'heading', run: () => applyLineFormat('h2') },
            { label: 'Heading 3', icon: 'heading', run: () => applyLineFormat('h3') },
            { label: 'Bulleted List', icon: 'list', run: () => applyLineFormat('bullet') },
            { label: 'Numbered List', icon: 'sort', run: () => applyLineFormat('number') },
            { label: 'Checklist Task', icon: 'check', run: () => applyLineFormat('todo') },
            { label: 'Quote', icon: 'quote', run: () => applyLineFormat('quote') },
            { label: 'Callout Box', icon: 'flag', run: () => applyLineFormat('callout') },
          ],
        },
        {
          label: 'Colors',
          items: [
            { label: 'Coral Red Text', icon: 'palette', run: () => applyTextColor('#FF6B6B') },
            { label: 'Amber Orange Text', icon: 'palette', run: () => applyTextColor('#FFC24B') },
            { label: 'Mint Green Text', icon: 'palette', run: () => applyTextColor('#34D9A0') },
            { label: 'Sky Blue Text', icon: 'palette', run: () => applyTextColor('#38BDF8') },
            { label: 'Violet Purple Text', icon: 'palette', run: () => applyTextColor('#B07CFF') },
            { label: 'Yellow Glow Highlight', icon: 'spark', run: () => applyHighlight('rgba(255, 194, 75, 0.35)') },
            { label: 'Mint Glow Highlight', icon: 'spark', run: () => applyHighlight('rgba(52, 217, 160, 0.35)') },
          ],
        },
      ],
    });
  };

  /* --------------------------------------------------------------- render */

  const lines = useMemo(() => parse(body), [body]);
  const words = wordCount(body);
  const t = taskCount(body);

  const hasMath = useMemo(
    () => lines.some((l) => l.kind === 'math' || l.text.includes('$') || l.text.includes('\\(')),
    [lines],
  );

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        width: '100%',
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      {/* Hidden File Input for Image Uploads */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void insertImageFile(file);
          e.target.value = '';
        }}
      />

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          kind="scratch"
          label={menu.label}
          items={menu.items}
          onClose={() => setMenu(null)}
          accent={prefs.accent}
          dark={prefs.theme === 'dark'}
        />
      )}

      {/* Unified Live WYSIWYG Toolbar */}
      <Toolbar
        phone={phone}
        dirty={dirty}
        canUndo={canUndo}
        canRedo={canRedo}
        paperStyle={paperStyle}
        showLineNumbers={showLineNumbers}
        onBack={onBack}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onToggleLineNumbers={toggleLineNumbers}
        onChangePaperStyle={changePaperStyle}
        onLineFormat={applyLineFormat}
        onTextColor={applyTextColor}
        onHighlight={applyHighlight}
        onOpenMath={() => setMathEditorOpen(true)}
        onOpenSketch={() => setSketchpadOpen(true)}
        onInsertImageUpload={() => fileInputRef.current?.click()}
        onInsertImageUrl={insertImageUrl}
        onInsertVideo={insertVideoEmbed}
        onInsertTable={insertTableBlock}
        onInsertColumns={insertColumnsBlock}
        onDivider={insertDivider}
        onLink={insertWikiLinkPrompt}
        onDelete={onDelete}
      />

      {/* Main Document Living Surface */}
      <div
        className="navsb"
        onContextMenu={handleContextMenu}
        onPaste={handlePaste}
        style={{
          flex: 1,
          minHeight: 0,
          height: '100%',
          width: '100%',
          maxWidth: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          borderRadius: phone ? 0 : 16,
          border: phone ? 'none' : '1px solid var(--line2)',
          boxShadow: phone ? 'none' : 'var(--sh)',
          padding: phone ? '12px 14px 60px' : '24px 28px 64px',
          ...getPaperBackgroundStyle(paperStyle, phone),
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ width: '100%', maxWidth: '100%', minHeight: '100%', position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, boxSizing: 'border-box' }}>
          {/* Note Metadata Header */}
          <div className="kicker" style={{ color: 'var(--accTx)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>Edited {whenLabel(note.updated_at)}</span>
            {backlinks.length > 0 && <span>· {backlinks.length} backlink{backlinks.length === 1 ? '' : 's'}</span>}
            {hasMath && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 4, background: 'color-mix(in srgb, var(--acc) 14%, transparent)', fontSize: 10, fontWeight: 800 }}>
                ∑ KaTeX Math
              </span>
            )}
          </div>

          {/* Note Title Input */}
          <textarea
            value={title}
            onChange={(e) => setTitleAndQueue(e.target.value.replace(/\n/g, ''))}
            placeholder="Untitled Note"
            aria-label="Note title"
            rows={1}
            className="note-editor-clean-input"
            style={{
              width: '100%',
              maxWidth: '100%',
              resize: 'none',
              overflow: 'hidden',
              fontFamily: 'inherit',
              fontSize: phone ? 22 : 28,
              fontWeight: 800,
              letterSpacing: '-.03em',
              lineHeight: 1.24,
              color: 'var(--tx)',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              background: 'transparent',
              padding: '4px 0 6px',
              margin: '0 0 4px',
              display: 'block',
              boxSizing: 'border-box',
            }}
          />

          {/* Tags */}
          <TagRow tags={tags} onSet={onSetTags} />

          {/* Live WYSIWYG Note Content Container */}
          <div style={{
            display: 'flex',
            alignItems: 'stretch',
            flex: '1 1 auto',
            minHeight: phone ? 280 : 360,
            width: '100%',
            maxWidth: '100%',
            marginBottom: 20,
            position: 'relative',
            boxSizing: 'border-box',
          }}>
            {/* Optional Left Line Numbers Gutter */}
            {showLineNumbers && (
              <div
                aria-hidden
                style={{
                  flex: 'none',
                  minWidth: phone ? 24 : 32,
                  padding: '8px 6px 8px 0',
                  textAlign: 'right',
                  fontFamily: MONO,
                  userSelect: 'none',
                  borderRight: '1px solid var(--line2)',
                  marginRight: 10,
                  boxSizing: 'border-box',
                }}
              >
                {Array.from({ length: Math.max(1, lines.length) }, (_, idx) => (
                  <div
                    key={idx + 1}
                    style={{
                      height: 26,
                      lineHeight: '26px',
                      fontSize: phone ? 11 : 12,
                      color: 'var(--tx3)',
                      opacity: 0.5,
                    }}
                  >
                    {idx + 1}
                  </div>
                ))}
              </div>
            )}

            {/* Combined Live WYSIWYG Interactive Document */}
            <div style={{ flex: 1, minWidth: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
              <WYSIWYGDocument
                body={body}
                lines={lines}
                onChangeBody={setBodyAndQueue}
                onLink={(n) => void openLink(n)}
                known={(n) => !!linkTargets(n)}
                onEditMath={(formula) => {
                  setInitialMathFormula(formula);
                  setMathEditorOpen(true);
                }}
                onEditSketch={() => setSketchpadOpen(true)}
              />
            </div>
          </div>

          {/* Footer Metadata */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            paddingTop: 14, borderTop: '1px solid var(--line2)', fontSize: 11, color: 'var(--tx3)',
            flex: 'none', width: '100%',
          }}>
            <span>{words} word{words === 1 ? '' : 's'}</span>
            <span>{lines.length} block{lines.length === 1 ? '' : 's'}</span>
            {t.total > 0 && <span>{t.done}/{t.total} tasks completed</span>}
            <span style={{ marginLeft: 'auto', fontWeight: 600, color: dirty ? 'var(--accTx)' : 'var(--tx3)' }}>
              {dirty ? 'Saving…' : 'Saved'}
            </span>
          </div>

          {/* Backlinks */}
          {backlinks.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line2)', flex: 'none' }}>
              <div style={KICKER}>Linked from</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                {backlinks.map((n) => (
                  <button key={n.id} onClick={() => onPickNote(n.id)} className="k-chip" style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8,
                    background: 'color-mix(in srgb, var(--tx) 5%, transparent)',
                    border: 'none', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)', cursor: 'pointer',
                  }}>
                    <Icon name="link" size={12} color="var(--tx3)" />{n.title || 'Untitled'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* LaTeX Formula Composer Modal */}
      {mathEditorOpen && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 14 }}>
          <MathEquationEditor
            initialFormula={initialMathFormula}
            onInsert={insertLatexBlock}
            onClose={() => { setMathEditorOpen(false); setInitialMathFormula(''); }}
          />
        </div>, document.body
      )}

      {/* Paint & Sketch Studio Modal */}
      {sketchpadOpen && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 14 }}>
          <NoteSketchpad onInsert={insertSketch} onClose={() => setSketchpadOpen(false)} />
        </div>, document.body
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ toolbar */

function Toolbar({
  phone, dirty, canUndo, canRedo, paperStyle, showLineNumbers,
  onBack, onUndo, onRedo, onToggleLineNumbers, onChangePaperStyle,
  onLineFormat, onTextColor, onHighlight, onOpenMath, onOpenSketch,
  onInsertImageUpload, onInsertImageUrl, onInsertVideo, onInsertTable, onInsertColumns,
  onDivider, onLink, onDelete,
}: {
  phone: boolean;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  paperStyle: PaperStyle;
  showLineNumbers: boolean;
  onBack?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleLineNumbers: () => void;
  onChangePaperStyle: (style: PaperStyle) => void;
  onLineFormat: (k: LineKind) => void;
  onTextColor: (colorHex: string) => void;
  onHighlight: (bgHex: string) => void;
  onOpenMath: () => void;
  onOpenSketch: () => void;
  onInsertImageUpload: () => void;
  onInsertImageUrl: () => void;
  onInsertVideo: () => void;
  onInsertTable: (cols: number, rows: number) => void;
  onInsertColumns: (numCols: 2 | 3) => void;
  onDivider: () => void;
  onLink: () => void;
  onDelete: () => void;
}) {
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [paperMenuOpen, setPaperMenuOpen] = useState(false);

  const btn = (label: string, icon: IconName, run: () => void, text?: string, active?: boolean, disabled?: boolean) => (
    <button
      key={label}
      onClick={() => { run(); playClick(); }}
      className="hov tap"
      title={label}
      aria-label={label}
      disabled={disabled}
      style={{
        height: 32,
        minWidth: 32,
        padding: text ? '0 8px' : '0 6px',
        flex: 'none',
        borderRadius: 9,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        opacity: disabled ? 0.35 : 1,
        fontSize: 11,
        fontWeight: 800,
        color: active ? 'var(--accTx, #FFFFFF)' : 'var(--tx2)',
        cursor: disabled ? 'default' : 'pointer',
        background: active ? 'color-mix(in srgb, var(--acc) 18%, transparent)' : 'transparent',
        border: active ? '1px solid var(--acc)' : 'none',
      }}
    >
      {text ? <span>{text}</span> : <Icon name={icon} size={13.5} color={active ? 'var(--accTx, #FFFFFF)' : 'var(--tx2)'} />}
    </button>
  );

  const rule = <span aria-hidden style={{ width: 1, height: 16, flex: 'none', background: 'var(--line)', margin: '0 2px' }} />;

  return (
    <div className="hbar" style={{
      display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto', flex: 'none',
      padding: '0 2px 8px', minHeight: 38, width: '100%', maxWidth: '100%', boxSizing: 'border-box',
    }}>
      {/* Modern Back Button for Phone Navigation */}
      {phone && onBack && (
        <button
          onClick={onBack}
          className="hov k-squish"
          aria-label="Back to note list"
          style={{
            height: 36,
            padding: '0 10px',
            flex: 'none',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginRight: 4,
            background: 'var(--card)',
            border: '1px solid var(--line2)',
            color: 'var(--tx)',
            fontSize: 11.5,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Icon name="back" size={13} color="var(--tx2)" />
          <span>Back</span>
        </button>
      )}

      {/* Undo & Redo */}
      {btn('Undo (Ctrl+Z)', 'undo', onUndo, undefined, false, !canUndo)}
      {btn('Redo (Ctrl+Y)', 'redo', onRedo, undefined, false, !canRedo)}
      {rule}

      {/* Headings */}
      {btn('Heading 1', 'heading', () => onLineFormat('h1'), 'H1')}
      {btn('Heading 2', 'heading', () => onLineFormat('h2'), 'H2')}
      {btn('Heading 3', 'heading', () => onLineFormat('h3'), 'H3')}
      {rule}

      {/* Colors & Highlight Menu */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setColorMenuOpen(!colorMenuOpen); setInsertMenuOpen(false); }}
          className="hov k-squish"
          title="Text Colors & Highlight"
          style={{
            height: 28,
            padding: '0 7px',
            borderRadius: 7,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 700,
            background: colorMenuOpen ? 'color-mix(in srgb, var(--acc) 18%, var(--card2))' : 'var(--card2)',
            border: `1px solid ${colorMenuOpen ? 'var(--acc)' : 'var(--line2)'}`,
            color: 'var(--tx)',
            cursor: 'pointer',
          }}
        >
          <Icon name="palette" size={12} color="#FF6B6B" />
          <span>Color</span>
        </button>

        {colorMenuOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setColorMenuOpen(false)} />
            <div style={{
              position: 'absolute', top: 34, left: 0, zIndex: 41,
              background: 'var(--card)', border: '1px solid var(--line2)', borderRadius: 12,
              boxShadow: 'var(--shl)', padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 170,
            }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Text Color</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
                {[
                  { name: 'Coral Red', hex: '#FF6B6B' },
                  { name: 'Amber', hex: '#FFC24B' },
                  { name: 'Mint', hex: '#34D9A0' },
                  { name: 'Sky', hex: '#38BDF8' },
                  { name: 'Violet', hex: '#B07CFF' },
                  { name: 'Rose', hex: '#F472B6' },
                  { name: 'Orange', hex: '#FF9A3C' },
                  { name: 'Emerald', hex: '#10B981' },
                  { name: 'Blue', hex: '#3B82F6' },
                  { name: 'White', hex: '#FFFFFF' },
                ].map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => { onTextColor(c.hex); setColorMenuOpen(false); }}
                    title={c.name}
                    style={{
                      width: 24, height: 24, borderRadius: 6, background: c.hex, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
                    }}
                  />
                ))}
              </div>

              <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 4 }}>Highlight Glow</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  { name: 'Yellow', hex: 'rgba(255, 194, 75, 0.35)' },
                  { name: 'Mint', hex: 'rgba(52, 217, 160, 0.35)' },
                  { name: 'Coral', hex: 'rgba(255, 107, 107, 0.35)' },
                  { name: 'Sky', hex: 'rgba(56, 189, 248, 0.35)' },
                  { name: 'Violet', hex: 'rgba(176, 124, 255, 0.35)' },
                ].map((h) => (
                  <button
                    key={h.name}
                    onClick={() => { onHighlight(h.hex); setColorMenuOpen(false); }}
                    title={`${h.name} glow`}
                    style={{
                      flex: 1, height: 22, borderRadius: 5, background: h.hex, border: '1px solid var(--line2)', cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {rule}

      {/* Lists */}
      {btn('Bulleted list', 'list', () => onLineFormat('bullet'))}
      {btn('Numbered list', 'sort', () => onLineFormat('number'), '1.')}
      {btn('Checklist task', 'check', () => onLineFormat('todo'))}
      {btn('Quote', 'quote', () => onLineFormat('quote'))}
      {btn('Callout box', 'flag', () => onLineFormat('callout'))}
      {rule}

      {/* Insert Menu (Images, Tables, Columns, Video, Sketch, Math, Divider) */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setInsertMenuOpen(!insertMenuOpen); setColorMenuOpen(false); }}
          className="hov k-squish"
          title="Insert Media, Tables & Layout"
          style={{
            height: 28,
            padding: '0 7px',
            borderRadius: 7,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 700,
            background: insertMenuOpen ? 'color-mix(in srgb, var(--acc) 18%, var(--card2))' : 'var(--card2)',
            border: `1px solid ${insertMenuOpen ? 'var(--acc)' : 'var(--line2)'}`,
            color: 'var(--tx)',
            cursor: 'pointer',
          }}
        >
          <Icon name="plus" size={11} color="var(--accTx, #38BDF8)" />
          <span>Insert</span>
        </button>

        {insertMenuOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setInsertMenuOpen(false)} />
            <div style={{
              position: 'absolute', top: 34, left: 0, zIndex: 41,
              background: 'var(--card)', border: '1px solid var(--line2)', borderRadius: 12,
              boxShadow: 'var(--shl)', padding: 6, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 190,
            }}>
              <button onClick={() => { onOpenSketch(); setInsertMenuOpen(false); }} className="hov" style={MENU_ITEM}>
                <Icon name="pen" size={13} color="var(--accTx, #38BDF8)" />
                <span>Draw Sketch / Paint</span>
              </button>
              <button onClick={() => { onInsertImageUpload(); setInsertMenuOpen(false); }} className="hov" style={MENU_ITEM}>
                <Icon name="photo" size={13} color="var(--pal-mint, #34D9A0)" />
                <span>Upload Image File</span>
              </button>
              <button onClick={() => { onInsertImageUrl(); setInsertMenuOpen(false); }} className="hov" style={MENU_ITEM}>
                <Icon name="photo" size={13} color="var(--tx2)" />
                <span>Insert Image by URL</span>
              </button>
              <button onClick={() => { onInsertVideo(); setInsertMenuOpen(false); }} className="hov" style={MENU_ITEM}>
                <Icon name="spark" size={13} color="var(--pal-coral, #FF6B6B)" />
                <span>Embed Video (YouTube / MP4)</span>
              </button>
              <button onClick={() => { onInsertTable(3, 3); setInsertMenuOpen(false); }} className="hov" style={MENU_ITEM}>
                <Icon name="grid" size={13} color="var(--pal-sky, #38BDF8)" />
                <span>Insert 3x3 Table</span>
              </button>
              <button onClick={() => { onInsertColumns(2); setInsertMenuOpen(false); }} className="hov" style={MENU_ITEM}>
                <Icon name="grid" size={13} color="var(--tx2)" />
                <span>2-Column Layout</span>
              </button>
              <button onClick={() => { onInsertColumns(3); setInsertMenuOpen(false); }} className="hov" style={MENU_ITEM}>
                <Icon name="grid" size={13} color="var(--tx2)" />
                <span>3-Column Layout</span>
              </button>
              <button onClick={() => { onOpenMath(); setInsertMenuOpen(false); }} className="hov" style={MENU_ITEM}>
                <Icon name="spark" size={13} color="var(--pal-amber, #FFC24B)" />
                <span>LaTeX Math Formula ($$)</span>
              </button>
              <button onClick={() => { onDivider(); setInsertMenuOpen(false); }} className="hov" style={MENU_ITEM}>
                <Icon name="minus" size={13} color="var(--tx3)" />
                <span>Full-Width Divider</span>
              </button>
              <button onClick={() => { onLink(); setInsertMenuOpen(false); }} className="hov" style={MENU_ITEM}>
                <Icon name="link" size={13} color="var(--accTx, #7C6CFF)" />
                <span>Link to Note ([[ ]])</span>
              </button>
            </div>
          </>
        )}
      </div>

      {rule}

      {/* Quick Media Direct Buttons */}
      {btn('Draw Paint & Sketch', 'pen', onOpenSketch)}
      {btn('Upload Image', 'photo', onInsertImageUpload)}
      {btn('Embed Video', 'spark', onInsertVideo)}
      {btn('Insert Table', 'grid', () => onInsertTable(3, 3))}
      {btn('LaTeX Math ($$)', 'spark', onOpenMath, '∑')}
      {btn('Divider Line', 'minus', onDivider)}

      <span style={{ marginLeft: 'auto' }} />

      {/* Paper Style Selector */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setPaperMenuOpen(!paperMenuOpen)}
          className="hov k-squish"
          title="Paper Look"
          style={{
            height: 26,
            padding: '0 6px',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 10,
            fontWeight: 700,
            background: 'var(--card2)',
            border: '1px solid var(--line2)',
            color: 'var(--tx2)',
            cursor: 'pointer',
            textTransform: 'capitalize',
          }}
        >
          <Icon name="grid" size={10} color="var(--tx3)" />
          <span>{paperStyle}</span>
        </button>

        {paperMenuOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setPaperMenuOpen(false)} />
            <div style={{
              position: 'absolute', top: 32, right: 0, zIndex: 41,
              background: 'var(--card)', border: '1px solid var(--line2)', borderRadius: 10,
              boxShadow: 'var(--shl)', padding: 4, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 110,
            }}>
              {(['blank', 'lined', 'grid', 'dotted'] as PaperStyle[]).map((ps) => (
                <button
                  key={ps}
                  onClick={() => { onChangePaperStyle(ps); setPaperMenuOpen(false); }}
                  className="hov"
                  style={{
                    padding: '5px 8px', borderRadius: 6, border: 'none',
                    background: paperStyle === ps ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent',
                    color: paperStyle === ps ? 'var(--accTx)' : 'var(--tx)',
                    fontSize: 11, fontWeight: paperStyle === ps ? 800 : 500, textAlign: 'left', cursor: 'pointer', textTransform: 'capitalize',
                  }}
                >
                  {ps}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Delete Note */}
      <button
        onClick={() => void confirmAsk('Move this note to Trash?', {
          message: 'This note will be safely moved to the Trash archive where you can restore it anytime.',
          confirmLabel: 'Move to Trash',
          danger: true,
        }).then((yes) => { if (yes) onDelete(); })}
        className="hov tap"
        title="Delete note"
        aria-label="Delete note"
        style={{ width: 28, height: 28, flex: 'none', borderRadius: 7, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', marginLeft: 2 }}
      >
        <Icon name="trash" size={13.5} color="var(--pal-coral, #FF6B6B)" />
      </button>
    </div>
  );
}

const MENU_ITEM: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 10px',
  borderRadius: 7,
  border: 'none',
  background: 'transparent',
  color: 'var(--tx)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
};

/* --------------------------------------------------- living wysiwyg document */

function WYSIWYGDocument({
  body, lines, onChangeBody, onLink, known, onEditMath, onEditSketch,
}: {
  body: string;
  lines: Line[];
  onChangeBody: (nextBody: string) => void;
  onLink: (name: string) => void;
  known: (name: string) => boolean;
  onEditMath?: (formula: string) => void;
  onEditSketch?: () => void;
}) {
  const hasMath = useMemo(
    () => lines.some((l) => l.kind === 'math' || l.text.includes('$') || l.text.includes('\\(')),
    [lines],
  );
  const katex = useKatex(hasMath);

  // Toggle task checkbox
  const handleToggleTask = (idx: number) => {
    onChangeBody(toggleTask(body, idx));
  };

  // Replace a line's text
  const updateLine = (lineIdx: number, newText: string) => {
    const rawLines = body.split('\n');
    rawLines[lineIdx] = newText;
    onChangeBody(rawLines.join('\n'));
  };

  // Delete a block line
  const deleteBlock = (lineIdx: number) => {
    const rawLines = body.split('\n');
    rawLines.splice(lineIdx, 1);
    onChangeBody(rawLines.join('\n'));
  };

  const renderInline = (text: string) => spans(text).map((s, i) => {
    if (s.s === 'link') {
      return (
        <button key={i} onClick={() => onLink(s.text)} className="k-underline" style={{
          display: 'inline', font: 'inherit', padding: '0 3px',
          color: known(s.text) ? 'var(--accTx, #7C6CFF)' : PAL.coral,
          fontWeight: 700, background: 'color-mix(in srgb, var(--acc) 10%, transparent)',
          borderRadius: 4, border: 'none', cursor: 'pointer',
        }}>
          [[{s.text}]]
        </button>
      );
    }
    if (s.s === 'bold') return <strong key={i} style={{ fontWeight: 800 }}>{s.text}</strong>;
    if (s.s === 'italic') return <em key={i}>{s.text}</em>;
    if (s.s === 'code') return (
      <code key={i} style={{ fontFamily: MONO, fontSize: '.92em', padding: '1px 5px', borderRadius: 5, background: 'var(--card2)', color: 'var(--tx)' }}>
        {s.text}
      </code>
    );
    if (s.s === 'math') {
      if (!katex) return <code key={i} style={{ fontFamily: MONO, color: 'var(--accTx)' }}>${s.text}$</code>;
      try {
        const mathHtml = katex.renderToString(s.text, { displayMode: false, throwOnError: false });
        return (
          <span
            key={i}
            onClick={() => onEditMath?.(s.text)}
            title="Click to edit formula"
            style={{ padding: '0 2px', cursor: 'pointer' }}
            dangerouslySetInnerHTML={{ __html: mathHtml }}
          />
        );
      } catch {
        return <code key={i} style={{ fontFamily: MONO, color: 'var(--accTx)' }}>${s.text}$</code>;
      }
    }
    if (s.s === 'video') {
      const v = parseVideoUrl(s.url);
      return (
        <div key={i} className="note-video-embed">
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
            {v?.type === 'youtube' || v?.type === 'vimeo' ? (
              <iframe
                src={v.embedUrl}
                title="Video embed"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ width: '100%', height: '100%', border: 0 }}
              />
            ) : (
              <video src={s.url} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            )}
          </div>
        </div>
      );
    }
    if (s.s === 'image') {
      return (
        <span key={i} style={{ display: 'block', margin: '14px 0', textAlign: 'center' }}>
          <img loading="lazy" decoding="async" src={s.url} alt={s.alt || 'Note visual'} style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card2)' }} />
        </span>
      );
    }
    if (s.text.includes('<span') || s.text.includes('<mark')) {
      return <span key={i} dangerouslySetInnerHTML={{ __html: s.text }} />;
    }
    return <span key={i}>{s.text}</span>;
  });

  return (
    <div style={{ minHeight: 360, paddingTop: 4, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      {lines.map((l, i) => {
        if (l.kind === 'blank') return <div key={i} style={{ height: 12 }} />;

        if (l.kind === 'divider') {
          return (
            <div key={i} style={{ position: 'relative', margin: '20px 0' }}>
              <hr className="note-hr-divider" />
            </div>
          );
        }

        if (l.kind === 'video') {
          const v = parseVideoUrl(l.text);
          return (
            <div key={i} className="note-video-embed">
              <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
                {v?.type === 'youtube' || v?.type === 'vimeo' ? (
                  <iframe
                    src={v.embedUrl}
                    title="Video player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ width: '100%', height: '100%', border: 0 }}
                  />
                ) : (
                  <video src={l.text} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                )}
              </div>
            </div>
          );
        }

        if (l.kind === 'sketch') {
          return (
            <div key={i} style={{ margin: '16px 0', textAlign: 'center', position: 'relative' }}>
              <img
                loading="lazy"
                decoding="async"
                src={l.text}
                alt="Note sketch"
                onClick={onEditSketch}
                title="Click to draw / edit sketch"
                style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 12, border: '1px solid var(--line2)', background: 'var(--card2)', cursor: 'pointer' }}
              />
            </div>
          );
        }

        if (l.kind === 'table') {
          const rawRows = l.text.split('\n').filter((r) => r.trim());
          const headerRow = rawRows[0] ? rawRows[0].split('|').map((c) => c.trim()).filter(Boolean) : [];
          const dataRows = rawRows.slice(2).map((r) => r.split('|').map((c) => c.trim()).filter(Boolean));

          return (
            <div key={i} style={{ margin: '14px 0', overflowX: 'auto', maxWidth: '100%' }}>
              <table className="note-table">
                {headerRow.length > 0 && (
                  <thead>
                    <tr>
                      {headerRow.map((h, hi) => (
                        <th key={hi}>{renderInline(h)}</th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {dataRows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>{renderInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (l.kind === 'columns') {
          const parts = l.text.split(':::').map((p) => p.trim()).filter(Boolean);
          const colCount = parts.length > 2 ? 3 : 2;
          return (
            <div key={i} className={`note-columns note-cols-${colCount}`}>
              {parts.map((part, pi) => (
                <div key={pi} className="note-col">
                  {part.split('\n').map((line, li) => (
                    <div key={li} style={{ margin: '3px 0', fontSize: 14 }}>{renderInline(line)}</div>
                  ))}
                </div>
              ))}
            </div>
          );
        }

        if (l.kind === 'math') {
          if (!katex) return <pre key={i} style={{ padding: 10, background: 'var(--card2)', color: 'var(--tx3)', borderRadius: 8 }}>{`$$\n${l.text}\n$$`}</pre>;
          try {
            const blockHtml = katex.renderToString(l.text, { displayMode: true, throwOnError: false });
            return (
              <div
                key={i}
                onClick={() => onEditMath?.(l.text)}
                title="Click to edit LaTeX math formula"
                className="k-math-block hov"
                style={{
                  margin: '16px 0',
                  padding: '16px 12px',
                  borderRadius: 12,
                  background: 'color-mix(in srgb, var(--acc) 6%, transparent)',
                  border: '1px dashed color-mix(in srgb, var(--acc) 25%, transparent)',
                  overflowX: 'auto',
                  textAlign: 'center',
                  fontSize: 17,
                  color: 'var(--tx)',
                  cursor: 'pointer',
                  transition: 'all .16s ease',
                }}
                dangerouslySetInnerHTML={{ __html: blockHtml }}
              />
            );
          } catch {
            return <pre key={i} style={{ padding: 10, background: 'var(--card2)', color: 'var(--pal-coral)', borderRadius: 8 }}>{`$$\n${l.text}\n$$`}</pre>;
          }
        }

        if (l.kind === 'code') {
          return (
            <pre key={i} className="navsb" style={{
              margin: '10px 0', padding: '12px 14px', borderRadius: 10, overflowX: 'auto',
              background: 'var(--card2)', border: 'none',
              fontFamily: MONO, fontSize: 12.5, lineHeight: 1.65, color: 'var(--tx)',
            }}>{l.text}</pre>
          );
        }

        if (l.kind === 'todo') {
          return (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '3px 0' }}>
              <button onClick={() => handleToggleTask(l.i)} role="checkbox" aria-checked={l.done}
                aria-label={l.text || 'To-do'} className="k-squish"
                style={{
                  width: 17, height: 17, flex: 'none', marginTop: 4, borderRadius: 5,
                  border: `1.25px solid ${l.done ? 'var(--acc)' : 'var(--line2)'}`,
                  background: l.done ? 'var(--acc)' : 'transparent', display: 'grid', placeItems: 'center',
                  cursor: 'pointer', outline: 'none',
                }}>
                {l.done && <Icon name="check" size={11} color="#FFFFFF" />}
              </button>
              <span style={{
                fontSize: 15, lineHeight: 1.74,
                ...(l.done ? { textDecoration: 'line-through', color: 'var(--tx3)' } : { color: 'var(--tx)' }),
              }}>{renderInline(l.text)}</span>
            </div>
          );
        }

        if (l.kind === 'bullet' || l.kind === 'number') {
          return (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '2px 0' }}>
              {l.kind === 'bullet'
                ? <span aria-hidden style={{ width: 5.5, height: 5.5, flex: 'none', borderRadius: 3, background: 'var(--tx3)', marginTop: 9 }} />
                : <span aria-hidden style={{ flex: 'none', fontSize: 13.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{l.n}.</span>}
              <span style={{ fontSize: 15, lineHeight: 1.74, color: 'var(--tx)' }}>{renderInline(l.text)}</span>
            </div>
          );
        }

        if (l.kind === 'quote') {
          return (
            <blockquote key={i} style={{
              margin: '8px 0', paddingLeft: 14, borderLeft: '3px solid var(--acc)',
              fontSize: 14.5, lineHeight: 1.75, fontStyle: 'italic', color: 'var(--tx2)',
            }}>{renderInline(l.text)}</blockquote>
          );
        }

        if (l.kind === 'callout') {
          return (
            <div key={i} style={{
              margin: '10px 0', padding: '12px 14px', borderRadius: 10, fontSize: 14, lineHeight: 1.68,
              background: 'color-mix(in srgb, var(--acc) 9%, transparent)',
              border: '1px solid color-mix(in srgb, var(--acc) 22%, transparent)', color: 'var(--tx)',
            }}>{renderInline(l.text)}</div>
          );
        }

        const h = HEADING[l.kind];
        if (h) return <div key={i} style={{ ...h, color: 'var(--tx)' }}>{renderInline(l.text)}</div>;

        return (
          <p
            key={i}
            style={{
              fontSize: 15,
              lineHeight: 1.76,
              color: 'var(--tx)',
              margin: '4px 0',
              wordBreak: 'break-word',
            }}
          >
            {renderInline(l.text)}
          </p>
        );
      })}

      {/* Direct ContentEditable input zone for seamless continuous writing */}
      <div
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => {
          const text = e.currentTarget.innerText;
          if (text.trim()) {
            onChangeBody(body ? `${body}\n${text}` : text);
            e.currentTarget.innerText = '';
          }
        }}
        data-placeholder="Click here to continue writing…"
        style={{
          minHeight: 120,
          marginTop: 8,
          outline: 'none',
          fontSize: 15,
          lineHeight: 1.76,
          color: 'var(--tx)',
          cursor: 'text',
        }}
      />
    </div>
  );
}

const HEADING: Partial<Record<LineKind, React.CSSProperties>> = {
  h1: { fontSize: 23, fontWeight: 800, letterSpacing: '-.026em', lineHeight: 1.3, margin: '24px 0 8px' },
  h2: { fontSize: 18.5, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.35, margin: '18px 0 6px' },
  h3: { fontSize: 15.5, fontWeight: 700, letterSpacing: '-.014em', lineHeight: 1.4, margin: '14px 0 4px' },
};

const KICKER: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)',
};

/* --------------------------------------------------------------------- tags */

function TagRow({ tags, onSet }: { tags: string[]; onSet: (t: string[]) => void }) {
  const add = () =>
    void ask('Add a tag', { placeholder: 'e.g. math, cs101, design', confirmLabel: 'Add' }).then((t) => {
      const tag = t?.trim().replace(/^#/, '').slice(0, 40);
      if (!tag) return;
      if (tags.includes(tag)) return toast('Already tagged');
      onSet([...tags, tag]);
    });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '4px 0 14px' }}>
      {tags.map((t) => (
        <span key={t} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6,
          background: 'color-mix(in srgb, var(--tx) 6%, transparent)',
          fontSize: 11, fontWeight: 700, color: 'var(--tx2)', border: 'none',
        }}>
          #{t}
          <button onClick={() => onSet(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`} className="hov"
            style={{ width: 16, height: 16, borderRadius: 999, display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <Icon name="close" size={9} color="var(--tx3)" />
          </button>
        </span>
      ))}
      <button onClick={add} className="hov k-squish" style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6,
        background: 'color-mix(in srgb, var(--tx) 3%, transparent)',
        fontSize: 11, fontWeight: 600, color: 'var(--tx3)', border: 'none', cursor: 'pointer',
      }}>
        <Icon name="plus" size={10} color="var(--tx3)" />Tag
      </button>
    </div>
  );
}
