'use client';

import { useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { INBOX, type TaskScope } from '@/lib/taskViews';
import type { List } from '@/lib/tasks';
import type { Tag } from '@/lib/tagList';

export const SMART_SCOPES: { id: TaskScope; label: string; icon: IconName }[] = [
  { id: 'all', label: 'All open', icon: 'task' },
  { id: 'today', label: 'Today', icon: 'sun' },
  { id: 'upcoming', label: 'Next 7 days', icon: 'week' },
  { id: 'overdue', label: 'Overdue', icon: 'flame' },
  { id: 'nodate', label: 'No date', icon: 'more' },
  { id: 'starred', label: 'Starred', icon: 'star' },
  { id: 'done', label: 'Completed', icon: 'check' },
];

/**
 * Where My Tasks looks: the smart views, then every list, then every course.
 * A column on a wide screen and a row of chips on a phone. Counts are open
 * tasks, and the overdue count turns red while there is any.
 */
export function TaskRail({ scope, onScope, counts, lists, courses, tags, phone, onNewList, onListMenu }: {
  scope: TaskScope;
  onScope: (scope: TaskScope) => void;
  counts: Record<string, number>;
  lists: List[];
  courses: string[];
  tags: Tag[];
  phone: boolean;
  onNewList: (name: string) => void;
  onListMenu: (list: List, x: number, y: number) => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const finishAdding = () => {
    const name = (adding ?? '').trim();
    if (name) onNewList(name);
    setAdding(null);
  };

  const item = (id: TaskScope, label: string, lead: React.ReactNode, extra?: { onContextMenu?: (e: React.MouseEvent) => void; tone?: string }) => {
    const count = counts[id] ?? 0;
    const hide = !phone ? false : count === 0 && id !== 'all' && id !== scope && id !== 'today';
    if (hide) return null;
    return (
      <button key={id} type="button" className={'task-rail-item' + (scope === id ? ' is-on' : '')} aria-current={scope === id ? 'page' : undefined}
        data-tone={extra?.tone} onClick={() => onScope(id)} onContextMenu={extra?.onContextMenu}>
        {lead}
        <span className="task-rail-label">{label}</span>
        {count > 0 && <span className="task-rail-count">{count}</span>}
      </button>
    );
  };

  if (phone) {
    return (
      <nav className="task-rail is-phone hbar" aria-label="Task views">
        {SMART_SCOPES.map((s) => item(s.id, s.label, <Icon name={s.icon} size={14} />, { tone: s.id === 'overdue' && (counts.overdue ?? 0) > 0 ? 'late' : undefined }))}
        {item(`list:${INBOX}`, 'Inbox', <i className="task-rail-dot" style={{ background: '#7c8cff' }} />)}
        {lists.map((l) => item(`list:${l.id}`, l.name, <i className="task-rail-dot" style={{ background: l.color }} />))}
        {courses.map((c) => item(`course:${c}`, c, <Icon name="tag" size={13} color={tags.find((t) => t.name === c)?.color} />))}
      </nav>
    );
  }

  return (
    <nav className="task-rail" aria-label="Task views">
      <div className="task-rail-group">
        {SMART_SCOPES.map((s) => item(s.id, s.label, <Icon name={s.icon} size={15} />, { tone: s.id === 'overdue' && (counts.overdue ?? 0) > 0 ? 'late' : undefined }))}
      </div>
      <div className="task-rail-group">
        <h2>Lists</h2>
        {item(`list:${INBOX}`, 'Inbox', <i className="task-rail-dot" style={{ background: '#7c8cff' }} />)}
        {lists.map((l) => item(`list:${l.id}`, l.name, <i className="task-rail-dot" style={{ background: l.color }} />, {
          onContextMenu: (e) => { e.preventDefault(); onListMenu(l, e.clientX, e.clientY); },
        }))}
        {adding === null ? (
          <button type="button" className="task-rail-add" onClick={() => setAdding('')}><Icon name="plus" size={14} />New list</button>
        ) : (
          <input className="task-rail-input" autoFocus value={adding} placeholder="List name" aria-label="New list name"
            onChange={(e) => setAdding(e.target.value)} onBlur={finishAdding}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); finishAdding(); }
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAdding(null); }
            }} />
        )}
      </div>
      {courses.length > 0 && (
        <div className="task-rail-group">
          <h2>Courses</h2>
          {courses.map((c) => item(`course:${c}`, c, <Icon name="tag" size={14} color={tags.find((t) => t.name === c)?.color ?? 'var(--tx3)'} />))}
        </div>
      )}
    </nav>
  );
}
