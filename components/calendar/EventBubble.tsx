'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { CalPopover } from '@/components/CalPopover';
import { EVENT_CATEGORIES, resolveCategory } from '@/lib/eventCategories';
import { formatRecurrenceLabel, isReadOnly, type Ev } from '@/lib/events';
import { countdownText, deadlineClock, eventCountdown } from '@/lib/todayCycle';

const REMINDERS = [{ minutes: 0, label: 'Off' }, { minutes: 10, label: '10 min' }, { minutes: 30, label: '30 min' }, { minutes: 60, label: '1 hour' }];
const time = (iso: string, time24: boolean) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !time24 });
const agoText = (ms: number) => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'Just ended';
  if (minutes < 60) return `Ended ${minutes}m ago`;
  if (minutes < 1440) return `Ended ${countdownText(ms).replace(/ \d+s$/, '')} ago`;
  const days = Math.floor(minutes / 1440);
  return `Ended ${days} ${days === 1 ? 'day' : 'days'} ago`;
};

/**
 * What opens when an event on the calendar is clicked, or an empty slot is.
 *
 * Everything on it works: the title edits in place, the category and reminder
 * change with one tap, Take notes starts a page for the event, and the live
 * line counts down to the start or the end with a bar. A new, untitled event
 * can still become a task from the switch at the top.
 */
