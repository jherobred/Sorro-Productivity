import type { PageAsset } from './pageKinds';
import { rebrandBody } from './storageKeys.ts';

/**
 * The journal page body.
 *
 * A journal is still the Markdown it always was: the `# Journal · ` line, then
 * prose. Polaroids are appended after a marker at the end, so a journal
 * written before they existed reads back with the same prose and an empty
 * photo list, and nothing needs migrating.
 *
 * If the marker is there but its JSON will not parse, the raw text stays in
 * the prose rather than being dropped. Losing somebody's writing to a bad
 * trailing byte is worse than showing them a line of JSON they can delete.
 */

export type Polaroid = { id: string; asset: PageAsset; caption: string; tilt: number };
export type JournalBody = { prefix: string; prose: string; photos: Polaroid[] };

const MARKER = '<!-- sorro-journal-photos:v1 -->';

const str = (v: unknown): v is string => typeof v === 'string';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const validAsset = (v: unknown): v is PageAsset => {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  return str(a.localId) && str(a.name) && (a.path === undefined || str(a.path));
};

function parsePhotos(json: string): Polaroid[] | null {
  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data)) return null;
    const out: Polaroid[] = [];
    for (const row of data) {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      if (!str(r.id) || !validAsset(r.asset) || !str(r.caption) || !finite(r.tilt)) return null;
      out.push({ id: r.id, asset: r.asset, caption: r.caption, tilt: r.tilt });
    }
    return out;
  } catch { return null; }
}

export function readJournal(body: string): JournalBody {
  body = rebrandBody(body);
  const split = body.indexOf('\n');
  const prefix = split < 0 ? body + '\n' : body.slice(0, split + 1);
  const rest = split < 0 ? '' : body.slice(split + 1);

  const at = rest.lastIndexOf(MARKER);
  if (at < 0) return { prefix, prose: rest, photos: [] };

  const photos = parsePhotos(rest.slice(at + MARKER.length));
  if (!photos) return { prefix, prose: rest, photos: [] };
  return { prefix, prose: rest.slice(0, at).replace(/\n$/, ''), photos };
}

export function writeJournal(journal: JournalBody): string {
  const tail = journal.photos.length ? '\n' + MARKER + JSON.stringify(journal.photos) : '';
  return journal.prefix + journal.prose + tail;
}

/**
 * A journal page that holds many days.
 *
 * Writing on another day used to make another page, so a week of journaling
 * was seven pages. Now every day lives in the page it was written in. The day
 * the page started with keeps the prose straight after the first line, exactly
 * where a single-day journal keeps it. Every other day follows under its own
 * comment line, which renders as nothing in Markdown:
 *
 *   # Journal · 2026-09-14
 *   the 14th
 *   <!-- sorro-journal-day:2026-09-15 -->
 *   the 15th
 *   <!-- sorro-journal-photos:v2 -->{"2026-09-15":[…]}
 *
 * A page that only has its first day is written in the old single-day format,
 * byte for byte, so existing journals are unchanged until a second day is
 * written in them.
 */
export type JournalEntry = { prose: string; photos: Polaroid[] };
export type JournalBook = { prefix: string; start: string; entries: Record<string, JournalEntry> };

const MARKER_V2 = '<!-- sorro-journal-photos:v2 -->';
const DAY_LINE = /\n?<!-- sorro-journal-day:(\d{4}-\d{2}-\d{2}) -->\n?/g;

function parsePhotoDays(json: string): Record<string, Polaroid[]> | null {
  try {
    const data: unknown = JSON.parse(json);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const out: Record<string, Polaroid[]> = {};
    for (const [day, list] of Object.entries(data as Record<string, unknown>)) {
      if (!parseDay(day)) return null;
      const photos = parsePhotos(JSON.stringify(list));
      if (!photos) return null;
      out[day] = photos;
    }
    return out;
  } catch { return null; }
}

/** True when a day has anything in it worth keeping. */
export const hasEntry = (entry: JournalEntry | undefined) => !!entry && (!!entry.prose.trim() || entry.photos.length > 0);

