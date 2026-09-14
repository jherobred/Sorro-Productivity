'use client';
import { useOverlayBack } from '@/lib/nav';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { Icon, type IconName } from '@/components/Icon';
import { TasksSkeleton } from '@/components/Skeleton';
import { Page } from '@/components/Page';
import { TaskComposer } from '@/components/TaskComposer';
import { K, PAL } from '@/lib/pal';
import { usePrefs, type TaskSortKey } from '@/lib/prefs';
import { sortTasks, filterTasks, agendaSections, boardColumns, courseNames, SORT_LABELS, NO_FILTER, INBOX, NONE, type TaskSort, type TaskFilter, type BoardBy } from '@/lib/taskViews';
import { courseIs } from '@/lib/tagList';
import { useRegisterSidePanel } from '@/lib/sidePanel';
import { TabRail } from '@/components/TabRail';
import { TaskTable } from '@/components/tasks/TaskTable';
import { useLayout } from '@/lib/useLayout';
import { useLists, useTasks, useTaskActions, getTaskAlert, formatTaskCountdown, parseTaskLinks, serializeTaskWithLinks, type Task, type List, type CustomTaskLink } from '@/lib/tasks';
import { useLongPress } from '@/lib/useLongPress';
import { toast } from '@/lib/toast';
import { ContextMenu, type CtxContent } from '@/components/ContextMenu';
import { SwipeableRow } from '@/components/SwipeableRow';
import { ObjectCoverImage } from '@/components/notes/NotebookCover';
const CoverCapture = dynamic(() => import('@/components/notes/CoverCapture').then((m) => m.CoverCapture), { ssr: false });

/* Only on screen once you tap a due date. The inline composer above it stays
   static - it is the first thing on the page. */
const TaskDatePicker = dynamic(() => import('@/components/TaskDatePicker').then((m) => m.TaskDatePicker), { ssr: false });
import { triggerFireworks } from '@/lib/fireworks';

/**
 * Ported from Basedly.dc.html and redesigned to match Google Tasks UX & aesthetic:
 * - Full-row hover highlight
 * - Circular checkbox with completion animations
 * - Task title with sub-notes and date-time pill chip
 * - Google Tasks 3-dots context menu and date picker modal
 * - "Completed (N)" collapsible shelf
 */

const TSW = K.notebookSwipePx; // 156 — swipe reveal width
const ACT = TSW / 3; // 52px per action button

type Row = {
  task: Task;
  listName: string;
  listColor: string;
  late: number;
  dueLabel: string;
  pri: 'High' | 'Med' | 'Low';
};

const PRI_COL: Record<Row['pri'], string> = { High: PAL.coral, Med: PAL.amber, Low: 'var(--tx3)' };

/**
 * One timer for every live countdown on the page, and the digits are the only
 * thing subscribed to it.
 *
 * This was `setNowMs(Date.now())` on a 1s interval in TasksPage, threaded down
 * as a prop, so once a second the page re-rendered every row, every group
 * header, the completed shelf and the open detail panel — with a text field in
 * it someone might be typing into — to move two digits. Same shape as
 * UpNextCountdown on Home and PhoneCountdown on the phone home.
 *
 * One shared interval rather than one per row: fifty rows meant fifty timers
 * firing at fifty different moments, which is fifty separate render passes a
 * second instead of one batched one.
 */
const secondSubs = new Set<(ms: number) => void>();
let secondTimer: ReturnType<typeof setInterval> | null = null;

function useSecond(): number {
  const [ms, setMs] = useState(() => Date.now());
  useEffect(() => {
    secondSubs.add(setMs);
    secondTimer ??= setInterval(() => {
      const now = Date.now();
      for (const f of secondSubs) f(now);
    }, 1000);
    return () => {
      secondSubs.delete(setMs);
      if (!secondSubs.size && secondTimer) { clearInterval(secondTimer); secondTimer = null; }
    };
  }, []);
  return ms;
}

/** The same countdown, card-sized, for the detail panel. */
function DeadlineCard({ task, alert }: { task: Task; alert: ReturnType<typeof getTaskAlert> }) {
  const countdown = formatTaskCountdown(task, useSecond());
  if (!countdown) return null;
  const hot = countdown.isOverdue || alert?.tier === 'red';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderRadius: 14,
        marginBottom: 18,
        background: hot
          ? 'color-mix(in srgb, var(--pal-coral) 16%, var(--card2))'
          : alert?.tier === 'orange'
          ? 'color-mix(in srgb, #FF9A3C 14%, var(--card2))'
          : 'color-mix(in srgb, var(--pal-amber) 12%, var(--card2))',
        border: `1px solid ${
          hot ? 'var(--pal-coral)' : alert?.tier === 'orange' ? '#FF9A3C' : 'var(--pal-amber)'
        }`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="clock" size={20}/>
        <div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: '-.02em',
              fontVariantNumeric: 'tabular-nums',
              color: hot ? 'var(--pal-coral)' : 'var(--tx)',
            }}
          >
            {countdown.text}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 1 }}>
            {countdown.isOverdue ? 'Passed deadline' : 'Live deadline countdown'}
          </div>
        </div>
      </div>

      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          textTransform: 'uppercase',
          padding: '4px 9px',
          borderRadius: 8,
          background: 'var(--card)',
          color: hot ? 'var(--pal-coral)' : 'var(--tx2)',
          border: '1px solid var(--line2)',
        }}
      >
        {alert?.label || 'Deadline'}
      </span>
    </div>
  );
}

const priOf = (p: string | null): Row['pri'] =>
  p === 'high' ? 'High' : p === 'med' ? 'Med' : 'Low';

/** Days overdue, and the label the row shows. */
function dueInfo(due: string | null): { late: number; label: string } {
  if (!due) return { late: 0, label: '' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due + 'T00:00:00');
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { late: -days, label: `${-days}d late` };
  if (days === 0) return { late: 0, label: 'Today' };
  if (days === 1) return { late: 0, label: 'Tomorrow' };
  return { late: 0, label: d.toLocaleDateString(undefined, { weekday: 'short' }) };
}

/** Local YYYY-MM-DD, so an evening in Manila is still today. */
const localYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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

