/**
 * Sorro news drop: the page Grok's scheduled tasks visit to leave a digest.
 *
 * Grok can browse but holds no Sorro credentials, so the digest travels in the
 * URL itself, behind a per-user key that is stored only as its SHA-256:
 *
 *   GET /functions/v1/news-drop?k=<key>&kind=ai-digest&part=1&of=3&d=<text>[&title=..]
 *
 * Long digests come in parts and are joined once every part is in. A wrong key
 * gets the same short answer whatever is wrong, so the page reveals nothing.
 * Deployed with --no-verify-jwt: the key is the credential.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { assemble, decodeText, parseItems, NEWS_KINDS, type NewsKind } from './assemble.ts';

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const manilaDate = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams;
  // A POST body may carry the same fields, for tools that can send one.
  if (req.method === 'POST') {
    const form = new URLSearchParams(await req.text());
    for (const [k, v] of form) if (!q.has(k)) q.set(k, v);
  }

  const key = q.get('k') ?? '';
  if (key.length < 16) return text('Unknown key', 401);
  const { data: owner } = await db.from('sorro_news_keys').select('user_id').eq('key_hash', await sha256(key)).maybeSingle();
  if (!owner) return text('Unknown key', 401);

  const kind = (q.get('kind') ?? '') as NewsKind;
  if (!NEWS_KINDS.includes(kind)) return text(`Unknown kind. Use one of: ${NEWS_KINDS.join(', ')}`, 400);
  const d = decodeText(q.get('d') ?? '');
  if (!d.trim()) return text('Nothing to save: put the digest in d=', 400);
  if (d.length > 4000) return text('That part is too long: keep each part under 1500 characters', 400);
  const part = Math.max(1, Number(q.get('part') ?? 1) | 0);
  const of = Math.max(part, Number(q.get('of') ?? 1) | 0);
  if (of > 50) return text('At most 50 parts', 400);
  const asked = q.get('edition') ?? '';
  // Only a real date within a week of today; anything else files under today.
  const edition = /^\d{4}-\d{2}-\d{2}$/.test(asked) && !Number.isNaN(Date.parse(asked)) && Math.abs(Date.parse(asked) - Date.parse(manilaDate())) <= 7 * 86_400_000 && new Date(asked).toISOString().slice(0, 10) === asked ? asked : manilaDate();
  const user_id = owner.user_id;

  let body = d;
  if (of > 1) {
    // A run that failed part-way may have left parts counted for a different total; they would block this one all day.
    await db.from('sorro_news_parts').delete().eq('user_id', user_id).eq('kind', kind).eq('edition', edition).neq('of', of);
    const { error } = await db.from('sorro_news_parts').upsert({ user_id, kind, edition, part, of, text: d });
    if (error) return text('Could not save that part, try again', 500);
    const { data: parts } = await db.from('sorro_news_parts').select('part, of, text').eq('user_id', user_id).eq('kind', kind).eq('edition', edition);
    const joined = assemble(parts ?? []);
    if (joined === null) return text(`Saved part ${part} of ${of}`);
    body = joined;
    await db.from('sorro_news_parts').delete().eq('user_id', user_id).eq('kind', kind).eq('edition', edition);
  }

  const parsed = parseItems(body);
  const title = (q.get('title') ?? '').trim() || parsed.title || kind;
  // One edition per kind per day: a re-run replaces it instead of piling up.
  await db.from('sorro_news').delete().eq('user_id', user_id).eq('kind', kind).eq('edition', edition);
  const { error } = await db.from('sorro_news').insert({ user_id, kind, edition, title, body, items: parsed.items });
  if (error) return text('Could not save the digest, try again', 500);
  return text(`Saved: ${title} (${parsed.items.length} items)`);
});
