'use client';
import {syncMessage} from '@/lib/syncMessage';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Capacitor } from '@capacitor/core';
import { Icon } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import { usePrefs } from '@/lib/prefs';
import { toast } from '@/lib/toast';
import { ago } from '@/lib/notify';
import { deadlineClock } from '@/lib/todayCycle';
import { useTaskActions } from '@/lib/tasks';
import { UST_CANVAS_URL } from '@/lib/canvasFeed';
import { setCanvasAlerts, useCanvas, useCanvasAlertsOn, useCanvasConnect, type CanvasNews, type CanvasTodo } from '@/lib/canvasLms';
import './canvasLms.css';

/* One shared clock per interval, so a dozen countdowns tick together. */
const clocks = new Map<number, { timer: ReturnType<typeof setInterval>; subs: Set<(n: number) => void> }>();
function useNow(every: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let clock = clocks.get(every);
    if (!clock) {
      const subs = new Set<(n: number) => void>();
      clock = { subs, timer: setInterval(() => { const t = Date.now(); for (const f of subs) f(t); }, every) };
      clocks.set(every, clock);
    }
    clock.subs.add(setNow);
    return () => {
      clock!.subs.delete(setNow);
      if (!clock!.subs.size) { clearInterval(clock!.timer); clocks.delete(every); }
    };
  }, [every]);
  return now;
}

