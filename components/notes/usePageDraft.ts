'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {markPending,type Note} from '@/lib/notes';
import {rememberPage} from '@/lib/noteRecovery';

/** All page formats use the established debounced upsert and pending overlay. */
export function usePageDraft(note:Note,onSave:(value:{title:string;body:string})=>void){
  const [draft,setDraft]=useState({title:note.title,body:note.body});
  const [waiting,setWaiting]=useState(false);
  const save=useRef(onSave);save.current=onSave;
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const latest=useRef<{title:string;body:string}|null>(null);
  const current=useRef(draft);current.current=draft;
  useEffect(()=>{void rememberPage({id:note.id,notebook_id:note.notebook_id,title:note.title,body:note.body},true);},[note.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const flush=useCallback(()=>{clearTimeout(timer.current);const value=latest.current;latest.current=null;if(value)save.current(value);},[]);
  const change=useCallback((patch:Partial<typeof draft>)=>{
    const value={...current.current,...patch};current.current=value;setDraft(value);
    markPending(note.id,{...value,notebook_id:note.notebook_id});latest.current=value;setWaiting(true);clearTimeout(timer.current);
    timer.current=setTimeout(()=>{flush();setWaiting(false);},600);
  },[note.id,flush]);
  useEffect(()=>{
    const onHidden=()=>{if(document.visibilityState==='hidden')flush();};
    window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',onHidden);
    return()=>{window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',onHidden);flush();};
  },[note.id,flush]);
  return {draft,change,waiting,flush};
}
