'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { SwipeableRow } from '@/components/SwipeableRow';
import { TaskCoverThumb } from './TaskPhotos';
import { parseTaskLinks, type List, type Task } from '@/lib/tasks';
import type { Tag } from '@/lib/tagList';
import { deadlineClock, deadlineOf } from '@/lib/todayCycle';
import { readCanvasNotes } from '@/lib/canvasFeed';
import { usePrefs } from '@/lib/prefs';
import { isRepeat, repeatLabel } from '@/lib/taskRepeat';

export type DueTone = 'late' | 'today' | 'soon' | 'later';

/** What the due chip says: "3 days late", "Today 11:00 AM", "Tomorrow", "Friday", "Oct 2". */
export function dueChip(task: Task, now: number, time24: boolean): { text: string; tone: DueTone } | null {
  if (!task.due_on) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = task.due_on.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  const time = task.due_at ? ` ${new Date(task.due_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !time24 })}` : '';
  if (days < 0) return { text: `${-days} ${days === -1 ? 'day' : 'days'} late`, tone: 'late' };
  if (days === 0) return { text: `Today${time}`, tone: task.due_at && Date.parse(task.due_at) < now ? 'late' : 'today' };
  if (days === 1) return { text: `Tomorrow${time}`, tone: 'soon' };
  if (days < 7) return { text: day.toLocaleDateString(undefined, { weekday: 'long' }) + time, tone: 'soon' };
  return { text: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(y !== today.getFullYear() ? { year: 'numeric' } : {}) }) + time, tone: 'later' };
}

/* One shared one-second clock for every countdown in the list. */
const subscribers = new Set<(ms: number) => void>();
let clock: ReturnType<typeof setInterval> | null = null;
function useSecond(on: boolean): number {
  const [ms, setMs] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    subscribers.add(setMs);
    clock ??= setInterval(() => { const now = Date.now(); for (const f of subscribers) f(now); }, 1000);
    return () => {
      subscribers.delete(setMs);
      if (!subscribers.size && clock) { clearInterval(clock); clock = null; }
    };
  }, [on]);
  return ms;
}

/** The seconds, only for a task due within a day, so fifty rows do not tick for nothing. */
function Countdown({ deadline }: { deadline: number }) {
  const now = useSecond(true);
  const left = deadlineClock(deadline, now);
  return <span className={'task-countdown' + (left.late ? ' is-late' : '')} role="timer" aria-live="off">{left.late ? 'late by ' : 'in '}{left.text}</span>;
}

export type TaskItemProps = {
  task: Task;
  list?: List;
  /** The course tag this task carries, when the course is one of the kept tags. */
  tag?: Tag;
  steps?: { done: number; total: number };
  /** Off when the view is already split by list, so the chip would repeat the heading. */
  showList: boolean;
  selected: boolean;
  /** Something is selected, so every row shows its selection box. */
  selecting: boolean;
  leaving: boolean;
  /** Ticked, and counting down the few seconds before it is done. */
  pending?: boolean;
  phone: boolean;
  time24: boolean;
  now: number;
  onToggleSelect: (range: boolean) => void;
  onCheck: (at: { x: number; y: number } | null) => void;
  onOpen: () => void;
  onRename: (title: string) => void;
  onStar: () => void;
  onSchedule: (anchor: { top: number; left: number; bottom: number; right: number }) => void;
  onMenu: (x: number, y: number) => void;
  onDelete: () => void;
  /** Set by the page when a menu asks to rename this row. */
  renaming?: boolean;
  onRenameEnd?: () => void;
};

/**
 * One task in My Tasks. The title reads first; everything else is a small
 * chip under it, and only the chips that have something to say are drawn.
 * Tick, schedule, star and the menu sit on the row; a tap anywhere else opens
 * the task. On a phone, swipe right to finish and left to delete.
 */