export function readJournalBook(note: { body: string; created_at: string }): JournalBook {
  const start = journalDay(note);
  const body = rebrandBody(note.body);
  const split = body.indexOf('\n');
  const prefix = split < 0 ? body + '\n' : body.slice(0, split + 1);
  let rest = split < 0 ? '' : body.slice(split + 1);
  const entries: Record<string, JournalEntry> = {};

  let photoDays: Record<string, Polaroid[]> = {};
  const v2 = rest.lastIndexOf(MARKER_V2);
  if (v2 >= 0) {
    const parsed = parsePhotoDays(rest.slice(v2 + MARKER_V2.length));
    // A damaged marker stays in the writing, the same rule as the old format.
    if (parsed) { photoDays = parsed; rest = rest.slice(0, v2).replace(/\n$/, ''); }
  } else {
    const old = readJournal(body);
    if (old.photos.length) { photoDays = { [start]: old.photos }; rest = old.prose; }
  }

  DAY_LINE.lastIndex = 0;
  let day = start, from = 0;
  for (let match = DAY_LINE.exec(rest); match; match = DAY_LINE.exec(rest)) {
    if (!parseDay(match[1])) continue;
    const prose = rest.slice(from, match.index);
    entries[day] = { prose: (entries[day]?.prose ? entries[day].prose + '\n\n' : '') + prose, photos: [] };
    day = match[1]; from = match.index + match[0].length;
  }
  const last = rest.slice(from);
  entries[day] = { prose: (entries[day]?.prose ? entries[day].prose + '\n\n' : '') + last, photos: [] };
  for (const [photoDay, photos] of Object.entries(photoDays)) {
    entries[photoDay] = { prose: entries[photoDay]?.prose ?? '', photos };
  }
  return { prefix, start, entries };
}

export function writeJournalBook(book: JournalBook): string {
  const first = book.entries[book.start] ?? { prose: '', photos: [] };
  const others = Object.keys(book.entries).filter((day) => day !== book.start && hasEntry(book.entries[day])).sort();
  if (!others.length) return writeJournal({ prefix: book.prefix, prose: first.prose, photos: first.photos });
  let text = book.prefix + first.prose;
  for (const day of others) text += `\n<!-- sorro-journal-day:${day} -->\n` + book.entries[day].prose;
  const photos: Record<string, Polaroid[]> = {};
  for (const day of [book.start, ...others]) if (book.entries[day]?.photos.length) photos[day] = book.entries[day].photos;
  return Object.keys(photos).length ? text + '\n' + MARKER_V2 + JSON.stringify(photos) : text;
}

/** Days with writing or photos, oldest first. */
export const bookDays = (book: JournalBook) => Object.keys(book.entries).filter((day) => hasEntry(book.entries[day])).sort();

/**
 * Put every day of another journal page into this one. Where both pages wrote
 * the same day, the writing is kept one after the other and the photos are
 * joined, so nothing from either page is lost.
 */
export function combineJournals(into: JournalBook, from: JournalBook): JournalBook {
  const entries = { ...into.entries };
  for (const day of bookDays(from)) {
    const mine = entries[day], theirs = from.entries[day];
    if (!hasEntry(mine)) { entries[day] = theirs; continue; }
    const prose = [mine.prose.trim() ? mine.prose.replace(/\s+$/, '') : '', theirs.prose.trim() ? theirs.prose.replace(/^\s+/, '') : ''].filter(Boolean).join('\n\n');
    entries[day] = { prose, photos: [...mine.photos, ...theirs.photos] };
  }
  return { ...into, entries };
}

/** Local calendar day, not UTC, so a late entry is not filed as tomorrow. */
export function localDay(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The Date for a `YYYY-MM-DD` day, at local midnight, or null when it is not a real day. */
export function parseDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return localDay(date) === day ? date : null;
}

/**
 * The day a journal page belongs to.
 *
 * A page written for a chosen day carries that day in its first line, because
 * the day it was created on is today. Pages from before that line existed have
 * a locale-formatted date there, which cannot be read back reliably, so they
 * keep using the day they were started.
 */
export function journalDay(note: { body: string; created_at: string }): string {
  const end = note.body.indexOf('\n');
  const first = end < 0 ? note.body : note.body.slice(0, end);
  const written = /^# Journal · (\d{4}-\d{2}-\d{2})\s*$/.exec(first)?.[1];
  return written && parseDay(written) ? written : localDay(note.created_at);
}

export type MonthCell = { day: string; date: number; inMonth: boolean };

/**
 * Six weeks of cells covering the month `date` sits in, so the grid never
 * changes height as you page through the year.
 */
export function monthGrid(date: Date, mondayFirst = true): MonthCell[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const shift = mondayFirst ? (first.getDay() + 6) % 7 : first.getDay();
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - shift);
  return Array.from({ length: 42 }, (_, i) => {
    const cell = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { day: localDay(cell), date: cell.getDate(), inMonth: cell.getMonth() === date.getMonth() };
  });
}
