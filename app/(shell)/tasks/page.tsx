'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { TasksSkeleton } from '@/components/Skeleton';
import { Page } from '@/components/Page';
import { TaskComposer } from '@/components/TaskComposer';
import { K, PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useRegisterSidePanel } from '@/lib/sidePanel';
import { TabRail } from '@/components/TabRail';
import { TaskTable } from '@/components/tasks/TaskTable';
import { useLayout } from '@/lib/useLayout';
import { useLists, useTasks, useTaskActions, getTaskAlert, formatTaskCountdown, parseTaskLinks, serializeTaskWithLinks, type Task, type List, type CustomTaskLink } from '@/lib/tasks';
import { useLongPress } from '@/lib/useLongPress';
import { toast } from '@/lib/toast';
import { ContextMenu } from '@/components/ContextMenu';
import { SwipeableRow } from '@/components/SwipeableRow';

import { TaskDatePicker } from '@/components/TaskDatePicker';
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

/** High sorts above Med above Low. */
const PRI_RANK: Record<Row['pri'], number> = { High: 3, Med: 2, Low: 1 };

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

export default function TasksPage() {
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const { data: lists = [] } = useLists();
  const { data: tasks = [], isPending } = useTasks();
  const A = useTaskActions();

  // 1-second interval ticker for live real-time countdowns
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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
  const [order, setOrder] = useState<'Due' | 'Priority' | 'Stars' | 'Title'>('Due');
  const view = prefs.taskView ?? 'groups';
  const [showCompleted, setShowCompleted] = useState(false);

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
  const completedTasks = tasks.filter((t) => t.done);

  const rows: Row[] = tasks
    .filter((t) => !t.done)
    .map((t) => {
      const l = t.list_id ? byList.get(t.list_id) : undefined;
      const { late, label } = dueInfo(t.due_on);
      return {
        task: t,
        listName: l?.name ?? 'Inbox',
        listColor: l?.color ?? PAL.indigo,
        late,
        dueLabel: label,
        pri: priOf(t.priority),
      };
    });

  const ordered = (items: Row[]) => [...items].sort((a, b) =>
    order === 'Priority' ? PRI_RANK[b.pri] - PRI_RANK[a.pri]
      : order === 'Stars' ? b.task.stars - a.task.stars
      : order === 'Title' ? a.task.title.localeCompare(b.task.title)
      : (a.task.due_on ?? '9999').localeCompare(b.task.due_on ?? '9999'));

  /**
   * Which buckets the rows fall into is the view. Groups asks "when", board
   * asks "where", list asks nothing and just sorts — and all three render with
   * the same row, so a swipe or an inline edit behaves identically in each.
   * Only the table needs its own markup, and it says why in its own file.
   */
  type Group = { n: string; items: Row[]; tint: string; note: string; empty: string };
  const groups: Group[] = useMemo(() => {
    if (view === 'list') {
      return [{
        n: 'All open', items: ordered(rows), tint: PAL.indigo,
        note: `By ${order.toLowerCase()}`, empty: 'Nothing open.',
      }];
    }
    if (view === 'board') {
      const cols = lists.map((l) => ({
        n: l.name, tint: l.color || PAL.indigo,
        items: ordered(rows.filter((r) => r.task.list_id === l.id)),
        note: `By ${order.toLowerCase()}`, empty: 'Empty.',
      }));
      const loose = ordered(rows.filter((r) => !r.task.list_id));
      // Tasks with no list still have to be somewhere, or the board quietly
      // shows fewer tasks than the count above it claims.
      if (loose.length) cols.unshift({ n: 'Inbox', tint: PAL.indigo, items: loose, note: `By ${order.toLowerCase()}`, empty: 'Empty.' });
      return cols;
    }
    return [
      { n: 'Overdue', items: ordered(rows.filter((r) => r.late > 0)), tint: PAL.coral, note: order === 'Due' ? 'Oldest first' : `By ${order.toLowerCase()}`, empty: 'Nothing late.' },
      { n: 'Today', items: ordered(rows.filter((r) => !r.late && r.dueLabel === 'Today')), tint: PAL.amber, note: 'Due before midnight', empty: 'Nothing due today.' },
      { n: 'Upcoming', items: ordered(rows.filter((r) => !r.late && r.dueLabel !== 'Today')), tint: PAL.mint, note: 'The rest of the week', empty: 'Nothing scheduled yet.' },
    ];
    // `ordered` closes over `order`, which is in the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, rows, order, lists]);

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

  const detailTask = tasks.find((t) => t.id === detail) ?? null;

  return (
    <Page
      name="My Tasks"
      width={view === 'table' || view === 'board' ? 'wide' : 'list'}
      meta={`${rows.length} open across every list`}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TabRail
            label="Task view"
            tabs={[
              { id: 'groups', label: 'Groups', icon: 'layers' },
              { id: 'list', label: 'List', icon: 'list' },
              { id: 'table', label: 'Table', icon: 'grid' },
              { id: 'board', label: 'Board', icon: 'proj' },
            ] as const}
            value={view}
            onChange={(v) => void update({ taskView: v })} />
          <button
            className="hov k-squish"
            title={`Sorted by ${order.toLowerCase()} — click to change`}
            aria-label={`Sorted by ${order.toLowerCase()}. Change sort.`}
            onClick={() => {
              const next = { Due: 'Priority', Priority: 'Stars', Stars: 'Title', Title: 'Due' } as const;
              setOrder(next[order]);
              toast(`Sorted by ${next[order].toLowerCase()}`);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line2)', flex: 'none', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)' }}
          >
            <Icon name="sort" size={15} color="var(--tx2)" />{order}
          </button>
        </div>
      }
    >

      {/* Google Tasks Style Inline Quick Composer */}
      <TaskComposer
        lists={lists}
        defaultListId={lists[0]?.id ?? null}
        onCreate={(t) => { A.create.mutate(t); toast(`Added “${t.title}”`); }} />

      {/* Loading Skeleton */}
      {isPending && <TasksSkeleton tints={[PAL.coral, PAL.amber, PAL.mint]} />}

      {/* The table is the one view that is not a stack of buckets. */}
      {!isPending && view === 'table' && (
        <TaskTable
          rows={rows} phone={phone}
          onOpen={(t) => setDetail(t.id)}
          onCheck={(t) => A.complete.mutate({ id: t.id, done: true })} />
      )}

      {/* Task Groups. Board is the same buckets turned on their side, so the
          columns scroll sideways and each one keeps its own height. */}
      <div data-tour="tasks-columns" className={view === 'board' ? 'hbar' : undefined}
        style={view === 'board' ? {
          display: 'flex', gap: 12, alignItems: 'flex-start',
          overflowX: 'auto', overflowY: 'hidden', paddingBottom: 6,
        } : undefined}>
        {!isPending && view !== 'table' && groups.map((g) => (
          <div key={g.n}
            style={{
              background: 'var(--card, #1E1F22)', borderRadius: 20, padding: '14px 14px 6px', marginTop: 14,
              boxShadow: 'var(--sh)', border: `1px solid color-mix(in srgb, ${g.tint} 30%, transparent)`,
              ...(view === 'board'
                // 300px left the title about 120px once the row had reserved
                // its checkbox, stars and due chip, and "problem set 4" wrapped
                // one character at a time. The row needs ~200px to read.
                ? { flex: '0 0 360px', width: 360, marginTop: 14, alignSelf: 'stretch' }
                : null),
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8, padding: '0 4px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: g.tint }} />
              <span style={{
                fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase',
                color: prefs.theme === 'dark'
                  ? `color-mix(in srgb, ${g.tint} 100%, transparent)`
                  : `color-mix(in srgb, ${g.tint} 66%, #201E1D)`,
              }}>
                {g.n}
              </span>
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
                nowMs={nowMs}
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
          nowMs={nowMs}
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
  row, nowMs, phone, accent, leaving,
  onCheck, onOpen, onDelete, onPatch, onStar, onOpenMenu, onOpenDatePicker, lp,
  isEditingInline, onStartInlineEdit, onEndInlineEdit,
}: {
  row: Row;
  nowMs: number;
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
  const [localEditing, setLocalEditing] = useState(false);
  const editing = isEditingInline || localEditing;
  const [titleVal, setTitleVal] = useState(row.task.title);

  useEffect(() => {
    setTitleVal(row.task.title);
  }, [row.task.title]);

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
  const countdown = formatTaskCountdown(row.task, nowMs);

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
                  {alert && (
                    <span
                      className="task-alarm-emoji"
                      title={`${alert.label} (${alert.tier} deadline alert)`}
                      style={{
                        fontSize: 14,
                        lineHeight: 1,
                        cursor: 'help',
                        userSelect: 'none',
                      }}
                    >
                      {alert.emoji}
                    </span>
                  )}
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

                      {(p.submissionLink || p.googleDocsLink || p.customLinks.length > 0) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
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

                {/* Date / Time Pill Chip */}
                {row.task.due_on && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', marginTop: 5 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDatePicker(e.currentTarget.getBoundingClientRect());
                      }}
                      className="k-squish"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '2px 8px',
                        borderRadius: 14,
                        background: alert?.tier === 'red'
                          ? 'color-mix(in srgb, var(--pal-coral) 20%, transparent)'
                          : alert?.tier === 'orange'
                          ? 'color-mix(in srgb, #FF9A3C 18%, transparent)'
                          : row.late
                          ? 'color-mix(in srgb, var(--pal-coral) 16%, transparent)'
                          : 'var(--card2, #282A2C)',
                        border: `1px solid ${
                          alert?.tier === 'red' || row.late
                            ? 'var(--pal-coral)'
                            : alert?.tier === 'orange'
                            ? '#FF9A3C'
                            : alert?.tier === 'yellow'
                            ? 'var(--pal-amber)'
                            : 'var(--line2)'
                        }`,
                        color: alert?.tier === 'red' || row.late
                          ? 'var(--pal-coral)'
                          : alert?.tier === 'orange'
                          ? '#FFA54C'
                          : alert?.tier === 'yellow'
                          ? 'var(--pal-amber)'
                          : 'var(--tx2)',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      title="Change date/time"
                    >
                      <Icon
                        name="clock"
                        size={11}
                        color={
                          alert?.tier === 'red' || row.late
                            ? 'var(--pal-coral)'
                            : alert?.tier === 'orange'
                            ? '#FFA54C'
                            : alert?.tier === 'yellow'
                            ? 'var(--pal-amber)'
                            : 'var(--tx3)'
                        }
                      />
                      <span>{row.dueLabel || row.task.due_on}</span>
                      {countdown && (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            padding: '1px 5px',
                            borderRadius: 6,
                            background: countdown.isOverdue || alert?.tier === 'red'
                              ? 'color-mix(in srgb, var(--pal-coral) 25%, transparent)'
                              : alert?.tier === 'orange'
                              ? 'color-mix(in srgb, #FF9A3C 25%, transparent)'
                              : 'color-mix(in srgb, var(--pal-amber) 20%, transparent)',
                            marginLeft: 4,
                          }}
                        >
                          ⏱️ {countdown.text}
                        </span>
                      )}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          onPatch({ due_on: null, due_at: null });
                          toast('Date cleared');
                        }}
                        title="Clear date"
                        style={{
                          marginLeft: 2,
                          fontSize: 12,
                          opacity: 0.6,
                          padding: '0 2px',
                          cursor: 'pointer',
                        }}
                      >
                        ×
                      </span>
                    </button>
                  </div>
                )}
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
                        color: filled ? 'var(--pal-amber, #F9AB00)' : 'var(--line2, #44474E)',
                        transition: 'color .15s ease, transform .15s ease',
                      }}
                    >
                      ★
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
  task, lists, nowMs, phone, onClose, onPatch, onDelete, onComplete,
}: {
  task: Task;
  lists: List[];
  nowMs: number;
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
  const [cleanNotes, setCleanNotes] = useState(initialParsed.cleanNotes);
  const [submissionLink, setSubmissionLink] = useState(initialParsed.submissionLink);
  const [googleDocsLink, setGoogleDocsLink] = useState(initialParsed.googleDocsLink);
  const [customLinks, setCustomLinks] = useState<CustomTaskLink[]>(initialParsed.customLinks);

  const prevTaskIdRef = useRef(task.id);
  const titleRef = useRef(title);
  const cleanNotesRef = useRef(cleanNotes);
  const submissionLinkRef = useRef(submissionLink);
  const googleDocsLinkRef = useRef(googleDocsLink);
  const customLinksRef = useRef(customLinks);

  titleRef.current = title;
  cleanNotesRef.current = cleanNotes;
  submissionLinkRef.current = submissionLink;
  googleDocsLinkRef.current = googleDocsLink;
  customLinksRef.current = customLinks;

  const stars = task.stars || 0;
  const alert = getTaskAlert(task);
  const countdown = formatTaskCountdown(task, nowMs);

  // Sync only when opening a different task
  useEffect(() => {
    if (prevTaskIdRef.current !== task.id) {
      prevTaskIdRef.current = task.id;
      const p = parseTaskLinks(task.notes ?? '');
      setTitle(task.title);
      setCleanNotes(p.cleanNotes);
      setSubmissionLink(p.submissionLink);
      setGoogleDocsLink(p.googleDocsLink);
      setCustomLinks(p.customLinks);
    }
  }, [task.id, task.title, task.notes]);

  const patchWithLatest = useCallback((extraPatch: Partial<Task> = {}) => {
    const currentTitle = titleRef.current.trim();
    const finalNotes = serializeTaskWithLinks(
      cleanNotesRef.current,
      submissionLinkRef.current,
      googleDocsLinkRef.current,
      customLinksRef.current
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

  // Debounced auto-save for title, notes, and links
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = title.trim();
      const finalNotes = serializeTaskWithLinks(
        cleanNotes,
        submissionLink,
        googleDocsLink,
        customLinks
      );
      const needsTitleUpdate = trimmed && trimmed !== task.title;
      const needsNotesUpdate = finalNotes !== (task.notes ?? '');
      if (needsTitleUpdate || needsNotesUpdate) {
        onPatch({
          ...(needsTitleUpdate ? { title: trimmed } : {}),
          ...(needsNotesUpdate ? { notes: finalNotes } : {}),
        });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [title, cleanNotes, submissionLink, googleDocsLink, customLinks, task.title, task.notes, onPatch]);

  const handleClose = useCallback(() => {
    patchWithLatest();
    onClose();
  }, [patchWithLatest, onClose]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

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

        {/* Live Countdown Timer Card */}
        {countdown && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderRadius: 14,
              marginBottom: 18,
              background: alert?.tier === 'red' || countdown.isOverdue
                ? 'color-mix(in srgb, var(--pal-coral) 16%, var(--card2))'
                : alert?.tier === 'orange'
                ? 'color-mix(in srgb, #FF9A3C 14%, var(--card2))'
                : 'color-mix(in srgb, var(--pal-amber) 12%, var(--card2))',
              border: `1px solid ${
                alert?.tier === 'red' || countdown.isOverdue
                  ? 'var(--pal-coral)'
                  : alert?.tier === 'orange'
                  ? '#FF9A3C'
                  : 'var(--pal-amber)'
              }`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="task-alarm-emoji" style={{ fontSize: 20 }}>
                {alert?.emoji || '⏱️'}
              </span>
              <div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    letterSpacing: '-.02em',
                    fontVariantNumeric: 'tabular-nums',
                    color: countdown.isOverdue || alert?.tier === 'red' ? 'var(--pal-coral)' : 'var(--tx)',
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
                color: countdown.isOverdue || alert?.tier === 'red' ? 'var(--pal-coral)' : 'var(--tx2)',
                border: '1px solid var(--line2)',
              }}
            >
              {alert?.label || 'Deadline'}
            </span>
          </div>
        )}

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
    </>
  ), document.body);
}
