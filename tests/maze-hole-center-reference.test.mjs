import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compareHoleCenters} from "../src/maze-scan-evaluation.mjs";
import {reviewPixelAt,reviewCellAt} from "../src/maze-scan-viewport.mjs";
const settings={width:504,height:504,columns:18,rows:18};
const hole=(cx,cy,x=3,z=4)=>({cx,cy,x,z});

test("correct photo center in wrong grid cell still counts as localized",()=>{
  const result=compareHoleCenters({...settings,suggested:[hole(101,126,4,4)],
    reviewed:[hole(100,125,3,4)]});
  assert.equal(result.matches,1);assert.equal(result.precision,1);
  assert.equal(result.recall,1);assert.equal(result.tolerancePixels,8.4);
});
test("wrong center within nominally matching cell is not localization",()=>{
  const result=compareHoleCenters({...settings,
    suggested:[hole(109,139)],reviewed:[hole(88,116)]});
  assert.deepEqual([result.matches,result.falseAlarms,result.misses],[0,1,1]);
});
test("duplicate detected circles are false alarms, not repeated matches",()=>{
  const result=compareHoleCenters({...settings,
    suggested:[hole(100,125),hole(102,125),hole(104,126)],
    reviewed:[hole(101,125)]});
  assert.deepEqual([result.matches,result.falseAlarms,result.misses],[1,2,0]);
});
test("maximum matching avoids greedy failure on ambiguous neighboring holes",()=>{
  const result=compareHoleCenters({width:200,height:200,columns:10,rows:10,
    toleranceCellFraction:.25,suggested:[hole(54,50),hole(50,50)],
    reviewed:[hole(53,50),hole(57,50)]});
  assert.deepEqual([result.matches,result.falseAlarms,result.misses],[2,0,0]);
});
test("empty classes have undefined precision or recall, not a perfect score",()=>{
  const empty=compareHoleCenters({...settings,suggested:[],reviewed:[]});
  assert.equal(empty.precision,null);assert.equal(empty.recall,null);
  const one=compareHoleCenters({...settings,suggested:[hole(100,125)],reviewed:[]});
  assert.equal(one.falseAlarms,1);assert.equal(one.recall,null);
});
test("invalid or missing real photo points cannot be silently replaced by midpoints",()=>{
  for(const input of [
    {suggested:[hole(99,122)],reviewed:[{x:3,z:4}]},
    {suggested:[hole(NaN,30)],reviewed:[]},
    {suggested:[],reviewed:[hole(-1,100)]},
    {suggested:[],reviewed:[],toleranceCellFraction:0},
    {suggested:[],reviewed:[],toleranceCellFraction:1}
  ])assert.throws(()=>compareHoleCenters({...settings,...input}),TypeError);
});
test("image pixel is recovered at magnification and respects review boundaries",()=>{
  const rect={left:100,top:200,width:1008,height:1008};
  assert.deepEqual(reviewPixelAt(rect,306.5,437.5,504,504),
    {cx:103.25,cy:118.75});
  assert.deepEqual(reviewCellAt(rect,306.5,437.5,18,18),{x:3,z:4});
  assert.equal(reviewPixelAt(rect,99,200,504,504),null);
  assert.equal(reviewPixelAt(rect,1108,200,504,504),null);
});
test("app wires independent pixel points into count-only report",()=>{
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  assert.match(app,/const point=reviewPixelAt\(/);
  assert.match(app,/\.\.\.point/);
  assert.match(app,/const holeCenters=compareHoleCenters\(/);
  assert.match(app,/metrics:\{\.\.\.metrics,holeCenters\}/);
  assert.match(html,/visible circle center/);
});
