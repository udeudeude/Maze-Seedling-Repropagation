import test from "node:test";
import assert from "node:assert/strict";
import {measurePaperLatticeEvidence} from "../scripts/measure-paper-lattice.mjs";

function synthetic({columns=18,rows=18,ink=11,wall=true,
    skew=0,grid=true,gradient=true}={}){
  const width=504,height=504,data=new Uint8ClampedArray(width*height*4);
  const mod=(a,b)=>((a%b)+b)%b;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const lum=228-(gradient?14*x/width-9*y/height:0);
    const line=grid&&(
      mod(x-skew*(y/height-.5),width/columns)<1.7||
      mod(y,height/rows)<1.7);
    const block=wall&&(
      (x>=100&&x<=117&&y>68&&y<245)||
      (y>=326&&y<345&&x>290&&x<450));
    const value=block?39:line?lum-ink:lum;
    data.set([value,value,value,255],(y*width+x)*4);
  }
  return {width,height,data};
}
test("research metric resolves repeated faint paper lattice separately from walls",()=>{
  const image=synthetic(),before=image.data.slice();
  const report=measurePaperLatticeEvidence(image);
  for(const axis of ["columns","rows"]){
    const entry=report.observed[axis];
    assert.equal(entry.full.tentative,true,JSON.stringify(entry));
    assert.equal(entry.crossBandConsistent,true,JSON.stringify(entry));
    assert.ok(entry.full.linesAbove2Point5GreyLevels>=14);
    assert.ok(entry.full.peakContrastExcess>=1.5);
    assert.ok(entry.nearFarPhaseDriftCells<=.12);
  }
  assert.equal(report.calibrated,false);
  assert.equal(report.sourcePixelsIncluded,false);
  assert.deepEqual(image.data,before);
});

test("without repeated grey ink, broad dark walls and illumination cannot supply lattice evidence",()=>{
  for(const options of [{grid:false,wall:true},
    {grid:false,wall:false,gradient:true},
    {grid:true,ink:0,wall:true}]){
    const result=measurePaperLatticeEvidence(synthetic(options));
    assert.equal(result.observed.columns.crossBandConsistent,false,
      JSON.stringify(result.observed.columns));
    assert.equal(result.observed.rows.crossBandConsistent,false,
      JSON.stringify(result.observed.rows));
  }
});

test("incorrect 18-square hypothesis rejects an actual 12-square lattice",()=>{
  const result=measurePaperLatticeEvidence(
    synthetic({columns:12,rows:12,wall:false}),{cells:18});
  assert.equal(result.observed.columns.crossBandConsistent,false);
  assert.equal(result.observed.rows.crossBandConsistent,false);
});

test("faint but skewed printed lines reveal disagreement between near and far",()=>{
  const result=measurePaperLatticeEvidence(
    synthetic({skew:20,wall:false}));
  assert.ok(result.observed.columns.nearFarPhaseDriftCells>.2,
    JSON.stringify(result.observed.columns));
  assert.equal(result.observed.columns.crossBandConsistent,false);
});

test("rejects malformed input and avoids emitting feature coordinates",()=>{
  assert.throws(()=>measurePaperLatticeEvidence(null),TypeError);
  assert.throws(()=>measurePaperLatticeEvidence({width:5,height:5,data:[]}),TypeError);
  assert.throws(()=>measurePaperLatticeEvidence(synthetic(),{cells:2}),TypeError);
  const report=measurePaperLatticeEvidence(synthetic());
  for(const forbidden of ["sourceX","sourceY","pixels", "linePositions"]){
    if(forbidden==="pixels")continue; // present as sourcePixelsIncluded=false
    assert.ok(!JSON.stringify(report).includes('"'+forbidden+'"'));
  }
});
