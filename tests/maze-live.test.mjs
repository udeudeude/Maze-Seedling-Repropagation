import test from "node:test";
import assert from "node:assert/strict";
import {assessCameraFrame,createCameraSession,projectBoardOutline} from "../src/maze-live.mjs";
import {readFile} from "node:fs/promises";

function uniform(value,width=40,height=40){
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4)data.set([value,value,value,255],i);
  return {width,height,data};
}
test("live preview distinguishes dark, blown-out and flat lighting without claiming a board match",()=>{
  assert.equal(assessCameraFrame(uniform(18)).level,"dark");
  assert.equal(assessCameraFrame(uniform(252)).level,"bright");
  assert.equal(assessCameraFrame(uniform(132)).level,"flat");
  const frame=uniform(185);
  for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width/3;x++){
    const i=(y*frame.width+x)*4;frame.data.set([34,34,34,255],i);
  }
  assert.equal(assessCameraFrame(frame).level,"ready");
  assert.throws(()=>assessCameraFrame({width:5,height:5,data:[]}),TypeError);
});
test("cancelled permission request releases late-arriving camera tracks",async()=>{
  let grant;
  const stopped=[];
  const session=createCameraSession(()=>new Promise(resolve=>grant=resolve));
  const pending=session.start();
  session.stop();
  grant({getTracks:()=>[{stop:()=>stopped.push("late")}]});
  assert.equal(await pending,null);
  assert.deepEqual(stopped,["late"]);
  assert.equal(session.getStream(),null);
});
test("new request supersedes stale request and stopping releases active tracks",async()=>{
  const grants=[];
  const stopped=[];
  const session=createCameraSession(()=>new Promise(resolve=>grants.push(resolve)));
  const first=session.start(),second=session.start();
  grants[0]({getTracks:()=>[{stop:()=>stopped.push("stale")}]});
  assert.equal(await first,null);
  const live={getTracks:()=>[{stop:()=>stopped.push("live")}]};
  grants[1](live);
  assert.equal(await second,live);
  session.stop();
  assert.deepEqual(stopped,["stale","live"]);
  assert.equal(session.getStream(),null);
});
test("live camera has an explicit shutter, an off switch, and no automatic capture or upload",async()=>{
  const page=await readFile(new URL("../index.html",import.meta.url),"utf8");
  const app=await readFile(new URL("../src/app.mjs",import.meta.url),"utf8");
  const sw=await readFile(new URL("../sw.js",import.meta.url),"utf8");
  for(const id of ["startLiveCameraButton","liveCameraStage","liveCameraVideo",
    "liveCameraStatus","captureLiveButton","stopLiveCameraButton"])
    assert.ok(page.includes('id="'+id+'"'),"Missing "+id);
  assert.match(app,/navigator\.mediaDevices\.getUserMedia/);
  assert.match(app,/stopLiveCamera\(\)/);
  assert.match(app,/cameraSession\.stop\(\)/);
  assert.match(app,/assessCameraFrame\(/);
  assert.match(sw,/\.\/src\/maze-live\.mjs/);
  assert.ok(!page.includes('id="cameraInput"'),"Native photo picker is intentionally singular");
});

test("detected board overlays respect letterboxed landscape camera frames",()=>{
  const corners=[{x:20,y:10},{x:300,y:10},{x:300,y:230},{x:20,y:230}];
  // A 4:3 image centered in a square display adds 37.5 pixels top and bottom.
  const points=projectBoardOutline(corners,320,240,300,300);
  assert.deepEqual(points,[
    {x:18.75,y:46.875},{x:281.25,y:46.875},
    {x:281.25,y:253.125},{x:18.75,y:253.125}
  ]);
});
test("detected board overlays respect letterboxed portrait camera frames",()=>{
  const corners=[{x:30,y:40},{x:210,y:40},{x:210,y:280},{x:30,y:280}];
  const points=projectBoardOutline(corners,240,320,400,320);
  assert.deepEqual(points,[
    {x:110,y:40},{x:290,y:40},{x:290,y:280},{x:110,y:280}
  ]);
});
test("board overlay geometry rejects invalid input and never modifies detection points",()=>{
  const corners=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
  assert.deepEqual(projectBoardOutline(corners,100,100,100,100),corners);
  assert.deepEqual(corners[0],{x:0,y:0});
  assert.throws(()=>projectBoardOutline(corners,100,0,200,200),RangeError);
  assert.throws(()=>projectBoardOutline([corners[0]],100,100,200,200),TypeError);
  assert.throws(()=>projectBoardOutline([{x:NaN,y:1},...corners.slice(1)],
    100,100,200,200),TypeError);
});
test("live board outlines do not auto-import tiles or replace manual alignment",async()=>{
  const page=await readFile(new URL("../index.html",import.meta.url),"utf8");
  const app=await readFile(new URL("../src/app.mjs",import.meta.url),"utf8");
  for(const id of ["liveCameraFrame","liveBoardOutline","photoCanvas",
    "suggestCornersButton","applyScanButton"])
    assert.ok(page.includes('id="'+id+'"'),"Missing "+id);
  assert.match(app,/projectBoardOutline\(estimate\.corners/);
  assert.match(app,/const aligned=acceptPhoto\(frame,frame\.width,frame\.height,true\)/);
  assert.match(app,/suggestBoardCorners\(context\.getImageData/);
  assert.match(app,/if\(estimate\)\{photoCorners=estimate\.corners;foundAlignment=true;\}/);
  assert.match(app,/el\("scanStage"\)\.hidden=true;/);
});
