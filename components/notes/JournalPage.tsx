'use client';
import { useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import type { Note } from '@/lib/notes';
import { savePageAsset, usePageAssetUrl } from '@/lib/pageAssets';
import { readJournal, writeJournal, monthGrid, localDay, type Polaroid } from '@/lib/journalPage';
import { usePageDraft } from './usePageDraft';
import { JournalWindow } from './JournalWindow';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function PolaroidImage({ photo }: { photo: Polaroid }) {
  const { url, error } = usePageAssetUrl(photo.asset);
  if (url) return <img src={url} alt={photo.caption || photo.asset.name} draggable={false} />;
  return <span className="polaroid-loading">{error || 'Loading…'}</span>;
}

/**
 * A journal page: the day/night window and a month beside the writing, with
 * polaroids under it.
 *
 * The calendar is real navigation, not decoration. It marks every day in this
 * notebook that already has a journal page and opens it when clicked, which is
 * what the left column was for in the original journal.
 */
export function JournalPage({
  note, notes = [], onSave, onOpen,
}: {
  note: Note;
  notes?: Note[];
  onSave: (v: { title: string; body: string }) => void;
  onOpen?: (id: string) => void;
}) {
  const { draft, change, waiting } = usePageDraft(note, onSave);
  const journal = useMemo(() => readJournal(draft.body), [draft.body]);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [month, setMonth] = useState(() => new Date(note.created_at));

  /** Every journal page in this notebook, by the day it was started. */
  const journalDays = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of notes) {
      if (n.notebook_id !== note.notebook_id || !n.body.startsWith('# Journal · ')) continue;
      map.set(localDay(n.created_at), n.id);
    }
    return map;
  }, [notes, note.notebook_id]);

  const today = localDay(new Date());
  const mine = localDay(note.created_at);
  const cells = useMemo(() => monthGrid(month), [month]);

  const writeBody = (next: { prose?: string; photos?: Polaroid[] }) =>
    change({ body: writeJournal({ ...journal, ...next }) });

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy('Adding photos…'); setError('');
    try {
      const added: Polaroid[] = [];
      for (const file of Array.from(files)) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 25 * 1024 * 1024) {
          throw new Error('Choose JPG, PNG or WebP images smaller than 25 MB.');
        }
        const asset = await savePageAsset(file);
        added.push({ id: crypto.randomUUID(), asset, caption: '', tilt: Math.round((Math.random() * 5 - 2.5) * 10) / 10 });
      }
      writeBody({ photos: [...journal.photos, ...added] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that photo.');
    } finally {
      setBusy('');
      if (picker.current) picker.current.value = '';
    }
  };

  const setCaption = (id: string, caption: string) =>
    writeBody({ photos: journal.photos.map((p) => (p.id === id ? { ...p, caption } : p)) });

  return (
    <section className="study-page journal-page">
      <div className="journal-layout">
        <aside className="journal-side">
          <JournalWindow />
          <div className="journal-calendar">
            <div className="journal-calendar-head">
              <button aria-label="Previous month"
                onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>‹</button>
              <strong>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
              <button aria-label="Next month"
                onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>›</button>
            </div>
            <div className="journal-calendar-grid" role="grid" aria-label="Journal days">
              {WEEKDAYS.map((d, i) => <span key={i} className="journal-weekday" aria-hidden>{d}</span>)}
              {cells.map((cell) => {
                const entry = journalDays.get(cell.day);
                const classes = ['journal-day'];
                if (!cell.inMonth) classes.push('is-outside');
                if (cell.day === mine) classes.push('is-current');
                if (cell.day === today) classes.push('is-today');
                if (entry) classes.push('has-entry');
                return (
                  <button key={cell.day} className={classes.join(' ')}
                    disabled={!entry || entry === note.id}
                    aria-current={cell.day === mine ? 'date' : undefined}
                    title={entry ? 'Open this day' : undefined}
                    onClick={() => entry && onOpen?.(entry)}>
                    {cell.date}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="journal-main">
          <div className="journal-page-heading">
            <input aria-label="Page title" className="page-title-input note-editor-clean-input"
              value={draft.title} onChange={(e) => change({ title: e.target.value })} />
            <span className="page-save-status">{waiting ? 'Saving changes…' : 'A page for your day · Autosave on'}</span>
          </div>

          <textarea className="journal-ruled note-editor-clean-input" aria-label="Journal entry"
            placeholder="What would you like to remember?" value={journal.prose}
            onChange={(e) => writeBody({ prose: e.target.value })} />

          <div className="polaroid-shelf">
            <div className="polaroid-shelf-head">
              <span>Photos</span>
              <button className="studio-button" disabled={!!busy} onClick={() => picker.current?.click()}>
                <Icon name="photo" size={15} />{busy || 'Add a photo'}
              </button>
              <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden
                onChange={(e) => void addPhotos(e.target.files)} />
            </div>
            {error && <p className="studio-error" role="status">{error}</p>}
            {journal.photos.length === 0 && !busy && (
              <p className="polaroid-empty">Pin a photo to this day. Write underneath it to say what it was.</p>
            )}
            <div className="polaroid-row">
              {journal.photos.map((photo) => (
                <figure key={photo.id} className="polaroid" style={{ '--tilt': `${photo.tilt}deg` } as React.CSSProperties}>
                  <div className="polaroid-window"><PolaroidImage photo={photo} /></div>
                  <figcaption>
                    <input aria-label="Photo description" placeholder="Say what this was…"
                      value={photo.caption} onChange={(e) => setCaption(photo.id, e.target.value)} />
                  </figcaption>
                  <button className="polaroid-remove" aria-label="Remove this photo"
                    onClick={() => writeBody({ photos: journal.photos.filter((p) => p.id !== photo.id) })}>
                    <Icon name="close" size={13} />
                  </button>
                </figure>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
