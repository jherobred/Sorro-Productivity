import {writeStudy} from './pageKinds.ts';
export const STUDY_TEMPLATES = [
  {id:'lecture',name:'Lecture notes',description:'Questions, notes and a recap',body:()=>writeStudy({version:1,kind:'cornell',cues:'',notes:'Topic:\n\nKey ideas:\n\nExamples:\n\nWhat needs checking:',summary:''})},
  {id:'exam',name:'Exam revision',description:'A checklist for active recall',body:()=>writeStudy({version:1,kind:'checklist',items:['List the topics covered','Recall each topic without notes','Check answers and mark gaps','Practice questions under time limits','Review the hardest questions tomorrow'].map(text=>({id:crypto.randomUUID(),text,done:false}))})},
  {id:'assignment',name:'Assignment plan',description:'Brief, research, draft and submit',body:()=> '# Assignment plan\n\n## What is being asked?\n\n## Deadline and marking criteria\n\n## Sources to read\n\n## Outline\n\n## Draft\n\n## Before submitting\n\n- [ ] Check the brief\n- [ ] Cite sources\n- [ ] Proofread\n- [ ] Submit and confirm receipt\n'},
] as const;
/** One cue per line. Explicit `question :: answer` pairs carry an answer; no invented answers. */
export function cardsFromCues(cues:string) {
  return cues.split('\n').map(line=>line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean).map(line=>{
    const at=line.indexOf('::');return {front:(at<0?line:line.slice(0,at)).trim(),back:at<0?'':line.slice(at+2).trim()};
  }).filter(c=>c.front);
}
