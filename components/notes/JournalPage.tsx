'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import type { Note } from '@/lib/notes';
import { savePageAsset, usePageAssetUrl } from '@/lib/pageAssets';
import { readJournal, writeJournal, monthGrid, localDay, journalDay, parseDay, type Polaroid } from '@/lib/journalPage';
import { usePageDraft } from './usePageDraft';
import { JournalWindow } from './JournalWindow';

const PhotoCapture = dynamic(() => import('./PhotoCapture').then((m) => m.PhotoCapture), { ssr: false });

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const tiltFor = () => Math.round((Math.random() * 5 - 2.5) * 10) / 10;
const longDay = (day: string) =>
  parseDay(day)?.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) ?? day;
const shortDay = (day: string) =>
  parseDay(day)?.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) ?? day;

function PolaroidImage({ photo }: { photo: Polaroid }) {
  const { url, error } = usePageAssetUrl(photo.asset);
  if (url) return <img src={url} alt={photo.caption || photo.asset.name} draggable={false} />;
  return <span className="polaroid-loading">{error || 'Loading…'}</span>;
}

/**
 * Where the ruled lines go.
 *
 * The rules used to be a fixed 32px stripe with the line at the bottom of each
 * row, so the writing floated in the middle of the gap above it, and because
 * the stripe did not scroll with the text, every line drifted once an entry was
 * longer than the box. The line now sits just under the measured baseline of
 * the actual font, and the background scrolls with the text.
 */
