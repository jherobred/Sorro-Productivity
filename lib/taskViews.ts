import type { Task, List } from './tasks';
import type { TaskSortKey } from './prefs';
import type { Tag } from './tagList';

/**
 * How My Tasks sorts, filters and lays tasks out, apart from React so the rules
 * can be checked on their own.
 *
 * Every view shares one sort and one filter. Groups asks when, Agenda lays the
 * days out one after another, Board splits by list, course or priority, and
 * Table puts every field in a column.
 */

export type TaskSort = { key: TaskSortKey; desc: boolean };
export type BoardBy = 'list' | 'course' | 'priority';
export type TaskFilter = { list: string | null; course: string | null; priority: string | null };

export const NO_FILTER: TaskFilter = { list: null, course: null, priority: null };
export const INBOX = 'inbox';
export const NONE = 'none';

export const SORT_LABELS: Record<TaskSortKey, string> = {
  smart: 'Smart', due: 'Due date', priority: 'Priority', stars: 'Stars', title: 'Title', created: 'Newest',
};

const RANK: Record<string, number> = { high: 3, med: 2, low: 1 };
const courseKey = (course: string | null | undefined) => (course ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/** When a task is due, as a time. A date without a time counts as the end of that day. */
export function dueTime(task: Task): number | null {
  if (task.due_at) {
    const at = Date.parse(task.due_at);
    if (Number.isFinite(at)) return at;
  }
  if (task.due_on) {
    const [y, m, d] = task.due_on.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  }
  return null;
}

export function compareTasks(a: Task, b: Task, sort: TaskSort, now: number): number {
  const byDue = () => {
    const x = dueTime(a), y = dueTime(b);
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return x - y;
  };
  const byPriority = () => (RANK[b.priority ?? ''] ?? 0) - (RANK[a.priority ?? ''] ?? 0);
  const byStars = () => (b.stars || 0) - (a.stars || 0);
  const byTitle = () => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
  let result: number;
  switch (sort.key) {
    case 'due': result = byDue() || byPriority() || byTitle(); break;
    case 'priority': result = byPriority() || byDue() || byTitle(); break;
    case 'stars': result = byStars() || byDue() || byTitle(); break;
    case 'title': result = byTitle() || byDue(); break;
    case 'created': result = (b.position || 0) - (a.position || 0) || byTitle(); break;
    default: {
      // Smart: anything already late, then what is due soonest, and among tasks
      // due together, the more important ones first.
      const lateA = (dueTime(a) ?? Infinity) < now, lateB = (dueTime(b) ?? Infinity) < now;
      result = Number(lateB) - Number(lateA) || byDue() || byPriority() || byStars() || byTitle();
    }
  }
  return sort.desc ? -result : result;
}

export const sortTasks = (tasks: Task[], sort: TaskSort, now: number) => [...tasks].sort((a, b) => compareTasks(a, b, sort, now));

export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  return tasks.filter((t) =>
    (filter.list === null || (filter.list === INBOX ? !t.list_id : t.list_id === filter.list))
    && (filter.course === null || (filter.course === NONE ? !courseKey(t.course) : courseKey(t.course) === courseKey(filter.course)))
    && (filter.priority === null || (filter.priority === NONE ? !t.priority : t.priority === filter.priority)));
}

/** Every course in use: the kept tags first, in their order, then anything else tasks carry. */
export function courseNames(tasks: Task[], tags: Tag[]): string[] {
  const seen = new Set(tags.map((t) => courseKey(t.name)));
  const extra = new Map<string, string>();
  for (const t of tasks) {
    const key = courseKey(t.course);
    if (key && !seen.has(key) && !extra.has(key)) extra.set(key, t.course!.trim());
  }
  return [...tags.map((t) => t.name), ...[...extra.values()].sort((a, b) => a.localeCompare(b))];
}

export type Section = { id: string; title: string; hint: string; tone: 'late' | 'today' | 'soon' | 'later' | 'none'; tasks: Task[] };

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d + n);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const dayDate = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); };

/**
 * The agenda: overdue work, then one section per day for the next two weeks,
 * then everything later, then tasks with no date. Days with nothing due are
 * left out rather than listed empty.
 */
