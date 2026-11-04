'use client';
/**
 * The conversation with the fox: past chats, messages, composer. Home shows it
 * full page (H.chat); the fox sheet shows it on every other tab (F.chat). Both
 * share one current chat through useCurrentChat.
 */
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { Fox } from '@/components/Fox';
import { useChats, useChatMessages, sendToAssistant, useAssistantUndo, useCurrentChat, AssistantError, type ChatMessage, type ToolDone } from '@/lib/assistant';
import { suggestions } from '@/lib/assistantLogic';
import { useTasks, useTaskActions } from '@/lib/tasks';
import { useEvents } from '@/lib/events';
import { useNotebooks } from '@/lib/notes';
import { ymd } from '@/lib/days';
import { foxBusy, foxGlad } from '@/lib/foxMood';
import { askLocalModel, useLocalModel } from '@/lib/localModel';
import '@/components/side-panel.css';
import '@/app/(shell)/home/home.css';

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

let composer: HTMLTextAreaElement | null = null;
/** Puts the cursor in the chat's message box, if a chat is on screen. */
export function focusFoxComposer() { composer?.focus(); }

export function FoxChat({ variant, context, initial, onReply }: { variant: 'page' | 'sheet'; context?: string; initial?: { text: string; context?: string }; onReply?: () => void }) {
  const qc = useQueryClient();
  const chats = useChats();
  const [chatId, setChatId] = useCurrentChat();
  const saved = useChatMessages(chatId);
  const [local, setLocal] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState('');
  const [threads, setThreads] = useState(false);
  const undo = useAssistantUndo();
  const local_ = useLocalModel();
  const end = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  const tasks = useTasks().data ?? [];
  const TA = useTaskActions();
  const tomorrow = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d; }, []);
  const eventsTomorrow = (useEvents(tomorrow, 1).data ?? []).filter(e => !e.deleted_at).length;
  const notebooks = (useNotebooks().data ?? []).map(b => b.name);
  const today = ymd(new Date());
  const ideas = suggestions({ dueToday: tasks.filter(t => !t.done && t.due_on === today).length, overdue: tasks.filter(t => !t.done && t.due_on && t.due_on < today).length, eventsTomorrow, notebooks });

  const messages = [...(saved.data ?? []), ...local];
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [messages.length, busy, stream]);

  async function send(text: string, ctx = context) {
    const t = text.trim();
    if (!t || busy) return;
    const stamp = new Date().toISOString();
    setLocal(l => [...l, { id: 'u' + stamp, role: 'user', content: t, tools: [], created_at: stamp }]);
    setDraft(''); setBusy(true); setStream(''); foxBusy(1);
    try {
      // Offline with the small model downloaded: answer from what this device has cached, change nothing.
      if (!navigator.onLine && local_.status === 'ready') {
        const facts = ['Open tasks:', ...tasks.filter(x => !x.done && !x.deleted_at).slice(0, 40).map(x => `- ${x.title}${x.due_on ? ` (due ${x.due_on})` : ''}`)].join('\n');
        const answer = await askLocalModel(t, facts);
        setLocal(l => [...l, { id: 'a' + stamp, role: 'assistant', content: answer + '\n\n(Answered offline on this device.)', tools: [], created_at: new Date().toISOString() }]);
        return;
      }
      const r = await sendToAssistant(chatId, t, ctx, setStream);
      if (r.tools.length) foxGlad();
      onReply?.();
      // A repeating task the assistant ticked gets its next instance here, as a tick in Tasks would.
      for (const x of r.tools) if (x.name === 'complete_task' && x.undo) TA.comeBack(x.undo.id);
      setLocal(l => [...l, { id: 'a' + stamp, role: 'assistant', content: r.text, tools: r.tools, created_at: new Date().toISOString() }]);
      if (r.chat_id !== chatId) setChatId(r.chat_id);
      await qc.invalidateQueries({ queryKey: ['chat', r.chat_id] });
      setLocal([]);
    } catch (e) {
      const err = e as AssistantError;
      const wait = err.retry ? ` Try again in about ${err.retry} seconds.` : '';
      if (err.chatId && err.chatId !== chatId) setChatId(err.chatId);
      setLocal(l => [...l, { id: 'e' + stamp, role: 'assistant', content: '', tools: err.tools ?? [], created_at: stamp, error: (err.message || 'Something went wrong.') + wait + (err.tools?.length ? ' What it already did is below.' : '') }]);
    } finally { setBusy(false); setStream(''); foxBusy(-1); }
  }

  useEffect(() => {
    if (!initial || sentInitial.current) return;
    sentInitial.current = true;
    void send(initial.text, initial.context ?? context);
  });

  const retry = (m: ChatMessage) => { const i = messages.indexOf(m); const last = [...messages.slice(0, i)].reverse().find(x => x.role === 'user'); setLocal(l => l.filter(x => x !== m && x.id !== last?.id)); if (last) void send(last.content); };
  const doUndo = (m: ChatMessage, t: ToolDone) => {
    if (!t.undo) return;
    const tools = m.tools.map(y => y === t ? { ...y, undone: true } : y);
    undo.mutate({ undo: t.undo, at: new Date().toISOString(), messageId: local.includes(m) ? undefined : m.id, tools });
    const mark = (list: ChatMessage[]) => list.map(x => x === m ? { ...x, tools } : x);
    if (local.includes(m)) setLocal(mark); else qc.setQueryData<ChatMessage[]>(['chat', chatId], prev => prev ? mark(prev) : prev);
  };
  const page = variant === 'page';

  return <>
    <div className="hm-bar">
      <button className="hm-chip" onClick={() => setThreads(true)}><Icon name="clock" size={14} />Past chats</button>
      {chatId && <button className="hm-chip" onClick={() => { setChatId(null); setLocal([]); }}><Icon name="plus" size={14} />New chat</button>}
    </div>

    <section className="hm-chat" data-part={page ? 'H.chat' : 'F.chat'} aria-live="polite">
      {!messages.length && !busy && <div className="hm-start">
        <Fox pose="sit" size={page ? 44 : 32} tone="muted" />
        <p>{page ? 'Ask about your week, or tell Sorro what to add.' : 'Tell me what to add, or ask about this page.'}</p>
        {page && <div className="hm-ideas">{ideas.map(s => <button key={s} className="hm-chip" onClick={() => send(s)}>{s}</button>)}</div>}
      </div>}
      {messages.map(m => <div key={m.id} className="hm-msg" data-role={m.role}>
        {m.error ? <><div className="hm-error" role="alert"><p>{m.error}</p><button className="hm-chip" onClick={() => retry(m)}>Try again</button></div>{m.tools.map((t, i) => <ToolCard key={i} t={t} onUndo={() => doUndo(m, t)} />)}</>
          : <>{m.content && <div className="hm-text"><Text s={m.content} /></div>}{m.tools.map((t, i) => <ToolCard key={i} t={t} onUndo={() => doUndo(m, t)} />)}</>}
      </div>)}
      {busy && <div className="hm-msg" data-role="assistant">{stream
        ? <div className="hm-text"><Text s={stream} /></div>
        : <div className="hm-typing"><Fox pose="run" size={18} tone="muted" /><span>Working on it</span></div>}</div>}
      <div ref={end} />
    </section>

    <form className="hm-composer" data-part="H.composer" onSubmit={e => { e.preventDefault(); void send(draft); }}>
      <textarea ref={el => { if (el) composer = el; else if (composer && !composer.isConnected) composer = null; }} value={draft} rows={1} placeholder="Ask Sorro or tell it what to add" aria-label="Message Sorro"
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
  </>;
}
