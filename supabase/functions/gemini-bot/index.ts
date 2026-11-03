/**
 * Sorro's bot, server side.
 *
 * Three jobs on three clocks, invoked by pg_cron (see the schedule at the
 * bottom of this file):
 *
 *   tips      every 2 hours   one short, concrete thing the app can do
 *   news      every 5 hours   a campus/student-life item, written like a feed post
 *   challenge weekly          one or two fun-but-productive challenges
 *
 * Runs with the service role, because it writes as a user that nobody signs in
 * as. That is the one place in this codebase where RLS is bypassed, so the
 * function is deliberately narrow: it only ever inserts, only into three
 * tables, and only ever as BOT_ID. It reads nothing belonging to anyone.
 *
 * The model is asked for JSON and its answer is validated before it reaches
 * the database. A model that returns prose, or a challenge that would run for
 * a year, is dropped rather than posted.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BOT_ID = '00000000-0000-4000-8000-00000000b07d';
const MODEL = 'gemini-3.6-flash';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Mode = 'tips' | 'news' | 'challenge';

/** What each mode asks for, and how often it may run. */
const JOBS: Record<Mode, { every_minutes: number; tag: string; prompt: string }> = {
  tips: {
    every_minutes: 120,
    tag: 'Tip',
    prompt: `Write one short tip for a student using Sorro.

What Sorro actually does:
- Notes: block editor (slash command for blocks, double square brackets to link
  a note) and a separate infinite canvas of connected cards.
- Calendar: month, week and day views. Tasks can sit in a time slot or stay
  untimed. Connects to Canvas LMS and Google Calendar from Settings.
- Tasks, habits with streaks, projects with boards, a peso money tracker,
  a files drive, and ranked challenges against other students.

Rules: describe a capability and why it helps. Do NOT name a specific button,
tab, menu path or gesture unless it appears in the list above - the interface
changes and a confidently wrong instruction is worse than a vague one. Not
motivational.

Return JSON only: {"title": "...", "body": "..."} where title is under 70
characters and body is one or two sentences.`,
  },
  news: {
    every_minutes: 300,
    tag: 'Campus',
    prompt: `Write one short, useful post for a Philippine university student
audience: study techniques, deadline season survival, scholarship and org
season, commuting, exam logistics, or research and writing craft. Concrete and
practical, the way a well-run campus account posts.

Do not invent news, dates, names, or events — nothing that reads as a factual
report about a real place or person. Timeless and useful only.

Return JSON only: {"title": "...", "body": "..."} where title is under 80
characters and body is two or three sentences.`,
  },
  challenge: {
    every_minutes: 60 * 24 * 7,
    tag: 'Challenge',
    prompt: `Invent one challenge for students that is fun but genuinely
productive — something a group would actually race each other at over a week or
two. It must be measurable by counting one thing.

Return JSON only:
{"name": "...", "description": "...", "habit_label": "...", "unit": "...",
 "rule": "most" | "first_to" | "streak", "target": number | null, "days": 7 | 14}

name under 40 characters, description one or two sentences, unit a plural noun
like "sessions" or "pages", target only when rule is "first_to".`,
  },
};

