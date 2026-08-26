/**
 * Read a plate of food, or a receipt.
 *
 * The same door as schedule-scan and the same rule: it reads, it returns
 * structure, and the browser writes only after a person has looked at what
 * came back. Nothing here touches the database.
 *
 * One pass rather than schedule-scan's two. A misread timetable sends you to
 * the wrong room for a term; a misread calorie count is wrong for one meal and
 * sits in front of you on a review sheet while you fix it. The second pass is
 * not worth doubling the cost of every photo.
 *
 * Auth: the caller's own JWT. This spends a paid API key.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MODELS = ['gemini-3.6-pro', 'gemini-3.6-flash'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MEAL_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'What the meal is, in a few words' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          portion: { type: 'string', description: 'What you can see of the amount' },
          kcal: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
        },
        required: ['name', 'kcal', 'protein', 'carbs', 'fat'],
      },
    },
    kcal: { type: 'number' }, protein: { type: 'number' }, carbs: { type: 'number' }, fat: { type: 'number' },
    confidence: { type: 'number' },
    notes: { type: 'string' },
  },
  required: ['name', 'kcal', 'protein', 'carbs', 'fat', 'confidence', 'notes'],
};

const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    merchant: { type: 'string' },
    total: { type: 'number', description: 'The grand total, in the currency shown, as a positive number' },
    currency: { type: 'string' },
    date: { type: 'string', description: 'YYYY-MM-DD if printed, else empty' },
    category: {
      type: 'string',
      enum: ['Food', 'Transport', 'School', 'Bills', 'Fun', 'Health', 'Other'],
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, amount: { type: 'number' } },
        required: ['name', 'amount'],
      },
    },
    confidence: { type: 'number' },
    notes: { type: 'string' },
  },
  required: ['merchant', 'total', 'category', 'confidence', 'notes'],
};

const MEAL_PROMPT = `Look at this photograph of food and estimate what is in it.

Rules:
- Name the dish the way a person would say it, not a brand or a recipe title.
- List what you can actually see as separate items. Do not invent a side salad.
- Estimate calories and macros in grams for the portion *shown*, not for a
  standard serving. A plate piled high is not 100g.
- The top-level kcal, protein, carbs and fat are the totals for the whole plate.
- Filipino, East Asian and Western dishes are all likely; do not assume a
  cuisine from the crockery.
- "confidence" is how sure you are of the numbers: above 0.8 for a clearly lit
  single dish you recognise, below 0.5 for a mixed plate, a dark photo, or
  anything where the portion is hard to judge.
- If it is not food at all, return kcal 0 and say so in notes.`;

const RECEIPT_PROMPT = `Read this receipt.

Rules:
- "merchant" is the shop or restaurant name as printed at the top.
- "total" is the grand total actually paid, as a positive number. Not the
  subtotal, not the cash tendered, not the change. If a discount was applied,
  take the figure after it.
- "date" is the transaction date printed on it, YYYY-MM-DD, or empty if there
  is none. Do not guess a date from nothing.
- "category" is your best fit from the list.
- "items" are the lines, if they are legible. Skip them rather than guess.
- "confidence" is how sure you are of the total specifically: above 0.9 for a
  crisp printed total, below 0.6 for a creased, faded or partly cut-off slip.
- If this is not a receipt, return total 0 and say so in notes.`;

async function generate(key: string, model: string, parts: unknown[], schema: unknown) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      // The key goes in a header, not `?key=`. A query string is the one part of
      // a request that proxies, error reports and platform logs write down.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0,
          maxOutputTokens: 2048,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const err = new Error(`${res.status} ${body}`);
    (err as { modelMissing?: boolean }).modelMissing =
      res.status === 404 || /not found|not supported|does not exist/i.test(body);
    throw err;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('The model returned no text');
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`The model returned prose, not JSON: ${text.slice(0, 120)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, message: 'POST an image' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ ok: false, message: 'Sign in first' }, 401);

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

  let body: { image?: string; mime?: string; mode?: string; today?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: 'Send JSON with an image' }, 400);
  }

  const mode = body.mode === 'receipt' ? 'receipt' : 'meal';
  const image = (body.image ?? '').replace(/^data:[^,]+,/, '');
  if (!image) return json({ ok: false, message: 'No image' }, 400);
  if (image.length > 7_000_000) return json({ ok: false, message: 'That image is too large - under 5MB please' }, 413);

  const inline = { inline_data: { mime_type: body.mime || 'image/jpeg', data: image } };
  const dated = body.today ? `\n\nToday is ${body.today}.` : '';
  const prompt = (mode === 'receipt' ? RECEIPT_PROMPT : MEAL_PROMPT) + dated;
  const schema = mode === 'receipt' ? RECEIPT_SCHEMA : MEAL_SCHEMA;

  let read: Record<string, unknown> | null = null;
  let used = '';
  let lastErr: Error | null = null;

  for (const model of MODELS) {
    try {
      read = await generate(key, model, [{ text: prompt }, inline], schema);
      used = model;
      break;
    } catch (e) {
      lastErr = e as Error;
      if ((e as { modelMissing?: boolean }).modelMissing) continue;
      break;
    }
  }
  if (!read) return json({ ok: false, message: lastErr?.message ?? 'The model could not read it' }, 502);

  return json({ ok: true, mode, model: used, ...read });
});
