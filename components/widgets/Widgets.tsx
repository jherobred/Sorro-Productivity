'use client';
/**
 * Sorro's widgets: one set, drawn in two places (Home's strip, the right panel).
 * Each reads real data only and owns its loading, empty and error states.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../Icon';
import { useTasks, useTaskActions, type Task } from '@/lib/tasks';
import { useEvents, type Ev } from '@/lib/events';
import { useNotes } from '@/lib/notes';
import { usePrefs } from '@/lib/prefs';
import { useEdition, manilaDay, KIND_NAMES } from '@/lib/news';
import { fetchWeather, weatherCode } from '@/lib/weather';
import { focusState, startFocus, stopFocus, takeFinished } from '@/lib/focusTimer';
import { foxReact } from '@/lib/foxNudges';
import { toast } from '@/lib/toast';
import { foxGlad } from '@/lib/foxMood';
import { ymd } from '@/lib/days';

export type WidgetId = 'agenda' | 'due' | 'focus' | 'month' | 'pinned' | 'news' | 'weather' | 'capture';
export const DEFAULT_WIDGETS: WidgetId[] = ['agenda', 'due', 'focus', 'weather'];

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

function Frame({ id, title, href, children }: { id: WidgetId; title: string; href?: string; children: React.ReactNode }) {
  return <section className="wg" data-widget={id} aria-label={title}>
    <header>{href ? <Link href={href}>{title}</Link> : <span>{title}</span>}</header>
    {children}
  </section>;
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="wg-empty">{children}</p>;
const Failed = ({ what, retry }: { what: string; retry: () => void }) => <p className="wg-empty">Couldn’t load {what}. <button onClick={retry}>Try again</button></p>;
const Loading = () => <div className="wg-skel" aria-label="Loading"><span /><span /></div>;

function Agenda() {
  const q = useEvents(startOfDay(), 1);
  const now = Date.now();
  const next = (q.data ?? []).filter((e: Ev) => !e.deleted_at && Date.parse(e.ends_at) > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 3);
  return <Frame id="agenda" title="Today" href="/calendar/">
    {q.isPending ? <Loading /> : q.isError ? <Failed what="your events" retry={() => q.refetch()} /> : next.length
      ? <ul className="wg-list">{next.map(e => <li key={e.id}><time>{e.all_day ? 'All day' : time(e.starts_at)}</time><span style={{ '--chip': e.color || 'var(--accent)' } as React.CSSProperties} className="wg-chip" /><strong>{e.title}</strong></li>)}</ul>
      : <Empty>Nothing else on the calendar today.</Empty>}
  </Frame>;
}

function Due() {
  const q = useTasks();
  const { complete } = useTaskActions();
  const today = ymd(new Date());
  const due = (q.data ?? []).filter((t: Task) => !t.done && !t.deleted_at && t.due_on && t.due_on <= today).sort((a, b) => (a.due_on ?? '').localeCompare(b.due_on ?? '')).slice(0, 5);
  return <Frame id="due" title="Due" href="/tasks/">
    {q.isPending ? <Loading /> : q.isError ? <Failed what="your tasks" retry={() => q.refetch()} /> : due.length
      ? <ul className="wg-list">{due.map(t => <li key={t.id} draggable onDragStart={e => e.dataTransfer.setData('text/sorro-task', t.id)}>
          <button className="wg-tick" aria-label={`Complete ${t.title}`} onClick={() => complete.mutate({ id: t.id, done: true })}><Icon name="check" size={12} /></button>
          <strong>{t.title}</strong>{t.due_on! < today && <em>Overdue</em>}
        </li>)}</ul>
      : <Empty>Nothing due today. Add one below or in Tasks.</Empty>}
  </Frame>;
}

function Focus() {
  const [st, setSt] = useState(focusState);
  const [, tick] = useState(0);
  const tasks = useTasks().data ?? [];
  const { update } = useTaskActions();
  useEffect(() => {
    const sync = () => setSt(focusState());
    window.addEventListener('sorro-focus', sync); window.addEventListener('storage', sync);
    const t = setInterval(() => {
      const done = takeFinished();
      if (done) {
        const task = done.taskId ? tasks.find(x => x.id === done.taskId) : null;
        if (task) update.mutate({ id: task.id, patch: { focus_minutes: (task.focus_minutes ?? 0) + done.minutes } });
        toast(task ? `${done.minutes} minutes of focus logged on ${task.title}` : `${done.minutes} minutes of focus done`);
        foxGlad();
        foxReact({ kind: 'focus_end', minutes: done.minutes, title: task?.title ?? null, at: Date.now() });
      }
      tick(n => n + 1);
    }, 1000);
    return () => { window.removeEventListener('sorro-focus', sync); window.removeEventListener('storage', sync); clearInterval(t); };
  }, [tasks, update]);
  const left = st.end ? Math.max(0, st.end - Date.now()) : 0;
  const mm = String(Math.floor(left / 60_000)).padStart(2, '0'), ss = String(Math.floor(left / 1000) % 60).padStart(2, '0');
  const task = st.taskId ? tasks.find(x => x.id === st.taskId) : null;
  return <Frame id="focus" title="Focus">
    {st.end ? <><div className="wg-focus"><span className="wg-big" aria-live="off">{mm}:{ss}</span><button className="wg-btn" onClick={stopFocus}>Stop</button></div>{task && <p className="wg-empty">On {task.title}</p>}</>
      : <div className="wg-focus"><button className="wg-btn" onClick={() => startFocus(25)}>25 min</button><button className="wg-btn" onClick={() => startFocus(50)}>50 min</button></div>}
  </Frame>;
}

/** How full a day is, 0 to 4, from its events plus open tasks due. */
export const dayLoad = (n: number) => Math.min(n, 4);

