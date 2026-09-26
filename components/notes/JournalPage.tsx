'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import type { Note } from '@/lib/notes';
import { savePageAsset, usePageAssetUrl } from '@/lib/pageAssets';
import {
  readJournalBook, writeJournalBook, bookDays, combineJournals, hasEntry, monthGrid, localDay, parseDay,
  type JournalEntry, type Polaroid,
} from '@/lib/journalPage';
import { usePageDraft } from './usePageDraft';
import {PageSaveStatus} from './PageSaveStatus';
import { JournalWindow } from './JournalWindow';

const PhotoCapture = dynamic(() => import('./PhotoCapture').then((m) => m.PhotoCapture), { ssr: false });

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const EMPTY: JournalEntry = { prose: '', photos: [] };
const tiltFor = () => Math.round((Math.random() * 5 - 2.5) * 10) / 10;
const longDay = (day: string) =>
  parseDay(day)?.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) ?? day;

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
function useRuleOffset(area: React.RefObject<HTMLTextAreaElement | null>) {
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
  }, [area]);
}

/**
 * A journal page: the day/night window and a month beside the writing, with
 * polaroids under it.
 *
 * One page holds every day written in it. Picking a day on the calendar turns
 * to that day in this page, and typing there keeps it here. Only adding another
 * journal page starts a separate journal. Days written on an older journal
 * page in the same notebook are marked, and can be opened or combined into
 * this one.
 */
