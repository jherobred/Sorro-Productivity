'use client';
import {useState} from 'react';
import {Icon} from '@/components/Icon';
import {readStudy,writeStudy,type CodeDocument} from '@/lib/pageKinds';
import type {Note} from '@/lib/notes';
import {usePageDraft} from './usePageDraft';
export function CodePage({note,onSave}:{note:Note;onSave:(v:{title:string;body:string})=>void}){
 const {draft,change,waiting}=usePageDraft(note,onSave);const page=readStudy(draft.body) as CodeDocument;
 const [message,setMessage]=useState('');
 return <section className="study-page code-page"><div className="page-edit-header"><input className="page-title-input note-editor-clean-input" aria-label="Page title" value={draft.title} onChange={e=>change({title:e.target.value})}/><span className="page-save-status">{waiting?'Saving changes…':'Autosave on'}</span></div><div className="code-toolbar"><label>Language<select className="studio-input" value={page.language} onChange={e=>change({body:writeStudy({...page,language:e.target.value})})}>{['javascript','typescript','python','java','html','css','sql','c','cpp','rust','text'].map(lang=><option key={lang}>{lang}</option>)}</select></label><span>{page.code.split('\n').length} lines</span><button className="studio-button" onClick={async()=>{try{await navigator.clipboard.writeText(page.code);setMessage('Copied');}catch{setMessage('Select the code and copy it with your keyboard.');}}}><Icon name="copy" size={16}/>Copy code</button></div><textarea className="code-input" aria-label="Code snippet" spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="Start writing your snippet…" value={page.code} onChange={e=>change({body:writeStudy({...page,code:e.target.value})})} onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();const el=e.currentTarget;const start=el.selectionStart,end=el.selectionEnd;change({body:writeStudy({...page,code:page.code.slice(0,start)+'  '+page.code.slice(end)})});requestAnimationFrame(()=>{el.selectionStart=el.selectionEnd=start+2;});}}}/><p className="page-save-status" role="status">{message||'A place to keep code. Snippets are saved, and never executed.'}</p></section>;
}
