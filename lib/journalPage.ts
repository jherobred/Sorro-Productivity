import type { PageAsset } from './pageKinds';

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

const MARKER = '<!-- basedly-journal-photos:v1 -->';

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
