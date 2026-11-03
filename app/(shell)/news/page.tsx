'use client';
/**
 * W News: where Grok's scheduled automations drop their digests. Today's
 * edition by segment (W.segments), past days (W.archive), and Setup (W.setup)
 * with the drop key and a ready-to-paste Grok task per kind.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Fox } from '@/components/Fox';
import { useEdition, useEditionDays, useKeyDate, markRead, rotateKey, fillWeekly, manilaDay, KIND_NAMES, NEWS_KINDS, type Edition, type NewsKind } from '@/lib/news';
import { grokPrompt, dropUrl, scheduleHint, type PromptKind } from '@/lib/newsPrompts';
import { useTasks } from '@/lib/tasks';
import { toast } from '@/lib/toast';
import './news.css';

function Segment({ e }: { e: Edition }) {
  return <section className="nw-seg" data-unread={!e.read_at}>
    <header><h2>{KIND_NAMES[e.kind]}</h2><span>{e.title}</span></header>
    {e.items.length ? <ol>{e.items.map((it, i) => <li key={i}>
      {it.link ? <a href={it.link} target="_blank" rel="noreferrer">{it.headline}</a> : <strong>{it.headline}</strong>}
      {it.summary && <p>{it.summary}</p>}
      {it.link && <small>{new URL(it.link).hostname.replace(/^www\./, '')}</small>}
    </li>)}</ol> : <pre className="nw-raw">{e.body}</pre>}
  </section>;
}

function Setup() {
  const keyDate = useKeyDate();
  const qc = useQueryClient();
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<PromptKind>('ai-digest');
  const make = async () => {
    if (keyDate.data && !confirm('A new key stops every Grok task that uses the old one until you paste the new prompts. Make a new key?')) return;
    setBusy(true);
    try { setKey(await rotateKey()); await qc.invalidateQueries({ queryKey: ['news', 'key'] }); }
    catch { toast('Could not make a key. Check your connection and try again.'); }
    finally { setBusy(false); }
  };
  const prompt = key ? grokPrompt(kind, dropUrl(key, kind)) : '';
  return <section className="nw-setup" data-part="W.setup">
    <h2>Connect Grok</h2>
    <ol className="nw-steps">
      <li>{keyDate.data ? <>You made a drop key on {new Date(keyDate.data).toLocaleDateString()}. It is shown only once; make a new one to see a prompt with it.</> : 'Make a drop key. Grok uses it to leave digests here; it can’t read anything.'}
        <button className="sx-pill" onClick={make} disabled={busy}>{keyDate.data ? 'Make a new key' : 'Make a key'}</button></li>
      <li>Pick an automation and copy its task into Grok as a scheduled task.</li>
    </ol>
    <div className="nw-kinds" role="tablist" aria-label="Automation">{NEWS_KINDS.map(k => <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)}>{KIND_NAMES[k]}</button>)}</div>
    <p className="nw-hint">Suggested schedule: {scheduleHint(kind)}.</p>
    {key ? <>
      <textarea className="nw-prompt" readOnly value={prompt} aria-label={`Grok task for ${KIND_NAMES[kind]}`} rows={14} />
      <button className="sx-pill" onClick={() => { void navigator.clipboard.writeText(prompt); toast('Copied. Paste it into a new Grok scheduled task.'); }}>Copy the task</button>
      <p className="nw-hint">Keep this key private: anyone with it can add news here. Copy each prompt you need now; the key is not shown again.</p>
    </> : <p className="nw-hint">The prompt appears here once you make a key.</p>}
  </section>;
}

export default function NewsPage() {
  const today = manilaDay();
  const [day, setDay] = useState(today);
  const [tab, setTab] = useState<'today' | 'setup'>('today');
  const q = useEdition(day);
  const days = useEditionDays();
  const tasks = useTasks().data ?? [];
  const qc = useQueryClient();
  const editions = useMemo(() => [...(q.data ?? [])].sort((a, b) => NEWS_KINDS.indexOf(a.kind as NewsKind) - NEWS_KINDS.indexOf(b.kind as NewsKind)), [q.data]);

  // Reading the day marks it read.
  useEffect(() => { const unread = editions.filter(e => !e.read_at).map(e => e.id); if (unread.length) void markRead(unread).then(() => qc.invalidateQueries({ queryKey: ['news'] })); }, [editions, qc]);

  // Mondays: Sorro writes "Your week" itself from the tasks due in the next seven days.
  useEffect(() => {
    if (day !== today || new Date().getDay() !== 1 || q.isPending || editions.some(e => e.kind === 'weekly')) return;
    const end = new Date(); end.setDate(end.getDate() + 7);
    const last = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    const due = tasks.filter(t => !t.done && !t.deleted_at && t.due_on && t.due_on >= today && t.due_on <= last).sort((a, b) => a.due_on!.localeCompare(b.due_on!));
    void fillWeekly(today, due.slice(0, 12).map(t => ({ headline: t.title, summary: `Due ${t.due_on}`, link: '' }))).then(ok => { if (ok) void qc.invalidateQueries({ queryKey: ['news'] }); });
  }, [day, today, q.isPending, editions, tasks, qc]);

  return <div className="nw" data-part="W">
    <h1 className="sr-only">News</h1>
    <div className="nw-tabs" role="tablist" aria-label="News">
      <button role="tab" aria-selected={tab === 'today'} onClick={() => setTab('today')}>{day === today ? 'Today' : new Date(day + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</button>
      <button role="tab" aria-selected={tab === 'setup'} onClick={() => setTab('setup')}>Setup</button>
    </div>
    {tab === 'setup' ? <Setup /> : <div className="nw-body">
      <div className="nw-today" data-part="W.today">
        {q.isPending ? <div className="wg-skel" aria-label="Loading"><span /><span /></div>
          : q.isError ? <p className="wg-empty">Couldn’t load the news. <button onClick={() => q.refetch()}>Try again</button></p>
          : editions.length ? <div data-part="W.segments">{editions.map(e => <Segment key={e.id} e={e} />)}</div>
          : <div className="sx-empty"><Fox pose="sleep" size={52} tone="muted" /><p>{day === today ? 'No digest yet today.' : 'Nothing was filed that day.'}</p>{day === today && <button className="sx-pill" onClick={() => setTab('setup')}>Connect Grok</button>}</div>}
      </div>
      <nav className="nw-archive" aria-label="Past editions" data-part="W.archive">
        <h2>Past days</h2>
        {(days.data ?? []).length ? <ul>{(days.data ?? []).slice(0, 30).map(d => <li key={d}><button aria-current={d === day ? 'date' : undefined} onClick={() => setDay(d)}>{d === today ? 'Today' : new Date(d + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</button></li>)}</ul>
          : <p className="wg-empty">Past editions collect here.</p>}
      </nav>
    </div>}
  </div>;
}
