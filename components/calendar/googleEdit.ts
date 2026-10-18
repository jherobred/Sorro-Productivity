'use client';
import type { Ev } from '@/lib/events';
import { supabase } from '@/lib/supabase';
import { signInWithGoogle } from '@/lib/nativeAuth';
import { googleCalendarId, patchGoogleOccurrence, GoogleAuthorizationError, type GoogleEventPatch } from '@/lib/googleCalendarApi';
import { toast } from '@/lib/toast';

const GOOGLE_FIELDS = ['title', 'location', 'starts_at', 'ends_at', 'all_day'] as const;

/**
 * Saves an edit to a Google-synced event. What Google stores goes to Google
 * first and lands in Basedly only once Google accepts it, so a failure never
 * leaves the two disagreeing until the next sync. Colors and short names are
 * Basedly-only and save locally either way.
 */
export async function saveGoogleEdit(ev: Ev, patch: Partial<Ev>, icsUrl: string, update: (patch: Partial<Ev>) => void) {
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
  try {
    const calendarId = googleCalendarId(icsUrl);
    if (!calendarId || !ev.external_id) throw new Error('Sync your Google Calendar, then edit this event again.');
    const { data } = await supabase.auth.getSession();
    const token = data.session?.provider_token;
    if (!token) throw new GoogleAuthorizationError('Connect Google to edit Google Calendar events.');
    await patchGoogleOccurrence({ token, calendarId, externalId: ev.external_id, patch: google });
    update(google as Partial<Ev>);
    toast('Saved to Google Calendar');
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not save to Google. Try again.';
    if (e instanceof GoogleAuthorizationError) {
      toast(message, () => {
        sessionStorage.setItem('basedly-after-auth', '/calendar/');
        void signInWithGoogle({ prompt: 'consent', scopes: 'https://www.googleapis.com/auth/calendar.events' });
      }, { action: 'Connect' });
    } else toast(message);
  }
}
