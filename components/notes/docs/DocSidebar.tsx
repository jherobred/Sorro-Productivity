'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import type { DocTab } from '@/lib/docFormat';
import type { Note } from '@/lib/notes';
import { MenuPanel } from './DocMenu';

export type Heading = { pos: number; level: number; text: string };

/**
 * Document tabs down the left, with the outline of the open tab under it:
 * every Title and heading, indented by level, and a click jumps there.
 */
export function DocSidebar({ tabs, activeId, headings, backlinks, editable, floating = false, onSelect, onAdd, onRename, onDuplicate, onDelete, onJump, onHide, onOpenNote }: {
  tabs: DocTab[];
  activeId: string;
  headings: Heading[];
  backlinks: Note[];
  editable: boolean;
  /** Drawn over the canvas when the window is too narrow to keep it beside the page. */
  floating?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, title: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onJump: (pos: number) => void;
  onHide: () => void;
  onOpenNote: (id: string) => void;
}) {
  const [menu, setMenu] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <aside className={'doc-sidebar' + (floating ? ' is-floating' : '')} aria-label="Document tabs and outline">
      <button type="button" className="doc-sidebar-hide" aria-label="Hide tabs & outlines" data-doc-tip="Hide tabs & outlines" onClick={onHide}>
        <Icon name="back" size={20} />
      </button>
      <div className="doc-sidebar-head">
        <span>Document tabs</span>
        {editable && <button type="button" aria-label="Add tab" data-doc-tip="Add tab" onClick={onAdd}><Icon name="plus" size={18} /></button>}
      </div>
      <div className="doc-tabs" role="tablist" aria-orientation="vertical">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <div key={tab.id} className={'doc-tab' + (active ? ' is-active' : '')}>
              {renaming === tab.id ? (
                <input className="doc-tab-rename" autoFocus defaultValue={tab.title} aria-label="Tab name"
                  onBlur={(e) => { onRename(tab.id, e.currentTarget.value.trim() || tab.title); setRenaming(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }} />
              ) : (
                <button type="button" role="tab" aria-selected={active} className="doc-tab-main" onClick={() => onSelect(tab.id)}
                  onDoubleClick={() => editable && setRenaming(tab.id)}>
                  <Icon name="docPage" size={17} /><span>{tab.title}</span>
                </button>
              )}
              {editable && (
                <button type="button" className="doc-tab-more" data-menu-anchor aria-label={`Options for ${tab.title}`}
                  onClick={(e) => setMenu({ id: tab.id, rect: e.currentTarget.getBoundingClientRect() })}>
                  <Icon name="moreVert" size={16} />
                </button>
              )}
              {active && headings.length > 0 && (
                <nav className="doc-outline" aria-label="Outline">
                  {headings.map((h) => (
                    <button key={h.pos} type="button" style={{ paddingLeft: 30 + (h.level - 1) * 12 }} onClick={() => onJump(h.pos)} title={h.text}>
                      {h.text || 'Untitled heading'}
                    </button>
                  ))}
                </nav>
              )}
            </div>
          );
        })}
      </div>
      {!headings.length && <p className="doc-sidebar-hint">Headings you add to the document appear here.</p>}
      {backlinks.length > 0 && (
        <div className="doc-backlinks">
          <span>Linked from</span>
          {backlinks.map((n) => (
            <button key={n.id} type="button" onClick={() => onOpenNote(n.id)}><Icon name="link" size={14} />{n.title || 'Untitled'}</button>
          ))}
        </div>
      )}
      {menu && (
        <MenuPanel x={menu.rect.left} y={menu.rect.bottom + 4} label="Tab options" onClose={() => setMenu(null)} entries={[
          { label: 'Rename', icon: 'edit', run: () => setRenaming(menu.id) },
          { label: 'Duplicate', icon: 'copy', run: () => onDuplicate(menu.id) },
          'separator',
          { label: 'Delete', icon: 'trash', disabled: tabs.length < 2, run: () => onDelete(menu.id) },
        ]} />
      )}
    </aside>
  );
}