export function EventBubble({
  ev, x, y, runDays, draft, previousEnd, time24,
  onClose, onEdit, onDuplicate, onDelete, onDeleteRun, onUpdateTitle, onPatch, onTakeNotes, onSwitchToTask,
}: {
  ev: Ev; x: number; y: number;
  /** How many days this event's run covers, or 0 when it stands alone. */
  runDays: number;
  /** A just-created event that has no title yet. */
  draft: boolean;
  /** When the event before this one ended that day, where its wait began. */
  previousEnd: string | null;
  time24: boolean;
  onClose: () => void; onEdit: () => void; onDuplicate: () => void;
  onDelete: () => void; onDeleteRun: () => void;
  onUpdateTitle: (title: string) => void;
  onPatch: (patch: Partial<Ev>) => void;
  onTakeNotes: () => void;
  onSwitchToTask?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const locked = isReadOnly(ev);
  const start = new Date(ev.starts_at), end = new Date(ev.ends_at);
  const untitled = !ev.title?.trim() || ev.title === '(No title)';
  const [editing, setEditing] = useState(untitled && !locked);
  const [title, setTitle] = useState(untitled ? '' : ev.title);
  const category = resolveCategory(ev.color);
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  const length = minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`;
  const sameDayAsNow = start.toDateString() === new Date(now).toDateString();
  const past = end.getTime() <= now;
  const wait = !ev.all_day && !past ? eventCountdown(ev, sameDayAsNow ? previousEnd : null, now) : null;
  const upcomingFar = !!wait && !wait.ongoing && !sameDayAsNow;

  const save = () => {
    const clean = title.trim();
    onUpdateTitle(clean || '(No title)');
    setEditing(false);
  };

  return (
    <CalPopover x={x} y={y} onClose={onClose} label={ev.title || 'Event'} width={368}>
      <div className="cal-bubble" style={{ '--hue': ev.color } as React.CSSProperties}>
        <div className="cal-bubble-top">
          {draft && onSwitchToTask ? (
            <div className="cal-kind" role="tablist" aria-label="What to add">
              <button type="button" role="tab" aria-selected="true">Event</button>
              <button type="button" role="tab" aria-selected="false" onClick={onSwitchToTask}>Task</button>
            </div>
          ) : (
            <span className="cal-bubble-kind"><i aria-hidden="true" />{category.label}</span>
          )}
          <span className="cal-bubble-spacer" />
          {!locked && <>
            <button type="button" className="cal-icon-button" onClick={onEdit} aria-label="Edit all details" title="Edit all details"><Icon name="edit" size={15} /></button>
            <button type="button" className="cal-icon-button" onClick={onDuplicate} aria-label="Duplicate event" title="Duplicate"><Icon name="copy" size={15} /></button>
            <button type="button" className="cal-icon-button is-danger" onClick={onDelete} aria-label={runDays > 1 ? 'Delete this day' : 'Delete event'} title={runDays > 1 ? 'Delete this day' : 'Delete'}><Icon name="trash" size={15} /></button>
          </>}
          <button type="button" className="cal-icon-button" onClick={onClose} aria-label="Close" title="Close"><Icon name="close" size={15} /></button>
        </div>

        {editing ? (
          <input className="cal-bubble-title-input" autoFocus value={title} placeholder="Add a title"
            onChange={(e) => setTitle(e.target.value)} onBlur={save}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
        ) : (
          <h2 className="cal-bubble-title">
            <button type="button" disabled={locked} onClick={() => setEditing(true)} title={locked ? undefined : 'Rename'}>
              {untitled ? '(No title)' : ev.title}
            </button>
          </h2>
        )}

        <ul className="cal-bubble-rows">
          <li>
            <Icon name="clock" size={15} />
            <span>
              {start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              {ev.all_day ? ' · All day' : ` · ${time(ev.starts_at, time24)} – ${time(ev.ends_at, time24)}`}
            </span>
            {!ev.all_day && <small>{length}</small>}
          </li>
          {ev.recurrence && <li><Icon name="repeat" size={15} /><span>{formatRecurrenceLabel(ev.recurrence, start)}</span></li>}
          {ev.location && <li><Icon name="mapPin" size={15} /><span>{ev.location}</span></li>}
        </ul>

        {!ev.all_day && (
          <div className={'cal-bubble-status' + (past ? ' is-past' : wait?.ongoing ? ' is-now' : '')}>
            {past ? (
              <p><Icon name="check" size={14} />{agoText(now - end.getTime())}</p>
            ) : wait && (
              <>
                <p>
                  <Icon name={wait.ongoing ? 'hourglass' : 'clock'} size={14} />
                  {wait.ongoing ? 'Ends in' : 'Starts in'}
                  <strong role="timer" aria-live="off">{deadlineClock(now + wait.msLeft, now).text}</strong>
                </p>
                {!upcomingFar && <AsciiBar value={wait.share * 100} hue={ev.color} showValue={false} label={wait.ongoing ? 'Time through this event' : 'Time until it starts'} />}
              </>
            )}
          </div>
        )}

        {!locked && (
          <>
            <div className="cal-bubble-field">
              <span>Category</span>
              <div className="cal-swatches" role="radiogroup" aria-label="Category">
                {EVENT_CATEGORIES.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={category.id === c.id} aria-label={c.label} title={c.label}
                    style={{ background: c.color }} onClick={() => onPatch({ color: c.color })}>
                    {category.id === c.id && <Icon name="check" size={12} color="#fff" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="cal-bubble-field">
              <span>Reminder</span>
              <div className="cal-chips" role="radiogroup" aria-label="Reminder">
                {REMINDERS.map((r) => {
                  const on = (ev.remind_minutes ?? 0) === r.minutes;
                  return (
                    <button key={r.minutes} type="button" role="radio" aria-checked={on}
                      onClick={() => onPatch({ remind_minutes: r.minutes || null })}>{r.label}</button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="cal-bubble-actions">
          <button type="button" className="studio-button" onClick={onTakeNotes}><Icon name="files" size={16} />Take notes</button>
          {!locked && <button type="button" className="studio-button" onClick={onEdit}>More options</button>}
        </div>

        {runDays > 1 && !locked && (
          <button type="button" className="cal-bubble-danger" onClick={onDeleteRun}>
            <Icon name="trash" size={14} />Delete all {runDays} days of this
          </button>
        )}
        {locked && <p className="cal-bubble-note"><Icon name="lock" size={13} />Synced from another calendar. Edit it there.</p>}
      </div>
    </CalPopover>
  );
}
