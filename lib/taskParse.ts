/**
 * Quick add: one typed line becomes a task.
 *
 * "Read chapter 7 tomorrow 3pm !high #CS191 @School" is the title "Read
 * chapter 7", due tomorrow at 3 PM, high priority, the CS 191 course and the
 * School list. A word is only taken when it means something: a #tag or @list
 * that matches nothing stays in the title, and a word the person switched off
 * in the preview stays as typed.
 */

export type QuickTokenKind = 'date' | 'time' | 'priority' | 'course' | 'list';
/** `raw` is the text that was read, lowercased, which is also how a token is switched off. */
export type QuickToken = { kind: QuickTokenKind; raw: string; label: string };
export type QuickTask = {
  title: string;
  due_on: string | null;
  /** HH:MM, local, when a time was given. */
  time: string | null;
  due_at: string | null;
  priority: 'high' | 'med' | 'low' | null;
  course: string | null;
  listId: string | null;
  tokens: QuickToken[];
};
export type QuickContext = {
  lists: { id: string; name: string }[];
  tags: { name: string }[];
  /** Raw token text the person chose to keep as words. */
  ignore?: Set<string>;
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};
const MONTHS: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4, june: 5, jun: 5,
  july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};
const PRIORITY: Record<string, 'high' | 'med' | 'low'> = {
  '!high': 'high', '!h': 'high', '!1': 'high', '!!!': 'high', '!urgent': 'high',
  '!medium': 'med', '!med': 'med', '!m': 'med', '!2': 'med', '!!': 'med',
  '!low': 'low', '!l': 'low', '!3': 'low',
};
const CONNECTORS = new Set(['by', 'on', 'at', 'due']);
/** Own keys only: a word like "constructor" must not read as a weekday. */
const has = (table: object, word: string | undefined): word is string => word !== undefined && Object.prototype.hasOwnProperty.call(table, word);

const pad = (n: number) => String(n).padStart(2, '0');
export const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const key = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** A month and day with no year: this year, or next year once it has passed. */
function upcomingDate(now: Date, month: number, day: number): Date | null {
  if (day < 1 || day > 31) return null;
  let date = new Date(now.getFullYear(), month, day);
  if (date.getMonth() !== month) return null;
  if (date < startOfDay(now)) date = new Date(now.getFullYear() + 1, month, day);
  return date;
}

function dateLabel(date: Date, now: Date): string {
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

function timeLabel(h: number, m: number): string {
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Reads a date starting at word i. Returns the date and how many words it used. */
function readDate(words: string[], i: number, now: Date): { date: Date; used: number } | null {
  const w = words[i], next = words[i + 1];
  if (w === 'today' || w === 'tod' || w === 'tonight') return { date: startOfDay(now), used: 1 };
  if (w === 'tomorrow' || w === 'tmr' || w === 'tmrw') return { date: addDays(now, 1), used: 1 };
  if (w === 'next' && next === 'week') return { date: addDays(now, ((8 - now.getDay()) % 7) || 7), used: 2 };
  if ((w === 'next' || w === 'this') && has(WEEKDAYS, next)) {
    const ahead = ((WEEKDAYS[next] - now.getDay() + 7) % 7) || 7;
    return { date: addDays(now, w === 'next' ? ahead + 7 : ahead), used: 2 };
  }
  if (has(WEEKDAYS, w)) return { date: addDays(now, (WEEKDAYS[w] - now.getDay() + 7) % 7), used: 1 };
  if (w === 'in' && next && /^\d{1,3}$/.test(next) && /^(days?|weeks?)$/.test(words[i + 2] ?? '')) {
    const n = Number(next);
    return { date: addDays(now, words[i + 2].startsWith('week') ? n * 7 : n), used: 3 };
  }
  if (has(MONTHS, w) && next && /^\d{1,2}(st|nd|rd|th)?,?$/.test(next)) {
    const date = upcomingDate(now, MONTHS[w], parseInt(next, 10));
    return date ? { date, used: 2 } : null;
  }
  if (/^\d{1,2}(st|nd|rd|th)?$/.test(w) && has(MONTHS, next?.replace(/,$/, ''))) {
    const date = upcomingDate(now, MONTHS[next!.replace(/,$/, '')], parseInt(w, 10));
    return date ? { date, used: 2 } : null;
  }
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getMonth() === Number(match[2]) - 1 ? { date, used: 1 } : null;
  }
  match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(w);
  if (match) {
    const month = Number(match[1]) - 1, day = Number(match[2]);
    if (match[3]) {
      const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
      const date = new Date(year, month, day);
      return date.getMonth() === month && date.getDate() === day ? { date, used: 1 } : null;
    }
    const date = upcomingDate(now, month, day);
    return date ? { date, used: 1 } : null;
  }
  return null;
}

/** Reads a time starting at word i: 3pm, 3:30pm, 3:30 pm, 15:00, noon. */
function readTime(words: string[], i: number): { h: number; m: number; used: number } | null {
  const w = words[i], next = words[i + 1];
  if (w === 'noon') return { h: 12, m: 0, used: 1 };
  let match = /^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)$/.exec(w);
  let used = 1;
  if (!match && /^\d{1,2}(?::\d{2})?$/.test(w) && next && /^(am|pm)$/.test(next)) {
    match = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(w + next);
    used = 2;
  }
  if (match) {
    let h = Number(match[1]);
    const m = Number(match[2] ?? 0);
    if (h < 1 || h > 12 || m > 59) return null;
    const pm = match[3].startsWith('p');
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
    return { h, m, used };
  }
  match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(w);
  if (match) return { h: Number(match[1]), m: Number(match[2]), used: 1 };
  return null;
}

