'use client';
/**
 * Puts Google Calendar's own event colors on the events the iCal sync imported. The feed has no
 * colors, so they are read from Google with a connected account's sign-in (lib/googleAccounts.ts)
 * and saved on the rows; the sync keeps them. A color picked in Sorro is kept on top, as before.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { devFixturesOn } from './devFixtures';
import { forgetGoogleToken, googleTokens } from './googleAccounts';
import { gcalUrls, googleCalendarId } from './googleCalendarApi';
import { colorChanges, colorMap, type GoogleColorEvent } from './googleColors';
import { useIntegrations } from './integrations';

const API = 'https://www.googleapis.com/calendar/v3';
const LAST_KEY = 'sorro.gcal.colors.at';
const EVERY = 20 * 60_000;

/** One calendar's colors, or 'auth' when the token is spent, or null when this account cannot read it. */
async function readColors(token: string, calendarId: string): Promise<Map<string, string> | 'auth' | null> {
  const get = (url: string) => fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const events: GoogleColorEvent[] = [];
  let page: string | undefined;
  do {
    const q = new URLSearchParams({
      singleEvents: 'true', showDeleted: 'false', maxResults: '2500',
      timeMin: new Date(Date.now() - 30 * 864e5).toISOString(), timeMax: new Date(Date.now() + 180 * 864e5).toISOString(),
      fields: 'items(iCalUID,colorId,status,recurringEventId,originalStartTime),nextPageToken',
      ...(page ? { pageToken: page } : {}),
    });
    const res = await get(`${API}/calendars/${encodeURIComponent(calendarId)}/events?${q}`).catch(() => null);
    if (!res) return null;
    if (res.status === 401) return 'auth';
    if (!res.ok) return null;
    const data = await res.json() as { items?: GoogleColorEvent[]; nextPageToken?: string };
    events.push(...(data.items ?? []));
    page = data.nextPageToken;
  } while (page);
  // The calendar's own color, for events left on it. Needs more access than editing events; without it they stay as they are.
  const cal = await get(`${API}/users/me/calendarList/${encodeURIComponent(calendarId)}?fields=backgroundColor`).catch(() => null);
  const own = cal?.ok ? ((await cal.json()) as { backgroundColor?: string }).backgroundColor ?? null : null;
  return colorMap(events, own);
}

/** Reads every connected calendar and saves the colors that changed. Returns how many events changed. */
export async function syncGoogleColors(config: Record<string, string> | undefined): Promise<number> {
  const calendarIds = gcalUrls(config).map(googleCalendarId).filter((id): id is string => !!id);
  if (!calendarIds.length || !googleTokens().length) return 0;
  const map = new Map<string, string>();
  for (const calendarId of calendarIds) {
    const tokens = googleTokens();
    const own = tokens.filter((t) => t.email === calendarId.toLowerCase());
    for (const { token } of own.length ? own : tokens) {
      const found = await readColors(token, calendarId);
      if (found === 'auth') { forgetGoogleToken(token); continue; }
      if (!found) continue;
      for (const [k, v] of found) if (!map.has(k)) map.set(k, v);
      break;
    }
  }
  if (!map.size) return 0;
  const rows: { id: string; external_id: string | null; color: string | null }[] = [];
  for (let at = 0; ; at += 1000) {
    const { data, error } = await supabase.from('sorro_events').select('id,external_id,color')
      .eq('source', 'gcal_ics').is('deleted_at', null).order('id').range(at, at + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  let changed = 0;
  for (const [color, ids] of colorChanges(rows, map)) {
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from('sorro_events').update({ color }).in('id', ids.slice(i, i + 100));
      if (error) throw error;
      changed += Math.min(100, ids.length - i);
    }
  }
  return changed;
}

/** On the calendar: brings Google's colors in when it opens, at most every 20 minutes, while a Google sign-in is live. */
export function useGoogleColors() {
  const qc = useQueryClient();
  const { data: rows = [] } = useIntegrations();
  const config = rows.find((r) => r.kind === 'gcal_ics')?.config;
  const key = config ? gcalUrls(config).join('|') : '';
  useEffect(() => {
    if (!key || devFixturesOn() || typeof navigator === 'undefined' || !navigator.onLine) return;
    const last = Number(localStorage.getItem(LAST_KEY) ?? 0);
    if (Date.now() - last < EVERY || !googleTokens().length) return;
    localStorage.setItem(LAST_KEY, String(Date.now()));
    void syncGoogleColors(config)
      .then((n) => { if (n) void qc.invalidateQueries({ queryKey: ['events'] }); })
      .catch(() => localStorage.removeItem(LAST_KEY));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
