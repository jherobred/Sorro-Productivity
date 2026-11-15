/**
 * Sorro sync — the server side of Settings → Connections.
 *
 * Runs with the *caller's* JWT rather than the service role, so row-level
 * security is still the thing protecting the data: this function can only ever
 * read the sorro_integrations row belonging to whoever invoked it, and can only
 * write rows it stamps with that same user_id.
 *
 * Two reasons this exists at all instead of fetching from the browser:
 *   - Canvas LMS sends no CORS headers, and its access token must never be in a
 *     client bundle.
 *   - Google Calendar's ICS endpoint also sends no CORS headers, and the OAuth
 *     alternative needs a refresh token Supabase does not keep.
 *
 * Everything written carries `source` + `external_id`, and the unique indexes on
 * sorro_events / sorro_tasks / sorro_notifications make a re-sync idempotent.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { readCalendar } from './ics.ts';

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

  let kind = '';
  try { kind = (await req.json()).kind ?? ''; } catch { /* empty body */ }
  if (kind !== 'canvas_lms' && kind !== 'gcal_ics') return fail('Unknown integration');

  // Together, not one after the other. Validating the JWT and reading the
  // settings row are two round trips out of this function that do not depend
  // on each other, and the caller is waiting through both. The read is safe to
  // start before the user is known: RLS scopes it to whoever the JWT says it
  // is, so an invalid token returns nothing and the check below still refuses.
  const [{ data: userData }, { data: row }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('sorro_integrations').select('config,enabled').eq('kind', kind).maybeSingle(),
  ]);

  const user = userData?.user;
  if (!user) return fail('Not signed in', 401);
  if (!row) return fail('Not connected');
  if (!row.enabled) return fail('Turned off in settings');

  const config = (row.config ?? {}) as Record<string, string>;

  try {
    const result = kind === 'canvas_lms'
      ? await syncCanvas(supabase, user.id, config)
      : await syncIcs(supabase, user.id, config);

    await supabase.from('sorro_integrations')
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq('kind', kind);

    return json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from('sorro_integrations').update({ last_error: message.slice(0, 300) }).eq('kind', kind);
    return fail(message, 200); // 200 so the client reads the message rather than a generic edge error
  }
});

/**
 * Both integrations fetch a URL the user typed into Settings, so the target is
 * theirs to choose — including, if nothing stops them, the metadata service or
 * an internal host that would otherwise never see a request from this project.
 * This blocks the obvious targets by hostname/IP literal.
 *
 * ponytail: hostname-only check, not a DNS-rebinding-proof one — a name that
 * resolves to a public IP now and a private one at fetch time slips through.
 * Upgrade path: resolve the hostname and check the resulting address instead.
 */
function isBlockedHost(urlStr: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(urlStr).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return true;
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return true;
  const v4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, incl. the 169.254.169.254 metadata endpoint
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (hostname === '::1' || hostname.startsWith('fe80') || hostname.startsWith('fc') || hostname.startsWith('fd')) return true;
  return false;
}

/**
 * fetch, with every redirect hop checked before it is followed. Checking only
 * the address the user typed is not enough: the default `redirect: 'follow'`
 * will happily bounce an allowed public URL onwards to 169.254.169.254, which
 * is the usual way a host filter gets walked around. Deno returns the real
 * response for `redirect: 'manual'` rather than the browser's opaque one, so
 * the Location header is readable here and each hop can be re-checked.
 *
 * Authorization is dropped the moment the host changes — otherwise a redirect
 * to any attacker-controlled host walks off with the user's Canvas token.
 */
async function safeFetch(url: string, init: RequestInit, headers: Record<string, string>, hops = 5): Promise<Response> {
  let target = url;
  const sent = { ...headers };
  for (let i = 0; i <= hops; i++) {
    if (isBlockedHost(target)) throw new Error('That address points at a private host');
    const res = await fetch(target, { ...init, headers: sent, redirect: 'manual' });
    if (res.status < 300 || res.status > 399) return res;
    const loc = res.headers.get('location');
    if (!loc) return res;
    const next = new URL(loc, target);
    if (next.protocol !== 'https:') throw new Error('That address redirected somewhere that is not https');
    if (next.host !== new URL(target).host) delete sent.Authorization;
    target = next.toString();
  }
  throw new Error('That address redirected too many times');
}

/* ------------------------------------------------------------------ Canvas */

type Course = { id: number; name: string };
/** `posted_at` is null while an announcement is scheduled but not yet released. */
type Announcement = { id: number; title: string; message: string; posted_at: string | null; html_url: string; context_code: string };
type Assignment = { id: number; name: string; due_at: string | null; html_url: string; description: string };

