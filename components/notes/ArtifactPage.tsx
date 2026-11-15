'use client';
/**
 * N.artifact: an HTML page kept in the notebook, a Claude artifact or any
 * .html file. Import a file or paste the source, then switch between the
 * Preview and the Source. The preview runs in a sandbox with no access to
 * Sorro: scripts may run, but the page cannot reach the app, its storage or
 * its cookies. The page is kept in the note's own body (lib/noteTypes.ts).
 */
import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import type { Note } from '@/lib/notes';
import { readArtifact, writeArtifact, type ArtifactDoc } from '@/lib/noteTypes';
import { usePageDraft } from './usePageDraft';
import { PageSaveStatus } from './PageSaveStatus';

/** Larger than this is not a page anyone pasted by hand, and it would make every save slow. */
const MAX_HTML = 2 * 1024 * 1024;

export function ArtifactPage({ note, onSave }: { note: Note; onSave: (v: { title: string; body: string }) => void }) {
  const { draft, change, waiting } = usePageDraft(note, onSave);
  const [doc, setDoc] = useState<ArtifactDoc>(() => readArtifact(note.body) ?? { version: 1, name: 'Untitled page', html: '' });
  const [view, setView] = useState<'preview' | 'source'>(() => doc.html ? 'preview' : 'source');
  const [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);

  const save = (next: ArtifactDoc, title?: string) => { setDoc(next); change({ body: writeArtifact(next), ...(title ? { title } : {}) }); };
  const importFile = async (f: File) => {
    setError('');
    if (f.size > MAX_HTML) { setError('Choose an HTML file smaller than 2 MB.'); return; }
    const name = f.name.replace(/\.html?$/i, '') || 'Imported page';
    // An untitled page takes the file's name; one already named keeps its own.
    save({ version: 1, name, html: await f.text(), from: 'file' }, /^Untitled/.test(draft.title) ? name : undefined);
    setView('preview');
  };
  const paste = (html: string) => {
    if (html.length > MAX_HTML) { setError('That is more than 2 MB of HTML. Import it as a file instead.'); return; }
    setError('');
    save({ ...doc, html, from: doc.from ?? 'pasted' });
  };
  const fromLabel = doc.from === 'file' ? 'Imported from a file' : doc.from === 'pasted' ? 'Pasted HTML' : doc.from || 'HTML page';

  return <section className="art" aria-label="Artifact">
    <div className="page-edit-header"><input className="page-title-input note-editor-clean-input" aria-label="Page title" value={draft.title} onChange={e => change({ title: e.target.value })} /><PageSaveStatus id={note.id} waiting={waiting} /></div>
    <div className="art-bar">
      <div className="markup-file"><Icon name="code" size={18} /><span>
        <input className="art-name" aria-label="File name" value={doc.name} onChange={e => save({ ...doc, name: e.target.value })} /><small>{doc.name ? doc.name + '.html · ' : ''}{fromLabel}</small>
      </span></div>
      <div className="art-seg" role="tablist" aria-label="View">
        <button role="tab" aria-selected={view === 'preview'} disabled={!doc.html} onClick={() => setView('preview')}><Icon name="eye" size={14} />Preview</button>
        <button role="tab" aria-selected={view === 'source'} onClick={() => setView('source')}><Icon name="code" size={14} />Source</button>
      </div>
      <button className="studio-button" onClick={() => picker.current?.click()}><Icon name="upload" size={15} />Import HTML</button>
      <input ref={picker} hidden type="file" accept=".html,.htm,text/html" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
    </div>
    {error && <p className="studio-error" role="alert">{error}</p>}
    {view === 'preview' && doc.html
      ? <div className="art-stage"><iframe className="art-frame" title={doc.name || 'Preview'} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={doc.html} /></div>
      : <div className="art-source">
        {!doc.html && <p className="art-hint">Paste the HTML from Claude or any page here, or import an .html file.</p>}
        <textarea aria-label="HTML source" spellCheck={false} placeholder={'<!doctype html>\n<html>…</html>'} value={doc.html}
          onChange={e => paste(e.target.value)}
          onDragOver={e => e.preventDefault()} onDrop={e => { const f = e.dataTransfer.files?.[0]; if (f && /\.html?$|text\/html/i.test(f.name + f.type)) { e.preventDefault(); void importFile(f); } }} />
      </div>}
  </section>;
}
