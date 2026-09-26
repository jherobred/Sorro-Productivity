'use client';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { pageRecovery, type PageVersion } from '@/lib/noteRecovery';
import { useNoteActions, type Note } from '@/lib/notes';
import { pagePreview } from '@/lib/pageKinds';

export function PageHistory({ note, onOpen }: { note: Note; onOpen: (note: Note) => void }) {
  const [open,setOpen]=useState(false);const [versions,setVersions]=useState<PageVersion[]>([]);const [selected,setSelected]=useState<PageVersion|null>(null);const [error,setError]=useState('');const A=useNoteActions();
  const show=async()=>{setOpen(v=>!v);setError('');try{const row=(await pageRecovery()).find(r=>r.key.endsWith(':'+note.id));setVersions([...(row?.draft?[row.draft]:[]),...(row?.versions||[]).slice().reverse()]);}catch{setError('History could not be read from device storage. Your current page is still available.');}};
  const recover=async()=>{if(!selected)return;const id=crypto.randomUUID(),title=selected.title+' · recovered';try{await A.newNote.mutateAsync({id,notebook_id:note.notebook_id,title,body:selected.body});setOpen(false);onOpen({...note,id,title,body:selected.body});}catch{setError('The recovered copy could not sync. Check save status and retry.');}};
  return <div className="page-history"><button type="button" className="text-button" aria-expanded={open} onClick={()=>void show()}><Icon name="clock" size={16}/>History</button>{open&&<section className="page-history-panel" aria-label="Page history"><h3>Page history on this device</h3><p>Up to 30 recent versions. Opening a version as a new page keeps your current page unchanged.</p>{error&&<p role="alert" className="studio-error">{error}</p>}<div className="page-history-list">{versions.map((v,i)=><button key={v.at+':'+i} className={selected===v?'is-selected':''} onClick={()=>setSelected(v)}><strong>{new Date(v.at).toLocaleString()}</strong><span>{v.title||'Untitled'}</span></button>)}</div>{!versions.length&&<p>No earlier versions on this device yet.</p>}{selected&&<><blockquote>{pagePreview(selected.body)||'Empty page'}</blockquote><button className="studio-button primary" disabled={A.newNote.isPending} onClick={()=>void recover()}>{A.newNote.isPending?'Recovering…':'Open as a new page'}</button></>}</section>}</div>;
}
