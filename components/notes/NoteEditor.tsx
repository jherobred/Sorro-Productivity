'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import { Icon, type IconName } from '../Icon';
import { MathEquationEditor } from './MathEquationEditor';
import { MathSketchpad } from './MathSketchpad';
import { PAL } from '@/lib/pal';
import { ask } from '@/lib/ask';
import { toast } from '@/lib/toast';
import {
  parse, spans, applyKind, wrap, newline, toggleTask, wordCount, taskCount,
  type Line, type LineKind,
} from '@/lib/md';
import { markPending, clearPending, whenLabel, type Note } from '@/lib/notes';

const SAVE_DEBOUNCE_MS = 600;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

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
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [read, setRead] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [mathEditorOpen, setMathEditorOpen] = useState(false);
  const [sketchpadOpen, setSketchpadOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  // Switching notes loads the new one.
  useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
    setDirty(false);
  }, [note.id]);

  /* --------------------------------------------------------------- saving */

  const timer = useRef<number>(0);
  const latest = useRef<{ title: string; body: string } | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const queue = useCallback((t: string, b: string) => {
    markPending(note.id, { title: t, body: b });
    latest.current = { title: t, body: b };
    setDirty(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const v = latest.current;
      latest.current = null;
      if (v) { saveRef.current(v); setDirty(false); }
    }, SAVE_DEBOUNCE_MS);
  }, [note.id]);

  useEffect(() => {
    const id = note.id;
    return () => {
      clearTimeout(timer.current);
      const v = latest.current;
      latest.current = null;
      if (v) saveRef.current(v);
      else clearPending(id);
    };
  }, [note.id]);

  const setTitleAndQueue = (t: string) => { setTitle(t); queue(t, body); };
  const setBodyAndQueue = (b: string) => { setBody(b); queue(title, b); };

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

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;

    if (e.key === 'Enter' && !e.shiftKey && el.selectionStart === el.selectionEnd) {
      e.preventDefault();
      const r = newline(body, el.selectionStart);
      setBodyAndQueue(r.body);
      requestAnimationFrame(() => { el.setSelectionRange(r.caret, r.caret); autosize(el); });
      return;
    }

    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') { e.preventDefault(); mark('**'); }
      if (key === 'i') { e.preventDefault(); mark('*'); }
      if (key === 'm') { e.preventDefault(); mark('$'); }
      if (key === 'e') { e.preventDefault(); setRead((v) => !v); }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const at = el.selectionStart;
      setBodyAndQueue(body.slice(0, at) + '  ' + body.slice(el.selectionEnd));
      requestAnimationFrame(() => el.setSelectionRange(at + 2, at + 2));
    }
  };

  /* --------------------------------------------------------------- render */

  const lines = useMemo(() => parse(body), [body]);
  const words = wordCount(body);
  const t = taskCount(body);

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Toolbar
        phone={phone} read={read}
        onBack={onBack}
        onToggleRead={() => setRead((v) => !v)}
        onKind={kind}
        onMark={mark}
        onOpenMath={() => setMathEditorOpen(true)}
        onOpenSketch={() => setSketchpadOpen(true)}
        onDivider={() => edit((b, f) => ({ body: `${b.slice(0, f)}\n---\n${b.slice(f)}`, from: f + 5, to: f + 5 }))}
        onLink={() => edit((b, f, t) => {
          const inner = b.slice(f, t) || 'note title';
          return { body: `${b.slice(0, f)}[[${inner}]]${b.slice(t)}`, from: f + 2, to: f + 2 + inner.length };
        })}
        onDelete={onDelete} />

      <div className="navsb" style={{
        flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--card)',
        borderRadius: 14, boxShadow: 'var(--sh)', padding: phone ? '14px 14px 40px' : '20px 26px 60px',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <textarea
            ref={(el) => { if (el) autosize(el); }}
            value={title}
            onChange={(e) => { setTitleAndQueue(e.target.value.replace(/\n/g, '')); autosize(e.target); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); area.current?.focus(); }
            }}
            placeholder="Title"
            aria-label="Note title"
            rows={1}
            style={{
              width: '100%', resize: 'none', overflow: 'hidden', fontFamily: 'inherit',
              fontSize: phone ? 22 : 27, fontWeight: 800, letterSpacing: '-.028em', lineHeight: 1.25,
              color: 'var(--tx)',
            }} />

          <TagRow tags={tags} onSet={onSetTags} />

          {read ? (
            <ReadView lines={lines}
              onToggle={(i) => setBodyAndQueue(toggleTask(body, i))}
              onLink={(n) => void openLink(n)}
              known={(n) => !!linkTargets(n)} />
          ) : (
            <textarea
              ref={(el) => { area.current = el; if (el) autosize(el); }}
              value={body}
              onChange={(e) => { setBodyAndQueue(e.target.value); autosize(e.target); }}
              onKeyDown={onKeyDown}
              placeholder="Start writing. # for heading, $$ for math block, $..$ for inline equation, [[ ]] to link notes."
              aria-label="Note body"
              rows={6}
              style={{
                width: '100%', minHeight: 320, resize: 'none', overflow: 'hidden',
                fontSize: 13.5, lineHeight: 1.75, color: 'var(--tx)', fontFamily: 'inherit',
              }} />
          )}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 18,
            paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: 10.5, color: 'var(--tx3)',
          }}>
            <span>{words} word{words === 1 ? '' : 's'}</span>
            {t.total > 0 && <span>{t.done}/{t.total} done</span>}
            <span>Edited {whenLabel(note.updated_at)}</span>
            <span style={{ marginLeft: 'auto', color: dirty ? 'var(--accTx)' : 'var(--tx3)' }}>
              {dirty ? 'Saving…' : 'Saved'}
            </span>
          </div>

          {backlinks.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={KICKER}>Linked from</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                {backlinks.map((n) => (
                  <button key={n.id} onClick={() => onPickNote(n.id)} className="k-chip" style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
                    minHeight: 34, border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)',
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
      {mathEditorOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 14 }}>
          <MathEquationEditor onInsert={insertLatexBlock} onClose={() => setMathEditorOpen(false)} />
        </div>
      )}

      {/* Interactive Math Sketchpad Modal */}
      {sketchpadOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 14 }}>
          <MathSketchpad onInsert={insertSketch} onClose={() => setSketchpadOpen(false)} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ toolbar */

