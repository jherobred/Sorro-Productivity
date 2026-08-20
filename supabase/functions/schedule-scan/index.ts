/**
 * Read a class schedule out of a photo or screenshot.
 *
 * The client sends one image; this returns the timetable as structured rows.
 * It writes nothing - the browser does that, as the signed-in user, through
 * RLS, after a human has looked at what came back. A model that quietly filled
 * someone's calendar with rows it half-read would be worse than no feature.
 *
 * Accuracy is the whole point here, so this does four things a naive call does
 * not:
 *
 *   1. **Structured output.** `responseSchema` with enums for the day names, so
 *      the model cannot answer "Tues" or "M/W" — the transport itself refuses.
 *   2. **Temperature 0.** Reading is not a creative act.
 *   3. **A second pass.** The first answer is handed back to the model *with
 *      the image* and it is asked to correct anything that does not match.
 *      Transcription errors survive one pass far more often than two.
 *   4. **`raw` per row.** Every row carries the literal text it was read from,
 *      so the review screen can show its work and a person can spot a misread
 *      without opening the picture again.
 *
 * Auth: the caller's own JWT. This burns a paid API key, so it is not open to
 * the internet the way an unauthenticated endpoint would be.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

/** Tried in order; a model the project cannot reach falls through to the next. */
const MODELS = ['gemini-3.6-pro', 'gemini-3.6-flash'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * The shape the model must answer in. Enumerating the days is what stops the
 * long tail of "TTh", "M/W/F", "Tues" and "Thurs" from ever reaching the
 * client — the API rejects anything off this list.
 */
const SCHEMA = {
  type: 'object',
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Subject or class name as written' },
          code: { type: 'string', description: 'Course code if shown, else empty' },
          section: { type: 'string', description: 'Section or block if shown, else empty' },
          location: { type: 'string', description: 'Room or building if shown, else empty' },
          teacher: { type: 'string', description: 'Instructor if shown, else empty' },
          days: { type: 'array', items: { type: 'string', enum: DAYS } },
          start: { type: 'string', description: '24-hour HH:MM' },
          end: { type: 'string', description: '24-hour HH:MM' },
          raw: { type: 'string', description: 'The literal text this row was read from' },
          confidence: { type: 'number', description: '0 to 1' },
        },
        required: ['title', 'days', 'start', 'end', 'raw', 'confidence'],
      },
    },
    term_starts_on: { type: 'string', description: 'YYYY-MM-DD if the image states a term start, else empty' },
    term_ends_on: { type: 'string', description: 'YYYY-MM-DD if the image states a term end, else empty' },
    notes: { type: 'string', description: 'Anything ambiguous or unreadable, one or two sentences' },
  },
  required: ['entries', 'notes'],
};

const READ_PROMPT = `You are reading a student's class schedule from an image. It may be a
photograph of a printed timetable, a screenshot of a portal, a grid, or a list.

Transcribe it. Do not interpret, summarise, or invent.

Rules:
- One entry per class per distinct time slot. If a class meets Monday 9-10:30
  AND Wednesday 13:00-14:30, that is TWO entries, because the times differ.
  If it meets Monday and Wednesday at the same time, that is ONE entry with
  two days.
- Times in 24-hour HH:MM. A schedule that says "1:00 - 2:30" in a column of
  afternoon classes means 13:00-14:30. Use the surrounding rows to decide AM
  or PM when it is not written; a university class at "8:00" is 08:00 and one
  at "7:00" in an evening column is 19:00.
- Day letters: M=mon, T=tue, W=wed, Th/H=thu, F=fri, S/Sat=sat, Su/Sun=sun.
  "TTh" is tue and thu. "MWF" is mon, wed, fri. "M-F" is mon..fri.
- Copy titles, codes, rooms and instructors exactly as written, including
  abbreviations. Do not expand "Comp Prog 1" into "Computer Programming 1".
- "raw" must be the literal text of that row as it appears, so a person can
  check you. Never paraphrase it.
- "confidence" is how sure you are of THAT row: 1.0 for crisp printed text you
  read without difficulty, below 0.6 for anything blurred, cut off, handwritten
  or inferred.
- If a cell is unreadable, still emit the entry with your best reading and a
  low confidence, and say so in "notes". Do not silently drop a class.
- Ignore breaks, vacant slots, lunch, and anything that is not a scheduled
  class or activity.`;

