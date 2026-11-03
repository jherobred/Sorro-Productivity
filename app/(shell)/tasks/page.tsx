'use client';

import { themeIsDark } from '@/lib/theme';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Icon, type IconName } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { TasksSkeleton } from '@/components/Skeleton';
import { TabRail } from '@/components/TabRail';
import { ContextMenu, type CtxContent, type CtxGroup } from '@/components/ContextMenu';
import { TaskTable, type TableRow } from '@/components/tasks/TaskTable';
import { TaskItem } from '@/components/tasks/TaskItem';
import { QuickAdd } from '@/components/tasks/QuickAdd';
import { TaskPanel } from '@/components/tasks/TaskPanel';
import { TaskRail, SMART_SCOPES } from '@/components/tasks/TaskRail';
import { ProjectHead, ProjectsPanel } from '@/components/tasks/ProjectsLink';
import { BulkBar, type BulkDay } from '@/components/tasks/BulkBar';
import { CanvasLmsColumn } from '@/components/lms/CanvasLms';
import { PAL } from '@/lib/pal';
import { usePrefs, type TaskSortKey } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { ask } from '@/lib/ask';
import { toast } from '@/lib/toast';
import { triggerFireworks } from '@/lib/fireworks';
import { courseIs, TAG_COLORS } from '@/lib/tagList';
import { activeProjects, archivedProjects, withMeta } from '@/lib/projects';
import {
  useLists, useListActions, useSubtaskActions, useSubtasks, useTaskActions, useTasks,
  type List, type NewTask, type Task,
} from '@/lib/tasks';
import {
  agendaSections, boardColumns, courseNames, filterTasks, inScope, searchTasks, sortTasks,
  INBOX, NONE, NO_FILTER, SORT_LABELS, type BoardBy, type TaskScope, type TaskSort,
} from '@/lib/taskViews';
import './tasks.css';
import {WeeklyPlanner} from '@/components/tasks/WeeklyPlanner';

/* Only drawn once a date is being picked. */
const TaskDatePicker = dynamic(() => import('@/components/TaskDatePicker').then((m) => m.TaskDatePicker), { ssr: false });

const SORT_ICONS: Record<TaskSortKey, IconName> = { smart: 'spark', due: 'clock', priority: 'flag', stars: 'star', title: 'text', created: 'plus' };
const SORT_HINTS: Record<TaskSortKey, string> = {
  smart: 'Late work first, then what is due soonest, the most important first',
  due: 'Soonest deadline first, tasks with no date last',
  priority: 'High, then medium, then low',
  stars: 'Most stars first',
  title: 'A to Z',
  created: 'The task you added most recently first',
};
const PRIORITY_NAMES: Record<string, string> = { high: 'High', med: 'Medium', low: 'Low', [NONE]: 'No priority' };
const SCOPE_KEY = 'bd_task_scope';

const pad = (n: number) => String(n).padStart(2, '0');
/** Local YYYY-MM-DD, so an evening in Manila is still today. */
const localYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayAfter = (now: number, days: number) => { const d = new Date(now); d.setDate(d.getDate() + days); return localYmd(d); };
const nextMonday = (now: number) => { const d = new Date(now); return dayAfter(now, ((8 - d.getDay()) % 7) || 7); };
const bulkDay = (day: BulkDay, now: number) => (day === 'today' ? localYmd(new Date(now)) : day === 'tomorrow' ? dayAfter(now, 1) : day === 'next-week' ? nextMonday(now) : null);
/** A task moved to another day keeps the clock time it had. */
const onDay = (task: Task, day: string | null): Partial<Task> => {
  if (!day) return { due_on: null, due_at: null };
  if (!task.due_at) return { due_on: day, due_at: null };
  const old = new Date(task.due_at);
  const [y, m, d] = day.split('-').map(Number);
  return { due_on: day, due_at: new Date(y, m - 1, d, old.getHours(), old.getMinutes()).toISOString() };
};
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

type Bucket = { id: string; title: string; hint?: string; tint: string; tasks: Task[] };

