/** Public links must work outside the Android WebView and preview deployments. */
export const PUBLIC_APP_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || 'https://basedly-web-jhemsini.vercel.app';
export function publicLink(path:string):string { return new URL(path, PUBLIC_APP_ORIGIN).href; }
export function gmailCompose(title:string,body:string):string { return `https://mail.google.com/mail/?${new URLSearchParams({view:'cm',fs:'1',su:title,body})}`; }
export function parseCommunityLink(value:string):{kind:'photo'|'discussion';id:string}|null {
  const match=value.replace(/^#/,'').match(/^(photo|discussion)[-:]([a-zA-Z0-9-]+)$/);
  return match?{kind:match[1] as 'photo'|'discussion',id:match[2]}:null;
}
export async function copyText(value:string):Promise<void> {
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return;}
  const active=document.activeElement as HTMLElement|null;
  const field=document.createElement('textarea');field.value=value;field.style.cssText='position:fixed;left:-9999px;top:0';document.body.appendChild(field);field.select();
  try{if(!document.execCommand('copy'))throw new Error('Copy is unavailable. Select and copy the link instead.');}finally{field.remove();active?.focus();}
}
export async function shareText(data:ShareData):Promise<'shared'|'copied'|'cancelled'> {
  if(navigator.share){try{await navigator.share(data);return 'shared';}catch(e){if((e as Error).name==='AbortError')return 'cancelled';}}
  await copyText([data.title,data.text,data.url].filter(Boolean).join('\n\n'));return 'copied';
}
