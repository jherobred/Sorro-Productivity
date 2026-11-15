'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useTasks, type Task } from '@/lib/tasks';
import { useEvents, useEventActions, weekStart } from '@/lib/events';
import { usePrefs } from '@/lib/prefs';
import { ymd } from '@/lib/days';
import { availableTime, conflicts } from '@/lib/weekPlan';

/** initialTask: the task a "Reserve time" link asked for, picked already. */
export function WeeklyPlanner({ onClose, initialTask }: { onClose: () => void; initialTask?: string }) {
  const [offset,setOffset]=useState(0);const [startHour,setStartHour]=useState(8);const [endHour,setEndHour]=useState(20);
  const base=useMemo(()=>{const d=new Date();d.setDate(d.getDate()+offset*7);return weekStart(d);},[offset]);
  const tasksQuery=useTasks();const {data:tasks=[],isError:taskError}=tasksQuery;const eventsQuery=useEvents(base,7);const events=eventsQuery.data||[];
  const A=useEventActions(base);const {prefs,update}=usePrefs();
  const [selected,setSelected]=useState(initialTask??'');const [day,setDay]=useState(ymd(new Date()));const [time,setTime]=useState('09:00');const [minutes,setMinutes]=useState(50);const [error,setError]=useState('');const [saved,setSaved]=useState('');
  const dates=Array.from({length:7},(_,i)=>{const d=new Date(base);d.setDate(d.getDate()+i);return d;});
  const first=ymd(dates[0]),last=ymd(dates[6]),today=ymd(new Date());const open=tasks.filter(t=>!t.done&&!t.deleted_at);
  const linked=prefs.taskEventLinks||{};
  const upcomingIds=new Set(events.filter(e=>!e.deleted_at&&Date.parse(e.ends_at)>Date.now()).map(e=>e.id));
  const hasTime=(t:Task)=>(linked[t.id]||[]).some(id=>upcomingIds.has(id));
  const late=open.filter(t=>t.due_on&&t.due_on<today);const due=open.filter(t=>t.due_on&&t.due_on>=first&&t.due_on<=last);const unscheduled=open.filter(t=>!hasTime(t));
  const done=tasks.filter(t=>t.done&&t.completed_at&&ymd(new Date(t.completed_at))>=first&&ymd(new Date(t.completed_at))<=last);
  const clock=(value:number)=>new Date(value).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',hour12:!prefs.time24});
  const schedule=async()=>{
    const task=tasks.find(t=>t.id===selected);if(!task)return;
    const start=new Date(day+'T'+time).getTime(),end=start+minutes*60_000;
    setError('');setSaved('');
    if(!Number.isFinite(start)||start<Date.now()){setError('Choose a future time.');return;}
    if(day<first||day>last){setError('Choose a day in the displayed week so its calendar conflicts can be checked.');return;}
    if(conflicts(events,start,end)){setError('That time overlaps a calendar event. Choose an open time below.');return;}
    try{const id=crypto.randomUUID();await A.create.mutateAsync({id,title:'Study · '+task.title,starts_at:new Date(start).toISOString(),ends_at:new Date(end).toISOString(),color:'#3165f5',location:task.course||''});await update({taskEventLinks:{...linked,[task.id]:[...(linked[task.id]||[]),id]}});setSaved('Study block added to your calendar for '+task.title+'.');}
    catch{setError('The study block could not sync. Check your connection and retry.');}
  };
  const rows=(items:Task[])=>items.slice(0,30).map(t=><li key={t.id}><button className={selected===t.id?'is-selected':''} onClick={()=>{setSelected(t.id);setSaved('');}}><strong>{t.title}</strong><small>{[t.course,t.due_on?'Due '+t.due_on:'No deadline',hasTime(t)?'Time reserved this week':null].filter(Boolean).join(' · ')}</small></button></li>);
  return <section className="weekly-planner"><header className="section-heading"><div><button className="text-button" onClick={onClose}><Icon name="back" size={17}/>My Tasks</button><h1>Plan the week</h1><p>Give your work a time, then review what got done.</p></div><div className="week-plan-pager"><button className="studio-button" aria-label="Previous week" onClick={()=>setOffset(o=>o-1)}><Icon name="chevronLeft"/></button><button className="studio-button" onClick={()=>setOffset(0)}>This week</button><button className="studio-button" aria-label="Next week" onClick={()=>setOffset(o=>o+1)}><Icon name="chevronRight"/></button></div></header>
    <p className="week-plan-range">{dates[0].toLocaleDateString(undefined,{month:'short',day:'numeric'})} – {dates[6].toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})} · {done.length} tasks completed</p>
    {(taskError||eventsQuery.isError)&&<p className="studio-error">Some planning data could not load. <button onClick={()=>{void tasksQuery.refetch();void eventsQuery.refetch();}}>Retry</button></p>}
    <div className="week-plan-layout"><div className="week-plan-work"><details open><summary>Overdue <span>{late.length}</span></summary><ul>{rows(late)}</ul>{!late.length&&<p>Nothing overdue.</p>}</details><details open><summary>Due this week <span>{due.length}</span></summary><ul>{rows(due)}</ul>{!due.length&&<p>No deadlines this week.</p>}</details><details><summary>No study time this week <span>{unscheduled.length}</span></summary><ul>{rows(unscheduled)}</ul></details><details><summary>Weekly review <span>{done.length} completed</span></summary><ul>{done.map(t=><li key={t.id}><Link href={'/tasks/?detail='+t.id}>{t.title}</Link></li>)}</ul>{!done.length&&<p>Completed tasks will appear here.</p>}</details></div>
    <div className="week-plan-calendar"><form className="plan-reservation" onSubmit={e=>{e.preventDefault();void schedule();}}><h2>Reserve study time</h2><label>Task<select required value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose a task</option>{open.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label><div className="plan-time-fields"><label>Day<input type="date" min={first} max={last} value={day} onChange={e=>setDay(e.target.value)} required/></label><label>Starts<input type="time" value={time} onChange={e=>setTime(e.target.value)} required/></label><label>Minutes<select value={minutes} onChange={e=>setMinutes(+e.target.value)}>{[25,50,90,120].map(n=><option key={n}>{n}</option>)}</select></label></div><button className="studio-button primary" disabled={!selected||A.create.isPending||eventsQuery.isPending||eventsQuery.isError}>{A.create.isPending?'Saving…':'Add study block'}</button>{error&&<p className="studio-error" role="alert">{error}</p>}{saved&&<p role="status">{saved} <Link href="/calendar/">Open calendar</Link></p>}</form>
    <div className="available-hours"><h2>Unscheduled time</h2><p>Based on your calendar within these study hours. Travel and unrecorded plans may also need time.</p><label>From<select value={startHour} onChange={e=>setStartHour(+e.target.value)}>{Array.from({length:23},(_,h)=><option value={h} key={h}>{String(h).padStart(2,'0')}:00</option>)}</select></label><label>Until<select value={endHour} onChange={e=>setEndHour(+e.target.value)}>{Array.from({length:24},(_,h)=><option value={h+1} key={h}>{String(h+1).padStart(2,'0')}:00</option>)}</select></label>
    {endHour<=startHour&&<p role="alert" className="studio-error">End your study hours after they start.</p>}
    {dates.map(d=>{const start=new Date(d),end=new Date(d);start.setHours(startHour,0,0,0);end.setHours(endHour,0,0,0);const nextMinute=Math.ceil((Date.now()+60_000)/60_000)*60_000;const gaps=availableTime(events,Math.max(start.getTime(),nextMinute),end.getTime());return <div className="plan-day" key={ymd(d)}><h3>{d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</h3>{gaps.length?gaps.map(g=><button key={g.start} className="plan-gap" onClick={()=>{const rounded=Math.ceil(g.start/60_000)*60_000;setDay(ymd(new Date(rounded)));setTime(new Date(rounded).toTimeString().slice(0,5));setMinutes([120,90,50,25].find(m=>m*60_000<=g.end-rounded)??25);}}>{clock(g.start)}–{clock(g.end)}</button>):<span>{ymd(d)<today?'Day ended':'No open blocks of 30 minutes'}</span>}</div>;})}</div></div></div>
  </section>;
}
