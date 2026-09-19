'use client';

/**
 * Projects, inside My Tasks.
 *
 * `ProjectsTab` is the way in: the shelf's covers in miniature, how many
 * projects there are and how much is open. Pressing it slides the task views
 * away to the left and the projects in after them, inside the same column, so
 * the task list beside it is never covered. `ProjectsPanel` is what slides in:
 * every project as a card, the one being looked at marked, and each able to
 * keep its tasks to itself instead of showing in the main views.
 */

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { INBOX, type TaskScope } from '@/lib/taskViews';
import type { List, Task } from '@/lib/tasks';
import { inkOn, projectStats, type ProjectMetaMap } from '@/lib/projects';

const NO_PROJECT = '#7c8cff';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function ProjectsTab({ lists, open, phone, onOpen }: { lists: List[]; open: number; phone: boolean; onOpen: () => void }) {
  const covers = lists.slice(0, 4);
  return (
    <button type="button" className={'task-projects-link' + (phone ? ' is-chip' : ' is-rail')} onClick={onOpen} aria-haspopup="true"
      aria-label={`Projects: ${plural(lists.length, 'project')}, ${open} open ${open === 1 ? 'task' : 'tasks'}`}>
      <span className="task-projects-covers" aria-hidden="true">
        {covers.length
          ? covers.map((l, i) => <i key={l.id} style={{ background: l.color, '--i': i - (covers.length - 1) / 2 } as React.CSSProperties} />)
          : <i className="is-empty" />}
      </span>
      <span className="task-projects-copy">
        <b>Projects</b>
        {!phone && <small>{lists.length ? `${plural(lists.length, 'project')} · ${open} open` : 'Group tasks by what they are for'}</small>}
      </span>
      <Icon name="chevronRight" size={14} />
    </button>
  );
}

export function ProjectsPanel({ lists, archived, tasks, meta, scope, today, weekEnd, phone, onScope, onBack, onNew, onMenu, onShown, onRestore }: {
  lists: List[];
  archived: List[];
  tasks: Task[];
  meta: ProjectMetaMap | undefined;
  scope: TaskScope;
  today: string;
  weekEnd: string;
  phone: boolean;
  onScope: (scope: TaskScope) => void;
  onBack: () => void;
  onNew: () => void;
  onMenu: (list: List, x: number, y: number) => void;
  onShown: (list: List, shown: boolean) => void;
  onRestore: (list: List) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);

  const card = (l: List | null, i: number) => {
    const id = l?.id ?? INBOX;
    const s = projectStats(tasks, l?.id ?? null, today, weekEnd);
    const color = l?.color ?? NO_PROJECT;
    const hidden = !!(l && meta?.[l.id]?.hidden);
    const on = scope === `list:${id}`;
    const note = l ? meta?.[l.id]?.note : 'Tasks that belong to no project';
    return (
      <li key={id} className={'prj-card' + (on ? ' is-on' : '') + (hidden ? ' is-hidden' : '')} style={{ '--p': color, '--ink': inkOn(color), '--i': i } as React.CSSProperties}>
        <button type="button" className="prj-card-main" aria-current={on ? 'true' : undefined} onClick={() => onScope(`list:${id}`)}
          onContextMenu={(e) => { if (!l) return; e.preventDefault(); onMenu(l, e.clientX, e.clientY); }}>
          <i className="prj-card-spine" aria-hidden="true" />
          <span className="prj-card-words">
            <b>{l?.name ?? 'No project'}</b>
            {!phone && note && <small>{note}</small>}
            <span className="prj-card-stats">
              {s.open} open{s.overdue > 0 && <em className="is-late"> · {s.overdue} late</em>}{!phone && s.week > 0 && <em> · {s.week} this week</em>}
            </span>
          </span>
        </button>
        {!phone && <AsciiBar value={s.total ? (s.done / s.total) * 100 : 0} hue={color} showValue={false} shape="slim" label={`${l?.name ?? 'No project'}: ${s.done} of ${s.total} done`} />}
        {l && (
          <span className="prj-card-tools">
            <button type="button" className={'prj-card-eye' + (hidden ? ' is-off' : '')} aria-pressed={!hidden}
              title={hidden ? 'Only in this project. Tap to show these tasks in My Tasks too' : 'Showing in My Tasks. Tap to keep them to this project'}
              aria-label={hidden ? `Show ${l.name} tasks in My Tasks` : `Keep ${l.name} tasks out of My Tasks`}
              onClick={() => onShown(l, hidden)}>
              <Icon name="eye" size={14} />
            </button>
            <button type="button" className="prj-card-more" aria-label={`${l.name} options`}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMenu(l, r.right - 220, r.bottom + 4); }}>
              <Icon name="dots" size={14} />
            </button>
          </span>
        )}
      </li>
    );
  };

  return (
    <section className={'prj-panel' + (phone ? ' is-phone' : '')} aria-label="Projects">
      <header className="prj-panel-head">
        <button type="button" className="prj-back" onClick={onBack} aria-label="Back to task views"><Icon name="chevronLeft" size={16} />{phone ? null : 'Views'}</button>
        <h2>Projects</h2>
        <button type="button" className="prj-new" onClick={onNew}><Icon name="plus" size={14} />New</button>
      </header>
      <ul className="prj-cards">
        {lists.map((l, i) => card(l, i))}
        {card(null, lists.length)}
      </ul>
      {!phone && !lists.length && <p className="prj-empty">A project gathers the tasks for one purpose, like School or GCI World 2026.</p>}
      {archived.length > 0 && (
        <div className="prj-archived">
          <button type="button" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)}>
            <Icon name="archive" size={13} />Archived {archived.length}<Icon name={showArchived ? 'chevronUp' : 'chevronDown'} size={13} />
          </button>
          {showArchived && (
            <ul>
              {archived.map((l) => (
                <li key={l.id} style={{ '--p': l.color } as React.CSSProperties}>
                  <i aria-hidden="true" /><span>{l.name}</span>
                  <button type="button" onClick={() => onRestore(l)}><Icon name="undo" size={13} />Restore</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Over a project's own list: what it is for, and whether its tasks also show
 * in the main views of My Tasks or stay here.
 */
export function ProjectHead({ list, note, hidden, onShown, onDescribe, onProjects }: {
  list: List;
  note?: string;
  hidden: boolean;
  onShown: (shown: boolean) => void;
  onDescribe: () => void;
  onProjects: () => void;
}) {
  return (
    <div className="task-project-head" style={{ '--p': list.color } as React.CSSProperties}>
      <button type="button" className="task-project-note" onClick={onDescribe}>
        {note || <em>Say what this project is for</em>}
      </button>
      <label className="task-project-shown" title="Off keeps this project's tasks out of All open, Today and the other views">
        <input type="checkbox" checked={!hidden} onChange={(e) => onShown(e.target.checked)} />
        <span aria-hidden="true" />Show in My Tasks
      </label>
      <button type="button" className="task-open-project" onClick={onProjects}><i aria-hidden="true" />All projects<Icon name="chevronRight" size={13} /></button>
    </div>
  );
}
