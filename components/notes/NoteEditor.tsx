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
import {
  parse, spans, applyKind, wrap, newline, toggleTask, wordCount, taskCount,
  type Line, type LineKind,
} from '@/lib/md';
import { markPending, clearPending, whenLabel, type Note } from '@/lib/notes';

/**
 * KaTeX and the two maths modals are loaded on demand.
 */
const MathEquationEditor = dynamic(
  () => import('./MathEquationEditor').then((m) => m.MathEquationEditor),
  { ssr: false },
);
const MathSketchpad = dynamic(
  () => import('./MathSketchpad').then((m) => m.MathSketchpad),
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

const SAVE_DEBOUNCE_MS = 600;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export type PaperStyle = 'blank' | 'lined' | 'grid' | 'dotted';

function getPaperBackgroundStyle(style: PaperStyle): React.CSSProperties {
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
  const [read, setRead] = useState(false);
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
      return localStorage.getItem('bd_note_line_numbers') !== 'false';
    }
    return true;
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

  const area = useRef<HTMLTextAreaElement>(null);

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
      requestAnimationFrame(() => {
        if (area.current) {
          area.current.focus();
          area.current.setSelectionRange(snap.caret, snap.caret);
          autosize(area.current);
        }
      });
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
      requestAnimationFrame(() => {
        if (area.current) {
          area.current.focus();
          area.current.setSelectionRange(snap.caret, snap.caret);
          autosize(area.current);
        }
      });
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
    recordHistory(t, body, area.current?.selectionStart || 0);
  };

  const setBodyAndQueue = (b: string) => {
    setBody(b);
    queue(title, b);
    recordHistory(title, b, area.current?.selectionStart || 0);
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

  /* ------------------------------------------------------------- toolbar */

  const edit = (fn: (b: string, from: number, to: number) => { body: string; from: number; to: number }) => {
    const el = area.current;
    if (!el) return;
    const r = fn(body, el.selectionStart, el.selectionEnd);
    setBodyAndQueue(r.body);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.from, r.to);
      autosize(el);
    });
  };

  const kind = (k: LineKind) => edit((b, f, t) => applyKind(b, f, t, k));
  const mark = (m: string) => edit((b, f, t) => wrap(b, f, t, m));

  const insertLatexBlock = (latex: string) => {
    edit((b, f, t) => {
      const block = `\n$$\n${latex}\n$$\n`;
      return { body: `${b.slice(0, f)}${block}${b.slice(t)}`, from: f + block.length, to: f + block.length };
    });
    setMathEditorOpen(false);
    toast('Equation inserted');
  };

  const insertSketch = (dataUrl: string) => {
    edit((b, f, t) => {
      const sketchMarkdown = `\n![math-sketch](${dataUrl})\n`;
      return { body: `${b.slice(0, f)}${sketchMarkdown}${b.slice(t)}`, from: f + sketchMarkdown.length, to: f + sketchMarkdown.length };
    });
    setSketchpadOpen(false);
    toast('Math sketch inserted');
  };

  const applyTextColor = (colorVar: string) => {
    edit((b, f, t) => {
      const inner = b.slice(f, t) || 'colored text';
      const replacement = `<span style="color: ${colorVar}">${inner}</span>`;
      return { body: `${b.slice(0, f)}${replacement}${b.slice(t)}`, from: f + replacement.length, to: f + replacement.length };
    });
  };

  const applyHighlight = (bgVar: string) => {
    edit((b, f, t) => {
      const inner = b.slice(f, t) || 'highlighted text';
      const replacement = `<mark style="background: ${bgVar}; padding: 1px 4px; border-radius: 4px;">${inner}</mark>`;
      return { body: `${b.slice(0, f)}${replacement}${b.slice(t)}`, from: f + replacement.length, to: f + replacement.length };
    });
  };

  const [wikiLinkOpen, setWikiLinkOpen] = useState(false);
  const [wikiLinkQuery, setWikiLinkQuery] = useState('');
  const [wikiLinkIndex, setWikiLinkIndex] = useState(0);

  const checkWikiLink = useCallback((text: string, caret: number) => {
    const before = text.slice(0, caret);
    const match = before.match(/\[\[([^\]\n]*)$/);
    if (match) {
      setWikiLinkOpen(true);
      setWikiLinkQuery(match[1]);
    } else {
      setWikiLinkOpen(false);
    }
  }, []);

  const filteredWikiNotes = useMemo(() => {
    if (!wikiLinkOpen) return [];
    const q = wikiLinkQuery.toLowerCase();
    return notes.filter(n => (n.title || 'Untitled').toLowerCase().includes(q)).slice(0, 10);
  }, [notes, wikiLinkQuery, wikiLinkOpen]);

  const insertWikiLink = (noteTitle?: string) => {
    const targetTitle = noteTitle ?? (filteredWikiNotes[wikiLinkIndex]?.title || 'Untitled');
    edit((b, f, t) => {
      const before = b.slice(0, f);
      const match = before.match(/\[\[([^\]\n]*)$/);
      if (!match) return { body: b, from: f, to: t };
      const start = f - match[0].length;
      const insert = `[[${targetTitle}]]`;
      return { body: b.slice(0, start) + insert + b.slice(t), from: start + insert.length, to: start + insert.length };
    });
    setWikiLinkOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;

    if (wikiLinkOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setWikiLinkIndex(i => (i + 1) % (filteredWikiNotes.length || 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setWikiLinkIndex(i => (i - 1 + filteredWikiNotes.length) % (filteredWikiNotes.length || 1)); return; }
      if (e.key === 'Enter') { e.preventDefault(); insertWikiLink(); return; }
      if (e.key === 'Escape') { e.preventDefault(); setWikiLinkOpen(false); return; }
    }

    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      const key = e.key.toLowerCase();
      if (key === 'z') { e.preventDefault(); handleUndo(); return; }
      if (key === 'y') { e.preventDefault(); handleRedo(); return; }
      if (key === 'b') { e.preventDefault(); mark('**'); return; }
      if (key === 'i') { e.preventDefault(); mark('*'); return; }
      if (key === 'm') { e.preventDefault(); mark('$'); return; }
      if (key === 'e') { e.preventDefault(); setRead((v) => !v); return; }
    }

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      handleRedo();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && el.selectionStart === el.selectionEnd) {
      e.preventDefault();
      const r = newline(body, el.selectionStart);
      setBodyAndQueue(r.body);
      requestAnimationFrame(() => { el.setSelectionRange(r.caret, r.caret); autosize(el); });
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const at = el.selectionStart;
      setBodyAndQueue(body.slice(0, at) + '  ' + body.slice(el.selectionEnd));
      requestAnimationFrame(() => el.setSelectionRange(at + 2, at + 2));
    }
  };

  /* -------------------------------------------------------- context menu */

  const getEditorContextMenu = (e: React.MouseEvent): CtxGroup[] => {
    const el = area.current;
    const selText = el ? el.value.slice(el.selectionStart, el.selectionEnd) : '';
    const hasSelection = selText.length > 0;

    return [
      {
        label: 'Undo / Redo',
        items: [
          { label: 'Undo', icon: 'undo', shortcut: 'Ctrl+Z', disabled: !canUndo, run: handleUndo },
          { label: 'Redo', icon: 'redo', shortcut: 'Ctrl+Y', disabled: !canRedo, run: handleRedo },
        ],
      },
      {
        label: 'Format & Headings',
        items: [
          { label: 'Heading 1', icon: 'heading', shortcut: '#', run: () => kind('h1') },
          { label: 'Heading 2', icon: 'heading', shortcut: '##', run: () => kind('h2') },
          { label: 'Heading 3', icon: 'heading', shortcut: '###', run: () => kind('h3') },
          { label: 'Bold', icon: 'text', shortcut: 'Ctrl+B', run: () => mark('**') },
          { label: 'Italic', icon: 'text', shortcut: 'Ctrl+I', run: () => mark('*') },
          { label: 'Inline Code', icon: 'code', shortcut: '`', run: () => mark('`') },
          {
            label: 'Code Block', icon: 'code', shortcut: '```',
            run: () => edit((b, f, t) => {
              const inner = b.slice(f, t) || 'code';
              const res = `\n\`\`\`\n${inner}\n\`\`\`\n`;
              return { body: b.slice(0, f) + res + b.slice(t), from: f + res.length, to: f + res.length };
            }),
          },
          { label: 'Quote', icon: 'quote', shortcut: '>', run: () => kind('quote') },
          { label: 'Callout Box', icon: 'flag', shortcut: '||', run: () => kind('callout') },
        ],
      },
      {
        label: 'Math & Formulas',
        items: [
          {
            label: 'Edit / Insert LaTeX Math', icon: 'spark', shortcut: '$$',
            run: () => {
              setInitialMathFormula(selText.replace(/^\$\$|\$\$$/g, '').trim() || '');
              setMathEditorOpen(true);
            },
          },
          { label: 'Inline Math ($..$)', icon: 'spark', shortcut: '$', run: () => mark('$') },
          { label: 'Draw Math Sketchpad', icon: 'pen', run: () => setSketchpadOpen(true) },
        ],
      },
      {
        label: 'Lists & Layout',
        items: [
          { label: 'Bulleted List', icon: 'list', shortcut: '-', run: () => kind('bullet') },
          { label: 'Numbered List', icon: 'sort', shortcut: '1.', run: () => kind('number') },
          { label: 'Checklist Task', icon: 'check', shortcut: '- [ ]', run: () => kind('todo') },
          {
            label: 'Insert 2-Column Table', icon: 'grid',
            run: () => edit((b, f) => {
              const table = `\n| Column 1 | Column 2 |\n| :--- | :--- |\n| Item 1 | Item 2 |\n`;
              return { body: b.slice(0, f) + table + b.slice(f), from: f + table.length, to: f + table.length };
            }),
          },
          {
            label: 'Insert 3-Column Table', icon: 'grid',
            run: () => edit((b, f) => {
              const table = `\n| Col 1 | Col 2 | Col 3 |\n| :--- | :--- | :--- |\n| Val 1 | Val 2 | Val 3 |\n`;
              return { body: b.slice(0, f) + table + b.slice(f), from: f + table.length, to: f + table.length };
            }),
          },
          { label: 'Divider Line', icon: 'minus', shortcut: '---', run: () => edit((b, f) => ({ body: `${b.slice(0, f)}\n---\n${b.slice(f)}`, from: f + 5, to: f + 5 })) },
        ],
      },
      {
        label: 'Text Colors & Highlight',
        items: [
          {
            label: 'Text Color',
            icon: 'palette',
            items: [
              { label: 'Coral / Red', icon: 'palette', run: () => applyTextColor('var(--pal-coral, #FF6B6B)') },
              { label: 'Amber / Orange', icon: 'palette', run: () => applyTextColor('var(--pal-amber, #FFC24B)') },
              { label: 'Mint / Green', icon: 'palette', run: () => applyTextColor('var(--pal-mint, #34D9A0)') },
              { label: 'Sky / Blue', icon: 'palette', run: () => applyTextColor('var(--pal-sky, #38BDF8)') },
              { label: 'Violet / Purple', icon: 'palette', run: () => applyTextColor('var(--pal-violet, #B07CFF)') },
            ],
          },
          {
            label: 'Highlight Color',
            icon: 'pen',
            items: [
              { label: 'Yellow Glow', icon: 'spark', run: () => applyHighlight('rgba(255, 194, 75, 0.28)') },
              { label: 'Mint Glow', icon: 'spark', run: () => applyHighlight('rgba(52, 217, 160, 0.28)') },
              { label: 'Coral Glow', icon: 'spark', run: () => applyHighlight('rgba(255, 107, 107, 0.28)') },
              { label: 'Sky Glow', icon: 'spark', run: () => applyHighlight('rgba(56, 189, 248, 0.28)') },
              { label: 'Violet Glow', icon: 'spark', run: () => applyHighlight('rgba(176, 124, 255, 0.28)') },
            ],
          },
        ],
      },
      {
        label: 'Links & Media',
        items: [
          {
            label: 'Link to Note', icon: 'link', shortcut: '[[ ]]',
            run: () => edit((b, f, t) => {
              const inner = b.slice(f, t) || '';
              return { body: `${b.slice(0, f)}[[${inner}]]${b.slice(t)}`, from: f + 2 + inner.length, to: f + 2 + inner.length };
            }),
          },
          {
            label: 'Insert Web Link', icon: 'link',
            run: () => void ask('Insert Link URL', { placeholder: 'https://example.com' }).then((url) => {
              if (!url) return;
              edit((b, f, t) => {
                const inner = b.slice(f, t) || 'link';
                const md = `[${inner}](${url.trim()})`;
                return { body: `${b.slice(0, f)}${md}${b.slice(t)}`, from: f + md.length, to: f + md.length };
              });
            }),
          },
          {
            label: 'Insert Image URL', icon: 'photo',
            run: () => void ask('Insert Image URL', { placeholder: 'https://...' }).then((url) => {
              if (!url) return;
              edit((b, f) => {
                const md = `\n![image](${url.trim()})\n`;
                return { body: `${b.slice(0, f)}${md}${b.slice(f)}`, from: f + md.length, to: f + md.length };
              });
            }),
          },
        ],
      },
      {
        label: 'Transform & Clipboard',
        items: [
          ...(hasSelection ? [
            { label: 'UPPERCASE', icon: 'text' as IconName, run: () => edit((b, f, t) => ({ body: b.slice(0, f) + b.slice(f, t).toUpperCase() + b.slice(t), from: f, to: t })) },
            { label: 'lowercase', icon: 'text' as IconName, run: () => edit((b, f, t) => ({ body: b.slice(0, f) + b.slice(f, t).toLowerCase() + b.slice(t), from: f, to: t })) },
            { label: 'Title Case', icon: 'text' as IconName, run: () => edit((b, f, t) => ({ body: b.slice(0, f) + b.slice(f, t).replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.substring(1).toLowerCase()) + b.slice(t), from: f, to: t })) },
            { label: 'Copy Selection', icon: 'copy' as IconName, run: () => { void navigator.clipboard?.writeText(selText); toast('Copied'); } },
          ] : [
            { label: 'Select All', icon: 'text' as IconName, shortcut: 'Ctrl+A', run: () => { el?.focus(); el?.select(); } },
            { label: 'Copy Full Note', icon: 'copy' as IconName, run: () => { void navigator.clipboard?.writeText(`${title}\n\n${body}`); toast('Note copied'); } },
          ]),
        ],
      },
      {
        label: 'View & Paper Style',
        items: [
          { label: `Line Numbers (${showLineNumbers ? 'ON' : 'OFF'})`, icon: 'list', checked: showLineNumbers, run: toggleLineNumbers },
          {
            label: 'Paper Background Look',
            icon: 'grid',
            items: [
              { label: 'Blank Card', icon: 'grid', checked: paperStyle === 'blank', run: () => changePaperStyle('blank') },
              { label: 'Lined Notebook', icon: 'text', checked: paperStyle === 'lined', run: () => changePaperStyle('lined') },
              { label: 'Graph Grid', icon: 'grid', checked: paperStyle === 'grid', run: () => changePaperStyle('grid') },
              { label: 'Dotted Grid', icon: 'dots', checked: paperStyle === 'dotted', run: () => changePaperStyle('dotted') },
            ],
          },
          { label: read ? 'Switch to Write Mode' : 'Switch to Read Mode', icon: read ? 'pen' : 'eye', run: () => setRead(!read) },
        ],
      },
    ];
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      label: 'Note Editor',
      items: getEditorContextMenu(e),
    });
  };

  /* --------------------------------------------------------------- render */

  const lines = useMemo(() => parse(body), [body]);
  const lineCount = useMemo(() => {
    if (!body) return 1;
    return body.split('\n').length;
  }, [body]);
  const words = wordCount(body);
  const t = taskCount(body);

  const hasMath = useMemo(
    () => lines.some((l) => l.kind === 'math' || l.text.includes('$') || l.text.includes('\\(')),
    [lines],
  );

  const linePx = phone ? 25.52 : 27.28;

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
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

      <Toolbar
        phone={phone}
        read={read}
        dirty={dirty}
        canUndo={canUndo}
        canRedo={canRedo}
        paperStyle={paperStyle}
        showLineNumbers={showLineNumbers}
        onBack={onBack}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onToggleRead={() => setRead((v) => !v)}
        onToggleLineNumbers={toggleLineNumbers}
        onChangePaperStyle={changePaperStyle}
        onKind={kind}
        onMark={mark}
        onOpenMath={() => {
          const el = area.current;
          const sel = el ? el.value.slice(el.selectionStart, el.selectionEnd) : '';
          setInitialMathFormula(sel.replace(/^\$\$|\$\$$/g, '').trim() || '');
          setMathEditorOpen(true);
        }}
        onOpenSketch={() => setSketchpadOpen(true)}
        onDivider={() => edit((b, f) => ({ body: `${b.slice(0, f)}\n---\n${b.slice(f)}`, from: f + 5, to: f + 5 }))}
        onLink={() => edit((b, f, t) => {
          const inner = b.slice(f, t) || '';
          return { body: `${b.slice(0, f)}[[${inner}]]${b.slice(t)}`, from: f + 2 + inner.length, to: f + 2 + inner.length };
        })}
        onDelete={onDelete}
      />

      <div
        className="navsb"
        onContextMenu={handleContextMenu}
        style={{
          flex: 1,
          minHeight: 0,
          height: '100%',
          width: '100%',
          overflowY: 'auto',
          borderRadius: 16,
          boxShadow: 'var(--sh)',
          padding: phone ? '16px 14px 48px' : '24px 28px 64px',
          ...getPaperBackgroundStyle(paperStyle),
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ width: '100%', minHeight: '100%', position: 'relative', display: 'flex', flexDirection: 'column', flex: 1 }}>
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

          {/* Note Title - Seamless, zero-border input */}
          <textarea
            ref={(el) => { if (el) autosize(el); }}
            value={title}
            onChange={(e) => { setTitleAndQueue(e.target.value.replace(/\n/g, '')); autosize(e.target); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); area.current?.focus(); }
            }}
            placeholder="Untitled Note"
            aria-label="Note title"
            rows={1}
            className="note-editor-clean-input"
            style={{
              width: '100%',
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
            }}
          />

          {/* Tags */}
          {tags.length > 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--tx3)', margin: '0 0 10px' }}>
              {tags.join(' · ')}
            </div>
          )}
          <TagRow tags={tags} onSet={onSetTags} />

          {/* Note Body or Formatted Read View with Optional Line Numbers */}
          <div style={{
            display: 'flex',
            alignItems: 'stretch',
            flex: '1 1 auto',
            minHeight: phone ? 280 : 360,
            width: '100%',
            marginBottom: 20,
            position: 'relative',
          }}>
            {/* Left Line Numbers Gutter (Notepad++ style) */}
            {showLineNumbers && !read && (
              <div
                aria-hidden
                style={{
                  flex: 'none',
                  minWidth: phone ? 26 : 36,
                  maxWidth: 48,
                  padding: '8px 8px 8px 0',
                  textAlign: 'right',
                  fontFamily: MONO,
                  userSelect: 'none',
                  borderRight: '1px solid var(--line2)',
                  marginRight: 12,
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                }}
              >
                {Array.from({ length: lineCount }, (_, idx) => (
                  <div
                    key={idx + 1}
                    style={{
                      height: linePx,
                      lineHeight: `${linePx}px`,
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: phone ? 11.5 : 12.5,
                      color: 'var(--tx3)',
                      opacity: 0.55,
                    }}
                  >
                    {idx + 1}
                  </div>
                ))}
              </div>
            )}

            <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
              {read ? (
                <ReadView
                  lines={lines}
                  onToggle={(i) => setBodyAndQueue(toggleTask(body, i))}
                  onLink={(n) => void openLink(n)}
                  known={(n) => !!linkTargets(n)}
                  onEditMath={(formulaText) => {
                    setInitialMathFormula(formulaText);
                    setMathEditorOpen(true);
                  }}
                />
              ) : (
                <>
                  <textarea
                    ref={(el) => { area.current = el; if (el) autosize(el); }}
                    value={body}
                    onChange={(e) => {
                      setBodyAndQueue(e.target.value);
                      autosize(e.target);
                      checkWikiLink(e.target.value, e.target.selectionStart);
                    }}
                    onClick={(e) => checkWikiLink(e.currentTarget.value, e.currentTarget.selectionStart)}
                    onKeyUp={(e) => checkWikiLink(e.currentTarget.value, e.currentTarget.selectionStart)}
                    onKeyDown={onKeyDown}
                    placeholder="Start writing… Type $$ for math blocks, $..$ for inline equations, [[ ]] to link notes."
                    aria-label="Note body"
                    rows={lineCount}
                    className="note-editor-clean-input"
                    style={{
                      width: '100%',
                      minHeight: phone ? 280 : 360,
                      resize: 'none',
                      overflow: 'hidden',
                      fontSize: phone ? 14.5 : 15.5,
                      lineHeight: `${linePx}px`,
                      letterSpacing: '-.01em',
                      color: 'var(--tx)',
                      fontFamily: 'inherit',
                      border: 'none',
                      outline: 'none',
                      boxShadow: 'none',
                      background: 'transparent',
                      padding: '8px 0',
                      margin: 0,
                      display: 'block',
                      boxSizing: 'border-box',
                    }}
                  />

                  {wikiLinkOpen && (
                    <div className="rise" style={{
                      position: 'absolute', top: 60, left: 0, right: 0, margin: '0 auto', maxWidth: 400, zIndex: 10,
                      background: 'var(--card)', borderRadius: 12, boxShadow: 'var(--shl)', padding: 6,
                      border: '1px solid var(--line)',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Link to Note</div>
                      {filteredWikiNotes.length === 0 ? (
                        <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--tx3)' }}>No matching notes. Press Enter to create "[[{wikiLinkQuery}]]"</div>
                      ) : (
                        filteredWikiNotes.map((n, i) => (
                          <button key={n.id} onClick={() => insertWikiLink(n.title)} className="hov lensrow" style={{
                            display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                            background: wikiLinkIndex === i ? 'var(--card2)' : 'transparent',
                            fontSize: 13.5, fontWeight: wikiLinkIndex === i ? 700 : 500, color: 'var(--tx)', border: 'none', cursor: 'pointer',
                          }}>
                            <Icon name="book" size={12} color="var(--tx3)" /> <span style={{ marginLeft: 6 }}>{n.title || 'Untitled'}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Footer Metadata */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            paddingTop: 14, borderTop: '1px solid var(--line2)', fontSize: 11, color: 'var(--tx3)',
            flex: 'none', width: '100%',
          }}>
            <span>{words} word{words === 1 ? '' : 's'}</span>
            <span>{lineCount} line{lineCount === 1 ? '' : 's'}</span>
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

      {/* Math LaTeX Formula Composer Modal */}
      {mathEditorOpen && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 14 }}>
          <MathEquationEditor
            initialFormula={initialMathFormula}
            onInsert={insertLatexBlock}
            onClose={() => { setMathEditorOpen(false); setInitialMathFormula(''); }}
          />
        </div>, document.body
      )}

      {/* Interactive Math Sketchpad Modal */}
      {sketchpadOpen && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 14 }}>
          <MathSketchpad onInsert={insertSketch} onClose={() => setSketchpadOpen(false)} />
        </div>, document.body
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ toolbar */

function Toolbar({
  phone, read, dirty, canUndo, canRedo, paperStyle, showLineNumbers,
  onBack, onUndo, onRedo, onToggleRead, onToggleLineNumbers, onChangePaperStyle,
  onKind, onMark, onOpenMath, onOpenSketch, onDivider, onLink, onDelete,
}: {
  phone: boolean;
  read: boolean;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  paperStyle: PaperStyle;
  showLineNumbers: boolean;
  onBack?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleRead: () => void;
  onToggleLineNumbers: () => void;
  onChangePaperStyle: (style: PaperStyle) => void;
  onKind: (k: LineKind) => void;
  onMark: (m: string) => void;
  onOpenMath: () => void;
  onOpenSketch: () => void;
  onDivider: () => void;
  onLink: () => void;
  onDelete: () => void;
}) {
  const [paperMenuOpen, setPaperMenuOpen] = useState(false);

  const btn = (label: string, icon: IconName, run: () => void, text?: string, disabled: boolean = read) => (
    <button
      key={label}
      onClick={run}
      className="hov tap"
      title={label}
      aria-label={label}
      disabled={disabled}
      style={{
        width: 28,
        height: 28,
        flex: 'none',
        borderRadius: 7,
        display: 'grid',
        placeItems: 'center',
        opacity: disabled ? 0.35 : 1,
        fontSize: 11,
        fontWeight: 800,
        color: 'var(--tx2)',
        cursor: disabled ? 'default' : 'pointer',
        background: 'transparent',
        border: 'none',
      }}
    >
      {text ?? <Icon name={icon} size={13.5} color="var(--tx2)" />}
    </button>
  );

  const rule = <span aria-hidden style={{ width: 1, height: 16, flex: 'none', background: 'var(--line)', margin: '0 2px' }} />;

  return (
    <div className="hbar" style={{
      display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto', flex: 'none',
      padding: '0 2px 8px', minHeight: 38,
    }}>
      {phone && onBack && (
        <button onClick={onBack} className="hov tap" aria-label="Back to the note list"
          style={{ width: 28, height: 28, flex: 'none', borderRadius: 7, display: 'grid', placeItems: 'center', marginRight: 4, background: 'transparent', border: 'none', cursor: 'pointer' }}>
          <Icon name="back" size={14} color="var(--tx2)" />
        </button>
      )}

      {/* Redo & Undo Buttons */}
      {btn('Undo (Ctrl+Z)', 'undo', onUndo, undefined, !canUndo || read)}
      {btn('Redo (Ctrl+Y)', 'redo', onRedo, undefined, !canRedo || read)}
      {rule}

      {/* Headings */}
      {btn('Heading 1', 'heading', () => onKind('h1'), 'H1')}
      {btn('Heading 2', 'heading', () => onKind('h2'), 'H2')}
      {btn('Heading 3', 'heading', () => onKind('h3'), 'H3')}
      {rule}

      {/* Text Styles */}
      {btn('Bold', 'text', () => onMark('**'), 'B')}
      {btn('Italic', 'text', () => onMark('*'), 'I')}
      {btn('Code', 'code', () => onMark('`'))}
      {rule}

      {/* Math Features */}
      {btn('Insert LaTeX Math ($$)', 'spark', onOpenMath, '∑')}
      {btn('Inline Math ($)', 'spark', () => onMark('$'), '$')}
      {btn('Draw Math Sketch', 'pen', onOpenSketch)}
      {rule}

      {/* Lists & Layout */}
      {btn('Bulleted list', 'list', () => onKind('bullet'))}
      {btn('Numbered list', 'sort', () => onKind('number'), '1.')}
      {btn('Checklist', 'check', () => onKind('todo'))}
      {btn('Quote', 'quote', () => onKind('quote'))}
      {btn('Callout', 'flag', () => onKind('callout'))}
      {rule}

      {/* Structure */}
      {btn('Divider', 'minus', onDivider)}
      {btn('Link a note', 'link', onLink)}
      {rule}

      {/* Paper Style Selector */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setPaperMenuOpen(!paperMenuOpen)}
          className="hov k-squish"
          title="Change Paper Background Style"
          style={{
            height: 26,
            padding: '0 7px',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10.5,
            fontWeight: 700,
            background: 'var(--card2)',
            border: '1px solid var(--line2)',
            color: 'var(--tx2)',
            cursor: 'pointer',
            textTransform: 'capitalize',
          }}
        >
          <Icon name="grid" size={11} color="var(--tx3)" />
          <span>{paperStyle}</span>
        </button>

        {paperMenuOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setPaperMenuOpen(false)} />
            <div style={{
              position: 'absolute', top: 32, left: 0, zIndex: 41,
              background: 'var(--card)', border: '1px solid var(--line2)', borderRadius: 10,
              boxShadow: 'var(--shl)', padding: 4, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120,
            }}>
              {(['blank', 'lined', 'grid', 'dotted'] as PaperStyle[]).map((ps) => (
                <button
                  key={ps}
                  onClick={() => { onChangePaperStyle(ps); setPaperMenuOpen(false); }}
                  className="hov"
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: paperStyle === ps ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent',
                    color: paperStyle === ps ? 'var(--accTx)' : 'var(--tx)',
                    fontSize: 11.5,
                    fontWeight: paperStyle === ps ? 800 : 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {ps} paper
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Line Numbers Toggle Button */}
      <button
        onClick={onToggleLineNumbers}
        className="hov k-squish"
        title={showLineNumbers ? 'Hide Line Numbers' : 'Show Line Numbers (Notepad++)'}
        style={{
          height: 26,
          padding: '0 6px',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          fontSize: 10,
          fontWeight: 800,
          background: showLineNumbers ? 'color-mix(in srgb, var(--acc) 14%, var(--card2))' : 'var(--card2)',
          border: `1px solid ${showLineNumbers ? 'color-mix(in srgb, var(--acc) 40%, transparent)' : 'var(--line2)'}`,
          color: showLineNumbers ? 'var(--accTx)' : 'var(--tx3)',
          cursor: 'pointer',
        }}
      >
        <span>#</span>
        <span>{showLineNumbers ? 'ON' : 'OFF'}</span>
      </button>

      <span style={{ marginLeft: 'auto' }} />

      <span style={{ fontSize: 11, fontWeight: 600, color: dirty ? 'var(--accTx)' : 'var(--tx3)', marginRight: 10 }}>
        {dirty ? 'Saving…' : 'Saved'}
      </span>

      {/* Segmented Mode Switch (Write / Read) */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', height: 28, padding: 2,
        borderRadius: 8, background: 'var(--card2)', gap: 2, marginRight: 4,
      }}>
        <button
          onClick={() => { if (read) onToggleRead(); }}
          className="k-squish"
          style={{
            height: 24, padding: '0 8px', borderRadius: 6,
            background: !read ? 'var(--card)' : 'transparent',
            color: !read ? 'var(--tx)' : 'var(--tx3)',
            fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
            boxShadow: !read ? 'var(--sh)' : 'none',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <Icon name="pen" size={11} color={!read ? 'var(--tx)' : 'var(--tx3)'} />Write
        </button>
        <button
          onClick={() => { if (!read) onToggleRead(); }}
          className="k-squish"
          style={{
            height: 24, padding: '0 8px', borderRadius: 6,
            background: read ? 'var(--card)' : 'transparent',
            color: read ? 'var(--accTx)' : 'var(--tx3)',
            fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
            boxShadow: read ? 'var(--sh)' : 'none',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <Icon name="eye" size={11} color={read ? 'var(--accTx)' : 'var(--tx3)'} />Read
        </button>
      </div>

      <button
        onClick={() => void confirmAsk('Move this note to Trash?', {
          message: 'This note will be safely moved to the Trash archive where you can restore it anytime.',
          confirmLabel: 'Move to Trash',
          danger: true,
        }).then((yes) => { if (yes) onDelete(); })}
        className="hov tap"
        title="Delete note"
        aria-label="Delete note"
        style={{ width: 28, height: 28, flex: 'none', borderRadius: 7, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <Icon name="trash" size={13.5} color="var(--pal-coral, var(--tx3))" />
      </button>
    </div>
  );
}

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

/* --------------------------------------------------------------- read mode */

function ReadView({
  lines, onToggle, onLink, known, onEditMath,
}: {
  lines: Line[];
  onToggle: (sourceLine: number) => void;
  onLink: (name: string) => void;
  known: (name: string) => boolean;
  onEditMath?: (formula: string) => void;
}) {
  const hasMath = useMemo(
    () => lines.some((l) => l.kind === 'math' || l.text.includes('$') || l.text.includes('\\(')),
    [lines],
  );
  const katex = useKatex(hasMath);

  const inline = (text: string) => spans(text).map((s, i) => {
    if (s.s === 'link') {
      return (
        <button key={i} onClick={() => onLink(s.text)} className="k-underline" style={{
          display: 'inline', font: 'inherit', padding: '0 2px',
          color: known(s.text) ? 'var(--accTx)' : PAL.coral,
          fontWeight: 600,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}>{s.text}</button>
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
    if (s.s === 'image') {
      return (
        <span key={i} style={{ display: 'block', margin: '14px 0', textAlign: 'center' }}>
          <img loading="lazy" decoding="async" src={s.url} alt={s.alt || 'Math sketch'} style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card2)' }} />
        </span>
      );
    }
    if (s.text.includes('<span') || s.text.includes('<mark')) {
      return <span key={i} dangerouslySetInnerHTML={{ __html: s.text }} />;
    }
    return <span key={i}>{s.text}</span>;
  });

  return (
    <div style={{ minHeight: 360, paddingTop: 4, width: '100%' }}>
      {lines.map((l, i) => {
        if (l.kind === 'blank') return <div key={i} style={{ height: 12 }} />;
        if (l.kind === 'divider') return <hr key={i} style={{ border: 0, borderTop: '1px solid var(--line)', margin: '18px 0' }} />;
        if (l.kind === 'math') {
          if (!katex) return <pre key={i} style={{ padding: 10, background: 'var(--card2)', color: 'var(--tx3)', borderRadius: 8 }}>{`$$
${l.text}
$$`}</pre>;
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
        if (l.kind === 'sketch') {
          return (
            <div key={i} style={{ margin: '16px 0', textAlign: 'center' }}>
              <img loading="lazy" decoding="async" src={l.text} alt="Math Sketch" style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card2)' }} />
            </div>
          );
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
              <button onClick={() => onToggle(l.i)} role="checkbox" aria-checked={l.done}
                aria-label={l.text || 'To-do'} className="k-squish"
                style={{
                  width: 16, height: 16, flex: 'none', marginTop: 4, borderRadius: 4,
                  border: `1.25px solid ${l.done ? 'var(--acc)' : 'var(--line2)'}`,
                  background: l.done ? 'var(--acc)' : 'transparent', display: 'grid', placeItems: 'center',
                  cursor: 'pointer', outline: 'none',
                }}>
                {l.done && <Icon name="check" size={10.5} color="var(--ink)" />}
              </button>
              <span style={{
                fontSize: 15, lineHeight: 1.74,
                ...(l.done ? { textDecoration: 'line-through', color: 'var(--tx3)' } : { color: 'var(--tx)' }),
              }}>{inline(l.text)}</span>
            </div>
          );
        }
        if (l.kind === 'bullet' || l.kind === 'number') {
          return (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '2px 0' }}>
              {l.kind === 'bullet'
                ? <span aria-hidden style={{ width: 5.5, height: 5.5, flex: 'none', borderRadius: 3, background: 'var(--tx3)', marginTop: 9 }} />
                : <span aria-hidden style={{ flex: 'none', fontSize: 13.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{l.n}.</span>}
              <span style={{ fontSize: 15, lineHeight: 1.74, color: 'var(--tx)' }}>{inline(l.text)}</span>
            </div>
          );
        }
        if (l.kind === 'quote') {
          return (
            <blockquote key={i} style={{
              margin: '8px 0', paddingLeft: 14, borderLeft: '3px solid var(--acc)',
              fontSize: 14.5, lineHeight: 1.75, fontStyle: 'italic', color: 'var(--tx2)',
            }}>{inline(l.text)}</blockquote>
          );
        }
        if (l.kind === 'callout') {
          return (
            <div key={i} style={{
              margin: '10px 0', padding: '12px 14px', borderRadius: 10, fontSize: 14, lineHeight: 1.68,
              background: 'color-mix(in srgb, var(--acc) 9%, transparent)',
              border: '1px solid color-mix(in srgb, var(--acc) 22%, transparent)', color: 'var(--tx)',
            }}>{inline(l.text)}</div>
          );
        }
        const h = HEADING[l.kind];
        if (h) return <div key={i} style={{ ...h, color: 'var(--tx)' }}>{inline(l.text)}</div>;
        return <p key={i} style={{ fontSize: 15, lineHeight: 1.76, color: 'var(--tx)', margin: '4px 0' }}>{inline(l.text)}</p>;
      })}
    </div>
  );
}

const HEADING: Partial<Record<LineKind, React.CSSProperties>> = {
  h1: { fontSize: 23, fontWeight: 800, letterSpacing: '-.026em', lineHeight: 1.3, margin: '26px 0 8px' },
  h2: { fontSize: 18.5, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.35, margin: '20px 0 6px' },
  h3: { fontSize: 15.5, fontWeight: 700, letterSpacing: '-.014em', lineHeight: 1.4, margin: '16px 0 4px' },
};

const KICKER: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)',
};

/** Grow a textarea to fit, so the note never scrolls inside its own field. */
function autosize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
