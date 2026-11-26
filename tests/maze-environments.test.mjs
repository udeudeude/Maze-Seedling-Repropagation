import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {environmentKind,drawWorldBackdrop,drawWallDetail} from "../src/maze-environments.mjs";

function fakeContext(){
  const ops=[];
  return {
    ops,fillStyle:"",strokeStyle:"",globalAlpha:1,lineWidth:1,
    save(){ops.push(["save"]);},restore(){ops.push(["restore"]);},
    beginPath(){ops.push(["begin"]);},
    fillRect(...args){ops.push(["rect",this.fillStyle,...args]);},
    moveTo(...args){ops.push(["move",...args]);},
    lineTo(...args){ops.push(["line",...args]);},
    stroke(){ops.push(["stroke",this.strokeStyle]);}
  };
}
test("four original identifiers produce four distinct architectural treatments",()=>{
  const variants=["adventure","hedge","marble_maze","space"];
  const signatures=variants.map(kind=>{
    const ctx=fakeContext();
    drawWorldBackdrop(ctx,kind,0,400,300,140);
    drawWallDetail(ctx,kind,{texture:.21,cellX:2,cellZ:3,distance:4,kind:"wall"},50,20,3,180,.8);
    return JSON.stringify(ctx.ops);
  });
  assert.equal(new Set(signatures).size,4);
  assert.equal(environmentKind("future_unknown"),"marble_maze");
});
test("material geometry is finite, deterministic and inexpensive even for gates",()=>{
  const render=()=>{
    const ctx=fakeContext();
    drawWorldBackdrop(ctx,"space",210,210,240,128);
    drawWallDetail(ctx,"space",{texture:.2,cellX:4,cellZ:2,distance:3,kind:"gate"},310,-50,3,420,.7);
    return ctx.ops;
  };
  const first=render();assert.deepEqual(render(),first);
  for(const op of first)for(const v of op.slice(1))
    if(typeof v==="number")assert.ok(Number.isFinite(v));
  assert.ok(first.filter(op=>op[0]==="rect").length>=5);
  for(const theme of ["adventure","hedge","marble_maze","space"]){
    const ctx=fakeContext();
    drawWallDetail(ctx,theme,{texture:.6,cellX:8,cellZ:6,distance:30,kind:"wall"},40,18,3,35,.3);
    assert.ok(ctx.ops.length<40,"No expensive per-pixel loops in distant rays");
  }
});
test("per-eye architecture and offline cache are connected without altering maze data",()=>{
  const root=new URL("../",import.meta.url);
  const play=readFileSync(new URL("src/maze-play.mjs",root),"utf8");
  const sw=readFileSync(new URL("sw.js",root),"utf8");
  assert.match(play,/drawWorldBackdrop\(ctx,maze\.data\.theme,left,vw,h,horizon\)/);
  assert.match(play,/drawWallDetail\(ctx,maze\.data\.theme,hit/);
  assert.match(sw,/maze-environments\.mjs/);
});
