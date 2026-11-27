import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {measurePhotoProposals} from "../scripts/probe-seedling-photo.mjs";

test("private historical-photo probe reports aggregate scan stability only",()=>{
  // Procedural negative control. The actual third-party photo is not stored
  // in the repository or downloaded by the normal automated tests.
  const width=512,data=new Uint8ClampedArray(width*width*4);
  for(let i=0;i<data.length;i+=4)data.set([235,235,235,255],i);
  const result=measurePhotoProposals(data,{corners:[
    {x:16,y:16},{x:496,y:16},{x:496,y:496},{x:16,y:496}
  ],variants:[{name:"first",margin:0},{name:"second",margin:.05}]});
  assert.equal(result.observed.length,2);
  assert.equal(result.observed[0].wallTileCount,0);
  assert.equal(result.sensitivityToGridCropping[0].intersectionOverUnion,null);
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
