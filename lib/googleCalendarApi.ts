/** Google API event IDs are not iCal UIDs. Resolve the exact occurrence first. */
export type GoogleEvent = {
  id: string; etag?: string; iCalUID?: string; recurrence?: string[]; status?: string;
  originalStartTime?: { dateTime?: string; date?: string };
};
/** `account` is the Google email to reconnect, when one is known. */
export class GoogleAuthorizationError extends Error {
  account?: string;
  constructor(message: string, account?: string) { super(message); this.account = account; }
}
/** This account or calendar does not hold the event; another connected one may. */
export class GoogleNotHereError extends Error {}

/** A Google Calendar connection holds up to three iCal addresses. */
export const gcalUrls = (config: Record<string, string> | undefined): string[] =>
  [config?.ics_url, config?.ics_url_2, config?.ics_url_3].map((u) => (u ?? '').trim()).filter(Boolean);

/**
 * Runs one Google write against whichever connected calendar holds the event,
 * with the token of the account that owns that calendar first. A calendar's id
 * is its owner's email for a primary calendar, so that pairing is tried first;
 * shared calendars fall back to every live token.
 */
export async function withGoogleCalendar<T>(
  calendarIds: string[], tokens: { email: string; token: string }[],
  run: (token: string, calendarId: string) => Promise<T>,
  onExpired: (token: string) => void = () => {},
): Promise<T> {
  if (!calendarIds.length) throw new Error('Sync your Google Calendar, then edit this event again.');
  let last: unknown = null;
  const missing: string[] = [];
  for (const calendarId of calendarIds) {
    const own = tokens.filter((t) => t.email === calendarId.toLowerCase());
    if (!own.length && calendarId.includes('@') && !calendarId.endsWith('calendar.google.com')) missing.push(calendarId);
    for (const { token } of own.length ? own : tokens) {
      try { return await run(token, calendarId); } catch (e) {
        if (e instanceof GoogleAuthorizationError) onExpired(token);
        else if (!(e instanceof GoogleNotHereError)) throw e;
        last = e;
      }
    }
  }
  if (missing.length) throw new GoogleAuthorizationError(`Connect ${missing[0]} to edit its Google events.`, missing[0]);
  if (!tokens.length) throw new GoogleAuthorizationError('Connect Google to edit Google Calendar events.');
  throw last instanceof Error ? last : new Error('Could not save to Google. Try again.');
}

export function googleCalendarId(icsUrl: string): string | null {
  try {
    const u = new URL(icsUrl);
    if (u.protocol !== 'https:' || u.hostname !== 'calendar.google.com') return null;
    const match = /^\/calendar\/ical\/([^/]+)\//.exec(u.pathname);
    return match ? decodeURIComponent(match[1]) : null;
  } catch { return null; }
}