export default function TasksPage() {
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const { data: lists = [] } = useLists();
  const { data: tasks = [], isPending } = useTasks();
  const A = useTaskActions();

  const [tsw, setTsw] = useState<{ id: string; dx: number; live: boolean } | null>(null);
  const searchParams = useSearchParams();
  const [detail, setDetail] = useState<string | null>(() => searchParams?.get('detail') ?? null);

  useEffect(() => {
    const detailId = searchParams?.get('detail');
    if (detailId) {
      setDetail(detailId);
    }
  }, [searchParams]);

  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const lp = useLongPress();
  const view = prefs.taskView === 'list' ? 'agenda' : prefs.taskView ?? 'groups';
  const sort: TaskSort = prefs.taskSort ?? { key: 'smart', desc: false };
  const boardBy: BoardBy = prefs.taskBoardBy ?? 'list';
  const tags = prefs.tags ?? [];
  const [filter, setFilter] = useState<TaskFilter>(NO_FILTER);
  const [toolMenu, setToolMenu] = useState<{ x: number; y: number; label: string; items: CtxContent } | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  // Minute precision is enough to tell what is late; the countdowns have their own timer.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  // Google Tasks Date Picker Modal state
  const [datePickerTask, setDatePickerTask] = useState<{
    task: Task;
    anchorRect?: { top: number; left: number; bottom: number; right: number } | null;
  } | null>(null);

  // Google Tasks Context Menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    task: Task;
  } | null>(null);

  const byList = new Map(lists.map((l) => [l.id, l]));
  const today = localYmd(new Date(now));
  const open = useMemo(() => tasks.filter((t) => !t.done), [tasks]);
  const shown = useMemo(() => sortTasks(filterTasks(open, filter), sort, now), [open, filter, sort, now]);
  const completedTasks = filterTasks(tasks.filter((t) => t.done), filter);
  const filterCount = [filter.list, filter.course, filter.priority].filter((v) => v !== null).length;

  const rowOf = (t: Task): Row => {
    const l = t.list_id ? byList.get(t.list_id) : undefined;
    const { late, label } = dueInfo(t.due_on);
    return { task: t, listName: l?.name ?? 'Inbox', listColor: l?.color ?? PAL.indigo, late, dueLabel: label, pri: priOf(t.priority) };
  };
  const rows: Row[] = shown.map(rowOf);

  const sortNote = SORT_LABELS[sort.key] + (sort.key === 'smart' ? ' order' : '') + (sort.desc ? ', reversed' : '');

  /**
   * The buckets a view shows. Groups asks "when", Agenda lays the days out,
   * Board splits by list, course or priority. All of them render the same
   * row, so a swipe or an inline edit behaves identically in each. Only the
   * table needs its own markup, and it says why in its own file.
   */
  type Group = { n: string; hint?: string; items: Row[]; tint: string; note: string; empty: string };
  const groups: Group[] = useMemo(() => {
    if (view === 'agenda') {
      const tone = { late: PAL.coral, today: PAL.amber, soon: PAL.mint, later: PAL.indigo, none: 'var(--tx3)' } as const;
      return agendaSections(shown, today, sort, now).map((s) => ({
        n: s.title, hint: s.hint, items: s.tasks.map(rowOf), tint: tone[s.tone],
        note: s.tone === 'today' || s.tone === 'soon' ? 'Timed tasks by time' : sortNote, empty: '',
      }));
    }
    if (view === 'board') {
      return boardColumns(shown, boardBy, lists, tags, sort, now).map((c) => ({
        n: c.title, items: c.tasks.map(rowOf), tint: c.color, note: sortNote, empty: 'Empty.',
      }));
    }
    return [
      { n: 'Overdue', items: rows.filter((r) => r.late > 0), tint: PAL.coral, note: sortNote, empty: 'Nothing late.' },
      { n: 'Today', items: rows.filter((r) => !r.late && r.dueLabel === 'Today'), tint: PAL.amber, note: 'Due before midnight', empty: 'Nothing due today.' },
      { n: 'Upcoming', items: rows.filter((r) => !r.late && r.dueLabel !== 'Today'), tint: PAL.mint, note: 'Everything after today', empty: 'Nothing scheduled yet.' },
    ];
    // rowOf and sortNote are derived from the values in the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, shown, rows, sort, lists, tags, boardBy, today, now]);

  const complete = (r: Row, e?: React.MouseEvent) => {
    if (leaving.has(r.task.id)) return;
    if (e) triggerFireworks(e.clientX, e.clientY);
    else triggerFireworks();
    setLeaving((s) => new Set(s).add(r.task.id));
    setTimeout(() => {
      A.complete.mutate({ id: r.task.id, done: true });
      setLeaving((s) => { const n = new Set(s); n.delete(r.task.id); return n; });
    }, K.taskExitMs);
  };

  const setSort = (next: TaskSort) => void update({ taskSort: next });
  const menuAt = (e: React.MouseEvent<HTMLElement>, label: string, items: CtxContent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setToolMenu({ x: r.left, y: r.bottom + 6, label, items });
  };
  const openSort = (e: React.MouseEvent<HTMLElement>) => menuAt(e, 'Sort tasks', [
    { items: (Object.keys(SORT_LABELS) as TaskSortKey[]).map((key) => ({ icon: SORT_ICONS[key], label: SORT_LABELS[key], hint: SORT_HINTS[key], checked: sort.key === key, run: () => setSort({ key, desc: false }) })) },
    { items: [{ icon: 'sort', label: sort.desc ? 'Back to normal order' : 'Reverse the order', run: () => setSort({ ...sort, desc: !sort.desc }) }] },
  ]);
  const courses = courseNames(open, tags);
  const openFilter = (e: React.MouseEvent<HTMLElement>) => menuAt(e, 'Filter tasks', [
    { label: 'List', items: [
      { icon: 'list', label: 'Every list', checked: filter.list === null, run: () => setFilter((f) => ({ ...f, list: null })) },
      { icon: 'list', label: 'Inbox', checked: filter.list === INBOX, run: () => setFilter((f) => ({ ...f, list: INBOX })) },
      ...lists.map((l) => ({ icon: 'list' as const, label: l.name, swatch: l.color, checked: filter.list === l.id, run: () => setFilter((f) => ({ ...f, list: l.id })) })),
    ] },
    { label: 'Course', items: [
      { icon: 'book', label: 'Any course', checked: filter.course === null, run: () => setFilter((f) => ({ ...f, course: null })) },
      ...courses.map((name) => ({ icon: 'book' as const, label: name, swatch: tags.find((t) => courseIs(name, t))?.color, checked: filter.course !== null && filter.course !== NONE && courseIs(filter.course, { id: '', name, color: '' }), run: () => setFilter((f) => ({ ...f, course: name })) })),
      { icon: 'book', label: 'No course', checked: filter.course === NONE, run: () => setFilter((f) => ({ ...f, course: NONE })) },
    ] },
    { label: 'Priority', items: [
      { icon: 'flag', label: 'Any priority', checked: filter.priority === null, run: () => setFilter((f) => ({ ...f, priority: null })) },
      ...(['high', 'med', 'low', NONE] as const).map((p) => ({ icon: 'flag' as const, label: PRIORITY_NAMES[p], checked: filter.priority === p, run: () => setFilter((f) => ({ ...f, priority: p })) })),
    ] },
  ]);
  const filterChips = [
    filter.list !== null && { key: 'list' as const, label: 'List: ' + (filter.list === INBOX ? 'Inbox' : byList.get(filter.list)?.name ?? 'Unknown') },
    filter.course !== null && { key: 'course' as const, label: 'Course: ' + (filter.course === NONE ? 'None' : filter.course) },
    filter.priority !== null && { key: 'priority' as const, label: 'Priority: ' + PRIORITY_NAMES[filter.priority] },
  ].filter((chip): chip is { key: 'list' | 'course' | 'priority'; label: string } => !!chip);

  const detailTask = tasks.find((t) => t.id === detail) ?? null;
  const toolStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line2)', flex: 'none', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)' };

  return (
    <Page
      name="My Tasks"
      width={view === 'table' || view === 'board' ? 'wide' : 'list'}
      meta={filterCount ? `${rows.length} of ${open.length} open` : `${open.length} open across every list`}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <TabRail
            label="Task view"
            phone={phone}
            tabs={[
              { id: 'groups', label: 'Groups', icon: 'layers' },
              { id: 'agenda', label: 'Agenda', icon: 'agenda' },
              { id: 'board', label: 'Board', icon: 'proj' },
              { id: 'table', label: 'Table', icon: 'grid' },
            ] as const}
            value={view}
            onChange={(v) => void update({ taskView: v })} />
          <button className="hov k-squish" aria-haspopup="menu" aria-label={'Sort: ' + SORT_LABELS[sort.key] + (sort.desc ? ', reversed' : '')} title={SORT_HINTS[sort.key]} onClick={openSort} style={toolStyle}>
            <Icon name="sort" size={15} color="var(--tx2)" />{!phone && SORT_LABELS[sort.key]}{sort.desc && <Icon name="undo" size={12} color="var(--tx3)" />}
          </button>
          <button className="hov k-squish" aria-haspopup="menu" aria-label={filterCount ? `Filter, ${filterCount} on` : 'Filter'} aria-pressed={filterCount > 0} onClick={openFilter}
            style={{ ...toolStyle, border: `1px solid ${filterCount ? 'var(--acc)' : 'var(--line2)'}`, color: filterCount ? 'var(--tx)' : 'var(--tx2)' }}>
            <Icon name="filter" size={15} color={filterCount ? 'var(--tx)' : 'var(--tx2)'} />{!phone && 'Filter'}
            {filterCount > 0 && <span style={{ minWidth: 17, height: 17, padding: '0 5px', borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--acc)', color: '#fff', fontSize: 10 }}>{filterCount}</span>}
          </button>
        </div>
      }
    >

      {/* Google Tasks Style Inline Quick Composer */}
      <TaskComposer
        lists={lists}
        defaultListId={lists[0]?.id ?? null}
        onCreate={(t) => { A.create.mutate(t); toast(`Added “${t.title}”`); }} />

      {filterChips.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {filterChips.map((chip) => (
            <button key={chip.key} className="hov k-squish" aria-label={`Remove filter ${chip.label}`}
              onClick={() => setFilter((f) => ({ ...f, [chip.key]: null }))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 30, padding: '0 10px', borderRadius: 999, border: '1px solid var(--line2)', background: 'var(--card)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx)' }}>
              {chip.label}<Icon name="close" size={11} color="var(--tx3)" />
            </button>
          ))}
          {filterChips.length > 1 && (
            <button className="hov" onClick={() => setFilter(NO_FILTER)} style={{ minHeight: 30, padding: '0 8px', fontSize: 11.5, fontWeight: 700, color: 'var(--tx3)' }}>Clear all</button>
          )}
        </div>
      )}

      {/* Loading Skeleton */}
      {isPending && <TasksSkeleton tints={[PAL.coral, PAL.amber, PAL.mint]} />}

      {!isPending && view === 'board' && (
        <div role="group" aria-label="Board columns" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', marginRight: 2 }}>Columns by</span>
          {(['list', 'course', 'priority'] as const).map((by) => (
            <button key={by} aria-pressed={boardBy === by} className="hov k-squish" onClick={() => void update({ taskBoardBy: by })}
              style={{ minHeight: 30, padding: '0 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, border: `1px solid ${boardBy === by ? 'var(--acc)' : 'var(--line2)'}`, background: boardBy === by ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent', color: boardBy === by ? 'var(--tx)' : 'var(--tx2)' }}>
              {by === 'list' ? 'List' : by === 'course' ? 'Course' : 'Priority'}
            </button>
          ))}
        </div>
      )}

      {/* The table is the one view that is not a stack of buckets. */}
      {!isPending && view === 'table' && (
        <TaskTable
          rows={rows} phone={phone} sort={sort} onSort={(key) => setSort(sort.key === key ? { key, desc: !sort.desc } : { key, desc: false })}
          onOpen={(t) => setDetail(t.id)}
          onCheck={(t) => A.complete.mutate({ id: t.id, done: true })} />
      )}

      {!isPending && view === 'agenda' && groups.length === 0 && (
        <div style={{ marginTop: 14, padding: '30px 14px', borderRadius: 16, textAlign: 'center', background: 'var(--card)', border: '1px solid var(--line)', fontSize: 13, color: 'var(--tx3)' }}>
          {filterCount ? 'No open tasks match these filters.' : 'Nothing open. Add a task above and it shows up on its day.'}
        </div>
      )}

      {/* Task Groups. Board is the same buckets turned on their side, so the
          columns scroll sideways and each one keeps its own height. */}
      <div data-tour="tasks-columns" className={view === 'board' ? 'hbar' : undefined}
        style={view === 'board' ? {
          display: 'flex', gap: 12, alignItems: 'flex-start',
          overflowX: 'auto', overflowY: 'hidden', paddingBottom: 6,
        } : undefined}>
        {!isPending && view !== 'table' && groups.map((g) => (
          <div key={g.n + (g.hint ?? '')}
            style={{
              background: 'var(--card, #1E1F22)', borderRadius: 20, padding: '14px 14px 6px', marginTop: 14,
              boxShadow: 'var(--sh)', border: `1px solid color-mix(in srgb, ${g.tint} 30%, transparent)`,
              ...(view === 'board'
                // 300px left the title about 120px once the row had reserved
                // its checkbox, stars and due chip, and "problem set 4" wrapped
                // one character at a time. The row needs ~200px to read.
                ? { flex: phone ? '0 0 min(320px, 86vw)' : '0 0 360px', width: phone ? 'min(320px, 86vw)' : 360, marginTop: 14, alignSelf: 'stretch' }
                : null),
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8, padding: '0 4px', flexWrap: 'wrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: g.tint }} />
              <span style={{
                fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase',
                color: prefs.theme === 'dark'
                  ? `color-mix(in srgb, ${g.tint} 100%, transparent)`
                  : `color-mix(in srgb, ${g.tint} 66%, #201E1D)`,
              }}>
                {g.n}
              </span>
              {g.hint && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)' }}>{g.hint}</span>}
              <span style={{ padding: '2px 8px', borderRadius: 7, fontSize: 10, fontWeight: 800, color: 'var(--tx3)', border: '1px solid var(--line2)', fontVariantNumeric: 'tabular-nums' }}>
                {g.items.length}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)' }}>{g.items.length ? g.note : ''}</span>
            </div>

            {g.items.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--tx3)', padding: '6px 8px 14px' }}>{g.empty}</div>
            )}

            {g.items.map((r) => (
              <TaskRow
                key={r.task.id}
                row={r}
                phone={phone}
                accent={prefs.accent}
                leaving={leaving.has(r.task.id)}
                isEditingInline={inlineEditId === r.task.id}
                onStartInlineEdit={() => setInlineEditId(r.task.id)}
                onEndInlineEdit={() => setInlineEditId(null)}
                onCheck={() => complete(r)}
                onOpen={() => { setDetail(r.task.id); setTsw(null); }}
                onDelete={() => A.removeWithUndo(r.task)}
                onPatch={(patch) => A.update.mutate({ id: r.task.id, patch })}
                onStar={(v) => A.update.mutate({ id: r.task.id, patch: { stars: r.task.stars === v ? 0 : v } })}
                onOpenMenu={(x, y) => setCtxMenu({ x, y, task: r.task })}
                onOpenDatePicker={(anchorRect) => setDatePickerTask({ task: r.task, anchorRect })}
                lp={lp}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Completed Collapsible Section (Google Tasks style) */}
      {!isPending && completedTasks.length > 0 && (
        <div
          data-tour="tasks-completed-shelf"
          style={{
            background: 'var(--card, #1E1F22)',
            borderRadius: 20,
            padding: '12px 14px',
            marginTop: 16,
            boxShadow: 'var(--sh)',
            border: '1px solid var(--line2)',
          }}
        >
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            className="hov k-squish"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  transform: showCompleted ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <Icon name="chev" size={13} color="var(--tx3)" style={{ transform: 'rotate(-90deg)' }} />
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--tx2)',
                }}
              >
                Completed ({completedTasks.length})
              </span>
            </div>

            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
              {showCompleted ? 'Hide' : 'Show'}
            </span>
          </button>

          {showCompleted && (
            <div className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 10, borderTop: '1px solid var(--line2)', paddingTop: 8 }}>
              {completedTasks.map((t) => {
                const l = t.list_id ? byList.get(t.list_id) : undefined;
                return (
                  <div
                    key={t.id}
                    className="google-task-row"
                    onClick={() => setDetail(t.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '9px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    {/* Checked Circle to Undo */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        A.complete.mutate({ id: t.id, done: false });
                        toast(`Restored “${t.title}”`);
                      }}
                      title="Mark incomplete"
                      className="tap k-squish"
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        flex: 'none',
                        border: '2px solid var(--acc, #A8C7FA)',
                        background: 'var(--acc, #A8C7FA)',
                        color: '#040C1A',
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Icon name="check" size={12} color="#040C1A" />
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13.5,
                          fontWeight: 500,
                          lineHeight: 1.35,
                          color: 'var(--tx3)',
                          textDecoration: 'line-through',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.title}
                      </span>
                      {l && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 2, background: l.color }} />
                          <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{l.name}</span>
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          A.removeWithUndo(t);
                        }}
                        className="hov k-squish"
                        title="Delete task"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          display: 'grid',
                          placeItems: 'center',
                          cursor: 'pointer',
                          background: 'transparent',
                          border: 'none',
                        }}
                      >
                        <Icon name="trash" size={14} color="var(--tx3)" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Google Tasks Context Menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          kind="task"
          label={ctxMenu.task.title}
          accent={prefs.accent}
          dark={prefs.theme === 'dark'}
          onClose={() => setCtxMenu(null)}
          items={[
            {
              label: 'Edit details',
              icon: 'edit',
              run: () => setDetail(ctxMenu.task.id),
            },
            {
              label: 'Rename inline',
              icon: 'pen',
              run: () => setInlineEditId(ctxMenu.task.id),
            },
            {
              label: 'Set date & time',
              icon: 'clock',
              run: () => {
                setDatePickerTask({
                  task: ctxMenu.task,
                  anchorRect: { top: ctxMenu.y, left: ctxMenu.x, bottom: ctxMenu.y, right: ctxMenu.x },
                });
              },
            },
            {
              label: ctxMenu.task.stars ? 'Unstar' : 'Star',
              icon: 'star',
              run: () => A.update.mutate({ id: ctxMenu.task.id, patch: { stars: ctxMenu.task.stars ? 0 : 1 } }),
            },
            {
              label: 'Complete',
              icon: 'task',
              run: () => A.complete.mutate({ id: ctxMenu.task.id, done: true }),
            },
            {
              label: 'Delete',
              icon: 'trash',
              danger: true,
              run: () => A.removeWithUndo(ctxMenu.task),
            },
          ]}
        />
      )}

      {toolMenu && (
        <ContextMenu x={toolMenu.x} y={toolMenu.y} kind="tasks" label={toolMenu.label} items={toolMenu.items} onClose={() => setToolMenu(null)} />
      )}

      {/* Google Tasks Date & Time Picker Modal */}
      {datePickerTask && (
        <TaskDatePicker
          initialDate={datePickerTask.task.due_on}
          initialTime={
            datePickerTask.task.due_at
              ? new Date(datePickerTask.task.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
              : null
          }
          anchorRect={datePickerTask.anchorRect}
          onClose={() => setDatePickerTask(null)}
          onSave={(due_on, due_at) => {
            A.update.mutate({ id: datePickerTask.task.id, patch: { due_on, due_at } });
            toast(due_on ? 'Date updated' : 'Date cleared');
          }}
        />
      )}

      {/* Smooth Edit Sidepanel on the Right */}
      {detailTask && (
        <TaskEditSidepanel
          task={detailTask}
          lists={lists}
          phone={phone}
          onClose={() => setDetail(null)}
          onPatch={(patch) => A.update.mutate({ id: detailTask.id, patch })}
          onDelete={() => { A.removeWithUndo(detailTask); setDetail(null); }}
          onComplete={() => A.complete.mutate({ id: detailTask.id, done: !detailTask.done })}
        />
      )}
    </Page>
  );
}

