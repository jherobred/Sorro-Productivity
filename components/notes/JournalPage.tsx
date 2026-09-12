'use client';
import type {Note} from '@/lib/notes';
import {usePageDraft} from './usePageDraft';
import {JournalWindow} from './JournalWindow';
export function JournalPage({note,onSave}:{note:Note;onSave:(v:{title:string;body:string})=>void}){
 const {draft,change,waiting}=usePageDraft(note,onSave);
 // Keep the original marker and any existing prompts. Only the visible prose changes.
 const split=draft.body.indexOf('\n');const prefix=split<0?draft.body+'\n':draft.body.slice(0,split+1);const body=split<0?'':draft.body.slice(split+1);
 return <section className="study-page journal-page"><div className="journal-page-top"><JournalWindow/><div className="journal-page-heading"><input aria-label="Page title" className="page-title-input note-editor-clean-input" value={draft.title} onChange={e=>change({title:e.target.value})}/><span className="page-save-status">{waiting?'Saving changes…':'A page for your day · Autosave on'}</span></div></div><textarea className="journal-ruled note-editor-clean-input" aria-label="Journal entry" placeholder="What would you like to remember?" value={body} onChange={e=>change({body:prefix+e.target.value})}/></section>;
}