export default function TasksPage() {
  const [planning,setPlanning]=useState(false);
  useEffect(()=>{if(new URLSearchParams(location.search).get('plan')==='week')setPlanning(true);},[]);
  const { phone, width } = useLayout();
  const narrow = phone || width < 1000;
  const { prefs, update } = usePrefs();
  const { data: allLists = [], isSuccess: listsLoaded } = useLists();
  const { data: tasks = [], isPending } = useTasks();
  const { data: subtasks = [] } = useSubtasks();
  const A = useTaskActions();
  const L = useListActions();
  const S = useSubtaskActions();
  const searchParams = useSearchParams();

  const [detail, setDetail] = useState<string | null>(() => searchParams?.get('detail') ?? null);
  /** Projects slid into the side column. Old links to /projects/ arrive here asking for it. */
  const [projectsOpen, setProjectsOpen] = useState(() => !!(searchParams?.get('projects') || searchParams?.get('project')));
  useEffect(() => {
    const id = searchParams?.get('detail');
    if (id) setDetail(id);
  }, [searchParams]);

  const [scope, setScopeState] = useState<TaskScope>(() => {
    const asked = searchParams?.get('project');
    if (asked) return `list:${asked}` as TaskScope;
    try { return (localStorage.getItem(SCOPE_KEY) as TaskScope | null) || 'all'; } catch { return 'all'; }
  });
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  const leaving = new Set<string>();
  /** Ticked but not yet done: the grace period that makes a stray tap harmless. */
  const pending = new Set<string>();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxContent } | null>(null);
  const [picker, setPicker] = useState<{ task: Task; anchor: { top: number; left: number; bottom: number; right: number } | null } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  // Minutes are enough to tell what is late. Countdowns keep their own clock.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);

  const view = prefs.taskView === 'list' ? 'agenda' : prefs.taskView ?? 'groups';
  const sort: TaskSort = prefs.taskSort ?? { key: 'smart', desc: false };
  const boardBy: BoardBy = prefs.taskBoardBy ?? 'list';
  const tags = prefs.tags ?? [];
  const today = localYmd(new Date(now));
  const weekEnd = dayAfter(now, 7);
  // Archived projects leave the rail and the pickers, but their tasks still show which project they are in.
  const lists = useMemo(() => activeProjects(allLists, prefs.projectMeta), [allLists, prefs.projectMeta]);
  const byList = useMemo(() => new Map(allLists.map((l) => [l.id, l])), [allLists]);
  const archived = useMemo(() => archivedProjects(allLists, prefs.projectMeta), [allLists, prefs.projectMeta]);
  /**
   * A project switched out of My Tasks keeps its tasks to itself: they leave
   * All open, Today and every other view here, counts included, and show only
   * when the project itself is open.
   */
  const kept = useMemo(() => new Set(Object.entries(prefs.projectMeta ?? {}).filter(([, m]) => m.hidden).map(([id]) => id)), [prefs.projectMeta]);
  const shownIn = useMemo(() => (kept.size ? tasks.filter((t) => !t.list_id || !kept.has(t.list_id)) : tasks), [tasks, kept]);
  const pool = (s: TaskScope) => (s.startsWith('list:') ? tasks : shownIn);
  const open = useMemo(() => tasks.filter((t) => !t.done), [tasks]);
  const courses = useMemo(() => courseNames(open, tags), [open, tags]);

  const setScope = (next: TaskScope) => {
    setScopeState(next);
    setSelected(new Set());
    setSelectMode(false);
    try { localStorage.setItem(SCOPE_KEY, next); } catch { /* the choice lasts for this visit */ }
  };

  // A list that no longer exists sends the page back to every open task.
  useEffect(() => {
    if (listsLoaded && scope.startsWith('list:') && scope !== `list:${INBOX}` && !lists.some((l) => `list:${l.id}` === scope)) setScope('all');
  }, [listsLoaded, lists, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const ids: TaskScope[] = [
      ...SMART_SCOPES.map((s) => s.id), `list:${INBOX}`,
      ...lists.map((l) => `list:${l.id}` as TaskScope), ...courses.map((c) => `course:${c}` as TaskScope),
    ];
    return Object.fromEntries(ids.map((id) => [id, pool(id).filter((t) => inScope(t, id, today, weekEnd)).length]));
  }, [tasks, shownIn, lists, courses, today, weekEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepCounts = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const s of subtasks) {
      const entry = map.get(s.task_id) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (s.done) entry.done += 1;
      map.set(s.task_id, entry);
    }
    return map;
  }, [subtasks]);

  const completedOrder = (a: Task, b: Task) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '');
  const shown = useMemo(() => {
    const scoped = searchTasks(pool(scope).filter((t) => inScope(t, scope, today, weekEnd)), query);
    const filtered = filterTasks(scoped, { ...NO_FILTER, priority });
    return scope === 'done' ? filtered.sort(completedOrder) : sortTasks(filtered, sort, now);
  }, [tasks, shownIn, scope, today, weekEnd, query, priority, sort, now]); // eslint-disable-line react-hooks/exhaustive-deps

  /* What is finished in this scope, under the open work. */
  const doneShelf = useMemo(() => {
    if (scope === 'done') return [];
    const done = pool(scope).filter((t) => t.done && !t.deleted_at);
    const inThis = scope === 'all' ? done
      : scope === 'today' ? done.filter((t) => t.completed_at && localYmd(new Date(t.completed_at)) === today)
        : scope.startsWith('list:') || scope.startsWith('course:') ? done.filter((t) => inScope({ ...t, done: false }, scope, today, weekEnd))
          : [];
    return searchTasks(inThis, query).sort(completedOrder);
  }, [tasks, shownIn, scope, today, weekEnd, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const doneToday = shownIn.filter((t) => t.done && t.completed_at && localYmd(new Date(t.completed_at)) === today).length;
  const leftToday = counts.today ?? 0;

  const buckets: Bucket[] = useMemo(() => {
    if (view === 'agenda') {
      const tone = { late: PAL.coral, today: PAL.amber, soon: PAL.mint, later: PAL.indigo, none: 'var(--tx3)' } as const;
      return agendaSections(shown, today, sort, now).map((s) => ({ id: s.id, title: s.title, hint: s.hint, tint: tone[s.tone], tasks: s.tasks }));
    }
    if (view === 'board') {
      return boardColumns(shown, boardBy, lists, tags, sort, now).map((c) => ({ id: c.id, title: c.title, tint: c.color, tasks: c.tasks }));
    }
    return [
      { id: 'late', title: 'Overdue', hint: 'Past their date', tint: PAL.coral, tasks: shown.filter((t) => !!t.due_on && t.due_on < today) },
      { id: 'today', title: 'Today', hint: 'Due before midnight', tint: PAL.amber, tasks: shown.filter((t) => t.due_on === today) },
      { id: 'upcoming', title: 'Upcoming', hint: 'After today', tint: PAL.mint, tasks: shown.filter((t) => !!t.due_on && t.due_on > today) },
      { id: 'nodate', title: 'No date', hint: 'Whenever you get to them', tint: 'var(--tx3)', tasks: shown.filter((t) => !t.due_on) },
    ].filter((b) => b.tasks.length);
  }, [view, shown, today, sort, now, boardBy, lists, tags]);

  /** Visible order, for selecting a range with Shift. */
  const order = useMemo(() => (scope === 'done' || view === 'table' ? shown : buckets.flatMap((b) => b.tasks)).map((t) => t.id), [scope, view, shown, buckets]);
  const selecting = selectMode || selected.size > 0;
  const selectedTasks = tasks.filter((t) => selected.has(t.id));

  /* ---- actions */

  const toggleSelect = (id: string, range: boolean) => {
    // Read before the update: React runs the updater later, after the anchor below has moved on.
    const from = anchor.current;
    setSelected((current) => {
      const next = new Set(current);
      if (range && from && order.includes(from)) {
        const [a, b] = [order.indexOf(from), order.indexOf(id)].sort((x, y) => x - y);
        for (const each of order.slice(a, b + 1)) next.add(each);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchor.current = id;
  };
  const clearSelection = () => { setSelected(new Set()); setSelectMode(false); };

  /** Persist on the tap. Undo is another durable write, never a cancelled UI timer. */
  const complete = (task: Task, _at: { x: number; y: number } | null) => {
    A.complete.mutate({ id: task.id, done: !task.done });
    const steps = stepCounts.get(task.id);
    toast(task.done ? `Back on the list: ${task.title}` : `Done: ${task.title}${steps && steps.done < steps.total ? ` (${steps.total - steps.done} steps left open)` : ''}`, () => {
      A.complete.mutate({ id: task.id, done: task.done });
    }, { tone: 'success', icon: 'check' });
  };

  const completeMany = (list: Task[]) => {
    const openOnes = list.filter((t) => !t.done);
    if (!openOnes.length) return;
    for (const t of openOnes) A.complete.mutate({ id: t.id, done: true });
    triggerFireworks();
    toast(`Completed ${plural(openOnes.length, 'task')}`, () => { for (const t of openOnes) A.complete.mutate({ id: t.id, done: false }); }, { tone: 'success', icon: 'check' });
    clearSelection();
  };

  const deleteMany = (list: Task[]) => {
    if (!list.length) return;
    for (const t of list) A.remove.mutate({ id: t.id });
    if (detail && list.some((t) => t.id === detail)) setDetail(null);
    toast(list.length === 1 ? `Deleted “${list[0].title}”` : `Deleted ${plural(list.length, 'task')}`,
      () => { for (const t of list) A.restore.mutate({ id: t.id }); }, { tone: 'danger' });
    clearSelection();
  };

  /** One change to several tasks, and one Undo that puts each back how it was. */
  const patchMany = (list: Task[], patchOf: (t: Task) => Partial<Task>, message: string, icon: IconName) => {
    if (!list.length) return;
    const before = list.map((t) => {
      const patch = patchOf(t);
      return { id: t.id, patch, undo: Object.fromEntries(Object.keys(patch).map((k) => [k, t[k as keyof Task] ?? null])) as Partial<Task> };
    });
    for (const b of before) A.update.mutate({ id: b.id, patch: b.patch });
    toast(message, () => { for (const b of before) A.update.mutate({ id: b.id, patch: b.undo }); }, { icon });
    clearSelection();
  };

  const moveTo = (list: Task[], day: BulkDay) => {
    const target = bulkDay(day, now);
    const label = day === 'today' ? 'today' : day === 'tomorrow' ? 'tomorrow' : day === 'next-week' ? 'next Monday' : null;
    patchMany(list, (t) => onDay(t, target), label ? `${list.length === 1 ? `“${list[0].title}”` : plural(list.length, 'task')} moved to ${label}` : `Date removed from ${list.length === 1 ? `“${list[0].title}”` : plural(list.length, 'task')}`, 'cal');
  };

  const duplicate = (task: Task) => {
    const id = crypto.randomUUID();
    A.create.mutate({
      id, title: `${task.title} (copy)`, listId: task.list_id, notes: task.notes, due_on: task.due_on, due_at: task.due_at ?? null,
      priority: task.priority, stars: task.stars, course: task.course ?? null,
    });
    for (const step of subtasks.filter((s) => s.task_id === task.id)) {
      S.create.mutate({ ...step, id: crypto.randomUUID(), task_id: id, done: false });
    }
    toast(`Made a copy of “${task.title}”`, () => setDetail(id), { tone: 'success', icon: 'copy', action: 'Open' });
  };

  const create = (task: NewTask) => {
    A.create.mutate(task);
    const where = task.listId ? byList.get(task.listId)?.name : null;
    toast(`Added “${task.title}”${where ? ` to ${where}` : ''}`, () => setDetail(task.id), { tone: 'success', icon: 'plus', action: 'Open' });
  };

  const newList = (name: string) => {
    const clean = name.trim().replace(/\s+/g, ' ');
    const existing = lists.find((l) => l.name.toLowerCase() === clean.toLowerCase());
    if (existing) { setScope(`list:${existing.id}`); toast(`“${existing.name}” is already a project`); return; }
    const list: List = { id: crypto.randomUUID(), name: clean, color: TAG_COLORS[lists.length % TAG_COLORS.length].value, position: lists.length };
    L.create.mutate(list);
    setScope(`list:${list.id}`);
    toast(`Project “${clean}” made`, undefined, { tone: 'success', icon: 'proj' });
  };

  const newProject = async () => {
    const name = (await ask('New project', { message: 'Tasks for one purpose, like School or GCI World 2026.', placeholder: 'Project name', confirmLabel: 'Create' }))?.trim();
    if (name) newList(name);
  };
  const setShown = (list: List, shown: boolean) => {
    void update({ projectMeta: withMeta(prefs.projectMeta, list.id, { hidden: !shown }) });
    toast(shown ? `${list.name} shows in My Tasks again` : `${list.name} keeps its tasks to itself now`,
      () => void update({ projectMeta: withMeta(prefs.projectMeta, list.id, { hidden: shown }) }), { icon: 'eye' });
  };
  const describe = async (list: List) => {
    const note = await ask('Describe the project', { initial: prefs.projectMeta?.[list.id]?.note ?? '', placeholder: 'What it is for, in a line', confirmLabel: 'Save' });
    if (note !== null) void update({ projectMeta: withMeta(prefs.projectMeta, list.id, { note: note.trim() }) });
  };
  const setArchived = (list: List, archivedNow: boolean) => {
    void update({ projectMeta: withMeta(prefs.projectMeta, list.id, { archived: archivedNow }) });
    if (archivedNow && scope === `list:${list.id}`) setScope('all');
    toast(archivedNow ? `${list.name} archived. Its tasks stay in My Tasks.` : `${list.name} is back`,
      () => void update({ projectMeta: withMeta(prefs.projectMeta, list.id, { archived: !archivedNow }) }), { icon: 'archive' });
  };
  const listMenu = (list: List, x: number, y: number) => setMenu({
    x, y, label: list.name, items: [
      { items: [{
        icon: 'pen', label: 'Rename', run: async () => {
          const name = (await ask('Rename project', { placeholder: list.name, confirmLabel: 'Rename' }))?.trim();
          if (name && name !== list.name) { L.update.mutate({ id: list.id, patch: { name } }); toast(`Renamed to “${name}”`, () => L.update.mutate({ id: list.id, patch: { name: list.name } })); }
        },
      }, { icon: 'text', label: prefs.projectMeta?.[list.id]?.note ? 'Edit description' : 'Add a description', run: () => void describe(list) },
      { icon: 'eye', label: 'Show in My Tasks', checked: !prefs.projectMeta?.[list.id]?.hidden, run: () => setShown(list, !!prefs.projectMeta?.[list.id]?.hidden) }] },
      { label: 'Colour', items: TAG_COLORS.map((c) => ({ icon: 'palette' as const, label: c.name, swatch: c.value, checked: list.color.toLowerCase() === c.value, run: () => L.update.mutate({ id: list.id, patch: { color: c.value } }) })) },
      { items: [{ icon: 'archive', label: 'Archive', run: () => setArchived(list, true) }] },
    ],
  });

  const rowMenu = (task: Task, x: number, y: number) => {
    const items: CtxGroup[] = [
      { items: [
        { icon: 'edit', label: 'Open', run: () => setDetail(task.id) },
        { icon: 'pen', label: 'Rename', run: () => setRenaming(task.id) },
        { icon: 'copy', label: 'Duplicate', run: () => duplicate(task) },
      ] },
      { items: [
        { icon: 'cal', label: 'Date', hint: task.due_on ?? 'No date', items: [
          { icon: 'sun', label: 'Today', checked: task.due_on === today, run: () => moveTo([task], 'today') },
          { icon: 'cal', label: 'Tomorrow', checked: task.due_on === dayAfter(now, 1), run: () => moveTo([task], 'tomorrow') },
          { icon: 'week', label: 'Next week', checked: task.due_on === nextMonday(now), run: () => moveTo([task], 'next-week') },
          { icon: 'clock', label: 'Pick a date and time', run: () => setPicker({ task, anchor: { top: y, left: x, bottom: y, right: x } }) },
          { icon: 'close', label: 'No date', checked: !task.due_on, run: () => moveTo([task], 'none') },
        ] },
        { icon: 'flag', label: 'Priority', items: (['high', 'med', 'low', null] as const).map((p) => ({
          icon: 'flag' as const, label: PRIORITY_NAMES[p ?? NONE], checked: (task.priority ?? null) === p,
          run: () => patchMany([task], () => ({ priority: p }), `Priority set to ${PRIORITY_NAMES[p ?? NONE].toLowerCase()}`, 'flag'),
        })) },
        { icon: 'proj', label: 'Move to project', items: [
          { icon: 'list', label: 'Inbox', checked: !task.list_id, run: () => patchMany([task], () => ({ list_id: null }), `Moved to Inbox`, 'list') },
          ...lists.map((l) => ({ icon: 'list' as const, label: l.name, swatch: l.color, checked: task.list_id === l.id, run: () => patchMany([task], () => ({ list_id: l.id }), `Moved to ${l.name}`, 'list') })),
        ] },
        { icon: 'star', label: task.stars ? 'Remove star' : 'Star', run: () => A.update.mutate({ id: task.id, patch: { stars: task.stars ? 0 : 1 } }) },
      ] },
      { items: [
        { icon: 'check', label: task.done ? 'Mark as not done' : 'Mark done', run: () => complete(task, null) },
        { icon: 'task', label: 'Select', run: () => { setSelectMode(true); toggleSelect(task.id, false); } },
        { icon: 'trash', label: 'Delete', danger: true, run: () => deleteMany([task]) },
      ] },
    ];
    setMenu({ x, y, label: task.title, items });
  };

  const menuAt = (e: React.MouseEvent<HTMLElement>, label: string, items: CtxContent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + 6, label, items });
  };
  const setSort = (next: TaskSort) => void update({ taskSort: next });
  const openSort = (e: React.MouseEvent<HTMLElement>) => menuAt(e, 'Sort tasks', [
    { items: (Object.keys(SORT_LABELS) as TaskSortKey[]).map((key) => ({ icon: SORT_ICONS[key], label: SORT_LABELS[key], hint: SORT_HINTS[key], checked: sort.key === key, run: () => setSort({ key, desc: false }) })) },
    { items: [{ icon: 'sort', label: sort.desc ? 'Back to normal order' : 'Reverse the order', run: () => setSort({ ...sort, desc: !sort.desc }) }] },
    ...(view === 'board' ? [{ label: 'Board columns', items: (['list', 'course', 'priority'] as const).map((by) => ({ icon: (by === 'list' ? 'list' : by === 'course' ? 'tag' : 'flag') as IconName, label: `By ${by === 'list' ? 'project' : by}`, checked: boardBy === by, run: () => void update({ taskBoardBy: by }) })) }] : []),
  ]);
  const openPriority = (e: React.MouseEvent<HTMLElement>) => menuAt(e, 'Show priority', [
    { icon: 'flag', label: 'Any priority', checked: priority === null, run: () => setPriority(null) },
    ...(['high', 'med', 'low', NONE] as const).map((p) => ({ icon: 'flag' as const, label: PRIORITY_NAMES[p], checked: priority === p, run: () => setPriority(p) })),
  ]);

  // "/" searches, "n" adds, Escape lets go of a selection.
  const selectionRef = useRef(selecting);
  selectionRef.current = selecting;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (/input|textarea|select/i.test(target.tagName) || target.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape' && selectionRef.current) { clearSelection(); return; }
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); addRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---- what the current scope is called, and what a new task gets from it */

  const scopeList = scope.startsWith('list:') ? (scope === `list:${INBOX}` ? null : byList.get(scope.slice(5))) : undefined;
  const scopeCourse = scope.startsWith('course:') ? scope.slice(7) : null;
  const title = scopeCourse ?? (scope === `list:${INBOX}` ? 'Inbox' : scopeList?.name) ?? SMART_SCOPES.find((s) => s.id === scope)?.label ?? 'My Tasks';
  const lateCount = shown.filter(t => !t.done && t.due_on && t.due_on < today).length;
  const subline = scope === 'done'
    ? plural(shown.length, 'finished task')
    : [plural(shown.length, 'open task'), scope !== 'overdue' && lateCount > 0 && scope !== 'upcoming' && scope !== 'nodate' ? `${lateCount} overdue` : null, query ? `matching “${query}”` : null].filter(Boolean).join(' · ');
  const defaults = {
    listId: scopeList?.id ?? null,
    course: scopeCourse,
    due_on: scope === 'today' ? today : null,
    hint: scopeCourse ?? scopeList?.name ?? (scope === 'today' ? 'today' : null),
  };
  const empty = query ? `No tasks match “${query}”.`
    : scope === 'today' ? 'Nothing due today. Pull something forward, or enjoy the space.'
      : scope === 'upcoming' ? 'Nothing due in the next seven days.'
        : scope === 'overdue' ? 'Nothing is overdue.'
          : scope === 'nodate' ? 'Every open task has a date.'
            : scope === 'starred' ? 'Star a task and it waits for you here.'
              : scope === 'done' ? 'Finished tasks collect here.'
                : scopeCourse ? `No open tasks for ${scopeCourse}.`
                  : scope.startsWith('list:') ? `No open tasks in ${title}.`
                    : priority ? 'No open tasks with that priority.' : 'Nothing open. Add a task above.';

  const rowOf = (t: Task): TableRow => {
    const l = t.list_id ? byList.get(t.list_id) : undefined;
    const late = t.due_on && t.due_on < today ? Math.round((new Date(`${today}T00:00:00`).getTime() - new Date(`${t.due_on}T00:00:00`).getTime()) / 86_400_000) : 0;
    const dueLabel = !t.due_on ? '' : t.due_on === today ? 'Today' : t.due_on === dayAfter(now, 1) ? 'Tomorrow' : new Date(`${t.due_on}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
    return { task: t, listName: l?.name ?? 'Inbox', listColor: l?.color ?? PAL.indigo, late, dueLabel, pri: t.priority === 'high' ? 'High' : t.priority === 'med' ? 'Med' : 'Low' };
  };

  const item = (t: Task, showList = !scope.startsWith('list:') && !(view === 'board' && boardBy === 'list')) => {
    const course = t.course;
    return (
      <TaskItem key={t.id} task={t}
        list={t.list_id ? byList.get(t.list_id) : undefined}
        tag={course ? tags.find((tag) => courseIs(course, tag)) : undefined}
        steps={stepCounts.get(t.id)}
        showList={showList}
        selected={selected.has(t.id)} selecting={selecting}
        leaving={leaving.has(t.id)} pending={pending.has(t.id)} phone={phone} time24={prefs.time24} now={now}
        renaming={renaming === t.id} onRenameEnd={() => setRenaming(null)}
        onToggleSelect={(range) => toggleSelect(t.id, range)}
        onCheck={(at) => complete(t, at)}
        onOpen={() => setDetail(t.id)}
        onRename={(name) => patchMany([t], () => ({ title: name }), `Renamed to “${name}”`, 'pen')}
        onStar={() => A.update.mutate({ id: t.id, patch: { stars: t.stars ? 0 : 1 } })}
        onSchedule={(rect) => setPicker({ task: t, anchor: rect })}
        onMenu={(x, y) => rowMenu(t, x, y)}
        onDelete={() => deleteMany([t])} />
    );
  };

  const detailTask = tasks.find((t) => t.id === detail) ?? null;
  const wide = !narrow && (view === 'board' || view === 'table') && scope !== 'done';

  if(planning)return <WeeklyPlanner onClose={()=>setPlanning(false)}/>;
  return (
    <div className={'tasks-page' + (narrow ? ' is-narrow' : '') + (wide ? ' is-wide' : '')}>
      {!narrow && (
        <aside className="tasks-side">
          <CanvasLmsColumn />
          <TaskRail scope={scope} onScope={setScope} counts={counts} lists={lists} courses={courses} tags={tags} phone={false}
            projectsOpen={projectsOpen} onProjects={setProjectsOpen} projects={<ProjectsPanel lists={lists} archived={archived} tasks={tasks} meta={prefs.projectMeta} scope={scope} today={today} weekEnd={weekEnd} phone={false}
            onScope={setScope} onBack={() => setProjectsOpen(false)} onNew={() => void newProject()} onMenu={listMenu} onShown={setShown} onRestore={(l) => setArchived(l, false)} />} />
        </aside>
      )}

      <div className="tasks-main">
        <header className="tasks-head">
          <div className="tasks-head-title">
            <h1 className="section-title">{title}</h1>
            <p>{subline}</p>
            {scopeList && <ProjectHead list={scopeList} note={prefs.projectMeta?.[scopeList.id]?.note} hidden={!!prefs.projectMeta?.[scopeList.id]?.hidden}
              onShown={(shown) => setShown(scopeList, shown)} onDescribe={() => void describe(scopeList)} onProjects={() => setProjectsOpen(true)} />}
          </div>
          {scope !== 'done' && (
            <div className="tasks-today" aria-label="Today's progress">
              <div className="tasks-today-words">
                <b>{doneToday + leftToday === 0 ? 'Nothing due today' : `${doneToday} done today`}</b>
                {leftToday > 0 && <span>{plural(leftToday, 'task')} left</span>}
              </div>
              <AsciiBar value={doneToday + leftToday ? (doneToday / (doneToday + leftToday)) * 100 : 0} hue="#2fb27a" showValue={false} label="Tasks done today" />
            </div>
          )}
        </header>

        {narrow && (
          <>
            <CanvasLmsColumn collapsible />
            <TaskRail scope={scope} onScope={setScope} counts={counts} lists={lists} courses={courses} tags={tags} phone
              projectsOpen={projectsOpen} onProjects={setProjectsOpen} projects={<ProjectsPanel lists={lists} archived={archived} tasks={tasks} meta={prefs.projectMeta} scope={scope} today={today} weekEnd={weekEnd} phone={true}
            onScope={setScope} onBack={() => setProjectsOpen(false)} onNew={() => void newProject()} onMenu={listMenu} onShown={setShown} onRestore={(l) => setArchived(l, false)} />} />
          </>
        )}

        {scope !== 'done' && <QuickAdd lists={lists} tags={tags} defaults={defaults} onCreate={create} inputRef={addRef} />}

        <div className="tasks-toolbar">
          <label className="tasks-search">
            <Icon name="search" size={15} />
            <input ref={searchRef} value={query} placeholder="Search tasks" aria-label="Search tasks"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); } }} />
            {query ? (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><Icon name="close" size={12} /></button>
            ) : !phone && <kbd>/</kbd>}
          </label>
          {scope !== 'done' && (
            <TabRail label="Task view" phone={phone}
              tabs={[
                { id: 'groups', label: 'Groups', icon: 'layers' },
                { id: 'agenda', label: 'Agenda', icon: 'agenda' },
                { id: 'board', label: 'Board', icon: 'proj' },
                { id: 'table', label: 'Table', icon: 'grid' },
              ] as const}
              value={view} onChange={(v) => void update({ taskView: v })} />
          )}
          <div className="tasks-tools"><button className="tasks-tool" onClick={()=>setPlanning(true)}><Icon name="cal" size={16}/>Plan week</button>
            {scope !== 'done' && (
              <button type="button" className="tasks-tool" aria-haspopup="menu" aria-label={`Sort: ${SORT_LABELS[sort.key]}${sort.desc ? ', reversed' : ''}`} title={SORT_HINTS[sort.key]} onClick={openSort}>
                <Icon name="sort" size={15} />{!phone && <span>{SORT_LABELS[sort.key]}</span>}
              </button>
            )}
            <button type="button" className={'tasks-tool' + (priority ? ' is-on' : '')} aria-haspopup="menu" aria-label={priority ? `Priority: ${PRIORITY_NAMES[priority]}` : 'Show priority'} onClick={openPriority}>
              <Icon name="flag" size={15} />{!phone && <span>{priority ? PRIORITY_NAMES[priority] : 'Priority'}</span>}
            </button>
            <button type="button" className={'tasks-tool' + (selecting ? ' is-on' : '')} aria-label={selecting ? 'Done selecting tasks' : 'Select tasks'} aria-pressed={selecting} onClick={() => (selecting ? clearSelection() : setSelectMode(true))}>
              <Icon name="listCheck" size={15} />{!phone && <span>{selecting ? 'Done selecting' : 'Select'}</span>}
            </button>
          </div>
        </div>

        {isPending && <TasksSkeleton tints={[PAL.coral, PAL.amber, PAL.mint]} />}

        {!isPending && shown.length === 0 && (
          <div className="tasks-empty">
            <Icon name={scope === 'done' ? 'check' : query ? 'search' : 'task'} size={22} />
            <p>{empty}</p>
            {(query || priority) && <button type="button" onClick={() => { setQuery(''); setPriority(null); }}>Show everything in {title}</button>}
          </div>
        )}

        {!isPending && shown.length > 0 && (scope === 'done' ? (
          <section className="task-group">
            <header>
              <h2>Finished</h2>
              <b>{shown.length}</b>
              <span className="task-group-spacer" />
              <button type="button" className="task-group-action" onClick={async () => {
                if ((await ask(`Delete all ${shown.length} finished tasks?`, { message: 'Undo is offered once, in the toast that follows.', placeholder: 'Type DELETE', confirmLabel: 'Delete them' }))?.trim().toUpperCase() !== 'DELETE') return;
                deleteMany(shown);
              }}>Clear all</button>
            </header>
            <div role="list">{shown.map((t) => item(t))}</div>
          </section>
        ) : view === 'table' ? (
          <TaskTable rows={shown.map(rowOf)} phone={phone} sort={sort}
            onSort={(key) => setSort(sort.key === key ? { key, desc: !sort.desc } : { key, desc: false })}
            onOpen={(t) => setDetail(t.id)} onCheck={(t) => complete(t, null)} pending={pending} />
        ) : (
          <div className={view === 'board' ? 'task-board hbar' : 'task-groups'} data-tour="tasks-columns">
            {buckets.map((b) => (
              <section key={b.id} className={'task-group' + (view === 'board' ? ' is-column' : '')} style={{ '--tint': b.tint } as React.CSSProperties}>
                <header>
                  <i aria-hidden="true" />
                  <h2>{b.title}</h2>
                  {b.hint && <span>{b.hint}</span>}
                  <b>{b.tasks.length}</b>
                </header>
                {b.tasks.length ? <div role="list">{b.tasks.map((t) => item(t))}</div> : <p className="task-group-empty">Nothing here.</p>}
              </section>
            ))}
          </div>
        ))}

        {!isPending && doneShelf.length > 0 && (
          <section className="task-done-shelf" data-tour="tasks-completed-shelf">
            <button type="button" className="task-done-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
              <Icon name={showDone ? 'chevronDown' : 'chevronRight'} size={14} />
              <span>{scope === 'today' ? 'Done today' : 'Completed'}</span>
              <b>{doneShelf.length}</b>
            </button>
            {showDone && <div role="list" className="rise">{doneShelf.slice(0, 50).map((t) => item(t))}</div>}
          </section>
        )}
      </div>

      {selected.size > 0 && (
        <BulkBar count={selected.size} allSelected={order.every((id) => selected.has(id))} lists={lists}
          onSelectAll={() => setSelected(new Set(order))} onClear={clearSelection}
          onComplete={() => completeMany(selectedTasks)}
          onDay={(day) => moveTo(selectedTasks, day)}
          onPriority={(p) => patchMany(selectedTasks, () => ({ priority: p }), `Priority set to ${PRIORITY_NAMES[p ?? NONE].toLowerCase()} on ${plural(selectedTasks.length, 'task')}`, 'flag')}
          onList={(id) => patchMany(selectedTasks, () => ({ list_id: id }), `${plural(selectedTasks.length, 'task')} moved to ${id ? byList.get(id)?.name ?? 'a project' : 'Inbox'}`, 'list')}
          onDelete={() => deleteMany(selectedTasks)} />
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} kind="tasks" label={menu.label} items={menu.items} accent={prefs.accent} dark={themeIsDark(prefs.theme)} onClose={() => setMenu(null)} />}

      {picker && (
        <TaskDatePicker
          initialDate={picker.task.due_on}
          initialTime={picker.task.due_at ? new Date(picker.task.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : null}
          anchorRect={picker.anchor}
          onClose={() => setPicker(null)}
          onSave={(due_on, due_at) => {
            const t = picker.task;
            patchMany([t], () => ({ due_on, due_at }), due_on ? `Due ${new Date(`${due_on}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}` : 'Date removed', 'cal');
          }} />
      )}

      {detailTask && (
        <TaskPanel task={detailTask} lists={lists} phone={phone}
          onClose={() => setDetail(null)}
          onPatch={(patch) => A.update.mutate({ id: detailTask.id, patch })}
          onComplete={() => complete(detailTask, null)}
          onDelete={() => deleteMany([detailTask])}
          onDuplicate={() => duplicate(detailTask)} />
      )}
    </div>
  );
}
