'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { ContextMenu, type CtxItem } from './ContextMenu';
import { usePrefs } from '@/lib/prefs';
import { K, PAL } from '@/lib/pal';
import { toast } from '@/lib/toast';
import {
  useBlocks, useBlockActions, useBacklinks, BLOCK_MENU, SHORTCUTS, spans, wikiTargets,
  textToBlocks, type Block, type BlockKind,
} from '@/lib/blocks';
import type { Note } from '@/lib/notebooks';

/**
 * A block editor in the OneNote / Evernote / Notion / RemNote family.
 *
 * The focused block is a raw <textarea>; every other block renders formatted.
 * That is the same "source mode" trade Obsidian and Bear make, and it is why
 * the caret never fights the renderer — the jank in rich-text editors almost
 * always comes from re-rendering the element the caret is inside.
 *
 * Writing space is the other half of the brief: the toolbar is one row that
 * only appears for the focused block, the rails collapse, and the column is
 * capped at a comfortable measure rather than stretched across a wide monitor.
 */

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export function NoteEditor({
  note, phone, notes, onPickNote, onSave, onDelete, onNewNote,
}: {
  note: Note | null;
  phone: boolean;
  notes: Note[];
  onPickNote: (id: string) => void;
  onSave: (p: Partial<Note>) => void;
  onDelete: () => void;
  onNewNote: (title: string) => void;
}) {
  const { prefs } = usePrefs();
  const { data: blocks = [] } = useBlocks(note?.id ?? null);
  const { data: backlinks = [] } = useBacklinks(note?.id ?? null);
  const A = useBlockActions(note?.id ?? null);

  const [title, setTitle] = useState(note?.title ?? '');
  const [focus, setFocus] = useState<string | null>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [slash, setSlash] = useState<{ id: string; query: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: CtxItem[]; label: string } | null>(null);
  const [prog, setProg] = useState(0);
  const [migrated, setMigrated] = useState<string | null>(null);
  const fields = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => { setTitle(note?.title ?? ''); }, [note?.id, note?.title]);

  useEffect(() => {
    if (!note || title === note.title) return;
    const t = setTimeout(() => onSave({ title }), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  /**
   * Notes written before blocks existed still hold their text in `bd_notes.body`.
   * The first time such a note is opened, split it into blocks so nothing is
   * lost and the editor has something to work with.
   */
  useEffect(() => {
    if (!note || blocks.length || migrated === note.id) return;
    setMigrated(note.id);
    const seed = note.body?.trim()
      ? textToBlocks(note.id, note.body)
      : [{ id: crypto.randomUUID(), note_id: note.id, kind: 'text' as BlockKind, text: '', done: false, position: 0 }];
    seed.forEach((b) => A.add.mutate(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, blocks.length]);

  /** Wiki links are resolved by title, and a miss offers to create the note. */
  const linkTargets = useMemo(() => {
    const byTitle = new Map(notes.map((n) => [n.title.toLowerCase(), n.id]));
    return (name: string) => byTitle.get(name.toLowerCase()) ?? null;
  }, [notes]);

  // Keep bd_note_links in step with the text, debounced so a burst of typing
  // does not rewrite the link table on every keystroke.
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => {
      const targets = [...new Set(blocks.flatMap((b) => wikiTargets(b.text)))]
        .map(linkTargets)
        .filter((id): id is string => !!id && id !== note.id);
      A.syncLinks.mutate({ note_id: note.id, targets });
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, note?.id]);

  /* ------------------------------------------------------------- editing */

  const focusBlock = useCallback((id: string, at: number | 'end' = 'end') => {
    setFocus(id);
    requestAnimationFrame(() => {
      const el = fields.current[id];
      if (!el) return;
      el.focus();
      const pos = at === 'end' ? el.value.length : Math.min(at, el.value.length);
      el.setSelectionRange(pos, pos);
      autosize(el);
    });
  }, []);

  const addBlock = (after: Block | null, kind: BlockKind = 'text', text = '') => {
    if (!note) return null;
    const pos = after ? after.position + 1 : blocks.length;
    const id = crypto.randomUUID();
    // Everything below shifts down; positions stay a dense index.
    blocks.filter((b) => b.position >= pos).forEach((b) => A.save.mutate({ id: b.id, patch: { position: b.position + 1 } }));
    A.add.mutate({ id, note_id: note.id, kind, text, done: false, position: pos });
    focusBlock(id, 0);
    return id;
  };

  const setKind = (b: Block, kind: BlockKind, text?: string) => {
    A.save.mutate({ id: b.id, patch: { kind, ...(text !== undefined ? { text } : {}) } });
    setSlash(null);
    if (kind !== 'divider') focusBlock(b.id, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, b: Block, i: number) => {
    const el = e.currentTarget;
    const at = el.selectionStart;

    if (slash?.id === b.id && (e.key === 'Escape')) { setSlash(null); return; }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (slash?.id === b.id) return;                      // the menu handles it
      const before = el.value.slice(0, at);
      const after = el.value.slice(at);
      // Enter on an empty list item leaves the list, matching every editor here.
      if (!el.value && ['bullet', 'number', 'todo', 'quote', 'callout'].includes(b.kind)) {
        setKind(b, 'text');
        return;
      }
      A.save.mutate({ id: b.id, patch: { text: before } });
      const carry: BlockKind = ['bullet', 'number', 'todo'].includes(b.kind) ? b.kind : 'text';
      addBlock(b, carry, after);
      return;
    }

    if (e.key === 'Backspace' && at === 0 && el.selectionEnd === 0) {
      if (b.kind !== 'text') { e.preventDefault(); setKind(b, 'text'); return; }
      const prev = blocks[i - 1];
      if (!prev) return;
      e.preventDefault();
      // Merge into the previous block and put the caret at the seam.
      A.save.mutate({ id: prev.id, patch: { text: prev.text + el.value } });
      A.del.mutate({ id: b.id });
      focusBlock(prev.id, prev.text.length);
      return;
    }

    if (e.key === 'ArrowUp' && at === 0) {
      const prev = blocks[i - 1];
      if (prev) { e.preventDefault(); focusBlock(prev.id, 'end'); }
      return;
    }
    if (e.key === 'ArrowDown' && at === el.value.length) {
      const next = blocks[i + 1];
      if (next) { e.preventDefault(); focusBlock(next.id, 0); }
      return;
    }

    if (e.key === 'Tab') { e.preventDefault(); return; }   // never escape the editor

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && b.kind === 'todo') {
      e.preventDefault();
      A.save.mutate({ id: b.id, patch: { done: !b.done } });
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>, b: Block) => {
    const value = e.target.value;
    autosize(e.target);

    // Markdown shortcut: the prefix plus a space converts the block.
    for (const [re, kind] of SHORTCUTS) {
      if (re.test(value)) { setKind(b, kind, ''); return; }
    }

    // "/" on an empty block opens the block menu; keep typing to filter.
    if (value.startsWith('/')) setSlash({ id: b.id, query: value.slice(1) });
    else if (slash?.id === b.id) setSlash(null);

    A.save.mutate({ id: b.id, patch: { text: value } });
  };

  const blockMenu = (b: Block, i: number): CtxItem[] => [
    { label: 'Turn into text', icon: 'text', run: () => setKind(b, 'text') },
    { label: 'Turn into heading', icon: 'heading', run: () => setKind(b, 'h2') },
    { label: 'Turn into to-do', icon: 'check', run: () => setKind(b, 'todo') },
    { label: 'Duplicate', icon: 'copy', run: () => addBlock(b, b.kind, b.text) },
    { label: 'Move up', icon: 'up', run: () => move(i, -1) },
    { label: 'Copy text', icon: 'copy', run: () => { void navigator.clipboard?.writeText(b.text); toast('Copied'); } },
    { label: 'Delete block', icon: 'trash', run: () => A.del.mutate({ id: b.id }), danger: true },
  ];

  const move = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const ids = blocks.map((b) => b.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    A.reorder.mutate({ ids });
  };

  /** Long-press is the phone's right-click — same menu, same 420 ms. */
  const longPress = (b: Block, i: number) => {
    let timer: number;
    let moved = false;
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse') return;
        const sx = e.clientX, sy = e.clientY;
        moved = false;
        timer = window.setTimeout(() => {
          if (moved) return;
          if (prefs.haptics) navigator.vibrate?.(K.hapticMs);
          setMenu({ x: sx, y: sy, label: b.kind, items: blockMenu(b, i) });
        }, K.longPressMs);
        const onMove = (m: PointerEvent) => {
          if (Math.hypot(m.clientX - sx, m.clientY - sy) > K.longPressCancelPx) { moved = true; clearTimeout(timer); }
        };
        const onUp = () => {
          clearTimeout(timer);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      },
    };
  };

  const openLink = (name: string) => {
    const id = linkTargets(name);
    if (id) { onPickNote(id); return; }
    if (window.confirm(`“${name}” does not exist yet. Create it?`)) onNewNote(name);
  };

  const words = blocks.reduce((n, b) => n + (b.text.trim() ? b.text.trim().split(/\s+/).length : 0), 0);
  const todos = blocks.filter((b) => b.kind === 'todo');
  const doneCount = todos.filter((b) => b.done).length;

  if (!note) {
    return <div style={{ ...SHEET, display: 'grid', placeItems: 'center', fontSize: 12.5, color: 'var(--tx3)' }}>Pick a note, or make one.</div>;
  }

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* reading progress */}
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, zIndex: 4, borderRadius: 2, background: 'color-mix(in srgb, var(--acc) 16%, transparent)', overflow: 'hidden', pointerEvents: 'none' }}>
        <div className="k-progress" style={{ height: '100%', width: `${prog}%`, borderRadius: 2, background: 'var(--acc)', transitionDuration: '.12s' }} />
      </div>

      <div
        onScroll={(e) => {
          const el = e.currentTarget;
          const max = el.scrollHeight - el.clientHeight;
          setProg(max > 0 ? Math.round((el.scrollTop / max) * 100) : 0);
        }}
        className="navsb"
        style={{ ...SHEET, flex: 1, minHeight: 0, overflowY: 'auto', padding: phone ? '14px 14px 40px' : '18px 22px 60px' }}>

        {phone && (
          <div className="hbar" style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 10, marginBottom: 12, borderBottom: '1px solid var(--line)' }}>
            {notes.map((n) => (
              <button key={n.id} onClick={() => onPickNote(n.id)} className="k-chip" style={{
                flex: 'none', padding: '6px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', minHeight: 34,
                border: `1px solid ${n.id === note.id ? 'var(--acc)' : 'var(--line2)'}`,
                background: n.id === note.id ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent',
                color: n.id === note.id ? 'var(--accTx)' : 'var(--tx2)',
              }}>{n.title}</button>
            ))}
          </div>
        )}

        {/* The measure is capped so long prose stays readable — the writing area
            is the point of this screen, and 70-odd characters is where reading
            speed peaks. */}
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
            <textarea
              value={title}
              onChange={(e) => { setTitle(e.target.value.replace(/\n/g, '')); autosize(e.target); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); blocks[0] && focusBlock(blocks[0].id, 0); } }}
              placeholder="Untitled"
              aria-label="Note title"
              rows={1}
              style={{
                flex: 1, minWidth: 0, resize: 'none', overflow: 'hidden',
                fontSize: phone ? 22 : 27, fontWeight: 800, letterSpacing: '-.028em', lineHeight: 1.25,
                color: 'var(--tx)', fontFamily: 'inherit',
              }} />
            <button onClick={onDelete} className="hov k-squish" title="Delete note" aria-label="Delete note"
              style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center' }}>
              <Icon name="trash" size={14} color="var(--tx3)" />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 12, fontSize: 10.5, color: 'var(--tx3)', marginBottom: 16, flexWrap: 'wrap' }}>
            <span>{words} word{words === 1 ? '' : 's'}</span>
            <span>{blocks.length} block{blocks.length === 1 ? '' : 's'}</span>
            {todos.length > 0 && <span>{doneCount}/{todos.length} done</span>}
            <span style={{ marginLeft: 'auto' }}>Type <kbd style={KBD}>/</kbd> for blocks · <kbd style={KBD}>[[</kbd> to link</span>
          </div>

          {blocks.map((b, i) => (
            <BlockRow
              key={b.id}
              block={b}
              index={i}
              focused={focus === b.id}
              caret={caret}
              slash={slash?.id === b.id ? slash.query : null}
              fieldRef={(el) => { fields.current[b.id] = el; }}
              onFocus={() => setFocus(b.id)}
              onBlur={() => { setFocus((f) => (f === b.id ? null : f)); setSlash((s) => (s?.id === b.id ? null : s)); }}
              onChange={(e) => onChange(e, b)}
              onKeyDown={(e) => onKeyDown(e, b, i)}
              onToggle={() => A.save.mutate({ id: b.id, patch: { done: !b.done } })}
              onPickKind={(k) => setKind(b, k, '')}
              onClickText={(at) => { setCaret(at); focusBlock(b.id, at); }}
              onLink={openLink}
              onMenu={(x, y) => setMenu({ x, y, label: b.kind, items: blockMenu(b, i) })}
              press={longPress(b, i)}
              linkExists={(n) => !!linkTargets(n)}
            />
          ))}

          {/* Clicking the space under the last block starts a new one, which is
              what every editor in this family does. */}
          <button
            onClick={() => {
              const last = blocks[blocks.length - 1];
              if (last && !last.text) focusBlock(last.id, 0);
              else addBlock(last ?? null);
            }}
            aria-label="Add a block"
            style={{ display: 'block', width: '100%', minHeight: 140, textAlign: 'left', paddingTop: 10, fontSize: 12.5, color: 'var(--tx3)' }}>
            {blocks.length === 0 ? 'Start writing…' : ''}
          </button>

          {backlinks.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 9 }}>
                Linked from
              </div>
              <div className="k-stagger" style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {backlinks.map((n, i) => (
                  <button key={n.id} onClick={() => onPickNote(n.id)} className="k-chip" style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, minHeight: 34,
                    border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)', '--i': i,
                  } as React.CSSProperties}>
                    <Icon name="link" size={12} color="var(--tx3)" />{n.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} kind="node" label={menu.label} items={menu.items}
        onClose={() => setMenu(null)} accent={prefs.accent} dark={prefs.theme === 'dark'} />}
    </div>
  );
}

