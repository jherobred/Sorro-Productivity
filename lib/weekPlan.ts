export type TimeBlock = { starts_at: string; ends_at: string; deleted_at?: string | null };
export type TimeGap = { start: number; end: number };
/** Merge overlaps before finding gaps, including events spanning midnight. */
export function availableTime(events: TimeBlock[], start: number, end: number, minimum = 30 * 60_000): TimeGap[] {
  if (end <= start) return [];
  const busy = events.filter(e => !e.deleted_at).map(e => ({ start: Math.max(start, Date.parse(e.starts_at)), end: Math.min(end, Date.parse(e.ends_at)) }))
    .filter(e => Number.isFinite(e.start) && Number.isFinite(e.end) && e.end > e.start).sort((a,b)=>a.start-b.start);
  const gaps: TimeGap[] = []; let cursor = start;
  for (const b of busy) { if (b.start - cursor >= minimum) gaps.push({start:cursor,end:b.start}); cursor=Math.max(cursor,b.end); }
  if (end-cursor >= minimum) gaps.push({start:cursor,end});
  return gaps;
}
export function conflicts(events: TimeBlock[], start: number, end: number) {
  return events.some(e => !e.deleted_at && Date.parse(e.starts_at) < end && Date.parse(e.ends_at) > start);
}
