/** Google API event IDs are not iCal UIDs. Resolve the exact occurrence first. */
export type GoogleEvent = {
  id: string; etag?: string; iCalUID?: string; recurrence?: string[]; status?: string;
  originalStartTime?: { dateTime?: string; date?: string };
};
export class GoogleAuthorizationError extends Error {}

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
      throw new Error(response.status === 403 ? `Google refused to ${verb} this event. Check that you have edit access to this calendar.`
        : response.status === 412 ? `This event changed in Google. Sync again before you ${verb} it.`
        : response.status === 404 ? 'Google could not find this calendar or event. Check the connected Google account, then sync again.'
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
  if (matches.length !== 1) throw new Error('Could not identify one matching Google event. Sync again; nothing was changed.');
  let target = matches[0];
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

/** Writes an edit made in Basedly back to Google. The next sync then mirrors it. */
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
