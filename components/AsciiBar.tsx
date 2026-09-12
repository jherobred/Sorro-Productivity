'use client';
import {usePrefs} from '@/lib/prefs';
export type BarShape='standard'|'slim'|'edge'|'jar'|'vertical';
export function AsciiBar({value,hue,label,showValue=true,suffix='%',shape='standard',text,rightText,length}: {value:number;hue?:string;label?:string;showValue?:boolean;suffix?:string;shape?:BarShape;text?:string;rightText?:string;length?:number;cells?:number;size?:number}){
 const {prefs}=usePrefs();const pct=Math.max(0,Math.min(100,Number.isFinite(value)?value:0));const vertical=shape==='vertical';const words=text??(showValue?`${Math.round(pct)}${suffix}`:'');const hasWords=shape!=='edge'&&!!(words||rightText);
 return <span className={'studio-progress progress-'+shape} role="progressbar" aria-label={label||text||'Progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={text} style={vertical?{height:length??'100%'}:undefined}>{hasWords&&<span className="progress-words" aria-hidden><span>{words}</span>{rightText&&<span>{rightText}</span>}</span>}<span className="progress-track" aria-hidden><span className="progress-fill" style={{background:hue||'var(--acc)',transform:vertical?`scaleY(${pct/100})`:`scaleX(${pct/100})`,transition:prefs.motion?'transform .45s cubic-bezier(.2,.7,.2,1)':'none'}}/></span></span>;
}
export function AsciiBarBare(props:Omit<Parameters<typeof AsciiBar>[0],'showValue'>){return <AsciiBar {...props} showValue={false}/>;}