function Toolbar({
  phone, read, onBack, onToggleRead, onKind, onMark, onOpenMath, onOpenSketch, onDivider, onLink, onDelete,
}: {
  phone: boolean; read: boolean;
  onBack?: () => void;
  onToggleRead: () => void;
  onKind: (k: LineKind) => void;
  onMark: (m: string) => void;
  onOpenMath: () => void;
  onOpenSketch: () => void;
  onDivider: () => void;
  onLink: () => void;
  onDelete: () => void;
}) {
  const btn = (label: string, icon: IconName, run: () => void, text?: string) => (
    <button key={label} onClick={run} className="hov tap" title={label} aria-label={label}
      disabled={read}
      style={{
        width: 30, height: 30, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center',
        opacity: read ? 0.35 : 1, fontSize: 11.5, fontWeight: 800, color: 'var(--tx2)',
      }}>
      {text ?? <Icon name={icon} size={14} color="var(--tx2)" />}
    </button>
  );

  const rule = <span aria-hidden style={{ width: 1, height: 18, flex: 'none', background: 'var(--line2)', margin: '0 2px' }} />;

  return (
    <div className="hbar" style={{
      display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto', flex: 'none',
      padding: '0 2px 8px', minHeight: 40,
    }}>
      {phone && onBack && (
        <button onClick={onBack} className="hov tap" aria-label="Back to the note list"
          style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center' }}>
          <Icon name="back" size={15} color="var(--tx2)" />
        </button>
      )}

      {btn('Heading 1', 'heading', () => onKind('h1'), 'H1')}
      {btn('Heading 2', 'heading', () => onKind('h2'), 'H2')}
      {btn('Heading 3', 'heading', () => onKind('h3'), 'H3')}
      {rule}
      {btn('Bold', 'text', () => onMark('**'), 'B')}
      {btn('Italic', 'text', () => onMark('*'), 'I')}
      {btn('Code', 'code', () => onMark('`'))}
      {rule}
      {/* Math Features */}
      {btn('Insert LaTeX Math ($$)', 'spark', onOpenMath, '∑')}
      {btn('Inline Math ($)', 'spark', () => onMark('$'), '$')}
      {btn('Draw Math Sketch', 'pen', onOpenSketch)}
      {rule}
      {btn('Bulleted list', 'list', () => onKind('bullet'))}
      {btn('Numbered list', 'sort', () => onKind('number'), '1.')}
      {btn('Checklist', 'check', () => onKind('todo'))}
      {btn('Quote', 'quote', () => onKind('quote'))}
      {btn('Callout', 'flag', () => onKind('callout'))}
      {rule}
      {btn('Divider', 'minus', onDivider)}
      {btn('Link a note', 'link', onLink)}

      <span style={{ marginLeft: 'auto' }} />

      <button onClick={onToggleRead} className="hov tap" aria-pressed={read}
        title={read ? 'Back to writing (⌘E)' : 'Read it formatted (⌘E)'}
        aria-label={read ? 'Back to writing' : 'Read it formatted'}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', flex: 'none',
          borderRadius: 8, border: `1px solid ${read ? 'var(--acc)' : 'var(--line2)'}`,
          fontSize: 11.5, fontWeight: 700, color: read ? 'var(--accTx)' : 'var(--tx2)',
        }}>
        <Icon name={read ? 'pen' : 'eye'} size={13} color={read ? 'var(--accTx)' : 'var(--tx2)'} />
        {read ? 'Write' : 'Read'}
      </button>

      <button onClick={onDelete} className="hov tap" title="Delete note" aria-label="Delete note"
        style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center' }}>
        <Icon name="trash" size={14} color="var(--tx3)" />
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------- tags */

