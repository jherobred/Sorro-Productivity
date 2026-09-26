'use client';
import { useEffect, useState } from 'react';
import { useNoteActions, useNotes, pendingPageText } from '@/lib/notes';
import { usePageState } from '@/lib/noteRecovery';

export function PageSaveStatus({ id, waiting = false }: { id: string; waiting?: boolean }) {
  const { state, storageError } = usePageState(id);
  const [online, setOnline] = useState(true);
  const { data: notes = [] } = useNotes();
  const A = useNoteActions();
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const text = storageError ? 'Device copy unavailable · keep this page open'
    : !online ? 'Offline · kept on this device'
      : state === 'error' ? 'Not synced · device copy kept' : waiting || state === 'saving' ? 'Saving…' : 'Saved';
  return <span className="page-save-status" role="status">{text}{state === 'error' && online && <button type="button" className="text-button" onClick={() => {
    const n = notes.find(n => n.id === id);
    if (n) A.saveNote.mutate({ id, notebook_id: n.notebook_id, title: n.title, body: n.body, ...pendingPageText(id) });
  }}>Retry save</button>}</span>;
}
