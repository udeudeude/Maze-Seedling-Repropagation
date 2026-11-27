import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {measurePhotoProposals,compareHoleRegistration} from "../scripts/probe-seedling-photo.mjs";

test("private historical-photo probe reports aggregate scan stability only",()=>{
  // Procedural negative control. The actual third-party photo is not stored
  // in the repository or downloaded by the normal automated tests.
  const width=512,data=new Uint8ClampedArray(width*width*4);
  for(let i=0;i<data.length;i+=4)data.set([235,235,235,255],i);
  const result=measurePhotoProposals(data,{corners:[
    {x:16,y:16},{x:496,y:16},{x:496,y:496},{x:16,y:496}
  ],variants:[{name:"first",margin:0},{name:"second",margin:.05}],
  cornerVariants:[{name:"shift-right",offsets:[
    {x:6,y:0},{x:6,y:0},{x:6,y:0},{x:6,y:0}
  ]}]});
  assert.equal(result.fineRefinement.eligible,false,
    "Uniform paper must never yield a phantom image registration");
  assert.equal(result.fineRefinement.shiftCells,null);
  assert.equal(result.observed.length,2);
  assert.ok(result.sensitivityToGridCropping[0].holeRegistration);
  assert.equal(result.sensitivityToGridCropping[0].holeRegistration.matchedSourcePhotoCenters,0);
  assert.ok(result.sensitivityToCornerPlacement[0].holeRegistration);
  assert.equal(result.observed[0].wallTileCount,0);
  assert.equal(result.sensitivityToGridCropping[0].intersectionOverUnion,null);
  assert.equal(result.sensitivityToCornerPlacement.length,1);
  assert.equal(result.sensitivityToCornerPlacement[0].versus,"shift-right");
  assert.equal(result.sensitivityToCornerPlacement[0].maximumHandleDisplacementPixels,6);
  assert.equal(result.sensitivityToCornerPlacement[0].wallTileCount,0);
  assert.equal(result.sensitivityToCornerPlacement[0].intersectionOverUnion,null);
  assert.equal(JSON.stringify(result).includes('"offsets"'),false);
  assert.equal(JSON.stringify(result).includes('"corners"'),false);
  assert.equal(result.labelStatus.includes("no accuracy claim"),true);
  assert.equal(JSON.stringify(result).includes("wallCells"),false);
  assert.equal(JSON.stringify(result).includes("Uint8"),false);
  assert.throws(()=>measurePhotoProposals(new Uint8Array(12)),RangeError);
});
test("photo reconnaissance remains a separate, one-off external-data workflow",()=>{
  const workflow=readFileSync(new URL("../.github/workflows/scan-reference.yml",import.meta.url),"utf8");
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/scripts\/probe-seedling-photo\.mjs/);
  assert.match(workflow,/sha256/);
  assert.doesNotMatch(workflow,/upload-artifact|upload-pages-artifact|deploy-pages/);
});

test("source-coordinate matching separates lost circles from changed cell assignment",()=>{
  const baseline=[
    {x:1,z:2,sourceX:60,sourceY:90},
    {x:4,z:5,sourceX:120,sourceY:160},
    {x:8,z:9,sourceX:300,sourceY:330}
  ];
  const moved=[
    {x:2,z:2,sourceX:63,sourceY:94}, // same paper hole, wrong grid cell
    {x:4,z:5,sourceX:122,sourceY:160}, // same paper hole, same cell
    {x:14,z:2,sourceX:400,sourceY:400}, // unrelated new candidate
  ];
  const original=JSON.stringify({baseline,moved});
  const result=compareHoleRegistration(baseline,moved);
  assert.deepEqual(result,{
    sourcePhotoTolerancePixels:6,baselineCandidates:3,comparisonCandidates:3,
    matchedSourcePhotoCenters:2,missingBaselineCenters:1,
    unmatchedComparisonCenters:1,sameGridCell:1,reassignedGridCell:1,
    meanMatchedCenterDisplacementPixels:3.5
  });
  assert.equal(JSON.stringify({baseline,moved}),original);
  assert.ok(!JSON.stringify(result).includes("sourceX"),
    "Never expose proprietary photograph positions in public logs");
});

test("source-coordinate matching is one-to-one and cannot reward duplicate detections",()=>{
  const baseline=[{x:1,z:1,sourceX:100,sourceY:100}];
  const observed=[
    {x:1,z:1,sourceX:101,sourceY:100},
    {x:1,z:1,sourceX:102,sourceY:100},
    {x:1,z:1,sourceX:130,sourceY:100}
  ];
  const result=compareHoleRegistration(baseline,observed);
  assert.equal(result.matchedSourcePhotoCenters,1);
  assert.equal(result.unmatchedComparisonCenters,2);
  assert.equal(result.sameGridCell,1);
  assert.equal(compareHoleRegistration([],[]).meanMatchedCenterDisplacementPixels,null);
  assert.equal(compareHoleRegistration(baseline,[
    {x:1,z:1,sourceX:107,sourceY:100}
  ]).matchedSourcePhotoCenters,0);
  assert.throws(()=>compareHoleRegistration(baseline,observed,0),TypeError);
  assert.throws(()=>compareHoleRegistration(baseline,[{x:1,z:1,sourceX:NaN,sourceY:2}]),TypeError);
});
