import {readDoc,docText} from './docFormat.ts';
import {readJournalBook,bookDays} from './journalPage.ts';
export type PageKind = 'document' | 'whiteboard' | 'moodboard' | 'pdf' | 'journal' | 'code' | 'checklist' | 'flashcards' | 'cornell' | 'freepage';
export const PAGE_TYPES = [
  {kind:'document',name:'Document',icon:'text',description:'Notes, lists and equations'},
  {kind:'freepage',name:'Free page',icon:'cursor',description:'Write anywhere on the sheet, in any order'},
  {kind:'whiteboard',name:'Board',icon:'pen',description:'Draw, collect photos and connect ideas'},
  {kind:'checklist',name:'Checklist',icon:'check',description:'Break a big idea into small steps'},
  {kind:'flashcards',name:'Flashcards',icon:'files',description:'Practice a question at a time'},
  {kind:'cornell',name:'Cornell notes',icon:'week',description:'Cues, lecture notes and a summary'},
  {kind:'pdf',name:'PDF annotation',icon:'files',description:'Read, mark up and think in the margins'},
  {kind:'journal',name:'Journal',icon:'book',description:'Reflect on today, plan tomorrow'},
  {kind:'code',name:'Code',icon:'code',description:'Java, HTML, CSS and JavaScript'},
] as const;
export type PageAsset = {localId:string;path?:string;name:string};
/**
 * frame 'polaroid' draws a photo as a polaroid with its caption under it, turned by tilt degrees.
 * A schema card keeps its text in body and may carry a photo; cards written before either
 * existed have fields instead. All of these are optional, so older boards read unchanged.
 */
export type BoardItem = {id:string;type:'text'|'image'|'stroke'|'schema';x:number;y:number;w:number;h:number;text?:string;title?:string;fields?:string[];body?:string;photo?:PageAsset;background?:string;brush?:'pen'|'marker'|'highlighter';opacity?:number;src?:string;asset?:PageAsset;color:string;points?:number[][];width?:number;frame?:'polaroid';caption?:string;tilt?:number};
export type BoardConnection = {id:string;from:string;to:string};
/** `drive` is the Google Drive file a PDF was opened from, so a device without a copy can fetch it again. */
export type PdfSource = {asset:PageAsset;pages:{w:number;h:number;y:number}[];margin?:number;drive?:string};
export type BoardDocument = {version:1;kind:'whiteboard'|'moodboard'|'pdf';items:BoardItem[];connections?:BoardConnection[];pdf?:PdfSource};
export type ChecklistDocument = {version:1;kind:'checklist';items:{id:string;text:string;done:boolean}[]};
export type FlashcardDocument = {version:1;kind:'flashcards';cards:{id:string;front:string;back:string}[];sourceNoteId?:string};
export type CornellDocument = {version:1;kind:'cornell';cues:string;notes:string;summary:string};
export type CodeDocument = {version:1;kind:'code';language:string;code:string};
/**
 * A free page is a sheet of note boxes, each holding rich text where it was put.
 *
 * The box content is the editor's own document, kept as data rather than markup
 * so nothing has to trust stored HTML to draw a page. `h` is the last measured
 * height, used for thumbnails and for how far the sheet reaches; it is written
 * back after an edit and may be missing on boxes written before it existed.
 */
