'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { CircleBuddy } from '@/components/CircleBuddy';
import { Bar } from '@/components/Skeleton';
import { useTasks, useLists, useTaskActions } from '@/lib/tasks';
import { useEvents, weekStart } from '@/lib/events';
import { useNotes, whenLabel } from '@/lib/notes';
import { useMyIdentity } from '@/lib/people';
import { usePrefs } from '@/lib/prefs';
import { preview } from '@/lib/md';
import { toast } from '@/lib/toast';
import { ymd } from '@/lib/days';

const FocusHub=dynamic(()=>import('@/components/FocusHub').then(m=>m.FocusHub),{ssr:false});
export default function HomePage() {
  const [now] = useState(() => new Date());
  const [day, setDay] = useState(() => new Date());
  const [ws] = useState(() => weekStart(new Date()));
  const { prefs } = usePrefs();
  const me = useMyIdentity();
  const tasks = useTasks();
  const { data: lists = [] } = useLists();
  const events = useEvents(ws);
  const notes = useNotes();
  const A = useTaskActions();
  const [focus,setFocus]=useState(false);
  const [draft, setDraft] = useState('');
  const [justDone, setJustDone] = useState<Set<string>>(new Set());
  const today = ymd(now), chosen = ymd(day);
  const open = (tasks.data || []).filter(t => !t.done && !t.deleted_at).sort((a,b) => (a.due_on || '9999').localeCompare(b.due_on || '9999')).slice(0,5);
  const agenda = (events.data || []).filter(e => new Date(e.starts_at) < new Date(day.getFullYear(),day.getMonth(),day.getDate()+1) && new Date(e.ends_at) > new Date(day.getFullYear(),day.getMonth(),day.getDate())).sort((a,b) => a.starts_at.localeCompare(b.starts_at));
  const recent = [...(notes.data || [])].sort((a,b) => b.updated_at.localeCompare(a.updated_at)).slice(0,3);
  const addTask = (e: React.FormEvent) => {
    e.preventDefault(); if (!draft.trim() || A.create.isPending) return;
    A.create.mutate({ id:crypto.randomUUID(), title:draft.trim(), list_id:lists[0]?.id || null, due_on:today }, { onSuccess:() => { setDraft(''); toast('Task added'); } });
  };
  const time = (value: string) => new Date(value).toLocaleTimeString([], { hour:'numeric', minute:'2-digit', hour12:!prefs.time24 });
  return <div className="today-page">
    <div className="today-heading"><div><h1>{now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'}{me.name ? `, ${me.name.split(' ')[0]}` : ''}.</h1><p>A little structure. A lot of possibility.</p></div><CircleBuddy size={62} happy /></div>
    <div className="today-datebar"><time dateTime={today}>{now.toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}</time><span>Your day, at your pace</span><button className="studio-button" onClick={()=>setFocus(true)}><Icon name="clock" size={16}/>Focus</button><Link href="/notebooks/?focus=notes" className="studio-button"><Icon name="pen" size={16} />Write a note</Link></div>
    <div className="today-layout">
      <section className="today-panel" aria-labelledby="today-agenda-title"><div className="today-panel-head"><h2 id="today-agenda-title">Your schedule</h2><Link href="/calendar/" className="studio-text-button">Calendar<Icon name="chev" size={14} /></Link></div>
        <div className="today-week" aria-label="Choose a day this week">{Array.from({ length:7 },(_,i) => { const date=new Date(ws);date.setDate(date.getDate()+i);return <button key={i} className={ymd(date)===chosen?'selected':''} onClick={() => setDay(date)} aria-pressed={ymd(date)===chosen} aria-label={date.toLocaleDateString([], { weekday:'long',month:'long',day:'numeric' })}><span>{date.toLocaleDateString([], { weekday:'short' }).slice(0,2)}</span><strong>{date.getDate()}</strong></button>; })}</div>
        {events.isPending ? <TodayRows count={3} /> : events.isError ? <Retry onRetry={() => void events.refetch()} /> : agenda.length ? agenda.slice(0,5).map(e => <Link key={e.id} href="/calendar/" className="today-event"><time>{e.all_day?'All day':time(e.starts_at)}</time><span className="today-event-dot" style={{ background:e.color }} /><span className="today-event-content"><strong>{e.title || 'Untitled event'}</strong><small>{e.location ? <><Icon name="pin" size={12} />{e.location}</> : e.all_day ? 'On your calendar' : `${time(e.starts_at)} – ${time(e.ends_at)}`}</small></span></Link>) : <div className="today-empty"><strong>A little breathing room.</strong>No events {chosen===today?'today':'on this day'}. Plan a study session or leave space for yourself.<br/><Link href="/calendar/" className="studio-text-button">Plan something<Icon name="plus" size={14}/></Link></div>}
      </section>
      <section className="today-panel" aria-labelledby="today-tasks-title"><div className="today-panel-head"><h2 id="today-tasks-title">Your next steps</h2><Link href="/tasks/" className="studio-text-button">All tasks<Icon name="chev" size={14}/></Link></div>
        {tasks.isPending ? <TodayRows count={4}/> : tasks.isError ? <Retry onRetry={() => void tasks.refetch()} /> : open.length ? open.map(t => <div className={`today-task ${justDone.has(t.id)?'is-done':''}`} key={t.id}><button className="today-check" aria-label={`Complete ${t.title}`} disabled={justDone.has(t.id)} onClick={() => {setJustDone(s=>new Set(s).add(t.id));A.complete.mutate({id:t.id,done:true}, {onError:()=>setJustDone(s=>{const next=new Set(s);next.delete(t.id);return next;})});}}>{justDone.has(t.id)&&<Icon name="check" size={14}/>}</button><Link href="/tasks/"><strong>{t.title}</strong><small>{t.due_on ? t.due_on<today?'Overdue':t.due_on===today?'Today':new Date(t.due_on+'T12:00:00').toLocaleDateString([], {month:'short',day:'numeric'}) : 'No due date'}{lists.find(l=>l.id===t.list_id)?.name ? ` · ${lists.find(l=>l.id===t.list_id)?.name}`:''}</small></Link>{t.priority==='high'&&<span className="today-task-priority">Priority</span>}</div>) : <div className="today-empty"><strong>You’re all caught up.</strong>Capture your next step below. Small is a good place to start.</div>}
        <form className="today-quick-task" onSubmit={addTask}><Icon name="plus" size={18}/><input aria-label="Add a task for today" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Add a task for today…"/><button type="submit" disabled={!draft.trim() || A.create.isPending} aria-label="Save task"><Icon name="send" size={17}/></button></form>
      </section>
    </div>
    <section className="today-notes"><div className="today-section-head"><h2>Pick up a thought</h2><Link href="/notebooks/" className="studio-text-button">Your library<Icon name="chev" size={14}/></Link></div>
      {notes.isPending ? <div className="today-note-grid">{[0,1,2].map(i=><div className="today-note" key={i}><Bar w={28} h={28}/><Bar w="70%" h={16}/><Bar w="90%" h={12}/><Bar w="40%" h={10}/></div>)}</div> : notes.isError ? <Retry onRetry={()=>void notes.refetch()}/> : recent.length ? <div className="today-note-grid">{recent.map(n=><Link className="today-note" key={n.id} href={`/notebooks/?focus=notes&note=${encodeURIComponent(n.id)}`}><Icon name="book" size={22} color="var(--studio-blue)"/><strong>{n.title || 'Untitled note'}</strong><p>{preview(n.body) || 'A thought waiting to grow.'}</p><small>Edited {whenLabel(n.updated_at)}</small></Link>)}</div> : <div className="today-note-grid"><Link className="today-note" href="/notebooks/?focus=notes"><Icon name="pen" size={22}/><strong>Start with a blank page</strong><p>Class notes, ideas, and everything in between.</p></Link><Link className="today-note" href="/notebooks/?focus=canvas"><Icon name="grid" size={22}/><strong>Give an idea some space</strong><p>Draw, connect, and arrange on a whiteboard.</p></Link><Link className="today-note" href="/notebooks/?focus=journal"><Icon name="book" size={22}/><strong>Keep a little of today</strong><p>Your journal is ready when you are.</p></Link></div>}
    </section>
    <div className="today-footer"><CircleBuddy size={28}/><span>Make this space work for you.</span><Link href="/more/" className="studio-text-button">Explore the rest of Basedly<Icon name="chev" size={14}/></Link></div>
    {focus&&createPortal(<div className="studio-help-backdrop" onClick={()=>setFocus(false)}><div role="dialog" aria-modal="true" aria-label="Focus timer" onClick={e=>e.stopPropagation()}><FocusHub onClose={()=>setFocus(false)}/></div></div>,document.body)}
  </div>;
}
function TodayRows({count}:{count:number}) {return <div role="status" aria-label="Loading your day">{Array.from({length:count},(_,i)=><div className="today-task" key={i}><Bar w={24} h={24}/><span style={{flex:1}}><Bar w={`${80-i*12}%`} h={14}/><Bar w="35%" h={10} style={{marginTop:10}}/></span></div>)}</div>;}
function Retry({onRetry}:{onRetry:()=>void}) {return <div className="today-empty" role="alert">Couldn’t load this right now.<br/><button onClick={onRetry} className="studio-text-button">Try again</button></div>;}
