'use client';
import {useState,useEffect,useMemo,useRef} from 'react';
import dynamic from 'next/dynamic';
import {Icon} from '@/components/Icon';
import {NotebookCover} from '@/components/notes/NotebookCover';
import {useLayout} from '@/lib/useLayout';
import {useOverlayBack} from '@/lib/nav';
import {useNotebooks,useNotes,useTrash,useTags,useNoteActions,whenLabel,type Note} from '@/lib/notes';
import {useBoards,type Board} from '@/lib/canvas';
import {useShelfPrefs} from '@/lib/shelfPrefs';
import {useImageUrls} from '@/lib/imageStore';
import {ask} from '@/lib/ask';
import {DocumentWorkspace} from '@/components/notes/DocumentWorkspace';
import {NotebookBuilder} from '@/components/notes/NotebookBuilder';
import {PageTypeArt} from '@/components/notes/PageTypeArt';
import {ContextMenu,type CtxItem} from '@/components/ContextMenu';
import {saveObjectCover,migrateNotebookCovers} from '@/lib/objectCovers';
import {PAGE_TYPES,pageKind,pagePreview,initialBody,type PageKind} from '@/lib/pageKinds';
import './notebooks.css';
const Loading=()=> <div className="page-loading" role="status">Opening your page…</div>;
const NoteEditor=dynamic(()=>import('@/components/notes/NoteEditor').then(m=>m.NoteEditor),{ssr:false,loading:Loading});
const FreeBoard=dynamic(()=>import('@/components/notes/FreeBoard').then(m=>m.FreeBoard),{ssr:false,loading:Loading});
const StudyPage=dynamic(()=>import('@/components/notes/StudyPage').then(m=>m.StudyPage),{ssr:false,loading:Loading});
const JournalPage=dynamic(()=>import('@/components/notes/JournalPage').then(m=>m.JournalPage),{ssr:false,loading:Loading});
const CodePage=dynamic(()=>import('@/components/notes/CodePage').then(m=>m.CodePage),{ssr:false,loading:Loading});
const CoverCapture=dynamic(()=>import('@/components/notes/CoverCapture').then(m=>m.CoverCapture),{ssr:false});
const Canvas=dynamic(()=>import('@/components/notes/Canvas').then(m=>m.Canvas),{ssr:false,loading:Loading});
const Journal=dynamic(()=>import('@/components/notes/Journal').then(m=>m.Journal),{ssr:false,loading:Loading});
const JavaLab=dynamic(()=>import('@/components/JavaLab').then(m=>m.JavaLab),{ssr:false,loading:Loading});
const COLORS=['#ffcd38','#3985ed','#fa614e','#73b88b','#d4b6e6','#f0cbb5'];
const pageType=(kind:PageKind)=>PAGE_TYPES.find(p=>p.kind===(kind==='moodboard'?'whiteboard':kind))!;