export function agendaSections(tasks: Task[], today: string, sort: TaskSort, now: number): Section[] {
  const horizon = addDays(today, 13);
  const late: Task[] = [], later: Task[] = [], none: Task[] = [];
  const days = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.due_on) none.push(t);
    else if (t.due_on < today) late.push(t);
    else if (t.due_on > horizon) later.push(t);
    else days.set(t.due_on, [...(days.get(t.due_on) ?? []), t]);
  }
  const sections: Section[] = [];
  if (late.length) sections.push({ id: 'late', title: 'Overdue', hint: 'Past their date', tone: 'late', tasks: sortTasks(late, sort, now) });
  for (const day of [...days.keys()].sort()) {
    const date = dayDate(day);
    const title = day === today ? 'Today' : day === addDays(today, 1) ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'long' });
    // A task with a time goes in its place in the day; the rest follow in the chosen order.
    const timed = days.get(day)!.filter((t) => t.due_at).sort((a, b) => (dueTime(a) ?? 0) - (dueTime(b) ?? 0));
    const untimed = sortTasks(days.get(day)!.filter((t) => !t.due_at), sort, now);
    sections.push({ id: day, title, hint: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), tone: day === today ? 'today' : 'soon', tasks: [...timed, ...untimed] });
  }
  if (later.length) sections.push({ id: 'later', title: 'Later', hint: 'More than two weeks away', tone: 'later', tasks: sortTasks(later, sort, now) });
  if (none.length) sections.push({ id: 'none', title: 'No date', hint: 'Whenever you get to them', tone: 'none', tasks: sortTasks(none, sort, now) });
  return sections;
}

export type Column = { id: string; title: string; color: string; tasks: Task[] };

export function boardColumns(tasks: Task[], by: BoardBy, lists: List[], tags: Tag[], sort: TaskSort, now: number): Column[] {
  if (by === 'priority') {
    return [
      { id: 'high', title: 'High', color: '#f26047', tasks: tasks.filter((t) => t.priority === 'high') },
      { id: 'med', title: 'Medium', color: '#e0a100', tasks: tasks.filter((t) => t.priority === 'med') },
      { id: 'low', title: 'Low', color: '#2fb27a', tasks: tasks.filter((t) => t.priority === 'low') },
      { id: NONE, title: 'No priority', color: '#7a7a74', tasks: tasks.filter((t) => !t.priority) },
    ].filter((c) => c.tasks.length || c.id !== NONE).map((c) => ({ ...c, tasks: sortTasks(c.tasks, sort, now) }));
  }
  if (by === 'course') {
    const names = courseNames(tasks, tags);
    const columns = names.map((name) => ({
      id: 'course:' + courseKey(name), title: name,
      color: tags.find((t) => courseKey(t.name) === courseKey(name))?.color ?? '#7a7a74',
      tasks: sortTasks(tasks.filter((t) => courseKey(t.course) === courseKey(name)), sort, now),
    }));
    const loose = tasks.filter((t) => !courseKey(t.course));
    if (loose.length) columns.push({ id: NONE, title: 'No course', color: '#7a7a74', tasks: sortTasks(loose, sort, now) });
    return columns;
  }
  const columns = lists.map((l) => ({ id: l.id, title: l.name, color: l.color, tasks: sortTasks(tasks.filter((t) => t.list_id === l.id), sort, now) }));
  // A task on no list, or on a list that no longer exists, still has to be
  // somewhere, or the board quietly shows fewer tasks than the count above it.
  const known = new Set(lists.map((l) => l.id));
  const loose = tasks.filter((t) => !t.list_id || !known.has(t.list_id));
  if (loose.length) columns.unshift({ id: INBOX, title: 'Inbox', color: '#7c8cff', tasks: sortTasks(loose, sort, now) });
  return columns;
}

/**
 * Where My Tasks is looking: a smart view, one list, or one course. Today
 * takes in late work too, because late work is due now. Done is the only
 * scope that shows finished tasks.
 */
export type TaskScope = 'all' | 'today' | 'upcoming' | 'overdue' | 'nodate' | 'starred' | 'done' | `list:${string}` | `course:${string}`;

export function inScope(task: Task, scope: TaskScope, today: string, weekEnd: string): boolean {
  if (task.deleted_at) return false;
  if (scope === 'done') return task.done;
  if (task.done) return false;
  if (scope === 'today') return !!task.due_on && task.due_on <= today;
  if (scope === 'upcoming') return !!task.due_on && task.due_on > today && task.due_on <= weekEnd;
  if (scope === 'overdue') return !!task.due_on && task.due_on < today;
  if (scope === 'nodate') return !task.due_on;
  if (scope === 'starred') return (task.stars || 0) > 0;
  if (scope.startsWith('list:')) {
    const id = scope.slice(5);
    return id === INBOX ? !task.list_id : task.list_id === id;
  }
  if (scope.startsWith('course:')) return courseKey(task.course) === courseKey(scope.slice(7));
  return true;
}

/** Every word of the search has to appear in the title, the notes or the course. */
export function searchTasks(tasks: Task[], query: string): Task[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return tasks;
  return tasks.filter((t) => {
    const text = `${t.title} ${t.notes ?? ''} ${t.course ?? ''}`.toLocaleLowerCase();
    return words.every((w) => text.includes(w));
  });
}
