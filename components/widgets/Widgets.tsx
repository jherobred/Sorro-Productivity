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

const FOCUS_KEY = 'sorro-focus-end';
function Focus() {
  const [end, setEnd] = useState<number | null>(() => { try { const v = Number(localStorage.getItem(FOCUS_KEY)); return v > Date.now() ? v : null; } catch { return null; } });
  const [, tick] = useState(0);
  useEffect(() => { if (!end) return; const t = setInterval(() => { if (Date.now() >= end) { setEnd(null); try { localStorage.removeItem(FOCUS_KEY); } catch {} } tick(n => n + 1); }, 1000); return () => clearInterval(t); }, [end]);
  const start = (min: number) => { const v = Date.now() + min * 60_000; setEnd(v); try { localStorage.setItem(FOCUS_KEY, String(v)); } catch {} };
  const left = end ? Math.max(0, end - Date.now()) : 0;
  const mm = String(Math.floor(left / 60_000)).padStart(2, '0'), ss = String(Math.floor(left / 1000) % 60).padStart(2, '0');
  return <Frame id="focus" title="Focus">
    {end ? <div className="wg-focus"><span className="wg-big" aria-live="off">{mm}:{ss}</span><button className="wg-btn" onClick={() => { setEnd(null); try { localStorage.removeItem(FOCUS_KEY); } catch {} }}>Stop</button></div>
      : <div className="wg-focus"><button className="wg-btn" onClick={() => start(25)}>25 min</button><button className="wg-btn" onClick={() => start(50)}>50 min</button></div>}
  </Frame>;
}

function Month() {
  const first = useMemo(() => { const d = startOfDay(); d.setDate(1); return d; }, []);
  const lead = (first.getDay() + 6) % 7;
  const gridStart = useMemo(() => { const d = new Date(first); d.setDate(d.getDate() - lead); return d; }, [first, lead]);
  const q = useEvents(gridStart, 42);
  const count = new Map<string, number>();
  for (const e of q.data ?? []) if (!e.deleted_at) { const k = ymd(new Date(e.starts_at)); count.set(k, (count.get(k) ?? 0) + 1); }
  const today = ymd(new Date());
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(d.getDate() + i); return d; });
  return <Frame id="month" title={first.toLocaleDateString([], { month: 'long', year: 'numeric' })} href="/calendar/">
    <div className="wg-month" role="grid">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="wg-dow">{d}</span>)}
      {days.map(d => { const k = ymd(d); const n = count.get(k) ?? 0; return <Link key={k} href={`/calendar/?day=${k}`} className="wg-day" data-out={d.getMonth() !== first.getMonth()} data-today={k === today} data-load={Math.min(n, 4)} aria-label={`${d.toDateString()}, ${n} event${n === 1 ? '' : 's'}`}>{d.getDate()}</Link>; })}
    </div>
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

