import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {homographyForCorners} from "../src/maze-capture.mjs";
import {projectPhotoGrid,confirmPrintedGridCorners} from "../src/maze-photo-grid.mjs";

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

test("four independently marked paper-grid intersections map all physical squares without board-margin assumptions",()=>{
  const printed=[
    {x:127,y:83},{x:418,y:112},{x:385,y:357},{x:86,y:340}
  ];
  const source=JSON.stringify(printed);
  const confirmed=confirmPrintedGridCorners(printed,500,440);
  assert.notEqual(confirmed,printed);
  assert.notEqual(confirmed[0],printed[0]);
  const projected=projectPhotoGrid(confirmed,0,18,18);
  for(let i=0;i<4;i++){
    const locations=[
      projected.vertical[0].from,projected.vertical[18].from,
      projected.vertical[18].to,projected.vertical[0].to
    ];
    samePoint(locations[i],printed[i]);
  }
  const project=homographyForCorners(printed);
  samePoint(projected.vertical[7].from,project(7/18,0));
  samePoint(projected.horizontal[11].to,project(1,11/18));
  assert.equal(JSON.stringify(printed),source);
});

test("new printed-grid corners can be sheared independently of the board perimeter",()=>{
  const outer=[{x:40,y:40},{x:460,y:45},{x:455,y:400},{x:42,y:395}];
  const paper=[
    {x:87,y:74},{x:420,y:121},{x:395,y:363},{x:64,y:352}
  ];
  const accepted=confirmPrintedGridCorners(paper,500,440);
  const outerProjection=homographyForCorners(outer);
  // A rectangle cropped within the original board quad has top and bottom
  // sides along lines of constant rectified y. Here the independently marked
  // paper's diagonal top and bottom offsets are unequal: an unverified fixed
  // inset of the board is not equivalent to the observed paper corners.
  const guide=projectPhotoGrid(accepted);
  samePoint(guide.vertical[0].from,paper[0]);
  samePoint(guide.vertical[18].to,paper[2]);
  const boardCenter=outerProjection(.5,.5);
  const paperCenter=homographyForCorners(paper)(.5,.5);
  assert.ok(Math.hypot(boardCenter.x-paperCenter.x,
    boardCenter.y-paperCenter.y)>3);
});

test("rejects incomplete, folded, outside and nonfinite grid-corner taps without mutation",()=>{
  const valid=[{x:30,y:40},{x:270,y:55},{x:250,y:290},{x:25,y:275}];
  assert.throws(()=>confirmPrintedGridCorners(valid.slice(0,3),320,320),TypeError);
  assert.throws(()=>confirmPrintedGridCorners(valid,0,320),TypeError);
  assert.throws(()=>confirmPrintedGridCorners([valid[0],valid[2],valid[1],valid[3]],320,320),RangeError);
  assert.throws(()=>confirmPrintedGridCorners([...valid.slice(0,3),{x:321,y:250}],320,320),RangeError);
  assert.throws(()=>confirmPrintedGridCorners([...valid.slice(0,3),{x:NaN,y:250}],320,320),TypeError);
  const accepted=confirmPrintedGridCorners(valid,320,320);
  accepted[0].x=0;
  assert.equal(valid[0].x,30);
});

test("manual grid-point mode is atomic: no import or old labels are reused",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  assert.match(html,/id="markPrintedCornersButton"/);
  assert.match(app,/photoGridCornerDraft!==null/);
  assert.match(app,/const chosen=confirmPrintedGridCorners\(draft,canvas.width,canvas.height\)/);
  assert.match(app,/photoCorners=chosen;[\s\S]*?el\("gridInsetSlider"\)\.value="0";/);
  assert.match(app,/photoCorners=chosen;[\s\S]*?abandonPhotoReference\(\);\s*invalidateScanMeasurement\(\);/);
  assert.match(app,/scanBoardPixels=null;scanPixels=null;scanGuide=null;scanResult=null;/);
  assert.match(app,/Invalid printed-grid quadrilateral:/);
});
