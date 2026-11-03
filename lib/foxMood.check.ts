import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foxMood } from './foxMood.ts';

const base = { busy: 0, lastInputAt: 1_000_000, now: 1_000_000, gladUntil: 0, motion: true };

test('the fox sits by default', () => assert.equal(foxMood(base), 'sit'));
test('it runs while work is in flight', () => assert.equal(foxMood({ ...base, busy: 2 }), 'run'));
test('it never runs with motion off', () => assert.equal(foxMood({ ...base, busy: 1, motion: false }), 'sit'));
test('glad wins over running for its moment', () => assert.equal(foxMood({ ...base, busy: 1, gladUntil: base.now + 500 }), 'glad'));
test('it sleeps after five idle minutes', () => {
  assert.equal(foxMood({ ...base, now: base.lastInputAt + 299_999 }), 'sit');
  assert.equal(foxMood({ ...base, now: base.lastInputAt + 300_000 }), 'sleep');
});
test('work wakes it', () => assert.equal(foxMood({ ...base, busy: 1, now: base.lastInputAt + 400_000 }), 'run'));