function useRuleOffset(area: React.RefObject<HTMLTextAreaElement | null>, shown: boolean) {
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      const row = parseFloat(style.lineHeight);
      if (!Number.isFinite(row)) return;
      const probe = document.createElement('div');
      probe.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;font-family:${style.fontFamily};font-size:${style.fontSize};font-weight:${style.fontWeight};line-height:${style.lineHeight}`;
      probe.innerHTML = 'Hg<span style="display:inline-block;width:1px;height:0;vertical-align:baseline"></span>';
      document.body.append(probe);
      const baseline = (probe.lastElementChild as HTMLElement).getBoundingClientRect().top - probe.getBoundingClientRect().top;
      probe.remove();
      el.style.setProperty('--rule-row', `${row}px`);
      el.style.setProperty('--rule-at', `${Math.min(row - 1, Math.round(baseline + 5))}px`);
    };
    measure();
    void document.fonts?.ready.then(measure);
    addEventListener('resize', measure);
    return () => removeEventListener('resize', measure);
  }, [area, shown]);
}

/**
 * A journal page: the day/night window and a month beside the writing, with
 * polaroids under it.
 *
 * The calendar is real navigation. Days with a journal page in this notebook
 * open it. Any other day opens as an empty page for that date, with a way to
 * start writing it, so the past and the days ahead can be looked at too.
 */
export function JournalPage({
  note, notes = [], onSave, onOpen, onCreate,
}: {
  note: Note;
  notes?: Note[];
  onSave: (v: { title: string; body: string }) => void;
  onOpen?: (id: string) => void;
  onCreate?: (day: string) => void;
}) {
  const { draft, change, waiting } = usePageDraft(note, onSave);
  const journal = useMemo(() => readJournal(draft.body), [draft.body]);
  // Photos are added after an upload finishes. Writing from the render that
  // started the upload would put back whatever was typed while it ran.
  const latest = useRef(journal);
  latest.current = journal;
  const picker = useRef<HTMLInputElement>(null);
  const ruled = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const mine = journalDay(note);
  const [picked, setPicked] = useState<string | null>(null);
  const [month, setMonth] = useState(() => parseDay(mine) ?? new Date(note.created_at));
  useRuleOffset(ruled, !picked);
  const page = useRef<HTMLElement>(null);
  useOverlayBack(!!picked, () => setPicked(null));

  /** Every journal page in this notebook, by the day it belongs to. */
  const journalDays = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of notes) {
      if (n.notebook_id !== note.notebook_id || !n.body.startsWith('# Journal · ')) continue;
      map.set(journalDay(n), n.id);
    }
    return map;
  }, [notes, note.notebook_id]);

  const today = localDay(new Date());
  const cells = useMemo(() => monthGrid(month), [month]);

  const writeBody = (next: { prose?: string; photos?: Polaroid[] }) =>
    change({ body: writeJournal({ ...latest.current, ...next }) });

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
        added.push({ id: crypto.randomUUID(), asset, caption: '', tilt: tiltFor() });
      }
      writeBody({ photos: [...latest.current.photos, ...added] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that photo.');
    } finally {
      setBusy('');
      if (picker.current) picker.current.value = '';
    }
  };

  const keepCaptured = async (file: File, caption: string) => {
    const asset = await savePageAsset(file);
    writeBody({ photos: [...latest.current.photos, { id: crypto.randomUUID(), asset, caption, tilt: tiltFor() }] });
  };

  const setCaption = (id: string, caption: string) =>
    writeBody({ photos: latest.current.photos.map((p) => (p.id === id ? { ...p, caption } : p)) });

  const pick = (day: string) => {
    const entry = journalDays.get(day);
    if (entry && entry !== note.id) { onOpen?.(entry); return; }
    setPicked(day === mine || entry === note.id ? null : day);
  };

  return (
    <section ref={page} className="study-page journal-page">
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
                if (cell.day === mine && !picked) classes.push('is-current');
                if (cell.day === picked) classes.push('is-picked');
                if (cell.day === today) classes.push('is-today');
                if (entry) classes.push('has-entry');
                const label = longDay(cell.day) + (entry ? ', has an entry' : ', no entry yet');
                return (
                  <button key={cell.day} className={classes.join(' ')} aria-label={label}
                    aria-current={cell.day === (picked ?? mine) ? 'date' : undefined}
                    title={entry ? 'Open this day' : 'View this day'}
                    onClick={() => pick(cell.day)}>
                    {cell.date}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {picked ? (
          <div className="journal-main journal-empty-day" aria-live="polite">
            <div className="journal-page-heading">
              <h2 className="page-title-input journal-empty-title">{longDay(picked)}</h2>
              <span className="page-save-status">{picked > today ? 'A day ahead' : 'Nothing written this day'}</span>
            </div>
            <div className="journal-empty-paper">
              <div className="journal-empty-note">
                <Icon name="book" size={26} />
                <p>{picked > today ? 'This day has not happened yet. Plan it, or leave it blank for now.' : 'There is no entry for this day yet.'}</p>
                <div className="journal-empty-actions">
                  <button className="studio-button primary" onClick={() => onCreate?.(picked)}>
                    <Icon name="pen" size={16} />{picked > today ? 'Plan this day' : 'Write about this day'}
                  </button>
                  <button className="studio-button" onClick={() => { setPicked(null); setMonth(parseDay(mine) ?? new Date()); }}>
                    Back to {shortDay(mine)}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="journal-main">
            <div className="journal-page-heading">
              <input aria-label="Page title" className="page-title-input note-editor-clean-input"
                value={draft.title} onChange={(e) => change({ title: e.target.value })} />
              <span className="page-save-status">{waiting ? 'Saving changes…' : 'A page for your day · Autosave on'}</span>
            </div>

            <textarea ref={ruled} className="journal-ruled note-editor-clean-input" aria-label="Journal entry"
              placeholder="What would you like to remember?" value={journal.prose}
              onChange={(e) => writeBody({ prose: e.target.value })} />

            <div className="polaroid-shelf">
              <div className="polaroid-shelf-head">
                <span>Photos</span>
                <button className="studio-button" disabled={!!busy} onClick={() => setCamera(true)}>
                  <Icon name="camera" size={15} />Take a photo
                </button>
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
                    <button type="button" className="polaroid-window" data-photo={photo.id}
                      aria-label={'Look closer at ' + (photo.caption || 'this photo')} onClick={() => setFocused(photo.id)}>
                      <PolaroidImage photo={photo} />
                    </button>
                    <figcaption>
                      <input aria-label="Photo description" placeholder="Say what this was…"
                        value={photo.caption} onChange={(e) => setCaption(photo.id, e.target.value)} />
                    </figcaption>
                    <button className="polaroid-remove" aria-label="Remove this photo"
                      onClick={() => writeBody({ photos: latest.current.photos.filter((p) => p.id !== photo.id) })}>
                      <Icon name="close" size={13} />
                    </button>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {focused && page.current?.parentElement && createPortal(
        <PhotoFocus photos={journal.photos} id={focused} onMove={setFocused} onCaption={setCaption} onClose={() => setFocused(null)} />,
        page.current.parentElement,
      )}

      {camera && (
        <PhotoCapture
          heading="Keep a moment from today."
          invitation={{ title: <>Something worth<br />remembering.</>, text: 'Take a photo and it goes on this page as a polaroid. Write what it was underneath.' }}
          confirmLabel="Pin it to this page"
          withCaption
          onClose={() => setCamera(false)}
          onKeep={keepCaptured}
        />
      )}
    </section>
  );
}

/**
 * One polaroid, big, on top of the journal page it belongs to. Arrow keys and
 * the side buttons move through the others on the page, and the caption can be
 * edited here as well as on the shelf.
 */
function PhotoFocus({ photos, id, onMove, onCaption, onClose }: {
  photos: Polaroid[];
  id: string;
  onMove: (id: string) => void;
  onCaption: (id: string, caption: string) => void;
  onClose: () => void;
}) {
  const index = photos.findIndex((p) => p.id === id);
  const photo = photos[index];
  const close = useRef<HTMLButtonElement>(null);
  useOverlayBack(!!photo, onClose);

  useEffect(() => {
    close.current?.focus({ preventScroll: true });
    return () => { document.querySelector<HTMLElement>(`[data-photo="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); };
  }, [id]);

  useEffect(() => { if (!photo) onClose(); }, [photo, onClose]);
  if (!photo) return null;

  const step = (delta: number) => onMove(photos[(index + delta + photos.length) % photos.length].id);

  return (
    <div className="journal-focus" role="dialog" aria-modal="true" aria-label={photo.caption || 'Photo'}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT' || photos.length < 2) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      }}>
      <button type="button" className="journal-focus-backdrop" aria-label="Close photo" tabIndex={-1} onClick={onClose} />
      <figure className="journal-focus-polaroid" style={{ '--tilt': `${photo.tilt / 3}deg` } as React.CSSProperties}>
        <div className="journal-focus-window"><PolaroidImage photo={photo} /></div>
        <figcaption>
          <input aria-label="Photo description" placeholder="Say what this was…" value={photo.caption}
            onChange={(e) => onCaption(photo.id, e.target.value)} />
        </figcaption>
      </figure>
      {photos.length > 1 && <>
        <button type="button" className="journal-focus-step is-previous" aria-label="Previous photo" onClick={() => step(-1)}><Icon name="chevronLeft" size={22} /></button>
        <button type="button" className="journal-focus-step is-next" aria-label="Next photo" onClick={() => step(1)}><Icon name="chevronRight" size={22} /></button>
        <span className="journal-focus-count" aria-live="polite">{index + 1} of {photos.length}</span>
      </>}
      <button ref={close} type="button" className="journal-focus-close" aria-label="Close photo" onClick={onClose}><Icon name="close" size={18} /></button>
    </div>
  );
}
