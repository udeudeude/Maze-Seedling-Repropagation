import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {snapshotFileName,sceneAsPng,canShareSnapshot,drawSnapshotPlayerBadge} from "../src/maze-snapshot.mjs";
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
    "snapshotShareButton","snapshotCloseButton","snapshotStatus",
     "snapshotPlayerOption","snapshotIncludePlayer"])
    assert.ok(page.includes('id="'+id+'"'),"Missing "+id);
  assert.match(app,/sceneAsPng\(output\)/);
  assert.match(app,/ctx\.drawImage\(scene,0,0\)/);
  assert.match(app,/include\.checked=false/);
  assert.match(app,/if\(dt&&!play\.ended&&!snapshotOpen&&!el\("avatarDialog"\)\.open\)/);
  assert.match(app,/navigator\.share\(\{files:\[file\],title:/);
  assert.match(app,/snapshotRequest\+\+/);
  assert.match(sw,/\.\/src\/maze-snapshot\.mjs/);
});

test("player name and portrait are only drawn onto an opted-in snapshot canvas",()=>{
  const calls=[];
  const ctx={
    canvas:{width:600,height:360},
    save(){calls.push(["save"]);},restore(){calls.push(["restore"]);},
    fillRect(...args){calls.push(["fillRect",...args]);},
    strokeRect(...args){calls.push(["strokeRect",...args]);},
    drawImage(...args){calls.push(["drawImage",...args]);},
    fillText(...args){calls.push(["fillText",...args]);}
  };
  assert.equal(drawSnapshotPlayerBadge(ctx,{},null),false);
  assert.equal(calls.length,0);
  const portrait={naturalWidth:64,naturalHeight:64};
  assert.equal(drawSnapshotPlayerBadge(ctx,{name:"Navigator"},portrait),true);
  assert.ok(calls.some(args=>args[0]==="drawImage"&&args[1]===portrait));
  assert.ok(calls.some(args=>args[0]==="fillText"&&args[1]==="Navigator"));
  assert.deepEqual(calls.at(-1),["restore"]);
});
test("name-only snapshot cards work, invalid canvases are rejected and untrusted names are bounded",()=>{
  const texts=[],ctx={
    canvas:{width:320,height:180},save(){},restore(){},
    fillRect(){},strokeRect(){},fillText(text,x,y,maxWidth){
      texts.push({text,x,y,maxWidth});
    }
  };
  assert.equal(drawSnapshotPlayerBadge(ctx,{name:"Friend"},null),true);
  assert.equal(texts.at(-1).text,"Friend");
  assert.ok(texts.every(t=>t.maxWidth>0&&t.x>=0));
  assert.equal(drawSnapshotPlayerBadge(ctx,{name:"  "},null),false);
  assert.throws(()=>drawSnapshotPlayerBadge({canvas:{width:0,height:180}}, {name:"A"}),RangeError);
});
test("selfies are never automatically included in snapshots or the original maze data",async()=>{
  const app=await readFile(new URL("../src/app.mjs",import.meta.url),"utf8");
  assert.match(app,/include\.checked=false; \/\/ A selfie is never added/);
  assert.match(app,/if\(include\.checked\)drawSnapshotPlayerBadge\(ctx,avatar,portrait\)/);
  assert.match(app,/loadSnapshotPortrait\(avatar\.dataUrl\)/);
  assert.match(app,/if\(request!==snapshotRequest\|\|!snapshotOpen\)return/);
  assert.match(app,/URL\.revokeObjectURL\(previous\)/);
});
