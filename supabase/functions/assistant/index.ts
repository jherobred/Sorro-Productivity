/**
 * Sorro's assistant: Gemini with tools over the user's own tasks, events, notes and news.
 *
 * Runs with the caller's JWT, so row-level security decides what it can read and
 * write; the Gemini key stays here. Every write comes back with an undo record
 * the app can play to reverse it.
 *
 * POST { chat_id?, message, context? } → { chat_id, text, tools: [{ name, label, undo? }] }
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { TOOLS, WRITES, validateArgs, freeSlots } from './tools.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash';
const ROUNDS = 6;

type Part = { text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } };
type Content = { role: 'user' | 'model'; parts: Part[] };
export type Undo = { table: 'sorro_tasks' | 'sorro_events' | 'sorro_notes'; id: string; action: 'delete' | 'uncomplete' | 'restore_body'; body?: string };
type Done = { name: string; label: string; undo?: Undo; link?: string };

function dayIn(tz: string, offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

async function run(db: SupabaseClient, uid: string, tz: string, name: string, raw: Record<string, unknown>): Promise<{ result: unknown; done?: Done }> {
  const checked = validateArgs(name, raw ?? {});
  if (!checked.ok) return { result: { error: checked.error } };
  const a = checked.value;
  const today = dayIn(tz);
  switch (name) {
    case 'create_task': {
      let list_id: string | null = null;
      if (typeof a.list === 'string') {
        const { data } = await db.from('sorro_lists').select('id').ilike('name', a.list).limit(1).maybeSingle();
        list_id = data?.id ?? null;
      }
      const { data, error } = await db.from('sorro_tasks').insert({ user_id: uid, title: a.title, notes: a.notes ?? '', due_on: a.due_on ?? null, priority: a.priority ?? null, list_id, position: 0 }).select('id,title,due_on').single();
      if (error) return { result: { error: error.message } };
      return { result: data, done: { name, label: `Added task “${data.title}”${data.due_on ? `, due ${data.due_on}` : ''}`, undo: { table: 'sorro_tasks', id: data.id, action: 'delete' }, link: '/tasks/' } };
    }
    case 'list_tasks': {
      let q = db.from('sorro_tasks').select('id,title,due_on,priority,notes').eq('done', false).is('deleted_at', null).order('due_on', { ascending: true, nullsFirst: false }).limit(40);
      if (a.range === 'today') q = q.lte('due_on', today);
      if (a.range === 'week') q = q.lte('due_on', dayIn(tz, 7));
      if (a.range === 'overdue') q = q.lt('due_on', today);
      const { data, error } = await q;
      return { result: error ? { error: error.message } : { today, tasks: data } };
    }
    case 'complete_task': {
      const { data, error } = await db.from('sorro_tasks').update({ done: true, completed_at: new Date().toISOString() }).eq('id', a.id).select('id,title').single();
      if (error) return { result: { error: 'No such task.' } };
      return { result: data, done: { name, label: `Completed “${data.title}”`, undo: { table: 'sorro_tasks', id: data.id, action: 'uncomplete' }, link: '/tasks/' } };
    }
    case 'create_event': {
      const { data, error } = await db.from('sorro_events').insert({ user_id: uid, title: a.title, starts_at: a.starts_at, ends_at: a.ends_at, location: a.location ?? null }).select('id,title,starts_at').single();
      if (error) return { result: { error: error.message } };
      const when = new Intl.DateTimeFormat('en-PH', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(data.starts_at));
      return { result: data, done: { name, label: `Added “${data.title}”, ${when}`, undo: { table: 'sorro_events', id: data.id, action: 'delete' }, link: '/calendar/' } };
    }
    case 'list_events': {
      const { data, error } = await db.from('sorro_events').select('id,title,starts_at,ends_at,location,all_day').is('deleted_at', null)
        .gte('starts_at', `${a.from}T00:00:00`).lte('starts_at', `${a.to}T23:59:59`).order('starts_at').limit(80);
      return { result: error ? { error: error.message } : { events: data } };
    }
    case 'find_free_time': {
      const { data } = await db.from('sorro_events').select('starts_at,ends_at,all_day').is('deleted_at', null)
        .lte('starts_at', `${a.date}T23:59:59+08:00`).gte('ends_at', `${a.date}T00:00:00+08:00`);
      const mins = (iso: string) => { const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)).split(':').map(Number); return h * 60 + m; };
      const busy = (data ?? []).filter(e => !e.all_day).map(e => [mins(e.starts_at), Math.max(mins(e.starts_at), mins(e.ends_at))] as [number, number]);
      const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      return { result: { date: a.date, free: freeSlots(busy, Number(a.minutes)).map(([s, e]) => `${fmt(s)}-${fmt(e)}`) } };
    }
    case 'search_notes': {
      const like = `%${String(a.query).replace(/[%_]/g, '')}%`;
      const { data } = await db.from('sorro_notes').select('id,title,body,updated_at').is('deleted_at', null).or(`title.ilike.${like},body.ilike.${like}`).order('updated_at', { ascending: false }).limit(8);
      // Bodies are cut short: enough to answer from, not the whole notebook.
      return { result: { notes: (data ?? []).map(n => ({ id: n.id, title: n.title, excerpt: n.body.replace(/<!--[\s\S]*?-->/g, '').slice(0, 1200) })) } };
    }
    case 'create_note': {
      let q = db.from('sorro_notebooks').select('id,name').is('deleted_at', null).order('position').limit(1);
      if (typeof a.notebook === 'string') q = db.from('sorro_notebooks').select('id,name').is('deleted_at', null).ilike('name', a.notebook).limit(1);
      const { data: book } = await q.maybeSingle();
      if (!book) return { result: { error: 'There is no notebook to put it in. Ask the user to make one first.' } };
      const { data, error } = await db.from('sorro_notes').insert({ user_id: uid, notebook_id: book.id, title: a.title, body: a.body, position: 0 }).select('id,title').single();
      if (error) return { result: { error: error.message } };
      return { result: data, done: { name, label: `Wrote “${data.title}” in ${book.name}`, undo: { table: 'sorro_notes', id: data.id, action: 'delete' }, link: `/notebooks/?note=${data.id}` } };
    }
    case 'append_note': {
      const { data: note } = await db.from('sorro_notes').select('id,title,body').eq('id', a.id).maybeSingle();
      if (!note) return { result: { error: 'No such note.' } };
      const { error } = await db.from('sorro_notes').update({ body: `${note.body.trimEnd()}\n\n${a.text}` }).eq('id', note.id);
      if (error) return { result: { error: error.message } };
      return { result: { id: note.id, title: note.title }, done: { name, label: `Added to “${note.title}”`, undo: { table: 'sorro_notes', id: note.id, action: 'restore_body', body: note.body }, link: `/notebooks/?note=${note.id}` } };
    }
    case 'read_news': {
      const { data } = await db.from('sorro_news').select('kind,title,items').eq('edition', a.date ?? today).limit(20);
      return { result: { date: a.date ?? today, segments: data ?? [] } };
    }
  }
  return { result: { error: 'Unknown tool' } };
}

async function gemini(key: string, system: string, contents: Content[]) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: [{ functionDeclarations: TOOLS }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (res.status === 429) throw Object.assign(new Error('rate_limited'), { status: 429, retry: res.headers.get('retry-after') });
  if (!res.ok) throw Object.assign(new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`), { status: 502 });
  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts ?? []) as Part[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const auth = req.headers.get('Authorization') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: who } = await db.auth.getUser();
  if (!who?.user) return json({ error: 'signed_out' }, 401);
  const uid = who.user.id;

  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return json({ error: 'no_key', message: 'The assistant needs a Gemini key. Set GEMINI_API_KEY in Supabase secrets.' }, 503);

  let body: { chat_id?: string; message?: string; context?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const message = (body.message ?? '').trim();
  if (!message || message.length > 8000) return json({ error: 'bad_request', message: 'Say something, under 8000 characters.' }, 400);

  const { data: profile } = await db.from('sorro_profiles').select('timezone, name').eq('user_id', uid).maybeSingle();
  const tz = profile?.timezone || 'Asia/Manila';

  let chatId = body.chat_id ?? null;
  if (!chatId) {
    const { data, error } = await db.from('sorro_chats').insert({ user_id: uid, title: message.slice(0, 60) }).select('id').single();
    if (error) return json({ error: 'save_failed' }, 500);
    chatId = data.id;
  }
  const { data: past } = await db.from('sorro_chat_messages').select('role,content').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(16);
  const contents: Content[] = (past ?? []).reverse().map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
  contents.push({ role: 'user', parts: [{ text: body.context ? `${message}\n\n(Context: ${body.context})` : message }] });

  const now = new Intl.DateTimeFormat('en-PH', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' }).format(new Date());
  const system = `You are Sorro, the assistant inside ${profile?.name ? profile.name + "'s" : "the user's"} notes, calendar and tasks app. It is ${now} (${tz}). ` +
    'Use the tools to read and change their data; never invent tasks, events or notes. Confirm what you changed in one short sentence. ' +
    'Prefer doing over asking when the request is clear; ask one question when a date or title is missing. Answer in plain sentences, no emoji.';

  const done: Done[] = [];
  let text = '';
  try {
    for (let round = 0; round < ROUNDS; round++) {
      const parts = await gemini(key, system, contents);
      const calls = parts.filter(p => p.functionCall);
      text = parts.map(p => p.text ?? '').join('').trim();
      if (!calls.length) break;
      contents.push({ role: 'model', parts });
      const responses: Part[] = [];
      for (const c of calls) {
        const { result, done: d } = await run(db, uid, tz, c.functionCall!.name, c.functionCall!.args ?? {});
        if (d && WRITES.has(d.name)) done.push(d);
        responses.push({ functionResponse: { name: c.functionCall!.name, response: { result } } });
      }
      contents.push({ role: 'user', parts: responses });
    }
  } catch (e) {
    const err = e as Error & { status?: number; retry?: string | null };
    return json({ error: err.status === 429 ? 'rate_limited' : 'model_failed', retry: err.retry ?? null, chat_id: chatId, tools: done }, err.status ?? 502);
  }

  await db.from('sorro_chat_messages').insert([
    { chat_id: chatId, user_id: uid, role: 'user', content: message },
    { chat_id: chatId, user_id: uid, role: 'assistant', content: text, tools: done },
  ]);
  await db.from('sorro_chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
  return json({ chat_id: chatId, text, tools: done });
});
