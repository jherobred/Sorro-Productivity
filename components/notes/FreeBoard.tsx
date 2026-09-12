'use client';
import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import dynamic from 'next/dynamic';
import {Icon,type IconName} from '@/components/Icon';
import {useOverlayBack} from '@/lib/nav';
import {readBoard,writeBoard,type BoardDocument,type BoardItem} from '@/lib/pageKinds';
import {canvasPoint,zoomAt,fitItems,strokeBounds,pressurePath,type Viewport} from '@/lib/boardGeometry';
import {savePageAsset,syncPageAsset,usePageAssetUrl} from '@/lib/pageAssets';
import {toast} from '@/lib/toast';
import type {Note} from '@/lib/notes';
import {usePageDraft} from './usePageDraft';
const PdfBackground=dynamic(()=>import('./PdfBackground').then(m=>m.PdfBackground),{ssr:false});
const INKS=['#272727','#faf9f4','#2454ed','#ed4639','#2d9159','#e5ad12'];
type Tool='select'|'hand'|'pen'|'text'|'eraser';
type Gesture={mode:'pan'|'draw'|'move'|'resize';pointer:number;start:{x:number;y:number};view:Viewport;item?:BoardItem;points?:number[][]};
function BoardImage({item}:{item:BoardItem}){const {url,error}=usePageAssetUrl(item.asset);return url||item.src?<img src={url||item.src} draggable={false} alt={item.asset?.name||'Board photo'}/>:<span className="board-image-loading">{error||'Loading photo…'}</span>;}

