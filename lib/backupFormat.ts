export const BACKUP_TABLES = ['bd_notebooks','bd_notes','bd_note_tags','bd_lists','bd_tasks','bd_subtasks','bd_events'] as const;
export type BackupTable = typeof BACKUP_TABLES[number];
export type BackupRow = Record<string, unknown>;
export type StudyBackup = { format:'basedly-study'; version:1; createdAt:string; tables:Record<BackupTable,BackupRow[]>; assets:{localId:string;name:string;type:string;data:string}[]; metadata:Record<string,unknown> };
const fields: Record<BackupTable,string[]> = {
  bd_notebooks:['id','name','color','position','created_at','deleted_at'],
  bd_notes:['id','notebook_id','title','body','position','created_at','updated_at','deleted_at'],
  bd_note_tags:['note_id','tag'],bd_lists:['id','name','color','position'],
  bd_tasks:['id','list_id','title','notes','done','due_on','due_at','priority','stars','position','created_at','completed_at','deleted_at'],
  bd_subtasks:['id','task_id','title','done','position'],
  bd_events:['id','title','starts_at','ends_at','all_day','location','color','text_color','deleted_at'],
};
export const backupColumns = (table:BackupTable)=>fields[table].join(',');
/** Visit embedded asset records without changing the page's prose. */
export function transformBackupBody(body:string, f:(v:Record<string,unknown>)=>void) {
  const visit=(value:unknown):void=>{if(Array.isArray(value)){value.forEach(visit);return;}if(value&&typeof value==='object'){const record=value as Record<string,unknown>;f(record);Object.values(record).forEach(visit);}};
  const journal=/<!-- basedly-journal-photos:v[12] -->/.exec(body);
  const start=journal?journal.index+journal[0].length:body.startsWith('<!-- basedly-')?body.indexOf('\n')+1:0;
  if(!start)return body;
  try{const data:unknown=JSON.parse(body.slice(start));visit(data);return body.slice(0,start)+JSON.stringify(data);}catch{return body;}
}
const object=(v:unknown):v is BackupRow=>!!v&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
export function parseBackup(value:unknown):StudyBackup {
  if(!object(value)||value.format!=='basedly-study'||value.version!==1||!object(value.tables)||!Array.isArray(value.assets))throw new Error('Choose a Basedly study backup (version 1).');
  const tables={} as StudyBackup['tables'];
  for(const table of BACKUP_TABLES){const rows=value.tables[table];if(!Array.isArray(rows)||rows.length>100_000)throw new Error('The backup has an invalid or oversized '+table+' section.');
    const seen=new Set<string>();tables[table]=rows.map(row=>{if(!object(row))throw new Error('Invalid backup row.');const key=table==='bd_note_tags'?`${row.note_id}:${row.tag}`:row.id;if(typeof key!=='string'||seen.has(key)||(table!=='bd_note_tags'&&!id(key)))throw new Error('Duplicate or invalid record ID.');seen.add(key);
      const out=Object.fromEntries(fields[table].filter(f=>f in row).map(f=>[f,row[f]]));
      for(const [field,v] of Object.entries(out)){if(v!==null&&!['string','number','boolean'].includes(typeof v))throw new Error('Invalid field '+field);}
      if(table==='bd_notes'&&(typeof out.body!=='string'||typeof out.title!=='string'||!id(out.notebook_id)))throw new Error('A page is missing its content or notebook.');
      return out;
    });
  }
  const bookIds=new Set(tables.bd_notebooks.map(r=>r.id)),noteIds=new Set(tables.bd_notes.map(r=>r.id)),taskIds=new Set(tables.bd_tasks.map(r=>r.id)),listIds=new Set(tables.bd_lists.map(r=>r.id));
  if(tables.bd_notes.some(r=>!bookIds.has(r.notebook_id))||tables.bd_note_tags.some(r=>!noteIds.has(r.note_id))||tables.bd_subtasks.some(r=>!taskIds.has(r.task_id))||tables.bd_tasks.some(r=>r.list_id&&!listIds.has(r.list_id)))throw new Error('This backup has missing parent records and cannot be restored safely.');
  const assetIds=new Set<string>();
  const assets=value.assets.map(a=>{if(!object(a)||!id(a.localId)||assetIds.has(String(a.localId))||typeof a.name!=='string'||typeof a.type!=='string'||!/^image\/(?:png|jpeg|webp|gif)$|^application\/pdf$/.test(a.type)||typeof a.data!=='string'||a.data.length>60_000_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(a.data))throw new Error('Invalid page attachment in backup.');assetIds.add(String(a.localId));return {localId:String(a.localId),name:a.name,type:a.type,data:a.data};});
  return {format:'basedly-study',version:1,createdAt:typeof value.createdAt==='string'?value.createdAt:'',tables,assets,metadata:object(value.metadata)?value.metadata:{}};
}

export function prepareRestore(backup:StudyBackup,makeId:()=>string) {
  const ids=new Map<string,string>();for(const table of BACKUP_TABLES)for(const row of backup.tables[table])if(typeof row.id==='string')ids.set(row.id,makeId());
  for(const asset of backup.assets)ids.set(asset.localId,makeId());
  if(Array.isArray(backup.metadata.tags))for(const tag of backup.metadata.tags)if(object(tag)&&id(tag.id))ids.set(String(tag.id),makeId());
  const remap=(text:string)=>text.replace(/[a-zA-Z0-9_-]{1,100}/g,part=>ids.get(part)||part);
  const tables={} as StudyBackup['tables'];
  for(const table of BACKUP_TABLES)tables[table]=backup.tables[table].map(row=>{
    const next={...row};for(const key of ['id','notebook_id','note_id','task_id','list_id'])if(typeof next[key]==='string')next[key]=ids.get(next[key] as string)||next[key];
    if(typeof next.body==='string')next.body=remap(next.body);if(typeof next.notes==='string')next.notes=remap(next.notes);
    if(table==='bd_notebooks'||table==='bd_lists')next.name='Restored · '+String(next.name||'Untitled');
    if(table==='bd_events')next.title='Restored · '+String(next.title||'Untitled');
    return next;
  });
  return {tables,ids};
}
