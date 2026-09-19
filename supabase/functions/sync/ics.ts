/**
 * Reading a Google Calendar iCal feed into dated events.
 *
 * Enough of RFC 5545 for what Google publishes: folded lines, escaped text,
 * the three DTSTART shapes (UTC, a wall time in a named zone, a whole day),
 * DTEND or DURATION, and repeating events. A repeating event in the feed is one
 * VEVENT with an RRULE, so reading only its DTSTART imported a weekly class as
 * the single day it began. Here each rule is walked into its occurrences inside
 * the window, less its EXDATEs, with any occurrence that was moved or cancelled
 * on its own (a VEVENT with a RECURRENCE-ID) put in its place.
 *
 * Pure and dependency free, so the Edge Function and the app's tests share it.
 */

export type IcsEvent = { externalId: string; summary: string; start: string; end: string; location: string | null; allDay: boolean };

type Stamp = { utc: number; allDay: boolean; zone: string | null; wall: number };
type Raw = {
  uid?: string; summary?: string; location?: string; status?: string;
  start?: Stamp; end?: Stamp; duration?: number; rrule?: string;
  exdates: Stamp[]; recurrenceId?: Stamp;
};

const DAY = 86_400_000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const unescapeIcs = (s: string) =>
  s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');

/** The UTC instant of a wall-clock time in `zone`, DST included, found with Intl. */
export function zonedToUtc(wall: number, zone: string | null): number {
  if (!zone) return wall;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const offsetAt = (t: number) => {
      const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - t;
    };
    // Twice, so a time just across a DST change settles on the right offset.
    const first = wall - offsetAt(wall);
    return wall - offsetAt(first);
  } catch {
    return wall;
  }
}

/** A DTSTART-style value: its wall time (as if UTC), its zone, and the instant it names. */
export function parseStamp(value: string, params: string[]): Stamp | null {
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (date || params.includes('VALUE=DATE')) {
    const m = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(value);
    if (!m) return null;
    const wall = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return { utc: wall, allDay: true, zone: null, wall };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (m[7] === 'Z') return { utc: wall, allDay: false, zone: null, wall };
  const zone = params.find((p) => p.startsWith('TZID='))?.slice(5).replace(/^"|"$/g, '') ?? null;
  return { utc: zonedToUtc(wall, zone), allDay: false, zone, wall };
}

/** ISO 8601 durations as Google writes them: P1D, PT1H30M, P1W. */
function parseDuration(v: string): number | undefined {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v);
  if (!m) return undefined;
  const ms = ((+(m[2] ?? 0)) * 7 * DAY) + ((+(m[3] ?? 0)) * DAY) + ((+(m[4] ?? 0)) * 3_600_000) + ((+(m[5] ?? 0)) * 60_000) + ((+(m[6] ?? 0)) * 1000);
  return m[1] === '-' ? -ms : ms;
}

function readVevents(text: string): Raw[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out: Raw[] = [];
  let cur: Raw | null = null;
  let depth = 0;                                        // a VALARM inside a VEVENT has its own properties
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { exdates: [] }; depth = 0; continue; }
    if (line === 'END:VEVENT') { if (cur) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    if (line.startsWith('BEGIN:')) { depth++; continue; }
    if (line.startsWith('END:')) { depth = Math.max(0, depth - 1); continue; }
    if (depth) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const [name, ...params] = line.slice(0, colon).split(';');
    const value = line.slice(colon + 1);
    switch (name.toUpperCase()) {
      case 'UID': cur.uid = value; break;
      case 'SUMMARY': cur.summary = unescapeIcs(value); break;
      case 'LOCATION': cur.location = unescapeIcs(value); break;
      case 'STATUS': cur.status = value.toUpperCase(); break;
      case 'DTSTART': cur.start = parseStamp(value, params) ?? undefined; break;
      case 'DTEND': cur.end = parseStamp(value, params) ?? undefined; break;
      case 'DURATION': cur.duration = parseDuration(value); break;
      case 'RRULE': cur.rrule = value; break;
      case 'EXDATE': for (const v of value.split(',')) { const s = parseStamp(v, params); if (s) cur.exdates.push(s); } break;
      case 'RECURRENCE-ID': cur.recurrenceId = parseStamp(value, params) ?? undefined; break;
    }
  }
  return out;
}

