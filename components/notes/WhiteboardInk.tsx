'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import type { InkStroke } from '@/lib/ink';
import { strokePath, readStrokes } from '@/lib/ink';

const EMPTY_INK: InkStroke[] = [];
export function WhiteboardInk({ boardId, strokes: remote = EMPTY_INK, viewport, onSave }: { boardId: string; strokes?: InkStroke[]; viewport: {x:number;y:number;z:number}; onSave: (strokes:InkStroke[])=>Promise<unknown> }) {
  const key=`basedly-ink-draft:${boardId}`;
  const [strokes,setStrokes]=useState<InkStroke[]>(()=>{try { const saved=localStorage.getItem(key); return saved?readStrokes(JSON.parse(saved)):remote; }catch{return remote;}});
  const [tool,setTool]=useState<'move'|'pen'|'erase'>('move');
  const [color,setColor]=useState('#649cf1');
  const [draft,setDraft]=useState<InkStroke|null>(null);
  const [redo,setRedo]=useState<InkStroke[]>([]);
  const [status,setStatus]=useState('');
  const svg=useRef<SVGSVGElement>(null);
  const active=useRef<InkStroke|null>(null);
  const current=useRef(strokes);
  const save=useRef(onSave);save.current=onSave;
  const pending=useRef<InkStroke[]|null>(null);
  const running=useRef(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const flush=async()=>{
    if(running.current)return;
    running.current=true;
    try{while(pending.current){const batch=pending.current;pending.current=null; if(mounted.current)setStatus('Saving…');try{await save.current(batch);if(!pending.current){localStorage.removeItem(key);if(mounted.current)setStatus('Saved');}}catch{pending.current=pending.current||batch;if(mounted.current)setStatus('Saved on this device · Retry sync');break;}}}finally{running.current=false;}
  };
  const commit=(next:InkStroke[])=>{current.current=next;setStrokes(next);try{localStorage.setItem(key,JSON.stringify(next));}catch{}pending.current=next;void flush();};
  useEffect(()=>{if(!pending.current&&!running.current){try{if(localStorage.getItem(key)){pending.current=current.current;void flush();return;}}catch{}setStrokes(remote);current.current=remote;}},[remote]);
  const point=(e:React.PointerEvent)=>{const r=svg.current!.getBoundingClientRect();return [(e.clientX-r.left-viewport.x)/viewport.z,(e.clientY-r.top-viewport.y)/viewport.z] as [number,number];};
  const finish=()=>{const stroke=active.current;if(!stroke)return;active.current=null;setDraft(null);setRedo([]);commit([...current.current,stroke]);};
  return <>
    <svg ref={svg} className="whiteboard-ink" aria-label="Freehand drawing layer" style={{position:'absolute',inset:0,width:'100%',height:'100%',zIndex:3,pointerEvents:tool==='move'?'none':'auto',touchAction:'none',cursor:tool==='move'?'grab':'crosshair'}}
      onPointerDown={e=>{if(tool==='move'||e.button!==0)return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);if(tool==='pen'){const stroke:InkStroke={id:crypto.randomUUID(),color,width:3,points:[point(e)]};active.current=stroke;setDraft(stroke);}}}
      onPointerMove={e=>{if(!active.current)return;e.stopPropagation();const p=point(e);const last=active.current.points.at(-1)!;if(Math.hypot(p[0]-last[0],p[1]-last[1])<1/viewport.z)return;active.current={...active.current,points:[...active.current.points,p]};setDraft(active.current);}}
      onPointerUp={e=>{e.stopPropagation();finish();}} onPointerCancel={finish}>
      <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.z})`}>{[...strokes,...(draft?[draft]:[])].map(s=><path key={s.id} d={strokePath(s.points)} fill="none" stroke={s.color} strokeWidth={tool==='erase'?Math.max(12,s.width):s.width} opacity={tool==='erase'?.65:1} strokeLinecap="round" strokeLinejoin="round" onPointerDown={e=>{if(tool!=='erase')return;e.stopPropagation();setRedo([]);commit(current.current.filter(x=>x.id!==s.id));}}/>)}</g>
    </svg>
    <div className="whiteboard-ink-tools" role="toolbar" aria-label="Whiteboard drawing tools">
      <button aria-pressed={tool==='move'} onClick={()=>setTool('move')} title="Move cards and pan"><Icon name="expand" size={16}/><span>Move</span></button>
      <button aria-pressed={tool==='pen'} onClick={()=>setTool('pen')} title="Draw freely"><Icon name="pen" size={16}/><span>Draw</span></button>
      <button aria-pressed={tool==='erase'} onClick={()=>setTool('erase')} title="Tap a stroke to erase"><Icon name="trash" size={16}/><span>Erase</span></button>
      <input type="color" value={color} onChange={e=>setColor(e.target.value)} aria-label="Pen color"/>
      <button disabled={!strokes.length} onClick={()=>{const last=current.current.at(-1);if(last){setRedo(r=>[...r,last]);commit(current.current.slice(0,-1));}}} aria-label="Undo drawing"><Icon name="undo" size={16}/></button>
      <button disabled={!redo.length} onClick={()=>{const last=redo.at(-1);if(last){setRedo(redo.slice(0,-1));commit([...current.current,last]);}}} aria-label="Redo drawing"><Icon name="refresh" size={16}/></button>
    </div>
    {status&&<button className="whiteboard-ink-status" onClick={()=>void flush()}>{status}</button>}
  </>;
}