export type RichNode = {type?:string;text?:string;attrs?:Record<string,unknown>;marks?:{type:string;attrs?:Record<string,unknown>}[];content?:RichNode[]};
/** A container on a free page. It holds writing, or with `image` set, a picture. */
export type FreeBox = {id:string;x:number;y:number;w:number;h?:number;doc:RichNode;tint?:string;image?:PageAsset};
/** Ink written straight on the page: points relative to x/y, each [x, y, pressure]. */
export type FreeInk = {id:string;x:number;y:number;w:number;h:number;color:string;width:number;points:number[][];highlighter?:boolean};
/** `ink` and `paper` came after the first free pages, so both are optional. */
export type FreePageDocument = {version:1;kind:'freepage';boxes:FreeBox[];ink?:FreeInk[];paper?:'plain'|'lines'|'grid'};
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
    if(data.pdf!==undefined&&(!record(data.pdf)||!validAsset(data.pdf.asset)||!Array.isArray(data.pdf.pages)||!data.pdf.pages.every(p=>record(p)&&finite(p.w)&&p.w>0&&finite(p.h)&&p.h>0&&finite(p.y))||(data.pdf.margin!==undefined&&(!finite(data.pdf.margin)||Number(data.pdf.margin)<0))||(data.pdf.drive!==undefined&&!str(data.pdf.drive))))return null;
    const ids = new Set<string>();
    for(const item of data.items){
      if(!record(item)||!str(item.id)||ids.has(item.id)||!['text','image','stroke','schema'].includes(String(item.type))||!['x','y','w','h'].every(k=>finite(item[k]))||Number(item.w)<0||Number(item.h)<0||!str(item.color))return null;
      if(item.type==='schema'&&(!str(item.title)||!Array.isArray(item.fields)||!item.fields.every(str)))return null;
      if(item.background!==undefined&&!str(item.background))return null;
      if((item.body!==undefined&&!str(item.body))||(item.photo!==undefined&&!validAsset(item.photo)))return null;
      if(item.opacity!==undefined&&(!finite(item.opacity)||item.opacity<0||item.opacity>1))return null;
      if(item.type==='text'&&!str(item.text))return null;
      if(item.type==='image'&&!validAsset(item.asset)&&(!str(item.src)||!/^data:image\/(png|jpeg|webp);base64,/.test(item.src)))return null;
      if(item.type==='stroke'&&(!Array.isArray(item.points)||!item.points.every(p=>Array.isArray(p)&&p.length>=2&&p.every(finite))))return null;
      if(item.width!==undefined&&(!finite(item.width)||item.width<=0))return null;
      if((item.frame!==undefined&&item.frame!=='polaroid')||(item.caption!==undefined&&!str(item.caption))||(item.tilt!==undefined&&!finite(item.tilt)))return null;
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
const BLOCKS=new Set(['doc','bulletList','orderedList','taskList','listItem','taskItem','blockquote']);
/** What a rich node says, with nothing of how it looks. Used for copying, previews and thumbnails. */
export function richText(node?:RichNode):string {
  if(!node)return '';
  if(str(node.text))return node.text;
  const parts=(node.content||[]).map(richText);
  return BLOCKS.has(String(node.type))?parts.filter(Boolean).join('\n'):parts.join('');
}
function validNode(v:unknown,depth=0):boolean {
  if(!record(v)||depth>14)return false;
  if(v.type!==undefined&&!str(v.type))return false;
  if(v.text!==undefined&&!str(v.text))return false;
  if(v.attrs!==undefined&&!record(v.attrs))return false;
  if(v.marks!==undefined&&(!Array.isArray(v.marks)||!v.marks.every(m=>record(m)&&str(m.type))))return false;
  if(v.content!==undefined&&(!Array.isArray(v.content)||!v.content.every(c=>validNode(c,depth+1))))return false;
  return true;
}
export function readFreePage(body:string):FreePageDocument|null {
  if(!body.startsWith(PAGE_MARKER))return null;
  try {
    const d: unknown=JSON.parse(body.slice(PAGE_MARKER.length));
    if(!record(d)||d.version!==1||d.kind!=='freepage'||!Array.isArray(d.boxes))return null;
    const ids=new Set<string>();
    for(const box of d.boxes){
      if(!record(box)||!str(box.id)||ids.has(box.id)||!['x','y','w'].every(k=>finite(box[k]))||Number(box.w)<=0)return null;
      if(box.h!==undefined&&(!finite(box.h)||Number(box.h)<0))return null;
      if(box.tint!==undefined&&!str(box.tint))return null;
      if(box.image!==undefined&&!validAsset(box.image))return null;
      if(!validNode(box.doc))return null;
      ids.add(box.id);
    }
    if(d.paper!==undefined&&!['plain','lines','grid'].includes(String(d.paper)))return null;
    if(d.ink!==undefined){
      if(!Array.isArray(d.ink))return null;
      for(const s of d.ink){
        if(!record(s)||!str(s.id)||ids.has(s.id)||!['x','y','w','h','width'].every(k=>finite(s[k]))||!str(s.color))return null;
        if(!Array.isArray(s.points)||!s.points.every(p=>Array.isArray(p)&&p.length>=2&&p.every(finite)))return null;
        if(s.highlighter!==undefined&&typeof s.highlighter!=='boolean')return null;
        ids.add(s.id);
      }
    }
    return d as FreePageDocument;
  } catch {return null;}
}
export const writeFreePage=(page:FreePageDocument)=>PAGE_MARKER+JSON.stringify(page);
/** Plain text as rich text: a paragraph per block, a line break kept as a break. */
export function plainDoc(text:string):RichNode {
  const blocks=text.split(/\n{2,}/).filter(b=>b.trim());
  return {type:'doc',content:(blocks.length?blocks:['']).map(block=>{const lines=block.split('\n');
    return {type:'paragraph',content:block.trim()?lines.flatMap((line,i)=>i?[{type:'hardBreak'},{type:'text',text:line}]:[{type:'text',text:line}]).filter(n=>n.type!=='text'||n.text):undefined};})};
}
/** A free page made from a scan: the text read off it on the left, the scan beside it. */
export function scanPage(text:string,image?:{asset:PageAsset;ratio:number}):FreePageDocument {
  const boxes:FreeBox[]=[];
  if(text.trim())boxes.push({id:crypto.randomUUID(),x:0,y:0,w:340,doc:plainDoc(text)});
  if(image)boxes.push({id:crypto.randomUUID(),x:text.trim()?372:0,y:0,w:320,h:Math.round(320*image.ratio),doc:{type:'doc',content:[{type:'paragraph'}]},image:image.asset});
  return {version:1,kind:'freepage',boxes};
}
export function pageKind(body:string):PageKind {
  // Only an explicit format opts into a structured editor. Ordinary markdown
  // beginning with a code fence must keep everything after that first fence.
  if(readFreePage(body))return 'freepage';
  return readBoard(body)?.kind || readStudy(body)?.kind || (body.startsWith('# Journal · ')?'journal':'document');
}
export function initialBody(kind:PageKind):string {
  if(kind==='whiteboard'||kind==='moodboard'||kind==='pdf')return writeBoard({version:1,kind,items:[]});
  if(kind==='checklist')return writeStudy({version:1,kind,items:[]});
  if(kind==='flashcards')return writeStudy({version:1,kind,cards:[]});
  if(kind==='cornell')return writeStudy({version:1,kind,cues:'',notes:'',summary:''});
  // Written as YYYY-MM-DD, the day this journal starts on. Its later days are
  // kept in the same page. See readJournalBook in journalPage.ts.
  if(kind==='journal'){const d=new Date(),today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return '# Journal · '+today+'\n\nWhat happened today?\n\n\nWhat am I thinking about?\n\n\nOne thing for tomorrow\n\n';}
  if(kind==='code')return writeStudy({version:1,kind,language:'java',code:''});
  if(kind==='freepage')return writeFreePage({version:1,kind,boxes:[]});
  return '';
}
export function pagePreview(body:string) {
  const doc=readDoc(body);if(doc)return docText(doc).replace(/\[\[|\]\]/g,'').replace(/\s+/g,' ').trim().slice(0,150);
  const board=readBoard(body);if(board)return board.kind==='pdf'?`${board.pdf?.pages.length||0} PDF pages · ${board.items.length} annotations`:board.items.length+' objects · board';
  const free=readFreePage(body);
  if(free)return free.boxes.map(b=>richText(b.doc)).join(' · ').replace(/\s+/g,' ').trim().slice(0,150)||`${free.boxes.length} ${free.boxes.length===1?'note':'notes'} on the sheet`;
  const study=readStudy(body);
  if(study?.kind==='checklist')return `${study.items.filter(i=>i.done).length} of ${study.items.length} done`;
  if(study?.kind==='flashcards')return `${study.cards.length} cards to practice`;
  if(study?.kind==='cornell')return study.notes.slice(0,150)||'Cues, notes and a summary';
  if(study?.kind==='code')return `${study.language} · ${study.code.split('\n').length} lines`;
  // A journal's photo list and day markers are comments, not writing. Show the
  // newest day's words instead of the raw page.
  if(body.startsWith('# Journal · ')){const book=readJournalBook({body,created_at:'1970-01-01T12:00:00'});const day=bookDays(book).filter(d=>book.entries[d].prose.trim()).at(-1);return day?book.entries[day].prose.replace(/\s+/g,' ').trim().slice(0,150):'';}
  return body.replace(/!\[[^\]]*\]\([^)]*\)/g,'[Image]').replace(/[#*`_\[\]]/g,'').slice(0,150);
}
