'use client';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon';
import { parseBackup, type StudyBackup as Backup } from '@/lib/backupFormat';
import { createStudyBackup,downloadBackup,newRestorePlan,restoreStudyBackup,type RestorePlan } from '@/lib/studyBackup';

export function StudyBackup() {
  const qc=useQueryClient();const file=useRef<HTMLInputElement>(null);const plan=useRef<RestorePlan|null>(null);
  const [backup,setBackup]=useState<Backup|null>(null);const [busy,setBusy]=useState(false);const [progress,setProgress]=useState('');const [error,setError]=useState('');const [restored,setRestored]=useState(false);
  const exportData=async()=>{setBusy(true);setError('');try{const copy=await createStudyBackup(setProgress);downloadBackup(copy);setProgress('Backup downloaded. Keep it somewhere you can find it again.');}catch(e){setError(e instanceof Error?e.message:'Backup failed. Please retry.');setProgress('');}finally{setBusy(false);}};
  const open=async(value:File)=>{setError('');setBackup(null);setRestored(false);plan.current=null;try{if(value.size>150_000_000)throw new Error('Choose a backup smaller than 150 MB.');const parsed=parseBackup(JSON.parse(await value.text()));setBackup(parsed);plan.current=newRestorePlan(parsed);}catch(e){setError(e instanceof Error?e.message:'This file could not be read.');}};
  const restore=async()=>{if(!backup||!plan.current)return;setBusy(true);setError('');try{await restoreStudyBackup(backup,plan.current,setProgress);await qc.invalidateQueries();setRestored(true);setProgress('Restored as new copies. Look for “Restored” notebooks and task lists.');}catch(e){setError(e instanceof Error?e.message:'Restore failed. Retry to continue.');setProgress('');}finally{setBusy(false);}};
  return <section className="study-backup"><h3>Study workspace backup</h3><p>Download notebooks, all page types and their bins, task lists, tasks and steps, calendar events, and embedded page images and PDFs. External links remain links. Covers, legacy boards, and data in the other tools are outside this backup.</p><div className="backup-actions"><button className="studio-button" disabled={busy} onClick={()=>void exportData()}><Icon name="files" size={16}/>{busy?'Working…':'Download backup'}</button><button className="studio-button" disabled={busy} onClick={()=>file.current?.click()}><Icon name="undo" size={16}/>Choose backup to restore</button><input ref={file} hidden type="file" accept=".json,application/json" onChange={e=>{const f=e.target.files?.[0];if(f)void open(f);e.target.value='';}}/></div>
    {backup&&<div className="backup-review"><h4>Review this restore</h4><p>Backup from {new Date(backup.createdAt).toLocaleString()}: {backup.tables.bd_notebooks.length} notebooks, {backup.tables.bd_notes.length} pages, {backup.tables.bd_tasks.length} tasks, {backup.tables.bd_events.length} events, and {backup.assets.length} page attachments.</p><p>Creates new copies in this account. Existing items are not replaced. Binned items stay binned.</p><button className="studio-button primary" disabled={busy||restored} onClick={()=>void restore()}>{restored?'Restored':error?'Retry restore':'Restore as new copies'}</button></div>}
    {progress&&<p role="status">{progress}</p>}{error&&<p role="alert" className="studio-error">{error}</p>}
  </section>;
}
