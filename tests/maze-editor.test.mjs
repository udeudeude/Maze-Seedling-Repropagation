import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newMaze,paintTile,primaryCell,transferTile,cellsAt,changeCellDetails} from "../src/maze-world.mjs";

test("moving the top layer preserves all source metadata and lower layers",()=>{
  const source=newMaze();
  source.data.cells.push({type:"floor",position:["4","0","5"],extra:"untouched"});
  source.data.cells.push({type:"riddle",position:["4","0","5"],variant:"X",riddle:{prompt:"Why?"},unknown:{a:[1,2]}});
  const after=transferTile(source,4,5,7,8);
  assert.equal(primaryCell(source,4,5).cell.type,"riddle","source must remain unchanged");
  assert.equal(primaryCell(after,4,5).cell.type,"floor","moving exposes the preserved lower layer");
  assert.deepEqual(primaryCell(after,7,8).cell,{
    type:"riddle",position:["7","0","8"],variant:"X",
    riddle:{prompt:"Why?"},unknown:{a:[1,2]}
  });
  assert.equal(cellsAt(after,4,5).length,1);
});
test("copy duplicates a tile without changing original or losing numeric coordinates",()=>{
  const maze=newMaze();
  maze.data.cells.push({type:"info",position:[4,0,5],text:"Welcome",extension:42});
  const copy=transferTile(maze,4,5,7,8,{copy:true});
  assert.equal(maze.data.cells.length+1,copy.data.cells.length);
  assert.deepEqual(primaryCell(copy,7,8).cell,{
    type:"info",position:[7,0,8],text:"Welcome",extension:42
  });
  assert.deepEqual(primaryCell(copy,4,5).cell,primaryCell(maze,4,5).cell);
});
test("move/copy refuses destructive destinations, physical holes, missing sources and off-board coordinates",()=>{
  const maze=paintTile(newMaze(),4,5,"gate","amber");
  maze.repropagation={physicalHoles:[{kind:"physical_floor_hole",position:["10","0","3"]}]};
  assert.throws(()=>transferTile(maze,4,5,1,1),/already contains/);
  assert.throws(()=>transferTile(maze,4,5,10,3),/physical hole/);
  assert.throws(()=>transferTile(maze,4,5,4,5,{copy:true}),/different destination/);
  assert.throws(()=>transferTile(maze,8,8,9,9),/no tile/);
  assert.throws(()=>transferTile(maze,4,5,18,1),RangeError);
  assert.throws(()=>transferTile(maze,-1,1,1,1),RangeError);
  assert.deepEqual(maze.repropagation.physicalHoles,[{kind:"physical_floor_hole",position:["10","0","3"]}]);
});
test("Start and Finish cannot be duplicated but can be safely moved",()=>{
  const maze=newMaze();
  assert.throws(()=>transferTile(maze,1,1,2,1,{copy:true}),/cannot be duplicated/);
  const moved=transferTile(maze,1,1,2,1);
  assert.equal(primaryCell(moved,1,1),null);
  assert.equal(primaryCell(moved,2,1).cell.type,"entrance");
});
test("Build exposes magnification, deliberate pan, keyboard access and reversible transfer actions",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  const css=readFileSync(new URL("../style.css",import.meta.url),"utf8");
  for(const id of ["boardScroller","boardSurface","zoomOutButton","zoomLevel","zoomInButton",
    "panButton","moveTileButton","copyTileButton","cancelPlacementButton"])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="boardCanvas" tabindex="0"/);
  assert.match(app,/transferTile\(maze,\.\.\.placement.source,x,z,\{copy\}\)/);
  assert.match(app,/setBoardPan\(!boardPanning\)/);
  assert.match(css,/#boardCanvas\.pan-mode\{touch-action:pan-x pan-y/);
});

test("riddle customization preserves opaque imported data and round trips via JSON",()=>{
  const source=paintTile(newMaze(),4,5,"riddle");
  const before=primaryCell(source,4,5).cell;
  before.riddle={originalOpaque:["preserve",7]};
  before.otherField={nested:true};
  const changed=changeCellDetails(source,4,5,{repropagation:{
    riddle:{question:"Who?",answer:"You"}}});
  const restored=JSON.parse(JSON.stringify(changed));
  assert.deepEqual(primaryCell(restored,4,5).cell.riddle,{originalOpaque:["preserve",7]});
  assert.deepEqual(primaryCell(restored,4,5).cell.otherField,{nested:true});
  assert.equal(primaryCell(restored,4,5).cell.repropagation.riddle.answer,"You");
  assert.equal(before.repropagation,undefined);
});
test("riddle authoring and play prompt are wired to accessible dialogs",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  for(const id of ["riddleEditor","riddleQuestionInput","riddleAnswerInput",
    "riddleDialog","riddleForm","riddlePrompt","riddleResponse","riddleFeedback",
    "skipRiddleButton","passageHelp"])
    assert.ok(html.includes('id="'+id+'"'),"Missing "+id);
  assert.match(app,/play=answerRiddle\(play,response\)/);
  assert.match(app,/riddleDialog\.showModal\(\)/);
});