/* --------------------------------------------------------------- one block */

function BlockRow({
  block: b, index, focused, slash, fieldRef, onFocus, onBlur, onChange, onKeyDown,
  onToggle, onPickKind, onClickText, onLink, onMenu, press, linkExists,
}: {
  block: Block; index: number; focused: boolean; caret: number | null; slash: string | null;
  fieldRef: (el: HTMLTextAreaElement | null) => void;
  onFocus: () => void; onBlur: () => void;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onToggle: () => void;
  onPickKind: (k: BlockKind) => void;
  onClickText: (at: number) => void;
  onLink: (name: string) => void;
  onMenu: (x: number, y: number) => void;
  press: { onPointerDown: (e: React.PointerEvent) => void };
  linkExists: (n: string) => boolean;
}) {
  if (b.kind === 'divider') {
    return (
      <div onContextMenu={(e) => { e.preventDefault(); onMenu(e.clientX, e.clientY); }} {...press}
        style={{ padding: '12px 0' }}>
        <hr style={{ border: 0, borderTop: '1px solid var(--line2)' }} />
      </div>
    );
  }

  const style = KIND_STYLE[b.kind];

  return (
    <div
      className="blk"
      onContextMenu={(e) => { e.preventDefault(); onMenu(e.clientX, e.clientY); }}
      {...press}
      style={{ position: 'relative', display: 'flex', gap: 8, borderRadius: 8, padding: '1px 0 1px 26px', marginLeft: -26 }}>

      {/* handle — drag affordance and the menu button */}
      <button
        className="bh"
        aria-label="Block actions"
        onClick={(e) => onMenu(e.clientX, e.clientY)}
        style={{ position: 'absolute', left: 2, top: 6, width: 18, height: 18, borderRadius: 4, display: 'grid', placeItems: 'center' }}>
        <Icon name="dots" size={13} color="var(--tx3)" />
      </button>

      {b.kind === 'todo' && (
        <button onClick={onToggle} role="checkbox" aria-checked={b.done} aria-label={b.text || 'To-do'}
          className="k-squish"
          style={{
            width: 17, height: 17, flex: 'none', marginTop: 5, borderRadius: 5,
            border: `1.5px solid ${b.done ? 'var(--acc)' : 'var(--line2)'}`,
            background: b.done ? 'var(--acc)' : 'transparent', display: 'grid', placeItems: 'center',
          }}>
          {b.done && <Icon name="check" size={11} color="var(--ink)" />}
        </button>
      )}
      {b.kind === 'bullet' && <span aria-hidden style={{ flex: 'none', width: 6, height: 6, borderRadius: 3, background: 'var(--tx3)', marginTop: 9 }} />}
      {b.kind === 'number' && <span aria-hidden style={{ flex: 'none', fontSize: 12.5, color: 'var(--tx3)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{index + 1}.</span>}

      <div style={{ flex: 1, minWidth: 0, ...(style.wrap ?? {}) }}>
        {focused ? (
          <textarea
            ref={(el) => { fieldRef(el); if (el) autosize(el); }}
            value={b.text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            rows={1}
            placeholder={index === 0 ? 'Start writing, or press / for blocks' : ''}
            aria-label={`${b.kind} block`}
            style={{
              width: '100%', resize: 'none', overflow: 'hidden', fontFamily: b.kind === 'code' ? MONO : 'inherit',
              color: 'var(--tx)', ...style.text,
            }} />
        ) : (
          <div
            onMouseDown={(e) => {
              // Focus at the character the pointer landed on, so clicking into
              // a paragraph puts the caret where the user aimed.
              const at = offsetFromPoint(e.clientX, e.clientY, e.currentTarget);
              onClickText(at);
            }}
            onFocus={onFocus}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onClickText(b.text.length); } }}
            role="textbox"
            aria-label={`${b.kind} block: ${b.text || 'empty'}`}
            style={{
              cursor: 'text', minHeight: 22, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              ...style.text,
              ...(b.done ? { textDecoration: 'line-through', color: 'var(--tx3)' } : {}),
            }}>
            {b.text ? spans(b.text).map((s, i) => {
              if (s.s === 'link') {
                const known = linkExists(s.text);
                return (
                  <button key={i} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onLink(s.text); }}
                    className="k-underline"
                    style={{
                      display: 'inline', font: 'inherit', padding: '0 1px', borderRadius: 3,
                      color: known ? 'var(--accTx)' : PAL.coral,
                      background: 'color-mix(in srgb, var(--acc) 10%, transparent)',
                    }}>
                    {s.text}
                  </button>
                );
              }
              if (s.s === 'bold') return <strong key={i} style={{ fontWeight: 800 }}>{s.text}</strong>;
              if (s.s === 'italic') return <em key={i}>{s.text}</em>;
              if (s.s === 'code') return <code key={i} style={{ fontFamily: MONO, fontSize: '.92em', padding: '1px 5px', borderRadius: 5, background: 'var(--card2)' }}>{s.text}</code>;
              return <span key={i}>{s.text}</span>;
            }) : <span style={{ color: 'var(--tx3)' }}>{index === 0 ? 'Start writing, or press / for blocks' : ' '}</span>}
          </div>
        )}

        {slash !== null && <SlashMenu query={slash} onPick={onPickKind} />}
      </div>
    </div>
  );
}

