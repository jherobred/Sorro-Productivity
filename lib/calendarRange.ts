/** Local grid hours, clipped to the day on which an event begins. */
export function gridRange(startsAt: string, endsAt: string): { start: number; end: number } {
  const from = new Date(startsAt), to = new Date(endsAt);
  const start = from.getHours() + from.getMinutes() / 60;
  const crossesMidnight = to > from && to.toDateString() !== from.toDateString();
  const end = crossesMidnight ? 24 : to.getHours() + to.getMinutes() / 60;
  return { start, end: end > start ? end : Math.min(24, start + .25) };
}

/**
 * The days an edited event runs past its start day, beyond an overnight finish: 0 for one that ends
 * the same day or the next morning ("11 pm to 1 am"), 2 for "Mon 9 am to Wed 5 pm".
 */
export function extraDays(startsAt: string, endsAt: string): number {
  const from = new Date(startsAt), to = new Date(endsAt);
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  const minsOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
  return Math.max(0, days - (minsOf(to) <= minsOf(from) ? 1 : 0));
}

/**
 * Start and end from the edit form's local date and times. An end at or before the start
 * is the next day, so "11:00 PM to 1:00 AM" saves as an overnight event instead of failing.
 * `extra` keeps a multi-day event's length (see extraDays).
 */
export function formRange(date: string, from: string, to: string, extra = 0): { starts: Date; ends: Date; nextDay: boolean } {
  const starts = new Date(`${date}T${from}`);
  const ends = new Date(`${date}T${to}`);
  ends.setDate(ends.getDate() + extra);
  const nextDay = ends <= starts;
  if (nextDay) ends.setDate(ends.getDate() + 1);
  return { starts, ends, nextDay };
}

/** The part of an event that spills past midnight onto the next day, in that day's grid hours, or null. */
export function spillRange(startsAt: string, endsAt: string, day: Date): { start: number; end: number } | null {
  const from = new Date(startsAt), to = new Date(endsAt);
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  if (from >= dayStart || to <= dayStart) return null;
  const end = to >= dayEnd ? 24 : to.getHours() + to.getMinutes() / 60;
  return end > 0 ? { start: 0, end: Math.max(end, .25) } : null;
}
