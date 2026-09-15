'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { CalPopover } from '@/components/CalPopover';
import { parseTaskLinks, type List, type Task } from '@/lib/tasks';
import { courseIs, type Tag } from '@/lib/tagList';
import { deadlineClock, deadlineOf } from '@/lib/todayCycle';

const PRIORITIES = [{ id: 'high', label: 'High' }, { id: 'med', label: 'Medium' }, { id: 'low', label: 'Low' }, { id: null, label: 'None' }] as const;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Keeps a task's clock time when its day moves, so rescheduling never drops the hour it was set for. */
function moveTo(task: Task, day: Date | null): Partial<Task> {
  if (!day) return { due_on: null, due_at: null };
  const due_on = ymd(day);
  if (!task.due_at) return { due_on, due_at: null };
  const old = new Date(task.due_at);
  const next = new Date(day);
  next.setHours(old.getHours(), old.getMinutes(), 0, 0);
  return { due_on, due_at: next.toISOString() };
}

/**
 * What opens when a task on the calendar is clicked, or a new task is added
 * from an empty slot. Ticking, renaming, moving it to another day and changing
 * its priority all happen here; the full editor is one tap away in My Tasks.
 */
export function TaskBubble({
  task, x, y, draft, lists, tags, time24,
  onClose, onComplete, onDelete, onUpdateTitle, onPatch, onOpenInTasks, onSwitchToEvent,
}: {
  task: Task; x: number; y: number;
  draft: boolean;
  lists: List[];
  tags: Tag[];
  time24: boolean;
  onClose: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onUpdateTitle: (title: string) => void;
  onPatch: (patch: Partial<Task>) => void;
  onOpenInTasks: () => void;
  onSwitchToEvent?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [done, setDone] = useState(task.done);
  const untitled = !task.title?.trim() || task.title === '(No title)';
  const [editing, setEditing] = useState(untitled);
  const [title, setTitle] = useState(untitled ? '' : task.title);
  const parsed = parseTaskLinks(task.notes || '');
  const course = task.course || parsed.course;
  const tag = course ? tags.find((t) => courseIs(course, t)) : undefined;
  const list = lists.find((l) => l.id === task.list_id);
  const deadline = deadlineOf(task);
  const clock = deadline !== null && !done ? deadlineClock(deadline, now) : null;
  const dueToday = task.due_on === ymd(new Date(now));
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const todayShare = deadline !== null && dueToday ? Math.min(1, Math.max(0, (now - midnight.getTime()) / Math.max(1, deadline - midnight.getTime()))) : null;
  const when = task.due_at
    ? `${new Date(task.due_at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${new Date(task.due_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !time24 })}`
    : task.due_on ? `${new Date(`${task.due_on}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · Any time` : 'No date';
  const today = new Date(now);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(now); nextWeek.setDate(nextWeek.getDate() + ((8 - nextWeek.getDay()) % 7 || 7));

  const save = () => { onUpdateTitle(title.trim() || '(No title)'); setEditing(false); };

  return (
    <CalPopover x={x} y={y} onClose={onClose} label={task.title || 'Task'} width={360}>
      <div className="cal-bubble is-task" style={{ '--hue': tag?.color ?? list?.color ?? 'var(--acc)' } as React.CSSProperties}>
        <div className="cal-bubble-top">
          {draft && onSwitchToEvent ? (
            <div className="cal-kind" role="tablist" aria-label="What to add">
              <button type="button" role="tab" aria-selected="false" onClick={onSwitchToEvent}>Event</button>
              <button type="button" role="tab" aria-selected="true">Task</button>
            </div>
          ) : (
            <span className="cal-bubble-kind"><i aria-hidden="true" />Task</span>
          )}
          <span className="cal-bubble-spacer" />
          <button type="button" className="cal-icon-button" onClick={onOpenInTasks} aria-label="Open in My Tasks" title="Open in My Tasks"><Icon name="edit" size={15} /></button>
          <button type="button" className="cal-icon-button is-danger" onClick={onDelete} aria-label="Delete task" title="Delete"><Icon name="trash" size={15} /></button>
          <button type="button" className="cal-icon-button" onClick={onClose} aria-label="Close" title="Close"><Icon name="close" size={15} /></button>
        </div>

        <div className="cal-bubble-heading">
          <button type="button" className={'cal-check' + (done ? ' is-done' : '')} aria-pressed={done}
            aria-label={done ? 'Mark as not done' : 'Mark as done'} onClick={() => { setDone(!done); onComplete(); }}>
            {done && <Icon name="check" size={12} />}
          </button>
          {editing ? (
            <input className="cal-bubble-title-input" autoFocus value={title} placeholder="Add a title"
              onChange={(e) => setTitle(e.target.value)} onBlur={save}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
          ) : (
            <h2 className={'cal-bubble-title' + (done ? ' is-done' : '')}>
              <button type="button" onClick={() => setEditing(true)} title="Rename">{untitled ? '(No title)' : task.title}</button>
            </h2>
          )}
        </div>

        <ul className="cal-bubble-rows">
          <li><Icon name="clock" size={15} /><span>{when}</span></li>
          {(list || course) && (
            <li className="cal-bubble-tags">
              <Icon name="tag" size={15} />
              {course && <span className="cal-tag" style={{ '--tag': tag?.color ?? 'var(--tx3)' } as React.CSSProperties}><i aria-hidden="true" />{course}</span>}
              {list && <span className="cal-tag" style={{ '--tag': list.color } as React.CSSProperties}><i aria-hidden="true" />{list.name}</span>}
            </li>
          )}
          {parsed.cleanNotes && <li><Icon name="text" size={15} /><span className="cal-bubble-notes">{parsed.cleanNotes}</span></li>}
        </ul>

        {clock && (
          <div className={'cal-bubble-status' + (clock.late ? ' is-late' : '')}>
            <p>
              <Icon name="hourglass" size={14} />
              {clock.late ? 'Overdue by' : 'Due in'}
              <strong role="timer" aria-live="off">{clock.text}</strong>
            </p>
            {todayShare !== null && !clock.late && <AsciiBar value={todayShare * 100} hue="var(--poster-yellow)" showValue={false} label="Time through today before it is due" />}
          </div>
        )}

        <div className="cal-bubble-field">
          <span>Move to</span>
          <div className="cal-chips">
            <button type="button" aria-pressed={task.due_on === ymd(today)} onClick={() => onPatch(moveTo(task, today))}>Today</button>
            <button type="button" aria-pressed={task.due_on === ymd(tomorrow)} onClick={() => onPatch(moveTo(task, tomorrow))}>Tomorrow</button>
            <button type="button" aria-pressed={task.due_on === ymd(nextWeek)} onClick={() => onPatch(moveTo(task, nextWeek))}>Next week</button>
            <button type="button" aria-pressed={!task.due_on} onClick={() => onPatch(moveTo(task, null))}>No date</button>
          </div>
        </div>
        <div className="cal-bubble-field">
          <span>Priority</span>
          <div className="cal-chips" role="radiogroup" aria-label="Priority">
            {PRIORITIES.map((p) => (
              <button key={p.label} type="button" role="radio" aria-checked={(task.priority ?? null) === p.id}
                className={p.id ? 'is-' + p.id : undefined} onClick={() => onPatch({ priority: p.id })}>{p.label}</button>
            ))}
          </div>
        </div>

        <div className="cal-bubble-actions">
          <button type="button" className="studio-button primary" onClick={() => { setDone(!done); onComplete(); }}>
            <Icon name="check" size={16} />{done ? 'Mark as not done' : 'Mark done'}
          </button>
          <button type="button" className="studio-button" onClick={onOpenInTasks}>Open in My Tasks</button>
        </div>
      </div>
    </CalPopover>
  );
}
