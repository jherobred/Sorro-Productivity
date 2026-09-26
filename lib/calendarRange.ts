/** Local grid hours, clipped to the day on which an event begins. */
export function gridRange(startsAt: string, endsAt: string): { start: number; end: number } {
  const from = new Date(startsAt), to = new Date(endsAt);
  const start = from.getHours() + from.getMinutes() / 60;
  const crossesMidnight = to > from && to.toDateString() !== from.toDateString();
  const end = crossesMidnight ? 24 : to.getHours() + to.getMinutes() / 60;
  return { start, end: end > start ? end : Math.min(24, start + .25) };
}
