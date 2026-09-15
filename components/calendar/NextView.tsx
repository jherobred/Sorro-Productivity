'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { chipLabel, resolveCategory } from '@/lib/eventCategories';
import { deadlineClock, deadlineOf } from '@/lib/todayCycle';
import type { Ev } from '@/lib/events';
import type { Task } from '@/lib/tasks';
import { CalendarTimers } from './CalendarTimers';

const clock = (iso: string, time24: boolean) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !time24 });

type Row =
  | { kind: 'event'; at: number; ev: Ev }
  | { kind: 'task'; at: number; task: Task };

/**
 * The Next view: both clocks at full size, then what is still ahead today,
 * events and tasks in one list in time order, each one a tap from its details.
 * All-day events lead the list and tasks without a time close it.
 */
export function NextView({ events, tasks, time24, onOpenEvent, onOpenTask, onSnooze }: {
  events: Ev[];
  tasks: Task[];
  time24: boolean;
  onOpenEvent: (ev: Ev, x: number, y: number) => void;
  onOpenTask: (task: Task, x: number, y: number) => void;
  onSnooze: (ev: Ev) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const today = new Date(now).toDateString();

  const rows: Row[] = [
    ...events
      .filter((e) => !e.deleted_at && Date.parse(e.ends_at) > now && Date.parse(e.starts_at) <= end.getTime())
      .map((ev): Row => ({ kind: 'event', at: ev.all_day ? 0 : Date.parse(ev.starts_at), ev })),
    ...tasks
      .filter((t) => {
        const due = deadlineOf(t);
        return !t.done && !t.deleted_at && due !== null && new Date(due).toDateString() === today;
      })
      .map((task): Row => ({ kind: 'task', at: deadlineOf(task)!, task })),
  ].sort((a, b) => a.at - b.at);
  const nextUp = events
    .filter((e) => !e.deleted_at && !e.all_day && Date.parse(e.starts_at) > now && Date.parse(e.starts_at) <= end.getTime())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];

  return (
    <div className="cal-next">
      <CalendarTimers events={events} time24={time24} large onOpen={onOpenEvent} />
      {nextUp && (
        <div className="cal-next-snooze">
          <span>Need a few more minutes before <b>{chipLabel(nextUp)}</b>?</span>
          <button type="button" className="studio-button" onClick={() => onSnooze(nextUp)}><Icon name="bell" size={15} />Snooze 10 min</button>
        </div>
      )}
      <section className="cal-next-list" aria-label="Still ahead today">
        <h2>Still ahead today</h2>
        {rows.length === 0 && <p className="cal-next-empty">Nothing else today. The rest of it is yours.</p>}
        {rows.map((row) => {
          if (row.kind === 'event') {
            const e = row.ev;
            const ongoing = Date.parse(e.starts_at) <= now;
            const details = [e.all_day ? resolveCategory(e.color).label : `${clock(e.starts_at, time24)} – ${clock(e.ends_at, time24)}`, e.location].filter(Boolean).join(' · ');
            return (
              <button key={e.id} type="button" className="cal-next-row" style={{ '--hue': e.color } as React.CSSProperties}
                onClick={(ev) => onOpenEvent(e, ev.clientX, ev.clientY)}>
                <span className="cal-next-time">{e.all_day ? 'All day' : clock(e.starts_at, time24)}</span>
                <span className="cal-next-bar" aria-hidden="true" />
                <span className="cal-next-main"><b>{chipLabel(e)}</b><small>{details}</small></span>
                {!e.all_day && <span className={'cal-next-count' + (ongoing ? ' is-now' : '')}>{ongoing ? 'Now' : 'in ' + deadlineClock(Date.parse(e.starts_at), now).text}</span>}
              </button>
            );
          }
          const t = row.task;
          const due = deadlineOf(t)!;
          const late = due < now;
          return (
            <button key={t.id} type="button" className="cal-next-row is-task" onClick={(ev) => onOpenTask(t, ev.clientX, ev.clientY)}>
              <span className="cal-next-time">{t.due_at ? clock(t.due_at, time24) : 'Today'}</span>
              <span className="cal-next-check" aria-hidden="true" />
              <span className="cal-next-main"><b>{t.title}</b><small>{t.due_at ? `Task due at ${clock(t.due_at, time24)}` : 'Task due by the end of today'}</small></span>
              <span className={'cal-next-count' + (late ? ' is-late' : '')}>{late ? 'Overdue' : 'in ' + deadlineClock(due, now).text}</span>
            </button>
          );
        })}
      </section>
    </div>
  );
}
