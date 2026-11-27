import test from "node:test";
import assert from "node:assert/strict";
import {estimatePrintedGrid} from "../src/maze-printed-grid.mjs";
import {suggestWalls} from "../src/maze-recognize.mjs";

const size=504, pitch=size/18;
function paper({shearX=0,shearY=0,shiftX=0,shiftY=0,
    absentNearX=false,wall=false,lines=true}={}){
  const data=new Uint8ClampedArray(size*size*4);
  const mod=(x,n)=>((x%n)+n)%n;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    // Printed 18 x 18 lines can diverge after an incorrectly chosen
    // quadrilateral even when the full-image phase averages near zero.
    const vertical=lines&&!(absentNearX&&y<size*.4)&&
      mod(x-shiftX-shearX*(y/size-.5),pitch)<1.2;
    const horizontal=lines&&
      mod(y-shiftY-shearY*(x/size-.5),pitch)<1.2;
    const block=wall&&x>=140&&x<=157&&y>=104&&y<194;
    const light=230-10*x/size+8*y/size;
    const value=block?32:vertical||horizontal?light-84:light;
    const index=(y*size+x)*4;
    data[index]=data[index+1]=data[index+2]=value;
    data[index+3]=255;
  }
  return {width:size,height:size,data};
}
const read=image=>estimatePrintedGrid(image,{expectedColumns:18,expectedRows:18});
test("strong printed lines agree between both ends of a correctly aligned paper",()=>{
  const observed=read(paper());
  assert.equal(observed.columns?.cells,18);
  assert.equal(observed.rows?.cells,18);
  assert.ok(observed.alignment.columns,"Both vertical-line bands should resolve");
  assert.ok(observed.alignment.rows,"Both horizontal-line bands should resolve");
  assert.ok(observed.alignment.columns.driftCells<=.10);
  assert.ok(observed.alignment.rows.driftCells<=.10);
  assert.notEqual(suggestWalls(paper()).quality,"grid-skew");
});

test("opposing vertical-line shifts expose skew hidden by global averaging",()=>{
  const image=paper({shearX:20});
  const observed=read(image);
  assert.ok(observed.alignment.columns,
    "Separated printed-line bands should each be independently measurable");
  assert.ok(observed.alignment.columns.driftCells>.30,
    "Opposite local shifts should differ by more than .30 cell");
  const result=suggestWalls(image);
  assert.equal(result.quality,"grid-skew");
  assert.deepEqual(result.suggestions,[]);
  assert.deepEqual(result.holes,[]);
  assert.deepEqual(result.markers,[]);
  assert.match(result.message,/vertical printed lines/);
});
test("horizontal-line skew is checked independently from vertical lines",()=>{
  const image=paper({shearY:20});
  assert.ok(read(image).alignment.rows.driftCells>.30);
  const result=suggestWalls(image);
  assert.equal(result.quality,"grid-skew");
  assert.match(result.message,/horizontal printed lines/);
});
test("small constant shifts and an actual dark wall are not mislabeled as perspective skew",()=>{
  for(const options of [{shiftX:2,shiftY:2},{wall:true},{shearX:4,shearY:4}]){
    const image=paper(options);
    const result=suggestWalls(image);
    assert.notEqual(result.quality,"grid-skew",JSON.stringify(options));
  }
});
test("missing or obscured band evidence does not manufacture shear",()=>{
  for(const options of [{lines:false},{absentNearX:true}]){
    const observed=read(paper(options));
    assert.equal(observed.alignment.columns,null,JSON.stringify(options));
    const result=suggestWalls(paper(options));
    assert.notEqual(result.quality,"grid-skew",JSON.stringify(options));
  }
});
test("diagnostic leaves photographed pixels untouched",()=>{
  const image=paper({shearX:20}),before=image.data.slice();
  read(image);
  suggestWalls(image);
  assert.deepEqual(image.data,before);
});
