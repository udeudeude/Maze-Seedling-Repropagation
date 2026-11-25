import test from "node:test";
import assert from "node:assert/strict";
import {detectColoredMarkers} from "../src/maze-markers.mjs";
import {applyCaptureFindings} from "../src/maze-recognize.mjs";
import {newMaze,locate} from "../src/maze-world.mjs";

test("colored sticker candidates are localized to the board, not guessed",()=>{
  const width=18*26,height=18*26;
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const index=(y*width+x)*4;
    let rgb=[221,211,190];
    if(x>=2*26+6&&x<3*26-6&&y>=3*26+6&&y<4*26-6)
      rgb=[191,49,42];
    if(x>=14*26+6&&x<15*26-6&&y>=13*26+6&&y<14*26-6)
      rgb=[50,151,182];
    data.set([...rgb,255],index);
  }
  const result=detectColoredMarkers({width,height,data});
  assert.deepEqual(result.map(r=>[r.type,r.x,r.z]),
    [["entrance",2,3],["exit",14,13]]);
});
test("neutral photographs do not hallucinate colored markers",()=>{
  const width=100,height=100;
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4)data.set([210,207,200,255],i);
  assert.deepEqual(detectColoredMarkers({width,height,data}),[]);
});
test("approved markers replace defaults but preserve maze metadata",()=>{
  const original=newMaze();
  original.addedByUser={keep:true};
  const result=applyCaptureFindings(original,[],[],{
    entrance:{x:2,z:3},exit:{x:14,z:13}});
  assert.equal(result.movedMarkers,2);
  assert.deepEqual(locate(result.maze,"entrance"),[[2,3]]);
  assert.deepEqual(locate(result.maze,"exit"),[[14,13]]);
  assert.deepEqual(locate(original,"entrance"),[[1,1]]);
  assert.deepEqual(result.maze.addedByUser,{keep:true});
});
test("marker locations cannot silently overwrite existing walls or holes",()=>{
  const original=newMaze();
  original.data.cells.push({position:["8","0","8"],type:"wall"});
  const blocked=applyCaptureFindings(original,[],[],{entrance:{x:8,z:8}});
  assert.equal(blocked.movedMarkers,0);
  const pit=applyCaptureFindings(original,[],[{x:9,z:9}],
    {exit:{x:9,z:9}});
  assert.equal(pit.movedMarkers,0);
});
