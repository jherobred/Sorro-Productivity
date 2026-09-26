import test from 'node:test';
import assert from 'node:assert/strict';
import {cardsFromCues,STUDY_TEMPLATES} from './studyFlow.ts';
import {readStudy} from './pageKinds.ts';
test('Cornell cues become explicit questions and never invent answers',()=>{
  assert.deepEqual(cardsFromCues('- What is a stack?\n2. FIFO? :: Queue\n\n- :: blank question'),[{front:'What is a stack?',back:''},{front:'FIFO?',back:'Queue'}]);
});
test('student templates use valid existing page formats',()=>{
  assert.equal(readStudy(STUDY_TEMPLATES[0].body())?.kind,'cornell');
  const exam=readStudy(STUDY_TEMPLATES[1].body());assert.equal(exam?.kind,'checklist');
});
