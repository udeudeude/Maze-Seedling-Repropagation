import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {quarterCellWallCoverages,classifyWallRegistration} from
  "../src/maze-registration-stability.mjs";
import {suggestWalls} from "../src/maze-recognize.mjs";

function maskFixture(){
  const width=72,height=72,columns=6,rows=6;
  const mask=new Uint8Array(width*height);
  function rectangle(x0,y0,x1,y1){
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)mask[y*width+x]=1;
  }
  rectangle(27,27,34,34); // Central wall, far enough from grid boundary.
  rectangle(34,39,40,46); // Split across a vertical grid boundary.
  return {mask,width,height,columns,rows};
}

test("quarter-cell perturbations distinguish central from edge-dependent wall cells",()=>{
  const sample=maskFixture(),original=sample.mask.slice();
  const coverages=quarterCellWallCoverages(...Object.values(sample));
  assert.equal(coverages.length,4);
  const candidates=[{x:2,z:2},{x:2,z:3}];
  const result=classifyWallRegistration(candidates,coverages,.08,6,6);
  assert.deepEqual(result.stable,[candidates[0]]);
  assert.deepEqual(result.uncertain,[candidates[1]]);
  assert.equal(result.offsetCells,.25);
  assert.ok(result.shiftOnlyCount>=1,"New squares emerge as origin moves");
  assert.ok(result.minOverlap<1);
  assert.deepEqual(sample.mask,original,"The classifier cannot alter original pixels");
});

test("borderline candidates cannot be promoted merely by a permissive base threshold",()=>{
  const sample=maskFixture();
  const coverages=quarterCellWallCoverages(...Object.values(sample));
  const candidate={x:2,z:2};
  const low=classifyWallRegistration([candidate],coverages,.08,6,6);
  const high=classifyWallRegistration([candidate],coverages,.3,6,6);
  assert.equal(low.stable.length,1);
  assert.equal(high.stable.length,0);
  assert.equal(high.uncertain.length,1);
});

test("blank boards yield no invented candidates, no fake perfect accuracy",()=>{
  const coverages=quarterCellWallCoverages(new Uint8Array(72*72),72,72,6,6);
  const result=classifyWallRegistration([],coverages,.2,6,6);
  assert.equal(result.minOverlap,null);
  assert.equal(result.shiftOnlyCount,0);
  assert.deepEqual(result.stable,[]);
  assert.deepEqual(result.uncertain,[]);
});

test("reject inconsistent masks, unsupported grids and missing shifted evidence",()=>{
  assert.throws(()=>quarterCellWallCoverages(new Uint8Array(17),72,72,6,6),TypeError);
  assert.throws(()=>quarterCellWallCoverages(new Uint8Array(72*72),72,72,100,6),TypeError);
  assert.throws(()=>classifyWallRegistration([],[],.1,6,6),TypeError);
  assert.throws(()=>classifyWallRegistration([],[
    new Float32Array(36),new Float32Array(36),new Float32Array(36),
    new Float32Array(35)],.1,6,6),TypeError);
});

test("experimental photo scanner exposes sensitive proposals without changing original layout",()=>{
  const width=504,columns=18,data=new Uint8ClampedArray(width*width*4);
  for(let y=0;y<width;y++)for(let x=0;x<width;x++){
    const a=(y*width+x)*4;
    const wall=x>=7*28+5&&x<7*28+23&&y>=6*28+4&&y<11*28+24;
    const rgb=wall?[30,32,34]:[232,230,220];
    data.set([...rgb,255],a);
  }
  const image={width,height:width,data},snapshot=data.slice();
  const result=suggestWalls(image,{columns,rows:columns});
  assert.ok(result.suggestions.length>0,"Real dark strip must be recognized");
  assert.ok(result.registrationSensitivity);
  assert.equal(result.stableSuggestions.length+result.unstableSuggestions.length,
    result.suggestions.length);
  assert.ok(result.stableSuggestions.every(item=>
    result.suggestions.some(candidate=>candidate.x===item.x&&candidate.z===item.z)));
  assert.deepEqual(data,snapshot,"Analysis must not change user photograph");
});

test("capture UI does not preselect uncertain cells, but allows intentional confirmation",()=>{
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  assert.match(app,/scanResult\.stableSuggestions\?\?scanResult\.suggestions/);
  assert.match(app,/scanResult\?\.unstableSuggestions/);
  assert.match(app,/scanAdded\.add\(key\)/);
  assert.match(app,/scanRemoved\.add\(key\)/);
  assert.match(app,/NOT selected for/);
  assert.match(sw,/maze-registration-stability\.mjs/);
});
