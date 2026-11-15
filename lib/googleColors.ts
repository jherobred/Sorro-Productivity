/**
 * Google Calendar's own event colors, matched onto the events the iCal feed imported.
 * The feed carries no colors, so they are read from Google with the account's sign-in.
 * Pure, so `node --test` runs it.
 */

/** Google's event colors by colorId, as its calendar shows them (Lavender … Tomato). */
export const GOOGLE_EVENT_COLORS: Record<string, string> = {
  '1': '#7986CB', '2': '#33B679', '3': '#8E24AA', '4': '#E67C73', '5': '#F6BF26', '6': '#F4511E',
  '7': '#039BE5', '8': '#616161', '9': '#3F51B5', '10': '#0B8043', '11': '#D50000',
};

/** One event from Google's events.list with singleEvents=true: a single event or one occurrence of a series. */
export type GoogleColorEvent = {
  iCalUID?: string; colorId?: string; status?: string; recurringEventId?: string;
  originalStartTime?: { dateTime?: string; date?: string };
};

/** 20261115T090000Z, the same stamp the iCal import puts after `@` on a repeating event's occurrence. */
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * The imported row's external_id for a Google event: the UID alone, or UID@start for one occurrence
 * of a repeating event. An all-day occurrence is stamped at midnight UTC, as the import does.
 */
export function occurrenceKey(e: GoogleColorEvent): string | null {
  if (!e.iCalUID) return null;
  const o = e.originalStartTime;
  if (!e.recurringEventId || !o) return e.iCalUID;
  const ms = o.dateTime ? Date.parse(o.dateTime) : o.date ? Date.parse(`${o.date}T00:00:00Z`) : NaN;
  return Number.isFinite(ms) ? `${e.iCalUID}@${stamp(ms)}` : e.iCalUID;
}

/**
 * Colors by external_id, and by UID for a series whose occurrences are outside what was listed.
 * An event left on the calendar's own color takes `calendarColor` when it is known.
 */
export function colorMap(events: GoogleColorEvent[], calendarColor: string | null = null): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of events) {
    if (e.status === 'cancelled') continue;
    const color = (e.colorId && GOOGLE_EVENT_COLORS[e.colorId]) || calendarColor;
    const key = occurrenceKey(e);
    if (!color || !key) continue;
    out.set(key, color);
    if (e.iCalUID && !out.has(e.iCalUID)) out.set(e.iCalUID, color);
  }
  return out;
}

/** The color an imported row should have, or null to leave it. */
export function colorFor(map: Map<string, string>, externalId: string | null | undefined): string | null {
  if (!externalId) return null;
  return map.get(externalId) ?? map.get(externalId.replace(/@\d{8}T\d{6}Z$/, '')) ?? null;
}

/** Rows whose color should change, grouped by the new color so each color is one update. */
export function colorChanges(rows: { id: string; external_id: string | null; color: string | null }[], map: Map<string, string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const next = colorFor(map, r.external_id);
    if (!next || next.toLowerCase() === (r.color ?? '').toLowerCase()) continue;
    out.set(next, [...(out.get(next) ?? []), r.id]);
  }
  return out;
}