function SlashMenu({ query, onPick }: { query: string; onPick: (k: BlockKind) => void }) {
  const items = BLOCK_MENU.filter((m) => m.label.toLowerCase().includes(query.toLowerCase()));
  const [i, setI] = useState(0);

  useEffect(() => { setI(0); }, [query]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setI((n) => Math.min(n + 1, items.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setI((n) => Math.max(n - 1, 0)); }
      if (e.key === 'Enter' && items[i]) { e.preventDefault(); onPick(items[i].kind); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [items, i, onPick]);

  if (!items.length) return null;

  return (
    <div className="k-bloom navsb" role="listbox" aria-label="Block types"
      style={{
        position: 'absolute', zIndex: 30, marginTop: 4, width: 262, maxHeight: 262, overflowY: 'auto',
        padding: 5, borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--line2)', boxShadow: 'var(--shl)',
      }}>
      {items.map((m, n) => (
        <button key={m.kind} role="option" aria-selected={n === i}
          onMouseDown={(e) => { e.preventDefault(); onPick(m.kind); }}
          onMouseEnter={() => setI(n)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 9px', borderRadius: 8,
            textAlign: 'left', background: n === i ? 'var(--hov)' : 'transparent', minHeight: 38,
          }}>
          <span style={{ width: 24, height: 24, flex: 'none', borderRadius: 6, display: 'grid', placeItems: 'center', background: 'var(--card)' }}>
            <Icon name={m.icon as IconName} size={13} color="var(--tx2)" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>{m.label}</span>
            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)' }}>{m.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

const SHEET: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--sh)' };
const KBD: React.CSSProperties = {
  padding: '0 4px', borderRadius: 4, border: '1px solid var(--line2)',
  background: 'var(--card2)', fontSize: 9.5, fontFamily: 'inherit', fontWeight: 700,
};

const KIND_STYLE: Record<BlockKind, { text: React.CSSProperties; wrap?: React.CSSProperties }> = {
  text: { text: { fontSize: 13.5, lineHeight: 1.7, fontWeight: 400 } },
  h1: { text: { fontSize: 22, lineHeight: 1.35, fontWeight: 800, letterSpacing: '-.024em', marginTop: 14 } },
  h2: { text: { fontSize: 17.5, lineHeight: 1.4, fontWeight: 800, letterSpacing: '-.02em', marginTop: 10 } },
  h3: { text: { fontSize: 14.5, lineHeight: 1.45, fontWeight: 800, letterSpacing: '-.012em', marginTop: 6 } },
  bullet: { text: { fontSize: 13.5, lineHeight: 1.7 } },
  number: { text: { fontSize: 13.5, lineHeight: 1.7 } },
  todo: { text: { fontSize: 13.5, lineHeight: 1.7 } },
  quote: {
    text: { fontSize: 13.5, lineHeight: 1.7, fontStyle: 'italic', color: 'var(--tx2)' },
    wrap: { borderLeft: '3px solid var(--line2)', paddingLeft: 12 },
  },
  callout: {
    text: { fontSize: 13, lineHeight: 1.65 },
    wrap: { background: 'color-mix(in srgb, var(--acc) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--acc) 26%, transparent)', borderRadius: 10, padding: '10px 12px' },
  },
  code: {
    text: { fontSize: 12, lineHeight: 1.65, fontFamily: MONO },
    wrap: { background: 'var(--card2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' },
  },
  divider: { text: {} },
};

/** Grow a textarea to fit, so a block never scrolls inside itself. */
function autosize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * Which character of a rendered block sits under the pointer. Used so clicking
 * into a paragraph lands the caret where the user aimed rather than at the end.
 */
function offsetFromPoint(x: number, y: number, root: HTMLElement): number {
  type Doc = Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  const doc = document as Doc;
  const hit = doc.caretPositionFromPoint?.(x, y) ?? (() => {
    const r = document.caretRangeFromPoint?.(x, y);
    return r ? { offsetNode: r.startContainer, offset: r.startOffset } : null;
  })();
  if (!hit) return Number.MAX_SAFE_INTEGER;

  // Sum the text length of every node before the one that was hit. The rendered
  // markup drops the `**` and `[[ ]]` marks, so this is an approximation of the
  // raw offset — close enough to feel right, and never past the end.
  let count = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node === hit.offsetNode) return count + hit.offset;
    count += node.textContent?.length ?? 0;
  }
  return count;
}
