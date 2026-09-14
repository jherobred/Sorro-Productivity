'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import type { Tag } from '@/lib/tagList';

/**
 * Courses & tags, above the notebooks. Type a name and press Enter to add one.
 * A tag filters the notebooks when tapped, and its menu renames, recolours or
 * deletes it. Notebooks take tags from their own menu, and tasks pick them as
 * their course.
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
  const [draft, setDraft] = useState('');
  const add = () => { const names = draft.split(',').map((n) => n.trim()).filter(Boolean); if (!names.length) return; onAdd(names); setDraft(''); };
  return (
    <section className="tag-shelf" aria-labelledby="tag-shelf-title">
      <div className="tag-shelf-head">
        <h2 id="tag-shelf-title">Courses &amp; tags</h2>
        <p>{tags.length ? 'Tap one to see its notebooks. Tasks can use them as their course.' : 'Add the courses you take, or any tag you like. Notebooks and tasks can use them.'}</p>
      </div>
      <div className="tag-shelf-row">
        {tags.map((tag) => {
          const use = uses[tag.id] ?? { notebooks: 0, tasks: 0 };
          const total = use.notebooks + use.tasks;
          const detail = `${use.notebooks} ${use.notebooks === 1 ? 'notebook' : 'notebooks'}, ${use.tasks} ${use.tasks === 1 ? 'task' : 'tasks'}`;
          return (
            <span key={tag.id} className={'tag-chip' + (active === tag.id ? ' is-active' : '')} style={{ '--tag': tag.color } as React.CSSProperties}>
              <button type="button" aria-pressed={active === tag.id} title={detail}
                aria-label={`${tag.name}, ${detail}. ${active === tag.id ? 'Showing its notebooks' : 'Show its notebooks'}`}
                onClick={() => onToggle(tag.id)} onContextMenu={(e) => { e.preventDefault(); onMenu(e, tag); }}>
                <i aria-hidden="true" />{tag.name}{total > 0 && <small>{total}</small>}
              </button>
              <button type="button" className="tag-chip-menu" aria-label={`Options for ${tag.name}`} title="Rename, recolour or delete"
                onClick={(e) => onMenu(e, tag)}>
                <Icon name="dots" size={14} />
              </button>
            </span>
          );
        })}
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
      </div>
    </section>
  );
}
