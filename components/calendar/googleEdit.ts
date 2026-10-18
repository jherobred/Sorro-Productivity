'use client';
import type { Ev } from '@/lib/events';
import { connectGoogleAccount, forgetGoogleToken, googleTokens } from '@/lib/googleAccounts';
import { googleCalendarId, gcalUrls, patchGoogleOccurrence, withGoogleCalendar, GoogleAuthorizationError, type GoogleEventPatch } from '@/lib/googleCalendarApi';
import { toast } from '@/lib/toast';

const GOOGLE_FIELDS = ['title', 'location', 'starts_at', 'ends_at', 'all_day'] as const;

/**
 * Saves an edit to a Google-synced event. What Google stores shows in Basedly
 * at once, so a drag does not snap back while Google answers, and is put back
 * if Google refuses, so the two never disagree until the next sync. Colors,
 * short names and reminders are Basedly-only and save locally either way.
 * `quiet` skips the success toast for callers that show their own (a move's Undo).
 */
export async function saveGoogleEdit(ev: Ev, patch: Partial<Ev>, config: Record<string, string> | undefined, update: (patch: Partial<Ev>) => void, quiet = false) {
  const google: GoogleEventPatch = {};
  const local: Partial<Ev> = {};
  for (const [k, v] of Object.entries(patch)) {
    if ((GOOGLE_FIELDS as readonly string[]).includes(k)) {
      if (v !== (ev as Record<string, unknown>)[k]) (google as Record<string, unknown>)[k] = v;
    } else (local as Record<string, unknown>)[k] = v;
  }
  if (Object.keys(local).length) update(local);
  if (!Object.keys(google).length) return;
  // Google needs both ends when either moves.
  if (google.starts_at || google.ends_at || google.all_day !== undefined) {
    google.starts_at ??= ev.starts_at; google.ends_at ??= ev.ends_at; google.all_day ??= ev.all_day;
  }
  const before = Object.fromEntries(Object.keys(google).map((k) => [k, (ev as Record<string, unknown>)[k]])) as Partial<Ev>;
  update(google as Partial<Ev>);
  try {
    const externalId = ev.external_id;
    if (!externalId) throw new Error('Sync your Google Calendar, then edit this event again.');
    const calendarIds = gcalUrls(config).map(googleCalendarId).filter((id): id is string => !!id);
    await withGoogleCalendar(calendarIds, googleTokens(),
      (token, calendarId) => patchGoogleOccurrence({ token, calendarId, externalId, patch: google }), forgetGoogleToken);
    if (!quiet) toast('Saved to Google Calendar');
  } catch (e) {
    update(before);
    const message = e instanceof Error ? e.message : 'Could not save to Google. Try again.';
    if (e instanceof GoogleAuthorizationError) {
      const account = e.account;
      toast(message, () => { void connectGoogleAccount(account).then((r) => { if (r.error) toast(r.error); }); }, { action: 'Connect' });
    } else toast(message);
  }
}
