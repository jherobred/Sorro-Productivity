'use client';

import type { List, Task } from './tasks';

/**
 * Projects are task lists given a shelf of their own.
 *
 * The rows stay in bd_lists and a task still points at one through list_id,
 * so My Tasks and Projects always agree. What a list row cannot hold (a line
 * of description, being put away) rides the synced profile prefs, keyed by
 * the list's id, the way notebook colours and tags already do.
 */

export type ProjectMeta = { note?: string; archived?: boolean };
export type ProjectMetaMap = Record<string, ProjectMeta>;

export const activeProjects = (lists: List[], meta: ProjectMetaMap | undefined) =>
  lists.filter((l) => !meta?.[l.id]?.archived).sort((a, b) => a.position - b.position);

export const archivedProjects = (lists: List[], meta: ProjectMetaMap | undefined) =>
  lists.filter((l) => meta?.[l.id]?.archived).sort((a, b) => a.position - b.position);

export const withMeta = (meta: ProjectMetaMap | undefined, id: string, patch: ProjectMeta): ProjectMetaMap =>
  ({ ...(meta ?? {}), [id]: { ...(meta?.[id] ?? {}), ...patch } });

export type ProjectStats = { total: number; open: number; done: number; overdue: number; week: number; next: Task | null };

/** How a project is going, from its tasks. `projectId` null is the tasks with no project. */
export function projectStats(tasks: Task[], projectId: string | null, today: string, weekEnd: string): ProjectStats {
  const mine = tasks.filter((t) => !t.deleted_at && (t.list_id ?? null) === projectId);
  const open = mine.filter((t) => !t.done);
  const dated = open.filter((t) => t.due_on).sort((a, b) => `${a.due_on}${a.due_at ?? ''}`.localeCompare(`${b.due_on}${b.due_at ?? ''}`));
  return {
    total: mine.length,
    open: open.length,
    done: mine.length - open.length,
    overdue: open.filter((t) => !!t.due_on && t.due_on < today).length,
    week: open.filter((t) => t.due_on && t.due_on >= today && t.due_on <= weekEnd).length,
    next: dated.find((t) => t.due_on! >= today) ?? dated[0] ?? null,
  };
}

/** Dark text on a light colour, white on a dark one. */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255) > 0.2 ? '#1b1b1f' : '#fff';
}
