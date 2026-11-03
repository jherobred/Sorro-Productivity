import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grokPrompt, dropUrl, PROMPT_KINDS } from './newsPrompts.ts';

const url = dropUrl('abc123', 'ai-digest');

test('the drop url names the key and the kind', () => {
  assert.equal(url, 'https://jdkbnsjczanvmmpsovhm.supabase.co/functions/v1/news-drop?k=abc123&kind=ai-digest');
});
test('every kind has a prompt that carries its own url and the part rule', () => {
  for (const kind of PROMPT_KINDS) {
    const p = grokPrompt(kind, dropUrl('KEY', kind));
    assert.ok(p.includes(`kind=${kind}`), kind);
    assert.ok(p.includes('&part=') && p.includes('&of='), kind);
    assert.ok(p.includes('headline | summary | link'), kind);
    assert.ok(p.length < 2600, `${kind} prompt is ${p.length} chars`);
  }
});
test('the key appears only inside the url', () => {
  const p = grokPrompt('jobs', dropUrl('SECRETKEY', 'jobs'));
  assert.equal(p.split('SECRETKEY').length - 1, 1);
});
