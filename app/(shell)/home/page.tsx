'use client';
/**
 * T1 Home: the assistant. Widgets across the top (H.widgets), the conversation
 * (H.chat), the composer pinned below (H.composer), past chats in a drawer
 * (H.threads). No side panel here: the chat has the room.
 */
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { Fox } from '@/components/Fox';
import { WIDGETS, useWidgetOrder } from '@/components/widgets/Widgets';
import { useChats, useChatMessages, sendToAssistant, useAssistantUndo, AssistantError, type ChatMessage, type ToolDone } from '@/lib/assistant';
import { suggestions } from '@/lib/assistantLogic';
import { useTasks, useTaskActions } from '@/lib/tasks';
import { useEvents } from '@/lib/events';
import { useNotebooks } from '@/lib/notes';
import { ymd } from '@/lib/days';
import { foxBusy, foxGlad } from '@/lib/foxMood';
import { askLocalModel, useLocalModel } from '@/lib/localModel';
import '@/components/side-panel.css';
import './home.css';

const CONTEXT: Record<string, string> = { tasks: 'the user was looking at Tasks', calendar: 'the user was looking at the Calendar', notebooks: 'the user was looking at Notes', vault: 'the user was looking at Vault', news: 'the user was looking at News' };

function ToolCard({ t, onUndo }: { t: ToolDone; onUndo: () => void }) {
  return <div className="hm-tool" data-undone={!!t.undone}>
    <Icon name="check" size={14} />
    <span>{t.undone ? `Undone: ${t.label}` : t.label}</span>
    {t.link && !t.undone && <Link href={t.link}>Open</Link>}
    {t.undo && !t.undone && <button onClick={onUndo}>Undo</button>}
  </div>;
}

function Text({ s }: { s: string }) {
  return <>{s.split(/\n{2,}/).map((block, i) => {
    const lines = block.split('\n');
    if (lines.every(l => /^\s*([-*•]|\d+\.)\s/.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{l.replace(/^\s*([-*•]|\d+\.)\s/, '').replace(/\*\*/g, '')}</li>)}</ul>;
    return <p key={i}>{block.replace(/\*\*/g, '')}</p>;
  })}</>;
}

