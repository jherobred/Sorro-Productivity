/**
 * Basedly sync — the server side of Settings → Connections.
 *
 * Runs with the *caller's* JWT rather than the service role, so row-level
 * security is still the thing protecting the data: this function can only ever
 * read the bd_integrations row belonging to whoever invoked it, and can only
 * write rows it stamps with that same user_id.
 *
 * Two reasons this exists at all instead of fetching from the browser:
 *   - Canvas LMS sends no CORS headers, and its access token must never be in a
 *     client bundle.
 *   - Google Calendar's ICS endpoint also sends no CORS headers, and the OAuth
 *     alternative needs a refresh token Supabase does not keep.
 *
 * Everything written carries `source` + `external_id`, and the unique indexes on
 * bd_events / bd_tasks / bd_notifications make a re-sync idempotent.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const fail = (message: string, status = 400) => json({ ok: false, imported: 0, message }, status);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const auth = req.headers.get('Authorization');
  if (!auth) return fail('Not signed in', 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return fail('Not signed in', 401);

  let kind = '';
  try { kind = (await req.json()).kind ?? ''; } catch { /* empty body */ }
  if (kind !== 'canvas_lms' && kind !== 'gcal_ics') return fail('Unknown integration');

  const { data: row } = await supabase
    .from('bd_integrations').select('config,enabled').eq('kind', kind).maybeSingle();
  if (!row) return fail('Not connected');
  if (!row.enabled) return fail('Turned off in settings');

  const config = (row.config ?? {}) as Record<string, string>;

  try {
    const result = kind === 'canvas_lms'
      ? await syncCanvas(supabase, user.id, config)
      : await syncIcs(supabase, user.id, config);

    await supabase.from('bd_integrations')
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq('kind', kind);

    return json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from('bd_integrations').update({ last_error: message.slice(0, 300) }).eq('kind', kind);
    return fail(message, 200); // 200 so the client reads the message rather than a generic edge error
  }
});

/* ------------------------------------------------------------------ Canvas */

type Course = { id: number; name: string };
type Announcement = { id: number; title: string; message: string; posted_at: string; html_url: string; context_code: string };
type Assignment = { id: number; name: string; due_at: string | null; html_url: string; description: string };

