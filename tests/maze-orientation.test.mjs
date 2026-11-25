import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {orientationPose,relativePose,shortestAngle} from "../src/maze-orientation.mjs";

const rad=Math.PI/180;
const close=(a,b,tol=.001)=>assert.ok(Math.abs(a-b)<tol,`expected ${a} ≈ ${b}`);

test("headset yaw, pitch and neutral pose are recovered from the sensor",()=>{
  const neutral=orientationPose({alpha:0,beta:90,gamma:0});
  close(neutral.yaw,0);close(neutral.pitch,0);
  const left=orientationPose({alpha:90,beta:90,gamma:0});
  close(left.yaw,-Math.PI/2);close(left.pitch,0);
  const right=orientationPose({alpha:270,beta:90,gamma:0});
  close(right.yaw,Math.PI/2);
  close(orientationPose({alpha:0,beta:120,gamma:0}).pitch,30*rad);
  close(orientationPose({alpha:0,beta:60,gamma:0}).pitch,-30*rad);
});
test("screen orientation contributes to calibrated yaw",()=>{
  const sample={alpha:40,beta:80,gamma:-20};
  const portrait=orientationPose(sample,0),landscape=orientationPose(sample,90);
  assert.ok(portrait&&landscape);
  assert.notEqual(portrait.yaw,landscape.yaw);
  assert.ok(Number.isFinite(landscape.pitch));
});
test("zero-crossing never causes a full-turn jump",()=>{
  const before=orientationPose({alpha:359,beta:90,gamma:0});
  const after=orientationPose({alpha:1,beta:90,gamma:0});
  close(shortestAngle(after.yaw-before.yaw),-2*rad);
  const adjusted=relativePose(after,before,0.7);
  close(shortestAngle(adjusted.heading-0.7),-2*rad);
  close(relativePose(before,before,1.2).heading,1.2);
});
test("missing sensor measurements and vertical headings are ignored safely",()=>{
  assert.equal(orientationPose(null),null);
  assert.equal(orientationPose({alpha:null,beta:20,gamma:0}),null);
  assert.equal(orientationPose({alpha:0,beta:90,gamma:NaN}),null);
  assert.equal(orientationPose({alpha:0,beta:0,gamma:0}),null);
  assert.equal(relativePose(null,{yaw:0},0),null);
});
test("iPhone motion permission, recenter and offline source are connected",()=>{
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  assert.match(app,/DeviceOrientationEvent\.requestPermission\(\)/);
  assert.match(app,/addEventListener\("deviceorientation",onDeviceOrientation/);
  assert.match(app,/removeEventListener\("deviceorientation",onDeviceOrientation/);
  assert.match(app,/relativePose\(pose,motionAnchor,motionHeading\)/);
  for(const id of ["motionStatus","recenterButton","stereoButton"])
    assert.ok(html.includes('id="'+id+'"'));
  assert.match(sw,/\.\/src\/maze-orientation\.mjs/);
});
