/**
 * The Board tab's workflow: five columns a task moves through.
 *
 * sorro_tasks has no status column, so where a card sits lives in the synced
 * prefs map `taskBoard`, by task id, the way calendarTaskPlans does. The map
 * merges per task across devices. Done is the task's own `done` flag, so
 * ticking a task anywhere else moves its card here too.
 *
 * Pure, so node --test can hold it.
 */

export const COLUMNS = [
  { id: 'backlog', name: 'Backlog' },
  { id: 'todo', name: 'Todo' },
  { id: 'doing', name: 'In progress' },
  { id: 'review', name: 'In review' },
  { id: 'done', name: 'Done' },
] as const;

export type Col = (typeof COLUMNS)[number]['id'];
/** A card's column (absent is Todo) and its place in that column (absent sorts after placed cards). */
export type Spot = { s?: Col; o?: number };
export type BoardMap = Record<string, Spot>;

export const DEFAULT_LIMITS: Partial<Record<Col, number>> = { doing: 3, review: 2 };

export const columnName = (c: Col) => COLUMNS.find((x) => x.id === c)!.name;

export function columnOf(task: { id: string; done: boolean }, map: BoardMap): Col {
  if (task.done) return 'done';
  const s = map[task.id]?.s;
  return s && s !== 'done' ? s : 'todo';
}

/** One column's cards: placed ones in the order they were dropped, then the rest in `fallback` order. */
export function ordered<T extends { id: string }>(tasks: T[], map: BoardMap, fallback: (a: T, b: T) => number): T[] {
  const placed = tasks.filter((t) => map[t.id]?.o !== undefined).sort((a, b) => map[a.id].o! - map[b.id].o!);
  const rest = tasks.filter((t) => map[t.id]?.o === undefined).sort(fallback);
  return [...placed, ...rest];
}

/**
 * The map entries one drop writes. `column` is the target column's ids in
 * their shown order; the moved card goes in at `index` and every card there
 * is renumbered, so the order survives a reload. Dropping into Done keeps the
 * card's last working column, so un-ticking it elsewhere puts it back there.
 */
export function drop(map: BoardMap, column: string[], id: string, to: Col, index: number): BoardMap {
  const ids = column.filter((x) => x !== id);
  ids.splice(Math.max(0, Math.min(index, ids.length)), 0, id);
  const out: BoardMap = {};
  ids.forEach((x, o) => { out[x] = { ...map[x], o }; });
  if (to !== 'done') out[id] = { ...out[id], s: to };
  return out;
}

export const overLimit = (count: number, limit: number | undefined) => !!limit && count > limit;

/** A short stable code for a card, "SCH-142": the project's first letters and a number from the id. */
export function cardCode(id: string, project: string | null | undefined): string {
  const prefix = (project ?? '').replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase() || 'TSK';
  const hex = id.replace(/[^0-9a-f]/gi, '').slice(0, 6) || '0';
  return `${prefix}-${(parseInt(hex, 16) % 900) + 100}`;
}
