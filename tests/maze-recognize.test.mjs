import test from "node:test";
import assert from "node:assert/strict";
import {sampleGrid,suggestWalls,applyWallSuggestions} from "../src/maze-recognize.mjs";
import {newMaze,primaryCell} from "../src/maze-world.mjs";

const size=18,scale=28;
const colors={floor:[232,230,215],wall:[29,32,34],hole:[12,12,12],paperGrid:[154,153,147]};

/** A test photograph surrogate: charcoal strips, round punched holes, gridded paper. */
function fixture({walls=[],holes=[],uniform=false,solidWalls=false}={}){
  const w=size*scale,h=size*scale;
  const data=new Uint8ClampedArray(w*h*4);
  const wallSet=new Set(walls.map(([x,z])=>x+","+z));
  const holeSet=new Set(holes.map(([x,z])=>x+","+z));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const cx=Math.floor(x/scale),cz=Math.floor(y/scale),key=cx+","+cz;
    const dx=x%scale-scale/2,dy=y%scale-scale/2;
    const isDarkWall=wallSet.has(key)&&(solidWalls||
      Math.abs(dx)<4 && Math.abs(dy)<scale*.45 ||
      Math.abs(dy)<4 && Math.abs(dx)<scale*.45);
    const isHole=holeSet.has(key)&&Math.hypot(dx,dy)<scale*.23;
    const line=!uniform&&(x%scale===0||y%scale===0);
    const rgb=uniform?colors.floor:isDarkWall?colors.wall:isHole?colors.hole:
      line?colors.paperGrid:colors.floor;
    const i=(y*w+x)*4;
    data.set([...rgb,255],i);
  }
  return {width:w,height:h,data};
}
test("center samples isolate independent tiles",()=>{
  const image=fixture({walls:[[6,7]],solidWalls:true});
  const cells=sampleGrid(image);
  assert.equal(cells.length,324);
  assert.equal(cells.find(c=>c.x===6&&c.z===7).r,colors.wall[0]);
  assert.equal(cells.find(c=>c.x===1&&c.z===1).r,colors.floor[0]);
});
test("dark strips are detected while round holes and paper grid lines are rejected",()=>{
  const walls=[];
  for(let x=3;x<14;x++){walls.push([x,5]);walls.push([x,6]);}
  const holes=[[3,3],[9,8],[11,11]];
  const result=suggestWalls(fixture({walls,holes}));
  const found=new Set(result.suggestions.map(s=>s.x+","+s.z));
  assert.equal(result.quality,"review");
  assert.equal(found.size,walls.length,"Unexpected number of detected walls");
  for(const [x,z] of walls)assert.ok(found.has(x+","+z),"Missing block at "+x+","+z);
  for(const [x,z] of holes)assert.ok(!found.has(x+","+z),"Hole mistaken for wall at "+x+","+z);
});
test("fully dark wall shapes and mixed lighting still yield proposals",()=>{
  const walls=[];
  for(let z=2;z<8;z++)walls.push([10,z]);
  const result=suggestWalls(fixture({walls,solidWalls:true}));
  assert.ok(result.suggestions.length>=6);
});
test("uniform photographs produce no hallucinated walls",()=>{
  const result=suggestWalls(fixture({uniform:true}));
  assert.equal(result.quality,"low-contrast");
  assert.deepEqual(result.suggestions,[]);
});
test("reject malformed images and impossible sensitivity",()=>{
  assert.throws(()=>suggestWalls(null),TypeError);
  assert.throws(()=>suggestWalls(fixture(),{sensitivity:2}),RangeError);
  assert.throws(()=>sampleGrid(fixture(),99,18),RangeError);
});
test("approved candidates alter only empty cells and preserve original data",()=>{
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
