import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const page=await readFile(new URL("../index.html",import.meta.url),"utf8");
const app=await readFile(new URL("../src/app.mjs",import.meta.url),"utf8");
const sw=await readFile(new URL("../sw.js",import.meta.url),"utf8");

test("one native picker offers photo library, camera and files without redundancy",()=>{
  const library=page.match(/<input id="photoInput"[^>]*>/)?.[0];
  assert.ok(library,"Missing photo input");
  assert.ok(!/\bcapture\s*=/.test(library),"The photo picker must not force camera capture");
  assert.ok(!/id="cameraInput"/.test(page),"A separate camera button would duplicate the native menu");
  assert.match(page,/Choose or take a photograph/);
  assert.match(page,/Photo Library · Camera · Files/);
  assert.match(app,/el\("photoInput"\)\.addEventListener\("change",loadPhoto\)/);
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

// Controls and scene affordances for the non-native key system.
test("key editor and visible inventory are wired without a new native cell type",()=>{
  for(const id of ["keyEditor","keyIdInput","gateHelp","keyInventory"])
    assert.match(page,new RegExp('id="'+id+'"'));
  assert.match(app,/edits\.repropagation=extension/);
  assert.match(app,/keyPickupId\(item\)/);
  assert.match(app,/inventory\.textContent/);
});

test("message photo editor and paused exploration viewer are wired and cached",()=>{
  for(const id of ["tilePhotoEditor","tilePhotoInput","tilePhotoPreview",
    "removeTilePhotoButton","tilePhotoStatus","tilePhotoDialog",
    "playPhotoImage","playPhotoCaption","photoContinueButton"])
    assert.ok(page.includes('id="'+id+'"'),"Missing "+id);
  assert.match(app,/pendingTilePhoto=compressTilePhoto\(image\)/);
  assert.match(app,/edits\.repropagation=photoEdit\(/);
  assert.match(app,/play=dismissPhoto\(play\)/);
  assert.match(sw,/\.\/src\/maze-media\.mjs/);
});