const VERIFY_PROMPT = `Here is a transcription of the schedule in this image, produced from the same
image. Check every row against the picture and return the CORRECTED
transcription in the same format.

Look specifically for:
- times read off the wrong row or column
- AM/PM mistakes
- day letters merged or dropped (TTh read as T)
- a class that meets at two different times collapsed into one entry
- rows in the image that are missing entirely from the transcription
- entries that are not in the image at all

Return the full corrected list, not a diff. Where you change a row, lower its
confidence if the source is genuinely unclear. Where the original was right,
return it unchanged.`;

type Gen = { entries?: unknown[]; term_starts_on?: string; term_ends_on?: string; notes?: string };

async function generate(key: string, model: string, parts: unknown[]): Promise<Gen> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
          temperature: 0,
          maxOutputTokens: 8192,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const err = new Error(`${res.status} ${body}`);
    // 404 and "not found"/"not supported" mean this key cannot reach that
    // model; anything else is a real failure and must not be retried silently.
    (err as { modelMissing?: boolean }).modelMissing =
      res.status === 404 || /not found|not supported|does not exist/i.test(body);
    throw err;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('The model returned no text');
  try {
    return JSON.parse(text) as Gen;
  } catch {
    throw new Error(`The model returned prose, not JSON: ${text.slice(0, 120)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, message: 'POST an image' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ ok: false, message: 'Sign in first' }, 401);

  // Whose key is being spent. The anon client plus the caller's bearer token
  // resolves to a real user or to nothing at all.
  const user = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: who } = await user.auth.getUser();
  if (!who?.user) return json({ ok: false, message: 'Sign in first' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let key = Deno.env.get('GEMINI_API_KEY') ?? '';
  if (!key) {
    const { data } = await admin.from('app_secrets').select('name,value').eq('name', 'GEMINI_API_KEY');
    key = data?.[0]?.value ?? '';
  }
  if (!key) return json({ ok: false, message: 'GEMINI_API_KEY is not set' }, 503);

  let body: { image?: string; mime?: string; verify?: boolean; today?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: 'Send JSON with an image' }, 400);
  }

  const image = (body.image ?? '').replace(/^data:[^,]+,/, '');
  if (!image) return json({ ok: false, message: 'No image' }, 400);
  // ~7MB of base64 is ~5MB of picture, well past what a screenshot needs.
  if (image.length > 7_000_000) return json({ ok: false, message: 'That image is too large - under 5MB please' }, 413);

  const inline = { inline_data: { mime_type: body.mime || 'image/jpeg', data: image } };
  const dated = body.today ? `\n\nToday is ${body.today}.` : '';

  let read: Gen | null = null;
  let used = '';
  let lastErr: Error | null = null;

  for (const model of MODELS) {
    try {
      read = await generate(key, model, [{ text: READ_PROMPT + dated }, inline]);
      used = model;
      break;
    } catch (e) {
      lastErr = e as Error;
      if ((e as { modelMissing?: boolean }).modelMissing) continue;
      break;
    }
  }
  if (!read) return json({ ok: false, message: lastErr?.message ?? 'The model could not read it' }, 502);

  // The check pass. If it fails for any reason the first reading still stands —
  // a verification that errored is not a reason to lose a good transcription.
  let verified = false;
  if (body.verify !== false) {
    try {
      const second = await generate(key, used, [
        { text: `${VERIFY_PROMPT}${dated}\n\nTranscription:\n${JSON.stringify(read)}` },
        inline,
      ]);
      if (Array.isArray(second.entries) && second.entries.length > 0) {
        read = second;
        verified = true;
      }
    } catch { /* keep the first reading */ }
  }

  return json({
    ok: true,
    model: used,
    verified,
    entries: Array.isArray(read.entries) ? read.entries.slice(0, 60) : [],
    term_starts_on: read.term_starts_on ?? '',
    term_ends_on: read.term_ends_on ?? '',
    notes: typeof read.notes === 'string' ? read.notes.slice(0, 400) : '',
  });
});
