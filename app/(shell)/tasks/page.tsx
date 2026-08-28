'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { TasksSkeleton } from '@/components/Skeleton';
import { Page } from '@/components/Page';
import { TaskComposer } from '@/components/TaskComposer';
import { K, PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useLists, useTasks, useTaskActions, getTaskAlert, type Task, type List } from '@/lib/tasks';
import { useLongPress } from '@/lib/useLongPress';
import { toast } from '@/lib/toast';
import { ContextMenu } from '@/components/ContextMenu';
import { SwipeableRow } from '@/components/SwipeableRow';

import { TaskDatePicker } from '@/components/TaskDatePicker';

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
  const { prefs } = usePrefs();
  const { data: lists = [] } = useLists();
  const { data: tasks = [], isPending } = useTasks();
  const A = useTaskActions();

  const [tsw, setTsw] = useState<{ id: string; dx: number; live: boolean } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const lp = useLongPress();
  const [order, setOrder] = useState<'Due' | 'Priority' | 'Stars' | 'Title'>('Due');
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

  const groups = [
    { n: 'Overdue', items: ordered(rows.filter((r) => r.late > 0)), tint: PAL.coral, note: order === 'Due' ? 'Oldest first' : `By ${order.toLowerCase()}`, empty: 'Nothing late.' },
    { n: 'Today', items: ordered(rows.filter((r) => !r.late && r.dueLabel === 'Today')), tint: PAL.amber, note: 'Due before midnight', empty: 'Nothing due today.' },
    { n: 'Upcoming', items: ordered(rows.filter((r) => !r.late && r.dueLabel !== 'Today')), tint: PAL.mint, note: 'The rest of the week', empty: 'Nothing scheduled yet.' },
  ];

  const complete = (r: Row) => {
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
      width="list"
      meta={`${rows.length} open across every list`}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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

      {/* Task Groups */}
      <div data-tour="tasks-columns">
        {!isPending && groups.map((g) => (
          <div key={g.n}
            style={{
              background: 'var(--card, #1E1F22)', borderRadius: 20, padding: '14px 14px 6px', marginTop: 14,
              boxShadow: 'var(--sh)', border: `1px solid color-mix(in srgb, ${g.tint} 30%, transparent)`,
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
                phone={phone}
                accent={prefs.accent}
                leaving={leaving.has(r.task.id)}
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
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '9px 10px',
                      borderRadius: 8,
                    }}
                  >
                    {/* Checked Circle to Undo */}
                    <button
                      onClick={() => {
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
                        onClick={() => A.removeWithUndo(t)}
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
              label: 'Edit details',
              icon: 'edit',
              run: () => setDetail(ctxMenu.task.id),
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

      {/* Task Detail Sheet */}
      {detailTask && (
        <TaskDetail
          task={detailTask}
          lists={lists}
          onClose={() => setDetail(null)}
          onPatch={(patch) => A.update.mutate({ id: detailTask.id, patch })}
          onDelete={() => { A.removeWithUndo(detailTask); setDetail(null); }}
        />
      )}
    </Page>
  );
}

function TaskRow({
  row, phone, accent, leaving,
  onCheck, onOpen, onDelete, onPatch, onStar, onOpenMenu, onOpenDatePicker, lp,
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
}) {
  const [editing, setEditing] = useState(false);
  const [titleVal, setTitleVal] = useState(row.task.title);

  useEffect(() => {
    setTitleVal(row.task.title);
  }, [row.task.title]);

  const handleCommitEdit = () => {
    setEditing(false);
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
                    setEditing(false);
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
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
                style={{ textAlign: 'left' }}
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

                {/* Details / Notes snippet */}
                {row.task.notes && (
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
                    {row.task.notes}
                  </span>
                )}

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

function TaskDetail({
  task, lists, onClose, onPatch, onDelete,
}: {
  task: Task;
  lists: List[];
  onClose: () => void;
  onPatch: (p: Partial<Task>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const stars = task.stars || 0;

  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes ?? '');
  }, [task.id, task.title, task.notes]);

  const handleCommitTitle = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== task.title) {
      onPatch({ title: trimmed });
    }
  };

  const handleCommitNotes = () => {
    if (notes !== (task.notes ?? '')) {
      onPatch({ notes });
    }
  };

  const handleDone = () => {
    handleCommitTitle();
    handleCommitNotes();
    onClose();
  };

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

  if (typeof document === 'undefined') return null;

  // Portalled: `main` carries the zoom pref and the page-entry transform, so a
  // fixed sheet rendered inside it is positioned against `main`, not the
  // viewport (HANDOFF fact 2).
  return createPortal((
    <>
      <div onClick={handleDone} className="fade" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.44)', zIndex: 30 }} />
      <div className="sheet" style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 31,
        maxHeight: 'calc(100% - 56px)', overflowY: 'auto',
        background: 'var(--card)', borderRadius: '22px 22px 0 0', padding: '20px 22px 24px',
        boxShadow: 'var(--shl)', border: '1px solid var(--line2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--tx)' }}>{title || 'Task Detail'}</div>
          <button onClick={onDelete} className="hov k-squish" title="Delete task"
            style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card2)', border: '1px solid var(--line2)', cursor: 'pointer' }}>
            <Icon name="trash" size={14} color="var(--tx2)" />
          </button>
          <button onClick={handleDone} className="hov k-squish" style={{ width: 26, height: 26, borderRadius: 8, color: 'var(--tx3)', fontSize: 15, background: 'transparent', border: 'none', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px 22px' }}>
          <div>
            <div style={KICKER}>Title</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleCommitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCommitTitle();
                  (e.target as HTMLElement).blur();
                }
              }}
              placeholder="Task title"
              style={{
                width: '100%', marginTop: 6, padding: '8px 11px', borderRadius: 10,
                border: '1px solid var(--line2)', fontSize: 13, fontWeight: 600,
                color: 'var(--tx)', background: 'var(--card2)', outline: 'none',
              }}
            />
          </div>

          <div>
            <div style={KICKER}>Priority</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {priorities.map((p) => (
                <button
                  key={p.n}
                  onClick={() => onPatch({ priority: p.v })}
                  style={CHIP(task.priority === p.v || (!task.priority && p.v === null))}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: p.c }} />
                  {p.n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={KICKER}>List</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {lists.map((l) => (
                <button key={l.id} onClick={() => onPatch({ list_id: l.id })} style={CHIP(task.list_id === l.id)}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: l.color }} />
                  {l.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={KICKER}>Due Date</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>
              {dues.map((d) => (
                <button key={d.n} onClick={() => onPatch({ due_on: d.v })} style={CHIP(task.due_on === d.v)}>{d.n}</button>
              ))}
              <input
                type="date"
                value={task.due_on ?? ''}
                onChange={(e) => onPatch({ due_on: e.target.value || null })}
                style={{
                  padding: '5px 8px',
                  borderRadius: 8,
                  border: '1px solid var(--line2)',
                  background: 'var(--card2)',
                  color: 'var(--tx)',
                  fontSize: 11.5,
                  fontWeight: 600,
                }}
              />
            </div>
          </div>

          <div>
            <div style={KICKER}>Rating</div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 6 }}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} onClick={() => onPatch({ stars: stars === v ? 0 : v })} title={`${v} ${v === 1 ? 'star' : 'stars'}`}
                  style={{ fontSize: 16, lineHeight: 1, padding: '0 1px', color: v <= stars ? 'var(--accTx)' : 'var(--line2)', transition: 'color .16s', background: 'none', border: 'none', cursor: 'pointer' }}>
                  ★
                </button>
              ))}
              <span style={{ marginLeft: 7, fontSize: 11, fontWeight: 700, color: 'var(--tx3)' }}>
                {stars ? `${stars} of 5` : 'Not rated'}
              </span>
            </span>
          </div>
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <div style={KICKER}>Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleCommitNotes}
            rows={3}
            placeholder="Add a note…"
            style={{
              width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 11,
              border: '1px solid var(--line2)', background: 'var(--card2)',
              fontSize: 12.5, lineHeight: 1.6, color: 'var(--tx)', resize: 'vertical',
              fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
          <button onClick={handleDone} className="acc k-squish"
            style={{ padding: '11px 24px', borderRadius: 11, background: 'var(--acc)', color: 'var(--ink)', fontSize: 13, fontWeight: 800, border: 'none', cursor: 'pointer' }}>
            Done
          </button>
        </div>
      </div>
    </>
  ), document.body);
}
