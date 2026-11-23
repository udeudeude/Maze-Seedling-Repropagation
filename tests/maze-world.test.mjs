import test from "node:test";
import assert from "node:assert/strict";
import {newMaze,sampleMaze,paintTile,eraseAt,primaryCell,cellsAt,findRoute,
  passable,examineMaze,changeCellDetails,locate,TILE_NAMES} from "../src/maze-world.mjs";

test("new projects keep the recovered 18×18 coordinate conventions",()=>{
  const maze=newMaze();
  assert.deepEqual(maze.data.scale,["18","1","18"]);
  assert.deepEqual(locate(maze,"entrance"),[[1,1]]);
  assert.deepEqual(locate(maze,"exit"),[[16,16]]);
  assert.equal(findRoute(maze)?.length,31);
});

test("painting is immutable and new tiles preserve serialized coordinates",()=>{
  const before=newMaze();
  const after=paintTile(before,3,4,"wall","1");
  assert.equal(primaryCell(before,3,4),null);
  assert.deepEqual(primaryCell(after,3,4).cell,
    {type:"wall",position:["3","0","4"],variant:"1"});
  assert.equal(primaryCell(eraseAt(after,3,4),3,4),null);
});

test("existing layered imported data survives editing the visible tile",()=>{
  const maze=newMaze();
  maze.data.cells.push({type:"floor",position:["5","0","5"],xExtra:42});
  maze.data.cells.push({type:"wall",position:["5","0","5"],variant:"0",mystery:7});
  const after=paintTile(maze,5,5,"gate");
  assert.equal(cellsAt(after,5,5).length,2);
  assert.equal(cellsAt(after,5,5).some(x=>x.cell.xExtra===42),true);
  assert.equal(primaryCell(maze,5,5).cell.type,"wall");
  assert.equal(primaryCell(after,5,5).cell.type,"gate");
});

test("gate identity affects traversability and route diagnosis",()=>{
  let maze=newMaze();
  for(let z=0;z<18;z++)maze=paintTile(maze,5,z,"wall");
  assert.equal(findRoute(maze),null);
  maze=paintTile(maze,5,6,"gate","blue");
  assert.equal(passable(maze,5,6),false);
  assert.equal(passable(maze,5,6,["blue"]),true);
  assert.equal(findRoute(maze,["blue"])!==null,true);
  assert.equal(examineMaze(maze).hasRoute,false);
});

test("practice maze is playable and original-format",()=>{
  const maze=sampleMaze();
  assert.deepEqual(maze.data.scale,["18","1","18"]);
  assert.ok(findRoute(maze));
  assert.ok(Object.keys(TILE_NAMES).length>=15);
  assert.ok(examineMaze(maze).shortestSteps>0);
});

test("editing details leaves unrelated recovered fields intact",()=>{
  let maze=newMaze();
  maze=paintTile(maze,8,9,"info");
  const modified=changeCellDetails(maze,8,9,{text:"Look up.",variant:"2"});
  assert.equal(primaryCell(modified,8,9).cell.text,"Look up.");
  assert.equal(primaryCell(maze,8,9).cell.text,undefined);
  assert.throws(()=>changeCellDetails(maze,8,9,{position:[1,2,3]}),TypeError);
});

test("off-board painting is rejected rather than corrupting saved mazes",()=>{
  assert.throws(()=>paintTile(newMaze(),-1,1,"wall"),RangeError);
  assert.throws(()=>paintTile(newMaze(),1,18,"wall"),RangeError);
  assert.throws(()=>paintTile(newMaze(),3,4,"other"),TypeError);
});
