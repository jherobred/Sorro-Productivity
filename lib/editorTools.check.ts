import test from 'node:test';
import assert from 'node:assert/strict';
import {javaTokens} from './javaTokens.ts';
import {strokeBounds,strokeHit} from './boardGeometry.ts';
import {readBoard,writeBoard,type BoardDocument} from './pageKinds.ts';
import {attachNoteToTask,detachNoteFromTask,taskLinksNote} from './noteTaskLinks.ts';

test('Java highlighting preserves source verbatim including incomplete edits and HTML',()=>{
 for(const source of ['public class Example {\n String s = "<img>"; // class\n}', '/* unfinished\npublic class', 'String s = """\n hello\n""";', '@Override\nvoid run(){ int a=0xff; }', '"unclosed', "char x='\\n';"]){assert.equal(javaTokens(source).map(t=>t.text).join(''),source);}
 assert.equal(javaTokens('// class 123')[0].kind,'comment');assert.equal(javaTokens('"public"')[0].kind,'string');
});
test('circle eraser hits a sparse stroke segment and misses empty canvas',()=>{
 const stroke=strokeBounds([[0,0,.5],[400,0,.5]],'#123',4,'stroke');assert.equal(strokeHit(stroke,{x:200,y:8},10),true);assert.equal(strokeHit(stroke,{x:200,y:80},10),false);assert.equal(strokeHit(stroke,{x:-40,y:0},10),false);
});
test('schema cards and connections retain coordinates and old moodboard formats',()=>{
 const board:BoardDocument={version:1,kind:'moodboard',items:[{id:'a',type:'schema',x:-650,y:920,w:280,h:190,color:'#2454ed',title:'Question',fields:['Evidence','Next step']},{id:'b',type:'text',x:800,y:-120,w:240,h:150,color:'#111',background:'#ffeba3',text:'Keep this'}],connections:[{id:'edge',from:'a',to:'b'}]};
 assert.deepEqual(readBoard(writeBoard(board)),board);
 assert.equal(readBoard(writeBoard({...board,connections:[{id:'broken',from:'a',to:'missing'}]})),null);
});
test('task note links are idempotent and preserve unrelated notes and links',()=>{
 const notes='Do the reading.\n🔗 Course page: https://school.example/lesson';const linked=attachNoteToTask(notes,'note-1','https://basedly.example');assert.equal(taskLinksNote(linked,'note-1'),true);assert.equal(taskLinksNote(linked,'note-10'),false);assert.equal(attachNoteToTask(linked,'note-1','https://other.example'),linked);assert.equal(detachNoteFromTask(linked,'note-1'),notes);
});