function TaskRow({
  row, phone, accent, leaving,
  onCheck, onOpen, onDelete, onPatch, onStar, onOpenMenu, onOpenDatePicker, lp,
  isEditingInline, onStartInlineEdit, onEndInlineEdit,
}: {
  row: Row;
  phone: boolean;
  accent: string;
  leaving: boolean;
  onCheck: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onPatch: (patch: Partial<Task>) => void;
  onStar: (v: number) => void;
  onOpenMenu: (x: number, y: number) => void;
  onOpenDatePicker: (anchorRect: { top: number; left: number; bottom: number; right: number } | null) => void;
  lp: ReturnType<typeof useLongPress>;
  isEditingInline?: boolean;
  onStartInlineEdit?: () => void;
  onEndInlineEdit?: () => void;
}) {
  const tags = usePrefs().prefs.tags ?? [];
  const [localEditing, setLocalEditing] = useState(false);
  const editing = isEditingInline || localEditing;
  const [titleVal, setTitleVal] = useState(row.task.title);

  useEffect(() => {
    if (!editing) {
      setTitleVal(row.task.title);
    }
  }, [row.task.title, editing]);

  const handleCommitEdit = () => {
    setLocalEditing(false);
    onEndInlineEdit?.();
    const trimmed = titleVal.trim();
    if (trimmed && trimmed !== row.task.title) {
      onPatch({ title: trimmed });
      toast(`Renamed to “${trimmed}”`);
    } else {
      setTitleVal(row.task.title);
    }
  };

  const alert = getTaskAlert(row.task);
  const alertClass = alert ? `task-alert-${alert.tier}` : '';

  return (
    <div className={leaving ? 'leaving' : ''} style={{ position: 'relative' }}>
      <SwipeableRow
        disabled={editing}
        onSwipeRight={onCheck}
        onSwipeLeft={onDelete}
        rightActionIcon="check"
        rightActionColor="var(--pal-mint)"
        leftActionIcon="trash"
        leftActionColor="var(--pal-coral)"
      >
        <div
          className={`google-task-row ${alertClass}`}
          style={{ cursor: 'pointer' }}
          onContextMenu={(e) => {
            e.preventDefault();
            onOpenMenu(e.clientX, e.clientY);
          }}
          onClick={onOpen}
        >
          {/* Drag Handle on Hover */}
          <span
            className="google-task-drag"
            style={{
              display: phone ? 'none' : 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 14,
              height: 20,
              marginTop: 1,
              cursor: 'grab',
            }}
          >
            <Icon name="dots" size={13} color="var(--tx3)" />
          </span>

          {/* Direct Circular Checkbox (Google Tasks style) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCheck();
            }}
            title="Mark complete"
            className="k-squish"
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              flex: 'none',
              border: `2px solid ${PRI_COL[row.pri] || 'var(--tx3, #8E918F)'}`,
              background: 'transparent',
              marginTop: 1,
              transition: 'all .15s',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
          />

          <ObjectCoverImage targetKind="task" targetId={row.task.id} />

          {/* Title Area + Sub-details */}
          <div style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
            {editing ? (
              <input
                autoFocus
                type="text"
                value={titleVal}
                onChange={(e) => setTitleVal(e.target.value)}
                onBlur={handleCommitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCommitEdit();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setTitleVal(row.task.title);
                    setLocalEditing(false);
                    onEndInlineEdit?.();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--tx)',
                  background: 'var(--card2)',
                  border: '1px solid var(--acc)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  outline: 'none',
                }}
              />
            ) : (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setLocalEditing(true);
                  onStartInlineEdit?.();
                }}
                style={{ textAlign: 'left', cursor: 'pointer' }}
              >
                {/* Title + Alarm Emoji */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      lineHeight: 1.4,
                      color: 'var(--tx)',
                      textWrap: 'pretty',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {row.task.title}
                  </span>

                </div>

                {/* Details / Notes snippet & Structured Link Badges */}
                {(() => {
                  const p = parseTaskLinks(row.task.notes || '');
                  return (
                    <>
                      {p.cleanNotes && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: 12,
                            color: 'var(--tx3)',
                            marginTop: 2,
                            lineHeight: 1.35,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {p.cleanNotes}
                        </span>
                      )}

                      {(row.task.course || p.course || p.submissionLink || p.googleDocsLink || p.customLinks.length > 0) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
                          {(row.task.course || p.course) && (() => {
                            // A course that is one of the kept tags wears that tag's colour.
                            const tag = tags.find((t) => courseIs(row.task.course || p.course, t));
                            const tint = tag?.color ?? 'var(--pal-sky)';
                            return (
                              <span
                                title={`Course: ${row.task.course || p.course}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 7px',
                                  borderRadius: 6,
                                  background: `color-mix(in srgb, ${tint} 14%, var(--card2))`,
                                  border: `1px solid color-mix(in srgb, ${tint} 35%, transparent)`,
                                  color: tag ? 'var(--tx)' : 'var(--pal-sky)',
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                }}
                              >
                                <Icon name={tag ? 'tag' : 'book'} size={10} color={tint} />
                                <span>{row.task.course || p.course}</span>
                              </span>
                            );
                          })()}

                          {p.submissionLink && (
                            <a
                              href={p.submissionLink.startsWith('http') ? p.submissionLink : `https://${p.submissionLink}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`Submission: ${p.submissionLink}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 7px',
                                borderRadius: 6,
                                background: 'color-mix(in srgb, var(--pal-coral) 14%, var(--card2))',
                                border: '1px solid color-mix(in srgb, var(--pal-coral) 35%, transparent)',
                                color: 'var(--pal-coral)',
                                fontSize: 10.5,
                                fontWeight: 700,
                                textDecoration: 'none',
                              }}
                            >
                              <Icon name="send" size={10} color="var(--pal-coral)" />
                              <span>Submission</span>
                            </a>
                          )}

                          {p.googleDocsLink && (
                            <a
                              href={p.googleDocsLink.startsWith('http') ? p.googleDocsLink : `https://${p.googleDocsLink}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`Google Docs: ${p.googleDocsLink}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 7px',
                                borderRadius: 6,
                                background: 'color-mix(in srgb, var(--pal-sky) 14%, var(--card2))',
                                border: '1px solid color-mix(in srgb, var(--pal-sky) 35%, transparent)',
                                color: 'var(--pal-sky)',
                                fontSize: 10.5,
                                fontWeight: 700,
                                textDecoration: 'none',
                              }}
                            >
                              <Icon name="book" size={10} color="var(--pal-sky)" />
                              <span>Google Docs</span>
                            </a>
                          )}

                          {p.customLinks.map((cl, i) => (
                            <a
                              key={cl.id || i}
                              href={cl.url.startsWith('http') ? cl.url : `https://${cl.url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`${cl.label}: ${cl.url}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 7px',
                                borderRadius: 6,
                                background: 'color-mix(in srgb, var(--pal-mint) 14%, var(--card2))',
                                border: '1px solid color-mix(in srgb, var(--pal-mint) 35%, transparent)',
                                color: 'var(--pal-mint)',
                                fontSize: 10.5,
                                fontWeight: 700,
                                textDecoration: 'none',
                              }}
                            >
                              <Icon name="link" size={10} color="var(--pal-mint)" />
                              <span>{cl.label || 'Link'}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}

                {row.task.due_on && <div className="task-deadline-row"><button className="task-deadline" data-overdue={!!row.late || !!row.task.due_at && new Date(row.task.due_at).getTime() < Date.now()} title="Change date/time" onClick={e=>{e.stopPropagation();onOpenDatePicker(e.currentTarget.getBoundingClientRect());}}><Icon name="clock" size={13}/><span>{row.late ? row.late+'d overdue' : row.dueLabel || row.task.due_on}{!row.late && row.task.due_at ? ' · '+new Date(row.task.due_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}) : ''}</span></button><button className="task-clear-date" aria-label="Clear date" onClick={e=>{e.stopPropagation();onPatch({due_on:null,due_at:null});toast('Date cleared');}}><Icon name="close" size={12}/></button></div>}
              </div>
            )}
          </div>

          {/* Right Action Controls (Google Tasks 3-dots and 5 Stars Rating) */}
          <div
            className="google-task-actions"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flex: 'none',
            }}
          >
            {/* 5-Star Rating Control */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0,
                marginRight: 2,
              }}
            >
              {[1, 2, 3, 4, 5].map((s) => {
                const filled = (row.task.stars || 0) >= s;
                return (
                  <button
                    key={s}
                    onClick={(e) => {
                      e.stopPropagation();
                      onStar(row.task.stars === s ? 0 : s);
                    }}
                    title={`${s} star${s > 1 ? 's' : ''}`}
                    className="hov k-squish"
                    style={{
                      width: 19,
                      height: 24,
                      display: 'grid',
                      placeItems: 'center',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13.5,
                        color: filled ? 'var(--task-star)' : 'var(--tx3)',
                        transition: 'color .15s ease, transform .15s ease',
                      }}
                    >
                      <Icon name="star" size={14}/>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 3-dots Menu Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                onOpenMenu(rect.left, rect.bottom);
              }}
              title="Task options"
              className="hov k-squish"
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Icon name="dots" size={14} color="var(--tx3)" />
            </button>
          </div>
        </div>
      </SwipeableRow>
    </div>
  );
}

