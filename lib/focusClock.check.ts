import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsLeft, startClock, pauseClock, extendClock, retimeClock, remainingShare } from './focusClock.ts';
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
test('adding time keeps a running clock running and a paused clock paused', () => {
 const running=startClock({duration:1500,remaining:1500,endsAt:null},0);
 const longer=extendClock(running,300,600000);
 assert.equal(longer.duration,1800);
 assert.equal(secondsLeft(longer,600000),1200);
 const paused=extendClock(pauseClock(running,600000),300,900000);
 assert.equal(paused.endsAt,null);
 assert.equal(secondsLeft(paused,5000000),1200);
});
test('adding time after a run ends starts a fresh run of that length', () => {
 const ended={duration:1500,remaining:0,endsAt:null};
 const next=extendClock(ended,600,1000);
 assert.equal(next.duration,600);
 assert.equal(secondsLeft(next,1000),600);
 assert.equal(secondsLeft(next,301000),300);
});
test('changing the length keeps the time already spent', () => {
 const running=startClock({duration:1500,remaining:1500,endsAt:null},0);
 const at10=600000;
 assert.equal(secondsLeft(retimeClock(running,50,at10),at10),2400);
 assert.equal(secondsLeft(retimeClock(running,5,at10),at10),60);
 const idle=retimeClock({duration:1500,remaining:1500,endsAt:null},15,0);
 assert.deepEqual(idle,{duration:900,remaining:900,endsAt:null});
 assert.equal(remainingShare(running,750000),.5);
});
