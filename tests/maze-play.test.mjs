import test from "node:test";
import assert from "node:assert/strict";
import {newMaze,paintTile,passable} from "../src/maze-world.mjs";
import {startPlay,movePlayer,rotatePlayer,tickPlayer,castRay,collectAt,answerRiddle,keyPickupId,mapVisibleCells,createWallIndex,advanceShadows,shadowTouches} from "../src/maze-play.mjs";

test("player spawns at original entrance and faces east",()=>{
  const maze=newMaze();
  const p=startPlay(maze);
  assert.deepEqual([p.x,p.z,p.heading,p.remaining],[1.5,1.5,0,300]);
});
test("walls stop movement and raycasts see the first obstacle",()=>{
  let maze=newMaze();
  maze=paintTile(maze,2,1,"wall");
  const p=startPlay(maze);
  let stopped=p;
  for(let i=0;i<10;i++)stopped=movePlayer(maze,stopped,1);
  assert.ok(stopped.x>p.x,"Player must approach the wall");
  assert.ok(stopped.x<1.82,"Player must not cross the wall collision margin");
  const hit=castRay(maze,p.x,p.z,0);
  assert.equal(hit.cellX,2);assert.equal(hit.cellZ,1);
  assert.ok(hit.distance>.49&&hit.distance<.51);
});
test("running accelerates, diagonals stay normalized, and release restores walking speed",()=>{
  const maze=newMaze(),p=startPlay(maze);
  const walk=movePlayer(maze,p,1),run=movePlayer(maze,p,1,0,true);
  assert.ok(run.x>walk.x+.1,"Run should be visibly faster");
  const diagonal=movePlayer(maze,p,1,1);
  assert.ok(Math.hypot(diagonal.x-p.x,diagonal.z-p.z)<=walk.x-p.x+1e-8,
    "Diagonal input must not make the player faster than walking");
  assert.equal(startPlay(maze).slowUntil,0);
});
test("fast running cannot tunnel through walls, traps, or intermediate goal tiles",()=>{
  let blocked=paintTile(newMaze(),2,1,"wall");
  const initial=startPlay(blocked);
  const againstWall=movePlayer(blocked,initial,10,0,true);
  assert.ok(againstWall.x<1.82);
  const maze=newMaze();
  maze.repropagation={physicalHoles:[{position:["3","0","1"],kind:"physical_floor_hole"}]};
  const fallen=movePlayer(maze,startPlay(maze),14,0,true);
  assert.equal(fallen.ended,true);
  assert.match(fallen.message,/physical maze hole/);
  assert.ok(fallen.x<4);
  const finish=paintTile(newMaze(),3,1,"exit");
  assert.equal(movePlayer(finish,startPlay(finish),14,0,true).won,true);
});
test("speed hazards now actually slow movement and recovery is timed",()=>{
  const maze=paintTile(newMaze(),2,1,"speed_hazard");
  const initial=startPlay(maze);
  const slowed=collectAt(maze,{...initial,x:2.5,z:1.5});
  assert.equal(slowed.slowUntil,12);
  const slowedDelta=movePlayer(maze,{...slowed,x:5.5,z:5.5},1).x-5.5;
  const normalDelta=movePlayer(maze,{...initial,x:5.5,z:5.5},1).x-5.5;
  assert.ok(slowedDelta<normalDelta);
  const recovered=tickPlayer(slowed,12);
  assert.equal(recovered.slowUntil,0);
  assert.equal(movePlayer(maze,{...recovered,x:5.5,z:5.5},1).x-5.5,normalDelta);
  const boosted=collectAt(paintTile(newMaze(),2,1,"speed_powerup"),
    {...initial,x:2.5,z:1.5,slowUntil:10});
  assert.equal(boosted.slowUntil,0);
  assert.equal(boosted.boostUntil,25);
  assert.equal(startPlay(maze).slowUntil,0);
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


test("reviewed physical holes end a run without mutating original maze cells",()=>{
  const maze=newMaze();
  maze.repropagation={physicalHoles:[
    {position:["2","0","1"],kind:"physical_floor_hole"}]};
  const initial=startPlay(maze);
  const fallen=collectAt(maze,{...initial,x:2.5,z:1.5});
  assert.equal(fallen.ended,true);
  assert.equal(fallen.won,false);
  assert.match(fallen.message,/physical maze hole/);
  assert.equal(maze.data.cells.length,2);
  assert.equal(movePlayer(maze,fallen,1),fallen);
});

test("user-authored riddles pause gameplay and accept normalized answers without damaging source",()=>{
  const maze=paintTile(newMaze(),2,1,"riddle");
  const idx=maze.data.cells.findIndex(item=>item.type==="riddle");
  maze.data.cells[idx].riddle={unknownOriginalPrompt:42};
  maze.data.cells[idx].repropagation={riddle:{question:"What is  2 + 2?",answer:" FOUR  "}};
  const original=JSON.stringify(maze);
  const start=startPlay(maze);
  const challenged=collectAt(maze,{...start,x:2.5,z:1.5});
  assert.equal(challenged.pendingRiddle.question,"What is  2 + 2?");
  assert.equal(tickPlayer(challenged,20).remaining,start.remaining);
  assert.equal(movePlayer(maze,challenged,1),challenged);
  const wrong=answerRiddle(challenged,"three");
  assert.ok(wrong.pendingRiddle);
  assert.match(wrong.message,/try again/i);
  const correct=answerRiddle(wrong,"  four   ");
  assert.equal(correct.pendingRiddle,null);
  assert.deepEqual(correct.solvedRiddles,["2,1"]);
  assert.equal(collectAt(maze,correct).pendingRiddle,null);
  assert.equal(JSON.stringify(maze),original);
});
test("unanswered riddles are skippable without inventing penalties",()=>{
  const maze=paintTile(newMaze(),2,1,"riddle");
  const idx=maze.data.cells.findIndex(item=>item.type==="riddle");
  maze.data.cells[idx].repropagation={riddle:{question:"Secret?",answer:"yes"}};
  const pending=collectAt(maze,{...startPlay(maze),x:2.5,z:1.5});
  const skipped=answerRiddle(pending,"",{skip:true});
  assert.equal(skipped.pendingRiddle,null);
  assert.equal(skipped.solvedRiddles.length,0);
  assert.equal(answerRiddle(skipped,"yes"),skipped);
  assert.equal(tickPlayer(skipped,1).remaining,299);
});
test("paired secret passages carry the explorer both ways without looping",()=>{
  let maze=paintTile(newMaze(),2,1,"secret_passage","ECHO");
  maze=paintTile(maze,11,7,"secret_passage","ECHO");
  const at=collectAt(maze,{...startPlay(maze),x:2.5,z:1.5});
  assert.deepEqual([at.x,at.z],[11.5,7.5]);
  assert.equal(at.passageLatch,"11,7");
  assert.equal(collectAt(maze,at),at,"arrival must not bounce back");
  const off=collectAt(maze,{...at,x:11.5,z:8.5});
  assert.equal(off.passageLatch,null);
  const returnTrip=collectAt(maze,{...off,x:11.5,z:7.5});
  assert.deepEqual([returnTrip.x,returnTrip.z],[2.5,1.5]);
});
test("unpaired, ambiguous, blocked or hole-linked passages never teleport",()=>{
  let maze=paintTile(newMaze(),2,1,"secret_passage","P");
  let player=collectAt(maze,{...startPlay(maze),x:2.5,z:1.5});
  assert.deepEqual([player.x,player.z],[2.5,1.5]);
  maze=paintTile(maze,3,1,"secret_passage","P");
  maze=paintTile(maze,4,1,"secret_passage","P");
  player=collectAt(maze,{...startPlay(maze),x:2.5,z:1.5});
  assert.equal(player.x,2.5);
  maze.data.cells=maze.data.cells.filter(cell=>Number(cell.position[0])!==4);
  maze.repropagation={physicalHoles:[{position:["3","0","1"],kind:"physical_floor_hole"}]};
  player=collectAt(maze,{...startPlay(maze),x:2.5,z:1.5});
  assert.equal(player.x,2.5);
});

// Reconstructed pickups use original info tiles with optional namespaced data.
test("collected keys unlock gates, update collisions, and preserve original documents",()=>{
  let maze=paintTile(newMaze(),2,1,"info");
  const info=maze.data.cells.find(c=>c.type==="info");
  info.text="Take this key";
  info.repropagation={keyId:" copper ",untouched:{future:17}};
  maze=paintTile(maze,3,1,"gate","copper");
  const original=JSON.stringify(maze),entry=startPlay(maze);
  assert.equal(keyPickupId(info),"copper");
  assert.equal(passable(maze,3,1,entry.keys),false);
  assert.equal(castRay(maze,2.5,1.5,0).kind,"gate");
  const picked=collectAt(maze,{...entry,x:2.5,z:1.5});
  assert.deepEqual(picked.keys,["copper"]);
  assert.match(picked.message,/Picked up key copper/);
  assert.equal(passable(maze,3,1,picked.keys),true);
  assert.notEqual(createWallIndex(maze,picked.keys).tiles[1*18+3],"gate");
  assert.equal(castRay(maze,2.5,1.5,0,28,createWallIndex(maze,picked.keys)).kind,"wall");
  const entered=movePlayer(maze,picked,4);
  assert.ok(entered.x>3,"The collected key permits crossing its gate");
  assert.equal(entered.keys.length,1);
  assert.equal(JSON.stringify(maze),original,"The original maze document is unchanged");
  assert.deepEqual(startPlay(maze).keys,[],"Restart clears the inventory");
});
test("unrelated keys never unlock a gate",()=>{
  let maze=paintTile(newMaze(),2,1,"info");
  maze=paintTile(maze,3,1,"gate","blue");
  const player=collectAt(maze,{...startPlay(maze),x:2.5,z:1.5});
  assert.deepEqual(player.keys,[]);
  assert.equal(passable(maze,3,1,["red"]),false);
  assert.equal(passable(maze,3,1,[]),false);
  assert.equal(keyPickupId({type:"info",repropagation:{keyId:"   "}}),null);
  assert.equal(keyPickupId({type:"map",repropagation:{keyId:"blue"}}),null);
  assert.ok(movePlayer(maze,player,4).x<3);
});
test("several matching gates share a key without consuming it",()=>{
  let maze=paintTile(newMaze(),2,1,"info");
  maze.data.cells.find(c=>c.type==="info").repropagation={keyId:"A"};
  maze=paintTile(maze,3,1,"gate","A");
  maze=paintTile(maze,4,1,"gate","A");
  const pickup=collectAt(maze,{...startPlay(maze),x:2.5,z:1.5});
  assert.equal(passable(maze,3,1,pickup.keys),true);
  assert.equal(passable(maze,4,1,pickup.keys),true);
  const through=movePlayer(maze,pickup,8);
  assert.deepEqual(through.keys,["A"]);
});

test("shadow spawns are independent actors, preserving original cells",()=>{
  const maze=paintTile(newMaze(),8,8,"shadow"),original=JSON.stringify(maze);
  const first=startPlay(maze);
  assert.deepEqual(first.shadows,[{x:8.5,z:8.5,target:null}]);
  const later=advanceShadows(maze,first,1.3);
  assert.notDeepEqual(later.shadows,first.shadows);
  assert.equal(JSON.stringify(maze),original);
  assert.deepEqual(startPlay(maze).shadows,first.shadows,"Restart resets chasers");
});
test("shadows pursue by walkable corridors, avoiding walls and physical holes",()=>{
  let maze=paintTile(newMaze(),4,1,"shadow");
  maze=paintTile(maze,3,1,"wall");
  maze.repropagation={physicalHoles:[{position:["4","0","0"]}]};
  const progressed=advanceShadows(maze,startPlay(maze),2);
  assert.ok(progressed.shadows[0].z>1.5,"Must detour below the wall and hole");
  assert.ok(progressed.shadows[0].x>3.5,"Must not cut through a wall");
  assert.equal(progressed.ended,false);
});
test("closed gates block shadow pursuit until a key unlocks them",()=>{
  let maze=paintTile(newMaze(),4,1,"shadow");
  for(let z=0;z<18;z++)maze=paintTile(maze,3,z,"wall");
  maze=paintTile(maze,3,1,"gate","blue");
  const initial=startPlay(maze);
  const blocked=advanceShadows(maze,initial,4);
  assert.deepEqual(blocked.shadows,initial.shadows);
  const opened=advanceShadows(maze,{...blocked,keys:["blue"]},2.5);
  assert.ok(opened.shadows[0].x<4.5,"Unlocked gate permits pursuit");
});
test("moving into a shadow or being caught ends the run",()=>{
  const maze=paintTile(newMaze(),2,1,"shadow");
  let state=startPlay(maze);
  for(let i=0;i<8&&!state.ended;i++)state=movePlayer(maze,state,1);
  assert.equal(state.ended,true);
  assert.equal(state.won,false);
  assert.match(state.message,/shadow caught/);
  assert.equal(shadowTouches(state),true);
  assert.equal(advanceShadows(maze,startPlay(maze),1.4).ended,true);
});
test("shadows pause during riddles and after the run ends",()=>{
  const maze=paintTile(newMaze(),4,1,"shadow"),state=startPlay(maze);
  const paused={...state,pendingRiddle:{key:"p",answer:"yes",question:"?"}};
  assert.equal(advanceShadows(maze,paused,3),paused);
  const ended={...state,ended:true};
  assert.equal(advanceShadows(maze,ended,3),ended);
  assert.equal(advanceShadows(maze,state,0),state);
});


test("explored map reveals traversed squares and adjacent walls without spoiling the maze",()=>{
  const maze=newMaze(),source=JSON.stringify(maze);
  const initial=startPlay(maze);
  assert.deepEqual(initial.explored,["1,1"]);
  assert.equal(initial.mapRevealed,false);
  const nearby=mapVisibleCells(maze,initial);
  for(const key of ["1,1","0,1","2,1","1,0","1,2"])assert.ok(nearby.has(key));
  assert.ok(!nearby.has("16,16"),"A distant exit should remain hidden");
  const advanced=movePlayer(maze,initial,3);
  assert.ok(advanced.explored.includes("2,1"),"Empty floor must count as explored");
  assert.ok(mapVisibleCells(maze,advanced).has("3,1"),"Nearby unexplored cells remain visible");
  assert.ok(!mapVisibleCells(maze,advanced).has("16,16"));
  assert.deepEqual(initial.explored,["1,1"],"Exploration must not mutate earlier states");
  assert.deepEqual(advanced.visited,["1,1"],"Exploring empty floor must not trigger extra one-time tile effects");
  assert.equal(JSON.stringify(maze),source,"Map discovery must not change maze documents");
});

test("a collectible Map tile opens the full chart, with reset and passage destinations tracked",()=>{
  const maze=paintTile(newMaze(),3,1,"map"),source=JSON.stringify(maze);
  const found=movePlayer(maze,startPlay(maze),9);
  assert.equal(found.mapRevealed,true);
  assert.equal(mapVisibleCells(maze,found),null,"Collecting a Map reveals the whole layout");
  assert.match(found.message,/Full layout revealed/);
  assert.deepEqual(found.explored.slice(0,3),["1,1","2,1","3,1"]);
  assert.equal(startPlay(maze).mapRevealed,false,"Restart restores the unexplored chart");
  assert.equal(JSON.stringify(maze),source,"Collecting the map must never modify the source");
  const passages=paintTile(
    paintTile(newMaze(),2,1,"secret_passage","pair"),
    9,8,"secret_passage","pair");
  const jumped=collectAt(passages,{...startPlay(passages),x:2.5,z:1.5});
  assert.ok(jumped.explored.includes("2,1"));
  assert.ok(jumped.explored.includes("9,8"),"Teleport arrival must be surveyed");
  assert.ok(!mapVisibleCells(passages,jumped).has("16,16"));
});
