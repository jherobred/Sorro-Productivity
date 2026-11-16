'use client';
/** C.quick: type an event the way you'd say it; Sorro shows what it understood before saving. */
import { forwardRef, useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { parseEvent } from '@/lib/eventParse';
import type { RecurrenceDay, RecurrenceRule } from '@/lib/events';
import { SLEEP_HOURS, type SleepHours } from '@/lib/sleepBlock';

const CODES: RecurrenceDay[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type QuickEvent = { id: string; title: string; starts_at: string; ends_at: string; all_day: boolean; location?: string; color: string; recurrence?: RecurrenceRule | null };

export const QuickAdd = forwardRef<HTMLInputElement, { color: string; onAdd: (e: QuickEvent) => void }>(function QuickAdd({ color, onAdd }, ref) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => text.trim() ? parseEvent(text, new Date()) : null, [text]);
  const when = parsed && (parsed.all_day
    ? new Date(parsed.starts_at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ', all day'
    : `${new Date(parsed.starts_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} to ${new Date(parsed.ends_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  const submit = () => {
    if (!parsed) return;
    onAdd({
      id: crypto.randomUUID(), title: parsed.title, starts_at: parsed.starts_at, ends_at: parsed.ends_at, all_day: parsed.all_day, location: parsed.location, color,
      recurrence: parsed.repeat ? { freq: 'weekly', byDay: parsed.repeat.days.map(d => CODES[d]), endType: 'never' } : null,
    });
    setText('');
  };
  return <form className="cq" data-part="C.quick" onSubmit={e => { e.preventDefault(); submit(); }}>
    <Icon name="plus" size={16} />
    <input ref={ref} value={text} onChange={e => setText(e.target.value)} placeholder="Add an event: CS 150 every Mon 9-10:30 at Eng 214" aria-label="Add an event in your own words" aria-describedby="cq-preview" />
    <span id="cq-preview" className="cq-preview" aria-live="polite">
      {parsed ? <><strong>{parsed.title}</strong><span>{when}</span>{parsed.location && <span>{parsed.location}</span>}{parsed.repeat && <span>every {parsed.repeat.days.map(d => NAMES[d]).join(', ')}</span>}</> : text.trim() ? 'Add a title' : ''}
    </span>
    <button className="sx-pill" disabled={!parsed}>Add</button>
  </form>;
});

/** One tap writes a Sleep block of that length onto the day open in the calendar. */
export function SleepAdd({ onAdd }: { onAdd: (hours: SleepHours) => void }) {
  return <div className="cq-sleep" role="group" aria-label="Add sleep">
    <Icon name="moon" size={15} />
    <span>Sleep</span>
    {SLEEP_HOURS.map((hours) => (
      <button type="button" key={hours} onClick={() => onAdd(hours)} aria-label={`Add ${hours} hour sleep`}>{hours}h</button>
    ))}
  </div>;
}

/** The week's booked hours per day, so a heavy day shows before you open it. */
export function LoadBar({ days }: { days: { label: string; hours: number }[] }) {
  return <div className="cq-load" role="list" aria-label="Booked hours this week">
    {days.map(d => <span key={d.label} role="listitem" title={`${d.label}: ${d.hours.toFixed(1)} h booked`}>
      <i style={{ transform: `scaleX(${Math.min(1, d.hours / 10)})` }} /><small>{d.label} {d.hours ? `${Math.round(d.hours * 10) / 10}h` : 'free'}</small>
    </span>)}
  </div>;
}