export function TaskItem(props: TaskItemProps) {
  const { task, list, tag, steps, showList, selected, selecting, leaving, pending = false, phone, time24, now } = props;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const renaming = editing || !!props.renaming;
  const repeat = usePrefs().prefs.taskRepeat?.[task.id];
  const repeats = isRepeat(repeat) ? repeat : null;

  useEffect(() => { if (!renaming) setTitle(task.title); }, [task.title, renaming]);

  const finishRename = (save: boolean) => {
    setEditing(false);
    props.onRenameEnd?.();
    const clean = title.trim();
    if (save && clean && clean !== task.title) props.onRename(clean);
    else setTitle(task.title);
  };

  const parsed = parseTaskLinks(task.notes || '');
  // A Canvas assignment keeps "Course — link" in its notes. It reads as a course and a link, not a note.
  const canvas = task.source === 'canvas_lms' ? readCanvasNotes(task.notes) : null;
  const course = task.course || parsed.course || canvas?.course;
  const note = canvas ? undefined : parsed.cleanNotes.split('\n').find((line) => line.trim())?.trim();
  const links = (parsed.submissionLink ? 1 : 0) + (parsed.googleDocsLink ? 1 : 0) + parsed.customLinks.length;
  const due = dueChip(task, now, time24);
  const deadline = deadlineOf(task);
  const soon = !task.done && deadline !== null && Math.abs(deadline - now) < 86_400_000 && (!!task.due_at || deadline > now);
  const priority = task.priority ?? 'none';

  const className = ['task-item', selected && 'is-selected', selecting && 'is-selecting', task.done && 'is-done', pending && 'is-pending'].filter(Boolean).join(' ');

  return (
    <div className={'task-item-wrap' + (leaving ? ' leaving' : '')} role="listitem">
      <SwipeableRow disabled={renaming || !phone || selecting} onSwipeRight={() => props.onCheck(null)} onSwipeLeft={props.onDelete}
        rightActionIcon="check" rightActionColor="#2fb27a" leftActionIcon="trash" leftActionColor="var(--poster-red)">
        <div className={className} data-priority={priority}
          onClick={(e) => { if (selecting) props.onToggleSelect(e.shiftKey); else props.onOpen(); }}
          onContextMenu={(e) => { e.preventDefault(); props.onMenu(e.clientX, e.clientY); }}>
          <button type="button" className="task-select" aria-pressed={selected} aria-label={selected ? `Unselect ${task.title}` : `Select ${task.title}`}
            onClick={(e) => { e.stopPropagation(); props.onToggleSelect(e.shiftKey); }}>
            {selected && <Icon name="check" size={11} />}
          </button>

          <button type="button" className="task-check" aria-pressed={task.done || pending}
            aria-label={pending ? `Keep ${task.title} open` : task.done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
            title={pending ? 'Tap again to keep it open' : undefined}
            onClick={(e) => { e.stopPropagation(); props.onCheck({ x: e.clientX, y: e.clientY }); }}>
            {pending && <svg className="task-grace" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg>}
            <Icon name="check" size={12} />
          </button>

          <TaskCoverThumb taskId={task.id} title={task.title} />

          <div className="task-body">
            {renaming ? (
              <input className="task-rename" autoFocus value={title} aria-label="Task title"
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => finishRename(true)}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); finishRename(true); }
                  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishRename(false); }
                }} />
            ) : (
              <span className="task-title" onDoubleClick={(e) => { if (phone) return; e.stopPropagation(); setEditing(true); }}>{task.title}</span>
            )}
            {note && !renaming && <span className="task-note">{note}</span>}
            {(due || canvas || repeats || (showList && list) || course || (steps && steps.total > 0) || links > 0 || task.stars > 0) && (
              <div className="task-meta">
                {due && (
                  <button type="button" className="task-due" data-tone={task.done ? 'later' : due.tone} title="Change the date"
                    onClick={(e) => { e.stopPropagation(); props.onSchedule(e.currentTarget.getBoundingClientRect()); }}>
                    <Icon name="clock" size={12} />{due.text}
                    {soon && deadline !== null && <Countdown deadline={deadline} />}
                  </button>
                )}
                {canvas && (
                  <a className="task-chip is-canvas" href={canvas.url ?? 'https://ust.instructure.com'} target="_blank" rel="noopener noreferrer" title="Open in Canvas" onClick={(e) => e.stopPropagation()}>
                    <b aria-hidden="true">C</b>Canvas
                  </a>
                )}
                {repeats && <span className="task-chip is-plain" title={repeatLabel(repeats, task.due_on)}><Icon name="repeat" size={12} />{repeatLabel({ ...repeats, until: null }, task.due_on).replace(/ on .*/, '')}</span>}
                {showList && list && <span className="task-chip" style={{ '--tag': list.color } as React.CSSProperties}><i aria-hidden="true" />{list.name}</span>}
                {course && <span className="task-chip is-course" style={{ '--tag': tag?.color ?? 'var(--tx3)' } as React.CSSProperties}><Icon name="tag" size={11} />{course}</span>}
                {steps && steps.total > 0 && (
                  <span className={'task-chip is-steps' + (steps.done === steps.total ? ' is-complete' : '')} title={`${steps.done} of ${steps.total} steps done`}>
                    <Icon name="listCheck" size={12} />{steps.done}/{steps.total}
                  </span>
                )}
                {links > 0 && <span className="task-chip is-plain" title={`${links} ${links === 1 ? 'link' : 'links'}`}><Icon name="link" size={12} />{links}</span>}
                {task.stars > 0 && <span className="task-chip is-stars" title={`${task.stars} of 5 stars`}><Icon name="star" size={12} />{task.stars}</span>}
              </div>
            )}
          </div>

          <div className="task-actions">
            {!phone && (
              <>
                <button type="button" aria-label={task.due_on ? 'Change the date' : 'Add a date'} title={task.due_on ? 'Change the date' : 'Add a date'}
                  onClick={(e) => { e.stopPropagation(); props.onSchedule(e.currentTarget.getBoundingClientRect()); }}>
                  <Icon name="cal" size={15} />
                </button>
                <button type="button" className={task.stars ? 'is-on' : undefined} aria-pressed={task.stars > 0} aria-label={task.stars ? 'Remove star' : 'Star'} title={task.stars ? 'Remove star' : 'Star'}
                  onClick={(e) => { e.stopPropagation(); props.onStar(); }}>
                  <Icon name="star" size={15} />
                </button>
              </>
            )}
            <button type="button" aria-label="Task options" title="Task options" aria-haspopup="menu"
              onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); props.onMenu(r.right - 240, r.bottom + 4); }}>
              <Icon name="dots" size={15} />
            </button>
          </div>
        </div>
      </SwipeableRow>
    </div>
  );
}
