/**
 * Turning a read schedule into calendar rows.
 *
 * Pure on purpose: everything between "the model answered" and "these are the
 * events" is arithmetic over strings and dates, and arithmetic is the part
 * that has to be right. `node lib/schedule.check.ts` is the check.
 *
 * The model is asked for 24-hour `HH:MM` and enumerated day names, but a model
 * is not a parser — `normaliseTime` and `normaliseDay` accept the whole long
 * tail anyway ("9", "9:00 AM", "0900", "Tues", "TH") and return null for what
 * they cannot read, so a bad cell becomes a flagged row on the review screen
 * rather than an event at midnight.
 */

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];

export const DAY_LABEL: Record<Day, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

/**
 * What sort of block this is.
 *
 * The scan used to be told to ignore everything that was not a class, so a
 * screenshot of a real week came back with the five subjects and none of the
 * wake-ups, commutes, shifts or study blocks around them. It reads all of it
 * now, and this is how the review screen groups what came back — so somebody
 * who wanted only their classes unticks one chip rather than twenty rows.
 */
export const KINDS = ['class', 'lab', 'travel', 'personal', 'work', 'break', 'other'] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABEL: Record<Kind, string> = {
  class: 'Class', lab: 'Lab', travel: 'Travel', personal: 'Personal',
  work: 'Work', break: 'Break', other: 'Other',
};

/** One colour per kind, so a week reads at a glance the way it did in the app
 *  it was screenshotted from. Values are PAL (lib/pal.ts). */
export const KIND_COLOR: Record<Kind, string> = {
  class: '#7C8CFF',    // indigo
  lab: '#B07CFF',      // violet
  travel: '#38D6F2',   // cyan
  personal: '#34D9A0', // mint
  work: '#FFC24B',     // amber
  break: '#8A86A6',    // muted
  other: '#FF6FA8',    // pink
};

/** Anything the model did not put in the list is "other", never a crash. */
export function normaliseKind(v: unknown): Kind {
  const k = String(v ?? '').trim().toLowerCase();
  return (KINDS as readonly string[]).includes(k) ? (k as Kind) : 'other';
}

/** What the scan returns, before a human has looked at it. */
export type ScanEntry = {
  title: string;
  kind?: string;
  code?: string;
  section?: string;
  location?: string;
  teacher?: string;
  days: string[];
  start: string;
  end: string;
  raw?: string;
  confidence?: number;
};

/** A row on the review screen: cleaned up, and honest about what is wrong. */
export type Row = {
  id: string;
  title: string;
  kind: Kind;
  code: string;
  location: string;
  teacher: string;
  days: Day[];
  start: string;      // HH:MM, 24-hour
  end: string;        // HH:MM, 24-hour
  raw: string;
  confidence: number;
  include: boolean;
  color: string;
  /** Empty when the row is fit to write. */
  problems: string[];
};

const DAY_WORDS: Record<string, Day> = {
  m: 'mon', mo: 'mon', mon: 'mon', monday: 'mon',
  t: 'tue', tu: 'tue', tue: 'tue', tues: 'tue', tuesday: 'tue',
  w: 'wed', we: 'wed', wed: 'wed', weds: 'wed', wednesday: 'wed',
  h: 'thu', th: 'thu', thu: 'thu', thur: 'thu', thurs: 'thu', thursday: 'thu',
  f: 'fri', fr: 'fri', fri: 'fri', friday: 'fri',
  s: 'sat', sa: 'sat', sat: 'sat', saturday: 'sat',
  u: 'sun', su: 'sun', sun: 'sun', sunday: 'sun',
};

/** One day token to a day, or null. Case and punctuation do not matter. */
export function normaliseDay(v: string): Day | null {
  const k = v.trim().toLowerCase().replace(/[^a-z]/g, '');
  return DAY_WORDS[k] ?? null;
}

/**
 * "9", "9:00", "9:00 AM", "9.00pm", "0900", "13:00" → "HH:MM", or null.
 *
 * A bare hour under 7 is read as the afternoon: no university timetable means
 * 1:00 in the morning, and "1:00 - 2:30" with no meridiem is the single most
 * common thing on a printed schedule.
 *
 * `assumeAfternoon: false` turns that off and reads the digits literally. It
 * matters now that the scan reads whole weeks rather than only classes: a
 * "Travel Time 6 - 7" is a commute at six in the morning, and the timetable
 * rule turned it into one at six in the evening that ended eleven hours before
 * it began. `readRange` below decides which reading to trust.
 */
