import test from "node:test";
import assert from "node:assert/strict";
import {suggestPrintedGridRefinement} from "../src/maze-grid-refine.mjs";

const size=504,pitch=size/18;
const corners=[
  {x:48,y:48},{x:552,y:48},{x:552,y:552},{x:48,y:552}
];
const wrap=n=>((n%pitch)+pitch)%pitch;
function printedPaper({shiftX=0,shiftY=0,shearX=0,shearY=0,
  wall=false,missing=false}={}){
  const data=new Uint8ClampedArray(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const vertical=!missing&&wrap(x-shiftX-shearX*(y/size-.5))<1.2;
    const horizontal=!missing&&wrap(y-shiftY-shearY*(x/size-.5))<1.2;
    const block=wall&&x>122&&x<144&&y>64&&y<210;
    const light=232-8*x/size+7*y/size;
    const value=block?29:vertical||horizontal?light-86:light;
    const index=(y*size+x)*4;
    data[index]=data[index+1]=data[index+2]=value;
    data[index+3]=255;
  }
  return {width:size,height:size,data};
}
const refine=(photo,origin=corners)=>
  suggestPrintedGridRefinement(photo,origin,600,600);

test("visible 18 by 18 ink gives a small correction to a misregistered photograph",()=>{
  const photo=printedPaper({shiftX:4,shiftY:-3});
  const before=photo.data.slice();
  const change=refine(photo);
  assert.ok(change,"Both independent axes should support a small adjustment");
  assert.ok(Math.abs(change.corners[0].x-corners[0].x-4)<2,
    "Adjust original-photo X coordinate, not the digital cell index");
  assert.ok(Math.abs(change.corners[0].y-corners[0].y+3)<2);
  assert.ok(Math.abs(change.corners[2].x-corners[2].x-4)<2);
  assert.ok(Math.abs(change.corners[2].y-corners[2].y+3)<2);
  assert.deepEqual(photo.data,before,"Never change the user's photo pixels");
  assert.deepEqual(corners,[
    {x:48,y:48},{x:552,y:48},{x:552,y:552},{x:48,y:552}
  ],"Never mutate current calibration before explicit approval");
});
test("an observed sub-cell offset corrects a synthetic object's grid square",()=>{
  // This is an artificial coordinate control, not an annotated Seedling board.
  // A physical center is 2px to the right of the old fifth grid boundary,
  // but 2px to the LEFT of the observed printed-ink boundary.
  const centerX=48+5*pitch+2;
  const oldCell=Math.floor((centerX-corners[0].x)/pitch);
  const change=refine(printedPaper({shiftX:4}));
  assert.ok(change);
  const newCell=Math.floor((centerX-change.corners[0].x)/pitch);
  assert.equal(oldCell,5);
  assert.equal(newCell,4);
  assert.equal(change.corners.length,4);
});
test("clean grid, unsupported ink and non-grid walls produce no invented correction",()=>{
  for(const config of [{},{missing:true},{missing:true,wall:true}]){
    assert.equal(refine(printedPaper(config)),null,JSON.stringify(config));
  }
});
test("large ambiguously phased shifts require manual re-alignment",()=>{
  for(const config of [{shiftX:9},{shiftY:-9}]){
    assert.equal(refine(printedPaper(config)),null,JSON.stringify(config));
  }
});
test("cross-band perspective disagreement is not treated as a translation",()=>{
  for(const config of [{shearX:20},{shearY:20}]){
    assert.equal(refine(printedPaper(config)),null,JSON.stringify(config));
  }
});
test("proposed corners may not be projected beyond the original photograph",()=>{
  const nearEdge=[{x:0,y:0},{x:503,y:0},{x:503,y:503},{x:0,y:503}];
  assert.equal(suggestPrintedGridRefinement(printedPaper({shiftX:4}),
    nearEdge,504,504),null);
});
test("invalid or folding source corners fail before producing false calibration",()=>{
  assert.throws(()=>refine(printedPaper({shiftX:3}),
    [corners[0],corners[3],corners[2],corners[1]]),/clockwise/);
});
