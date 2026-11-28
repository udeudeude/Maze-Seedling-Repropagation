import test from "node:test";
import assert from "node:assert/strict";
import {detectColoredMarkers} from "../src/maze-markers.mjs";
import {applyCaptureFindings} from "../src/maze-recognize.mjs";
import {newMaze,locate} from "../src/maze-world.mjs";

test("colored sticker candidates are localized to the board, not guessed",()=>{
  const width=18*26,height=18*26;
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const index=(y*width+x)*4;
    let rgb=[221,211,190];
    if(x>=2*26+6&&x<3*26-6&&y>=3*26+6&&y<4*26-6)
      rgb=[191,49,42];
    if(x>=14*26+6&&x<15*26-6&&y>=13*26+6&&y<14*26-6)
      rgb=[50,151,182];
    data.set([...rgb,255],index);
  }
  const result=detectColoredMarkers({width,height,data});
  assert.deepEqual(result.map(r=>[r.type,r.x,r.z]),
    [["exit",2,3],["entrance",14,13]]);
});
test("neutral photographs do not hallucinate colored markers",()=>{
  const width=100,height=100;
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4)data.set([210,207,200,255],i);
  assert.deepEqual(detectColoredMarkers({width,height,data}),[]);
});
test("approved markers replace defaults but preserve maze metadata",()=>{
  const original=newMaze();
  original.addedByUser={keep:true};
  const result=applyCaptureFindings(original,[],[],{
    entrance:{x:2,z:3},exit:{x:14,z:13}});
  assert.equal(result.movedMarkers,2);
  assert.deepEqual(locate(result.maze,"entrance"),[[2,3]]);
  assert.deepEqual(locate(result.maze,"exit"),[[14,13]]);
  assert.deepEqual(locate(original,"entrance"),[[1,1]]);
  assert.deepEqual(result.maze.addedByUser,{keep:true});
});
test("marker locations cannot silently overwrite existing walls or holes",()=>{
  const original=newMaze();
  original.data.cells.push({position:["8","0","8"],type:"wall"});
  const blocked=applyCaptureFindings(original,[],[],{entrance:{x:8,z:8}});
  assert.equal(blocked.movedMarkers,0);
  const pit=applyCaptureFindings(original,[],[{x:9,z:9}],
    {exit:{x:9,z:9}});
  assert.equal(pit.movedMarkers,0);
});

test("both photographed markers can swap squares without losing native marker metadata",()=>{
  const original=newMaze();
  const entrance=original.data.cells.find(cell=>cell.type==="entrance");
  const exit=original.data.cells.find(cell=>cell.type==="exit");
  entrance.variant="7";entrance.unknownNative={flag:"retain",array:[1,2,3]};
  exit.customField="original-finish";exit.position[1]="3";exit.position.push("opaque");
  const snapshot=JSON.stringify(original);
  const result=applyCaptureFindings(original,[],[],{
    entrance:{x:16,z:16},exit:{x:1,z:1}
  });
  assert.equal(result.movedMarkers,2);
  assert.deepEqual(locate(result.maze,"entrance"),[[16,16]]);
  assert.deepEqual(locate(result.maze,"exit"),[[1,1]]);
  const movedStart=result.maze.data.cells.find(c=>c.type==="entrance");
  const movedFinish=result.maze.data.cells.find(c=>c.type==="exit");
  assert.equal(movedStart.variant,"7");
  assert.deepEqual(movedStart.unknownNative,{flag:"retain",array:[1,2,3]});
  assert.equal(movedFinish.customField,"original-finish");
  assert.deepEqual(movedFinish.position,["1","3","1","opaque"]);
  assert.equal(JSON.stringify(original),snapshot,"Import cannot mutate source");
});

