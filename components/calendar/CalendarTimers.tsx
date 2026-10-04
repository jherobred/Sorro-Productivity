'use client';
import { useCalendarClock } from '@/lib/useCalendarClock';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { dayCountdown, deadlineClock, eventCountdown, nextTimedEvent } from '@/lib/todayCycle';
import { chipLabel } from '@/lib/eventCategories';
import type { Ev } from '@/lib/events';
import { CountdownFocus } from './CountdownFocus';

const clockTime = (iso: string, time24: boolean) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !time24 });

/**
 * The calendar's two clocks, side by side: Up next, counting to the next event
 * or to the end of the one running, and Today ends, counting to 11:59 PM.
 * Each has a bar for how much of its wait has passed. They keep their own
 * one-second timer, so the grid behind them does not re-render every second.
 */
export function CalendarTimers({ events, time24, large = false, onOpen }: {
  events: Ev[];
  time24: boolean;
  /** The Next view's bigger version. */
  large?: boolean;
  onOpen?: (ev: Ev, x: number, y: number) => void;
}) {
  const now = useCalendarClock();
  const [focused, setFocused] = useState(false);


  const { next, previousEnd } = nextTimedEvent(events, now);
  const wait = next ? eventCountdown(next, previousEnd, now) : null;
  const nextClock = next && wait ? deadlineClock(now + wait.msLeft, now).text : '';
  const day = dayCountdown(now);
  const dayClock = deadlineClock(day.target, now).text;
  const leftToday = events.filter((e) => !e.all_day && !e.deleted_at && Date.parse(e.ends_at) > now && Date.parse(e.starts_at) < day.target).length;

  return (
    <div className={'cal-timers' + (large ? ' is-large' : '')}>
      <section className="cal-timer" style={next ? { '--hue': next.color } as React.CSSProperties : undefined} aria-label="Up next">
        <div className="cal-timer-label">
          <span className="cal-timer-dot" aria-hidden="true" />
          {next && wait?.ongoing ? 'Happening now' : 'Up next'}
          <button type="button" className="cal-timer-focus-button" aria-label="Focus on calendar countdown" title="Focus on countdown" onClick={() => setFocused(true)}><Icon name="fullscreen" size={15}/><span>Focus</span></button>
        </div>
        {next && wait ? (
          <>
            <div className="cal-timer-main">
              <strong role="timer" aria-live="off">{nextClock}</strong>
              <span>{wait.ongoing ? 'left' : 'to go'}</span>
            </div>
            <button type="button" className="cal-timer-title" disabled={!onOpen}
              onClick={(e) => onOpen?.(next, e.clientX, e.clientY)}>
              <b>{chipLabel(next)}</b>
              <small>{clockTime(next.starts_at, time24)} – {clockTime(next.ends_at, time24)}{next.location ? ` · ${next.location}` : ''}</small>
            </button>
            <AsciiBar value={wait.share * 100} hue={next.color} showValue={false}
              label={wait.ongoing ? 'Time through this event' : 'Time until the next event'} />
          </>
        ) : (
          <>
            <div className="cal-timer-main"><strong>—</strong></div>
            <p className="cal-timer-title is-empty">Nothing else on the calendar this week.</p>
            <AsciiBar value={0} showValue={false} label="Time until the next event" />
          </>
        )}
      </section>

      <section className="cal-timer is-day" aria-label="Today ends">
        <div className="cal-timer-label"><Icon name="moon" size={13} />Today ends</div>
        <div className="cal-timer-main">
          <strong role="timer" aria-live="off">{dayClock}</strong>
          <span>until 11:59 PM</span>
        </div>
        <p className="cal-timer-title">
          <b>{Math.round(day.share * 100)}% of today gone</b>
          <small>{leftToday ? `${leftToday} ${leftToday === 1 ? 'event' : 'events'} still ahead today` : 'Nothing left on today’s calendar'}</small>
        </p>
        <AsciiBar value={day.share * 100} hue="var(--poster-yellow)" showValue={false} label="How much of today has passed" />
      </section>
      {focused && <CountdownFocus event={next ?? undefined} clock={nextClock} ongoing={!!wait?.ongoing} time24={time24} dayPercent={day.share * 100} onClose={() => setFocused(false)}/>}
    </div>
  );
}