function TagRow({ tags, onSet }: { tags: string[]; onSet: (t: string[]) => void }) {
  const add = () =>
    void ask('Add a tag', { placeholder: 'e.g. cs191', confirmLabel: 'Add' }).then((t) => {
      const tag = t?.trim().replace(/^#/, '').slice(0, 40);
      if (!tag) return;
      if (tags.includes(tag)) return toast('Already tagged');
      onSet([...tags, tag]);
    });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '6px 0 14px' }}>
      {tags.map((t) => (
        <span key={t} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '3px 6px 3px 10px', borderRadius: 999,
          border: '1px solid var(--line2)', fontSize: 11, fontWeight: 700, color: 'var(--tx2)',
        }}>
          #{t}
          <button onClick={() => onSet(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`} className="hov"
            style={{ width: 18, height: 18, borderRadius: 999, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={10} color="var(--tx3)" />
          </button>
        </span>
      ))}
      <button onClick={add} className="hov" style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999,
        border: '1px dashed var(--line2)', fontSize: 11, fontWeight: 700, color: 'var(--tx3)',
      }}>
        <Icon name="plus" size={11} color="var(--tx3)" />Tag
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- read mode */

function ReadView({
  lines, onToggle, onLink, known,
}: {
  lines: Line[];
  onToggle: (sourceLine: number) => void;
  onLink: (name: string) => void;
  known: (name: string) => boolean;
}) {
  const inline = (text: string) => spans(text).map((s, i) => {
    if (s.s === 'link') {
      return (
        <button key={i} onClick={() => onLink(s.text)} className="k-underline" style={{
          display: 'inline', font: 'inherit', padding: '0 1px', borderRadius: 3,
          color: known(s.text) ? 'var(--accTx)' : PAL.coral,
          background: 'color-mix(in srgb, var(--acc) 10%, transparent)',
        }}>{s.text}</button>
      );
    }
    if (s.s === 'bold') return <strong key={i} style={{ fontWeight: 800 }}>{s.text}</strong>;
    if (s.s === 'italic') return <em key={i}>{s.text}</em>;
    if (s.s === 'code') return (
      <code key={i} style={{ fontFamily: MONO, fontSize: '.92em', padding: '1px 5px', borderRadius: 5, background: 'var(--card2)' }}>
        {s.text}
      </code>
    );
    if (s.s === 'math') {
      try {
        const mathHtml = katex.renderToString(s.text, { displayMode: false, throwOnError: false });
        return <span key={i} dangerouslySetInnerHTML={{ __html: mathHtml }} style={{ padding: '0 2px' }} />;
      } catch {
        return <code key={i} style={{ fontFamily: MONO, color: 'var(--accTx)' }}>${s.text}$</code>;
      }
    }
    if (s.s === 'image') {
      return (
        <span key={i} style={{ display: 'block', margin: '8px 0', textAlign: 'center' }}>
          <img src={s.url} alt={s.alt || 'Math sketch'} style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid var(--line2)', background: '#141620' }} />
        </span>
      );
    }
    return <span key={i}>{s.text}</span>;
  });

  return (
    <div style={{ minHeight: 320 }}>
      {lines.map((l, i) => {
        if (l.kind === 'blank') return <div key={i} style={{ height: 10 }} />;
        if (l.kind === 'divider') return <hr key={i} style={{ border: 0, borderTop: '1px solid var(--line2)', margin: '14px 0' }} />;
        if (l.kind === 'math') {
          try {
            const blockHtml = katex.renderToString(l.text, { displayMode: true, throwOnError: false });
            return (
              <div
                key={i}
                className="k-math-block"
                style={{
                  margin: '12px 0', padding: '14px 18px', borderRadius: 12,
                  background: 'var(--card2)', border: '1px solid var(--line2)',
                  overflowX: 'auto', textAlign: 'center', fontSize: 16, color: 'var(--tx)',
                }}
                dangerouslySetInnerHTML={{ __html: blockHtml }}
              />
            );
          } catch {
            return <pre key={i} style={{ padding: 10, background: 'var(--card2)', color: 'var(--pal-coral)' }}>$$\n{l.text}\n$$</pre>;
          }
        }
        if (l.kind === 'sketch') {
          return (
            <div key={i} style={{ margin: '12px 0', textAlign: 'center' }}>
              <img src={l.text} alt="Math Sketch" style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid var(--line2)', background: '#141620' }} />
            </div>
          );
        }
        if (l.kind === 'code') {
          return (
            <pre key={i} className="navsb" style={{
              margin: '8px 0', padding: '10px 12px', borderRadius: 10, overflowX: 'auto',
              background: 'var(--card2)', border: '1px solid var(--line)',
              fontFamily: MONO, fontSize: 12, lineHeight: 1.6, color: 'var(--tx)',
            }}>{l.text}</pre>
          );
        }
        if (l.kind === 'todo') {
          return (
            <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '2px 0' }}>
              <button onClick={() => onToggle(l.i)} role="checkbox" aria-checked={l.done}
                aria-label={l.text || 'To-do'} className="k-squish"
                style={{
                  width: 17, height: 17, flex: 'none', marginTop: 4, borderRadius: 5,
                  border: `1.5px solid ${l.done ? 'var(--acc)' : 'var(--line2)'}`,
                  background: l.done ? 'var(--acc)' : 'transparent', display: 'grid', placeItems: 'center',
                }}>
                {l.done && <Icon name="check" size={11} color="var(--ink)" />}
              </button>
              <span style={{
                fontSize: 13.5, lineHeight: 1.7,
                ...(l.done ? { textDecoration: 'line-through', color: 'var(--tx3)' } : { color: 'var(--tx)' }),
              }}>{inline(l.text)}</span>
            </div>
          );
        }
        if (l.kind === 'bullet' || l.kind === 'number') {
          return (
            <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '1px 0' }}>
              {l.kind === 'bullet'
                ? <span aria-hidden style={{ width: 6, height: 6, flex: 'none', borderRadius: 3, background: 'var(--tx3)', marginTop: 9 }} />
                : <span aria-hidden style={{ flex: 'none', fontSize: 13, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{l.n}.</span>}
              <span style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--tx)' }}>{inline(l.text)}</span>
            </div>
          );
        }
        if (l.kind === 'quote') {
          return (
            <blockquote key={i} style={{
              margin: '6px 0', paddingLeft: 12, borderLeft: '3px solid var(--line2)',
              fontSize: 13.5, lineHeight: 1.7, fontStyle: 'italic', color: 'var(--tx2)',
            }}>{inline(l.text)}</blockquote>
          );
        }
        if (l.kind === 'callout') {
          return (
            <div key={i} style={{
              margin: '8px 0', padding: '10px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.65,
              background: 'color-mix(in srgb, var(--acc) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--acc) 26%, transparent)', color: 'var(--tx)',
            }}>{inline(l.text)}</div>
          );
        }
        const h = HEADING[l.kind];
        if (h) return <div key={i} style={{ ...h, color: 'var(--tx)' }}>{inline(l.text)}</div>;
        return <p key={i} style={{ fontSize: 13.5, lineHeight: 1.75, color: 'var(--tx)', margin: '2px 0' }}>{inline(l.text)}</p>;
      })}
    </div>
  );
}

const HEADING: Partial<Record<LineKind, React.CSSProperties>> = {
  h1: { fontSize: 22, fontWeight: 800, letterSpacing: '-.024em', lineHeight: 1.35, margin: '16px 0 4px' },
  h2: { fontSize: 17.5, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.4, margin: '13px 0 3px' },
  h3: { fontSize: 14.5, fontWeight: 800, letterSpacing: '-.012em', lineHeight: 1.45, margin: '10px 0 2px' },
};

const KICKER: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)',
};

/** Grow a textarea to fit, so the note never scrolls inside its own field. */
function autosize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