function Month() {
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const first = useMemo(() => { const d = startOfDay(); d.setDate(1); d.setMonth(d.getMonth() + offset); return d; }, [offset]);
  const lead = (first.getDay() + 6) % 7;
  const gridStart = useMemo(() => { const d = new Date(first); d.setDate(d.getDate() - lead); return d; }, [first, lead]);
  const q = useEvents(gridStart, 42);
  const tasks = useTasks().data ?? [];
  const { complete } = useTaskActions();
  const on = new Map<string, { events: Ev[]; tasks: Task[] }>();
  const at = (k: string) => { let v = on.get(k); if (!v) on.set(k, v = { events: [], tasks: [] }); return v; };
  for (const e of q.data ?? []) if (!e.deleted_at) at(ymd(new Date(e.starts_at))).events.push(e);
  for (const t of tasks) if (!t.done && !t.deleted_at && t.due_on) at(t.due_on).tasks.push(t);
  const today = ymd(new Date());
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(d.getDate() + i); return d; });
  const day = picked ? on.get(picked) ?? { events: [], tasks: [] } : null;
  const pickedDate = picked ? new Date(picked + 'T12:00') : null;
  return <Frame id="month" title={first.toLocaleDateString([], { month: 'long', year: 'numeric' })} href="/calendar/">
    <div className="wg-monthnav">
      <button type="button" aria-label="Previous month" onClick={() => setOffset(o => o - 1)}><Icon name="chevronLeft" size={14} /></button>
      <button type="button" aria-label="Next month" onClick={() => setOffset(o => o + 1)}><Icon name="chevronRight" size={14} /></button>
      <span />
      {offset !== 0 && <button type="button" onClick={() => setOffset(0)}>Today</button>}
    </div>
    <div className="wg-month">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="wg-dow" aria-hidden="true">{d}</span>)}
      {days.map(d => {
        const k = ymd(d); const v = on.get(k); const ev = v?.events.length ?? 0, ta = v?.tasks.length ?? 0;
        return <button type="button" key={k} className="wg-day" data-out={d.getMonth() !== first.getMonth()} data-today={k === today} data-past={k < today} data-load={dayLoad(ev + ta)}
          aria-pressed={k === picked} aria-label={`${d.toDateString()}, ${ev} event${ev === 1 ? '' : 's'}, ${ta} task${ta === 1 ? '' : 's'} due`} onClick={() => setPicked(k === picked ? null : k)}>{d.getDate()}</button>;
      })}
    </div>
    {day && pickedDate && <div className="wg-dayinfo" aria-live="polite">
      <p>{pickedDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}<Link href={`/calendar/?day=${picked}`}>Open in Calendar</Link></p>
      {day.events.length + day.tasks.length ? <ul className="wg-list">
        {day.events.sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 4).map(e => <li key={e.id}><time>{e.all_day ? 'All day' : time(e.starts_at)}</time><span style={{ '--chip': e.color || 'var(--accent)' } as React.CSSProperties} className="wg-chip" /><strong>{e.title}</strong></li>)}
        {day.tasks.slice(0, 4).map(t => <li key={t.id}><button className="wg-tick" aria-label={`Complete ${t.title}`} onClick={() => complete.mutate({ id: t.id, done: true })}><Icon name="check" size={12} /></button><strong>{t.title}</strong></li>)}
      </ul> : <Empty>Nothing on this day.</Empty>}
    </div>}
  </Frame>;
}

