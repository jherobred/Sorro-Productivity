/**
 * Canvas, read back out of the rows the sync function writes.
 *
 * The `sync` Edge Function stores Canvas assignments in bd_tasks, with the
 * course and the assignment link in `notes` as "CS 191 — https://…", and
 * announcements in bd_notifications, with the course at the front of `body` as
 * "CS 191 · …". These turn those rows back into what the Canvas sections show,
 * and decide what is new enough to notify about. Pure, so node --test holds it.
 */

/** UST's Canvas, from Canvas's own school directory. */
export const UST_CANVAS_URL = 'https://ust.instructure.com';

export function readCanvasNotes(notes: string | null | undefined): { course: string; url: string | null } {
  const text = (notes ?? '').trim();
  const at = text.lastIndexOf(' — ');
  if (at < 0) return /^https?:\/\/\S+$/.test(text) ? { course: '', url: text } : { course: text.split('\n')[0] ?? '', url: null };
  const url = text.slice(at + 3).trim().split(/\s/)[0];
  return /^https?:\/\//.test(url) ? { course: text.slice(0, at).trim(), url } : { course: text.split('\n')[0] ?? '', url: null };
}

export function readAnnouncement(body: string | null | undefined): { course: string; text: string } {
  const text = (body ?? '').trim();
  const at = text.indexOf(' · ');
  if (at < 0) return { course: '', text };
  return { course: text.slice(0, at).trim(), text: text.slice(at + 3).trim() };
}

/**
 * The ids worth a notification: the ones not seen before. `seen` is null the
 * first time, and then nothing is new, so connecting Canvas or turning
 * notifications on does not set off one alert for every item already there.
 */
export function freshIds(current: readonly string[], seen: readonly string[] | null): string[] {
  if (seen === null) return [];
  const known = new Set(seen);
  return current.filter((id) => !known.has(id));
}

/** What to remember after a look: everything current, plus what was already known, capped. */
export function rememberIds(current: readonly string[], seen: readonly string[] | null, cap = 400): string[] {
  return [...new Set([...current, ...(seen ?? [])])].slice(0, cap);
}

export type ReminderLead = 'day' | 'hour';

/** A day and an hour before a deadline, leaving out any moment already past. */
export function reminderTimes(dueAt: number, now: number): { lead: ReminderLead; at: number }[] {
  return ([['day', 86_400_000], ['hour', 3_600_000]] as const)
    .map(([lead, ms]) => ({ lead, at: dueAt - ms }))
    .filter((r) => r.at > now + 60_000);
}

/**
 * A stable notification id from a key, so rescheduling the same reminder
 * replaces it instead of adding a second one. Android wants a positive 32-bit int.
 */
export function notificationId(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 1) || 1;
}
