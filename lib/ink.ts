export type InkStroke = { id:string; color:string; width:number; points:[number,number][] };
export function strokePath(points:[number,number][]):string {
  if(!points.length)return '';
  if(points.length===1)return `M${points[0][0]} ${points[0][1]}l.01 .01`;
  return points.map(([x,y],i)=>`${i?'L':'M'}${Math.round(x*100)/100} ${Math.round(y*100)/100}`).join(' ');
}
export function readStrokes(value:unknown):InkStroke[] {
  if(!Array.isArray(value))return [];
  return value.filter((s):s is InkStroke=>!!s&&typeof s.id==='string'&&typeof s.color==='string'&&Number.isFinite(s.width)&&s.width>0&&Array.isArray(s.points)&&s.points.length>0&&s.points.every((p:unknown)=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)));
}
