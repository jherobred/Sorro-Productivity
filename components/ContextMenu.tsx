'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Icon,type IconName} from './Icon';
import {useOverlayBack} from '@/lib/nav';
export type CtxItem={label:string;icon:IconName;run?:()=>void;items?:CtxItem[];shortcut?:string;danger?:boolean;disabled?:boolean;hint?:string;checked?:boolean;swatch?:string};
export type CtxGroup={label?:string;items:CtxItem[]};
export type CtxContent=CtxItem[]|CtxGroup[];
export function ContextMenu({x,y,label,items,onClose}:{x:number;y:number;kind:string;label:string;items:CtxContent;onClose:()=>void;accent?:string;dark?:boolean}){
 const ref=useRef<HTMLDivElement>(null),prior=useRef<HTMLElement|null>(null);const [pos,setPos]=useState({left:x,top:y});const [stack,setStack]=useState<{label:string;items:CtxItem[]}[]>([]);
 useOverlayBack(true,onClose);useOverlayBack(stack.length>0,()=>setStack(s=>s.slice(0,-1)));
 const groups:CtxGroup[]=stack.length?[stack[stack.length-1]]:items.length&&'items' in items[0]&&!('icon' in items[0])?items as CtxGroup[]:[{items:items as CtxItem[]}];
 useEffect(()=>{prior.current=document.activeElement as HTMLElement;const close=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))onClose();};document.addEventListener('pointerdown',close);return()=>{document.removeEventListener('pointerdown',close);if(prior.current?.isConnected)prior.current.focus();};},[onClose]);
 useLayoutEffect(()=>{const el=ref.current;if(!el)return;const r=el.getBoundingClientRect();setPos({left:Math.max(8,Math.min(x,innerWidth-r.width-8)),top:Math.max(8,Math.min(y,innerHeight-r.height-8))});el.querySelector<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')?.focus();},[x,y,stack.length]);
 const choose=(item:CtxItem)=>{if(item.disabled)return;if(item.items){setStack(s=>[...s,{label:item.label,items:item.items!}]);return;}onClose();item.run?.();};
 return createPortal(<div className="context-panel" ref={ref} role="menu" aria-label={stack.at(-1)?.label||label} style={pos} onContextMenu={e=>e.preventDefault()} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();stack.length?setStack(s=>s.slice(0,-1)):onClose();return;}
  if(e.key==='ArrowLeft'&&stack.length){e.preventDefault();setStack(s=>s.slice(0,-1));return;}
  const buttons=Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')||[]);const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  if(['ArrowDown','ArrowUp','Home','End','Tab'].includes(e.key)){e.preventDefault();const step=e.key==='ArrowUp'||e.shiftKey?-1:1;buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+step+buttons.length)%buttons.length]?.focus();}
  if(e.key==='ArrowRight'){const row=groups.flatMap(g=>g.items).filter(i=>!i.disabled)[index];if(row?.items){e.preventDefault();choose(row);}}
 }}><div className="context-title">{stack.length>0&&<button aria-label="Previous menu" onClick={()=>setStack(s=>s.slice(0,-1))}><Icon name="back" size={15}/></button>}<span>{stack.at(-1)?.label||label}</span><button aria-label="Close menu" onClick={onClose}><Icon name="close" size={14}/></button></div>{groups.map((group,g)=><div className="context-group" role="group" aria-label={group.label} key={g}>{group.label&&!stack.length&&<span className="context-group-title">{group.label}</span>}{group.items.map((item,i)=><button key={i} role={item.checked!==undefined?'menuitemcheckbox':'menuitem'} aria-checked={item.checked} aria-haspopup={item.items?'menu':undefined} disabled={item.disabled} title={item.hint} className={item.danger?'danger':''} onClick={()=>choose(item)}>{item.swatch?<span className="context-swatch" style={{background:item.swatch}}/>:<Icon name={item.checked?'check':item.icon} size={17}/>}<span className="context-item-label">{item.label}{item.disabled&&item.hint&&<small>{item.hint}</small>}</span>{item.items?<Icon name="chev" size={14}/>:item.shortcut?<kbd>{item.shortcut}</kbd>:null}</button>)}</div>)}</div>,document.body);
}
