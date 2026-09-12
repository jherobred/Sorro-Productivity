import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsLeft, startClock, pauseClock } from './focusClock.ts';
test('focus timer counts elapsed wall time after background suspension', () => {
 const clock=startClock({duration:1500,remaining:1500,endsAt:null},1000);
 assert.equal(secondsLeft(clock,601000),900);
 assert.equal(secondsLeft(clock,2000000),0);
});
test('pause and resume retain remaining duration', () => {
 const initial=startClock({duration:1500,remaining:1500,endsAt:null},0);
 const paused=pauseClock(initial,300000);
 assert.equal(secondsLeft(paused,900000),1200);
 assert.equal(secondsLeft(startClock(paused,900000),1000000),1100);
});
