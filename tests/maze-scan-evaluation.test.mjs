import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compareScanReview,holeForPhotoReview} from "../src/maze-scan-evaluation.mjs";

const tile=(x,z)=>({x,z});
test("a fully reviewed wall/hole photograph yields distinct false alarms and misses",()=>{
  const original={
    walls:[tile(1,1),tile(2,2),tile(2,2),tile(5,5)],
    holes:[tile(7,7),tile(8,8)]
  };
  const corrected={
    walls:[tile(1,1),tile(2,2),tile(4,4)],
    holes:[tile(7,7),tile(9,9)]
  };
  const before=JSON.stringify({original,corrected});
  const result=compareScanReview({columns:18,rows:18,suggested:original,reviewed:corrected});
  assert.deepEqual(result.walls,{
    matches:2,falseAlarms:1,misses:1,precision:2/3,recall:2/3
  });
  assert.deepEqual(result.holes,{
    matches:1,falseAlarms:1,misses:1,precision:.5,recall:.5
  });
  assert.deepEqual(result.start,{
    matches:0,falseAlarms:0,misses:0,precision:null,recall:null
  });
  assert.equal(JSON.stringify({original,corrected}),before,"Inputs are never mutated");
});
test("start and finish are evaluated independently with exact square agreement",()=>{
  const result=compareScanReview({columns:18,rows:18,
    suggested:{markers:[{type:"entrance",x:1,z:2},{type:"exit",x:11,z:12}]},
    reviewed:{markers:[{type:"entrance",x:1,z:2},{type:"exit",x:12,z:12}]}
  });
  assert.deepEqual(result.start,{
    matches:1,falseAlarms:0,misses:0,precision:1,recall:1
  });
  assert.deepEqual(result.finish,{
    matches:0,falseAlarms:1,misses:1,precision:0,recall:0
  });
});
test("absence of an actual feature is not mislabeled as perfect recall",()=>{
  const result=compareScanReview({columns:18,rows:18,
    suggested:{walls:[tile(2,3)]},reviewed:{holes:[tile(1,2)]}
  });
  assert.equal(result.walls.precision,0);
  assert.equal(result.walls.recall,null);
  assert.equal(result.holes.precision,null);
  assert.equal(result.holes.recall,0);
});
test("unrecognized empty scans, out-of-bounds evidence, and duplicated cells",()=>{
  const result=compareScanReview({columns:18,rows:18,
    suggested:{walls:[tile(-1,1),tile(2,2),tile(2,2)]},
    reviewed:{walls:[tile(2,2),tile(18,18)]}
  });
  assert.deepEqual(result.walls,{
    matches:1,falseAlarms:0,misses:0,precision:1,recall:1
  });
  assert.throws(()=>compareScanReview({columns:0,rows:18,suggested:{},reviewed:{}}),RangeError);
  assert.throws(()=>compareScanReview({columns:18,rows:18,suggested:{holes:"bad"},reviewed:{}}),TypeError);
});
test("measurement is optional, review-gated, offline, and stripped of original photographs",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  const serviceWorker=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  assert.match(html,/id="scanReviewComplete"/);
  assert.match(html,/id="measureScanButton"[^>]*disabled/);
  assert.match(html,/id="copyScanReportButton"[^>]*hidden/);
  assert.match(app,/compareScanReview\(/);
  assert.match(app,/if\(!photoReferenceMode\|\|!scanResult\|\|!el\("scanReviewComplete"\)\.checked\)return/);
  assert.match(app,/function invalidateScanMeasurement\(\)/);
  assert.match(app,/scanMeasurementReport=JSON\.stringify\(/);
  assert.match(serviceWorker,/\.\/src\/maze-scan-evaluation\.mjs/);
});

test("unverified photographed hole and sticker candidates are never preapproved",()=>{
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  assert.match(app,/scanSelectedHoles=new Map\(\);\s*for\(const \[key,hole\] of scanAddedHoles\)/);
  assert.match(app,/scanMarkers=new Map\(\);\s*for\(const \[type,position\] of scanMarkerEdits\)/);
  assert.match(app,/for\(const hole of scanResult\?\.holes\?\?\[\]\)/);
  assert.match(app,/for\(const marker of scanResult\?\.markers\?\?\[\]\)/);
  assert.match(app,/holeForPhotoReview\(scanResult\?\.holes\?\?\[\],/);
  assert.match(app,/scanMode==="holes"[\s\S]*?const point=reviewPixelAt\(/);
  assert.match(app,/scanMode==="holes"[\s\S]*?holeForPhotoReview\(scanResult\?\.holes\?\?\[\],[\s\S]*?\.\.\.point/);
  assert.doesNotMatch(app,/if\(!scanRejectedHoles.has\(key\)\)scanSelectedHoles.set\(key,hole\)/);
  assert.match(app,/Circle and sticker guesses are NOT selected automatically/);
});

test("explicit approval preserves actual hole center, radius and detector data",()=>{
  const original={x:3,z:7,cx:105.2,cy:201.4,radius:8.4,confidence:.42,
    source:"radial-edge"};
  const candidates=[original,{x:1,z:1,cx:42,cy:42,radius:6}];
  const result=holeForPhotoReview(candidates,{
    x:3,z:7,width:504,height:504,columns:18,rows:18,
    cx:105.6,cy:202.1});
  assert.deepEqual(result,original);
  assert.notStrictEqual(result,original);
  result.radius=999;
  assert.equal(original.radius,8.4,"Approving cannot mutate detector results");
});

test("manually adding a missed hole records the actual tapped photo center",()=>{
  const result=holeForPhotoReview([],{x:2,z:4,width:504,height:504,
    columns:18,rows:18,cx:62.25,cy:135.75});
  assert.deepEqual(result,{x:2,z:4,cx:62.25,cy:135.75,radius:8.4,confidence:0});
  assert.notEqual(result.cx,70,"Do not invent a square midpoint");
  assert.notEqual(result.cy,126,"Do not invent a square midpoint");
});
test("a missing circle is never fabricated from a digital-square midpoint",()=>{
  const args={x:2,z:4,width:504,height:504,columns:18,rows:18};
  for(const tap of [{},{cx:70},{cx:NaN,cy:120},{cx:84,cy:120},
                    {cx:60,cy:140},{cx:60,cy:Infinity},
                    {cx:-1,cy:120},{cx:600,cy:120}])
    assert.throws(()=>holeForPhotoReview([],{...args,...tap}),TypeError);
});

test("rejects invalid cell coordinates and ignores corrupt candidate centers",()=>{
  const r=holeForPhotoReview([{x:2,z:4,cx:NaN,cy:10,radius:8}],
    {x:2,z:4,width:504,height:504,columns:18,rows:18,cx:69.5,cy:125.5});
  assert.equal(r.cx,69.5);
  for(const point of [{x:-1,z:4},{x:18,z:4},{x:0,z:NaN}])
    assert.throws(()=>holeForPhotoReview([],{...point,
      width:504,height:504,columns:18,rows:18}),TypeError);
});

test("a distant false circle in the SAME square never hijacks a manual tap",()=>{
  const candidate={x:3,z:7,cx:88,cy:198,radius:5,confidence:.88};
  const result=holeForPhotoReview([candidate],{
    x:3,z:7,width:504,height:504,columns:18,rows:18,
    cx:109.5,cy:219.5
  });
  assert.deepEqual(result,{x:3,z:7,cx:109.5,cy:219.5,radius:8.4,confidence:0});
  assert.equal(candidate.confidence,.88);
});

test("same-square competing circles approve only the one actually tapped",()=>{
  const left={x:3,z:7,cx:87,cy:203,radius:5,confidence:.5,source:"base-perforation"};
  const right={x:3,z:7,cx:108,cy:203,radius:5,confidence:.4,source:"hole"};
  const candidates=[left,right];
  const result=holeForPhotoReview(candidates,{
    x:3,z:7,width:504,height:504,columns:18,rows:18,cx:108.6,cy:204
  });
  assert.deepEqual(result,right);
  assert.notStrictEqual(result,right);
  assert.deepEqual(candidates,[left,right]);
});

test("tap proximity is image-based, not confidence-ranked or square-wide",()=>{
  const a={x:3,z:7,cx:105,cy:201,radius:8,confidence:.2};
  const b={x:3,z:7,cx:109,cy:201,radius:8,confidence:.99};
  const result=holeForPhotoReview([b,a],{
    x:3,z:7,width:504,height:504,columns:18,rows:18,cx:105.2,cy:201.1
  });
  assert.deepEqual(result,a);
  // Clicking elsewhere in a square with only a high-confidence candidate
  // must not silently transfer its center or status to the new annotation.
  const manual=holeForPhotoReview([a],{
    x:3,z:7,width:504,height:504,columns:18,rows:18,cx:86,cy:217
  });
  assert.equal(manual.confidence,0);
  assert.deepEqual([manual.cx,manual.cy],[86,217]);
});

test("invalid taps cannot be accepted by borrowing a valid nearby detector",()=>{
  const candidate={x:3,z:7,cx:103,cy:201,radius:8,confidence:.8};
  const common={x:3,z:7,width:504,height:504,columns:18,rows:18};
  for(const tap of [{},{cx:103},{cx:NaN,cy:201},
    {cx:112,cy:201},{cx:103,cy:195},{cx:-1,cy:201},
    {cx:Infinity,cy:201}])
    assert.throws(()=>holeForPhotoReview([candidate],{...common,...tap}),TypeError);
});

test("out-of-square and corrupt candidate centers cannot masquerade as verified holes",()=>{
  const common={x:3,z:7,width:504,height:504,columns:18,rows:18,cx:100,cy:201};
  const candidates=[
    {x:3,z:7,cx:115,cy:201,radius:9,confidence:1},
    {x:3,z:7,cx:100,cy:201,radius:NaN,confidence:1},
    {x:3,z:7,cx:Infinity,cy:201,radius:8,confidence:1}
  ];
  const result=holeForPhotoReview(candidates,common);
  assert.deepEqual(result,{x:3,z:7,cx:100,cy:201,radius:8.4,confidence:0});
});
