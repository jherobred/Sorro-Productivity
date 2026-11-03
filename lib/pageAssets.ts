'use client';
import {useEffect,useState} from 'react';
import {supabase} from './supabase';
import {uploadTo} from './uploads';
import {PAGE_ASSET_MAX_BYTES,PAGE_ASSET_TYPES} from './uploadGuard';
import type {PageAsset} from './pageKinds';

function transact<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 return new Promise((resolve,reject)=>{const req=indexedDB.open('bd_page_assets',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('files');req.onerror=()=>reject(req.error);
  req.onsuccess=()=>{const db=req.result;const tx=db.transaction('files',mode);const task=run(tx.objectStore('files'));let result:T;
   task.onsuccess=()=>{result=task.result;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};};
 });
}
/** A PDF has to start like one. The type a picker reports is only a claim, and a blank one is common on Android. */
async function assertPdf(file:Blob&{name?:string}){
 if(file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name||''))return;
 const head=new Uint8Array(await file.slice(0,5).arrayBuffer());
 if(String.fromCharCode(...head)!=='%PDF-')throw new Error('That file is not a PDF.');
}
const upload=(file:File)=>uploadTo('sorro-files',file,{types:PAGE_ASSET_TYPES,maxBytes:PAGE_ASSET_MAX_BYTES});
export async function savePageAsset(file:File):Promise<PageAsset>{
 await assertPdf(file);
 const asset:PageAsset={localId:crypto.randomUUID(),name:file.name};
 await transact('readwrite',store=>store.put(file,asset.localId));
 try{asset.path=await upload(file);}catch{/* Local asset remains usable when offline; the UI reports its sync scope. */}
 return asset;
}
/** Keeps a copy of a file this device fetched from somewhere else, under the asset it belongs to. */
export async function cachePageAsset(asset:PageAsset,blob:Blob){await transact('readwrite',store=>store.put(blob,asset.localId));}
export async function loadPageAsset(asset:PageAsset):Promise<Blob>{
 const cached=await transact<Blob|undefined>('readonly',store=>store.get(asset.localId)).catch(()=>undefined);
 if(cached)return cached;
 if(!asset.path)throw new Error('This file was saved on another device. Open it there to upload it.');
 const {data,error}=await supabase.storage.from('sorro-files').download(asset.path);if(error||!data)throw error||new Error('The file could not be loaded.');
 void transact('readwrite',store=>store.put(data,asset.localId)).catch(()=>{});return data;
}
export async function syncPageAsset(asset:PageAsset):Promise<PageAsset>{
 if(asset.path)return asset;const blob=await loadPageAsset(asset);return {...asset,path:await upload(new File([blob],asset.name,{type:blob.type||(/\.pdf$/i.test(asset.name)?'application/pdf':'')}))};
}
export function usePageAssetUrl(asset?:PageAsset){
 const [url,setUrl]=useState<string|null>(null);const [error,setError]=useState('');
 useEffect(()=>{if(!asset){setUrl(null);return;}let live=true;let objectUrl:string|undefined;
  loadPageAsset(asset).then(blob=>{if(live){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);setError('');}}).catch(e=>{if(live)setError(e.message);});
  return()=>{live=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[asset?.localId,asset?.path]);return {url,error};
}
