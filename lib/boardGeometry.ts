import type {BoardItem} from './pageKinds';
export type Viewport = {x:number;y:number;scale:number};
export const clampScale=(scale:number)=>Math.min(4,Math.max(.15,scale));
export function canvasPoint(x:number,y:number,view:Viewport){return {x:(x-view.x)/view.scale,y:(y-view.y)/view.scale};}
export function zoomAt(view:Viewport,x:number,y:number,scale:number):Viewport {
  const point=canvasPoint(x,y,view);const next=clampScale(scale);
  return {x:x-point.x*next,y:y-point.y*next,scale:next};
}
export function fitItems(items:BoardItem[],width:number,height:number):Viewport {
  if(!items.length)return {x:40,y:40,scale:1};
  const left=Math.min(...items.map(i=>i.x));const top=Math.min(...items.map(i=>i.y));
  const right=Math.max(...items.map(i=>i.x+i.w));const bottom=Math.max(...items.map(i=>i.y+i.h));
  const scale=clampScale(Math.min((width-96)/Math.max(1,right-left),(height-96)/Math.max(1,bottom-top),1.5));
  return {scale,x:(width-(right-left)*scale)/2-left*scale,y:(height-(bottom-top)*scale)/2-top*scale};
}
export function strokeBounds(points:number[][],color:string,width:number,id:string):BoardItem {
  const x=Math.min(...points.map(p=>p[0]));const y=Math.min(...points.map(p=>p[1]));
  return {id,type:'stroke',x,y,w:Math.max(1,Math.max(...points.map(p=>p[0]))-x),h:Math.max(1,Math.max(...points.map(p=>p[1]))-y),color,width,points:points.map(p=>[p[0]-x,p[1]-y,p[2]??.5])};
}
/** A filled outline follows the pen's per-sample pressure without SVG segments. */
export function pressurePath(points:number[][],width:number):string {
  if(!points.length)return '';
  if(points.length===1){const [x,y,p=.5]=points[0],r=width*(.3+p)/2;return `M${x-r},${y}a${r},${r} 0 1,0 ${r*2},0a${r},${r} 0 1,0 ${-r*2},0`;}
  const left:string[]=[],right:string[]=[];
  points.forEach((p,i)=>{const before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)];const dx=after[0]-before[0],dy=after[1]-before[1],length=Math.hypot(dx,dy)||1,r=width*(.3+(p[2]??.5))/2;const nx=-dy/length*r,ny=dx/length*r;left.push(`${p[0]+nx},${p[1]+ny}`);right.push(`${p[0]-nx},${p[1]-ny}`);});
  return `M${left.join('L')}L${right.reverse().join('L')}Z`;
}
