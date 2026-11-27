import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newPhotoReference,editPhotoReference,photoReferenceLabels} from "../src/maze-photo-reference.mjs";
import {compareScanReview} from "../src/maze-scan-evaluation.mjs";

const settings={width:504,height:504,columns:18,rows:18};
test("reference begins empty even with many scanner predictions",()=>{
  const predictions={walls:[{x:2,z:2},{x:4,z:4}],holes:[{x:9,z:9}],
    markers:[{x:1,z:1,type:"entrance"}]};
  let reference=newPhotoReference();
  assert.deepEqual(photoReferenceLabels(reference),{walls:[],holes:[],markers:[]});
  reference=editPhotoReference(reference,{...settings,mode:"walls",x:2,z:2});
  reference=editPhotoReference(reference,{...settings,mode:"walls",x:7,z:7});
  reference=editPhotoReference(reference,{...settings,mode:"holes",x:8,z:8});
  reference=editPhotoReference(reference,{...settings,mode:"markers",markerBrush:"entrance",x:1,z:2});
  const metric=compareScanReview({columns:18,rows:18,suggested:predictions,
    reviewed:photoReferenceLabels(reference)});
  assert.deepEqual(metric.walls,{matches:1,falseAlarms:1,misses:1,precision:.5,recall:.5});
  assert.equal(metric.holes.falseAlarms,1);
  assert.equal(metric.holes.misses,1);
  assert.equal(metric.start.matches,0);
  assert.equal(metric.start.falseAlarms,1);
  assert.equal(metric.start.misses,1);
  assert.deepEqual(predictions.walls,[{x:2,z:2},{x:4,z:4}]);
});
test("annotation edits toggle walls and holes without consuming detector coordinates",()=>{
  const empty=newPhotoReference();
  let review=editPhotoReference(empty,{...settings,mode:"holes",x:3,z:4,
    candidates:[{x:3,z:4,cx:9,cy:10,radius:999}]});
  assert.deepEqual(review.holes.get("3,4"),{
    x:3,z:4,cx:98,cy:126,radius:8.4,confidence:0});
  assert.equal(empty.holes.size,0,"Original reference remains immutable");
  review=editPhotoReference(review,{...settings,mode:"walls",x:3,z:4});
  review=editPhotoReference(review,{...settings,mode:"walls",x:3,z:4});
  assert.equal(review.walls.size,0);
  review=editPhotoReference(review,{...settings,mode:"holes",x:3,z:4});
  assert.equal(review.holes.size,0);
});
test("markers may be moved, cleared and cannot create a third invented role",()=>{
  const empty=newPhotoReference();
  let review=editPhotoReference(empty,{...settings,mode:"markers",markerBrush:"exit",x:1,z:1});
  review=editPhotoReference(review,{...settings,mode:"markers",markerBrush:"exit",x:5,z:6});
  assert.deepEqual(photoReferenceLabels(review).markers,[{type:"exit",x:5,z:6}]);
  review={...review,markers:new Map()};
  assert.deepEqual(photoReferenceLabels(review).markers,[]);
  assert.throws(()=>editPhotoReference(review,{...settings,mode:"markers",markerBrush:"gate",x:5,z:6}),TypeError);
});
test("invalid, out of bounds and malformed annotations are rejected",()=>{
  const ref=newPhotoReference();
  for(const mutation of [
    {mode:"walls",x:-1,z:0},{mode:"holes",x:18,z:0},
    {mode:"walls",x:0.5,z:0},{mode:"wall",x:1,z:1},
    {mode:"markers",x:0,z:NaN}
  ])assert.throws(()=>editPhotoReference(ref,{...settings,...mutation}),TypeError);
  assert.throws(()=>photoReferenceLabels({walls:[]}),TypeError);
  assert.throws(()=>editPhotoReference(ref,{...settings,mode:"holes",x:1,z:1,width:0}),TypeError);
});
test("independent labels must precede display of predictions, stay separate from import",()=>{
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  assert.match(html,/id="annotateBeforeDetectButton"/);
  assert.match(html,/id="scanReviewComplete"[^>]*disabled/);
  assert.match(app,/let photoSuggestionsSeen=false,photoReferenceMode=false/);
  assert.match(app,/if\(photoSuggestionsSeen\)return;/);
  assert.match(app,/photoReferenceMode=true;/);
  assert.match(app,/if\(photoReferenceMode\)\{\s*\/\/ Ground-truth candidates/);
  assert.match(app,/if\(!photoReferenceMode\|\|!scanResult\|\|!el\("scanReviewComplete"\)\.checked\)return/);
  assert.match(app,/reviewed:photoReferenceLabels\(photoReference\)/);
  assert.match(app,/if\(photoReferenceMode\)return;/);
});
