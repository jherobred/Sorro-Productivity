import test from 'node:test';
import assert from 'node:assert/strict';
import {initialBody,pageKind,PAGE_TYPES,readBoard,readStudy,writeBoard,writeStudy} from './pageKinds.ts';
import {canvasPoint,zoomAt,strokeBounds,pressurePath,fitItems} from './boardGeometry.ts';

test('mixed notebook formats round-trip without reinterpreting ordinary markdown',()=>{
 for(const {kind} of PAGE_TYPES) assert.equal(pageKind(initialBody(kind)),kind);
 const markdown='```javascript\nconst x = 1;\n```\nKeep the lecture after this block.';
 assert.equal(pageKind(markdown),'document');
 assert.equal(readStudy(markdown),null);
 const cornell={version:1 as const,kind:'cornell' as const,cues:'Why?',notes:'Because.\nNext idea.',summary:'The result'};
 assert.deepEqual(readStudy(writeStudy(cornell)),cornell);
});
test('invalid or ambiguous board content stays readable as a document',()=>{
 const prefix='<!-- basedly-board:v1 -->\n';
 assert.equal(readBoard(prefix+'{broken'),null);
 const item={id:'x',type:'text' as const,x:0,y:0,w:240,h:140,text:'Margin note',color:'#2454ed'};
 assert.equal(readBoard(writeBoard({version:1,kind:'whiteboard',items:[item,item]})),null);
 assert.equal(readBoard(writeBoard({version:1,kind:'whiteboard',items:[{...item,w:-1}]})),null);
});
test('PDF annotations retain off-page coordinates and private asset references',()=>{
 const board={version:1 as const,kind:'pdf' as const,pdf:{asset:{localId:'local-pdf',name:'lecture.pdf',path:'owner/page-assets/lecture.pdf'},pages:[{w:760,h:980,y:0}]},items:[{id:'margin',type:'text' as const,x:-200,y:75,w:240,h:140,text:'Outside the PDF',color:'#2454ed'}]};
 assert.deepEqual(readBoard(writeBoard(board)),board);
});
test('zoom keeps the world point under the cursor stationary, including limits',()=>{
 const view={x:120,y:-60,scale:.8};
 for(const scale of [.001,.5,2,100]) assert.deepEqual(canvasPoint(240,300,zoomAt(view,240,300,scale)),canvasPoint(240,300,view));
});
test('pen geometry preserves pressure and negative-world coordinates',()=>{
 const stroke=strokeBounds([[-10,-20,.1],[30,40,.9]],'#2454ed',3,'s');
 assert.deepEqual(stroke.points,[[0,0,.1],[40,60,.9]]);
 assert.equal(stroke.x,-10);assert.equal(stroke.y,-20);
 assert.ok(!pressurePath(stroke.points!,3).includes('NaN'));
 assert.ok(pressurePath([[0,0,.1]],3)!==pressurePath([[0,0,.9]],3));
 const view=fitItems([stroke],900,600);
 const topLeft={x:stroke.x*view.scale+view.x,y:stroke.y*view.scale+view.y};
 assert.ok(topLeft.x>=0&&topLeft.y>=0);
});
