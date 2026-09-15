'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { ContextMenu, type CtxContent } from '@/components/ContextMenu';
import type { List } from '@/lib/tasks';

export type BulkDay = 'today' | 'tomorrow' | 'next-week' | 'none';

/**
 * The bar that appears once tasks are selected. Every action here changes all
 * of them at once and the toast after it undoes all of them at once.
 */
export function BulkBar({ count, allSelected, lists, onSelectAll, onClear, onComplete, onDay, onPriority, onList, onDelete }: {
  count: number;
  allSelected: boolean;
  lists: List[];
  onSelectAll: () => void;
  onClear: () => void;
  onComplete: () => void;
  onDay: (day: BulkDay) => void;
  onPriority: (priority: 'high' | 'med' | 'low' | null) => void;
  onList: (listId: string | null) => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxContent } | null>(null);
  const open = (e: React.MouseEvent<HTMLElement>, label: string, items: CtxContent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ x: Math.max(8, Math.min(r.left, window.innerWidth - 268)), y: Math.max(8, r.top - 8 - 44 * (Array.isArray(items) ? items.length : 4)), label, items });
  };

  return (
    <div className="bulk-bar" role="toolbar" aria-label={`${count} selected`}>
      <button type="button" className="bulk-count" onClick={onClear} aria-label="Clear the selection" title="Clear the selection">
        <Icon name="close" size={14} /><b>{count}</b><span>selected</span>
      </button>
      {!allSelected && <button type="button" className="bulk-link" onClick={onSelectAll}>Select all</button>}
      <span className="bulk-spacer" />
      <button type="button" onClick={onComplete}><Icon name="check" size={15} /><span>Done</span></button>
      <button type="button" aria-haspopup="menu" onClick={(e) => open(e, 'Move to', [
        { icon: 'sun', label: 'Today', run: () => onDay('today') },
        { icon: 'cal', label: 'Tomorrow', run: () => onDay('tomorrow') },
        { icon: 'week', label: 'Next week', run: () => onDay('next-week') },
        { icon: 'close', label: 'No date', run: () => onDay('none') },
      ])}><Icon name="cal" size={15} /><span>Date</span></button>
      <button type="button" aria-haspopup="menu" onClick={(e) => open(e, 'Priority', [
        { icon: 'flag', label: 'High', swatch: '#f26047', run: () => onPriority('high') },
        { icon: 'flag', label: 'Medium', swatch: '#e0a100', run: () => onPriority('med') },
        { icon: 'flag', label: 'Low', swatch: '#345cff', run: () => onPriority('low') },
        { icon: 'minus', label: 'No priority', run: () => onPriority(null) },
      ])}><Icon name="flag" size={15} /><span>Priority</span></button>
      <button type="button" aria-haspopup="menu" onClick={(e) => open(e, 'Move to project', [
        { icon: 'list', label: 'Inbox', run: () => onList(null) },
        ...lists.map((l) => ({ icon: 'list' as const, label: l.name, swatch: l.color, run: () => onList(l.id) })),
      ])}><Icon name="proj" size={15} /><span>Project</span></button>
      <button type="button" className="is-danger" onClick={onDelete}><Icon name="trash" size={15} /><span>Delete</span></button>
      {menu && <ContextMenu x={menu.x} y={menu.y} kind="tasks" label={menu.label} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
