import test from "node:test";
import assert from "node:assert/strict";
import {newMaze,paintTile} from "../src/maze-world.mjs";
import {startPlay,movePlayer,rotatePlayer,tickPlayer,castRay,collectAt} from "../src/maze-play.mjs";

test("player spawns at original entrance and faces east",()=>{
  const maze=newMaze();
  const p=startPlay(maze);
  assert.deepEqual([p.x,p.z,p.heading,p.remaining],[1.5,1.5,0,300]);
});
test("walls stop movement and raycasts see the first obstacle",()=>{
  let maze=newMaze();
  maze=paintTile(maze,2,1,"wall");
  const p=startPlay(maze);
  assert.equal(movePlayer(maze,p,1).x,p.x);
  const hit=castRay(maze,p.x,p.z,0);
  assert.equal(hit.cellX,2);assert.equal(hit.cellZ,1);
  assert.ok(hit.distance>.49&&hit.distance<.51);
});
test("movement reaches empty cells, rotation changes heading",()=>{
  const maze=newMaze(),p=startPlay(maze);
  assert.ok(movePlayer(maze,p,1).x>p.x);
  assert.ok(rotatePlayer(p,Math.PI/2).heading>1.5);
});
test("timer and goal handling are deterministic",()=>{
  let maze=newMaze();
  maze=paintTile(maze,2,1,"timer_powerup");
  const p=startPlay(maze);
  const collected=collectAt(maze,{...p,x:2.5,z:1.5});
  assert.equal(collected.remaining,330);
  assert.equal(collectAt(maze,collected).remaining,330);
  assert.equal(tickPlayer(collected,2).remaining,328);
  assert.equal(tickPlayer(p,400).ended,true);
  const finished=collectAt(maze,{...p,x:16.5,z:16.5});
  assert.equal(finished.ended,true);
  assert.equal(finished.won,true);
});
