'use client';
import {useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {loadPageAsset} from '@/lib/pageAssets';
import type {PdfSource} from '@/lib/pageKinds';
export async function openPdf(data:ArrayBuffer):Promise<PDFDocumentProxy>{
 const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.min.mjs';
 return pdfjs.getDocument({data:new Uint8Array(data),useSystemFonts:true}).promise;
}
export async function describePdf(data:ArrayBuffer){
 const pdf=await openPdf(data);let y=0;const pages:PdfSource['pages']=[];
 try{for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n);const v=page.getViewport({scale:1});const w=760,h=v.height*(w/v.width);pages.push({w,h,y});y+=h+56;}return pages;}finally{await pdf.loadingTask.destroy();}
}
function PdfPage({pdf,index,w,h,y}:{pdf:PDFDocumentProxy;index:number;w:number;h:number;y:number}){
 const ref=useRef<HTMLCanvasElement>(null);const [visible,setVisible]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{if(!ref.current)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'500px'});observer.observe(ref.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(!visible)return;let live=true;let cancel:(()=>void)|undefined;
  void pdf.getPage(index+1).then(page=>{if(!live||!ref.current)return;const canvas=ref.current;const base=page.getViewport({scale:1});const viewport=page.getViewport({scale:Math.min(2,window.devicePixelRatio||1)*w/base.width});canvas.width=viewport.width;canvas.height=viewport.height;const task=page.render({canvas,viewport});cancel=()=>task.cancel();return task.promise;}).catch(e=>{if(live&&e.name!=='RenderingCancelledException')setError('This PDF page could not be rendered.');});
  return()=>{live=false;cancel?.();};
 },[visible,pdf,index,w]);
 return <div className="pdf-page-sheet" style={{left:360,top:y,width:w,height:h}}><canvas ref={ref} style={{width:w,height:h}} aria-label={'PDF page '+(index+1)}/>{error&&<p>{error}</p>}<span className="pdf-page-number">{index+1}</span></div>;
}
export function PdfBackground({source}:{source:PdfSource}){
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null);const [error,setError]=useState('');
 useEffect(()=>{let live=true;let doc:PDFDocumentProxy|undefined;setError('');
  void loadPageAsset(source.asset).then(blob=>blob.arrayBuffer()).then(openPdf).then(loaded=>{doc=loaded;if(live)setPdf(loaded);else void loaded.loadingTask.destroy();}).catch(e=>{if(live)setError(e.message);});
  return()=>{live=false;if(doc)void doc.loadingTask.destroy();};
 },[source.asset.localId,source.asset.path]);
 return <>{!pdf&&<div className="pdf-loading">{error||'Opening PDF…'}</div>}{pdf&&source.pages.map((p,i)=><PdfPage key={i} pdf={pdf} index={i} {...p}/>)}</>;
}