export function googleOccurrence(externalId: string): { uid: string; originalStart?: string } {
  const m = /^(.*)@(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(externalId);
  return m ? { uid: m[1], originalStart: `${m[2]}-${m[3]}-${m[4]}T${m[5]}:${m[6]}:${m[7]}Z` } : { uid: externalId };
}

type TargetOptions = { token: string; calendarId: string; externalId: string; series?: boolean; fetcher?: typeof fetch };

/** Finds the one Google event an imported row stands for: the occurrence, or with
    `series` the master. Throws rather than guess, so a write never lands on the wrong event. */
async function googleTarget(options: TargetOptions, verb: string) {
  const { token, calendarId, externalId, series, fetcher = fetch } = options;
  const { uid, originalStart } = googleOccurrence(externalId);
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const request = async (url: string, init?: RequestInit) => {
    const response = await fetcher(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers } });
    if (response.status === 401) throw new GoogleAuthorizationError(`Google access expired. Reconnect, then try to ${verb} again.`);
    if (!response.ok && response.status !== 410) {
      const body = await response.json().catch(() => ({}));
      const reason = body.error?.errors?.[0]?.reason;
      if (response.status === 403 && (reason === 'insufficientPermissions' || reason === 'authError')) {
        throw new GoogleAuthorizationError(`Google Calendar permission is needed. Reconnect to ${verb} Google events.`);
      }
      if (response.status === 403 && reason === 'accessNotConfigured') throw new Error('Google Calendar access is turned off for Sorro. Try again in a few minutes.');
      if (response.status === 403) throw new GoogleNotHereError(`Google refused to ${verb} this event. Check that you have edit access to this calendar.`);
      if (response.status === 404) throw new GoogleNotHereError('Google could not find this calendar or event. Check the connected Google account, then sync again.');
      throw new Error(response.status === 412 ? `This event changed in Google. Sync again before you ${verb} it.`
        : body.error?.message || `Google Calendar returned ${response.status}. Try again.`);
    }
    return response;
  };
  const list = async (url: string) => {
    const result: GoogleEvent[] = [];
    let page: string | undefined;
    do {
      const u = new URL(url);
      if (page) u.searchParams.set('pageToken', page);
      const response = await request(u.toString());
      if (response.status === 410) throw new Error('Google no longer has this event. Sync the calendar again.');
      const data = await response.json();
      result.push(...(data.items ?? [])); page = data.nextPageToken;
    } while (page);
    return result;
  };
  const matches = (await list(`${base}?${new URLSearchParams({ iCalUID: uid, maxResults: '250', showDeleted: 'false' })}`))
    .filter(e => e.iCalUID === uid && e.status !== 'cancelled');
  if (!matches.length) throw new GoogleNotHereError('Google could not find this event in your connected calendars. Sync again; nothing was changed.');
  // A repeating event that has occurrences edited in Google lists those
  // exceptions under the same iCalUID next to the series. The series is the
  // one with a rule; its `instances` then include the edited occurrences.
  const masters = matches.filter(e => e.recurrence?.length);
  const found = matches.length === 1 ? matches[0] : (originalStart || series) && masters.length === 1 ? masters[0] : null;
  if (!found) throw new Error('Could not identify one matching Google event. Sync again; nothing was changed.');
  let target = found;
  if (series) {
    // The master event: a write to it reaches every occurrence in Google.
    if (!target.recurrence?.length) throw new Error('This is not a repeating Google event. Sync again; nothing was changed.');
  } else if (originalStart) {
    if (!target.recurrence?.length) throw new Error('The Google series has changed. Sync again; nothing was changed.');
    const instances = (await list(`${base}/${encodeURIComponent(target.id)}/instances?${new URLSearchParams({ originalStart, showDeleted: 'false', maxResults: '250' })}`))
      .filter(e => e.status !== 'cancelled' && (e.originalStartTime?.dateTime
        ? Date.parse(e.originalStartTime.dateTime) === Date.parse(originalStart)
        : e.originalStartTime?.date === originalStart.slice(0, 10)));
    if (instances.length !== 1) throw new Error('Could not identify this occurrence. Sync again; nothing was changed.');
    target = instances[0];
  } else if (target.recurrence?.length) {
    throw new Error('This import refers to a series. Sync again to select an individual occurrence.');
  }
  const url = `${base}/${encodeURIComponent(target.id)}?sendUpdates=none`;
  const ifMatch: Record<string, string> = target.etag ? { 'If-Match': target.etag } : {};
  return { request, url, ifMatch };
}

export async function deleteGoogleOccurrence(options: TargetOptions): Promise<void> {
  const { request, url, ifMatch } = await googleTarget(options, 'delete');
  await request(url, { method: 'DELETE', headers: ifMatch });
}

export type GoogleEventPatch = { title?: string; location?: string; starts_at?: string; ends_at?: string; all_day?: boolean };

/** Writes an edit made in Sorro back to Google. The next sync then mirrors it. */
export async function patchGoogleOccurrence(options: TargetOptions & { patch: GoogleEventPatch }): Promise<void> {
  const { patch } = options;
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.summary = patch.title;
  if (patch.location !== undefined) body.location = patch.location;
  const when = (iso: string) => patch.all_day ? { date: iso.slice(0, 10), dateTime: null } : { dateTime: iso, date: null };
  if (patch.starts_at) body.start = when(patch.starts_at);
  if (patch.ends_at) body.end = when(patch.ends_at);
  if (!Object.keys(body).length) return;
  const { request, url, ifMatch } = await googleTarget(options, 'edit');
  await request(url, { method: 'PATCH', headers: { ...ifMatch, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
