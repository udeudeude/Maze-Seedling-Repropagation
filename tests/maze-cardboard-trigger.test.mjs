import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newMaze,paintTile,changeCellDetails} from "../src/maze-world.mjs";
import {startPlay,cardboardTriggerStep,isCardboardTriggerTap} from "../src/maze-play.mjs";

const tap=(values={})=>({id:1,x:120,y:90,at:100,moved:false,...values});
test("viewer trigger accepts brief stationary taps but never drag, hold or other fingers",()=>{
  assert.equal(isCardboardTriggerTap(tap(),tap({at:160,x:125,y:91})),true);
  assert.equal(isCardboardTriggerTap(tap(),tap({at:800})),false);
  assert.equal(isCardboardTriggerTap(tap(),tap({id:2,at:110})),false);
  assert.equal(isCardboardTriggerTap(tap({moved:true}),tap({at:140})),false);
  assert.equal(isCardboardTriggerTap(tap(),tap({at:130,x:148})),false);
  assert.equal(isCardboardTriggerTap(tap(),tap({at:80})),false);
  assert.equal(isCardboardTriggerTap(null,tap()),false);
});
test("Cardboard trigger makes a short step toward the looked-at direction",()=>{
  const maze=newMaze(),start=startPlay(maze);
  const ahead=cardboardTriggerStep(maze,start);
  assert.ok(ahead.x>start.x+.4&&ahead.x<start.x+1.1);
  assert.equal(ahead.z,start.z);
  assert.deepEqual(startPlay(maze).explored,["1,1"]);
  assert.ok(ahead.explored.includes("2,1"));
});
test("trigger cannot cross walls or locked gates, but collected keys open gates",()=>{
  let maze=paintTile(newMaze(),2,1,"wall");
  const start=startPlay(maze);
  assert.equal(Math.floor(cardboardTriggerStep(maze,start).x),1);
  maze=paintTile(maze,2,1,"gate","blue");
  assert.equal(Math.floor(cardboardTriggerStep(maze,start).x),1);
  assert.equal(Math.floor(cardboardTriggerStep(maze,{...start,keys:["blue"]}).x),2);
});
test("viewer steps still trigger actual tiles, physical holes and modal movement locks",()=>{
  let maze=paintTile(newMaze(),2,1,"map");
  const start=startPlay(maze),collected=cardboardTriggerStep(maze,start);
  assert.equal(collected.mapRevealed,true);
  maze=newMaze();
  maze.repropagation={physicalHoles:[{position:["2","0","1"],source:"manual_editor"}]};
  const fallen=cardboardTriggerStep(maze,startPlay(maze));
  assert.equal(fallen.ended,true);assert.equal(fallen.won,false);
  maze=paintTile(newMaze(),2,1,"riddle");
  maze=changeCellDetails(maze,2,1,{repropagation:{riddle:{question:"2+2?",answer:"4"}}});
  const paused=cardboardTriggerStep(maze,startPlay(maze));
  assert.ok(paused.pendingRiddle);
  assert.deepEqual(cardboardTriggerStep(maze,paused),paused);
  const finished={...start,ended:true};
  assert.deepEqual(cardboardTriggerStep(maze,finished),finished);
});
test("immersive commands and fallbacks are wired without publishing viewer assets",()=>{
  const root=new URL("../",import.meta.url);
  const html=readFileSync(new URL("index.html",root),"utf8");
  const css=readFileSync(new URL("style.css",root),"utf8");
  const app=readFileSync(new URL("src/app.mjs",root),"utf8");
  for(const id of ["cardboardCommands","cardboardRecenterButton","cardboardExitButton"])
    assert.ok(html.includes('id="'+id+'"'));
  assert.match(app,/cardboardTriggerStep\(maze,play\)/);
  assert.match(app,/isCardboardTriggerTap\(triggerStart/);
  assert.match(app,/classList\.add\("cardboard-view","cardboard-manual"\)/);
  assert.match(app,/classList\.remove\("cardboard-manual"\)/);
  assert.match(css,/\.view-explore\.cardboard-view\s*\{\s*position:fixed/);
  assert.match(css,/\.view-explore\.cardboard-manual \.touch-controls/);
});
