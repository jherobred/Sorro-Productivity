'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icon';
import type { List } from '@/lib/tasks';

/**
 * The way from My Tasks to the Projects shelf: its covers in miniature and
 * where the tap goes. In the rail it says how much is open; as a phone chip it
 * is only the covers and the name.
 */
export function ProjectsLink({ lists, open, variant }: { lists: List[]; open: number; variant: 'rail' | 'chip' }) {
  const covers = lists.slice(0, 4);
  return (
    <Link href="/projects/" className={`task-projects-link is-${variant}`}
      aria-label={`Open Projects: ${lists.length} ${lists.length === 1 ? 'project' : 'projects'}, ${open} open ${open === 1 ? 'task' : 'tasks'}`}>
      <span className="task-projects-covers" aria-hidden="true">
        {covers.length
          ? covers.map((l, i) => <i key={l.id} style={{ background: l.color, '--i': i - (covers.length - 1) / 2 } as React.CSSProperties} />)
          : <i className="is-empty" />}
      </span>
      <span className="task-projects-copy">
        <b>{variant === 'rail' ? 'Open Projects' : 'Projects'}</b>
        {variant === 'rail' && (
          <small>{lists.length ? `${lists.length} ${lists.length === 1 ? 'project' : 'projects'} · ${open} open` : 'Group tasks by what they are for'}</small>
        )}
      </span>
      <Icon name="chevronRight" size={14} />
    </Link>
  );
}

/** A small pointer from a project's task list to its own page on the shelf. */
export function OpenInProjects({ list }: { list: List }) {
  return (
    <Link href={`/projects/?open=${encodeURIComponent(list.id)}`} className="task-open-project" style={{ '--p': list.color } as React.CSSProperties}>
      <i aria-hidden="true" />Open {list.name} in Projects<Icon name="chevronRight" size={13} />
    </Link>
  );
}