const KICKER: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '.11em',
  textTransform: 'uppercase', color: 'var(--tx3)',
};

const CHIP = (on: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 9,
  fontSize: 11.5, fontWeight: 700, minHeight: 32,
  border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
  background: on ? 'var(--hov)' : 'transparent',
  color: on ? 'var(--accTx)' : 'var(--tx2)',
});

function TaskEditSidepanel({
  task, lists, phone, onClose, onPatch, onDelete, onComplete,
}: {
  task: Task;
  lists: List[];
  phone: boolean;
  onClose: () => void;
  onPatch: (p: Partial<Task>) => void;
  onDelete: () => void;
  onComplete: () => void;
}) {
  const { prefs } = usePrefs();
  /**
   * Under L5 the panel pushes rather than overlays, which is the layout's whole
   * depth mechanism. Registering the width lets Shell inset the column by it;
   * without that the panel would still be sitting on top of the rows.
   */
  const pushes = prefs.shellLayout === 'L5' && !phone;
  useRegisterSidePanel(pushes ? 440 : 0);

  const initialParsed = parseTaskLinks(task.notes ?? '');
  const [title, setTitle] = useState(task.title);
  const [captureCover, setCaptureCover] = useState(false);
  const [course, setCourse] = useState(task.course || initialParsed.course || '');
  const [cleanNotes, setCleanNotes] = useState(initialParsed.cleanNotes);
  const [submissionLink, setSubmissionLink] = useState(initialParsed.submissionLink);
  const [googleDocsLink, setGoogleDocsLink] = useState(initialParsed.googleDocsLink);
  const [customLinks, setCustomLinks] = useState<CustomTaskLink[]>(initialParsed.customLinks);

  const prevTaskIdRef = useRef(task.id);
  const titleRef = useRef(title);
  const courseRef = useRef(course);
  const cleanNotesRef = useRef(cleanNotes);
  const submissionLinkRef = useRef(submissionLink);
  const googleDocsLinkRef = useRef(googleDocsLink);
  const customLinksRef = useRef(customLinks);

  titleRef.current = title;
  courseRef.current = course;
  cleanNotesRef.current = cleanNotes;
  submissionLinkRef.current = submissionLink;
  googleDocsLinkRef.current = googleDocsLink;
  customLinksRef.current = customLinks;

  const stars = task.stars || 0;
  const alert = getTaskAlert(task);

  // Sync only when opening a different task
  useEffect(() => {
    if (prevTaskIdRef.current !== task.id) {
      prevTaskIdRef.current = task.id;
      const p = parseTaskLinks(task.notes ?? '');
      setTitle(task.title);
      setCourse(task.course || p.course || '');
      setCleanNotes(p.cleanNotes);
      setSubmissionLink(p.submissionLink);
      setGoogleDocsLink(p.googleDocsLink);
      setCustomLinks(p.customLinks);
    }
  }, [task.id]);

  const patchWithLatest = useCallback((extraPatch: Partial<Task> = {}) => {
    const currentTitle = titleRef.current.trim();
    const currentCourse = courseRef.current.trim();
    const finalNotes = serializeTaskWithLinks(
      cleanNotesRef.current,
      submissionLinkRef.current,
      googleDocsLinkRef.current,
      customLinksRef.current,
      currentCourse
    );
    const combined: Partial<Task> = { ...extraPatch };

    if (currentTitle && currentTitle !== task.title) {
      combined.title = currentTitle;
    }
    if (finalNotes !== (task.notes ?? '')) {
      combined.notes = finalNotes;
    }

    if (Object.keys(combined).length > 0) {
      onPatch(combined);
    }
  }, [task.title, task.notes, onPatch]);

  // Debounced auto-save for title, course, notes, and links
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = title.trim();
      const currentCourse = course.trim();
      const finalNotes = serializeTaskWithLinks(
        cleanNotes,
        submissionLink,
        googleDocsLink,
        customLinks,
        currentCourse
      );
      const needsTitleUpdate = trimmed && trimmed !== task.title;
      const needsNotesUpdate = finalNotes !== (task.notes ?? '');
      if (needsTitleUpdate || needsNotesUpdate) {
        onPatch({
          ...(needsTitleUpdate ? { title: trimmed } : {}),
          ...(needsNotesUpdate ? { notes: finalNotes } : {}),
        });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [title, course, cleanNotes, submissionLink, googleDocsLink, customLinks, task.title, task.notes, onPatch]);

  const handleClose = useCallback(() => {
    patchWithLatest();
    onClose();
  }, [patchWithLatest, onClose]);
  useOverlayBack(true, handleClose);

  // The shared overlay stack owns Escape and mouse Back. A second listener
  // here also closed the task underneath its date picker or cover camera.

  const dues: { n: string; v: string | null }[] = [
    { n: 'Today', v: new Date().toISOString().slice(0, 10) },
    { n: 'Tomorrow', v: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) },
    { n: 'Next week', v: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) },
    { n: 'Clear', v: null },
  ];

  const priorities: { v: 'high' | 'med' | 'low' | null; n: string; c: string }[] = [
    { v: 'high', n: 'High', c: PAL.coral },
    { v: 'med', n: 'Medium', c: PAL.amber },
    { v: 'low', n: 'Low', c: PAL.mint },
    { v: null, n: 'None', c: 'var(--tx3)' },
  ];

  const getTimeVal = (due_at: string | null | undefined): string => {
    if (!due_at) return '';
    const d = new Date(due_at);
    if (isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  if (typeof document === 'undefined') return null;

  return createPortal((
    <>
      {/* Backdrop. A pushed panel has none: the page beside it is still in
          use, and dimming content the layout deliberately kept visible would
          say the opposite. */}
      {!pushes && (
        <div
          onClick={handleClose}
          className="fade"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.44)',
            backdropFilter: 'blur(2px)',
            zIndex: 49,
          }}
        />
      )}

      {/* Edit Sidepanel on Right */}
      <div
        className="edit-sidepanel"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: phone ? '100%' : '440px',
          maxWidth: '100vw',
          zIndex: 50,
          background: 'var(--card)',
          borderLeft: '1px solid var(--line2)',
          boxShadow: 'var(--shl, 0 18px 48px rgba(0,0,0,0.6))',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          padding: '24px 24px 30px',
        }}
      >
        {/* Header Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={onComplete}
              className="k-squish"
              title={task.done ? 'Mark incomplete' : 'Mark completed'}
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: `2px solid ${task.done ? 'var(--pal-mint)' : 'var(--acc)'}`,
                background: task.done ? 'var(--pal-mint)' : 'transparent',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {task.done && <Icon name="check" size={14} color="#040C1A" />}
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)' }}>
              Edit Task
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={onDelete}
              className="hov k-squish"
              title="Delete task"
              style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--card2)', border: '1px solid var(--line2)', cursor: 'pointer' }}
            >
              <Icon name="trash" size={15} color="var(--pal-coral)" />
            </button>
            <button
              onClick={handleClose}
              className="hov k-squish"
              title="Close sidepanel"
              style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--card2)', border: '1px solid var(--line2)', cursor: 'pointer' }}
            >
              <Icon name="close" size={15} color="var(--tx2)" />
            </button>
          </div>
        </div>

        {/* Live Countdown Timer Card — its own timer, so the seconds do not
            re-render the panel's title field while you are typing in it. */}
        <DeadlineCard task={task} alert={alert} />

        <button type="button" className="hov" onClick={() => setCaptureCover(true)} style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: 14, borderRadius: 14, background: 'var(--card2)', marginBottom: 20, textAlign: 'left', border: '1px solid var(--line2)' }}>
          <ObjectCoverImage targetKind="task" targetId={task.id} style={{ width: 64, height: 64 }} />
          <span style={{ flex: 1 }}><strong style={{ display: 'block', fontSize: 14 }}>Give this task a cover</strong><span style={{ display: 'block', color: 'var(--tx3)', fontSize: 12, marginTop: 4 }}>Turn a photo into something you recognise.</span></span>
          <Icon name="image" size={20} />
        </button>

        {/* Title Input */}
        <div style={{ marginBottom: 18 }}>
          <div style={KICKER}>Title</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => patchWithLatest()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                patchWithLatest();
                (e.target as HTMLElement).blur();
              }
            }}
            placeholder="Task title"
            style={{
              width: '100%',
              marginTop: 6,
              padding: '11px 14px',
              borderRadius: 12,
              border: '1px solid var(--line2)',
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--tx)',
              background: 'var(--card2)',
              outline: 'none',
              transition: 'border-color .15s ease',
            }}
          />
        </div>

        {/* Course / Subject */}
        <div style={{ marginBottom: 18 }}>
          <div style={KICKER}>Course / Subject</div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 6 }}>
            <input
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              onBlur={() => patchWithLatest()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  patchWithLatest();
                  (e.target as HTMLElement).blur();
                }
              }}
              placeholder="e.g. CS 101, MATH 20, Physics…"
              style={{
                width: '100%',
                padding: '11px 14px 11px 36px',
                borderRadius: 12,
                border: '1px solid var(--line2)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--tx)',
                background: 'var(--card2)',
                outline: 'none',
                transition: 'border-color .15s ease',
              }}
            />
            <span style={{ position: 'absolute', left: 12, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              <Icon name="book" size={14} color="var(--pal-sky)" />
            </span>
            {course && (
              <button
                type="button"
                onClick={() => {
                  setCourse('');
                  patchWithLatest({ course: null });
                }}
                className="k-squish"
                title="Clear course"
                style={{
                  position: 'absolute', right: 10, width: 22, height: 22, borderRadius: 6,
                  display: 'grid', placeItems: 'center', background: 'var(--card)',
                  border: '1px solid var(--line2)', color: 'var(--tx3)', cursor: 'pointer',
                }}
              >
                <Icon name="close" size={11} color="var(--tx3)" />
              </button>
            )}
          </div>
          {/* The courses and tags kept on the notebook library, one tap each. */}
          {(prefs.tags ?? []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {(prefs.tags ?? []).map((tag) => {
                const on = courseIs(course, tag);
                return (
                  <button key={tag.id} type="button" aria-pressed={on} style={CHIP(on)}
                    onClick={() => {
                      const next = on ? '' : tag.name;
                      // patchWithLatest reads the ref, and state only reaches it on the next render.
                      courseRef.current = next;
                      setCourse(next);
                      patchWithLatest();
                    }}>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color }} />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Description / Notes */}
        <div style={{ marginBottom: 18 }}>
          <div style={KICKER}>Notes / Description</div>
          <textarea
            value={cleanNotes}
            onChange={(e) => setCleanNotes(e.target.value)}
            onBlur={() => patchWithLatest()}
            rows={3}
            placeholder="Add details, instructions, or notes…"
            style={{
              width: '100%',
              marginTop: 6,
              padding: '11px 14px',
              borderRadius: 12,
              border: '1px solid var(--line2)',
              background: 'var(--card2)',
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--tx)',
              resize: 'vertical',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
        </div>

        {/* Links Section */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={KICKER}>Task Links & Submissions</div>
            <button
              type="button"
              onClick={() => setCustomLinks([...customLinks, { id: crypto.randomUUID(), label: 'Link', url: '' }])}
              className="k-squish"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'none',
                border: 'none',
                color: 'var(--pal-sky)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Icon name="plus" size={11} color="var(--pal-sky)" />
              <span>Add Another Link</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* 1. Submission Link */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 124,
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                  color: submissionLink ? 'var(--pal-coral)' : 'var(--tx3)',
                }}
              >
                <Icon name="send" size={13} color={submissionLink ? 'var(--pal-coral)' : 'var(--tx3)'} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Submission</span>
              </div>
              <input
                type="url"
                value={submissionLink}
                onChange={(e) => setSubmissionLink(e.target.value)}
                onBlur={() => patchWithLatest()}
                placeholder="Canvas, Turnitin, or portal link"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '9px 12px',
                  borderRadius: 9,
                  border: '1px solid var(--line2)',
                  background: 'var(--card2)',
                  color: 'var(--tx)',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
              {submissionLink && (
                <a
                  href={submissionLink.startsWith('http') ? submissionLink : `https://${submissionLink}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hov k-squish"
                  title="Open Submission Link"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: '1px solid var(--line2)',
                    background: 'var(--card2)',
                    display: 'grid',
                    placeItems: 'center',
                    flex: 'none',
                    color: 'var(--pal-coral)',
                    textDecoration: 'none',
                  }}
                >
                  <Icon name="link" size={13} color="var(--pal-coral)" />
                </a>
              )}
            </div>

            {/* 2. Google Docs Link */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 124,
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                  color: googleDocsLink ? 'var(--pal-sky)' : 'var(--tx3)',
                }}
              >
                <Icon name="book" size={13} color={googleDocsLink ? 'var(--pal-sky)' : 'var(--tx3)'} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Google Docs</span>
              </div>
              <input
                type="url"
                value={googleDocsLink}
                onChange={(e) => setGoogleDocsLink(e.target.value)}
                onBlur={() => patchWithLatest()}
                placeholder="docs.google.com/… or Drive link"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '9px 12px',
                  borderRadius: 9,
                  border: '1px solid var(--line2)',
                  background: 'var(--card2)',
                  color: 'var(--tx)',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
              {googleDocsLink && (
                <a
                  href={googleDocsLink.startsWith('http') ? googleDocsLink : `https://${googleDocsLink}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hov k-squish"
                  title="Open Google Docs Link"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: '1px solid var(--line2)',
                    background: 'var(--card2)',
                    display: 'grid',
                    placeItems: 'center',
                    flex: 'none',
                    color: 'var(--pal-sky)',
                    textDecoration: 'none',
                  }}
                >
                  <Icon name="link" size={13} color="var(--pal-sky)" />
                </a>
              )}
            </div>

            {/* 3. Multiple Custom Links */}
            {customLinks.map((cl, idx) => (
              <div key={cl.id || idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  value={cl.label}
                  onChange={(e) => {
                    const next = [...customLinks];
                    next[idx] = { ...next[idx], label: e.target.value };
                    setCustomLinks(next);
                  }}
                  onBlur={() => patchWithLatest()}
                  placeholder="Label"
                  style={{
                    width: 124,
                    flex: 'none',
                    padding: '9px 10px',
                    borderRadius: 9,
                    border: '1px solid var(--line2)',
                    background: 'var(--card2)',
                    color: 'var(--tx)',
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    outline: 'none',
                  }}
                />
                <input
                  type="url"
                  value={cl.url}
                  onChange={(e) => {
                    const next = [...customLinks];
                    next[idx] = { ...next[idx], url: e.target.value };
                    setCustomLinks(next);
                  }}
                  onBlur={() => patchWithLatest()}
                  placeholder="https://…"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '9px 12px',
                    borderRadius: 9,
                    border: '1px solid var(--line2)',
                    background: 'var(--card2)',
                    color: 'var(--tx)',
                    fontSize: 12,
                    outline: 'none',
                  }}
                />
                {cl.url && (
                  <a
                    href={cl.url.startsWith('http') ? cl.url : `https://${cl.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hov k-squish"
                    title={`Open ${cl.label || 'Link'}`}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      border: '1px solid var(--line2)',
                      background: 'var(--card2)',
                      display: 'grid',
                      placeItems: 'center',
                      flex: 'none',
                      color: 'var(--pal-mint)',
                      textDecoration: 'none',
                    }}
                  >
                    <Icon name="link" size={13} color="var(--pal-mint)" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const next = customLinks.filter((_, i) => i !== idx);
                    setCustomLinks(next);
                    patchWithLatest();
                  }}
                  className="hov k-squish"
                  title="Remove link"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: '1px solid var(--line2)',
                    background: 'var(--card2)',
                    color: 'var(--tx3)',
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                    flex: 'none',
                  }}
                >
                  <Icon name="close" size={13} color="var(--tx3)" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Due Date & Time */}
        <div style={{ marginBottom: 18 }}>
          <div style={KICKER}>Due Date & Time</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
            {dues.map((d) => (
              <button
                key={d.n}
                onClick={() => {
                  if (!d.v) {
                    patchWithLatest({ due_on: null, due_at: null });
                  } else {
                    let due_at: string | null = null;
                    if (task.due_at) {
                      const oldD = new Date(task.due_at);
                      if (!isNaN(oldD.getTime())) {
                        const target = new Date(`${d.v}T00:00:00`);
                        target.setHours(oldD.getHours(), oldD.getMinutes(), 0, 0);
                        due_at = target.toISOString();
                      }
                    }
                    patchWithLatest({ due_on: d.v, due_at });
                  }
                }}
                style={CHIP(task.due_on === d.v)}
              >
                {d.n}
              </button>
            ))}
            <input
              type="date"
              value={task.due_on ?? ''}
              onChange={(e) => {
                const val = e.target.value || null;
                if (!val) {
                  patchWithLatest({ due_on: null, due_at: null });
                } else {
                  let due_at: string | null = null;
                  if (task.due_at) {
                    const oldD = new Date(task.due_at);
                    if (!isNaN(oldD.getTime())) {
                      const target = new Date(`${val}T00:00:00`);
                      target.setHours(oldD.getHours(), oldD.getMinutes(), 0, 0);
                      due_at = target.toISOString();
                    }
                  }
                  patchWithLatest({ due_on: val, due_at });
                }
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--line2)',
                background: 'var(--card2)',
                color: 'var(--tx)',
                fontSize: 12,
                fontWeight: 600,
              }}
            />
            {task.due_on && (
              <input
                type="time"
                value={getTimeVal(task.due_at)}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    patchWithLatest({ due_at: null });
                  } else {
                    const [hh, mm] = val.split(':').map(Number);
                    const ymd = task.due_on || new Date().toISOString().slice(0, 10);
                    const d = new Date(`${ymd}T00:00:00`);
                    d.setHours(hh, mm, 0, 0);
                    patchWithLatest({ due_at: d.toISOString(), due_on: ymd });
                  }
                }}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--line2)',
                  background: 'var(--card2)',
                  color: 'var(--tx)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              />
            )}
          </div>
        </div>

        {/* Priority */}
        <div style={{ marginBottom: 18 }}>
          <div style={KICKER}>Priority</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {priorities.map((p) => (
              <button
                key={p.n}
                onClick={() => patchWithLatest({ priority: p.v })}
                style={CHIP(task.priority === p.v || (!task.priority && p.v === null))}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: p.c }} />
                {p.n}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {lists.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={KICKER}>List</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {lists.map((l) => (
                <button key={l.id} onClick={() => patchWithLatest({ list_id: l.id })} style={CHIP(task.list_id === l.id)}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Rating */}
        <div style={{ marginBottom: 24 }}>
          <div style={KICKER}>Rating</div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onClick={() => patchWithLatest({ stars: stars === v ? 0 : v })}
                title={`${v} ${v === 1 ? 'star' : 'stars'}`}
                className="hov k-squish"
                style={{
                  fontSize: 20,
                  lineHeight: 1,
                  padding: '2px 4px',
                  color: v <= stars ? 'var(--pal-amber, #F9AB00)' : 'var(--line2)',
                  transition: 'color .16s, transform .15s',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                ★
              </button>
            ))}
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: 'var(--tx3)' }}>
              {stars ? `${stars} of 5 stars` : 'Not rated'}
            </span>
          </span>
        </div>

        {/* Done / Save Footer */}
        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--line2)' }}>
          <button
            onClick={handleClose}
            className="acc k-squish"
            style={{
              width: '100%',
              padding: '12px 24px',
              borderRadius: 12,
              background: 'var(--acc)',
              color: 'var(--ink)',
              fontSize: 14,
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              boxShadow: 'var(--sh)',
            }}
          >
            Done
          </button>
        </div>
      </div>
      {captureCover && <CoverCapture target={{ kind: 'task', id: task.id, title: title || task.title }} onClose={() => setCaptureCover(false)} />}
    </>
  ), document.body);
}