type Rule = { freq: string; interval: number; count?: number; until?: number; byDay: { n: number; day: number }[]; byMonthDay: number[]; byMonth: number[] };

function parseRule(rrule: string): Rule | null {
  const parts = Object.fromEntries(rrule.split(';').map((p) => p.split('=') as [string, string]));
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(parts.FREQ)) return null;
  const until = parts.UNTIL ? parseStamp(parts.UNTIL, []) : null;
  return {
    freq: parts.FREQ,
    interval: Math.max(1, +(parts.INTERVAL ?? 1) || 1),
    count: parts.COUNT ? Math.max(0, +parts.COUNT) : undefined,
    // A date-only UNTIL means the whole of that day.
    until: until ? (until.allDay ? until.utc + DAY - 1 : until.utc) : undefined,
    byDay: (parts.BYDAY ?? '').split(',').filter(Boolean).map((d) => {
      const m = /^([+-]?\d+)?([A-Z]{2})$/.exec(d);
      return m ? { n: m[1] ? +m[1] : 0, day: WEEKDAYS.indexOf(m[2]) } : { n: 0, day: -1 };
    }).filter((d) => d.day >= 0),
    byMonthDay: (parts.BYMONTHDAY ?? '').split(',').filter(Boolean).map(Number).filter((n) => n && Number.isFinite(n)),
    byMonth: (parts.BYMONTH ?? '').split(',').filter(Boolean).map(Number).filter((n) => n >= 1 && n <= 12),
  };
}

/** The candidate wall times a rule names in one period (a day, a week, a month or a year), in order. */
function inPeriod(rule: Rule, start: number, periodStart: number): number[] {
  const time = start - Math.floor(start / DAY) * DAY;          // time of day on the start
  const d0 = new Date(periodStart);
  const y = d0.getUTCFullYear(), m = d0.getUTCMonth();
  const days: number[] = [];
  const monthDays = (yy: number, mm: number) => new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  const nthWeekday = (yy: number, mm: number, n: number, day: number) => {
    if (n > 0) { const first = new Date(Date.UTC(yy, mm, 1)).getUTCDay(); const date = 1 + ((day - first + 7) % 7) + (n - 1) * 7; return date <= monthDays(yy, mm) ? Date.UTC(yy, mm, date) : null; }
    const lastDate = monthDays(yy, mm), last = new Date(Date.UTC(yy, mm, lastDate)).getUTCDay();
    const date = lastDate - ((last - day + 7) % 7) + (n + 1) * 7;
    return date >= 1 ? Date.UTC(yy, mm, date) : null;
  };
  const monthCandidates = (yy: number, mm: number) => {
    if (rule.byMonthDay.length) return rule.byMonthDay.map((md) => { const len = monthDays(yy, mm); const date = md > 0 ? md : len + md + 1; return date >= 1 && date <= len ? Date.UTC(yy, mm, date) : null; });
    if (rule.byDay.length) {
      return rule.byDay.flatMap(({ n, day }) => {
        if (n) return [nthWeekday(yy, mm, n, day)];
        const all: number[] = [];
        for (let date = 1; date <= monthDays(yy, mm); date++) if (new Date(Date.UTC(yy, mm, date)).getUTCDay() === day) all.push(Date.UTC(yy, mm, date));
        return all;
      });
    }
    const date = new Date(start).getUTCDate();
    return [date <= monthDays(yy, mm) ? Date.UTC(yy, mm, date) : null];   // a 31st skips the short months, as RFC 5545 says
  };
  switch (rule.freq) {
    case 'DAILY': if (!rule.byDay.length || rule.byDay.some((b) => b.day === d0.getUTCDay())) days.push(Date.UTC(y, m, d0.getUTCDate())); break;
    case 'WEEKLY': {
      const weekDays = rule.byDay.length ? rule.byDay.map((b) => b.day) : [new Date(start).getUTCDay()];
      // Weeks start on Monday (Google's WKST), so Sunday is the last day of its week.
      for (const wd of weekDays) days.push(periodStart + ((wd + 6) % 7) * DAY);
      break;
    }
    case 'MONTHLY': for (const t of monthCandidates(y, m)) if (t !== null) days.push(t); break;
    case 'YEARLY': {
      const months = rule.byMonth.length ? rule.byMonth.map((mm) => mm - 1) : [new Date(start).getUTCMonth()];
      for (const mm of months) {
        if (rule.byMonthDay.length || rule.byDay.length) { for (const t of monthCandidates(y, mm)) if (t !== null) days.push(t); }
        else { const date = new Date(start).getUTCDate(); if (date <= monthDays(y, mm)) days.push(Date.UTC(y, mm, date)); }
      }
      break;
    }
  }
  return [...new Set(days)].sort((a, b) => a - b).map((t) => t + time);
}

