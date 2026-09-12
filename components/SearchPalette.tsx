'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Icon,type IconName} from './Icon';
import {DESTINATIONS} from '@/lib/destinations';
import {useOverlayBack} from '@/lib/nav';
import {supabase} from '@/lib/supabase';
import {queryClient} from '@/lib/offline';
type Hit={id:string;title:string;group:string;icon:IconName;path:string};
export function SearchPalette({onClose}:{onClose:()=>void}){
 const router=useRouter(),input=useRef<HTMLInputElement>(null),close=useRef(onClose);close.current=onClose;
 const [q,setQ]=useState(''),[hits,setHits]=useState<Hit[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(false),[selected,setSelected]=useState(0);
 useOverlayBack(true,onClose);
 useEffect(()=>{input.current?.focus();},[]);
 useEffect(()=>{
  const term=q.trim();const abort=new AbortController();setSelected(0);setError(false);
  if(!term){setHits([]);setBusy(false);return;}
  const cached:Hit[]=[];
  for(const [key,group,icon,path] of [['tasks','Tasks','task','/tasks/?detail='],['notes','Pages','book','/notebooks/?open=']] as const){
   const rows=queryClient.getQueryData<{id:string;title:string}[]>([key])||[];
   for(const row of rows)if(row.title.toLowerCase().includes(term.toLowerCase()))cached.push({id:row.id,title:row.title,group,icon,path:path+row.id});
  }setHits(cached.slice(0,12));setBusy(true);
  const timer=setTimeout(async()=>{
   try{const like='%'+term.replace(/[%_]/g,'')+'%';
    const results=await Promise.all([
     supabase.from('bd_tasks').select('id,title').is('deleted_at',null).ilike('title',like).limit(7).abortSignal(abort.signal),
     supabase.from('bd_notes').select('id,title').is('deleted_at',null).ilike('title',like).limit(7).abortSignal(abort.signal),
     supabase.from('bd_events').select('id,title').is('deleted_at',null).ilike('title',like).limit(5).abortSignal(abort.signal)
    ]);if(abort.signal.aborted)return;
    const remote:Hit[]=[];results.forEach((r,i)=>{for(const row of r.data||[])remote.push({id:row.id,title:row.title,group:['Tasks','Pages','Calendar'][i],icon:(['task','book','cal'] as const)[i],path:['/tasks/?detail=','/notebooks/?open=','/calendar/?event='][i]+row.id});});
    setHits([...new Map([...cached,...remote].map(r=>[r.group+r.id,r])).values()].slice(0,20));setError(results.some(r=>r.error));setBusy(false);
   }catch{if(!abort.signal.aborted){setError(true);setBusy(false);}}
  },180);return()=>{abort.abort();clearTimeout(timer);};
 },[q]);
 const destinations=useMemo(()=>DESTINATIONS.filter(d=>!q||d.name.toLowerCase().includes(q.toLowerCase())).map(d=>({id:d.id,title:d.name,group:'Go to',icon:d.icon,path:'/'+d.id+'/'})),[q]);
 const rows=[...hits,...destinations];const go=(row:Hit)=>{close.current();router.push(row.path);};
 return <div className="search-backdrop" onClick={onClose}><section className="search-dialog" role="dialog" aria-modal="true" aria-label="Search your workspace" onClick={e=>e.stopPropagation()} onKeyDown={e=>{
  if(e.key==='ArrowDown'){e.preventDefault();setSelected(i=>(i+1)%Math.max(1,rows.length));}
  if(e.key==='ArrowUp'){e.preventDefault();setSelected(i=>(i-1+rows.length)%Math.max(1,rows.length));}
  if(e.key==='Enter'&&rows[selected]){e.preventDefault();go(rows[selected]);}
  if(e.key==='Tab'){const list=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input,button'));const first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}><header><Icon name="search" size={22}/><input ref={input} aria-label="Search tasks, pages and calendar" placeholder="Find a task, page or place…" value={q} onChange={e=>setQ(e.target.value)} /><button aria-label="Close search" onClick={onClose}><Icon name="close" size={18}/></button></header><div className="search-results">{rows.map((r,i)=><button key={r.group+r.id} className={i===selected?'is-selected':''} onClick={()=>go(r)}><Icon name={r.icon} size={19}/><span>{r.title||'Untitled'}<small>{r.group}</small></span><Icon name="arrowR" size={15}/></button>)}{busy&&<p role="status">Searching…</p>}{!busy&&!rows.length&&<p>No matches. Try a different title.</p>}{error&&<p role="status">Online search is unavailable. Showing results saved on this device.</p>}</div><footer>↑ ↓ to move · Enter to open · Esc to close</footer></section></div>;
}
