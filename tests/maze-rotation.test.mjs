import test from "node:test";
import assert from "node:assert/strict";
import {suggestWalls} from "../src/maze-recognize.mjs";

/**
 * Independent synthetic grid, not a copied Seedling maze or a user's photograph.
 * A real 18x18 assembled board photograph prompted this orientation control.
 * Four quarter-turns are FOUR VIEWS OF ONE SCENE, not four independent samples
 * for measuring recognition precision or recall.
 */
const CELLS=18,PITCH=28,SIDE=CELLS*PITCH;
const key=(x,z)=>x+","+z;

function sample(){
  const data=new Uint8ClampedArray(SIDE*SIDE*4);
  const walls=new Set([
    [2,4],[3,4],[4,4],[5,4],[10,3],[10,4],[10,5],
    [12,8],[13,8],[14,8],[5,12],[5,13],[5,14],
    [7,10],[8,10],[9,10],[9,11]
  ].map(([x,z])=>key(x,z)));
  const holes=new Set([[3,8],[11,11],[15,5]].map(([x,z])=>key(x,z)));
  for(let y=0;y<SIDE;y++)for(let x=0;x<SIDE;x++){
    const cx=Math.floor(x/PITCH),cz=Math.floor(y/PITCH);
    const dx=x%PITCH-PITCH/2,dy=y%PITCH-PITCH/2;
    const cell=key(cx,cz);
    const grid=x%PITCH===0||y%PITCH===0;
    const hole=holes.has(cell)&&Math.hypot(dx,dy)<PITCH*.27;
    const marker=Math.abs(dx)<PITCH*.3&&Math.abs(dy)<PITCH*.3;
    const rgb=hole?[10,10,12]:
      walls.has(cell)&&Math.abs(dx)<PITCH*.45&&Math.abs(dy)<PITCH*.45
        ?[31,32,34]:
      marker&&cx===1&&cz===1?[182,42,45]:
      marker&&cx===16&&cz===16?[40,150,175]:
      grid?[166,160,150]:[234,228,217];
    data.set([...rgb,255],(y*SIDE+x)*4);
  }
  return {width:SIDE,height:SIDE,data};
}

function clockwise(image){
  const {width:w,height:h,data}=image;
  assert.equal(w,h);
  const turned=new Uint8ClampedArray(data.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const from=(y*w+x)*4;
    const to=(x*w+(w-1-y))*4;
    for(let c=0;c<4;c++)turned[to+c]=data[from+c];
  }
  return {width:w,height:h,data:turned};
}

// Undo clockwise coordinate rotations after recognition, not before scanning.
function unturn(point,clockwiseTurns){
  let {x,z}=point;
  for(let i=0;i<clockwiseTurns;i++)[x,z]=[z,CELLS-1-x];
  return key(x,z);
}
function coordinates(entries,turns){
  return entries.map(entry=>unturn(entry,turns)).sort();
}
function coloredMarkers(entries,turns){
  return entries.map(entry=>entry.type+":"+unturn(entry,turns)).sort();
}

test("physical-grid scanning is consistent across all four right-angle orientations",()=>{
  let picture=sample();
  const baseline=suggestWalls(picture);
  assert.ok(baseline.suggestions.length>=10,"Control has detectable walls");
  assert.ok(baseline.holes.length>=2,"Control has detectable punched holes");
  assert.equal(baseline.markers.length,2,"Control has two colored markers");
  const expectedWalls=coordinates(baseline.suggestions,0);
  const expectedHoles=coordinates(baseline.holes,0);
  const expectedMarkers=coloredMarkers(baseline.markers,0);
  for(let turns=1;turns<4;turns++){
    picture=clockwise(picture);
    const result=suggestWalls(picture);
    assert.equal(result.quality,baseline.quality,
      "A quarter-turn must not change scanning quality");
    assert.deepEqual(coordinates(result.suggestions,turns),expectedWalls,
      "Wall positions must rotate back to the same actual maze");
    assert.deepEqual(coordinates(result.holes,turns),expectedHoles,
      "Punched holes must rotate back to the same squares");
    assert.deepEqual(coloredMarkers(result.markers,turns),expectedMarkers,
      "Sticker identity must not be inferred from its corner or orientation");
  }
});
