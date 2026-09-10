'use client';

import { useState } from 'react';
import { Icon } from '../Icon';
import { RowsSkeleton } from '../Skeleton';
import { useScratch, useScratchActions, type Scratch } from '@/lib/scratch';
import { toast } from '@/lib/toast';

/** Keeps the original scratchpad collection available in the notes workspace. */
export function QuickNotes({ onBack }: { onBack: () => void }) {
  const { data = [], isPending, isError, refetch } = useScratch();
  const actions = useScratchActions();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<Scratch | null>(null);
  const busy = actions.add.isPending || actions.save.isPending;

  async function save() {
    if (!text.trim() || busy) return;
    try {
      if (editing) {
        await actions.save.mutateAsync({ id: editing.id, patch: { text: text.trim(), title: editing.title, photo_url: editing.photo_url } });
      } else {
        await actions.add.mutateAsync({ id: crypto.randomUUID(), text: text.trim(), tag: 'Note', color: '#649cf1' });
      }
      setEditing(null);
      setText('');
    } catch { toast('Could not save. Your text is still here.'); }
  }

  return <section className="quick-notes">
    <button className="studio-text-button" onClick={onBack}><Icon name="back" size={16}/>Library</button>
    <h1>Quick thoughts</h1>
    <p>A place for the idea before it becomes a document.</p>
    <form onSubmit={e => { e.preventDefault(); void save(); }}>
      <textarea aria-label="Quick thought" placeholder="Catch a thought…" value={text} onChange={e => setText(e.target.value)} rows={4}/>
      <div className="quick-note-actions">
        {editing && <button type="button" className="studio-button" onClick={() => { setEditing(null); setText(''); }}>Cancel edit</button>}
        <button className="studio-button primary" disabled={!text.trim() || busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Keep thought'}<Icon name="plus" size={16}/></button>
      </div>
    </form>
    {isPending && <RowsSkeleton label="Loading quick thoughts" rows={3}/>}
    {isError && <div role="alert">Could not load your thoughts. <button className="studio-text-button" onClick={() => void refetch()}>Retry</button></div>}
    <div className="quick-notes-grid">{data.map(entry => <article key={entry.id}>
      {entry.photo_url && <img src={entry.photo_url} alt={entry.title || 'Saved memory'} loading="lazy"/>}
      <button className="quick-note-content" aria-label={`Edit ${entry.title || entry.text.slice(0, 60)}`} onClick={() => { setEditing(entry); setText(entry.text); }}>
        {entry.title && <strong>{entry.title}</strong>}<span>{entry.text}</span>
      </button>
      <div className="quick-note-actions"><span>{entry.tag}</span>
        <button className="studio-icon-button" aria-label={entry.pinned ? 'Unpin thought' : 'Pin thought'} aria-pressed={entry.pinned} onClick={() => actions.save.mutate({ id: entry.id, patch: { pinned: !entry.pinned } })}><Icon name="pin" size={16}/></button>
        <button className="studio-icon-button" aria-label="Delete thought" onClick={() => actions.removeWithUndo(entry)}><Icon name="trash" size={16}/></button>
      </div>
    </article>)}</div>
    {!isPending && !isError && !data.length && <div className="today-empty">Your saved thoughts will appear here.</div>}
  </section>;
}
