import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {snapshotFileName,sceneAsPng,canShareSnapshot} from "../src/maze-snapshot.mjs";
test("safe filenames for portable maze screenshots",()=>{
  const date=new Date("2026-11-25T23:00:00Z");
  assert.equal(snapshotFileName("The Lost Labyrinth",date),"the-lost-labyrinth-2026-11-25.png");
  assert.equal(snapshotFileName("../../<bad>\\name",date),"bad-name-2026-11-25.png");
  assert.equal(snapshotFileName("École",date),"ecole-2026-11-25.png");
  assert.equal(snapshotFileName("",date),"my-maze-2026-11-25.png");
  assert.throws(()=>snapshotFileName("maze",new Date("invalid")));
});
test("actual canvas is encoded, failures never produce empty images",async()=>{
  const png=new Blob(["pixel"],{type:"image/png"});let mime;
  const canvas={width:480,height:300,toBlob(callback,requested){
    mime=requested;callback(png);
  }};
  assert.equal(await sceneAsPng(canvas),png);assert.equal(mime,"image/png");
  await assert.rejects(sceneAsPng({width:0,height:1,toBlob(){}}));
  await assert.rejects(sceneAsPng({width:20,height:20,toBlob(cb){cb(null);}}),/could not encode/);
  await assert.rejects(sceneAsPng({width:20,height:20,toBlob(){throw Error("canvas security");}}),/canvas security/);
});
test("unsupported file sharing cannot trigger uploads",()=>{
  const file={name:"maze.png",type:"image/png"};
  assert.equal(canShareSnapshot({share(){},canShare({files}){return files[0]===file;}},file),true);
  assert.equal(canShareSnapshot({share(){}},file),false);
  assert.equal(canShareSnapshot({share(){},canShare(){throw Error("unsupported");}},file),false);
});
test("screenshot UI previews, pauses the run and supports saving and native sharing",async()=>{
  const [page,app,sw]=await Promise.all([
    readFile(new URL("../index.html",import.meta.url),"utf8"),
    readFile(new URL("../src/app.mjs",import.meta.url),"utf8"),
    readFile(new URL("../sw.js",import.meta.url),"utf8")]);
  for(const id of ["snapshotButton","snapshotDialog","snapshotPreview","snapshotSaveLink",
    "snapshotShareButton","snapshotCloseButton","snapshotStatus"])
    assert.ok(page.includes('id="'+id+'"'),"Missing "+id);
  assert.match(app,/sceneAsPng\(el\("sceneCanvas"\)\)/);
  assert.match(app,/if\(dt&&!play\.ended&&!snapshotOpen&&!el\("avatarDialog"\)\.open\)/);
  assert.match(app,/navigator\.share\(\{files:\[file\],title:/);
  assert.match(app,/snapshotRequest\+\+/);
  assert.match(sw,/\.\/src\/maze-snapshot\.mjs/);
});
