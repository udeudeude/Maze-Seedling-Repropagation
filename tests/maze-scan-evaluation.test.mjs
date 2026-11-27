import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compareScanReview} from "../src/maze-scan-evaluation.mjs";

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
  assert.match(app,/if\(!scanResult\|\|!el\("scanReviewComplete"\)\.checked\)return/);
  assert.match(app,/function invalidateScanMeasurement\(\)/);
  assert.match(app,/scanMeasurementReport=JSON\.stringify\(/);
  assert.match(serviceWorker,/\.\/src\/maze-scan-evaluation\.mjs/);
});