export function JournalPage({
  note, notes = [], onSave, onOpen, onBin,
}: {
  note: Note;
  notes?: Note[];
  onSave: (v: { title: string; body: string }) => void;
  onOpen?: (id: string) => void;
  /** Moves another page to the bin once its days have been combined into this one. */
  onBin?: (note: Note) => void;
}) {
  const { phone } = useLayout();
  const { prefs } = usePrefs();
  const { draft, change, waiting } = usePageDraft(note, onSave);
  const book = useMemo(() => readJournalBook({ body: draft.body, created_at: note.created_at }), [draft.body, note.created_at]);
  // Photos are added after an upload finishes. Writing from the render that
  // started the upload would put back whatever was typed while it ran.
  const latest = useRef(book);
  latest.current = book;
  const today = localDay(new Date());
  const [day, setDay] = useState(() => {
    if (hasEntry(book.entries[today])) return today;
    const written = bookDays(book).filter((d) => d <= today);
    return written.at(-1) ?? book.start;
  });
  const [month, setMonth] = useState(() => parseDay(day) ?? new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const ruled = useRef<HTMLTextAreaElement>(null);
  const page = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  useRuleOffset(ruled);

  const entry = book.entries[day] ?? EMPTY;
  const written = useMemo(() => new Set(bookDays(book)), [book]);

  /** Days written on the other journal pages in this notebook, and where. */
  const elsewhere = useMemo(() => {
    const map = new Map<string, Note>();
    for (const n of notes) {
      if (n.id === note.id || n.notebook_id !== note.notebook_id || !n.body.startsWith('# Journal · ')) continue;
      for (const d of bookDays(readJournalBook(n))) if (!map.has(d)) map.set(d, n);
    }
    return map;
  }, [notes, note.id, note.notebook_id]);
  const otherPage = elsewhere.get(day);

  const cells = useMemo(() => monthGrid(month), [month]);

  const writeDay = (patch: Partial<JournalEntry>, target: string) => {
    const current = latest.current;
    const next = { ...(current.entries[target] ?? EMPTY), ...patch };
    change({ body: writeJournalBook({ ...current, entries: { ...current.entries, [target]: next } }) });
  };

  const go = (target: string) => {
    setDay(target);
    const date = parseDay(target);
    if (date && (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear())) setMonth(date);
    setFocused(null); setError('');
    if (phone) setCalendarOpen(false);
  };

  const addPhotos = async (files: FileList | null, target: string) => {
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
      writeDay({ photos: [...(latest.current.entries[target] ?? EMPTY).photos, ...added] }, target);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that photo.');
    } finally {
      setBusy('');
      if (picker.current) picker.current.value = '';
    }
  };

  const keepCaptured = async (file: File, caption: string, target: string) => {
    const asset = await savePageAsset(file);
    writeDay({ photos: [...(latest.current.entries[target] ?? EMPTY).photos, { id: crypto.randomUUID(), asset, caption, tilt: tiltFor() }] }, target);
  };

  const setCaption = (id: string, caption: string) =>
    writeDay({ photos: (latest.current.entries[day] ?? EMPTY).photos.map((p) => (p.id === id ? { ...p, caption } : p)) }, day);

  const combine = (other: Note) => {
    change({ body: writeJournalBook(combineJournals(latest.current, readJournalBook(other))) });
    onBin?.(other);
  };

  const calendar = (
    <div className="journal-calendar" id="journal-month">
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
          const mine = written.has(cell.day);
          const other = !mine && elsewhere.has(cell.day);
          const classes = ['journal-day'];
          if (!cell.inMonth) classes.push('is-outside');
          if (cell.day === day) classes.push('is-current');
          if (cell.day === today) classes.push('is-today');
          if (mine) classes.push('has-entry');
          if (other) classes.push('has-other');
          const label = longDay(cell.day) + (mine ? ', written' : other ? ', written on another page' : ', nothing written');
          return (
            <button key={cell.day} className={classes.join(' ')} aria-label={label}
              aria-current={cell.day === day ? 'date' : undefined} onClick={() => go(cell.day)}>
              {cell.date}
            </button>
          );
        })}
      </div>
    </div>
  );

  const picked = parseDay(day);
  const future = day > today;

  return (
    <section ref={page} className={'study-page journal-page' + (phone ? ' is-phone' : '')}>
      <div className="journal-layout">
        {phone ? (
          <div className="journal-phone-top">
            <div className="journal-phone-row">
              <JournalWindow compact />
              <button type="button" className="journal-date-toggle" aria-expanded={calendarOpen} aria-controls="journal-month"
                aria-label={(calendarOpen ? 'Hide the calendar. ' : 'Choose a day. ') + longDay(day)}
                onClick={() => setCalendarOpen((open) => !open)}>
                <span className="journal-date-number">{picked?.getDate()}</span>
                <span className="journal-date-words">
                  <strong>{picked?.toLocaleDateString(undefined, { weekday: 'long' })}</strong>
                  <small>{picked?.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</small>
                </span>
                <Icon name="chevronDown" size={18} style={{ transform: calendarOpen ? 'rotate(180deg)' : undefined, transition: prefs.motion ? 'transform .25s ease' : undefined }} />
              </button>
            </div>
            <AnimatePresence initial={false}>
              {calendarOpen && (
                <motion.div key="month" className="journal-dropdown"
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: prefs.motion ? 0.28 : 0, ease: [0.2, 0.8, 0.2, 1] }}>
                  {calendar}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <aside className="journal-side">
            <JournalWindow />
            {calendar}
          </aside>
        )}

        <div className="journal-main">
          <div className="journal-page-heading">
            <input aria-label="Page title" className="page-title-input note-editor-clean-input"
              value={draft.title} onChange={(e) => change({ title: e.target.value })} />
            <PageSaveStatus id={note.id} waiting={waiting}/>
          </div>
          <div className="journal-day-bar" aria-live="polite">
            <h2>{longDay(day)}</h2>
            {future && <span className="journal-day-note">A day ahead</span>}
            {day !== today && (
              <button type="button" className="journal-today" onClick={() => go(today)}>
                <Icon name="pen" size={14} />Write today
              </button>
            )}
          </div>

          {otherPage && (
            <div className="journal-elsewhere">
              <p>This day is also written on another page, “{otherPage.title || 'Untitled'}”.</p>
              <div>
                <button type="button" className="studio-button" onClick={() => onOpen?.(otherPage.id)}>Open that page</button>
                <button type="button" className="studio-button" onClick={() => combine(otherPage)}
                  title="Moves every day from that page into this journal, then puts that page in the bin">
                  Combine into this journal
                </button>
              </div>
            </div>
          )}

          <textarea ref={ruled} className="journal-ruled note-editor-clean-input" aria-label={'Journal entry for ' + longDay(day)}
            placeholder={future ? 'Plan this day, or leave it for later.' : day === today ? 'What would you like to remember?' : 'What happened this day?'}
            value={entry.prose} onChange={(e) => writeDay({ prose: e.target.value }, day)} />

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
                onChange={(e) => void addPhotos(e.target.files, day)} />
            </div>
            {error && <p className="studio-error" role="status">{error}</p>}
            {entry.photos.length === 0 && !busy && (
              <p className="polaroid-empty">Pin a photo to this day. Write underneath it to say what it was.</p>
            )}
            <div className="polaroid-row">
              {entry.photos.map((photo) => (
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
                    onClick={() => writeDay({ photos: (latest.current.entries[day] ?? EMPTY).photos.filter((p) => p.id !== photo.id) }, day)}>
                    <Icon name="close" size={13} />
                  </button>
                </figure>
              ))}
            </div>
          </div>
        </div>
      </div>

      {focused && page.current?.parentElement && createPortal(
        <PhotoFocus photos={entry.photos} id={focused} onMove={setFocused} onCaption={setCaption} onClose={() => setFocused(null)} />,
        page.current.parentElement,
      )}

      {camera && (
        <PhotoCapture
          heading={day === today ? 'Keep a moment from today.' : 'Keep a moment from ' + longDay(day) + '.'}
          invitation={{ title: <>Something worth<br />remembering.</>, text: 'Take a photo and it goes on this day as a polaroid. Write what it was underneath.' }}
          confirmLabel="Pin it to this day"
          withCaption
          onClose={() => setCamera(false)}
          onKeep={(file, caption) => keepCaptured(file, caption, day)}
        />
      )}
    </section>
  );
}

/**
 * One polaroid, big, on top of the journal page it belongs to. Arrow keys and
 * the side buttons move through the others on the same day, and the caption can
 * be edited here as well as on the shelf.
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
