import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {homographyForCorners} from "../src/maze-capture.mjs";
import {projectPhotoGrid} from "../src/maze-photo-grid.mjs";

const corners=[
  {x:85,y:55},{x:435,y:76},{x:416,y:410},{x:70,y:390}
];
const near=(got,want)=>assert.ok(Math.abs(got-want)<1e-8,
  "Expected "+got+" near "+want);
const samePoint=(a,b)=>{
  near(a.x,b.x);near(a.y,b.y);
};

test("physical 18-by-18 tracing guide follows perspective, including the interior intersections",()=>{
  const original=JSON.stringify(corners),project=homographyForCorners(corners);
  const guide=projectPhotoGrid(corners);
  assert.equal(guide.vertical.length,19);
  assert.equal(guide.horizontal.length,19);
  samePoint(guide.vertical[0].from,project(0,0));
  samePoint(guide.vertical[18].to,project(1,1));
  samePoint(guide.vertical[9].from,project(.5,0));
  samePoint(guide.vertical[9].to,project(.5,1));
  samePoint(guide.horizontal[9].from,project(0,.5));
  samePoint(guide.horizontal[9].to,project(1,.5));
  assert.equal(JSON.stringify(corners),original,"Never move user alignment handles");
});

test("unequal margins shift the entire perspective-correct tracing lattice",()=>{
  const edges={left:.04,right:.12,top:.08,bottom:.16};
  const original=JSON.stringify(edges);
  const project=homographyForCorners(corners);
  const guide=projectPhotoGrid(corners,edges,18,18,504);
  const x1=.88-1/504,y1=.84-1/504;
  samePoint(guide.vertical[0].from,project(.04,.08));
  samePoint(guide.vertical[18].to,project(x1,y1));
  samePoint(guide.vertical[9].to,project((.04+x1)/2,y1));
  samePoint(guide.horizontal[9].from,project(.04,(.08+y1)/2));
  assert.equal(JSON.stringify(edges),original);
});

test("zero inset stays full size; an actual crop uses border-safe sampling",()=>{
  const apply=homographyForCorners(corners);
  samePoint(projectPhotoGrid(corners,0).vertical[18].to,apply(1,1));
  samePoint(projectPhotoGrid(corners,.05).vertical[18].to,
    apply(.95-1/504,.95-1/504));
});

test("rejects folded handles and malformed edge values rather than drawing false alignment",()=>{
  const crossed=[corners[0],corners[2],corners[1],corners[3]];
  assert.throws(()=>projectPhotoGrid(crossed),RangeError);
  for(const margin of [-.01,.21,NaN,Infinity,null,{top:0,right:0,bottom:0},
    {top:0,right:0,bottom:0,left:0,extra:0}])
    assert.throws(()=>projectPhotoGrid(corners,margin),RangeError);
  assert.throws(()=>projectPhotoGrid(corners,0,1,18),RangeError);
  assert.throws(()=>projectPhotoGrid(corners,0,18,18,0),RangeError);
});

test("the photo displays the guide before blind labeling; its controls affect projection, not stored mazes",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  assert.ok(html.indexOf('id="photoGridCalibration"')>
    html.indexOf('id="photoStage"'));
  assert.ok(html.indexOf('id="photoGridCalibration"')<
    html.indexOf('id="scanStage"'));
  assert.equal((html.match(/id="gridInsetSlider"/g)||[]).length,1);
  assert.match(html,/id="showPhotoGridGuide"[^>]*checked/);
  assert.match(app,/const guide=projectPhotoGrid\(photoCorners,margins,18,18\)/);
  assert.match(app,/el\("showPhotoGridGuide"\)\.addEventListener\("change",renderPhoto\)/);
  assert.match(app,/el\("photoGridCalibration"\)\.hidden=false/);
  assert.match(app,/el\("photoGridCalibration"\)\.hidden=true/);
  assert.match(app,/renderPhoto\(\);\s*restartAlignedScan\(\)/);
  assert.match(app,/const moved=photoCorners\.map\(point=>\(\{\.\.\.point\}\)\)/);
  assert.match(app,/homographyForCorners\(moved\)/);
  assert.match(html,/step="0\.5"/);
});