export function parseQuickTask(text: string, now: Date, ctx: QuickContext): QuickTask {
  const ignore = ctx.ignore ?? new Set<string>();
  const original = text.trim().split(/\s+/).filter(Boolean);
  const words = original.map((w) => w.toLowerCase());
  const keep: boolean[] = original.map(() => true);
  // Words inside a token the person switched off, so "next friday" kept as
  // words does not come back as "friday" on its own.
  const locked: boolean[] = original.map(() => false);
  const tokens: QuickToken[] = [];
  let date: Date | null = null, time: { h: number; m: number } | null = null, tonight = false;
  let priority: QuickTask['priority'] = null, course: string | null = null, listId: string | null = null;

  const take = (i: number, used: number, kind: QuickTokenKind, label: string) => {
    const raw = words.slice(i, i + used).join(' ');
    if (ignore.has(raw)) {
      for (let j = i; j < i + used; j++) locked[j] = true;
      return false;
    }
    for (let j = i; j < i + used; j++) keep[j] = false;
    // "by Friday", "at 3pm": the little word before a date or time goes with it.
    if (i > 0 && keep[i - 1] && CONNECTORS.has(words[i - 1])) keep[i - 1] = false;
    tokens.push({ kind, raw, label });
    return true;
  };

  for (let i = 0; i < words.length; i++) {
    if (!keep[i] || locked[i]) continue;
    const w = words[i];
    if (!priority && has(PRIORITY, w)) {
      const value = PRIORITY[w];
      if (take(i, 1, 'priority', value === 'high' ? 'High priority' : value === 'med' ? 'Medium priority' : 'Low priority')) priority = value;
      continue;
    }
    if (!course && w.startsWith('#') && w.length > 1) {
      const tag = ctx.tags.find((t) => key(t.name) === key(w.slice(1)));
      if (tag && take(i, 1, 'course', tag.name)) course = tag.name;
      continue;
    }
    if (!listId && w.startsWith('@') && w.length > 1) {
      const list = ctx.lists.find((l) => key(l.name) === key(w.slice(1)));
      if (list && take(i, 1, 'list', list.name)) listId = list.id;
      continue;
    }
    if (!date) {
      const found = readDate(words, i, now);
      if (found && take(i, found.used, 'date', dateLabel(found.date, now))) {
        date = found.date;
        tonight = w === 'tonight';
        i += found.used - 1;
        continue;
      }
    }
    if (!time) {
      const found = readTime(words, i);
      if (found && take(i, found.used, 'time', timeLabel(found.h, found.m))) {
        time = { h: found.h, m: found.m };
        i += found.used - 1;
      }
    }
  }

  if (tonight && !time) time = { h: 20, m: 0 };
  // A time with no day is the next time that clock time comes round.
  if (time && !date) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), time.h, time.m);
    date = today.getTime() > now.getTime() ? startOfDay(now) : addDays(now, 1);
    tokens.push({ kind: 'date', raw: '', label: dateLabel(date, now) });
  }

  const title = original.filter((_, i) => keep[i]).join(' ').trim();
  const due_at = date && time ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.h, time.m).toISOString() : null;
  return {
    title,
    due_on: date ? ymdOf(date) : null,
    time: time ? `${pad(time.h)}:${pad(time.m)}` : null,
    due_at,
    priority,
    course,
    listId,
    tokens,
  };
}
