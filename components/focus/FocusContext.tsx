'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useTasks } from '@/lib/tasks';
import { useFocus, focusActions } from '@/lib/focusSession';
import { useNotebooks, useNotes } from '@/lib/notes';
import { taskLinksNote } from '@/lib/noteTaskLinks';
import { usePrefs } from '@/lib/prefs';
import { courseIs } from '@/lib/tagList';
import { useEvents, weekStart } from '@/lib/events';
import { Icon } from '@/components/Icon';

export function FocusContext() {
  const {session,ready}=useFocus();const {data:tasks=[]}=useTasks();const {data:notes=[]}=useNotes();const {data:books=[]}=useNotebooks();const {prefs}=usePrefs();
  const {data:events=[]}=useEvents(weekStart(new Date()),14);const opened=useRef(false);
  useEffect(()=>{if(!ready||opened.current)return;const id=new URLSearchParams(location.search).get('task');if(!id){opened.current=true;return;}const task=tasks.find(t=>t.id===id);if(task){focusActions.setTask(task);opened.current=true;}},[ready,tasks]);
  const task=tasks.find(t=>t.id===session.taskId);const tag=(prefs.tags||[]).find(t=>task?.course&&courseIs(task.course,t));
  const related=notes.filter(n=>task&& (taskLinksNote(task.notes,n.id)||(tag&&(prefs.notebookTags?.[n.notebook_id]||[]).includes(tag.id))));
  const scheduled=events.filter(e=>!e.deleted_at&&(prefs.taskEventLinks?.[task?.id||'']||[]).includes(e.id)&&Date.parse(e.ends_at)>Date.now());
  return <section className="focus-context"><label>Focus task<select value={task?.id||''} disabled={!ready} onChange={e=>focusActions.setTask(tasks.find(t=>t.id===e.target.value)||null)}><option value="">No linked task</option>{tasks.filter(t=>!t.done||t.id===task?.id).map(t=><option value={t.id} key={t.id}>{t.title}{t.done?' · completed':''}</option>)}</select></label>{task&&<><p>{task.course||'Personal work'} · <Link href={'/tasks/?detail='+task.id}>Open task</Link></p>{!!scheduled.length&&<div><h3>Reserved study time</h3>{scheduled.map(e=><Link className="focus-context-link" href="/calendar/" key={e.id}><Icon name="cal" size={16}/>{new Date(e.starts_at).toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit',hour12:!prefs.time24})}</Link>)}</div>}<h3>Notes for this work</h3>{related.length?related.slice(0,8).map(n=><Link className="focus-context-link" href={'/notebooks/?open='+n.id} key={n.id}><Icon name="book" size={16}/><span>{n.title||'Untitled'}<small>{books.find(b=>b.id===n.notebook_id)?.name}</small></span></Link>):<p className="notebook-caption">Link a page with “Open a task” in your notebook to keep it here.</p>}</>}</section>;
}