test("moving markers first permits photographed walls at vacated originals",()=>{
  const original=newMaze();
  const result=applyCaptureFindings(original,[{x:1,z:1},{x:16,z:16},
    {x:5,z:5}],[],{
    entrance:{x:3,z:3},exit:{x:14,z:14}
  });
  assert.equal(result.movedMarkers,2);
  assert.equal(result.appliedWalls,3);
  assert.deepEqual(locate(result.maze,"entrance"),[[3,3]]);
  assert.deepEqual(locate(result.maze,"exit"),[[14,14]]);
  assert.deepEqual(locate(result.maze,"wall").sort(),
    [[1,1],[5,5],[16,16]].sort());
});

test("a marker cannot displace the other marker unless that marker moves too",()=>{
  const original=newMaze(),snapshot=JSON.stringify(original);
  const refused=applyCaptureFindings(original,[],[],{entrance:{x:16,z:16}});
  assert.equal(refused.movedMarkers,0);
  assert.deepEqual(locate(refused.maze,"entrance"),[[1,1]]);
  assert.deepEqual(locate(refused.maze,"exit"),[[16,16]]);
  assert.equal(JSON.stringify(original),snapshot);
});

test("an obstructed or malformed two-marker approval changes neither marker",()=>{
  const original=newMaze();
  original.data.cells.push({type:"gate",position:["8","0","8"],nativeFlag:42});
  const originalSnapshot=JSON.stringify(original);
  for(const proposed of [
    {entrance:{x:3,z:3},exit:{x:8,z:8}},
    {entrance:{x:3,z:3},exit:{x:-1,z:4}},
    {entrance:{x:3,z:3},exit:{x:3,z:3}},
    {entrance:{x:3,z:3},exit:{x:8.5,z:8}}
  ]){
    const result=applyCaptureFindings(original,[],[],proposed);
    assert.equal(result.movedMarkers,0,JSON.stringify(proposed));
    assert.deepEqual(locate(result.maze,"entrance"),[[1,1]]);
    assert.deepEqual(locate(result.maze,"exit"),[[16,16]]);
    assert.equal(result.maze.data.cells.find(c=>c.type==="gate").nativeFlag,42);
  }
  assert.equal(JSON.stringify(original),originalSnapshot);
});

test("duplicate original role cells remain intact rather than being deleted",()=>{
  const original=newMaze();
  original.data.cells.push({type:"entrance",position:["3","0","3"],unknown:"keep"});
  const result=applyCaptureFindings(original,[],[],{
    entrance:{x:4,z:4},exit:{x:8,z:8}});
  assert.equal(result.movedMarkers,0);
  assert.deepEqual(locate(result.maze,"entrance").sort(),[[1,1],[3,3]].sort());
  assert.deepEqual(locate(result.maze,"exit"),[[16,16]]);
  assert.equal(result.maze.data.cells.find(c=>c.unknown==="keep").type,"entrance");
});

test("approved markers do not cover photographed holes or partially relocate",()=>{
  const original=newMaze();
  const result=applyCaptureFindings(original,[],[{x:9,z:9}],{
    entrance:{x:3,z:3},exit:{x:9,z:9}});
  assert.equal(result.movedMarkers,0);
  assert.deepEqual(locate(result.maze,"entrance"),[[1,1]]);
  assert.deepEqual(locate(result.maze,"exit"),[[16,16]]);
  assert.equal(result.annotatedHoles,1);
  assert.equal(result.maze.repropagation.physicalHoles[0].kind,
    "physical_floor_hole");
});

test("one approved marker can move safely and repeated imports are idempotent",()=>{
  const original=newMaze();
  const result=applyCaptureFindings(original,[],[],{exit:{x:12,z:10}});
  assert.equal(result.movedMarkers,1);
  assert.deepEqual(locate(result.maze,"entrance"),[[1,1]]);
  assert.deepEqual(locate(result.maze,"exit"),[[12,10]]);
  const again=applyCaptureFindings(result.maze,[],[],{exit:{x:12,z:10}});
  assert.equal(again.movedMarkers,0);
});
