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
    assert.ok(p.includes('headline | summary | why it matters | image | link'), kind);
    assert.match(p, /why it matters/i, kind);
    assert.match(p, /parentheses/i, kind);
    assert.match(p, /Gentleman’s Coffee News/, kind);
    assert.ok(p.length < 3200, `${kind} prompt is ${p.length} chars`);
  }
});
test('the key appears only inside the url', () => {
  const p = grokPrompt('jobs', dropUrl('SECRETKEY', 'jobs'));
  assert.equal(p.split('SECRETKEY').length - 1, 1);
});
test('the AI digest asks for what the old automation asked for', () => {
  const p = grokPrompt('ai-digest', dropUrl('K', 'ai-digest'));
  for (const w of ['model releases', 'research papers', 'funding rounds', 'policy changes', 'Skip minor product updates and rumors']) assert.ok(p.includes(w), w);
});
test('every prompt asks for plenty of news, never a handful', () => {
  for (const kind of PROMPT_KINDS) {
    const p = grokPrompt(kind, dropUrl('K', kind));
    assert.match(p, /as much news as possible/, kind);
    assert.doesNotMatch(p, /Up to \d|6 to 8|6 to 10/, kind);
  }
});
