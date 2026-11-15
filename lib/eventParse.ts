/**
 * C.quick: "CS 150 every Mon 9-10:30 at Eng 214" into an event. Read word by
 * word: a word is a day or month only as a whole name, a bare number is a time
 * only after "at"/"from" or as the last word, and "at" starts a place only when
 * no time follows it. Local time throughout; days step with setDate (the dev
 * machine has no DST, so millisecond arithmetic would pass here and break elsewhere).
 */

export type ParsedEvent = { title: string; starts_at: string; ends_at: string; all_day: boolean; location?: string; repeat?: { days: number[] } };

const DAY_WORDS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTH_WORDS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

type Clock = { h: number; m: number; mer: '' | 'am' | 'pm' };
const CLOCK = /^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)?$/i;
function clock(word: string): Clock | null {
  if (/^noon$/i.test(word)) return { h: 12, m: 0, mer: 'pm' };
  const m = CLOCK.exec(word);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  const mer = (m[3] ?? '').toLowerCase().startsWith('p') ? 'pm' : m[3] ? 'am' : '';
  return { h, m: min, mer };
}
const explicit = (w: string) => /^noon$/i.test(w) || /^(\d{1,2})(:\d{2})(am|pm|a|p)?$/i.test(w) || /^(\d{1,2})(am|pm|a|p)$/i.test(w);
function minutes(c: Clock, mer = c.mer): number {
  let h = c.h % 24;
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  if (!mer && h >= 1 && h <= 6) h += 12;
  return h * 60 + c.m;
}

export function parseEvent(input: string, now: Date): ParsedEvent | null {
  // "9-10:30", "8am-11am", "9 - 1pm" become one range word.
  const words = input.trim().replace(/(\d)\s*(?:-|–)\s*(\d)/g, '$1-$2').split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const used = words.map(() => false);
  const lower = words.map(w => w.toLowerCase().replace(/[.,]$/, ''));

  let start: number | null = null, end: number | null = null;
  const setRange = (i: number) => {
    const [a, b] = lower[i].split('-'); const ca = clock(a), cb = clock(b);
    if (!ca || !cb) return false;
    end = minutes(cb);
    // "10pm-2": a bare end after an evening start is the small hours, not the afternoon.
    if (!cb.mer && ca.mer === 'pm' && end <= minutes(ca)) end = minutes(cb, 'am');
    // The start borrows the end's am/pm only when that keeps it before the end ("9-1pm" starts at 9 am).
    // Ending in the small hours, it is the evening before ("11-1am" runs 11 pm to 1 am the next day).
    const borrowed = minutes(ca, ca.mer || cb.mer);
    start = ca.mer ? minutes(ca) : borrowed <= end ? borrowed : minutes(ca, cb.mer === 'am' ? 'pm' : 'am');
    used[i] = true; return true;
  };

  // Times first: ranges, then explicit times, then a bare number after at/from or at the very end.
  for (let i = 0; i < words.length && start === null; i++) if (/^\d{1,2}(:\d{2})?(am|pm|a|p)?-\d{1,2}(:\d{2})?(am|pm|a|p)?$/i.test(lower[i])) setRange(i);
  for (let i = 0; i < words.length && start === null; i++) if (explicit(lower[i])) {
    start = minutes(clock(lower[i])!); used[i] = true;
    if (/^(at|from|@)$/.test(lower[i - 1] ?? '')) used[i - 1] = true;
  }
  for (let i = 0; i < words.length && start === null; i++) {
    const c = clock(lower[i]);
    if (!c || used[i]) continue;
    const after = /^(at|from|@)$/.test(lower[i - 1] ?? '');
    if (after || i === words.length - 1) { start = minutes(c); used[i] = true; if (after) used[i - 1] = true; }
  }

  // A place: "at" or "@" whose next unused word is not a time or a date.
  let location: string | undefined;
  for (let i = words.length - 2; i >= 0; i--) {
    if (used[i] || !/^(at|@)$/.test(lower[i]) || used[i + 1] || clock(lower[i + 1]) || lower[i + 1] in DAY_WORDS || lower[i + 1] in MONTH_WORDS || /^(today|tomorrow)$/.test(lower[i + 1])) continue;
    let j = i + 1; const place: string[] = [];
    while (j < words.length && !used[j] && !(lower[j] in DAY_WORDS) && !/^(today|tomorrow|every)$/.test(lower[j])) { place.push(words[j]); used[j] = true; j++; }
    if (place.length) { location = place.join(' ').replace(/[.,]$/, ''); used[i] = true; }
    break;
  }

  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const laterToday = () => start === null || start > nowMin;
  let repeat: ParsedEvent['repeat'];
  let dated = false;

  // A month and day: "nov 20", "november 20th".
  for (let i = 0; i < words.length - 1 && !dated; i++) {
    const m = MONTH_WORDS[lower[i]]; const d = /^(\d{1,2})(st|nd|rd|th)?$/.exec(lower[i + 1]);
    if (m === undefined || !d || used[i] || used[i + 1] || Number(d[1]) < 1 || Number(d[1]) > 31) continue;
    day.setMonth(m, Number(d[1]));
    if (day < new Date(now.getFullYear(), now.getMonth(), now.getDate())) day.setFullYear(day.getFullYear() + 1);
    used[i] = used[i + 1] = true; dated = true;
  }
  // "every Mon and Wed": the soonest listed day that is still ahead.
  const ev = lower.indexOf('every');
  if (!dated && ev >= 0 && !used[ev]) {
    const days: number[] = [];
    let j = ev + 1;
    while (j < words.length && (lower[j] in DAY_WORDS || lower[j] === 'and')) { if (lower[j] in DAY_WORDS) days.push(DAY_WORDS[lower[j]]); used[j] = true; j++; }
    if (days.length) {
      used[ev] = true; repeat = { days: [...new Set(days)].sort((a, b) => a - b) };
      const steps = repeat.days.map(d => { const s = (d - day.getDay() + 7) % 7; return s === 0 && !laterToday() ? 7 : s; });
      day.setDate(day.getDate() + Math.min(...steps)); dated = true;
    }
  }
  for (let i = 0; i < words.length && !dated; i++) {
    if (used[i]) continue;
    if (lower[i] === 'tomorrow') { day.setDate(day.getDate() + 1); used[i] = true; dated = true; }
    else if (lower[i] === 'today') { used[i] = true; dated = true; }
    else if (lower[i] in DAY_WORDS) {
      const next = lower[i - 1] === 'next';
      let step = (DAY_WORDS[lower[i]] - day.getDay() + 7) % 7;
      if (step === 0 && (next || !laterToday())) step = 7;
      day.setDate(day.getDate() + step);
      used[i] = true; if (next) used[i - 1] = true; dated = true;
    }
  }

  const title = words.filter((_, i) => !used[i]).join(' ').replace(/\s+/g, ' ').trim();
  if (!title) return null;
  if (start === null) {
    const s = new Date(day), e = new Date(day); e.setDate(e.getDate() + 1);
    return { title, starts_at: s.toISOString(), ends_at: e.toISOString(), all_day: true, location, repeat };
  }
  const s = new Date(day); s.setHours(0, start, 0, 0);
  // An end at or before the start is the next morning: "11pm-1am" ends tomorrow at 1, not earlier today.
  const e = new Date(day); e.setHours(0, end === null || end === start ? start + 60 : end > start ? end : end + 24 * 60, 0, 0);
  return { title, starts_at: s.toISOString(), ends_at: e.toISOString(), all_day: false, location, repeat };
}
