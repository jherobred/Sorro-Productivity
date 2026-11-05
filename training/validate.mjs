// Runs the app's own validateArgs over every generated actor call and every checker call labelled ok,
// so the models never learn a call the app would refuse. Run after generate.py: node training/validate.mjs [data dir]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateArgs } from '../supabase/functions/assistant/tools.ts';

const dir = process.argv[2] ?? join(fileURLToPath(new URL('.', import.meta.url)), 'data');
const lines = (f) => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

let checked = 0;
const failed = [];
const check = (where, name, args) => {
  checked++;
  const r = validateArgs(name, args);
  if (!r.ok) failed.push(`${where}: ${name} ${JSON.stringify(args)} → ${r.error}`);
};

for (const split of ['train', 'eval']) {
  lines(`actor.${split}.jsonl`).forEach((row, i) => {
    for (const m of row.messages) for (const c of m.tool_calls ?? []) check(`actor.${split}:${i + 1}`, c.function.name, c.function.arguments);
  });
  lines(`checker.${split}.jsonl`).forEach((row, i) => {
    if (row.expect.verdict !== 'ok') return;
    const m = row.messages[1].content.match(/\nCall: (\w+) (.*)$/s);
    check(`checker.${split}:${i + 1}`, m[1], JSON.parse(m[2]));
  });
}

console.log(`checked ${checked}, failed ${failed.length}`);
for (const f of failed.slice(0, 10)) console.log('  ' + f);
process.exit(failed.length ? 1 : 0);