function Pinned() {
  const { prefs } = usePrefs();
  const q = useNotes();
  const note = (q.data ?? []).find(n => n.id === prefs.pinnedNotes?.[0]);
  const text = note ? note.body.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 220) : '';
  return <Frame id="pinned" title={note?.title || 'Pinned note'} href={note ? `/notebooks/?note=${note.id}` : '/notebooks/'}>
    {q.isPending ? <Loading /> : note ? <p className="wg-text">{text || 'This page is empty.'}</p> : <Empty>Pin a page from its menu in Notes and it shows here.</Empty>}
  </Frame>;
}

function News() {
  const q = useEdition(manilaDay());
  return <Frame id="news" title="News" href="/news/">
    {q.isPending ? <Loading /> : q.isError ? <Failed what="today’s news" retry={() => q.refetch()} /> : q.data?.length
      ? <ul className="wg-list">{q.data.slice(0, 4).map(e => <li key={e.id}><small>{KIND_NAMES[e.kind]}</small><strong>{e.items[0]?.headline || e.title}</strong></li>)}</ul>
      : <Empty>No digest yet today. Set up a Grok automation in News.</Empty>}
  </Frame>;
}

function Weather() {
  const { prefs, update } = usePrefs();
  const city = prefs.panel?.city || 'Manila';
  const q = useQuery({ queryKey: ['weather', city], queryFn: ({ signal }) => fetchWeather(city, signal), staleTime: 30 * 60_000, retry: 1 });
  const [editing, setEditing] = useState(false);
  return <Frame id="weather" title={q.data?.city ?? city}>
    {editing ? <form className="wg-capture" onSubmit={e => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('city') ?? '').trim(); if (v) update({ panel: { ...prefs.panel, city: v } }); setEditing(false); }}>
        <input name="city" defaultValue={city} aria-label="City" autoFocus /><button className="wg-btn">Save</button></form>
      : q.isPending ? <Loading /> : q.isError ? <p className="wg-empty">{(q.error as Error).message} <button onClick={() => setEditing(true)}>Change city</button></p>
      : <div className="wg-weather"><span className="wg-big">{q.data.temp}°</span><span><strong>{weatherCode(q.data.code)}</strong><small>Feels {q.data.feels}° · {q.data.low}–{q.data.high}° · rain {q.data.rainChance}%</small></span><button className="wg-link" onClick={() => setEditing(true)}>Change</button></div>}
  </Frame>;
}

function Capture() {
  const { create } = useTaskActions();
  const [v, setV] = useState('');
  const [added, setAdded] = useState('');
  return <Frame id="capture" title="Capture">
    <form className="wg-capture" onSubmit={e => { e.preventDefault(); const t = v.trim(); if (!t) return; create.mutate({ id: crypto.randomUUID(), title: t }); setAdded(t); setV(''); }}>
      <input value={v} onChange={e => setV(e.target.value)} placeholder="Add a task" aria-label="Add a task" /><button className="wg-btn" aria-label="Add task"><Icon name="plus" size={14} /></button>
    </form>
    {added && <p className="wg-empty" role="status">Added “{added}” to Tasks.</p>}
  </Frame>;
}

export const WIDGETS: Record<WidgetId, { name: string; Component: () => React.ReactElement }> = {
  agenda: { name: 'Today', Component: Agenda },
  due: { name: 'Due', Component: Due },
  focus: { name: 'Focus', Component: Focus },
  month: { name: 'Month', Component: Month },
  pinned: { name: 'Pinned note', Component: Pinned },
  news: { name: 'News', Component: News },
  weather: { name: 'Weather', Component: Weather },
  capture: { name: 'Capture', Component: Capture },
};

export function useWidgetOrder(): WidgetId[] {
  const { prefs } = usePrefs();
  return (prefs.panel?.widgets ?? DEFAULT_WIDGETS).filter((w): w is WidgetId => w in WIDGETS);
}