async function syncCanvas(db: SupabaseClient, user_id: string, config: Record<string, string>) {
  const base = (config.base_url ?? '').trim().replace(/\/+$/, '');
  const token = (config.token ?? '').trim();
  if (!/^https:\/\//.test(base)) throw new Error('Canvas address must start with https://');
  if (isBlockedHost(base)) throw new Error('Canvas address must be a public URL');
  if (!token) throw new Error('Missing access token');

  const get = async <T>(path: string): Promise<T> => {
    const res = await safeFetch(`${base}/api/v1${path}`, {
      // A Canvas that accepts the connection and never answers would otherwise
      // hold this function open until the platform kills it — and the fifty
      // per-course calls below run concurrently, so one slow host stalls them all.
      signal: AbortSignal.timeout(20_000),
    }, { Authorization: `Bearer ${token}` });
    if (res.status === 401) throw new Error('Canvas rejected the token — generate a new one');
    if (!res.ok) throw new Error(`Canvas returned ${res.status} for ${path.split('?')[0]}`);
    return res.json() as Promise<T>;
  };

  /**
   * Every page of a list, up to `pages` of them. Canvas pages with a Link
   * header; a list read with one request stops at the first page, which for
   * announcements was the oldest ones. The next link is only followed on the
   * same Canvas API, so the header cannot send the token anywhere else.
   */
  const getAll = async <T>(path: string, pages = 5): Promise<T[]> => {
    const out: T[] = [];
    let url: string | null = `${base}/api/v1${path}`;
    for (let i = 0; i < pages && url; i++) {
      const res = await safeFetch(url, { signal: AbortSignal.timeout(20_000) }, { Authorization: `Bearer ${token}` });
      if (res.status === 401) throw new Error('Canvas rejected the token — generate a new one');
      if (!res.ok) throw new Error(`Canvas returned ${res.status} for ${path.split('?')[0]}`);
      out.push(...await res.json() as T[]);
      const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') ?? '')?.[1] ?? null;
      url = next && next.startsWith(`${base}/api/v1/`) ? next : null;
    }
    return out;
  };

  const courses = await get<Course[]>('/courses?enrollment_state=active&per_page=50');
  if (!courses.length) return { imported: 0, message: 'No active courses found' };

  const codes = courses.map((c) => `context_codes[]=course_${c.id}`).join('&');
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  // Canvas ends the window 28 days after start_date unless told otherwise, so a
  // 30-day look back silently left out the newest two days of announcements —
  // exactly the ones worth seeing. It ends tomorrow now.
  const until = new Date(Date.now() + 864e5).toISOString();
  const nameOf = new Map(courses.map((c) => [`course_${c.id}`, c.name]));

  // Announcements → the bell and the Home pane.
  // Assignments with a due date → tasks, so they group with everything else.
  //
  // One leg, not two. Both only need `courses`, and neither reads the other, so
  // awaiting the announcements first bought nothing and cost a whole extra
  // Canvas round trip — on a campus network, in a function the phone is
  // blocked on. Everything below still runs to the same list.
  const [anns, perCourse] = await Promise.all([
    getAll<Announcement>(`/announcements?${codes}&start_date=${since}&end_date=${until}&per_page=50`),
    Promise.all(
      courses.map((c) =>
        get<Assignment[]>(`/courses/${c.id}/assignments?bucket=upcoming&per_page=50`)
          .then((list) => list.map((a) => ({ a, course: c.name })))
          // One broken course must not sink the whole sync.
          .catch(() => [] as { a: Assignment; course: string }[])),
    ),
  ]);

  const notifs = anns.map((a) => ({
    user_id,
    kind: 'canvas',
    title: a.title,
    body: `${nameOf.get(a.context_code) ?? 'Canvas'} · ${stripHtml(a.message).slice(0, 200)}`,
    href: a.html_url,
    source: 'canvas_lms',
    external_id: `ann_${a.id}`,
    // An announcement scheduled but not yet released has no posted_at, and a
    // null in this column takes the whole batch down with it — one unposted
    // announcement would have failed every sync until somebody released it.
    created_at: a.posted_at ?? new Date().toISOString(),
  }));

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
    const { error } = await db.from('sorro_notifications')
      .upsert(notifs, { onConflict: 'user_id,source,external_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    imported += notifs.length;
  }
  if (tasks.length) {
    // Not ignoreDuplicates: a moved deadline should update the existing task.
    const { error } = await db.from('sorro_tasks').upsert(tasks, { onConflict: 'user_id,source,external_id' });
    if (error) throw new Error(error.message);
    imported += tasks.length;
  }

  return { imported, message: `${anns.length} announcements, ${tasks.length} assignments` };
}

const stripHtml = (s: string) => (s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/* --------------------------------------------------------------------- ICS */

/** Up to three addresses, one per Google account. Read together so that what
    one calendar has is never cleared as "gone" by another calendar's sync. */
async function syncIcs(db: SupabaseClient, user_id: string, config: Record<string, string>) {
  const urls = [config.ics_url, config.ics_url_2, config.ics_url_3].map((u) => (u ?? '').trim()).filter(Boolean);
  if (!urls.length) throw new Error('The iCal address must start with https://');
  const from = Date.now() - 30 * 864e5;
  const to = Date.now() + 180 * 864e5;
  const feeds = await Promise.all(urls.map((url) => readIcs(url, from, to)));
  // The same meeting on two connected calendars has one UID: keep it once.
  const byId = new Map<string, ReturnType<typeof readCalendar>[number]>();
  for (const e of feeds.flat()) if (!byId.has(e.externalId)) byId.set(e.externalId, e);
  return storeIcs(db, user_id, [...byId.values()], from, to);
}

async function readIcs(url: string, from: number, to: number) {
  if (!/^https:\/\//.test(url)) throw new Error('The iCal address must start with https://');
  if (isBlockedHost(url)) throw new Error('The iCal address must be a public URL');

  const res = await safeFetch(url, {
    signal: AbortSignal.timeout(20_000),
  }, { Accept: 'text/calendar' });
  if (!res.ok) throw new Error(`Calendar returned ${res.status} — check the secret address`);
  // The address is whatever the user typed, so the body is an untrusted size.
  // 20MB is a decade of a busy calendar; anything larger is not one.
  if (Number(res.headers.get('content-length')) > 20_000_000) {
    throw new Error('That calendar is too large to import');
  }
  const text = await res.text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('That address did not return a calendar');
  // Only the window the app actually renders, so a decade-old calendar does not
  // dump thousands of rows into the events table.
  return readCalendar(text, from, to);
}

async function storeIcs(db: SupabaseClient, user_id: string, events: ReturnType<typeof readCalendar>, from: number, to: number) {
  // The feed has no colors. The app puts Google's own on the rows (lib/googleColorSync.ts), so a row keeps the one it has.
  const colors = new Map<string, string>();
  for (let at = 0; ; at += 1000) {
    const { data, error } = await db.from('sorro_events').select('external_id,color')
      .eq('user_id', user_id).eq('source', 'gcal_ics').order('id').range(at, at + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) if (r.color) colors.set(r.external_id, r.color);
    if ((data ?? []).length < 1000) break;
  }
  const all = events
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => ({
      user_id,
      title: e.summary || 'Untitled',
      starts_at: e.start,
      ends_at: e.end,
      all_day: e.allDay,
      location: e.location ?? '',
      color: colors.get(e.externalId) ?? '#38BDF8',
      source: 'gcal_ics',
      external_id: e.externalId,
      // A meeting deleted in Google and then restored there comes back here too.
      deleted_at: null,
    }));
  // One upsert, one statement: a calendar with tens of thousands of events
  // inside the window would make a single request Postgres refuses whole, and
  // nothing would import at all. Six months of a full calendar is far under this,
  // and past it the soonest are the ones kept.
  const rows = all.slice(0, 2000);

  if (rows.length) {
    const { error } = await db.from('sorro_events').upsert(rows, { onConflict: 'user_id,source,external_id' });
    if (error) throw new Error(error.message);
  }

  // What Google no longer has in the window goes from here as well, as a soft
  // delete like any other. Before repeating events were read, a weekly class
  // was one row keyed by its UID; those rows are among what this clears.
  const keep = new Set(all.map((r) => r.external_id));
  const { data: mine, error: readError } = await db.from('sorro_events')
    .select('id,external_id')
    .eq('source', 'gcal_ics')
    .is('deleted_at', null)
    .gte('starts_at', new Date(from).toISOString())
    .lt('starts_at', new Date(to).toISOString());
  if (readError) throw new Error(readError.message);
  const gone = (mine ?? []).filter((r) => !keep.has(r.external_id)).map((r) => r.id);
  for (let i = 0; i < gone.length; i += 100) {
    const { error } = await db.from('sorro_events').update({ deleted_at: new Date().toISOString() }).in('id', gone.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }

  if (!rows.length) return { imported: 0, message: gone.length ? `Cleared ${gone.length} events Google no longer has` : 'No events in the next six months' };
  return { imported: rows.length, message: `${rows.length} events` };
}

