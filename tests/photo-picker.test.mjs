import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const page=await readFile(new URL("../index.html",import.meta.url),"utf8");
const app=await readFile(new URL("../src/app.mjs",import.meta.url),"utf8");
const sw=await readFile(new URL("../sw.js",import.meta.url),"utf8");

test("photo library input does not force the iPhone rear camera",()=>{
  const library=page.match(/<input id="photoInput"[^>]*>/)?.[0];
  const camera=page.match(/<input id="cameraInput"[^>]*>/)?.[0];
  assert.ok(library,"Missing photo-library file input");
  assert.ok(camera,"Missing direct-camera file input");
  assert.ok(!/\bcapture\s*=/.test(library),"The photo picker must not force camera capture");
  assert.match(camera,/\bcapture="environment"/);
  assert.match(page,/Choose a photograph/);
  assert.match(page,/Take a photograph/);
  assert.match(app,/\["photoInput","cameraInput"\]/);
});

test("capture uses independent, reversible wall review",()=>{
  assert.match(page,/id="detectButton"/);
  assert.match(page,/id="scanCanvas"/);
  assert.match(page,/id="applyScanButton"/);
  assert.match(page,/id="cancelScanButton"/);
  assert.match(app,/applyCaptureFindings/);
  assert.match(page,/id="reviewWallsButton"/);
  assert.match(page,/id="reviewHolesButton"/);
  assert.match(app,/scanSelected\.has\(key\)/);
});

test("wall-recognition module is available offline",()=>{
  assert.match(sw,/\.\/src\/maze-recognize\.mjs/);
});


test("every referenced named interface control exists in the published HTML",()=>{
  const ids=new Set([...page.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
  const references=[...app.matchAll(/\bel\("([^"]+)"\)/g)].map(match=>match[1]);
  const missing=[...new Set(references.filter(id=>!ids.has(id)))];
  assert.deepEqual(missing,[],"Controls referenced in application code but absent from HTML");
});

test("reviewed physical holes have independent editing and imported preservation",()=>{
  assert.match(page,/id="reviewWallsButton"/);
  assert.match(page,/id="reviewHolesButton"/);
  assert.match(app,/scanSelectedHoles/);
  assert.match(app,/applyCaptureFindings/);
  assert.match(app,/physicalHoles/);
});
