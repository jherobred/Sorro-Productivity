'use client';

import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import type { TaskScope } from '@/lib/taskViews';
import type { List } from '@/lib/tasks';
import type { Tag } from '@/lib/tagList';
import { ProjectsTab } from './ProjectsLink';

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
 * Where My Tasks looks: the smart views, the way into Projects, then every
 * course. A column on a wide screen and a row of chips on a phone. Counts are
 * open tasks, and the overdue count turns red while there is any.
 *
 * Projects open in the same place the views were. The views slide off to the
 * left and the projects follow them in, so neither ever covers the task list.
 */
export function TaskRail({ scope, onScope, counts, lists, courses, tags, phone, projectsOpen, onProjects, projects }: {
  scope: TaskScope;
  onScope: (scope: TaskScope) => void;
  counts: Record<string, number>;
  lists: List[];
  courses: string[];
  tags: Tag[];
  phone: boolean;
  projectsOpen: boolean;
  onProjects: (open: boolean) => void;
  /** The panel that slides in when Projects is pressed. */
  projects: ReactNode;
}) {
  const item = (id: TaskScope, label: string, lead: ReactNode, extra?: { tone?: string }) => {
    const count = counts[id] ?? 0;
    const hide = !phone ? false : count === 0 && id !== 'all' && id !== scope && id !== 'today';
    if (hide) return null;
    return (
      <button key={id} type="button" className={'task-rail-item' + (scope === id ? ' is-on' : '')} aria-current={scope === id ? 'page' : undefined}
        data-tone={extra?.tone} onClick={() => onScope(id)}>
        {lead}
        <span className="task-rail-label">{label}</span>
        {count > 0 && <span className="task-rail-count">{count}</span>}
      </button>
    );
  };

  const openInProjects = lists.reduce((n, l) => n + (counts[`list:${l.id}`] ?? 0), 0);
  const tab = <ProjectsTab lists={lists} open={openInProjects} phone={phone} onOpen={() => onProjects(true)} />;
  const views = phone ? (
    <nav className="task-rail is-phone hbar" aria-label="Task views">
      {tab}
      {SMART_SCOPES.map((s) => item(s.id, s.label, <Icon name={s.icon} size={14} />, { tone: s.id === 'overdue' && (counts.overdue ?? 0) > 0 ? 'late' : undefined }))}
      {courses.map((c) => item(`course:${c}`, c, <Icon name="tag" size={13} color={tags.find((t) => t.name === c)?.color} />))}
    </nav>
  ) : (
    <nav className="task-rail" aria-label="Task views">
      {tab}
      <div className="task-rail-group">
        {SMART_SCOPES.map((s) => item(s.id, s.label, <Icon name={s.icon} size={15} />, { tone: s.id === 'overdue' && (counts.overdue ?? 0) > 0 ? 'late' : undefined }))}
      </div>
      {courses.length > 0 && (
        <div className="task-rail-group">
          <h2>Courses</h2>
          {courses.map((c) => item(`course:${c}`, c, <Icon name="tag" size={14} color={tags.find((t) => t.name === c)?.color ?? 'var(--tx3)'} />))}
        </div>
      )}
    </nav>
  );

  return (
    <div className={'task-rail-slide' + (phone ? ' is-phone' : '') + (projectsOpen ? ' is-projects' : '')}>
      <div className="task-rail-pane" inert={projectsOpen}>{views}</div>
      <div className="task-rail-pane" inert={!projectsOpen}>{projects}</div>
    </div>
  );
}
