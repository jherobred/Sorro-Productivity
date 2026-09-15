'use client';
/* Student editorial workspace: user-pinned UX+AI poster colors, native system
   type, original wordmark. First viewport preserves greeting, Up Next, upcoming
   task and a quiet Rest of Today. Cutout covers are the signature interaction. */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useTasks, useTaskActions } from '@/lib/tasks';
import { useEvents, weekStart } from '@/lib/events';
import { useNotebooks, useNotes } from '@/lib/notes';
import { useHabits, useTicks, useHabitActions, ymd } from '@/lib/habits';
import { useScratch, useScratchActions } from '@/lib/scratch';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { usePrefs } from '@/lib/prefs';
import { UpcomingTaskCycle } from '@/components/home/UpcomingTaskCycle';
import { NextEventBar } from '@/components/home/NextEventBar';
import { CanvasLmsWide } from '@/components/lms/CanvasLms';
const covers = ['#c7d8fa', '#f4da61', '#f2afa0', '#b8d8bd'];
export default function HomePage() {
  const [now, setNow] = useState(() => new Date());
  const [name, setName] = useState('');
  const [capture, setCapture] = useState('');
  const [captureType, setCaptureType] = useState<'Note' | 'Task' | 'Idea'>('Note');
  const [expanded, setExpanded] = useState(false);
  const { prefs } = usePrefs();
  const tasksQuery = useTasks(); const tasks = tasksQuery.data || []; const TA = useTaskActions();
  const { data: events = [] } = useEvents(weekStart(now));
  const { data: notebooks = [] } = useNotebooks(); const { data: notes = [] } = useNotes();
  const { data: habits = [] } = useHabits(); const { data: ticks = [] } = useTicks(30); const HA = useHabitActions(30);
  const { data: scratch = [] } = useScratch(); const SA = useScratchActions();
  const today = ymd(now);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    void supabase.auth.getUser().then(({ data }) => setName(String(data.user?.user_metadata?.full_name || data.user?.user_metadata?.name || '').split(' ')[0]));
    return () => clearInterval(timer);
  }, []);
  const upcoming = events.filter(e => !e.deleted_at && new Date(e.starts_at).toDateString() === now.toDateString() && new Date(e.ends_at) > now).sort((a,b) => a.starts_at.localeCompare(b.starts_at));
  const next = upcoming[0]; const underway = next && new Date(next.starts_at) <= now;
  // Where the wait for the next event began: the end of the last timed event today that is already over.
  const previousEnd = events.filter(e => !e.deleted_at && !e.all_day && new Date(e.starts_at).toDateString() === now.toDateString() && new Date(e.ends_at) <= now).reduce<string | null>((latest, e) => !latest || e.ends_at > latest ? e.ends_at : latest, null);
  const weekEnd = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  const time = (value: string) => new Date(value).toLocaleTimeString([], { hour:'numeric', minute:'2-digit', hour12:!prefs.time24 });
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const keep = () => {
    const text = capture.trim(); if (!text) return;
    if (captureType === 'Task') TA.create.mutate({id:crypto.randomUUID(),title:text},{onSuccess:()=>{setCapture('');toast('Task added');}});
    else SA.add.mutate({id:crypto.randomUUID(),text,tag:captureType,color:captureType === 'Idea'?'#3165f5':'#f3d554'},{onSuccess:()=>{setCapture('');toast('Captured');},onError:()=>toast('Couldn’t save. Your text is still here.')});
  };
  return <div className="today-workspace">
    <header className="today-greeting"><div><h1>{greeting}{name ? <>, <span>{name}.</span></> : '.'}</h1><p>{now.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}<span className="greeting-divider" /><span className="greeting-message">A little space to make things happen.</span></p></div><Link className="studio-button" href="/focus/"><Icon name="focus" size={18}/>Focus time</Link></header>
    <div className="day-overview">
      <section className="next-event-panel"><div className="overview-label"><h2>{underway ? 'Happening now' : 'Up next'}</h2><Icon name="cal" size={21}/></div><div className="next-event-copy"><p>{next ? (next.all_day ? 'All day' : time(next.starts_at)+' – '+time(next.ends_at)) : 'A moment to breathe'}</p><h3>{next?.title || 'Your time. Your next move.'}</h3><span>{next?.location || (next ? 'On your calendar' : 'Nothing else scheduled today.')}</span></div>{next && !next.all_day && <NextEventBar key={next.id} next={next} previousEnd={previousEnd} startLabel={time(next.starts_at)} endLabel={time(next.ends_at)}/>}<Link href="/calendar/" className="next-event-link">{next ? 'Open event in calendar' : 'Plan your day'}<span className="event-action-arrow"><Icon name="arrowR" size={18}/></span></Link><div className="poster-ribbons" aria-hidden="true"><i/><i/><i/></div></section>
      <UpcomingTaskCycle tasks={tasks} today={today} weekEnd={weekEnd}/>
    </div>
    <CanvasLmsWide/>
    <section className="rest-of-day"><div className="section-heading"><h2>The rest of today <span>{upcoming.length}</span></h2><Link href="/calendar/">Full calendar<Icon name="arrowR" size={15}/></Link></div><div className="day-agenda">{upcoming.length ? upcoming.slice(0,expanded ? undefined : 4).map(e=><Link key={e.id} href="/calendar/" className="day-agenda-event"><time>{e.all_day?'All day':time(e.starts_at)}</time><span className="agenda-dot" style={{background:e.color || 'var(--poster-blue)'}}/><strong>{e.title}</strong><span>{e.location || time(e.ends_at)}</span></Link>) : <p className="agenda-empty">The rest of the day is yours. <Link href="/notebooks/">Pick up an idea</Link> or take a well-earned break.</p>}</div>{upcoming.length > 4 && <button className="text-button" onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':'Show '+(upcoming.length-4)+' more'}</button>}</section>
    <div className="home-workbench"><section className="quick-capture"><div className="section-heading"><h2>Catch a thought.</h2><Icon name="pen" size={21}/></div><form onSubmit={e=>{e.preventDefault();keep();}}><label className="sronly" htmlFor="quick-thought">Your quick capture</label><textarea id="quick-thought" placeholder="An idea, a reminder, something worth keeping…" value={capture} onChange={e=>setCapture(e.target.value)} rows={3}/><div className="capture-controls"><div role="group" aria-label="Capture type">{(['Note','Task','Idea'] as const).map(kind=><button type="button" key={kind} aria-pressed={captureType===kind} onClick={()=>setCaptureType(kind)}>{kind}</button>)}</div><button className="studio-button primary" disabled={!capture.trim() || SA.add.isPending || TA.create.isPending}>{SA.add.isPending || TA.create.isPending ? 'Saving…' : 'Keep it'}<Icon name="arrowR" size={16}/></button></div></form>{scratch.length>0 && <div className="capture-history">{scratch.slice(0,3).map(s=><details key={s.id}><summary>{s.title || s.text?.slice(0,80) || s.tag}<span>{s.tag}</span></summary><p>{s.text}</p>{s.photo_url && <img src={s.photo_url} alt={s.title || 'Captured photo'} loading="lazy"/>}</details>)}{scratch.length>3 && <details><summary>{scratch.length-3} more captures</summary>{scratch.slice(3).map(s=><article key={s.id}><strong>{s.title || s.tag}</strong><p>{s.text}</p>{s.photo_url&&<img src={s.photo_url} alt={s.title||'Captured photo'} loading="lazy"/>}</article>)}</details>}</div>}</section>
    <section className="home-habits"><div className="section-heading"><h2>Small steps, daily.</h2><Link href="/habits/" aria-label="Open habits"><Icon name="arrowR" size={18}/></Link></div>{habits.filter(h=>!h.archived_at).slice(0,5).map(h=>{const tick=ticks.find(t=>t.habit_id===h.id&&t.on_date===today);const done=!!tick&&(tick.value>=(h.target||1));return <div className="home-habit" key={h.id}><span className="habit-color" style={{background:h.color}}/><Link href="/habits/">{h.name}<small>{h.kind==='bin'?'A little consistency goes a long way':(tick?.value||0)+' / '+(h.target||1)+' '+(h.target_unit||'')}</small></Link><button aria-label={(done?'Reset ':'Complete ')+h.name} aria-pressed={done} onClick={()=>HA.tick.mutate({habitId:h.id,date:today,value:done?0:(h.target||1),mode:'set'})}><Icon name={done?'check':'plus'} size={17}/></button></div>})}{!habits.length && <div className="home-inline-empty"><p>Build a routine that fits your life.</p><Link className="studio-button" href="/habits/">Choose a habit<Icon name="plus"/></Link></div>}<Link className="study-goal-link" href="/focus/"><Icon name="focus" size={26}/><span><strong>Give your next idea 25 minutes.</strong><small>Set a study goal and find your focus.</small></span><Icon name="arrowR"/></Link></section></div>
    <section><div className="section-heading"><h2>Your notebooks</h2><Link href="/notebooks/">Open library<Icon name="arrowR" size={15}/></Link></div><div className="home-notebooks">{notebooks.slice(0,4).map((n,i)=><Link key={n.id} href={'/notebooks/?notebook='+n.id} style={{background:covers[i%covers.length]}}><Icon name="book" size={23}/><strong>{n.name}</strong><span>{notes.filter(note=>note.notebook_id===n.id).length} pages<Icon name="arrowR" size={18}/></span></Link>)}{!notebooks.length&&<Link className="home-new-notebook" href="/notebooks/"><Icon name="plus" size={28}/><strong>A home for your ideas.</strong><span>Create your first notebook</span></Link>}</div></section>
    <section className="recent-work"><div className="section-heading"><h2>Pick up where you left off</h2></div>{notes.slice(0,5).map(n=><Link className="recent-page" key={n.id} href={'/notebooks/?open='+n.id}><Icon name="book" size={19}/><strong>{n.title || 'Untitled'}</strong><small>{notebooks.find(b=>b.id===n.notebook_id)?.name}</small><Icon name="arrowR" size={15}/></Link>)}{!notes.length&&<p className="agenda-empty">Your recent pages will be right here.</p>}</section>
    {tasksQuery.isError&&<p role="alert" className="studio-error">Tasks couldn’t load. <button onClick={()=>void tasksQuery.refetch()}>Try again</button></p>}
  </div>;
}
