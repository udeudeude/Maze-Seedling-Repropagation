import test from "node:test";
import assert from "node:assert/strict";
import {sampleGrid,suggestWalls,applyWallSuggestions} from "../src/maze-recognize.mjs";
import {newMaze,primaryCell} from "../src/maze-world.mjs";

const size=18,scale=10;
const colors={
  floor:[230,224,207],wood:[144,97,62],hole:[17,17,17]
};
function fixture({wood=[],holes=[],uniform=false}={}){
  const w=size*scale,h=size*scale;
  const data=new Uint8ClampedArray(w*h*4);
  const woodSet=new Set(wood.map(([x,z])=>x+","+z));
  const holeSet=new Set(holes.map(([x,z])=>x+","+z));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const cell=Math.floor(x/scale)+","+Math.floor(y/scale);
    const rgb=uniform?colors.floor:
      woodSet.has(cell)?colors.wood:holeSet.has(cell)?colors.hole:colors.floor;
    const i=(y*w+x)*4;
    data.set([...rgb,255],i);
  }
  return {width:w,height:h,data};
}
test("grid center sampling yields an independent mean per tile",()=>{
  const image=fixture({wood:[[6,7]]});
  const cells=sampleGrid(image);
  assert.equal(cells.length,324);
  assert.equal(cells.find(c=>c.x===6&&c.z===7).r,colors.wood[0]);
  assert.equal(cells.find(c=>c.x===1&&c.z===1).r,colors.floor[0]);
});
test("wood wall proposals distinguish wooden blocks from black floor holes",()=>{
  const wood=[];
  for(let x=3;x<14;x++){wood.push([x,5]);wood.push([x,6]);}
  const holes=[[3,3],[9,8],[11,11]];
  const result=suggestWalls(fixture({wood,holes}));
  assert.equal(result.quality,"review");
  const found=new Set(result.suggestions.map(s=>s.x+","+s.z));
  assert.equal(found.size,wood.length);
  for(const [x,z] of wood)assert.ok(found.has(x+","+z),"Missing block at "+x+","+z);
  for(const [x,z] of holes)assert.ok(!found.has(x+","+z),"Hole misidentified at "+x+","+z);
});
test("uniform boards never produce fabricated wall confidence",()=>{
  const result=suggestWalls(fixture({uniform:true}));
  assert.equal(result.quality,"low-contrast");
  assert.deepEqual(result.suggestions,[]);
});
test("reject malformed photos and out-of-range sensitivity",()=>{
  assert.throws(()=>suggestWalls(null),TypeError);
  assert.throws(()=>suggestWalls(fixture(),{sensitivity:2}),RangeError);
  assert.throws(()=>sampleGrid(fixture(),99,18),RangeError);
});
test("reviewed suggestions modify only empty cells and preserve original metadata",()=>{
  const original=newMaze();
  original.metadata={owner:"original",customOptions:{keep:true}};
  const suggestions=[
    {x:1,z:1},{x:3,z:4},{x:4,z:4},{x:3,z:4},{x:-1,z:2},{x:99,z:99}
  ];
  const result=applyWallSuggestions(original,suggestions);
  assert.equal(result.applied,2);
  assert.equal(primaryCell(original,3,4),null);
  assert.equal(primaryCell(result.maze,3,4).cell.type,"wall");
  assert.equal(primaryCell(result.maze,1,1).cell.type,"entrance");
  assert.deepEqual(result.maze.metadata,original.metadata);
  assert.equal(original.data.cells.length,2);
});
