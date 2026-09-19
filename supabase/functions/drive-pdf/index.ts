/**
 * drive-pdf — a PDF shared on Google Drive, fetched for the website.
 *
 * The Basedly app fetches Drive files itself, natively. A browser cannot: Drive
 * answers downloads with no CORS headers, so the website asks this function to
 * fetch the file and hand the bytes back. Nothing is stored here.
 *
 * It is not an open proxy. The caller must be signed in, the only thing it
 * accepts is a Drive file id (it builds the Drive address itself), redirects are
 * only followed within Google's own download hosts, and anything over 40 MB or
 * not starting like a PDF is refused.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-file-name',
};
const MAX_BYTES = 40 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{20,}$/;
const NOT_SHARED = 'That Drive file could not be opened as a PDF. In Drive, set General access to “Anyone with the link”, then paste the link again.';

const fail = (message: string, status = 400) =>
  new Response(JSON.stringify({ ok: false, message }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const googleHost = (host: string) =>
  host === 'drive.google.com' || host === 'drive.usercontent.google.com' || host.endsWith('.googleusercontent.com');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('POST only', 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return fail('Not signed in', 401);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: who } = await supabase.auth.getUser();
  if (!who?.user) return fail('Not signed in', 401);

  let id = '';
  try { id = String((await req.json()).id ?? ''); } catch { /* empty body */ }
  if (!ID.test(id)) return fail('That is not a Google Drive file link.');

  let target = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
  let res: Response | null = null;
  for (let hop = 0; hop <= 5; hop++) {
    res = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    if (res.status < 300 || res.status > 399) break;
    const next = new URL(res.headers.get('location') ?? '', target);
    if (next.protocol !== 'https:' || !googleHost(next.hostname)) return fail(NOT_SHARED);
    target = next.toString();
    res = null;
  }
  if (!res) return fail('Drive redirected too many times.');
  if (res.status === 404) return fail('Drive could not find that file. Check the link.');
  if (!res.ok || !res.body) return fail(NOT_SHARED);
  if (Number(res.headers.get('content-length')) > MAX_BYTES) return fail('That PDF is over 40 MB.');

  // Read it with a running total: a missing or false content-length is not
  // allowed to walk this function into holding a huge file in memory.
  const parts: Uint8Array[] = [];
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) { await reader.cancel(); return fail('That PDF is over 40 MB.'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.length; }
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return fail(NOT_SHARED);

  const disposition = res.headers.get('content-disposition') ?? '';
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  let name = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? 'Drive PDF.pdf';
  if (utf) { try { name = decodeURIComponent(utf); } catch { /* keep the plain one */ } }

  return new Response(bytes, {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/pdf', 'x-file-name': encodeURIComponent(name).slice(0, 300) },
  });
});