async function syncCanvas(db: SupabaseClient, user_id: string, config: Record<string, string>) {
  const base = (config.base_url ?? '').trim().replace(/\/+$/, '');
  const token = (config.token ?? '').trim();
  if (!/^https:\/\//.test(base)) throw new Error('Canvas address must start with https://');
  if (!token) throw new Error('Missing access token');

  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${base}/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw new Error('Canvas rejected the token — generate a new one');
    if (!res.ok) throw new Error(`Canvas returned ${res.status} for ${path.split('?')[0]}`);
    return res.json() as Promise<T>;
  };

  const courses = await get<Course[]>('/courses?enrollment_state=active&per_page=50');
  if (!courses.length) return { imported: 0, message: 'No active courses found' };

  const codes = courses.map((c) => `context_codes[]=course_${c.id}`).join('&');
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const nameOf = new Map(courses.map((c) => [`course_${c.id}`, c.name]));

  // Announcements → the bell and the Home pane.
  const anns = await get<Announcement[]>(`/announcements?${codes}&start_date=${since}&per_page=50`);
  const notifs = anns.map((a) => ({
    user_id,
    kind: 'canvas',
    title: a.title,
    body: `${nameOf.get(a.context_code) ?? 'Canvas'} · ${stripHtml(a.message).slice(0, 200)}`,
    href: a.html_url,
    source: 'canvas_lms',
    external_id: `ann_${a.id}`,
    created_at: a.posted_at,
  }));

  // Assignments with a due date → tasks, so they group with everything else.
  const perCourse = await Promise.all(
    courses.map((c) =>
      get<Assignment[]>(`/courses/${c.id}/assignments?bucket=upcoming&per_page=50`)
        .then((list) => list.map((a) => ({ a, course: c.name })))
        // One broken course must not sink the whole sync.
        .catch(() => [] as { a: Assignment; course: string }[])),
  );

  const tasks = perCourse.flat()
    .filter(({ a }) => a.due_at)
    .map(({ a, course }) => ({
      user_id,
      title: a.name,
      notes: `${course} — ${a.html_url}`,
      due_on: a.due_at!.slice(0, 10),
      due_at: a.due_at,
      priority: 'med',
      stars: 0,
      source: 'canvas_lms',
      external_id: `asg_${a.id}`,
    }));

  let imported = 0;
  if (notifs.length) {
    const { error } = await db.from('bd_notifications')
      .upsert(notifs, { onConflict: 'user_id,source,external_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    imported += notifs.length;
  }
  if (tasks.length) {
    // Not ignoreDuplicates: a moved deadline should update the existing task.
    const { error } = await db.from('bd_tasks').upsert(tasks, { onConflict: 'user_id,source,external_id' });
    if (error) throw new Error(error.message);
    imported += tasks.length;
  }

  return { imported, message: `${anns.length} announcements, ${tasks.length} assignments` };
}

const stripHtml = (s: string) => (s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/* --------------------------------------------------------------------- ICS */

async function syncIcs(db: SupabaseClient, user_id: string, config: Record<string, string>) {
  const url = (config.ics_url ?? '').trim();
  if (!/^https:\/\//.test(url)) throw new Error('The iCal address must start with https://');

  const res = await fetch(url, { headers: { Accept: 'text/calendar' } });
  if (!res.ok) throw new Error(`Calendar returned ${res.status} — check the secret address`);
  const text = await res.text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('That address did not return a calendar');

  // Only the window the app actually renders, so a decade-old calendar does not
  // dump thousands of rows into the events table.
  const from = Date.now() - 30 * 864e5;
  const to = Date.now() + 180 * 864e5;

  const rows = parseIcs(text)
    .filter((e) => {
      const t = new Date(e.start).getTime();
      return Number.isFinite(t) && t > from && t < to;
    })
    .map((e) => ({
      user_id,
      title: e.summary || 'Untitled',
      starts_at: e.start,
      ends_at: e.end ?? e.start,
      all_day: e.allDay,
      location: e.location ?? '',
      color: '#38BDF8',
      source: 'gcal_ics',
      external_id: e.uid,
    }));

  if (!rows.length) return { imported: 0, message: 'No events in the next six months' };

  const { error } = await db.from('bd_events').upsert(rows, { onConflict: 'user_id,source,external_id' });
  if (error) throw new Error(error.message);

  return { imported: rows.length, message: `${rows.length} events` };
}

type IcsEvent = { uid: string; summary: string; start: string; end: string | null; location: string | null; allDay: boolean };

/**
 * Small iCalendar reader — enough of RFC 5545 for what Google publishes: line
 * unfolding, escaped text, and the three DTSTART shapes (UTC, floating with a
 * TZID, and a date-only all-day value).
 */
function parseIcs(text: string): IcsEvent[] {
  // Unfold: a leading space or tab continues the previous line.
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');

  const out: IcsEvent[] = [];
  let cur: Partial<IcsEvent> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur?.uid && cur.start) {
        out.push({
          uid: cur.uid, summary: cur.summary ?? '', start: cur.start,
          end: cur.end ?? null, location: cur.location ?? null, allDay: !!cur.allDay,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const rawName = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const [name, ...params] = rawName.split(';');

    switch (name) {
      case 'UID': cur.uid = value; break;
      case 'SUMMARY': cur.summary = unescapeIcs(value); break;
      case 'LOCATION': cur.location = unescapeIcs(value); break;
      case 'DTSTART': {
        const p = parseIcsDate(value, params);
        cur.start = p.iso;
        cur.allDay = p.allDay;
        break;
      }
      case 'DTEND': cur.end = parseIcsDate(value, params).iso; break;
    }
  }
  return out;
}

const unescapeIcs = (s: string) =>
  s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');

function parseIcsDate(value: string, params: string[]): { iso: string; allDay: boolean } {
  // 20260815 — a date-only all-day value.
  if (/^\d{8}$/.test(value)) {
    return { iso: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`, allDay: true };
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!m) return { iso: new Date(value).toISOString(), allDay: false };
  const [, y, mo, d, h, mi, s, z] = m;

  if (z === 'Z') return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`, allDay: false };

  // Floating time in a named zone. Take the wall-clock reading as if it were
  // UTC, ask Intl what that instant looks like in the zone, and subtract the
  // difference — which is the zone's offset at that date, DST included.
  const tzid = params.find((p) => p.startsWith('TZID='))?.slice(5);
  const naive = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  if (!tzid) return { iso: new Date(naive).toISOString(), allDay: false };

  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tzid, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date(naive)).map((p) => [p.type, p.value]));
    const asZone = Date.UTC(
      +parts.year, +parts.month - 1, +parts.day,
      +parts.hour % 24, +parts.minute, +parts.second,
    );
    return { iso: new Date(naive + (naive - asZone)).toISOString(), allDay: false };
  } catch {
    return { iso: new Date(naive).toISOString(), allDay: false };
  }
}
