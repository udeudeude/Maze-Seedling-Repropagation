import test from "node:test";
import assert from "node:assert/strict";
import {newMaze,paintTile} from "../src/maze-world.mjs";
import {startPlay,collectAt,sceneLandmarks,renderScene} from "../src/maze-play.mjs";

const visible=(maze,player,options)=>sceneLandmarks(maze,player,options).map(x=>x.type);
test("interactive native tiles are visible in first person without altering source",()=>{
  let maze=paintTile(newMaze(),3,1,"map");
  maze=paintTile(maze,4,1,"riddle");
  maze=paintTile(maze,5,1,"secret_passage","A");
  maze=paintTile(maze,6,1,"info");
  maze=paintTile(maze,7,1,"speed_hazard");
  maze=paintTile(maze,8,1,"timer_powerup");
  maze=paintTile(maze,9,1,"exit");
  const source=JSON.stringify(maze);
  const things=visible(maze,startPlay(maze));
  for(const kind of ["map","riddle","secret_passage","info",
    "speed_hazard","timer_powerup","exit"])assert.ok(things.includes(kind),kind);
  assert.equal(JSON.stringify(maze),source);
});
test("obscured tiles and items behind the explorer do not shine through walls",()=>{
  let maze=paintTile(newMaze(),4,1,"map");
  maze=paintTile(maze,3,1,"wall");
  assert.ok(!visible(maze,startPlay(maze)).includes("map"));
  maze=paintTile(maze,3,1,"empty");
  assert.ok(visible(maze,startPlay(maze)).includes("map"));
  const turned={...startPlay(maze),heading:Math.PI};
  assert.ok(!visible(maze,turned).includes("map"));
});
test("collectibles disappear after collection; reusable passages and finish remain visible",()=>{
  let maze=paintTile(newMaze(),3,1,"map");
  maze=paintTile(maze,4,1,"secret_passage","single");
  maze=paintTile(maze,5,1,"exit");
  const start=startPlay(maze);
  const collected=collectAt(maze,{...start,x:3.5,z:1.5});
  assert.ok(collected.mapRevealed);
  assert.ok(!visible(maze,{...collected,x:1.5,z:1.5}).includes("map"));
  assert.ok(visible(maze,{...collected,x:1.5,z:1.5}).includes("secret_passage"));
  assert.ok(visible(maze,{...collected,x:1.5,z:1.5}).includes("exit"));
  const newRun=startPlay(maze);
  assert.ok(visible(maze,newRun).includes("map"));
});
test("key pickups carry a visual key rather than a generic message symbol",()=>{
  const maze=paintTile(newMaze(),3,1,"info");
  const cell=maze.data.cells.find(x=>x.type==="info");
  cell.repropagation={keyId:"bronze"};
  assert.equal(sceneLandmarks(maze,startPlay(maze)).find(x=>x.type==="info").isKey,true);
  assert.equal(sceneLandmarks(maze,{...startPlay(maze),visited:["3,1"]})
    .some(x=>x.type==="info"),false);
});
test("stereo eyes project landmarks with separate horizontal parallax",()=>{
  const maze=paintTile(newMaze(),4,2,"riddle"),player=startPlay(maze);
  const left=sceneLandmarks(maze,player,{eyeOffset:-.022,fov:1.05});
  const right=sceneLandmarks(maze,player,{eyeOffset:.022,fov:1.05});
  assert.equal(left.length,1);assert.equal(right.length,1);
  assert.notEqual(left[0].screenX,right[0].screenX);
  assert.ok(left[0].forward>0&&left[0].forward<14);
});
test("renderer paints copyright-safe landmarks in both single and stereo scenes",()=>{
  const maze=paintTile(newMaze(),3,1,"riddle"),player=startPlay(maze);
  let questionMarks=0;
  const ctx={canvas:{width:240,height:120},save(){},restore(){},
    beginPath(){},rect(){},clip(){},fillRect(){},ellipse(){},fill(){},
    stroke(){},moveTo(){},lineTo(){},translate(){},scale(){},
    strokeRect(){},arc(){},closePath(){},fillText(text){if(text==="?")questionMarks++;}};
  renderScene(ctx,maze,player);
  assert.equal(questionMarks,1);
  renderScene(ctx,maze,player,{stereo:true});
  assert.equal(questionMarks,3,"Each stereo eye needs its own landmark");
});

test("personal photographs appear as visible, wall-occluded scene panels in both eyes",()=>{
  let maze=paintTile(newMaze(),3,1,"info");
  const photoUrl="data:image/jpeg;base64,/9j/4AAQ";
  const message=maze.data.cells.find(c=>c.type==="info");
  message.repropagation={keyId:"amber",photo:{dataUrl:photoUrl}};
  const saved=JSON.stringify(maze),player=startPlay(maze);
  const [item]=sceneLandmarks(maze,player);
  assert.equal(item.photoUrl,photoUrl);
  assert.equal(item.isKey,true);
  const picture={naturalWidth:160,naturalHeight:90};
  const shown=[],requested=[];
  const ctx={canvas:{width:240,height:120},save(){},restore(){},
    beginPath(){},rect(){},clip(){},fillRect(){},ellipse(){},fill(){},
    stroke(){},moveTo(){},lineTo(){},translate(){},scale(){},
    strokeRect(){},arc(){},closePath(){},fillText(){},
    drawImage(...args){shown.push(args);}};
  const photoResolver=url=>{requested.push(url);return picture;};
  renderScene(ctx,maze,player,{photoResolver});
  assert.deepEqual(requested,[photoUrl]);
  assert.equal(shown.length,1);
  assert.equal(shown[0][0],picture);
  assert.ok(shown[0][3]>shown[0][4],"Wide photo retains aspect ratio");
  renderScene(ctx,maze,player,{stereo:true,photoResolver});
  assert.equal(shown.length,3,"Each eye sees the authored image");
  maze=paintTile(maze,2,1,"wall");
  renderScene(ctx,maze,player,{photoResolver});
  assert.equal(shown.length,3,"A wall hides the picture");
  assert.equal(JSON.stringify(message.repropagation.photo),JSON.stringify({dataUrl:photoUrl}));
  assert.equal(saved.includes(photoUrl),true);
});

test("invalid or unready images fall back to the ordinary Message marker",()=>{
  const maze=paintTile(newMaze(),3,1,"info");
  const message=maze.data.cells.find(c=>c.type==="info");
  message.repropagation={photo:{dataUrl:"https://remote.example/photo.jpg"}};
  assert.equal(sceneLandmarks(maze,startPlay(maze))[0].photoUrl,null);
  message.repropagation.photo.dataUrl="data:image/jpeg;base64,/9j/4AAQ";
  let resolved=0,drawn=0;
  const ctx={canvas:{width:240,height:120},save(){},restore(){},
    beginPath(){},rect(){},clip(){},fillRect(){},ellipse(){},fill(){},
    stroke(){},moveTo(){},lineTo(){},translate(){},scale(){},
    strokeRect(){},arc(){},closePath(){},fillText(){},
    drawImage(){drawn++;}};
  renderScene(ctx,maze,startPlay(maze),{photoResolver:()=>{
    resolved++;return {naturalWidth:0,naturalHeight:0};
  }});
  assert.equal(resolved,1);
  assert.equal(drawn,0);
});
