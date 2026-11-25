import test from "node:test";
import assert from "node:assert/strict";
import {sampleGrid,suggestWalls,applyWallSuggestions} from "../src/maze-recognize.mjs";
import {separateRoundHoles} from "../src/maze-shapes.mjs";
import {newMaze,primaryCell} from "../src/maze-world.mjs";

const size=18,scale=28;
const colors={floor:[232,230,215],wall:[29,32,34],hole:[12,12,12],paperGrid:[154,153,147],surroundingGreen:[128,191,119]};

/** A test photograph surrogate: charcoal strips, round punched holes, gridded paper. */
function fixture({walls=[],holes=[],uniform=false,solidWalls=false,greenBorder=false}={}){
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
    const isOuter=greenBorder&&(cx===0||cz===0||cx===size-1||cz===size-1);
    const rgb=uniform?colors.floor:isDarkWall?colors.wall:isHole?colors.hole:
      isOuter?colors.surroundingGreen:line?colors.paperGrid:colors.floor;
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

test("green surroundings of the actual board are not misidentified as walls",()=>{
  const walls=[];
  for(let x=3;x<=14;x++)walls.push([x,7]);
  for(let z=5;z<=13;z++)walls.push([10,z]);
  const holes=[[3,3],[8,10],[12,12]];
  const result=suggestWalls(fixture({walls,holes,greenBorder:true}));
  const chosen=new Set(result.suggestions.map(s=>s.x+","+s.z));
  for(let x=0;x<size;x++){
    assert.ok(!chosen.has(x+",0"),"Top green border falsely recognized");
    assert.ok(!chosen.has(x+","+(size-1)),"Bottom green border falsely recognized");
  }
  for(let z=0;z<size;z++){
    assert.ok(!chosen.has("0,"+z),"Left green border falsely recognized");
    assert.ok(!chosen.has((size-1)+","+z),"Right green border falsely recognized");
  }
  for(const [x,z] of walls)assert.ok(chosen.has(x+","+z),"Missing dark wall");
  for(const [x,z] of holes)assert.ok(!chosen.has(x+","+z),"Round hole misidentified");
});

test("isolates three circular holes but retains all three distinct straight strip lengths",()=>{
  const width=18*28,mask=new Uint8Array(width*width);
  const strips=[
    {x:4*28,y:2*28,w:2*28,h:11},
    {x:8*28,y:8*28,w:12,h:4*28},
    {x:2*28,y:14*28,w:6*28,h:12}
  ];
  for(const rect of strips)for(let y=rect.y;y<rect.y+rect.h;y++)
    for(let x=rect.x;x<rect.x+rect.w;x++)mask[y*width+x]=1;
  for(const [x,z] of [[1,1],[10,9],[13,12]]){
    const cx=(x+.5)*28,cy=(z+.5)*28;
    for(let yy=Math.floor(cy-12);yy<=Math.ceil(cy+12);yy++)
      for(let xx=Math.floor(cx-12);xx<=Math.ceil(cx+12);xx++)
        if((xx-cx)**2+(yy-cy)**2<121)mask[yy*width+xx]=1;
  }
  const result=separateRoundHoles(mask,width,width);
  assert.deepEqual(result.holes.map(h=>[h.x,h.z]).sort(),
    [[1,1],[10,9],[13,12]].sort());
  for(const rect of strips)
    assert.equal(result.mask[(rect.y+3)*width+rect.x+3],1,"Wall strip deleted");
  for(const hole of result.holes)
    assert.equal(result.mask[Math.floor(hole.cy)*width+Math.floor(hole.cx)],0);
});
test("dark square labels do not look like rounded holes",()=>{
  const width=18*28,mask=new Uint8Array(width*width);
  for(let y=60;y<85;y++)for(let x=70;x<95;x++)mask[y*width+x]=1;
  assert.equal(separateRoundHoles(mask,width,width).holes.length,0);
});
