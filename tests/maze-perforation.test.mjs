import test from "node:test";
import assert from "node:assert/strict";
import {suggestWalls} from "../src/maze-recognize.mjs";

/** Procedural negative control based on photographed original kit construction.
 * The bare wooden board has a dense regular array of exposed dark holes;
 * the removable paper-grid maze has only selectively punched traps.
 * No proprietary photograph, layout or copied artwork is distributed.
 */
function sample({perforations=324,wall=false}={}){
  const cells=18,pitch=28,size=cells*pitch;
  const data=new Uint8ClampedArray(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const cx=Math.floor(x/pitch),cz=Math.floor(y/pitch);
    const dotIndex=cz*cells+cx;
    const dot=dotIndex<perforations&&
      Math.hypot(x-(cx+.5)*pitch,y-(cz+.5)*pitch)<pitch*.27;
    const block=wall&&cx>=3&&cx<=10&&cz===8&&
      Math.abs(y-(cz+.5)*pitch)<pitch*.18;
    const v=block?24:dot?17:226;
    data.set([v,v,v,255],(y*size+x)*4);
  }
  return {width:size,height:size,data};
}

test("photograph of exposed perforated base is not imported as hundreds of traps",()=>{
  const image=sample(),pixelBefore=image.data[0];
  const result=suggestWalls(image);
  assert.equal(result.quality,"dense-perforations");
  assert.match(result.message,/wooden base/);
  assert.deepEqual(result.suggestions,[]);
  assert.deepEqual(result.holes,[]);
  assert.deepEqual(result.markers,[]);
  assert.equal(image.data[0],pixelBefore,"Scanner must not alter photograph");
  assert.equal(suggestWalls(image,{sensitivity:.95}).quality,"dense-perforations");
});
test("partly covered base remains quarantined despite plausible wall shapes",()=>{
  const result=suggestWalls(sample({perforations:170,wall:true}));
  assert.equal(result.quality,"dense-perforations");
  assert.deepEqual(result.suggestions,[]);
  assert.deepEqual(result.holes,[]);
  assert.deepEqual(result.markers,[]);
});
test("a few intentionally punched holes do not trigger bare-base warning",()=>{
  const result=suggestWalls(sample({perforations:3,wall:true}));
  assert.notEqual(result.quality,"dense-perforations");
  assert.ok(result.holes.length>=1,"Real isolated holes remain candidates");
});

test("three sparse holes on otherwise bright paper still have detectable contrast",()=>{
  const result=suggestWalls(sample({perforations:3}));
  assert.notEqual(result.quality,"low-contrast");
  assert.notEqual(result.quality,"dense-perforations");
  assert.ok(result.holes.length>=1,
    "Sparse black paper cutouts must not be rejected by an eighth-percentile contrast floor");
});
