/**
 * Today's paper keeps yesterday's stories until the new ones land: Grok files each section
 * under its Manila day, and some arrive after you open the app (often not before 5 a.m.).
 * Pure, so `node --test lib/newsLatest.check.ts` runs it.
 */

/** How far back a section is carried while today's has not arrived. */
export const CARRY_DAYS = 6;

/** The day `n` days before a YYYY-MM-DD day. */
export function dayBefore(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** The newest edition of each section up to `today`: today's where it has come, otherwise the last one before it. */
export function latestPerKind<T extends { kind: string; edition: string; created_at: string }>(rows: T[], today: string): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    if (r.edition > today || r.edition < dayBefore(today, CARRY_DAYS)) continue;
    const had = best.get(r.kind);
    if (!had || r.edition > had.edition || (r.edition === had.edition && r.created_at > had.created_at)) best.set(r.kind, r);
  }
  return [...best.values()];
}

/** "yesterday" or "Wed, Nov 11" for a section carried over from an earlier day. */
export function carriedLabel(edition: string, today: string): string {
  if (edition === dayBefore(today, 1)) return 'yesterday';
  return new Date(`${edition}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
