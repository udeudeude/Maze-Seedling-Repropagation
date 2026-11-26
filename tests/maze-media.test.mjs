import test from "node:test";
import assert from "node:assert/strict";
import {newMaze,paintTile,primaryCell,changeCellDetails,transferTile} from "../src/maze-world.mjs";
import {photoAt,photoDataUrl,photoEdit,MAX_PHOTO_DATA_URL_LENGTH} from "../src/maze-media.mjs";
import {startPlay,collectAt,tickPlayer,advanceShadows,movePlayer,dismissPhoto} from "../src/maze-play.mjs";
const tinyJpeg="data:image/jpeg;base64,/9j/4AAQ";
test("only bounded embedded JPEG data is accepted; imported URLs and scripts are inert",()=>{
  assert.equal(photoDataUrl(tinyJpeg),tinyJpeg);
  for(const bad of ["https://example.com/a.jpg","data:image/svg+xml;base64,PHN2Zz4=",
    "data:text/html;base64,PGgxPg==","javascript:alert(1)","data:image/jpeg;base64,bad",
    "data:image/jpeg;base64,"+"A".repeat(MAX_PHOTO_DATA_URL_LENGTH)])
    assert.equal(photoDataUrl(bad),null);
  assert.equal(photoAt({type:"info",repropagation:{photo:{dataUrl:"https://wrong"}}}),null);
  assert.equal(photoAt({type:"wall",repropagation:{photo:{dataUrl:tinyJpeg}}}),null);
  assert.throws(()=>photoEdit({}, "https://remote.example/photo.jpg"),TypeError);
});
test("authoring, replacing, removing and copying a photo never alters native metadata",()=>{
  let maze=paintTile(newMaze(),4,6,"info");
  const original=primaryCell(maze,4,6).cell;
  original.text="My photo message";original.photoPath="original/unavailable.jpg";
  original.repropagation={keyId:"gold",photo:{future:17},other:{nested:42}};
  const before=JSON.stringify(maze);
  maze=changeCellDetails(maze,4,6,photoEdit(original,tinyJpeg));
  const edited=primaryCell(maze,4,6).cell;
  assert.equal(photoAt(edited),tinyJpeg);
  assert.equal(edited.photoPath,"original/unavailable.jpg");
  assert.deepEqual(edited.repropagation.other,{nested:42});
  assert.equal(edited.repropagation.photo.future,17);
  const copied=transferTile(maze,4,6,7,8,{copy:true});
  assert.equal(photoAt(primaryCell(copied,7,8).cell),tinyJpeg);
  const roundTrip=JSON.parse(JSON.stringify(copied));
  assert.equal(photoAt(primaryCell(roundTrip,7,8).cell),tinyJpeg);
  const removed=changeCellDetails(maze,4,6,photoEdit(edited,null));
  assert.equal(photoAt(primaryCell(removed,4,6).cell),null);
  assert.equal(primaryCell(removed,4,6).cell.repropagation.photo.future,17);
  assert.equal(primaryCell(removed,4,6).cell.repropagation.keyId,"gold");
  assert.notEqual(JSON.stringify(maze),before);
  assert.equal(photoAt(original),null,"Authoring must not mutate the source");
});
test("photo messages pause time, motion and shadow pursuit until dismissed",()=>{
  let maze=paintTile(newMaze(),2,1,"info");maze=paintTile(maze,6,1,"shadow");
  const entry=maze.data.cells.find(item=>item.type==="info");
  entry.text="A postcard from the maze";entry.repropagation={photo:{dataUrl:tinyJpeg}};
  const before=JSON.stringify(maze);
  const p=collectAt(maze,{...startPlay(maze),x:2.5,z:1.5});
  assert.deepEqual(p.pendingPhoto,{key:"2,1",url:tinyJpeg,caption:entry.text});
  assert.equal(tickPlayer(p,20),p);
  assert.equal(advanceShadows(maze,p,4),p);
  assert.equal(movePlayer(maze,p,1),p);
  const resumed=dismissPhoto(p);
  assert.equal(resumed.pendingPhoto,null);
  assert.equal(tickPlayer(resumed,1).remaining,299);
  assert.equal(collectAt(maze,resumed).pendingPhoto,null);
  assert.equal(JSON.stringify(maze),before);
});
test("photo and key can coexist on one information tile",()=>{
  let maze=paintTile(newMaze(),2,1,"info");
  maze.data.cells.find(c=>c.type==="info").repropagation={
    keyId:"blue",photo:{dataUrl:tinyJpeg}};
  const collected=collectAt(maze,{...startPlay(maze),x:2.5,z:1.5});
  assert.deepEqual(collected.keys,["blue"]);
  assert.equal(collected.pendingPhoto.url,tinyJpeg);
});
