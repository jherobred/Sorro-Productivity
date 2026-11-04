import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOX_VOICE, systemPrompt } from './voice.ts';

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
