'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import type { Tag } from '@/lib/tagList';

/**
 * Courses & tags, kept behind one button in the notebooks toolbar (N.tags). The button shows the
 * tag you are filtering by; its menu lists every tag to filter, rename, recolour or delete, and
 * adds new ones (a comma finishes a name). Notebooks take tags from their own menu, and tasks
 * pick them as their course.
 */
export function TagShelf({ tags, uses, active, onToggle, onAdd, onMenu }: {
  tags: Tag[];
  /** How many notebooks and tasks carry each tag, by tag id. */
  uses: Record<string, { notebooks: number; tasks: number }>;
  active: string | null;
  onToggle: (id: string) => void;
  /** Several at once when a comma separates them, so none overwrites another. */
  onAdd: (names: string[]) => void;
  onMenu: (event: React.MouseEvent<HTMLElement>, tag: Tag) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const on = tags.find(t => t.id === active);
  const add = () => { const names = draft.split(',').map((n) => n.trim()).filter(Boolean); if (!names.length) return; onAdd(names); setDraft(''); };
  useEffect(() => {
    if (!open) return;
    // A tag's own menu (rename, colour, delete) opens outside this box and must not shut it.
    const away = (e: PointerEvent) => { const t = e.target as HTMLElement; if (!box.current?.contains(t) && !t.closest('[role="menu"]')) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector<HTMLElement>('.tag-menu-btn')?.focus(); } };
    addEventListener('pointerdown', away); addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', esc); };
  }, [open]);

  return <div className="tag-menu" ref={box} data-part="N.tags">
    <span className={'tag-menu-pill' + (on ? ' is-on' : '')} style={on ? { '--tag': on.color } as React.CSSProperties : undefined}>
      <button type="button" className="tag-menu-btn" aria-expanded={open} aria-haspopup="dialog" aria-label={on ? `Courses and tags. Showing ${on.name}` : 'Courses and tags'} onClick={() => setOpen(o => !o)}>
        {on ? <i aria-hidden="true" /> : <Icon name="tag" size={15} />}
        <span>{on ? on.name : 'Tags'}</span>
        {!on && tags.length > 0 && <small>{tags.length}</small>}
        <span className="tag-menu-chev" aria-hidden="true" data-open={open}><Icon name="chevronDown" size={14} /></span>
      </button>
      {on && <button type="button" className="tag-menu-clear" aria-label={`Stop showing only ${on.name}`} title="Show every notebook" onClick={() => onToggle(on.id)}><Icon name="close" size={12} /></button>}
    </span>
    {open && <div className="tag-menu-pop" role="dialog" aria-label="Courses and tags">
        <p className="tag-menu-h">Courses &amp; tags</p>
        <p className="tag-menu-sub">{tags.length ? 'Pick one to see only its notebooks. Tasks can use them as their course.' : 'Add the courses you take, or any tag you like.'}</p>
        <div className="tag-shelf-row">
          {tags.map((tag, i) => {
            const use = uses[tag.id] ?? { notebooks: 0, tasks: 0 };
            const total = use.notebooks + use.tasks;
            const detail = `${use.notebooks} ${use.notebooks === 1 ? 'notebook' : 'notebooks'}, ${use.tasks} ${use.tasks === 1 ? 'task' : 'tasks'}`;
            return <span key={tag.id} className={'tag-chip' + (active === tag.id ? ' is-active' : '')} style={{ '--tag': tag.color, animationDelay: `${i * 18}ms` } as React.CSSProperties}>
              <button type="button" aria-pressed={active === tag.id} title={detail}
                aria-label={`${tag.name}, ${detail}. ${active === tag.id ? 'Showing its notebooks' : 'Show its notebooks'}`}
                onClick={() => { onToggle(tag.id); setOpen(false); }} onContextMenu={(e) => { e.preventDefault(); onMenu(e, tag); }}>
                <i aria-hidden="true" />{tag.name}{total > 0 && <small>{total}</small>}
              </button>
              <button type="button" className="tag-chip-menu" aria-label={`Options for ${tag.name}`} title="Rename, recolour or delete" onClick={(e) => onMenu(e, tag)}>
                <Icon name="dots" size={14} />
              </button>
            </span>;
          })}
        </div>
        <form className="tag-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Icon name="plus" size={15} />
          <input value={draft} maxLength={40} aria-label="Add a course or tag" placeholder={tags.length ? 'Add another' : 'Add a course or tag'}
            onChange={(e) => {
              // A comma finishes a tag, the way tag fields usually work.
              const value = e.target.value;
              if (!value.includes(',')) { setDraft(value); return; }
              const parts = value.split(',');
              const names = parts.slice(0, -1).map((n) => n.trim()).filter(Boolean);
              if (names.length) onAdd(names);
              setDraft(parts.at(-1) ?? '');
            }} />
          {draft.trim() && <button type="submit">Add</button>}
        </form>
      </div>}
  </div>;
}