const COLORS = ['#7C6CFF', '#38D6F2', '#34D9A0', '#FFC24B', '#FF6B6B', '#FF6FA8', '#B07CFF'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Ask the model, and insist on JSON coming back. */
async function generate(key: string, prompt: string): Promise<Record<string, unknown>> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      // The key goes in a header, not `?key=`. A query string is the one part of
      // a request that proxies, error reports and platform logs write down.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 1.1, maxOutputTokens: 500 },
      }),
      // Without this a model that never answers holds the function open until
      // the platform kills it, and the cron simply retries into the same wall.
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!res.ok) throw new Error(`Gemini said ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Gemini returned no text');

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned prose, not JSON: ${text.slice(0, 120)}`);
  }
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && t.length <= max ? t : null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  /**
   * Secrets live in `app_secrets`, a table with RLS on and no policy — every
   * client role is denied, and the service role this function holds is the only
   * thing that can read it. A platform secret of the same name still wins, so
   * moving to `supabase secrets set` later needs no code change.
   */
  const secrets = new Map<string, string>();
  {
    const { data } = await db.from('app_secrets').select('name,value');
    for (const row of data ?? []) secrets.set(row.name, row.value);
  }
  const secret = (n: string) => Deno.env.get(n) ?? secrets.get(n) ?? '';

  // pg_cron passes this; without it the endpoint is inert to the open internet.
  const cronSecret = secret('BOT_CRON_SECRET');
  if (!cronSecret || req.headers.get('x-bot-secret') !== cronSecret) {
    return json({ ok: false, message: 'Forbidden' }, 403);
  }

  const key = secret('GEMINI_API_KEY');
  if (!key) return json({ ok: false, message: 'GEMINI_API_KEY is not set' }, 503);

  let mode: Mode = 'tips';
  try { mode = (await req.json()).mode ?? 'tips'; } catch { /* empty body */ }
  // hasOwn, not `JOBS[mode]` truthiness: 'constructor' and '__proto__' are
  // truthy lookups on any object and would reach `generate` with no prompt.
  if (!Object.hasOwn(JOBS, mode)) return json({ ok: false, message: `Unknown mode ${mode}` }, 400);
  const job = JOBS[mode];

  // A retrying cron, or two overlapping schedules, must not double-post. The
  // window is the job's own interval, less a couple of minutes of slack.
  const since = new Date(Date.now() - (job.every_minutes - 3) * 60_000).toISOString();
  const recent = mode === 'challenge'
    ? db.from('bd_challenges').select('id', { count: 'exact', head: true }).eq('owner_id', BOT_ID)
    : db.from('bd_threads').select('id', { count: 'exact', head: true }).eq('author_id', BOT_ID).eq('tag', job.tag);
  const { count } = await recent.gte('created_at', since);
  if ((count ?? 0) > 0) return json({ ok: true, posted: 0, message: 'Already posted this window' });

  let out: Record<string, unknown>;
  try {
    out = await generate(key, job.prompt);
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : 'Generation failed' }, 502);
  }

  if (mode === 'challenge') {
    const name = str(out.name, 60);
    const unit = str(out.unit, 24) ?? 'times';
    const rule = ['most', 'first_to', 'streak'].includes(String(out.rule)) ? String(out.rule) : 'most';
    const days = Number(out.days) === 14 ? 14 : 7;
    const target = rule === 'first_to' && Number.isFinite(Number(out.target)) && Number(out.target) > 0
      ? Math.min(500, Math.round(Number(out.target)))
      : null;
    if (!name) return json({ ok: false, message: 'Model returned an unusable challenge' }, 502);

    const starts = new Date();
    const ends = new Date(Date.now() + days * 86_400_000);
    const { error } = await db.from('bd_challenges').insert({
      owner_id: BOT_ID,
      name,
      description: str(out.description, 400) ?? '',
      habit_label: str(out.habit_label, 60) ?? name,
      metric: 'habit', rule, target, unit,
      starts_on: starts.toISOString().slice(0, 10),
      ends_on: ends.toISOString().slice(0, 10),
      color: pick(COLORS),
      visibility: 'public',
      // The bot does not compete in its own challenges — a bot at the top of a
      // ladder is not a leaderboard anyone wants to be on.
      ranked: true,
    });
    if (error) return json({ ok: false, message: error.message }, 500);
    return json({ ok: true, posted: 1, mode, name });
  }

  const title = str(out.title, 120);
  const body = str(out.body, 900) ?? '';
  if (!title) return json({ ok: false, message: 'Model returned an unusable post' }, 502);

  const { error } = await db.from('bd_threads')
    .insert({ author_id: BOT_ID, title, body, tag: job.tag });
  if (error) return json({ ok: false, message: error.message }, 500);

  return json({ ok: true, posted: 1, mode, title });
});

/*
 * Scheduling, once the function is deployed and the secrets are set. Run in the
 * SQL editor as the postgres role:
 *
 *   create extension if not exists pg_cron;
 *   create extension if not exists pg_net;
 *
 *   -- Replace <PROJECT_REF> and <BOT_CRON_SECRET>.
 *   select cron.schedule('bot-tips',  '0 star/2 * * *', $$
 *     select net.http_post(
 *       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/gemini-bot',
 *       headers := '{"Content-Type":"application/json","x-bot-secret":"<BOT_CRON_SECRET>"}'::jsonb,
 *       body    := '{"mode":"tips"}'::jsonb);
 *   $$);
 *
 *   select cron.schedule('bot-news', '15 star/5 * * *', $$ … "news" … $$);
 *   select cron.schedule('bot-chal', '30 9 * * MON',    $$ … "challenge" … $$);
 *
 * (`star` above stands for the asterisk, which cannot appear inside this
 * comment block.) Unschedule with `select cron.unschedule('bot-tips');`.
 */
