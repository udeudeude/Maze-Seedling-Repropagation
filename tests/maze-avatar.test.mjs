import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newMaze} from "../src/maze-world.mjs";
import {avatarAt,avatarEdit,avatarCropRect,MAX_AVATAR_NAME_LENGTH} from "../src/maze-avatar.mjs";
const jpeg="data:image/jpeg;base64,/9j/4AAQ";

test("optional player selfie survives original-format export without changing opaque avatars",()=>{
  const maze=newMaze("Shared maze");
  maze.data.player_avatars={originalPlayer:{photoPath:"private/native.selfie",score:17}};
  maze.repropagation={future:{keep:"yes"},playerAvatar:{otherVersion:9}};
  const before=JSON.stringify(maze);
  const next=avatarEdit(maze,{name:"  A   Friend  ",dataUrl:jpeg});
  assert.deepEqual(avatarAt(next),{name:"A Friend",dataUrl:jpeg});
  assert.deepEqual(next.data.player_avatars,maze.data.player_avatars);
  assert.deepEqual(next.repropagation.future,{keep:"yes"});
  assert.equal(next.repropagation.playerAvatar.otherVersion,9);
  assert.equal(JSON.stringify(maze),before);
  assert.deepEqual(avatarAt(JSON.parse(JSON.stringify(next))),avatarAt(next));
});
test("replacing or removing a player selfie keeps other original and extension data",()=>{
  const original=newMaze();
  original.data.player_avatars={notOurs:{version:23}};
  let next=avatarEdit(original,{name:"Pilot",dataUrl:jpeg});
  next=avatarEdit(next,{name:"Pilot",dataUrl:null});
  assert.deepEqual(avatarAt(next),{name:"Pilot",dataUrl:null});
  next=avatarEdit(next,{name:"",dataUrl:null});
  assert.deepEqual(avatarAt(next),{name:"",dataUrl:null});
  assert.equal(next.repropagation,undefined);
  assert.deepEqual(next.data.player_avatars,original.data.player_avatars);
});
test("untrusted image URLs, SVG and overlong embedded photos cannot become selfies",()=>{
  const base=newMaze();
  for(const unsafe of ["https://example.org/headshot.jpg",
    "data:image/svg+xml;base64,PHN2Zz4=","data:text/html;base64,PGgxPg==",
    "data:image/jpeg;base64,"+"A".repeat(120000)])
    assert.throws(()=>avatarEdit(base,{dataUrl:unsafe}),TypeError);
  const imported=JSON.parse(JSON.stringify(base));
  imported.repropagation={playerAvatar:{name:"Guest",dataUrl:"https://example.org/img"}};
  assert.deepEqual(avatarAt(imported),{name:"Guest",dataUrl:null});
});
test("names are bounded and displayed as plain text",()=>{
  const original=newMaze();
  assert.equal(avatarAt(avatarEdit(original,{name:"  Jo\n  Lee \t " })).name,"Jo Lee");
  assert.throws(()=>avatarEdit(original,{name:"A".repeat(MAX_AVATAR_NAME_LENGTH+1)}),RangeError);
  const encoded=avatarEdit(original,{name:"<img src=x onerror=alert(1)>"});
  assert.equal(avatarAt(encoded).name,"<img src=x onerror=alert(1)>");
});
test("selfie cropping preserves a square frame and favors faces near the upper center",()=>{
  assert.deepEqual(avatarCropRect(300,300),{x:0,y:0,size:300});
  assert.deepEqual(avatarCropRect(600,300),{x:150,y:0,size:300});
  assert.deepEqual(avatarCropRect(300,500),{x:0,y:70,size:300});
  assert.throws(()=>avatarCropRect(0,500),RangeError);
  assert.throws(()=>avatarCropRect(NaN,500),RangeError);
});
test("selfie editing UI is explicitly opt-in and includes cancellation and safe local storage",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  const worker=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  for(const id of ["playerButton","avatarDialog","avatarPhotoInput","avatarNameInput",
    "removeAvatarPhotoButton","saveAvatarButton"])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(app,/function initializeAvatar\(/);
  assert.match(app,/avatarImportGeneration/);
  assert.match(app,/saveActiveDocument\(library,next\)/);
  assert.match(app,/localStorage\.setItem\(LIBRARY_STORAGE_KEY,JSON\.stringify\(updated\)\)/);
  assert.match(worker,/src\/maze-avatar\.mjs/);
});
