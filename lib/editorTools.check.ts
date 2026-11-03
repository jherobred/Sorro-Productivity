import test from 'node:test';
import assert from 'node:assert/strict';
import {javaTokens} from './javaTokens.ts';
import {strokeBounds,strokeHit} from './boardGeometry.ts';
import {readBoard,writeBoard,type BoardDocument} from './pageKinds.ts';
import {attachNoteToTask,detachNoteFromTask,taskLinksNote} from './noteTaskLinks.ts';
import {countMatches,replaceAll,readingMinutes} from './findReplace.ts';
import {typeCharacter,deleteBackward,newline} from './codeEdit.ts';
import {codeTokens,isRunnable,previewDocument} from './codeTokens.ts';
import {readJournal,writeJournal,monthGrid,localDay} from './journalPage.ts';
import {pdfMargin,pdfFieldWidth,pdfOpenView,LEGACY_MARGIN,IMPORT_MARGIN} from './pdfLayout.ts';

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
test('find and replace treats the search term and the replacement as text, not patterns',()=>{
 const body='Total cost (total) is 5. TOTAL again.';
 assert.equal(countMatches(body,'(total)'),1);
 assert.equal(countMatches(body,'.*'),0);
 assert.equal(countMatches(body,'total'),3);
 assert.equal(countMatches(body,'total',true),1);
 assert.equal(countMatches(body,''),0);
 assert.equal(replaceAll(body,'',''),body);
 assert.equal(replaceAll('a b','b','$& $1'),'a $& $1');
 assert.equal(replaceAll(body,'(total)','[sum]'),'Total cost [sum] is 5. TOTAL again.');
 assert.equal(replaceAll(body,'total','x',true),'Total cost (x) is 5. TOTAL again.');
});
test('reading time never rounds a short note down to zero minutes',()=>{
 assert.equal(readingMinutes(0),1);assert.equal(readingMinutes(12),1);assert.equal(readingMinutes(440),2);
});
const NL=String.fromCharCode(10);
test('typing a bracket pairs it, wraps a selection, and steps over its own closer',()=>{
 assert.deepEqual(typeCharacter('',0,0,'{'),{code:'{}',caret:1});
 assert.deepEqual(typeCharacter('ab',2,2,'{'),{code:'ab{}',caret:3});
 assert.deepEqual(typeCharacter('ab',0,2,'('),{code:'(ab)',caret:4});
 assert.deepEqual(typeCharacter('{}',1,1,'}'),{code:'{}',caret:2});
 assert.equal(typeCharacter("don",3,3,"'"),null);
 assert.deepEqual(typeCharacter('say ',4,4,'"'),{code:'say ""',caret:5});
 assert.equal(typeCharacter('ab',2,2,'x'),null);
});
test('backspace clears an empty pair but never a pair with content',()=>{
 assert.deepEqual(deleteBackward('a{}',2,2),{code:'a',caret:1});
 assert.equal(deleteBackward('a{b}',2,2),null);
 assert.equal(deleteBackward('ab',2,2),null);
});
test('enter inside an empty brace opens the block and keeps the indent',()=>{
 const opened=newline('  {}',3,3)!;
 assert.ok(opened);
 assert.equal(opened.code,'  {'+NL+'      '+NL+'  }');
 assert.equal(opened.caret,'  {'.length+1+6);
 assert.equal(newline('x',1,1),null);
});
test('highlighting every language reproduces the source exactly',()=>{
 for(const [code,language] of [['<p class="a">hi</p><!-- note -->','html'],['.a{color:#fff;margin:0 4px}/* c */','css'],['const a=1;','javascript'],['public class A {}','java']]){
  assert.equal(codeTokens(code,language).map(t=>t.text).join(''),code);
 }
 assert.equal(codeTokens('<p>','html')[0].kind,'keyword');
 assert.equal(codeTokens('/* c */','css')[0].kind,'comment');
});
test('only the languages a browser can render are runnable',()=>{
 assert.equal(isRunnable('html'),true);assert.equal(isRunnable('css'),true);
 assert.equal(isRunnable('javascript'),true);assert.equal(isRunnable('java'),false);
 assert.equal(previewDocument('<b>x</b>','html'),'<b>x</b>');
 assert.ok(previewDocument('a{}','css').includes('<style>a{}</style>'));
});
test('a journal keeps its prose and reads polaroids back unchanged',()=>{
 const plain='# Journal'+NL+'A quiet day.';
 assert.deepEqual(readJournal(plain),{prefix:'# Journal'+NL,prose:'A quiet day.',photos:[]});
 assert.equal(writeJournal(readJournal(plain)),plain);
 const withPhoto={prefix:'# Journal'+NL,prose:'A quiet day.',photos:[{id:'p1',asset:{localId:'a',name:'x.webp'},caption:'The bridge',tilt:-1.5}]};
 assert.deepEqual(readJournal(writeJournal(withPhoto)),withPhoto);
});
test('a damaged photo marker never eats the writing',()=>{
 const broken='# Journal'+NL+'Keep me.'+NL+'<!-- sorro-journal-photos:v1 -->{not json';
 const read=readJournal(broken);
 assert.equal(read.photos.length,0);
 assert.ok(read.prose.startsWith('Keep me.'));
 assert.equal(read.prefix+read.prose,broken);
});
test('the month grid is six fixed weeks starting on a Monday',()=>{
 const cells=monthGrid(new Date(2026,8,13));
 assert.equal(cells.length,42);
 assert.equal(cells[0].day,'2026-08-31');
 assert.equal(cells.filter(c=>c.inMonth).length,30);
 assert.equal(localDay(new Date(2026,0,5)),'2026-01-05');
});
test('a PDF saved before margins were adjustable keeps its original layout',()=>{
 const old={pages:[{w:760,h:990,y:0}]};
 assert.equal(pdfMargin(old),LEGACY_MARGIN);
 assert.equal(pdfFieldWidth(old),1480);
 assert.equal(pdfMargin({pages:[],margin:-5}),LEGACY_MARGIN);
 assert.equal(pdfMargin({pages:[],margin:0}),0);
});
test('a new import gets a wider field without shrinking the page on screen',()=>{
 const old={pages:[{w:760,h:990,y:0}]},fresh={pages:[{w:760,h:990,y:0}],margin:IMPORT_MARGIN};
 assert.ok(pdfFieldWidth(fresh)>pdfFieldWidth(old));
 assert.equal(pdfFieldWidth(fresh),IMPORT_MARGIN*2+760);
 const a=pdfOpenView(old,1480),b=pdfOpenView(fresh,1480);
 assert.equal(a.scale,b.scale);
 assert.equal(a.x+pdfMargin(old)*a.scale, b.x+pdfMargin(fresh)*b.scale);
});
test('the widest page decides the field so a landscape page still gets margins',()=>{
 assert.equal(pdfFieldWidth({pages:[{w:760,h:10,y:0},{w:1100,h:10,y:20}],margin:100}),1300);
 assert.equal(pdfFieldWidth({pages:[],margin:100}),960);
});
test('a stored PDF margin survives a round trip and a bad one is refused',()=>{
 const asset={localId:'a',name:'x.pdf'};
 const board:BoardDocument={version:1,kind:'pdf',items:[],pdf:{asset,pages:[{w:760,h:990,y:0}],margin:IMPORT_MARGIN}};
 assert.deepEqual(readBoard(writeBoard(board)),board);
 const legacy:BoardDocument={version:1,kind:'pdf',items:[],pdf:{asset,pages:[{w:760,h:990,y:0}]}};
 assert.deepEqual(readBoard(writeBoard(legacy)),legacy);
 assert.equal(readBoard(writeBoard({...board,pdf:{asset,pages:[{w:760,h:990,y:0}],margin:-40}})),null);
});
