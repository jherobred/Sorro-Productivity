'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { useNotebooks, useNoteActions } from '@/lib/notes';
import { useTaskActions } from '@/lib/tasks';
import { useScratch, useScratchActions, type Scratch } from '@/lib/scratch';

export function QuickCapture() {
  const [text, setText] = useState(''); const [kind, setKind] = useState<'Note'|'Task'|'Idea'>('Note');
  const [book, setBook] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [result, setResult] = useState<{ label: string; href: string } | null>(null);
  const { data: books = [] } = useNotebooks(); const { data: captures = [] } = useScratch();
  const A = useNoteActions(); const tasks = useTaskActions(); const scratch = useScratchActions();
  const destination = book || books[0]?.id || '';
  const intoNotebook = async (body: string, title?: string) => {
    let notebook_id = destination;
    if (!notebook_id) {
      notebook_id = crypto.randomUUID();
      await A.newNotebook.mutateAsync({ id: notebook_id, name: 'Quick notes', color: '#3165f5', position: books.length });
      setBook(notebook_id);
    }
    const id = crypto.randomUUID();
    await A.newNote.mutateAsync({ id, notebook_id, title: title || body.split('\n')[0].slice(0, 80), body });
    return { label: `Open in ${books.find(b => b.id === notebook_id)?.name || 'Quick notes'}`, href: '/notebooks/?open=' + id };
  };
  const keep = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError(''); setResult(null);
    try {
      if (kind === 'Task') { const id = crypto.randomUUID(); await tasks.create.mutateAsync({ id, title: text.trim() }); setResult({ label: 'Open in My Tasks', href: '/tasks/?detail=' + id }); }
      else if (kind === 'Idea') { await scratch.add.mutateAsync({ id: crypto.randomUUID(), text: text.trim(), tag: 'Idea', color: '#3165f5' }); setResult({ label: 'Saved below in Quick captures', href: '#quick-captures' }); }
      else setResult(await intoNotebook(text.trim()));
      setText('');
    } catch { setError('Could not sync this capture. Your text is still here. Check save status before retrying.'); }
    finally { setBusy(false); }
  };
  const copy = async (s: Scratch) => {
    setBusy(true); setError('');
    try { setResult(await intoNotebook([s.text, s.photo_url ? `\n![Captured photo](${s.photo_url})` : ''].join(''), s.title)); }
    catch { setError('The notebook copy could not sync. Your original capture is kept.'); }
    finally { setBusy(false); }
  };
  return <section className="quick-capture"><div className="section-heading"><h2>Catch a thought.</h2><Icon name="pen" size={21}/></div>
    <form onSubmit={e => { e.preventDefault(); void keep(); }}><label className="sronly" htmlFor="quick-thought">Your quick capture</label><textarea id="quick-thought" placeholder="An idea, a reminder, something worth keeping…" value={text} onChange={e => setText(e.target.value)} rows={3}/>
      <div className="capture-controls"><div role="group" aria-label="Capture type">{(['Note','Task','Idea'] as const).map(value => <button type="button" key={value} aria-pressed={kind===value} onClick={() => setKind(value)}>{value}</button>)}</div><button className="studio-button primary" disabled={!text.trim() || busy}>{busy ? 'Saving…' : kind === 'Task' ? 'Add task' : kind === 'Note' ? 'Save note' : 'Keep idea'}<Icon name="arrowR" size={16}/></button></div>
      <p className="capture-destination">{kind === 'Task' ? 'Saves to My Tasks · No due date' : kind === 'Idea' ? 'Saves to Quick captures below. Copy it to a notebook whenever you are ready.' : 'Saves as a document in the notebook below.'}</p>
    </form>
    {kind !== 'Task' && <label className="capture-notebook">{kind === 'Idea' ? 'Notebook for capture copies' : 'Notebook'}<select value={destination} onChange={e => setBook(e.target.value)}>{books.length ? books.map(b => <option key={b.id} value={b.id}>{b.name}</option>) : <option value="">Create Quick notes</option>}</select></label>}
    {result && <p className="capture-result" role="status"><Icon name="check" size={16}/><Link href={result.href}>{result.label}</Link></p>}{error && <p className="studio-error" role="alert">{error}</p>}
    {!!captures.length && <div id="quick-captures" className="capture-history"><h3>Quick captures</h3>{captures.slice(0,3).map(s => <details key={s.id}><summary>{s.title || s.text?.slice(0,80) || s.tag}<span>{s.tag}</span></summary><p>{s.text}</p>{s.photo_url && <img src={s.photo_url} alt={s.title || 'Captured photo'} loading="lazy"/>}<button className="text-button" disabled={busy} onClick={() => void copy(s)}>Copy to {books.find(b=>b.id===destination)?.name || 'Quick notes'}<Icon name="arrowR" size={15}/></button></details>)}{captures.length>3 && <details><summary>{captures.length-3} more captures</summary>{captures.slice(3).map(s=><article key={s.id}><strong>{s.title||s.tag}</strong><p>{s.text}</p><button className="text-button" disabled={busy} onClick={()=>void copy(s)}>Copy to notebook</button></article>)}</details>}</div>}
  </section>;
}
