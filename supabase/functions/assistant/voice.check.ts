import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOX_VOICE, systemPrompt, nudgePrompt, nudgeText } from './voice.ts';

test('the prompt carries the voice, the user, the time and the rules', () => {
  const p = systemPrompt({ name: 'Jhems', now: 'Thursday, 5 November 2026 at 9:00 AM', tz: 'Asia/Manila' });
  assert.ok(p.includes(FOX_VOICE));
  assert.ok(p.includes("Jhems's"));
  assert.ok(p.includes('Asia/Manila'));
  assert.match(p, /never invent/i);
  assert.match(p, /one short sentence/i);
});
test('no name falls back to the user', () => assert.ok(systemPrompt({ now: 'x', tz: 'UTC' }).includes("the user's")));
test('the voice says he is a playful, cheeky fox', () => { assert.match(FOX_VOICE, /fox/i); assert.match(FOX_VOICE, /cheeky/i); });
test('the nudge prompt carries the voice, the kind and the facts, and asks for one line', () => {
  const p = nudgePrompt('morning', 'Due today: Essay');
  assert.ok(p.includes(FOX_VOICE));
  assert.match(p, /morning/);
  assert.ok(p.includes('Due today: Essay'));
  assert.match(p, /one (short )?line|one sentence/i);
});
test('F6: a line cut off by the token cap is dropped, so the template shows', () => {
  assert.equal(nudgeText({ content: { parts: [{ text: 'Morning. Due today: Essay and' }] }, finishReason: 'MAX_TOKENS' }), '');
  assert.equal(nudgeText({ content: { parts: [{ text: 'thinking', thought: true }, { text: 'Essay first. Go.' }] }, finishReason: 'STOP' }), 'Essay first. Go.');
});