function dueLabel(due: number | null, now: number, time24: boolean): string {
  if (due === null) return 'No due date';
  const day = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((day(due) - day(now)) / 86_400_000);
  const date = new Date(due);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !time24 });
  // The weekday always travels with its date, so "Tuesday" is never a guess at which Tuesday.
  const on = date.toLocaleDateString(undefined, { weekday: days > 1 && days < 7 ? 'long' : 'short', month: 'short', day: 'numeric', ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
  if (days === 0) return `Due today, ${on} · ${time}`;
  if (days === 1) return `Due tomorrow, ${on} · ${time}`;
  if (days === -1) return `Was due yesterday, ${on} · ${time}`;
  return `${days < 0 ? 'Was due' : 'Due'} ${on} · ${time}`;
}

/** Seconds only for work due within three days. */
function Countdown({ due }: { due: number }) {
  const now = useNow(1000);
  const clock = deadlineClock(due, now);
  return <span className={'lms-count' + (clock.late ? ' is-late' : '')} role="timer" aria-live="off">{clock.late ? 'late ' : 'in '}{clock.text}</span>;
}

function TodoRow({ item, now, time24, stacked = false }: { item: CanvasTodo; now: number; time24: boolean; stacked?: boolean }) {
  const A = useTaskActions();
  const { task } = item;
  const late = !task.done && item.due !== null && item.due < now;
  const soon = !task.done && item.due !== null && item.due - now < 72 * 3_600_000 && now - item.due < 24 * 3_600_000;
  const toggle = () => {
    A.complete.mutate({ id: task.id, done: !task.done });
    toast(task.done ? `Back on your list: ${task.title}` : `Done: ${task.title}`, () => A.complete.mutate({ id: task.id, done: task.done }), { tone: task.done ? 'info' : 'success', icon: task.done ? 'undo' : 'check' });
  };
  return (
    <li className={'lms-todo' + (task.done ? ' is-done' : '') + (late ? ' is-late' : '')}>
      <button type="button" className="lms-check" aria-pressed={task.done} aria-label={task.done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`} onClick={toggle}>
        <Icon name="check" size={11} />
      </button>
      <div className="lms-todo-body">
        <a className="lms-todo-title" href={item.url ?? UST_CANVAS_URL} target="_blank" rel="noopener noreferrer">{task.title}</a>
        <span className="lms-todo-meta">{item.course && <b>{item.course}</b>}<span>{dueLabel(item.due, now, time24)}</span></span>
        {soon && stacked && <Countdown due={item.due!} />}
      </div>
      {soon && !stacked && <Countdown due={item.due!} />}
    </li>
  );
}

function NewsRow({ item, onRead, withText }: { item: CanvasNews; onRead: (id: string) => void; withText: boolean }) {
  const { note } = item;
  return (
    <li className={'lms-news' + (note.read_at ? '' : ' is-unread')}>
      <a href={note.href ?? UST_CANVAS_URL} target="_blank" rel="noopener noreferrer" onClick={() => { if (!note.read_at) onRead(note.id); }}>
        <span className="lms-news-dot" aria-hidden="true" />
        <span className="lms-news-body">
          <b>{note.title}</b>
          <small>{[item.course, ago(note.created_at)].filter(Boolean).join(' · ')}{note.read_at ? '' : ' · New'}</small>
          {withText && item.text && <span className="lms-news-text">{item.text}</span>}
        </span>
      </a>
    </li>
  );
}

/** Everything a Canvas section needs, plus the connect sheet it can open. */
function useSection() {
  const canvas = useCanvas();
  const alertsOn = useCanvasAlertsOn();
  const { prefs } = usePrefs();
  const [connecting, setConnecting] = useState(false);
  const now = useNow(30_000);
  const open = canvas.todos.filter((t) => !t.task.done);
  const unread = canvas.news.filter((n) => !n.note.read_at).length;
  const weekAhead = open.filter((t) => t.due !== null && t.due - now < 7 * 86_400_000).length;

  const sync = async () => {
    const result = await canvas.sync();
    if (result.message === 'Already syncing') return;
    toast(result.ok ? `UST Canvas synced: ${result.message}` : syncMessage(result.message), undefined, { tone: result.ok ? 'success' : 'danger', icon: 'refresh' });
  };

  const toggleAlerts = async () => {
    const result = await setCanvasAlerts(!alertsOn);
    const native = Capacitor.isNativePlatform();
    if (result === 'on') toast(native
      ? 'Notifications on. New announcements and to-dos alert you, and deadlines remind you a day and an hour before.'
      : 'Notifications on. New announcements and to-dos alert you while Basedly is open in this browser.', undefined, { tone: 'success', icon: 'bell' });
    if (result === 'off') toast('Canvas notifications off', undefined, { icon: 'bell' });
    if (result === 'blocked') toast('Notifications are blocked here. Allow them for Basedly in your settings, then try again.', undefined, { tone: 'danger', icon: 'bell' });
    if (result === 'unsupported') toast('This browser cannot show notifications. The phone app can.', undefined, { icon: 'bell' });
  };

  const statusLine = canvas.busy ? 'Syncing now…'
    : canvas.status?.error ? syncMessage(canvas.status.error)
      : canvas.status?.lastSync ? `Synced ${ago(canvas.status.lastSync)}` : 'Not synced yet';

  return { canvas, alertsOn, time24: prefs.time24, connecting, setConnecting, now, open, unread, weekAhead, sync, toggleAlerts, statusLine };
}

type Section = ReturnType<typeof useSection>;

/** Today shows news once. Assignment work remains in My Tasks. */
export function CanvasLmsSummary() {
  const s = useSection();
  return <section className="lms is-summary" aria-label="Canvas updates"><Head s={s}/>{s.canvas.on
    ? <><p className="canvas-summary-line">{s.weekAhead} assignments due within a week · {s.unread} unread announcements <Link href="/tasks/">Open My Tasks</Link></p>
      {!!s.canvas.news.length && <details><summary>Latest announcements</summary><ul>{s.canvas.news.slice(0,3).map(item=><NewsRow key={item.note.id} item={item} onRead={s.canvas.markRead} withText={false}/>)}</ul></details>}</>
    : !s.canvas.loading && <ConnectCall s={s}/>}{s.connecting && <CanvasConnectSheet initialUrl={s.canvas.status?.baseUrl} onClose={()=>s.setConnecting(false)}/>}</section>;
}

function Head({ s, children }: { s: Section; children?: React.ReactNode }) {
  const connected = s.canvas.on;
  return (
    <div className="lms-head">
      <span className="lms-mark" aria-hidden="true">C</span>
      <div className="lms-title">
        <h2>UST Canvas</h2>
        <p className={s.canvas.status?.error && !s.canvas.busy ? 'is-error' : undefined}>
          {s.canvas.loading ? 'Checking the connection…' : connected ? s.statusLine : s.canvas.status?.connected ? 'Paused in Settings' : 'To-dos and announcements from Canvas'}
        </p>
      </div>
      {children}
      {connected && (
        <>
          <button type="button" className="lms-icon" aria-pressed={s.alertsOn} aria-label={s.alertsOn ? 'Turn off Canvas notifications' : 'Notify me about Canvas'} title={s.alertsOn ? 'Notifications on' : 'Notify me'} onClick={() => void s.toggleAlerts()}>
            <Icon name="bell" size={16} />
          </button>
          <button type="button" className={'lms-icon' + (s.canvas.busy ? ' is-busy' : '')} aria-label="Sync Canvas now" title="Sync now" disabled={s.canvas.busy} onClick={() => void s.sync()}>
            <Icon name="refresh" size={16} />
          </button>
        </>
      )}
    </div>
  );
}

function ConnectCall({ s, wide }: { s: Section; wide?: boolean }) {
  return (
    <div className="lms-connect">
      <p>{wide
        ? 'See what is due on Canvas and every new announcement from your classes, right here, with a heads-up before deadlines.'
        : 'See what is due and every new announcement from your classes.'}</p>
      <button type="button" className="lms-button" onClick={() => s.setConnecting(true)}><Icon name="plug" size={15} />Connect UST Canvas</button>
    </div>
  );
}

/** Small, above Courses & tags in Notebooks: what is next, in one line. */
export function CanvasLmsStrip() {
  const s = useSection();
  const next = s.open.slice(0, 3);
  return (
    <section className="lms is-strip" aria-label="UST Canvas">
      <Head s={s} />
      {s.canvas.on ? (
        <div className="lms-strip-row">
          {next.map((item) => (
            <a key={item.task.id} className="lms-chip" href={item.url ?? UST_CANVAS_URL} target="_blank" rel="noopener noreferrer">
              <i aria-hidden="true" />
              <span><b>{item.task.title}</b><small>{[item.course, dueLabel(item.due, s.now, s.time24)].filter(Boolean).join(' · ')}</small></span>
            </a>
          ))}
          {!next.length && <span className="lms-chip is-quiet"><Icon name="check" size={14} />Nothing due on Canvas</span>}
          {s.unread > 0 && <Link className="lms-chip is-news" href="/tasks/"><Icon name="bell" size={14} />{s.unread} new {s.unread === 1 ? 'announcement' : 'announcements'}</Link>}
          <Link className="lms-chip is-link" href="/tasks/">All in My Tasks<Icon name="arrowR" size={14} /></Link>
        </div>
      ) : !s.canvas.loading && (
        <button type="button" className="lms-button is-small" onClick={() => s.setConnecting(true)}><Icon name="plug" size={14} />Connect</button>
      )}
      {s.connecting && <CanvasConnectSheet initialUrl={s.canvas.status?.baseUrl} onClose={() => s.setConnecting(false)} />}
    </section>
  );
}

/** Big, at the top of My Tasks' left column: the to-do list and the announcements. */
export function CanvasLmsColumn({ collapsible = false }: { collapsible?: boolean }) {
  const s = useSection();
  const [allTodos, setAllTodos] = useState(false);
  const [allNews, setAllNews] = useState(false);
  const [open, setOpen] = useState(!collapsible);
  const todos = allTodos ? s.canvas.todos : s.open.slice(0, 5);
  const news = allNews ? s.canvas.news : s.canvas.news.slice(0, 3);
  return (
    <section className={'lms is-column' + (collapsible ? ' is-collapsible' : '')} aria-label="UST Canvas">
      <Head s={s}>
        {collapsible && s.canvas.on && (
          <button type="button" className="lms-summary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {s.open.length} to do{s.unread ? ` · ${s.unread} new` : ''}<Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} />
          </button>
        )}
      </Head>
      {!s.canvas.on && !s.canvas.loading && <ConnectCall s={s} />}
      {s.canvas.on && open && (
        <>
          <div className="lms-section">
            <h3>To do <b>{s.open.length}</b>{s.weekAhead > 0 && <span>{s.weekAhead} this week</span>}</h3>
            {todos.length ? <ul className="lms-list">{todos.map((item) => <TodoRow key={item.task.id} item={item} now={s.now} time24={s.time24} stacked />)}</ul>
              : <p className="lms-empty">Nothing due on Canvas right now.</p>}
            {(s.open.length > 5 || s.canvas.todos.length > s.open.length) && (
              <button type="button" className="lms-more" onClick={() => setAllTodos((v) => !v)}>{allTodos ? 'Show less' : `Show all ${s.canvas.todos.length}, done ones too`}</button>
            )}
          </div>
          <div className="lms-section">
            <h3>Announcements {s.unread > 0 ? <b className="is-new">{s.unread} new</b> : <b>{s.canvas.news.length}</b>}</h3>
            {news.length ? <ul className="lms-list">{news.map((item) => <NewsRow key={item.note.id} item={item} onRead={s.canvas.markRead} withText={false} />)}</ul>
              : <p className="lms-empty">No announcements in the last 30 days.</p>}
            {s.canvas.news.length > 3 && <button type="button" className="lms-more" onClick={() => setAllNews((v) => !v)}>{allNews ? 'Show less' : `Show all ${s.canvas.news.length}`}</button>}
          </div>
        </>
      )}
      {s.connecting && <CanvasConnectSheet initialUrl={s.canvas.status?.baseUrl} onClose={() => s.setConnecting(false)} />}
    </section>
  );
}

/** Wide, on Today under Up next and Upcoming tasks: to-dos and announcements side by side. */
export function CanvasLmsWide() {
  const s = useSection();
  const [expanded, setExpanded] = useState(false);
  const todos = s.open.slice(0, expanded ? 12 : 4);
  const news = s.canvas.news.slice(0, expanded ? 8 : 3);
  return (
    <section className="lms is-wide" aria-label="UST Canvas">
      <Head s={s}>
        {s.canvas.on && <p className="lms-headline">{s.open.length} to do{s.weekAhead ? ` · ${s.weekAhead} due this week` : ''}{s.unread ? ` · ${s.unread} new ${s.unread === 1 ? 'announcement' : 'announcements'}` : ''}</p>}
      </Head>
      {!s.canvas.on && !s.canvas.loading && <ConnectCall s={s} wide />}
      {s.canvas.on && (
        <>
          <div className="lms-body">
            <div className="lms-section">
              <h3>To do <b>{s.open.length}</b></h3>
              {todos.length ? <ul className="lms-list">{todos.map((item) => <TodoRow key={item.task.id} item={item} now={s.now} time24={s.time24} />)}</ul>
                : <p className="lms-empty">Nothing due on Canvas. Enjoy it.</p>}
            </div>
            <div className="lms-section">
              <h3>Announcements {s.unread > 0 ? <b className="is-new">{s.unread} new</b> : <b>{s.canvas.news.length}</b>}</h3>
              {news.length ? <ul className="lms-list">{news.map((item) => <NewsRow key={item.note.id} item={item} onRead={s.canvas.markRead} withText />)}</ul>
                : <p className="lms-empty">No announcements in the last 30 days.</p>}
            </div>
          </div>
          {(s.open.length > 4 || s.canvas.news.length > 3) && (
            <button type="button" className="lms-more is-foot" onClick={() => setExpanded((v) => !v)}>{expanded ? 'Show less' : 'Show more from Canvas'}</button>
          )}
        </>
      )}
      {s.connecting && <CanvasConnectSheet initialUrl={s.canvas.status?.baseUrl} onClose={() => s.setConnecting(false)} />}
    </section>
  );
}

/**
 * Connecting: the Canvas address, already filled in for UST, and a token the
 * person makes in Canvas and pastes here. Saving runs the first sync at once,
 * so what is due shows up before the sheet closes.
 */
export function CanvasConnectSheet({ onClose, initialUrl }: { onClose: () => void; initialUrl?: string | null }) {
  const connect = useCanvasConnect();
  const [url, setUrl] = useState(initialUrl || UST_CANVAS_URL);
  const [token, setToken] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useOverlayBack(true, onClose);

  const validUrl = /^https:\/\/[^\s/]+\.[^\s/]+/.test(url.trim());
  const ready = validUrl && token.trim().length >= 20;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await connect(url, token);
      if (result.ok) {
        toast(`UST Canvas connected: ${result.message}`, undefined, { tone: 'success', icon: 'check' });
        onClose();
      } else {
        setError(result.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The connection could not be saved');
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="lms-scrim" onClick={onClose}>
      <form className="lms-sheet" role="dialog" aria-modal="true" aria-labelledby="lms-connect-title"
        onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <header>
          <span className="lms-mark" aria-hidden="true">C</span>
          <div>
            <h2 id="lms-connect-title">Connect UST Canvas</h2>
            <p>Your to-dos and announcements, synced every half hour.</p>
          </div>
          <button type="button" className="lms-icon" aria-label="Close" onClick={onClose}><Icon name="close" size={16} /></button>
        </header>

        <ol className="lms-steps">
          <li>Open <a href={`${url.replace(/\/+$/, '') || UST_CANVAS_URL}/profile/settings`} target="_blank" rel="noopener noreferrer">Canvas settings</a> (Account, then Settings).</li>
          <li>Under Approved Integrations, choose <b>New access token</b>. Name it Basedly and generate it.</li>
          <li>Copy the token. Canvas shows it only once, so paste it here straight away.</li>
        </ol>

        <label className="lms-field">
          <span>Canvas address</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" spellCheck={false} inputMode="url" />
        </label>
        <label className="lms-field">
          <span>Access token</span>
          <span className="lms-secret">
            <input type={show ? 'text' : 'password'} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste the token from Canvas" autoComplete="off" spellCheck={false} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide the token' : 'Show the token'}><Icon name="eye" size={15} /></button>
          </span>
        </label>

        {error && <p className="lms-error" role="alert">{error}</p>}
        <p className="lms-privacy"><Icon name="lock" size={13} />The token is saved to your account, readable only by you, and used by the sync on the server. It never goes into the app&rsquo;s saved cache.</p>

        <div className="lms-actions">
          <button type="button" className="lms-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="lms-button" disabled={!ready || busy}>{busy ? 'Connecting…' : 'Connect and sync'}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