export default function HomePage() {
  const qc = useQueryClient();
  const widgets = useWidgetOrder();
  const chats = useChats();
  const [chatId, setChatId] = useState<string | null>(null);
  const saved = useChatMessages(chatId);
  const [local, setLocal] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [threads, setThreads] = useState(false);
  const undo = useAssistantUndo();
  const local_ = useLocalModel();
  const end = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  const tasks = useTasks().data ?? [];
  const TA = useTaskActions();
  const tomorrow = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d; }, []);
  const eventsTomorrow = (useEvents(tomorrow, 1).data ?? []).filter(e => !e.deleted_at).length;
  const notebooks = (useNotebooks().data ?? []).map(b => b.name);
  const today = ymd(new Date());
  const ideas = suggestions({ dueToday: tasks.filter(t => !t.done && t.due_on === today).length, overdue: tasks.filter(t => !t.done && t.due_on && t.due_on < today).length, eventsTomorrow, notebooks });

  const messages = [...(saved.data ?? []), ...local];
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [messages.length, busy]);

  async function send(text: string, context?: string) {
    const t = text.trim();
    if (!t || busy) return;
    const stamp = new Date().toISOString();
    setLocal(l => [...l, { id: 'u' + stamp, role: 'user', content: t, tools: [], created_at: stamp }]);
    setDraft(''); setBusy(true); foxBusy(1);
    try {
      // Offline with the small model downloaded: answer from what this device has cached, change nothing.
      if (!navigator.onLine && local_.status === 'ready') {
        const facts = ['Open tasks:', ...tasks.filter(x => !x.done && !x.deleted_at).slice(0, 40).map(x => `- ${x.title}${x.due_on ? ` (due ${x.due_on})` : ''}`)].join('\n');
        const answer = await askLocalModel(t, facts);
        setLocal(l => [...l, { id: 'a' + stamp, role: 'assistant', content: answer + '\n\n(Answered offline on this device.)', tools: [], created_at: new Date().toISOString() }]);
        return;
      }
      const r = await sendToAssistant(chatId, t, context);
      if (r.tools.length) foxGlad();
      // A repeating task the assistant ticked gets its next instance here, as a tick in Tasks would.
      for (const t of r.tools) if (t.name === 'complete_task' && t.undo) TA.comeBack(t.undo.id);
      setLocal(l => [...l, { id: 'a' + stamp, role: 'assistant', content: r.text, tools: r.tools, created_at: new Date().toISOString() }]);
      if (r.chat_id !== chatId) setChatId(r.chat_id);
      await qc.invalidateQueries({ queryKey: ['chat', r.chat_id] });
      setLocal([]);
    } catch (e) {
      const err = e as AssistantError;
      const wait = err.retry ? ` Try again in about ${err.retry} seconds.` : '';
      if (err.chatId && err.chatId !== chatId) setChatId(err.chatId);
      setLocal(l => [...l, { id: 'e' + stamp, role: 'assistant', content: '', tools: err.tools ?? [], created_at: stamp, error: (err.message || 'Something went wrong.') + wait + (err.tools?.length ? ' What it already did is below.' : '') }]);
    } finally { setBusy(false); foxBusy(-1); }
  }

  // Ask Sorro from the side panel lands here with the question and where it came from.
  useEffect(() => {
    if (asked.current) return;
    const p = new URLSearchParams(location.search);
    const q = p.get('ask');
    if (!q) return;
    asked.current = true;
    history.replaceState(null, '', '/home/');
    void send(q, CONTEXT[p.get('ctx') ?? ''] ?? undefined);
  });

  const retry = (m: ChatMessage) => { const i = messages.indexOf(m); const last = [...messages.slice(0, i)].reverse().find(x => x.role === 'user'); setLocal(l => l.filter(x => x !== m && x.id !== last?.id)); if (last) void send(last.content); };
  const doUndo = (m: ChatMessage, t: ToolDone) => {
    if (!t.undo) return;
    const tools = m.tools.map(y => y === t ? { ...y, undone: true } : y);
    undo.mutate({ undo: t.undo, at: new Date().toISOString(), messageId: local.includes(m) ? undefined : m.id, tools });
    const mark = (list: ChatMessage[]) => list.map(x => x === m ? { ...x, tools } : x);
    if (local.includes(m)) setLocal(mark); else qc.setQueryData<ChatMessage[]>(['chat', chatId], prev => prev ? mark(prev) : prev);
  };

  return <div className="hm" data-part="H">
    <h1 className="sr-only">Home</h1>
    {widgets.length > 0 && <div className="hm-widgets" data-part="H.widgets">{widgets.map(id => { const W = WIDGETS[id].Component; return <W key={id} />; })}</div>}

    <div className="hm-bar">
      <button className="hm-chip" onClick={() => setThreads(true)}><Icon name="clock" size={14} />Past chats</button>
      {chatId && <button className="hm-chip" onClick={() => { setChatId(null); setLocal([]); }}><Icon name="plus" size={14} />New chat</button>}
    </div>

    <section className="hm-chat" data-part="H.chat" aria-live="polite">
      {!messages.length && !busy && <div className="hm-start">
        <Fox pose="sit" size={44} tone="muted" />
        <p>Ask about your week, or tell Sorro what to add.</p>
        <div className="hm-ideas">{ideas.map(s => <button key={s} className="hm-chip" onClick={() => send(s)}>{s}</button>)}</div>
      </div>}
      {messages.map(m => <div key={m.id} className="hm-msg" data-role={m.role}>
        {m.error ? <><div className="hm-error" role="alert"><p>{m.error}</p><button className="hm-chip" onClick={() => retry(m)}>Try again</button></div>{m.tools.map((t, i) => <ToolCard key={i} t={t} onUndo={() => doUndo(m, t)} />)}</>
          : <>{m.content && <div className="hm-text"><Text s={m.content} /></div>}{m.tools.map((t, i) => <ToolCard key={i} t={t} onUndo={() => doUndo(m, t)} />)}</>}
      </div>)}
      {busy && <div className="hm-msg" data-role="assistant"><div className="hm-typing"><Fox pose="run" size={18} tone="muted" /><span>Working on it</span></div></div>}
      <div ref={end} />
    </section>

    <form className="hm-composer" data-part="H.composer" onSubmit={e => { e.preventDefault(); void send(draft); }}>
      <textarea value={draft} rows={1} placeholder="Ask Sorro or tell it what to add" aria-label="Message Sorro"
        onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px'; }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft); } }} />
      <button className="sx-pill" disabled={!draft.trim() || busy} aria-label="Send"><Icon name="send" size={16} /></button>
    </form>

    {threads && <div className="sx-sheet-back" onClick={() => setThreads(false)}>
      <div className="sx-sheet hm-threads" role="dialog" aria-modal="true" aria-label="Past chats" data-part="H.threads" onClick={e => e.stopPropagation()}>
        <span className="sx-sheet-grip" aria-hidden="true" />
        {chats.isPending ? <p className="wg-empty">Loading your chats.</p> : chats.data?.length
          ? chats.data.map(c => <button key={c.id} aria-current={c.id === chatId ? 'page' : undefined} onClick={() => { setChatId(c.id); setLocal([]); setThreads(false); }}><Icon name="clock" size={18} /><span>{c.title}</span></button>)
          : <p className="wg-empty">No chats yet. Your first one shows here.</p>}
      </div>
    </div>}
  </div>;
}
