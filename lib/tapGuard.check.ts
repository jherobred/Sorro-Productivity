import test from 'node:test';
import assert from 'node:assert/strict';
import { isTapGesture, type TapEnd, type TapStart } from './tapGuard.ts';

const press = (over: Partial<TapStart> = {}): TapStart => ({ x: 100, y: 400, scroll: 336, at: 5000, touch: true, ...over });
const release = (over: Partial<TapEnd> = {}): TapEnd => ({ x: 100, y: 400, scroll: 336, scrolledAt: 1000, keyboard: false, ...over });

test('a finger that stays put on a still day makes an event', () => {
  assert.equal(isTapGesture(press(), release()), true);
  assert.equal(isTapGesture(press(), release({ x: 106, y: 407 })), true);
});

test('a scroll that ends on a slot does not', () => {
  // Dragging the day upward: the slot scrolls out from under the finger.
  assert.equal(isTapGesture(press(), release({ scroll: 640, y: 96 })), false);
  // A flick that moved the day only a little still moved it.
  assert.equal(isTapGesture(press(), release({ scroll: 338 })), false);
  // The finger slid without scrolling anything, which is a drag, not a tap.
  assert.equal(isTapGesture(press(), release({ y: 430 })), false);
});

test('the tap that stops a flick belongs to the scroll', () => {
  assert.equal(isTapGesture(press({ at: 5000 }), release({ scrolledAt: 4900 })), false);
  assert.equal(isTapGesture(press({ at: 5000 }), release({ scrolledAt: 4600 })), true);
  // A mouse never flicks, so a click straight after a wheel still counts.
  assert.equal(isTapGesture(press({ at: 5000, touch: false }), release({ scrolledAt: 4900 })), true);
});

test('the keyboard opens a slot, a click with no press of its own does not', () => {
  assert.equal(isTapGesture(null, release({ keyboard: true })), true);
  assert.equal(isTapGesture(null, release()), false);
});
