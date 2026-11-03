/**
 * C.quick: "CS 150 every Mon 9-10:30 at Eng 214" into an event. Local time
 * throughout, days stepped with setDate (the dev machine has no DST, so
 * millisecond arithmetic would pass here and break elsewhere).
 */

export type ParsedEvent = { title: string; starts_at: string; ends_at: string; all_day: boolean; location?: string; repeat?: { days: number[] } };

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY_RE = '(sun|mon|tue|wed|thu|fri|sat)[a-z]*';

/** "9", "9:30", "3pm", "12" → minutes after midnight. A bare 1–6 means the afternoon. */
function minutes(h: string, m: string | undefined, ap: string | undefined, fallbackAp?: string): number {
  let hour = Number(h) % 24;
  const mer = (ap || fallbackAp || '').toLowerCase();
  if (mer === 'pm' && hour < 12) hour += 12;
  if (mer === 'am' && hour === 12) hour = 0;
  if (!mer && hour >= 1 && hour <= 6) hour += 12;
  return hour * 60 + (m ? Number(m) : 0);
}

export function parseEvent(input: string, now: Date): ParsedEvent | null {
  let text = ` ${input.trim()} `;
  if (!text.trim()) return null;
  const take = (re: RegExp) => { const m = re.exec(text); if (m) text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length); return m; };

  let location: string | undefined;
  const at = take(/\s(?:at|@)\s+(.+?)\s*$/i);
  if (at) location = at[1].trim();

  // A date's day number must not be read as a time, so dates come out first.
  const md = take(new RegExp(`\\s(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})(?=\\s)`, 'i'));
  const t = '(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?';
  let start: number | null = null, end: number | null = null;
  const range = take(new RegExp(`\\s${t}\\s*(?:-|–|to)\\s*${t}(?=\\s)`, 'i'));
  if (range) { end = minutes(range[4], range[5], range[6]); start = minutes(range[1], range[2], range[3], range[3] ? undefined : range[6]); }
  else { const one = take(new RegExp(`\\s${t}(?=\\s)`, 'i')); if (one && (one[2] || one[3] || Number(one[1]) <= 24)) start = minutes(one[1], one[2], one[3]); }

  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let repeat: ParsedEvent['repeat'];
  const every = take(new RegExp(`\\severy\\s+${DAY_RE}(?:\\s*(?:,|and)\\s*${DAY_RE})*`, 'i'));
  if (every && !md) {
    const found = [...every[0].toLowerCase().matchAll(/(sun|mon|tue|wed|thu|fri|sat)/g)].map(m => DAYS.indexOf(m[1]));
    repeat = { days: [...new Set(found)] };
    let step = (repeat.days[0] - day.getDay() + 7) % 7;
    if (step === 0 && start !== null && start <= now.getHours() * 60 + now.getMinutes()) step = 7;
    day.setDate(day.getDate() + step);
  } else if (md) {
    day.setMonth(MONTHS.indexOf(md[1].toLowerCase().slice(0, 3)), Number(md[2]));
    if (day < new Date(now.getFullYear(), now.getMonth(), now.getDate())) day.setFullYear(day.getFullYear() + 1);
  } else if (take(/\stomorrow(?=\s)/i)) day.setDate(day.getDate() + 1);
  else if (take(/\stoday(?=\s)/i)) { /* today */ }
  else {
    const wd = take(new RegExp(`\\s(?:next\\s+)?${DAY_RE}(?=\\s)`, 'i'));
    if (wd) {
      let step = (DAYS.indexOf(wd[1].toLowerCase()) - day.getDay() + 7) % 7;
      if (step === 0 || /next/i.test(wd[0])) step = step || 7;
      day.setDate(day.getDate() + step);
    }
  }

  const title = text.replace(/\s+/g, ' ').trim();
  if (!title) return null;
  if (start === null) {
    const s = new Date(day), e = new Date(day); e.setDate(e.getDate() + 1);
    return { title, starts_at: s.toISOString(), ends_at: e.toISOString(), all_day: true, location, repeat };
  }
  const s = new Date(day); s.setHours(0, start, 0, 0);
  const e = new Date(day); e.setHours(0, end !== null && end > start ? end : start + 60, 0, 0);
  return { title, starts_at: s.toISOString(), ends_at: e.toISOString(), all_day: false, location, repeat };
}
