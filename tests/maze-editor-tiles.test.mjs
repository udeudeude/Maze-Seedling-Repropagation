import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newMaze,paintTile,primaryCell,locate} from "../src/maze-world.mjs";
import {editBoardTile,hasPhysicalHole} from "../src/maze-editor-tiles.mjs";
import {applyCaptureFindings} from "../src/maze-recognize.mjs";
import {findPlayableRoute} from "../src/maze-route.mjs";

test("manual hole editing is non-destructive and does not duplicate annotations",()=>{
  const source=newMaze();source.custom={original:"keep"};
  const placed=editBoardTile(source,4,5,"hole");
  assert.equal(hasPhysicalHole(source,4,5),false);
  assert.equal(hasPhysicalHole(placed,4,5),true);
  assert.deepEqual(placed.custom,source.custom);
  assert.deepEqual(editBoardTile(placed,4,5,"hole"),placed);
  assert.equal(primaryCell(placed,4,5),null);
});
test("Erase removes a hole first, preserving imported floor fields and other holes",()=>{
  let maze=paintTile(newMaze(),6,7,"floor");
  maze.data.cells.find(c=>c.type==="floor").opaque={preserve:[1,2]};
  maze.repropagation={extra:{keep:true},physicalHoles:[
    {position:["6","0","7"],source:"old"},
    {position:["8","0","9"],source:"old"}]};
  const before=JSON.stringify(maze);
  const erased=editBoardTile(maze,6,7,"empty");
  assert.equal(hasPhysicalHole(erased,6,7),false);
  assert.equal(hasPhysicalHole(erased,8,9),true);
  assert.deepEqual(primaryCell(erased,6,7).cell.opaque,{preserve:[1,2]});
  assert.deepEqual(erased.repropagation.extra,{keep:true});
  assert.equal(JSON.stringify(maze),before);
  const twice=editBoardTile(erased,6,7,"empty");
  assert.equal(primaryCell(twice,6,7),null);
});
test("holes cannot conceal start, finish, messages, gates or walls",()=>{
  let maze=newMaze();
  for(const [x,z,type] of [[3,4,"gate"],[4,4,"wall"],[5,4,"info"]])
    maze=paintTile(maze,x,z,type);
  const before=JSON.stringify(maze);
  for(const [x,z] of [[1,1],[16,16],[3,4],[4,4],[5,4]])
    assert.throws(()=>editBoardTile(maze,x,z,"hole"),/contains a tile/);
  assert.equal(JSON.stringify(maze),before);
});
test("painting over an annotated hole requires an explicit Erase",()=>{
  const maze=editBoardTile(newMaze(),3,4,"hole");
  for(const type of ["wall","floor","gate","entrance","exit"])
    assert.throws(()=>editBoardTile(maze,3,4,type),/Erase this physical hole/);
  assert.equal(editBoardTile(editBoardTile(maze,3,4,"empty"),3,4,"wall")
    .data.cells.at(-1).type,"wall");
});
test("start/finish cannot overwrite each other and marker movement preserves the source",()=>{
  const source=newMaze(),before=JSON.stringify(source);
  assert.throws(()=>editBoardTile(source,16,16,"entrance"),/different squares/);
  assert.throws(()=>editBoardTile(source,1,1,"exit"),/different squares/);
  const moved=editBoardTile(source,4,3,"entrance");
  assert.deepEqual(locate(moved,"entrance"),[[4,3]]);
  assert.deepEqual(locate(moved,"exit"),[[16,16]]);
  assert.equal(JSON.stringify(source),before);
});
test("malformed source hole annotations and outside coordinates cannot be overwritten",()=>{
  const maze=newMaze();
  for(const [x,z] of [[-1,0],[18,2],[1,18],[1.5,2]])
    assert.throws(()=>editBoardTile(maze,x,z,"hole"),RangeError);
  const bad=newMaze();bad.repropagation={physicalHoles:"opaque"};
  assert.throws(()=>editBoardTile(bad,4,4,"hole"),/malformed/);
  assert.deepEqual(bad.repropagation,{physicalHoles:"opaque"});
});
test("scan rejects two markers on one tile or markers on the opposite original endpoint",()=>{
  const source=newMaze(),before=JSON.stringify(source);
  const same=applyCaptureFindings(source,[],[],{
    entrance:{x:6,z:6},exit:{x:6,z:6}});
  assert.equal(same.movedMarkers,0);
  assert.deepEqual(locate(same.maze,"entrance"),[[1,1]]);
  assert.deepEqual(locate(same.maze,"exit"),[[16,16]]);
  const collisions=[
    applyCaptureFindings(source,[],[],{entrance:{x:16,z:16}}),
    applyCaptureFindings(source,[],[],{exit:{x:1,z:1}})
  ];
  assert.equal(collisions[0].movedMarkers,0);
  assert.equal(collisions[1].movedMarkers,0);
  assert.equal(JSON.stringify(source),before);
});
test("imported coincident endpoints never appear as zero-step wins",()=>{
  const maze=newMaze();
  maze.data.cells.find(c=>c.type==="exit").position=["1","0","1"];
  const result=findPlayableRoute(maze);
  assert.equal(result.status,"invalid");
  assert.match(result.reason,/different squares/);
});
test("Build edits are undoable, accessible, and available in the offline bundle",()=>{
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  assert.match(app,/editBoardTile\(maze,x,z,selected\)/);
  assert.match(app,/commit\(updated,\{stroke:Boolean\(boardStroke\)\}\)/);
  assert.match(html,/Erase removes a physical hole first/);
  assert.match(sw,/\.\/src\/maze-editor-tiles\.mjs/);
});
