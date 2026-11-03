'use client';
import { supabase, currentUserId } from './supabase';
import { BACKUP_TABLES, backupColumns, prepareRestore, transformBackupBody as transformBody, type StudyBackup, type BackupRow } from './backupFormat';
import { loadPageAsset, cachePageAsset, syncPageAsset } from './pageAssets';
import type { PageAsset } from './pageKinds';
import { getPrefs, setPrefs, type Prefs } from './prefs';
import { pageRecovery } from './noteRecovery';

const base64=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});

export async function createStudyBackup(progress:(text:string)=>void):Promise<StudyBackup> {
  const user=await currentUserId();const tables={} as StudyBackup['tables'];
  for(const table of BACKUP_TABLES){progress('Reading '+table.replace('bd_','')+'…');const rows:BackupRow[]=[];
    for(let from=0;;from+=500){const {data,error}=await supabase.from(table).select(backupColumns(table)).eq('user_id',user).order(table==='bd_note_tags'?'note_id':'id').range(from,from+499);if(error)throw new Error('Could not read '+table.replace('bd_','')+'. Please retry the backup.');rows.push(...(data??[]) as unknown as BackupRow[]);if((data?.length??0)<500)break;}
    tables[table]=rows;
  }
  // Include the newest unsynced text, not an older server copy of the page.
  const recover=await pageRecovery().catch(()=>[]);
  for(const r of recover){if(!r.draft)continue;const draft=r.draft;const row=tables.bd_notes.find(n=>n.id===draft.id);if(row&&Date.parse(String(row.updated_at))<=Date.parse(draft.at))Object.assign(row,{title:draft.title,body:draft.body,updated_at:draft.at});else if(!row&&tables.bd_notebooks.some(b=>b.id===draft.notebook_id&&!b.deleted_at))tables.bd_notes.push({id:draft.id,notebook_id:draft.notebook_id,title:draft.title,body:draft.body,created_at:draft.at,updated_at:draft.at,position:0,deleted_at:null});}
  const assets=new Map<string,PageAsset>();
  for(const note of tables.bd_notes)transformBody(String(note.body),v=>{if(typeof v.localId==='string'&&typeof v.name==='string')assets.set(v.localId,v as PageAsset);});
  const packed:StudyBackup['assets']=[];const unavailableAssets:string[]=[];let bytes=0;
  for(const asset of assets.values()){progress(`Backing up page attachments (${packed.length+unavailableAssets.length+1}/${assets.size})…`);try{const blob=await loadPageAsset(asset);if(bytes+blob.size>100_000_000){unavailableAssets.push(asset.name+' (100 MB limit)');continue;}bytes+=blob.size;packed.push({localId:asset.localId,name:asset.name,type:blob.type||(/\.pdf$/i.test(asset.name)?'application/pdf':'image/png'),data:await base64(blob)});}catch{unavailableAssets.push(asset.name);}}
  const p=getPrefs();
  return {format:'sorro-study',version:1,createdAt:new Date().toISOString(),tables,assets:packed,metadata:{unavailableAssets,eventMeta:p.eventMeta||{},tags:p.tags||[],notebookTags:p.notebookTags||{},noteColors:p.noteColors||{},taskEventLinks:p.taskEventLinks||{}}};
}

export type RestorePlan = ReturnType<typeof prepareRestore> & { assets:Map<string,PageAsset> };
export function newRestorePlan(backup:StudyBackup):RestorePlan {return {...prepareRestore(backup,()=>crypto.randomUUID()),assets:new Map()};}

/** Additive and retryable: IDs are allocated once, then reused after any partial failure. */
export async function restoreStudyBackup(backup:StudyBackup,plan:RestorePlan,progress:(text:string)=>void) {
  const user_id=await currentUserId();
  for(const a of backup.assets){const id=plan.ids.get(a.localId)!;if(plan.assets.has(id))continue;progress('Restoring page attachment '+a.name+'…');const bytes=Uint8Array.from(atob(a.data),c=>c.charCodeAt(0));const asset={localId:id,name:a.name};await cachePageAsset(asset,new Blob([bytes],{type:a.type}));plan.assets.set(id,await syncPageAsset(asset));}
  for(const table of BACKUP_TABLES){progress('Restoring '+table.replace('bd_','')+'…');const rows=plan.tables[table].map(r=>{
    const row:BackupRow={...r,user_id};if(table==='bd_notes'&&typeof r.body==='string')row.body=transformBody(r.body,v=>{if(typeof v.localId==='string'){const asset=plan.assets.get(v.localId);if(asset){delete v.path;Object.assign(v,asset);}}});return row;
  });
    for(let i=0;i<rows.length;i+=100){const {error}=await supabase.from(table).upsert(rows.slice(i,i+100),{onConflict:table==='bd_note_tags'?'note_id,tag':'id',ignoreDuplicates:true});if(error)throw new Error('Restore stopped at '+table.replace('bd_','')+'. Completed copies are kept. Retry to continue without making duplicate copies.');}
  }
  // Carry links between the copied records, without replacing current preferences.
  const p=getPrefs();const copied:Partial<Prefs>={};
  if(Array.isArray(backup.metadata.tags))copied.tags=[...(p.tags||[]),...backup.metadata.tags.filter((t):t is {id:string;name:string;color:string}=>!!t&&typeof t==='object'&&typeof t.id==='string'&&typeof t.name==='string'&&typeof t.color==='string'&&/^#[a-f0-9]{3,8}$/i.test(t.color)).map(t=>({...t,id:plan.ids.get(t.id)!}))];
  for(const field of ['eventMeta','noteColors','notebookTags','taskEventLinks'] as const){const raw=backup.metadata[field];if(!raw||typeof raw!=='object'||Array.isArray(raw))continue;
    const map:Record<string,unknown>={};for(const [old,value] of Object.entries(raw)){const id=plan.ids.get(old);if(!id)continue;
      if(field==='noteColors'&&typeof value==='string'&&/^#[a-f0-9]{3,8}$/i.test(value))map[id]=value;
      if(field==='taskEventLinks'&&Array.isArray(value))map[id]=value.filter((v):v is string=>typeof v==='string').map(v=>plan.ids.get(v)).filter(Boolean);
      if(field==='notebookTags'&&Array.isArray(value))map[id]=value.filter((v):v is string=>typeof v==='string').map(v=>plan.ids.get(v)).filter(Boolean);
      if(field==='eventMeta'&&value&&typeof value==='object'){const meta=value as {short_name?:unknown;recurrence?:unknown};const recurrence=meta.recurrence as {freq?:string}|undefined;if(recurrence&&['daily','weekly','monthly','yearly','weekdays','custom'].includes(recurrence.freq||''))map[id]={recurrence};else if(typeof meta.short_name==='string')map[id]={short_name:meta.short_name};}
    }
    Object.assign(copied,{[field]:{...(p[field]||{}),...map}});
  }
  setPrefs(copied);
}

export function downloadBackup(backup:StudyBackup) {
  const blob=new Blob([JSON.stringify(backup)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='sorro-study-'+backup.createdAt.slice(0,10)+(Array.isArray(backup.metadata.unavailableAssets)&&backup.metadata.unavailableAssets.length?'-missing-attachments':'')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30_000);
}
