import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {strokeBetween} from "../src/maze-brush.mjs";

test("fast drags fill every horizontal and vertical square, in either direction",()=>{
  assert.deepEqual(strokeBetween([1,4],[7,4],18,18),
    [[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4]]);
  assert.deepEqual(strokeBetween([4,5],[4,1],18,18),
    [[4,5],[4,4],[4,3],[4,2],[4,1]]);
  assert.deepEqual(strokeBetween([7,4],[1,4],18,18),
    [[7,4],[6,4],[5,4],[4,4],[3,4],[2,4],[1,4]]);
});

test("diagonal and shallow fast strokes have no missing raster steps",()=>{
  for(const [from,to] of [
    [[0,0],[17,17]],[[17,17],[0,0]],[[1,2],[15,7]],
    [[13,1],[2,16]],[[4,14],[16,2]],[[7,12],[7,12]]
  ]){
    const result=strokeBetween(from,to,18,18);
    assert.deepEqual(result[0],from);
    assert.deepEqual(result.at(-1),to);
    assert.equal(new Set(result.map(point=>point.join(","))).size,result.length);
    for(let i=1;i<result.length;i++){
      const dx=Math.abs(result[i][0]-result[i-1][0]);
      const dz=Math.abs(result[i][1]-result[i-1][1]);
      assert.ok(dx<=1&&dz<=1&&dx+dz>0,"No leap over a grid square");
    }
  }
});

test("rectangular boards and same-cell input are supported without mutation",()=>{
  const start=[1,2],end=[6,3];
  const cells=strokeBetween(start,end,7,4);
  assert.deepEqual(start,[1,2]);
  assert.deepEqual(end,[6,3]);
  assert.ok(cells.every(([x,z])=>x>=0&&x<7&&z>=0&&z<4));
  assert.deepEqual(strokeBetween([2,1],[2,1],3,2),[[2,1]]);
});

test("out-of-bounds and malformed strokes cannot paint outside a document",()=>{
  for(const args of [
    [[0,0],[2,1],2,2],[[0,0],[-1,1],18,18],
    [[0.5,0],[1,1],18,18],[[0,0],[0,0],0,18],
    [[0,0],[0,0],18,-1],[[0,0],null,18,18]
  ])assert.throws(()=>strokeBetween(...args),RangeError);
});

test("editor transaction records one undo for the whole stroke, with separate keyboard edits",()=>{
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  assert.match(app,/if\(!stroke\|\|!boardStroke\?\.changed\)\{/);
  assert.match(app,/if\(stroke&&boardStroke\)boardStroke\.changed=true/);
  assert.match(app,/commit\(paintTile\(target,x,z,selected\),\{stroke:Boolean\(boardStroke\)\}\)/);
  assert.match(app,/strokeBetween\(boardStroke\.last,cell,/);
  assert.match(app,/boardStroke\.id!==event\.pointerId/);
  assert.match(app,/lostpointercapture/);
  assert.match(app,/else paint\(\.\.\.currentTile\)/);
  assert.match(html,/Undo reverses the entire stroke/);
  assert.match(sw,/\.\/src\/maze-brush\.mjs/);
});
