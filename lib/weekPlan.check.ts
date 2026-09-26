import test from 'node:test';
import assert from 'node:assert/strict';
import { availableTime, conflicts } from './weekPlan.ts';
const block=(a:number,b:number)=>({starts_at:new Date(a).toISOString(),ends_at:new Date(b).toISOString()});
test('available time merges overlaps, clips overnight events and ignores deleted events',()=>{
  const events=[block(0,20),block(10,30),block(40,50),block(45,60),{...block(65,70),deleted_at:'deleted'},block(90,120)];
  assert.deepEqual(availableTime(events,10,100,5),[{start:30,end:40},{start:60,end:90}]);
});
test('touching endpoints are free, a real overlap is not, short gaps are excluded',()=>{
  assert.equal(conflicts([block(10,20)],20,30),false);
  assert.equal(conflicts([block(10,20)],19,30),true);
  assert.deepEqual(availableTime([block(20,28)],0,30,5),[{start:0,end:20}]);
});
