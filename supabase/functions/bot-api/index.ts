/**
 * Sorro bot API — a token-gated way for outside bots (Grok) to read and
 * write one user's tasks and calendar without signing in through Google.
 *
 * One POST endpoint, `{ action, ... }` in the body, `x-bot-token` header.
 * Deployed with --no-verify-jwt because the token, not a Supabase JWT, is the
 * credential. The function holds the service role, so every query below pins
 * `user_id` to BOT_API_USER_ID by hand; nothing else scopes it.
 *
 * Nothing is erased. A bot that gets confused or prompt-injected can add or edit
 * rows, and `delete_event` only moves an event to the bin (`restore_event` or the
 * app brings it back). Every change is visible in the app. Revoke by changing
 * BOT_API_TOKEN.
 *
 * Events the Google Calendar sync mirrors (`source: gcal_ics`) are read-only
 * here: the next sync would overwrite an edit. `list_events` returns each
 * event's `source` and an `editable` flag so the bot can tell.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleMcp } from './mcp.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const TASK_FIELDS = ['title', 'notes', 'due_on', 'due_at', 'priority', 'stars', 'list_id', 'done'];
const EVENT_FIELDS = ['title', 'starts_at', 'ends_at', 'all_day', 'location', 'color', 'remind_minutes'];

/** Rows the Google Calendar sync owns. */
const MIRROR = 'gcal_ics';

const pick = (src: unknown, keys: string[]) => {
  const out: Record<string, unknown> = {};
  if (src && typeof src === 'object') {
    for (const k of keys) if (k in src) out[k] = (src as Record<string, unknown>)[k];
  }
  return out;
};

async function sameSecret(a: string, b: string) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const mcp = url.pathname.endsWith('/mcp');
  if (req.method !== 'POST' && !mcp) return json({ ok: false, message: 'POST only' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Same lookup as gemini-bot: platform secret first, then the app_secrets table.
  const secrets = new Map<string, string>();
  {
    const { data } = await db.from('app_secrets').select('name,value').in('name', ['BOT_API_TOKEN', 'BOT_API_USER_ID', 'BOT_MCP_TOKEN']);
    for (const row of data ?? []) secrets.set(row.name, row.value);
  }
  const secret = (n: string) => Deno.env.get(n) ?? secrets.get(n) ?? '';

  const uid = secret('BOT_API_USER_ID');

  // /bot-api/mcp is Claude's notebook connector. Its own token, so the Grok
  // token never reaches notes and either can be revoked alone. claude.ai
  // connectors cannot send headers, so the key may come in the URL as ?key=.
  if (mcp) {
    const mcpToken = secret('BOT_MCP_TOKEN');
    if (!mcpToken || !uid) return json({ ok: false, message: 'MCP is not configured' }, 503);
    const given = url.searchParams.get('key') ?? req.headers.get('authorization')?.replace(/^Bearer /i, '') ?? '';
    if (!(await sameSecret(given, mcpToken))) return json({ ok: false, message: 'Forbidden' }, 403);
    return handleMcp(req, db, uid);
  }

  const token = secret('BOT_API_TOKEN');
  if (!token || !uid) return json({ ok: false, message: 'Bot API is not configured' }, 503);
  if (!(await sameSecret(req.headers.get('x-bot-token') ?? '', token))) {
    return json({ ok: false, message: 'Forbidden' }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, message: 'Body must be JSON' }, 400); }
  const { action, id, from, to } = body as { action?: string; id?: string; from?: string; to?: string };

  const run = async () => {
    switch (action) {
      case 'list_tasks': {
        let q = db.from('sorro_tasks')
          .select('id,title,notes,done,due_on,due_at,priority,stars,list_id,completed_at,source')
          .eq('user_id', uid).is('deleted_at', null).order('due_on', { nullsFirst: false });
        if (!body.include_done) q = q.eq('done', false);
        if (from) q = q.gte('due_on', from);
        if (to) q = q.lte('due_on', to);
        return q.limit(500);
      }
      case 'create_task': {
        const row = pick(body.task, TASK_FIELDS);
        if (typeof row.title !== 'string' || !row.title.trim()) return { data: null, error: { message: 'task.title is required' } };
        return db.from('sorro_tasks')
          .insert({ ...row, id: crypto.randomUUID(), user_id: uid, position: Date.now() % 2_000_000_000 })
          .select().single();
      }
      case 'update_task': {
        const patch = pick(body.patch, TASK_FIELDS);
        // Keep completed_at in step with done, the way COMPLETE in lib/tasks.ts does.
        if ('done' in patch) patch.completed_at = patch.done ? new Date().toISOString() : null;
        return db.from('sorro_tasks').update(patch).eq('id', id).eq('user_id', uid).select().single();
      }
      case 'list_events': {
        if (!from || !to) return { data: null, error: { message: 'from and to are required (ISO timestamps)' } };
        const r = await db.from('sorro_events')
          .select('id,title,starts_at,ends_at,all_day,location,color,remind_minutes,source')
          .eq('user_id', uid).is('deleted_at', null)
          .lt('starts_at', to).gt('ends_at', from).order('starts_at').limit(500);
        return { data: r.data?.map(e => ({ ...e, editable: e.source !== MIRROR })) ?? null, error: r.error };
      }
      case 'create_event': {
        const row = pick(body.event, EVENT_FIELDS);
        if (!row.title || !row.starts_at || !row.ends_at) {
          return { data: null, error: { message: 'event.title, starts_at and ends_at are required' } };
        }
        // `source` must be one the table allows: 'app' was rejected by its check, so no bot event was ever saved.
        // With event.key, sending the same event again updates it instead of adding a copy (a retried request).
        const key = typeof (body.event as { key?: unknown })?.key === 'string' ? `bot:${(body.event as { key: string }).key.slice(0, 120)}` : null;
        const full = { color: '#38D6F2', ...row, user_id: uid, source: 'manual', external_id: key, deleted_at: null };
        if (key) return db.from('sorro_events').upsert(full, { onConflict: 'user_id,source,external_id' }).select().single();
        return db.from('sorro_events').insert({ ...full, id: crypto.randomUUID() }).select().single();
      }
      case 'update_event': {
        // Google Calendar rows are a mirror the next sync overwrites; every other event can be edited.
        return db.from('sorro_events').update(pick(body.patch, EVENT_FIELDS))
          .eq('id', id).eq('user_id', uid).neq('source', MIRROR).is('deleted_at', null)
          .select().single();
      }
      case 'delete_event': {
        // To the bin, not erased: the app's bin and restore_event bring it back.
        return db.from('sorro_events').update({ deleted_at: new Date().toISOString() })
          .eq('id', id).eq('user_id', uid).neq('source', MIRROR).is('deleted_at', null)
          .select('id,title,starts_at').single();
      }
      case 'restore_event': {
        return db.from('sorro_events').update({ deleted_at: null })
          .eq('id', id).eq('user_id', uid).not('deleted_at', 'is', null)
          .select('id,title,starts_at').single();
      }
      default:
        return { data: null, error: { message: `Unknown action ${action}` } };
    }
  };

  const { data, error } = await run();
  if (error) return json({ ok: false, message: error.message }, 400);
  return json({ ok: true, data });
});
