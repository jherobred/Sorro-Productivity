'use client';

/** A picked photo as a WebP no wider than `max`, the form every board photo is kept in. */
export async function webpOf(file:File,max:number):Promise<File>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>25*1024*1024)throw new Error('Choose a JPG, PNG or WebP image smaller than 25 MB.');
 const bitmap=await createImageBitmap(file),ratio=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);
 const ctx=canvas.getContext('2d');if(!ctx){bitmap.close();throw new Error('Could not prepare the photo.');}ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not prepare the photo.')),'image/webp',.86));
 return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp'});
}