export function normaliseTime(v: string, assumeAfternoon = true): string | null {
  const s = v.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;

  const m = s.match(/^(\d{1,2})(?:[:.]?(\d{2}))?(am|pm|a|p)?$/);
  if (!m) return null;

  let h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  const mer = m[3]?.[0];

  // "0900" and "1430" arrive as a 3-or-4 digit run with no separator.
  if (m[2] === undefined && m[1].length > 2) return null;
  if (Number.isNaN(h) || Number.isNaN(min) || min > 59) return null;

  if (mer === 'p' && h < 12) h += 12;
  else if (mer === 'a' && h === 12) h = 0;
  else if (!mer && assumeAfternoon && h >= 1 && h < 7) h += 12;   // see the note above

  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Both ends of one block, read together.
 *
 * Reading each end on its own is what broke the non-academic rows: "6:00" and
 * "7:00" became 18:00 and 07:00, a range that ends before it starts, and the
 * review screen flagged a perfectly legible commute as unreadable. A pair is
 * one fact, so it is decided as one — take the afternoon reading when it makes
 * a coherent block, and the literal one when it does not.
 *
 * The kind is a second nudge. A class printed "1:00 - 2:30" is the afternoon
 * and always has been; a wake-up alarm or a bus is written with am/pm in every
 * calendar app there is, so for those the digits are taken at face value.
 */
export function readRange(
  rawStart: string, rawEnd: string, kind: Kind = 'class',
): { start: string | null; end: string | null } {
  const guessing = kind === 'class' || kind === 'lab' || kind === 'work';
  const pair = (assume: boolean) => ({
    start: normaliseTime(rawStart ?? '', assume),
    end: normaliseTime(rawEnd ?? '', assume),
  });
  const coherent = (p: { start: string | null; end: string | null }) =>
    !!p.start && !!p.end && minutesOf(p.end) > minutesOf(p.start);

  const first = pair(guessing);
  if (coherent(first)) return first;
  const second = pair(!guessing);
  if (coherent(second)) return second;
  // Neither reading works. Return the preferred one so toRow can say why.
  return first;
}

export const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * A scanned entry, cleaned and judged. Never throws; complains instead.
 *
 * The colour comes from the kind rather than a rotating palette. Seven
 * arbitrary hues told you nothing; "every commute is cyan" tells you where your
 * day goes.
 */
export function toRow(e: ScanEntry, i: number): Row {
  const kind = normaliseKind(e.kind);
  const days = (e.days ?? []).map(normaliseDay).filter((d): d is Day => !!d);
  const { start, end } = readRange(e.start ?? '', e.end ?? '', kind);
  const problems: string[] = [];

  const title = (e.title ?? '').trim();
  if (!title) problems.push('No title');
  if (days.length === 0) problems.push('No day');
  if (!start) problems.push('Start time unreadable');
  if (!end) problems.push('End time unreadable');
  if (start && end && minutesOf(end) <= minutesOf(start)) problems.push('Ends before it starts');

  return {
    id: `${i}-${title.slice(0, 12)}`,
    title: title || 'Untitled',
    kind,
    code: (e.code ?? '').trim(),
    location: (e.location ?? '').trim(),
    teacher: (e.teacher ?? '').trim(),
    days,
    start: start ?? '',
    end: end ?? '',
    raw: (e.raw ?? '').trim(),
    confidence: typeof e.confidence === 'number' ? Math.max(0, Math.min(1, e.confidence)) : 0.5,
    include: problems.length === 0,
    color: KIND_COLOR[kind],
    problems,
  };
}

/** Rows that read the same class twice — same title, days and time. */
export function dedupe(rows: Row[]): Row[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.title.toLowerCase()}|${r.days.join(',')}|${r.start}|${r.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type Occurrence = { starts_at: string; ends_at: string };

const DAY_INDEX: Record<Day, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/**
 * Every meeting of one row between two dates, inclusive.
 *
 * Local wall-clock in, UTC ISO out — the same convention `lib/events.ts` uses,
 * because a 09:00 class is 09:00 where the student is, whatever the server
 * thinks. Building the Date from parts (rather than parsing a string) is what
 * keeps a DST change from shifting the whole term by an hour.
 */
export function occurrences(row: Row, fromYmd: string, toYmd: string): Occurrence[] {
  if (!row.days.length || !row.start || !row.end) return [];
  const wanted = new Set(row.days.map((d) => DAY_INDEX[d]));
  const [sh, sm] = row.start.split(':').map(Number);
  const [eh, em] = row.end.split(':').map(Number);

  const [fy, fmo, fd] = fromYmd.split('-').map(Number);
  const [ty, tmo, td] = toYmd.split('-').map(Number);
  const cursor = new Date(fy, fmo - 1, fd);
  const last = new Date(ty, tmo - 1, td);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime()) || cursor > last) return [];

  const out: Occurrence[] = [];
  // A term is months, not years; the cap is a guard against a mistyped end date
  // writing thousands of rows, not a real limit anyone will meet.
  for (let guard = 0; cursor <= last && guard < 800; guard++) {
    if (wanted.has(cursor.getDay())) {
      const y = cursor.getFullYear(), mo = cursor.getMonth(), d = cursor.getDate();
      out.push({
        starts_at: new Date(y, mo, d, sh, sm, 0, 0).toISOString(),
        ends_at: new Date(y, mo, d, eh, em, 0, 0).toISOString(),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** How many rows the calendar would gain — shown before anything is written. */
export function totalOccurrences(rows: Row[], from: string, to: string): number {
  return rows.filter((r) => r.include).reduce((n, r) => n + occurrences(r, from, to).length, 0);
}

/** The title a calendar chip should carry: "ICS 2605 — Data Structures". */
export function eventTitle(row: Row): string {
  return row.code && !row.title.toLowerCase().includes(row.code.toLowerCase())
    ? `${row.code} — ${row.title}`
    : row.title;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A sensible term when the image did not state one: today until +16 weeks. */
export function defaultRange(today = new Date()): { from: string; to: string } {
  const end = new Date(today);
  end.setDate(end.getDate() + 16 * 7);
  return { from: ymd(today), to: ymd(end) };
}

/** A YYYY-MM-DD that is actually a date, or null. */
export function validYmd(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? v : null;
}