/** The first period of the rule: the start's own day, Monday-started week, month or year. */
function firstPeriod(rule: Rule, start: number): number {
  const d = new Date(start);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (rule.freq === 'DAILY') return day;
  if (rule.freq === 'WEEKLY') return day - ((d.getUTCDay() + 6) % 7) * DAY;
  if (rule.freq === 'MONTHLY') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return Date.UTC(d.getUTCFullYear(), 0, 1);
}
function nextPeriod(rule: Rule, p: number): number {
  const d = new Date(p);
  if (rule.freq === 'DAILY') return p + rule.interval * DAY;
  if (rule.freq === 'WEEKLY') return p + rule.interval * 7 * DAY;
  if (rule.freq === 'MONTHLY') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + rule.interval, 1);
  return Date.UTC(d.getUTCFullYear() + rule.interval, 0, 1);
}

/**
 * Every occurrence of a repeating event that starts before `to`, as wall
 * times, the event's own first one included. Stops at COUNT, UNTIL or `to`.
 */
export function occurrences(rrule: string, start: Stamp, to: number, cap = 5000): number[] {
  const rule = parseRule(rrule);
  if (!rule) return [start.wall];
  const out: number[] = [];
  let seen = 0;
  for (let p = firstPeriod(rule, start.wall), guard = 0; guard < 20000; p = nextPeriod(rule, p), guard++) {
    for (const wall of inPeriod(rule, start.wall, p)) {
      if (wall < start.wall) continue;
      const utc = start.allDay ? wall : zonedToUtc(wall, start.zone);
      if (rule.until !== undefined && utc > rule.until) return out;
      if (rule.count !== undefined && seen >= rule.count) return out;
      if (utc >= to) return out;
      seen++;
      out.push(wall);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

const isoOf = (t: number) => new Date(t).toISOString();
const stampKey = (t: number) => isoOf(t).replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Every event in [from, to) in the feed, repeating ones walked into their occurrences. */
export function readCalendar(text: string, from: number, to: number): IcsEvent[] {
  const all = readVevents(text).filter((e) => e.uid && e.start);
  // Occurrences moved or cancelled on their own, by series and original instant.
  const overrides = new Map<string, Raw>();
  for (const e of all) if (e.recurrenceId) overrides.set(`${e.uid}|${e.recurrenceId.utc}`, e);

  const out: IcsEvent[] = [];
  const emit = (e: Raw, startUtc: number, externalId: string) => {
    if (e.status === 'CANCELLED') return;
    const lengthMs = e.end ? e.end.utc - e.start!.utc : e.duration ?? (e.start!.allDay ? DAY : 0);
    const endUtc = startUtc + Math.max(0, lengthMs);
    if (endUtc < from || startUtc >= to) return;
    out.push({ externalId, summary: e.summary ?? '', start: isoOf(startUtc), end: isoOf(endUtc || startUtc), location: e.location ?? null, allDay: e.start!.allDay });
  };

  for (const e of all) {
    if (e.recurrenceId) continue;                       // placed where its series says, below
    if (!e.rrule) { emit(e, e.start!.utc, e.uid!); continue; }
    const skip = new Set(e.exdates.map((x) => x.utc));
    for (const wall of occurrences(e.rrule, e.start!, to)) {
      const utc = e.start!.allDay ? wall : zonedToUtc(wall, e.start!.zone);
      if (skip.has(utc)) continue;
      const id = `${e.uid}@${stampKey(utc)}`;
      const moved = overrides.get(`${e.uid}|${utc}`);
      if (moved) emit(moved, moved.start!.utc, id);
      else emit(e, utc, id);
    }
  }
  // A moved occurrence whose series is not in the feed still happens.
  const series = new Set(all.filter((e) => e.rrule && !e.recurrenceId).map((e) => e.uid));
  for (const e of all) if (e.recurrenceId && !series.has(e.uid)) emit(e, e.start!.utc, `${e.uid}@${stampKey(e.recurrenceId.utc)}`);
  return out;
}
