'use client';
import { useId } from 'react';
import { motion } from 'motion/react';
import { Icon, type IconName } from './Icon';
import { usePrefs } from '@/lib/prefs';
export type TabDef<T extends string> = { id:T; label:string; icon?:IconName; count?:number };
export function TabRail<T extends string>({tabs,value,onChange,phone=false,label='Sections',grow}:{tabs:readonly TabDef<T>[];value:T;onChange:(id:T)=>void;phone?:boolean;label?:string;grow?:boolean}) {
  const { prefs }=usePrefs();const rid=useId();
  return <div className="studio-tabrail hbar" role="tablist" aria-label={label} style={grow?{flex:1}:undefined}>{tabs.map((t,i)=><button key={t.id} role="tab" aria-selected={t.id===value} tabIndex={t.id===value?0:-1} onClick={()=>onChange(t.id)} onKeyDown={e=>{const next=e.key==='ArrowRight'?(i+1)%tabs.length:e.key==='ArrowLeft'?(i-1+tabs.length)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:-1;if(next>=0){e.preventDefault();onChange(tabs[next].id);(e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();}}}>{t.id===value&&<motion.span className="studio-tab-highlight" aria-hidden layoutId={`studio-tab-${rid}`} transition={prefs.motion?{type:'spring',stiffness:500,damping:40}:{duration:0}}/>}<span>{t.icon&&!phone&&<Icon name={t.icon} size={15}/>}<span>{t.label}</span>{t.count!==undefined&&<small>{t.count}</small>}</span></button>)}</div>;
}
