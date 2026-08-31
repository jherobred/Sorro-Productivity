'use client';

import { useMemo, useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { ContextMenu, type CtxGroup } from '../ContextMenu';
import { usePrefs } from '@/lib/prefs';
import { ask, confirmAsk } from '@/lib/ask';
import { toast } from '@/lib/toast';
import { preview, taskCount } from '@/lib/md';
import { whenLabel, type Note, type Notebook } from '@/lib/notes';

/**
 * The note list — Evernote's middle column.
 *
 * Three things per row: the title, a line of the note itself, and when it last
 * changed. The middle one is the whole point. A column of titles is only
 * findable if you named things well months ago; a line of the actual text is
 * how you recognise the note you half-remember.
 */

export type Sort = 'updated' | 'created' | 'title';
const SORT_LABEL: Record<Sort, string> = { updated: 'Date updated', created: 'Date created', title: 'Title' };

export function NoteList({
  notebook, notes, tags, selected, phone, onPick, onNew, onNewMathNote, onDelete, onMove, onRename, notebooks,
  trashCount, onOpenTrash,
}: {
  notebook: Notebook;
  notes: Note[];
  tags: Record<string, string[]>;
  selected: string | null;
  phone: boolean;
  onPick: (id: string) => void;
  onNew: () => void;
  onNewMathNote?: () => void;
  onDelete: (n: Note) => void;
  onMove: (n: Note, notebookId: string) => void;
  onRename: (n: Note, title: string) => void;
  notebooks: Notebook[];
  trashCount?: number;
  onOpenTrash?: () => void;
}) {
  const { prefs } = usePrefs();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('updated');
  const [tag, setTag] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxGroup[] } | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) for (const t of tags[n.id] ?? []) set.add(t);
    return [...set].sort();
  }, [notes, tags]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = notes.filter((n) => {
      if (tag && !(tags[n.id] ?? []).includes(tag)) return false;
      if (!term) return true;
      return n.title.toLowerCase().includes(term) || n.body.toLowerCase().includes(term);
    });
    return list.sort((a, b) =>
      sort === 'title' ? (a.title || 'Untitled').localeCompare(b.title || 'Untitled')
        : sort === 'created' ? b.created_at.localeCompare(a.created_at)
          : b.updated_at.localeCompare(a.updated_at));
  }, [notes, q, sort, tag, tags]);

  const noteMenu = (n: Note): CtxGroup[] => {
    const elsewhere = notebooks.filter((b) => b.id !== n.notebook_id);
    return [
      { items: [
        { label: 'Open', icon: 'book', run: () => onPick(n.id) },
        { label: 'Rename', icon: 'edit', shortcut: 'F2',
          run: () => void ask('Rename note', { initial: n.title, placeholder: 'Note title' })
            .then((t) => { if (t && t !== n.title) onRename(n, t); }) },
        { label: 'Copy text', icon: 'copy',
          run: () => { void navigator.clipboard?.writeText(`${n.title}\n\n${n.body}`); toast('Copied'); } },
      ] },
      { label: 'Move', items: [
        { label: 'Move to notebook', icon: 'proj',
          disabled: elsewhere.length === 0,
          hint: elsewhere.length === 0 ? 'There is only one notebook' : undefined,
          items: elsewhere.map((b) => ({
            label: b.name, icon: 'proj' as IconName, run: () => onMove(n, b.id),
          })) },
      ] },
      { items: [
        {
          label: 'Delete note',
          icon: 'trash',
          danger: true,
          shortcut: '⌫',
          run: () => void confirmAsk(`Move “${n.title || 'Untitled'}” to Trash?`, {
            message: 'This note will be safely moved to the Trash archive where you can restore it anytime.',
            confirmLabel: 'Move to Trash',
            danger: true,
          }).then((yes) => { if (yes) onDelete(n); }),
        },
      ] },
    ];
  };

  const sortMenu = (): CtxGroup[] => [
    { label: 'Sort by', items: (['updated', 'created', 'title'] as Sort[]).map((s) => ({
      label: SORT_LABEL[s], icon: 'sort' as IconName, checked: sort === s, run: () => setSort(s),
    })) },
  ];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: 0, gap: 8,
      width: phone ? '100%' : 320, flex: phone ? 1 : 'none',
    }}>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} kind="scratch" label={menu.label} items={menu.items}
          onClose={() => setMenu(null)} accent={prefs.accent} dark={prefs.theme === 'dark'} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: notebook.color, flex: 'none' }} />
        <div style={{
          fontSize: 14, fontWeight: 800, letterSpacing: '-.015em', color: 'var(--tx)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {notebook.name}
        </div>
        <span style={{ fontSize: 11, color: 'var(--tx3)', flex: 'none' }}>{notes.length}</span>

        <span style={{ marginLeft: 'auto' }} />
        <button onClick={(e) => setMenu({ x: e.clientX, y: e.clientY, label: 'Sort', items: sortMenu() })}
          className="hov tap" title="Sort" aria-label="Sort notes"
          style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
          <Icon name="sort" size={15} color="var(--tx2)" />
        </button>
      </div>

      <label style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 11px', height: 34,
        borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card)', flex: 'none',
      }}>
        <Icon name="search" size={14} color="var(--tx3)" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find in this notebook"
          aria-label="Find notes"
          style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--tx)', fontFamily: 'inherit' }} />
        {q && (
          <button onClick={() => setQ('')} aria-label="Clear search" className="hov"
            style={{ width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={11} color="var(--tx3)" />
          </button>
        )}
      </label>

      {/* Highlighted Create Note Button */}
      <button
        onClick={onNew}
        className="hov k-squish"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '11px 14px',
          borderRadius: 12,
          background: 'color-mix(in srgb, var(--acc) 16%, var(--card))',
          border: '1.5px solid var(--acc)',
          color: 'var(--accTx, var(--tx))',
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: '-.01em',
          cursor: 'pointer',
          boxShadow: '0 2px 8px color-mix(in srgb, var(--acc) 18%, transparent)',
          flex: 'none',
          transition: 'all .16s ease',
        }}
      >
        <Icon name="plus" size={15} color="currentColor" />
        <span>Create Note</span>
      </button>

      {allTags.length > 0 && (
        <div className="hbar" style={{ display: 'flex', gap: 5, overflowX: 'auto', flex: 'none', paddingBottom: 2 }}>
          {allTags.map((t) => (
            <button key={t} onClick={() => setTag(tag === t ? null : t)} className="k-chip" style={{
              flex: 'none', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
              border: `1px solid ${tag === t ? 'var(--acc)' : 'var(--line2)'}`,
              background: tag === t ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent',
              color: tag === t ? 'var(--accTx)' : 'var(--tx3)',
            }}>#{t}</button>
          ))}
        </div>
      )}

      <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {shown.map((n) => {
          const on = n.id === selected;
          const t = taskCount(n.body);
          return (
            <button key={n.id} onClick={() => onPick(n.id)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, label: n.title || 'Untitled', items: noteMenu(n) }); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '11px 13px', borderRadius: 12,
                border: '1px solid transparent',
                borderLeft: on ? '3px solid var(--acc)' : '3px solid transparent',
                background: on ? 'color-mix(in srgb, var(--acc) 10%, var(--card2))' : 'var(--card)',
                boxShadow: on ? 'none' : 'var(--sh)', flex: 'none',
                transition: 'all .16s ease',
              }}>
              <span style={{
                display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--tx)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {n.title || 'Untitled'}
              </span>
              <span style={{
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                fontSize: 11, lineHeight: 1.5, color: 'var(--tx3)', marginTop: 3, minHeight: 16,
              }}>
                {preview(n.body, 110) || 'Empty note'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 10.5, color: 'var(--tx3)' }}>
                <span>{whenLabel(n.updated_at)}</span>
                {t.total > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Icon name="check" size={10} color="var(--tx3)" />{t.done}/{t.total}
                  </span>
                )}
                {(tags[n.id] ?? []).slice(0, 2).map((x) => (
                  <span key={x} style={{ color: 'var(--accTx)' }}>#{x}</span>
                ))}
              </span>
            </button>
          );
        })}

        {shown.length === 0 && (
          <div style={{ padding: '30px 12px', textAlign: 'center', fontSize: 12, color: 'var(--tx3)' }}>
            {q || tag ? 'Nothing matches.' : 'No notes yet. Make one.'}
          </div>
        )}
      </div>

      {/* Bottom Left Trash / Archive Button for notes in this notebook */}
      {onOpenTrash && (
        <div style={{ marginTop: 'auto', paddingTop: 6, borderTop: '1px solid var(--line2)', flex: 'none' }}>
          <button
            onClick={onOpenTrash}
            className="hov k-squish"
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 10,
              border: '1px solid var(--line2)', background: 'var(--card2)',
              fontSize: 12, fontWeight: 700, color: 'var(--tx2)', cursor: 'pointer', width: '100%',
              justifyContent: 'flex-start',
            }}
          >
            <Icon name="trash" size={13} color="var(--pal-coral, var(--tx3))" />
            <span>Bin {typeof trashCount === 'number' && trashCount > 0 ? `(${trashCount})` : ''}</span>
          </button>
        </div>
      )}
    </div>
  );
}
