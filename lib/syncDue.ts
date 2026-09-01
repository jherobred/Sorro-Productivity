/**
 * When a connection is due another sync.
 *
 * Pure and dependency-free so `node --test lib/syncDue.check.ts` can hold it —
 * lib/integrations.ts imports the Supabase client and React, neither of which
 * loads outside a bundler.
 */

/** Half an hour is plenty for a class timetable. */
export const AUTO_SYNC_MS = 30 * 60_000;

export type DueRow = { kind: string; enabled: boolean; last_sync_at: string | null };

/**
 * Two floors, because `last_sync_at` on its own does not hold:
 *
 *  - **The stored one.** A successful sync stamps it, so half an hour has to
 *    pass before the next.
 *  - **A local one, per kind.** A *failed* sync stamps only `last_error` — the
 *    Edge Function leaves `last_sync_at` alone — so a connection that is
 *    failing reads as "never synced" for ever. Without this floor every focus
 *    and every visibilitychange fired another Edge Function invocation into
 *    the same failure, on the connection least able to afford one.
 */
export function dueKinds(
  rows: readonly DueRow[],
  tried: Readonly<Record<string, number>>,
  now: number,
  everyMs: number = AUTO_SYNC_MS,
): string[] {
  return rows
    .filter((r) => r.enabled)
    .filter((r) => now - (tried[r.kind] ?? 0) >= everyMs)
    .filter((r) => {
      if (!r.last_sync_at) return true;                    // never synced
      const t = new Date(r.last_sync_at).getTime();
      // An unparseable stamp must not freeze syncing for ever: NaN compares
      // false against everything, which would silently mean "never due".
      return !Number.isFinite(t) || now - t >= everyMs;
    })
    .map((r) => r.kind);
}