export default function NotebooksPage(){
 const {phone}=useLayout();const N=useNotebooks();const noteQuery=useNotes();const {data:notes=[]}=noteQuery;const {data:trash=[]}=useTrash();const {data:tags={}}=useTags();const {data:boards=[]}=useBoards();const A=useNoteActions();
 const notebooks=N.data||[];const [nbId,setNbId]=useState<string|null>(null);const [noteId,setNoteId]=useState<string|null>(null);
 const [creating,setCreating]=useState(false);const [inTrash,setTrash]=useState(false);const [query,setQuery]=useState('');const [pageQuery,setPageQuery]=useState('');const [camera,setCamera]=useState<string|null>(null);const [newBookBusy,setNewBookBusy]=useState(false);
 const [building,setBuilding]=useState(false);const [notice,setNotice]=useState('');const [context,setContext]=useState<{x:number;y:number;label:string;items:CtxItem[]}|null>(null);
 const [legacy,setLegacy]=useState<Board|'journal'|'code'|null>(null);const [moveOpen,setMoveOpen]=useState(false);const deepLink=useRef(false);
 const shelf=useShelfPrefs();const urls=useImageUrls(Object.values(shelf.books).map(b=>b.image));
 useEffect(()=>{if(N.data)void migrateNotebookCovers(N.data,shelf.books);},[N.data,shelf.books]);
 const notebook=notebooks.find(b=>b.id===nbId);const note=notes.find(n=>n.id===noteId);
 useOverlayBack(!!nbId,()=>{setNbId(null);setNoteId(null);setCreating(false);});
 useOverlayBack(!!noteId,()=>{setNoteId(null);setMoveOpen(false);});useOverlayBack(creating,()=>setCreating(false));useOverlayBack(inTrash,()=>setTrash(false));useOverlayBack(!!legacy,()=>setLegacy(null));useOverlayBack(moveOpen,()=>setMoveOpen(false));
 useEffect(()=>{if(deepLink.current)return;const params=new URLSearchParams(location.search);const id=params.get('note')||params.get('open');const book=params.get('notebook');if(!id){if(book&&notebooks.some(b=>b.id===book))setNbId(book);if(!book||notebooks.length)deepLink.current=true;return;}const found=notes.find(n=>n.id===id);if(found){deepLink.current=true;setNbId(found.notebook_id);setNoteId(found.id);}},[notes,notebooks]);
 const openBook=(id:string)=>{setPageQuery('');setNbId(id);};
 const openNote=(n:Note)=>{setNbId(n.notebook_id);setNoteId(n.id);};
 const newNotebook=()=>setBuilding(true);
 const finishNotebook=async(name:string,color:string,photo?:Blob)=>{setNewBookBusy(true);try{const id=crypto.randomUUID();await A.newNotebook.mutateAsync({id,name,color,position:notebooks.length});if(photo){try{const result=await saveObjectCover({kind:'notebook',id,title:name,color},photo);setNotice(result==='device'?'Cover saved on this device. It will retry syncing when connected.':'');}catch{setNotice('Notebook created. Its photo could not be saved. Add it again from the library.');}}setBuilding(false);openBook(id);setCreating(true);}finally{setNewBookBusy(false);}};
 const pageMenu=(e:React.MouseEvent,n:Note)=>{e.preventDefault();setContext({x:e.clientX,y:e.clientY,label:n.title||'Page',items:[{icon:'book',label:'Open page',run:()=>openNote(n)},{icon:'copy',label:'Duplicate page',run:()=>A.newNote.mutate({id:crypto.randomUUID(),notebook_id:n.notebook_id,title:n.title+' copy',body:n.body})},{icon:'trash',label:'Move to trash',danger:true,run:()=>A.deleteWithUndo(n)}]});};
 const contextMenu=context&&<ContextMenu x={context.x} y={context.y} label={context.label} kind="Library" items={context.items} onClose={()=>setContext(null)}/>;
 const createPage=(kind:PageKind,titleOverride?:string)=>{if(!nbId)return;const id=crypto.randomUUID();const title=titleOverride||(kind==='journal'?new Date().toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'}):'Untitled '+pageType(kind).name.toLowerCase());setCreating(false);A.newNote.mutate({id,notebook_id:nbId,title,body:initialBody(kind)});setNoteId(id);};
 const rename=async(id:string,name:string)=>{const value=await ask('Rename notebook',{initial:name});if(value?.trim())A.editNotebook.mutate({id,patch:{name:value.trim()}});};
 const visible=notebooks.filter(b=>b.name.toLowerCase().includes(query.toLowerCase()));
 const mine=notes.filter(n=>n.notebook_id===nbId);
 const summaries=useMemo(()=>new Map(notes.map(n=>[n.id,{kind:pageKind(n.body),preview:pagePreview(n.body)}])),[notes]);
 const counts=useMemo(()=>{const result=new Map<string,number>();for(const n of notes)result.set(n.notebook_id,(result.get(n.notebook_id)||0)+1);return result;},[notes]);
 const shownPages=mine.filter(n=>(n.title+' '+summaries.get(n.id)?.preview).toLowerCase().includes(pageQuery.toLowerCase()));
 const deletePage=(n:Note)=>{A.deleteWithUndo(n);setNoteId(null);};
 const renderNote=(n:Note)=>{const kind=summaries.get(n.id)!.kind;const save=(v:{title:string;body:string})=>A.saveNote.mutate({id:n.id,notebook_id:n.notebook_id,...v});
  if(kind==='whiteboard'||kind==='moodboard'||kind==='pdf')return <FreeBoard key={n.id} note={n} onSave={save}/>;
  if(kind==='journal')return <JournalPage key={n.id} note={n} onSave={save}/>;
  if(kind==='code')return <CodePage key={n.id} note={n} onSave={save}/>;
  if(kind==='checklist'||kind==='flashcards'||kind==='cornell')return <StudyPage key={n.id} note={n} onSave={save}/>;
  return <DocumentWorkspace key={n.id} note={n}><NoteEditor key={n.id} note={n} notes={notes} tags={tags[n.id]||[]} phone={phone} onSave={save} onDelete={()=>deletePage(n)} onPickNote={id=>{const x=notes.find(n=>n.id===id);if(x)openNote(x);}} onNewNote={title=>createPage('document',title)} onSetTags={t=>A.setTags.mutate({note_id:n.id,tags:t})}/></DocumentWorkspace>;
 };
 if(note)return <div className="editor-room"><div className="editor-breadcrumb"><button onClick={()=>setNoteId(null)}><Icon name="back" size={17}/>{notebook?.name||'Notebook'}</button><span>/</span><span>{pageType(summaries.get(note.id)!.kind).name}</span><div className="editor-actions"><button onClick={()=>setMoveOpen(v=>!v)} title="Move to another notebook" aria-expanded={moveOpen}><Icon name="book" size={17}/><span>Move</span></button><button onClick={()=>deletePage(note)} aria-label="Move page to trash"><Icon name="trash" size={17}/></button></div></div>{moveOpen&&<div className="page-move-picker"><span>Move this page to</span>{notebooks.filter(b=>b.id!==note.notebook_id).map(b=><button key={b.id} onClick={()=>{A.moveNote.mutate({id:note.id,notebook_id:b.id});setNbId(b.id);setMoveOpen(false);}}>{b.name}<Icon name="chev" size={16}/></button>)}{notebooks.length<2&&<p>Create another notebook in your library first.</p>}</div>}<div className="editor-content">{renderNote(note)}</div></div>;
 if(legacy)return <div className="editor-room"><button className="studio-button" style={{alignSelf:'flex-start'}} onClick={()=>setLegacy(null)}><Icon name="back"/>Library</button><div className="editor-content">{legacy==='journal'?<Journal/>:legacy==='code'?<JavaLab/>:<Canvas notes={notes} phone={phone} boardId={legacy.id} onBoard={id=>setLegacy(boards.find(b=>b.id===id)||null)} onOpenNote={id=>{const n=notes.find(n=>n.id===id);if(n){setLegacy(null);openNote(n);}}}/>}</div></div>;
 if(inTrash)return <section><div className="notebook-room-header"><button onClick={()=>setTrash(false)} aria-label="Back to library"><Icon name="back"/></button><h1>Trash</h1></div>{trash.length?trash.map(n=><div className="page-row" key={n.id}><span className="page-row-main">{n.title}</span><button className="studio-button" onClick={()=>A.restoreNote.mutate({id:n.id})}>Restore</button></div>):<div className="studio-empty">Your trash is empty.</div>}</section>;
 if(nbId)return <section className="notebook-room"><header className="notebook-room-header"><button aria-label="Back to library" onClick={()=>{setNbId(null);setCreating(false);}}><Icon name="back"/></button><h1>{notebook?.name||'New notebook'}</h1><button className="studio-button primary" aria-expanded={creating} onClick={()=>setCreating(v=>!v)}><Icon name={creating?'close':'plus'} size={18}/>{creating?'Close':'Add page'}</button></header><p className="notebook-caption">{mine.length} {mine.length===1?'page':'pages'} · Every kind of idea belongs here.</p>{creating&&<div className="page-creator">{PAGE_TYPES.map(p=><button key={p.kind} className="page-choice" onClick={()=>createPage(p.kind)}><PageTypeArt kind={p.kind}/><strong>{p.name}</strong><small>{p.description}</small></button>)}</div>}{!!mine.length&&<input className="studio-input page-search" aria-label="Find a page" placeholder="Find a page in this notebook…" value={pageQuery} onChange={e=>setPageQuery(e.target.value)}/>}<div className="page-list">{shownPages.map(n=>{const summary=summaries.get(n.id)!;const type=pageType(summary.kind);return <button key={n.id} className="page-row" onContextMenu={e=>pageMenu(e,n)} onClick={()=>openNote(n)}><Icon name={type.icon} size={21}/><div className="page-row-main"><strong>{n.title||'Untitled'}</strong><small>{summary.preview||'A fresh page, ready for your ideas.'}</small></div><span className="page-kind">{type.name}</span><time>{whenLabel(n.updated_at)}</time><Icon name="chev" size={17}/></button>;})}</div>{noteQuery.isPending?<Loading/>:noteQuery.isError?<div className="studio-error">Pages could not be loaded. <button onClick={()=>noteQuery.refetch()}>Try again</button></div>:!mine.length&&!creating?<div className="studio-empty"><h2>One notebook. Every kind of idea.</h2><p>Keep class notes, sketches, inspiration and study tools together.</p><button className="studio-button primary" onClick={()=>setCreating(true)}><Icon name="plus"/>Create your first page</button></div>:!!pageQuery&&!shownPages.length?<p className="studio-empty">No pages match “{pageQuery}”.</p>:null}{contextMenu}{notice&&<p role="status">{notice}</p>}</section>;
 return <section className="library-page"><header className="library-hero"><div className="library-hero-copy"><h1 className="studio-heading">Room for<br/>every idea.</h1><p className="studio-subtitle">Your notes, sketches and sparks of inspiration.<br/>All together, in your notebooks.</p></div><div className="library-graphic" aria-hidden="true"><span/><span/><span/><span/></div></header><div className="library-toolbar"><h2>Your notebooks<span>{notebooks.length}</span></h2><input className="studio-input" aria-label="Find a notebook" placeholder="Find a notebook…" value={query} onChange={e=>setQuery(e.target.value)}/><button className="studio-button primary" disabled={newBookBusy} onClick={newNotebook}><Icon name="plus" size={18}/>{newBookBusy?'Creating…':'New notebook'}</button></div>
 {building&&<NotebookBuilder onClose={()=>setBuilding(false)} onCreate={finishNotebook}/>}
 {notice&&<p className="studio-error" role="status">{notice}</p>}
 {N.isPending?<div className="notebook-grid" aria-label="Loading notebooks">{[0,1,2].map(i=><div key={i} className="new-notebook" role="status">Loading…</div>)}</div>:N.isError?<div className="studio-error">Couldn’t load notebooks. <button onClick={()=>N.refetch()}>Try again</button></div>:<div className="notebook-grid">{visible.map(b=>{const count=counts.get(b.id)||0;const image=shelf.books[b.id]?.image;return <article className="notebook-cover" key={b.id} onContextMenu={e=>{e.preventDefault();setContext({x:e.clientX,y:e.clientY,label:b.name,items:[{icon:'book',label:'Open notebook',run:()=>openBook(b.id)},{icon:'photo',label:'Photograph cover',run:()=>setCamera(b.id)},{icon:'edit',label:'Rename notebook',run:()=>rename(b.id,b.name)}]});}}><button className="notebook-cover-face" aria-label={'Open '+b.name} onClick={()=>openBook(b.id)}><span className="notebook-art-zone"><NotebookCover seed={b.id} color={b.color} imageUrl={image?urls[image]:undefined}/></span><span className="notebook-cover-title">{b.name}</span><span className="cover-meta"><span>{count} {count===1?'page':'pages'}</span><Icon name="chev" size={20}/></span></button><div className="cover-footer"><time>{whenLabel(notes.find(n=>n.notebook_id===b.id)?.updated_at||b.created_at)}</time><button aria-label={'Photograph cover for '+b.name} title="Add a cover photo" onClick={()=>setCamera(b.id)}><Icon name="photo" size={17}/></button><button aria-label={'Rename '+b.name} onClick={()=>rename(b.id,b.name)}><Icon name="edit" size={16}/></button></div></article>})}{!query&&<button className="new-notebook" disabled={newBookBusy} onClick={newNotebook}><Icon name="plus" size={33}/>Make a little space</button>}</div>}
 {query&&!visible.length&&!N.isPending&&<p className="studio-empty">No notebooks match “{query}”.</p>}
 <div className="section-heading"><h2>Pick up where you left off</h2><button className="studio-button" onClick={()=>setTrash(true)}><Icon name="trash" size={16}/>Trash</button></div>{notes.slice(0,5).map(n=><button className="recent-page" key={n.id} onContextMenu={e=>pageMenu(e,n)} onClick={()=>openNote(n)}><Icon name={pageType(summaries.get(n.id)!.kind).icon} size={18}/><strong>{n.title||'Untitled'}</strong><small>{notebooks.find(b=>b.id===n.notebook_id)?.name}</small><Icon name="chev" size={15}/></button>)}{!notes.length&&<p className="notebook-caption">The pages you use will find their way here.</p>}
 <details className="legacy-library"><summary>Earlier boards, journals & Java files</summary>{boards.map(b=><button className="recent-page" key={b.id} onClick={()=>setLegacy(b)}><Icon name="grid"/>{b.name}</button>)}<button className="recent-page" onClick={()=>setLegacy('journal')}>Saved journals</button><button className="recent-page" onClick={()=>setLegacy('code')}>Saved Java files</button></details>
 {contextMenu}
 {camera&&<CoverCapture target={{kind:'notebook',id:camera,title:notebooks.find(b=>b.id===camera)?.name||'Notebook',color:notebooks.find(b=>b.id===camera)?.color}} onClose={()=>setCamera(null)}/>}
 </section>;
}
