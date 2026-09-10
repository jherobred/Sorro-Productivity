'use client';
import { useLayout } from '@/lib/useLayout';
export type PageWidth = 'list' | 'wide' | 'full';
const MAX: Record<PageWidth, number | undefined> = { list:900, wide:1240, full:undefined };
export function Page({name,meta,actions,width='wide',children,fill=false}:{name:string;meta?:React.ReactNode;actions?:React.ReactNode;width?:PageWidth;fill?:boolean;children:React.ReactNode}) {
  const { phone } = useLayout();
  return <div className="studio-page" style={fill?{height:'100%',display:'flex',flexDirection:'column',minHeight:0}:undefined}><div className="studio-page-inner" style={{maxWidth:MAX[width],...(fill?{flex:1,minHeight:0,display:'flex',flexDirection:'column'}:null)}}><header className="studio-page-header"><div><h1 className="studio-page-title">{name}</h1>{meta&&<div className="studio-page-meta">{meta}</div>}</div>{actions&&<div className="studio-page-actions" style={phone?{maxWidth:'100%'}:undefined}>{actions}</div>}</header>{children}</div></div>;
}
