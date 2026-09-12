export type PageKind = 'document' | 'whiteboard' | 'moodboard' | 'pdf' | 'journal' | 'code' | 'checklist' | 'flashcards' | 'cornell';
export const PAGE_TYPES = [
  {kind:'document',name:'Document',icon:'text',description:'Notes, lists and equations'},
  {kind:'whiteboard',name:'Board',icon:'pen',description:'Draw, collect photos and connect ideas'},
  {kind:'checklist',name:'Checklist',icon:'check',description:'Break a big idea into small steps'},
  {kind:'flashcards',name:'Flashcards',icon:'files',description:'Practice a question at a time'},
  {kind:'cornell',name:'Cornell notes',icon:'week',description:'Cues, lecture notes and a summary'},
  {kind:'pdf',name:'PDF annotation',icon:'files',description:'Read, mark up and think in the margins'},
  {kind:'journal',name:'Journal',icon:'book',description:'Reflect on today, plan tomorrow'},
  {kind:'code',name:'Java',icon:'code',description:'A focused Java coding workspace'},
] as const;
export type PageAsset = {localId:string;path?:string;name:string};
export type BoardItem = {id:string;type:'text'|'image'|'stroke'|'schema';x:number;y:number;w:number;h:number;text?:string;title?:string;fields?:string[];background?:string;brush?:'pen'|'marker'|'highlighter';opacity?:number;src?:string;asset?:PageAsset;color:string;points?:number[][];width?:number};
export type BoardConnection = {id:string;from:string;to:string};
export type PdfSource = {asset:PageAsset;pages:{w:number;h:number;y:number}[]};
export type BoardDocument = {version:1;kind:'whiteboard'|'moodboard'|'pdf';items:BoardItem[];connections?:BoardConnection[];pdf?:PdfSource};
export type ChecklistDocument = {version:1;kind:'checklist';items:{id:string;text:string;done:boolean}[]};
export type FlashcardDocument = {version:1;kind:'flashcards';cards:{id:string;front:string;back:string}[]};
export type CornellDocument = {version:1;kind:'cornell';cues:string;notes:string;summary:string};
export type CodeDocument = {version:1;kind:'code';language:string;code:string};
export type StudyDocument = ChecklistDocument | FlashcardDocument | CornellDocument;
const BOARD_MARKER = '<!-- basedly-board:v1 -->\n';
const PAGE_MARKER = '<!-- basedly-page:v1 -->\n';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === 'string';
export function readBoard(body:string):BoardDocument|null {
  if(!body.startsWith(BOARD_MARKER))return null;
  try {
    const data: unknown=JSON.parse(body.slice(BOARD_MARKER.length));
    if(!record(data)||data.version!==1||!['whiteboard','moodboard','pdf'].includes(String(data.kind))||!Array.isArray(data.items))return null;
    if(data.pdf!==undefined&&(!record(data.pdf)||!validAsset(data.pdf.asset)||!Array.isArray(data.pdf.pages)||!data.pdf.pages.every(p=>record(p)&&finite(p.w)&&p.w>0&&finite(p.h)&&p.h>0&&finite(p.y))))return null;
    const ids = new Set<string>();
    for(const item of data.items){
      if(!record(item)||!str(item.id)||ids.has(item.id)||!['text','image','stroke','schema'].includes(String(item.type))||!['x','y','w','h'].every(k=>finite(item[k]))||Number(item.w)<0||Number(item.h)<0||!str(item.color))return null;
      if(item.type==='schema'&&(!str(item.title)||!Array.isArray(item.fields)||!item.fields.every(str)))return null;
      if(item.background!==undefined&&!str(item.background))return null;
      if(item.opacity!==undefined&&(!finite(item.opacity)||item.opacity<0||item.opacity>1))return null;
      if(item.type==='text'&&!str(item.text))return null;
      if(item.type==='image'&&!validAsset(item.asset)&&(!str(item.src)||!/^data:image\/(png|jpeg|webp);base64,/.test(item.src)))return null;
      if(item.type==='stroke'&&(!Array.isArray(item.points)||!item.points.every(p=>Array.isArray(p)&&p.length>=2&&p.every(finite))))return null;
      if(item.width!==undefined&&(!finite(item.width)||item.width<=0))return null;
      ids.add(item.id);
    }
    if(data.connections!==undefined&&(!Array.isArray(data.connections)||!data.connections.every(c=>record(c)&&str(c.id)&&str(c.from)&&str(c.to)&&ids.has(c.from)&&ids.has(c.to))))return null;
    return data as BoardDocument;
  } catch {return null;}
}
export const writeBoard=(board:BoardDocument)=>BOARD_MARKER+JSON.stringify(board);
function validAsset(v:unknown):v is PageAsset{return record(v)&&str(v.localId)&&str(v.name)&&(v.path===undefined||str(v.path));}
export function readStudy(body:string):StudyDocument|CodeDocument|null {
  if(!body.startsWith(PAGE_MARKER))return null;
  try {
    const d: unknown=JSON.parse(body.slice(PAGE_MARKER.length));
    if(!record(d)||d.version!==1)return null;
    if(d.kind==='cornell'&&str(d.cues)&&str(d.notes)&&str(d.summary))return d as CornellDocument;
    if(d.kind==='code'&&str(d.language)&&str(d.code))return d as CodeDocument;
    if(d.kind==='checklist'&&Array.isArray(d.items)&&d.items.every(i=>record(i)&&str(i.id)&&str(i.text)&&typeof i.done==='boolean'))return d as ChecklistDocument;
    if(d.kind==='flashcards'&&Array.isArray(d.cards)&&d.cards.every(c=>record(c)&&str(c.id)&&str(c.front)&&str(c.back)))return d as FlashcardDocument;
  } catch {}
  return null;
}
export const writeStudy=(page:StudyDocument|CodeDocument)=>PAGE_MARKER+JSON.stringify(page);
export function pageKind(body:string):PageKind {
  // Only an explicit format opts into a structured editor. Ordinary markdown
  // beginning with a code fence must keep everything after that first fence.
  return readBoard(body)?.kind || readStudy(body)?.kind || (body.startsWith('# Journal · ')?'journal':'document');
}
export function initialBody(kind:PageKind):string {
  if(kind==='whiteboard'||kind==='moodboard'||kind==='pdf')return writeBoard({version:1,kind,items:[]});
  if(kind==='checklist')return writeStudy({version:1,kind,items:[]});
  if(kind==='flashcards')return writeStudy({version:1,kind,cards:[]});
  if(kind==='cornell')return writeStudy({version:1,kind,cues:'',notes:'',summary:''});
  if(kind==='journal')return '# Journal · '+new Date().toLocaleDateString()+'\n\nWhat happened today?\n\n\nWhat am I thinking about?\n\n\nOne thing for tomorrow\n\n';
  if(kind==='code')return writeStudy({version:1,kind,language:'java',code:''});
  return '';
}
export function pagePreview(body:string) {
  const board=readBoard(body);if(board)return board.kind==='pdf'?`${board.pdf?.pages.length||0} PDF pages · ${board.items.length} annotations`:board.items.length+' objects · board';
  const study=readStudy(body);
  if(study?.kind==='checklist')return `${study.items.filter(i=>i.done).length} of ${study.items.length} done`;
  if(study?.kind==='flashcards')return `${study.cards.length} cards to practice`;
  if(study?.kind==='cornell')return study.notes.slice(0,150)||'Cues, notes and a summary';
  if(study?.kind==='code')return `${study.language} · ${study.code.split('\n').length} lines`;
  return body.replace(/!\[[^\]]*\]\([^)]*\)/g,'[Image]').replace(/[#*`_\[\]]/g,'').slice(0,150);
}
