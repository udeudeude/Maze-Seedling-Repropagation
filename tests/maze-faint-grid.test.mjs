import test from "node:test";
import assert from "node:assert/strict";
import {estimatePrintedGrid} from "../src/maze-printed-grid.mjs";
import {suggestWalls} from "../src/maze-recognize.mjs";

// Independent model of the *faint grey printed paper*, not a claimed sample
// from the Seedling scanner. The real-world photo remains third-party only.
function sheet({columns=18,rows=18,contrast=9,shiftX=0,shiftY=0,
    horizontal=true,vertical=true,partial=false,shear=0,walls=true}={}){
  const width=504,height=504;
  const data=new Uint8ClampedArray(width*height*4);
  const mod=(a,b)=>((a%b)+b)%b;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const baseline=230-16*x/width+8*y/height;
    const warp=shear*(y/height-.5);
    const inkX=vertical&&(!partial||y<height*.38)&&
      mod(x-shiftX-warp,width/columns)<1.7;
    const inkY=horizontal&&mod(y-shiftY,height/rows)<1.7;
    const block=walls&&(
      x>=125&&x<143&&y>=70&&y<182||
      y>=312&&y<331&&x>=282&&x<400);
    const value=block?36:(inkX||inkY)?baseline-contrast:baseline;
    data.set([value,value,value,255],(y*width+x)*4);
  }
  return {width,height,data};
}

test("recovers faint 18-square printed ink beneath actual dark wall silhouettes",()=>{
  const photo=sheet(),before=photo.data.slice();
  const result=estimatePrintedGrid(photo,{expectedColumns:18,expectedRows:18});
  assert.equal(result.status,"supported",JSON.stringify(result));
  assert.equal(result.columns.cells,18);
  assert.equal(result.rows.cells,18);
  assert.equal(result.columns.inkEvidence,"faint");
  assert.equal(result.rows.inkEvidence,"faint");
  assert.ok(result.columns.matchedLines>=14);
  assert.ok(result.rows.matchedLines>=14);
  assert.ok(result.alignment.columns.driftCells<=.12);
  assert.ok(result.alignment.rows.driftCells<=.12);
  assert.deepEqual(photo.data,before);
});

test("the faint ink's measured phase detects a half-cell misregistration",()=>{
  const image=sheet({shiftX:14,walls:false});
  const measured=estimatePrintedGrid(image,{expectedColumns:18,expectedRows:18});
  assert.equal(measured.columns?.inkEvidence,"faint",JSON.stringify(measured));
  assert.ok(measured.columns.phaseOffsetCells>.3);
  const scan=suggestWalls(image);
  assert.equal(scan.quality,"grid-offset");
  assert.equal(scan.suggestions.length,0);
});

test("an independently repeated faint 12-square grid contradicts an 18-square import",()=>{
  const image=sheet({columns:12,rows:12,walls:false});
  const measured=estimatePrintedGrid(image,{expectedColumns:18,expectedRows:18});
  // A *weak* alternative-period hypothesis cannot by itself pass a
  // consistency check against the 18-square expected geometry.
  assert.equal(measured.columns,null);
  assert.equal(measured.rows,null);
  assert.notEqual(suggestWalls(image).quality,"grid-mismatch");
});

test("uniform, graded, sparse, partial and overly faint paper cannot invent alignment",()=>{
  for(const options of [
    {vertical:false,horizontal:false,walls:false},
    {vertical:false,horizontal:false,walls:true},
    {contrast:2,walls:false},
    {partial:true,walls:false}
  ]){
    const result=estimatePrintedGrid(sheet(options),
      {expectedColumns:18,expectedRows:18});
    assert.notEqual(result.status,"supported",JSON.stringify(options));
  }
});

test("a faint but sheared lattice cannot be accepted as fully calibrated",()=>{
  const image=sheet({shear:21,walls:false});
  const result=estimatePrintedGrid(image,{expectedColumns:18,expectedRows:18});
  assert.equal(result.columns,null,
    "Faint lines with inconsistent near/far phase must be rejected");
});