export function FreeBoard({note,onSave}:{note:Note;onSave:(v:{title:string;body:string})=>void}){
 const {draft,change,waiting}=usePageDraft(note,onSave);
 const [board,setBoard]=useState<BoardDocument>(()=>readBoard(note.body)!);const boardRef=useRef(board);boardRef.current=board;
 const [tool,setTool]=useState<Tool>(board.kind==='moodboard'?'select':'pen');const [color,setColor]=useState('#2454ed');const [width,setWidth]=useState(3);
 const [view,setView]=useState<Viewport>({x:40,y:40,scale:1});const viewRef=useRef(view);viewRef.current=view;
 const [selected,setSelected]=useState<string|null>(null);const [editing,setEditing]=useState<string|null>(null);const [busy,setBusy]=useState('');const [error,setError]=useState('');
 const [touchDraw,setTouchDraw]=useState(false);const [historyIndex,setHistoryIndex]=useState(0);const history=useRef<BoardDocument[]>([board]);
 const surface=useRef<HTMLDivElement>(null);const imagePicker=useRef<HTMLInputElement>(null);const pdfPicker=useRef<HTMLInputElement>(null);const livePath=useRef<SVGPathElement>(null);
 const gesture=useRef<Gesture|null>(null);const pointers=useRef(new Map<number,{x:number;y:number}>());const pinch=useRef<{distance:number;center:{x:number;y:number};view:Viewport}|null>(null);const penUntil=useRef(0);const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useOverlayBack(!!selected,()=>{setSelected(null);setEditing(null);});
 useOverlayBack(!!editing,()=>setEditing(null));
 const commit=(next:BoardDocument,record=true)=>{boardRef.current=next;setBoard(next);change({body:writeBoard(next)});if(record){const list=history.current.slice(0,historyIndex+1);list.push(next);if(list.length>60)list.shift();history.current=list;setHistoryIndex(list.length-1);}};
 const undo=(direction:number)=>{const index=historyIndex+direction;if(index<0||index>=history.current.length)return;setHistoryIndex(index);commit(history.current[index],false);setSelected(null);setEditing(null);};
 const screen=(clientX:number,clientY:number)=>{const rect=surface.current!.getBoundingClientRect();return {x:(clientX-rect.left)*surface.current!.clientWidth/rect.width,y:(clientY-rect.top)*surface.current!.clientHeight/rect.height};};
 const point=(clientX:number,clientY:number)=>{const p=screen(clientX,clientY);return canvasPoint(p.x,p.y,viewRef.current);};
 const center=()=>canvasPoint((surface.current?.clientWidth||700)/2,(surface.current?.clientHeight||500)/2,viewRef.current);
 const updateView=(next:Viewport)=>{viewRef.current=next;setView(next);};
 const fit=()=>{const all=[...boardRef.current.items];if(boardRef.current.pdf){const pages=boardRef.current.pdf.pages;const last=pages.at(-1);if(last)all.push({id:'pdf',type:'text',x:0,y:0,w:1480,h:last.y+last.h,color:'',text:''});}updateView(fitItems(all,surface.current?.clientWidth||700,surface.current?.clientHeight||500));};
 const zoom=(multiplier:number)=>updateView(zoomAt(viewRef.current,(surface.current?.clientWidth||700)/2,(surface.current?.clientHeight||500)/2,viewRef.current.scale*multiplier));
 const deleteSelected=()=>{if(!selected)return;commit({...boardRef.current,items:boardRef.current.items.filter(i=>i.id!==selected)});setSelected(null);setEditing(null);};
 const addText=(position=center())=>{const item:BoardItem={id:crypto.randomUUID(),type:'text',x:position.x-120,y:position.y-50,w:240,h:140,text:'',color};commit({...boardRef.current,items:[...boardRef.current.items,item]});setSelected(item.id);setEditing(item.id);setTool('select');};
 const addImages=async(files:FileList|File[])=>{
  setBusy('Adding photos…');setError('');try{const items:BoardItem[]=[];for(const [index,file] of Array.from(files).entries()){
   if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG or WebP image.');
   if(file.size>25*1024*1024)throw new Error('Choose an image smaller than 25 MB.');
   const bitmap=await createImageBitmap(file);const ratio=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);const ctx=canvas.getContext('2d');if(!ctx){bitmap.close();throw new Error('Your browser could not prepare this image.');}ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not prepare image.')),'image/webp',.86));
   const asset=await savePageAsset(new File([blob],file.name.replace(/\.[^.]+$/,'.webp'),{type:'image/webp'}));const p=center();items.push({id:crypto.randomUUID(),type:'image',x:p.x-150+index*24,y:p.y-100+index*24,w:300,h:300*canvas.height/canvas.width,color:'',asset});
  }if(!mounted.current)return;commit({...boardRef.current,items:[...boardRef.current.items,...items]});if(items.length)setSelected(items.at(-1)!.id);setTool('select');
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'The photo could not be added.');}finally{if(mounted.current)setBusy('');}
 };
 const importPdf=async(file:File)=>{
  setBusy('Preparing your PDF…');setError('');try{if(file.size>40*1024*1024)throw new Error('Choose a PDF smaller than 40 MB.');const {describePdf}=await import('./PdfBackground');const pages=await describePdf(await file.arrayBuffer());if(!pages.length)throw new Error('This PDF has no pages.');const asset=await savePageAsset(file);if(!mounted.current)return;commit({...boardRef.current,pdf:{asset,pages}});const w=surface.current?.clientWidth||800;updateView({scale:Math.min(1,w/1480),x:0,y:35});
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'The PDF could not be opened.');}finally{if(mounted.current)setBusy('');}
 };
 const syncAssets=async()=>{setBusy('Syncing attachments…');setError('');try{const original=boardRef.current;let pdf=original.pdf;if(pdf&&!pdf.asset.path)pdf={...pdf,asset:await syncPageAsset(pdf.asset)};const replacements=new Map<string,BoardItem>();for(const item of original.items){if(item.asset&&!item.asset.path)replacements.set(item.id,{...item,asset:await syncPageAsset(item.asset)});}if(mounted.current){commit({...boardRef.current,pdf,items:boardRef.current.items.map(i=>replacements.get(i.id)||i)});toast('Attachments synced');}}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Sync failed. Your files remain on this device.');}finally{if(mounted.current)setBusy('');}};
 const down=(e:ReactPointerEvent)=>{
  if(e.button>1||busy||editing)return;if(e.pointerType==='pen')penUntil.current=performance.now()+650;if(e.pointerType==='touch'&&performance.now()<penUntil.current)return;
  const local=screen(e.clientX,e.clientY);pointers.current.set(e.pointerId,local);surface.current?.setPointerCapture(e.pointerId);
  if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},view:viewRef.current};gesture.current=null;livePath.current?.setAttribute('d','');return;}
  const p=point(e.clientX,e.clientY);const node=(e.target as Element).closest<HTMLElement>('[data-board-item]');const hit=boardRef.current.items.find(i=>i.id===node?.dataset.boardItem);
  const pan=tool==='hand'||e.button===1||(e.pointerType==='touch'&&!touchDraw&&tool==='pen');
  if(pan){gesture.current={mode:'pan',pointer:e.pointerId,start:local,view:viewRef.current};return;}
  if(tool==='text'){e.preventDefault();addText(p);return;}
  if(tool==='eraser'){if(hit)commit({...boardRef.current,items:boardRef.current.items.filter(i=>i.id!==hit.id)});return;}
  if(tool==='pen'){gesture.current={mode:'draw',pointer:e.pointerId,start:p,view:viewRef.current,points:[[p.x,p.y,e.pressure||.5]]};livePath.current?.setAttribute('d',pressurePath(gesture.current.points!,width));return;}
  if(hit){setSelected(hit.id);gesture.current={mode:(e.target as HTMLElement).dataset.resize?'resize':'move',pointer:e.pointerId,start:p,view:viewRef.current,item:{...hit}};}else{setSelected(null);setEditing(null);gesture.current={mode:'pan',pointer:e.pointerId,start:local,view:viewRef.current};}
 };
 const move=(e:ReactPointerEvent)=>{
  if(!pointers.current.has(e.pointerId))return;const local=screen(e.clientX,e.clientY);pointers.current.set(e.pointerId,local);
  if(pinch.current&&pointers.current.size>=2){const [a,b]=[...pointers.current.values()],pin=pinch.current;const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};const next=zoomAt(pin.view,pin.center.x,pin.center.y,pin.view.scale*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pin.distance));updateView({...next,x:next.x+mid.x-pin.center.x,y:next.y+mid.y-pin.center.y});return;}
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;if(e.pointerType==='pen')penUntil.current=performance.now()+650;
  if(g.mode==='pan'){updateView({...g.view,x:g.view.x+local.x-g.start.x,y:g.view.y+local.y-g.start.y});return;}
  const p=point(e.clientX,e.clientY);
  if(g.mode==='draw'){const events=e.nativeEvent.getCoalescedEvents?.()||[e.nativeEvent];for(const event of events){const at=point(event.clientX,event.clientY),last=g.points!.at(-1)!;if(Math.hypot(at.x-last[0],at.y-last[1])>.35/viewRef.current.scale)g.points!.push([at.x,at.y,event.pressure||.5]);}livePath.current?.setAttribute('d',pressurePath(g.points!,width));return;}
  if(g.item){const item=g.item;const patch=g.mode==='resize'?{w:Math.max(60,item.w+p.x-g.start.x),h:Math.max(45,item.h+p.y-g.start.y)}:{x:item.x+p.x-g.start.x,y:item.y+p.y-g.start.y};const next={...boardRef.current,items:boardRef.current.items.map(i=>i.id===item.id?{...i,...patch}:i)};boardRef.current=next;setBoard(next);}
 };
 const up=(e:ReactPointerEvent)=>{pointers.current.delete(e.pointerId);if(pinch.current){if(pointers.current.size<2)pinch.current=null;gesture.current=null;return;}const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;gesture.current=null;
  if(g.mode==='draw'&&g.points?.length){commit({...boardRef.current,items:[...boardRef.current.items,strokeBounds(g.points,color,width,crypto.randomUUID())]});livePath.current?.setAttribute('d','');}
  else if(g.mode==='move'||g.mode==='resize')commit(boardRef.current);
 };
 const cancel=(e:ReactPointerEvent)=>{pointers.current.delete(e.pointerId);pinch.current=null;const g=gesture.current;gesture.current=null;livePath.current?.setAttribute('d','');if(g?.item){const next={...boardRef.current,items:boardRef.current.items.map(i=>i.id===g.item!.id?g.item!:i)};boardRef.current=next;setBoard(next);}};
 useEffect(()=>{const element=surface.current;if(!element)return;const wheel=(e:WheelEvent)=>{if((e.target as HTMLElement).closest('textarea,input'))return;e.preventDefault();const p=screen(e.clientX,e.clientY);if(e.ctrlKey||e.metaKey)updateView(zoomAt(viewRef.current,p.x,p.y,viewRef.current.scale*Math.exp(-e.deltaY*.004)));else updateView({...viewRef.current,x:viewRef.current.x-e.deltaX,y:viewRef.current.y-e.deltaY});};element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);},[]);
 const localFiles=board.items.filter(i=>i.asset&&!i.asset.path).length+(board.pdf&&!board.pdf.asset.path?1:0);
 const chosen=board.items.find(i=>i.id===selected);
 const tools:{id:Tool;label:string;icon:IconName}[]=[{id:'select',label:'Select',icon:'cursor'},{id:'hand',label:'Pan',icon:'hand'},{id:'pen',label:'Draw',icon:'pen'},{id:'text',label:'Text',icon:'text'},{id:'eraser',label:'Erase object',icon:'trash'}];
 return <section className="free-board" aria-label={board.kind==='pdf'?'PDF annotation workspace':'Infinite '+board.kind}>
  <div className="page-edit-header"><input className="page-title-input note-editor-clean-input" aria-label="Page title" value={draft.title} onChange={e=>change({title:e.target.value})}/><span className="page-save-status">{waiting?'Saving changes…':'Autosave on'}</span></div>
  <div className="board-toolbar" role="toolbar" aria-label="Canvas tools">{tools.map(t=><button key={t.id} className="board-tool" aria-pressed={tool===t.id} title={t.label} onClick={()=>{setTool(t.id);setEditing(null);}}><Icon name={t.icon} size={18}/><span>{t.label}</span></button>)}<span className="board-tool-divider"/>
   <button className="board-tool" disabled={!!busy} onClick={()=>imagePicker.current?.click()}><Icon name="photo" size={18}/><span>Photo</span></button><button className="board-tool" disabled={historyIndex===0} aria-label="Undo canvas change" onClick={()=>undo(-1)}><Icon name="undo" size={18}/></button><button className="board-tool" disabled={historyIndex===history.current.length-1} aria-label="Redo canvas change" onClick={()=>undo(1)}><Icon name="redo" size={18}/></button>
   <div className="board-inks">{INKS.map(ink=><button key={ink} style={{background:ink}} aria-label={'Ink '+ink} aria-pressed={color===ink} onClick={()=>setColor(ink)}/>)}</div><label className="board-width">Width<input type="range" min="1" max="16" value={width} aria-label="Pen width" onChange={e=>setWidth(Number(e.target.value))}/></label>{tool==='pen'&&<label className="board-touch"><input type="checkbox" checked={touchDraw} onChange={e=>setTouchDraw(e.target.checked)}/>Draw with finger</label>}
  </div>
  {error&&<div className="board-notice" role="alert">{error}<button onClick={()=>setError('')} aria-label="Dismiss error"><Icon name="close" size={16}/></button></div>}
  {!!localFiles&&<div className="board-notice">{localFiles} {localFiles===1?'attachment is':'attachments are'} saved on this device. <button disabled={!!busy} onClick={syncAssets}>Retry cloud sync</button></div>}
  <div className={'board-surface tool-'+tool} ref={surface} tabIndex={0} aria-label="Canvas. Draw with a pen, pan with two fingers, or use the zoom controls." onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)void addImages(e.dataTransfer.files);}} onKeyDown={e=>{if((e.target as HTMLElement).matches('input,textarea'))return;if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo(e.shiftKey?1:-1);}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelected();}if(e.key==='+')zoom(1.2);if(e.key==='-')zoom(1/1.2);if(e.key==='0')fit();}}>
   <div className="board-world" style={{transform:`translate(${view.x}px,${view.y}px) scale(${view.scale})`}}>
    {board.pdf&&<><div className="pdf-margin-paper" style={{width:1480,height:(board.pdf.pages.at(-1)?.y||0)+(board.pdf.pages.at(-1)?.h||0)}}/><PdfBackground source={board.pdf}/></>}
    {board.items.map(item=><div key={item.id} data-board-item={item.id} className={'board-object '+item.type+(selected===item.id?' is-selected':'')} style={{left:item.x,top:item.y,width:item.w,height:item.h}} onDoubleClick={()=>{if(item.type==='text'){setSelected(item.id);setEditing(item.id);}}}>
     {item.type==='image'?<BoardImage item={item}/>:item.type==='stroke'?<svg width={item.w} height={item.h} style={{overflow:'visible'}}><path d={pressurePath(item.points||[],item.width||3)} fill={item.color}/></svg>:editing===item.id?<textarea autoFocus aria-label="Canvas text" value={item.text||''} onPointerDown={e=>e.stopPropagation()} onChange={e=>{const next={...boardRef.current,items:boardRef.current.items.map(i=>i.id===item.id?{...i,text:e.target.value}:i)};boardRef.current=next;setBoard(next);change({body:writeBoard(next)});}} onBlur={()=>{setEditing(null);commit(boardRef.current);}}/>:<div className="board-text-content" style={{color:item.color}}>{item.text||'Double-click to write'}</div>}
     {selected===item.id&&item.type!=='stroke'&&editing!==item.id&&<button data-resize="true" className="board-resize" aria-label="Resize selected object"/>}
    </div>)}
    <svg className="board-live-stroke"><path ref={livePath} fill={color}/></svg>
   </div>
   {!board.items.length&&!board.pdf&&!busy&&<div className="board-welcome"><h2>{board.kind==='pdf'?'Make room around the page.':board.kind==='moodboard'?'Collect a little inspiration.':'An idea can go anywhere.'}</h2><p>{board.kind==='pdf'?'Import a PDF, then sketch and write on it or in the open space on either side.':board.kind==='moodboard'?'Drop a photo, add a thought, and move things until they make sense.':'Draw with your stylus. Add text or photos. Keep going in any direction.'}</p><button className="studio-button primary" onPointerDown={e=>e.stopPropagation()} onClick={()=>board.kind==='pdf'?pdfPicker.current?.click():board.kind==='moodboard'?imagePicker.current?.click():addText()}><Icon name={board.kind==='pdf'?'upload':board.kind==='moodboard'?'photo':'text'} size={18}/>{board.kind==='pdf'?'Import PDF':board.kind==='moodboard'?'Add a photo':'Add a thought'}</button></div>}
   {busy&&<div className="board-busy" role="status">{busy}</div>}
   {chosen&&<div className="board-selection-tools" onPointerDown={e=>e.stopPropagation()}>{chosen.type==='text'&&<button onClick={()=>setEditing(chosen.id)}>Edit text</button>}<button onClick={()=>{const item={...chosen,id:crypto.randomUUID(),x:chosen.x+25,y:chosen.y+25};commit({...boardRef.current,items:[...boardRef.current.items,item]});setSelected(item.id);}}>Duplicate</button><button onClick={deleteSelected}>Delete</button></div>}
  </div>
  <footer className="board-footer"><span>{board.pdf?`${board.pdf.pages.length} PDF pages · `:''}{board.items.length} objects <span className="board-hint">· Pen to draw, fingers to pan, pinch to zoom</span></span><div><button aria-label="Zoom out" onClick={()=>zoom(1/1.2)}><Icon name="minus" size={16}/></button><button onClick={fit} title="Fit everything (0)">{Math.round(view.scale*100)}%</button><button aria-label="Zoom in" onClick={()=>zoom(1.2)}><Icon name="plus" size={16}/></button><button onClick={fit}>Fit</button></div></footer>
  <input ref={imagePicker} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e=>{if(e.target.files)void addImages(e.target.files);e.target.value='';}}/><input ref={pdfPicker} hidden type="file" accept="application/pdf,.pdf" onChange={e=>{if(e.target.files?.[0])void importPdf(e.target.files[0]);e.target.value='';}}/>
 </section>;
}
