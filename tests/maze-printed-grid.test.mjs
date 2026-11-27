import test from "node:test";
import assert from "node:assert/strict";
import {estimatePrintedGrid} from "../src/maze-printed-grid.mjs";
import {suggestWalls} from "../src/maze-recognize.mjs";

function photo({cells=18,rows=cells,grid=true,gridLinesX=true,gridLinesY=true,
  blank=false,contrast=68,shiftX=0,shiftY=0}={}){
  const size=504,data=new Uint8ClampedArray(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const mod=(value,divisor)=>((value%divisor)+divisor)%divisor;
    const printed=grid&&((gridLinesX&&mod(x-shiftX,size/cells)<1.2)||
      (gridLinesY&&mod(y-shiftY,size/rows)<1.2));
    const wall=!blank&&(x>size*.26&&x<size*.29&&y>size*.14&&y<size*.44||
      y>size*.55&&y<size*.58&&x>size*.5&&x<size*.8);
    const light=231-25*x/size+12*y/size;
    const v=wall?36:printed?light-contrast:light;
    data.set([v,v,v,255],(y*size+x)*4);
  }
  return {width:size,height:size,data};
}
test("observes an 18-square printed grid despite wall blocks and uneven light",()=>{
  const measured=estimatePrintedGrid(photo());
  assert.equal(measured.status,"supported");
  assert.equal(measured.columns.cells,18);
  assert.equal(measured.rows.cells,18);
});
test("measures alternative periodicity without changing source document size",()=>{
  const measured=estimatePrintedGrid(photo({cells:12}));
  assert.equal(measured.status,"supported");
  assert.equal(measured.columns.cells,12);
  assert.equal(measured.rows.cells,12);
});
test("no printed-grid evidence means no confident inferred geometry",()=>{
  assert.equal(estimatePrintedGrid(photo({grid:false,blank:true})).status,"unresolved");
  assert.equal(estimatePrintedGrid(photo({grid:false})).status,"unresolved");
});
test("disagreeing axes are not accepted as a supported square grid",()=>{
  const result=estimatePrintedGrid(photo({cells:12,rows:18}));
  assert.equal(result.status,"inconsistent");
  assert.equal(result.columns.cells,12);
  assert.equal(result.rows.cells,18);
});
test("missing horizontal printed lines cannot be invented from walls",()=>{
  const image=photo(),size=image.width;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    if(Math.abs(y%28)<2 && Math.abs(x%28)>=2){
      const v=231-25*x/size+12*y/size;
      image.data.set([v,v,v,255],(y*size+x)*4);
    }
  }
  assert.equal(estimatePrintedGrid(image).status,"unresolved");
});
test("scanner withholds automated placement on a convincing grid mismatch",()=>{
  const image=photo({cells:12});
  const result=suggestWalls(image,{columns:18,rows:18});
  assert.equal(result.quality,"grid-mismatch");
  assert.deepEqual(result.suggestions,[]);
  assert.deepEqual(result.holes,[]);
  assert.deepEqual(result.markers,[]);
  assert.equal(result.printedGrid.columns.cells,12);
  assert.equal(result.printedGrid.rows.cells,12);
  assert.equal(suggestWalls(image,{columns:12,rows:12}).quality!=="grid-mismatch",true);
});

test("confident disagreement between printed axes still blocks a wrongly sized import",()=>{
  const image=photo({cells:12,rows:18});
  const result=suggestWalls(image,{columns:18,rows:18});
  assert.equal(result.printedGrid.status,"inconsistent");
  assert.equal(result.quality,"grid-mismatch");
  assert.deepEqual(result.suggestions,[]);
  assert.deepEqual(result.holes,[]);
  assert.deepEqual(result.markers,[]);
  assert.equal(result.printedGrid.columns.cells,12);
  assert.equal(result.printedGrid.rows.cells,18);
});
test("matching rectangular document geometry is not rejected solely for unequal axes",()=>{
  const image=photo({cells:12,rows:18});
  const result=suggestWalls(image,{columns:12,rows:18});
  assert.equal(result.printedGrid.status,"inconsistent");
  assert.notEqual(result.quality,"grid-mismatch");
});

test("a single strong width contradiction blocks proposals when rows are obscured",()=>{
  const image=photo({cells:12,gridLinesY:false});
  const measured=estimatePrintedGrid(image);
  assert.equal(measured.columns.cells,12);
  assert.equal(measured.rows,null);
  const result=suggestWalls(image,{columns:18,rows:18});
  assert.equal(result.quality,"grid-mismatch");
  assert.match(result.message,/width: 12 observed vs 18 expected/);
  assert.deepEqual(result.suggestions,[]);
  assert.deepEqual(result.holes,[]);
  assert.deepEqual(result.markers,[]);
});
test("a single strong height contradiction blocks proposals when columns are obscured",()=>{
  const image=photo({rows:12,gridLinesX:false});
  const measured=estimatePrintedGrid(image);
  assert.equal(measured.columns,null);
  assert.equal(measured.rows.cells,12);
  const result=suggestWalls(image,{columns:18,rows:18});
  assert.equal(result.quality,"grid-mismatch");
  assert.match(result.message,/height: 12 observed vs 18 expected/);
  assert.deepEqual(result.suggestions,[]);
  assert.deepEqual(result.holes,[]);
  assert.deepEqual(result.markers,[]);
});
test("a single matching visible axis remains available for reviewed import",()=>{
  const image=photo({gridLinesY:false});
  const measured=estimatePrintedGrid(image);
  assert.equal(measured.columns.cells,18);
  assert.equal(measured.rows,null);
  const result=suggestWalls(image,{columns:18,rows:18});
  assert.notEqual(result.quality,"grid-mismatch");
});

test("matching line counts still reject a photographed grid shifted by half a square",()=>{
  const image=photo({shiftX:14});
  const measured=estimatePrintedGrid(image);
  assert.equal(measured.columns.cells,18);
  assert.equal(measured.rows.cells,18);
  assert.ok(measured.columns.phaseOffsetCells>.3,
    "Expected detectable horizontal registration error");
  assert.ok(measured.rows.phaseOffsetCells<.2);
  const result=suggestWalls(image,{columns:18,rows:18});
  assert.equal(result.quality,"grid-offset");
  assert.match(result.message,/horizontal/);
  assert.deepEqual(result.suggestions,[]);
  assert.deepEqual(result.holes,[]);
  assert.deepEqual(result.markers,[]);
});
test("partly hidden lines can reveal vertical phase offset independently",()=>{
  const image=photo({gridLinesX:false,shiftY:14});
  const measured=estimatePrintedGrid(image);
  assert.equal(measured.columns,null);
  assert.equal(measured.rows.cells,18);
  assert.ok(measured.rows.phaseOffsetCells>.3);
  const result=suggestWalls(image,{columns:18,rows:18});
  assert.equal(result.quality,"grid-offset");
  assert.match(result.message,/vertical/);
  assert.deepEqual(result.suggestions,[]);
});
test("proper registration and small sampling jitter do not trigger offset warning",()=>{
  for(const shift of [0,1,2]){
    const image=photo({shiftX:shift,shiftY:shift});
    const measured=estimatePrintedGrid(image);
    assert.equal(measured.columns.cells,18);
    assert.equal(measured.rows.cells,18);
    assert.ok(measured.columns.phaseOffsetCells<.25);
    assert.ok(measured.rows.phaseOffsetCells<.25);
    assert.notEqual(suggestWalls(image,{columns:18,rows:18}).quality,"grid-offset");
  }
});
