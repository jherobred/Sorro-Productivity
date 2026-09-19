/**
 * Tasks that come back.
 *
 * A repeating task is one task at a time: finishing it makes the next one,
 * due on the next date the rule allows, and the rule moves over to it. Only the
 * rule is new, and it rides the synced prefs keyed by task id, the way project
 * notes and link categories do, so it follows you across devices without a
 * column. Pure date arithmetic on YYYY-MM-DD strings, so it can be checked
 * without a browser or a time zone.
 */

export type TaskRepeat = {
  every: 'day' | 'weekday' | 'week' | 'month' | 'year';
  /** Every 2 weeks, every 3 days. One when missing. */
  interval?: number;
  /** For weekly: which weekdays, 0 Sunday to 6 Saturday. The due date's own weekday when missing. */
  days?: number[];
  /** The last date the task may come back on. */
  until?: string | null;
};

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDays = (s: string, n: number) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const weekday = (s: string) => parse(s).getUTCDay();

/** The same day of the month `n` months on, held to the month's last day when it has fewer. */
function addMonths(s: string, n: number, dayOfMonth: number): string {
  const d = parse(s);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return ymd(new Date(Date.UTC(y, m, Math.min(dayOfMonth, last))));
}

/** One step of the rule from `from`: the next date it names, strictly after `from`. */
function step(rule: TaskRepeat, from: string, anchorDay: number): string {
  const n = Math.max(1, Math.round(rule.interval ?? 1));
  switch (rule.every) {
    case 'day': return addDays(from, n);
    case 'weekday': {
      let d = addDays(from, 1);
      while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1);
      return d;
    }
    case 'week': {
      const days = (rule.days?.length ? rule.days : [weekday(from)]).slice().sort((a, b) => a - b);
      // Later this week, if the rule names a later weekday; otherwise the first named day `n` weeks on.
      const today = weekday(from);
      const later = days.find((d) => d > today);
      if (later !== undefined) return addDays(from, later - today);
      return addDays(from, 7 * n - today + days[0]);
    }
    case 'month': return addMonths(from, n, anchorDay);
    case 'year': return addMonths(from, 12 * n, anchorDay);
  }
}

/**
 * When the task comes back after it is finished. Counted on from its due date,
 * so a weekly task stays on its day; if that is already past (it was finished
 * late), the rule keeps stepping until it lands after today, so finishing a
 * late task never makes another late one. Null once the rule has run out.
 */
export function nextDue(rule: TaskRepeat, due: string | null, today: string): string | null {
  const from = due ?? today;
  const anchorDay = parse(from).getUTCDate();
  let next = step(rule, from, anchorDay);
  for (let guard = 0; next <= today && guard < 1000; guard++) next = step(rule, next, anchorDay);
  if (rule.until && next > rule.until) return null;
  return next;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Every day", "Weekdays", "Every 2 weeks on Mon, Thu", "Monthly". */
export function repeatLabel(rule: TaskRepeat, due?: string | null): string {
  const n = Math.max(1, Math.round(rule.interval ?? 1));
  const days = rule.every === 'week' ? (rule.days?.length ? rule.days : due ? [weekday(due)] : []) : [];
  const on = days.length ? ` on ${days.slice().sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(', ')}` : '';
  const base = rule.every === 'weekday' ? 'Weekdays'
    : n === 1 ? { day: 'Every day', week: `Weekly${on}`, month: 'Monthly', year: 'Yearly' }[rule.every]
      : `Every ${n} ${{ day: 'days', week: 'weeks', month: 'months', year: 'years' }[rule.every]}${on}`;
  return rule.until ? `${base}, until ${rule.until}` : base;
}

/** Whether a stored value is a rule this build understands. */
export function isRepeat(v: unknown): v is TaskRepeat {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return ['day', 'weekday', 'week', 'month', 'year'].includes(String(r.every))
    && (r.interval === undefined || (typeof r.interval === 'number' && r.interval >= 1))
    && (r.days === undefined || (Array.isArray(r.days) && r.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)))
    && (r.until === undefined || r.until === null || (typeof r.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.until)));
}
