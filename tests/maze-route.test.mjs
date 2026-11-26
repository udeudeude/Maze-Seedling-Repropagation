import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newMaze,paintTile,changeCellDetails,findRoute} from "../src/maze-world.mjs";
import {findPlayableRoute} from "../src/maze-route.mjs";

function divideMaze() {
  let maze=newMaze("Route puzzle");
  maze=paintTile(maze,16,16,"empty");
  maze=paintTile(maze,5,1,"exit");
  for(let z=0;z<18;z++)maze=paintTile(maze,3,z,"wall");
  return maze;
}
const key=(maze,x,z,id)=>changeCellDetails(paintTile(maze,x,z,"info"),x,z,{
  repropagation:{keyId:id}
});

test("ordinary unobstructed maze has a gameplay route without changing the document",()=>{
  const maze=newMaze(),before=JSON.stringify(maze);
  const result=findPlayableRoute(maze);
  assert.equal(result.status,"reachable");
  assert.deepEqual(result.route[0],[1,1]);
  assert.deepEqual(result.route.at(-1),[16,16]);
  assert.equal(result.moves,30);
  assert.deepEqual(result.keys,[]);
  assert.equal(JSON.stringify(maze),before);
});
test("collects the necessary key before crossing a gate, unlike direct flood fill",()=>{
  let maze=divideMaze();
  maze=paintTile(maze,3,1,"gate","copper");
  maze=key(maze,2,1,"copper");
  assert.equal(findRoute(maze),null);
  const result=findPlayableRoute(maze);
  assert.equal(result.status,"reachable");
  assert.deepEqual(result.keys,["copper"]);
  assert.ok(result.route.some(([x,z])=>x===2&&z===1));
  assert.ok(result.route.some(([x,z])=>x===3&&z===1));
});
test("a key behind its own gate cannot produce a false positive",()=>{
  let maze=divideMaze();
  maze=paintTile(maze,3,1,"gate","copper");
  maze=key(maze,4,1,"copper");
  assert.equal(findPlayableRoute(maze).status,"blocked");
});
test("a mismatched or whitespace-variant key does not open a gate",()=>{
  let maze=divideMaze();
  maze=paintTile(maze,3,1,"gate"," copper ");
  maze=key(maze,2,1,"copper");
  assert.equal(findPlayableRoute(maze).status,"blocked");
});
test("paired secret passages allow a route through an otherwise solid partition",()=>{
  let maze=divideMaze();
  maze=paintTile(maze,2,1,"secret_passage","stairwell");
  maze=paintTile(maze,4,1,"secret_passage","stairwell");
  const result=findPlayableRoute(maze);
  assert.equal(result.status,"reachable");
  assert.equal(result.passages,1);
  assert.deepEqual(result.route.find(([x,z])=>x===4&&z===1),[4,1]);
  assert.equal(findRoute(maze),null);
});
test("unpaired passages do not invent transport",()=>{
  let maze=divideMaze();
  maze=paintTile(maze,2,1,"secret_passage","stairwell");
  maze=paintTile(maze,4,1,"secret_passage","different");
  assert.equal(findPlayableRoute(maze).status,"blocked");
});
test("physical holes block otherwise playable paths, including passage destinations",()=>{
  let maze=divideMaze();
  maze=paintTile(maze,2,1,"secret_passage","stairwell");
  maze=paintTile(maze,4,1,"secret_passage","stairwell");
  maze.repropagation={physicalHoles:[{position:["4","0","1"],kind:"physical_floor_hole"}]};
  assert.equal(findPlayableRoute(maze).status,"blocked");
});
test("invalid start/finish or excessive gate complexity is not called unreachable",()=>{
  const invalid=paintTile(newMaze(),16,16,"empty");
  assert.equal(findPlayableRoute(invalid).status,"invalid");
  let maze=newMaze();
  for(let x=0;x<4;x++)for(let z=0;z<4;z++)
    maze=paintTile(maze,x+5,z+5,"gate","unique-"+(x*4+z));
  assert.equal(findPlayableRoute(maze,{maxKeyTypes:2}).status,"indeterminate");
  assert.equal(findPlayableRoute(maze,{maxStates:2}).status,"indeterminate");
});
test("route diagnostics are wired into the editor and precached for offline operation",()=>{
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  assert.match(app,/findPlayableRoute\(maze\)/);
  assert.match(sw,/\.\/src\/maze-route\.mjs/);
});
