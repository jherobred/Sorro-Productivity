// Copies every object from the old bd-* buckets into the sorro-* buckets made by
// migration 0026, then checks the counts and sizes match. The old buckets are
// left in place until 0028.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/move-buckets.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });
const PAIRS = [['bd-files', 'sorro-files'], ['bd-journal', 'sorro-journal'], ['bd-avatars', 'sorro-avatars']];

async function walk(bucket, prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...await walk(bucket, path)); // a folder
      else out.push({ path, size: item.metadata?.size ?? 0, type: item.metadata?.mimetype });
    }
    if (data.length < 1000) return out;
  }
}

let failed = false;
for (const [from, to] of PAIRS) {
  const items = await walk(from);
  const have = new Map((await walk(to)).map(i => [i.path, i.size]));
  let copied = 0;
  for (const item of items) {
    if (have.get(item.path) === item.size) continue;
    const { data, error } = await db.storage.from(from).download(item.path);
    if (error) throw new Error(`${from}/${item.path}: ${error.message}`);
    const up = await db.storage.from(to).upload(item.path, data, { contentType: item.type, upsert: true });
    if (up.error) throw new Error(`${to}/${item.path}: ${up.error.message}`);
    copied++;
  }
  const after = await walk(to);
  const sum = list => list.reduce((n, i) => n + i.size, 0);
  const ok = items.every(i => after.some(a => a.path === i.path && a.size === i.size));
  console.log(`${from} -> ${to}: ${items.length} objects, ${sum(items)} bytes; copied ${copied}; new bucket ${after.length} objects, ${sum(after)} bytes; ${ok ? 'match' : 'MISMATCH'}`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
