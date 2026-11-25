import {parseMaze, serializeMaze, validateMaze} from "./maze-document.mjs";
import {
  SIZE,TILE_NAMES,newMaze,sampleMaze,paintTile,eraseAt,changeCellDetails,
  cellCoordinates,primaryCell,locate,findRoute,examineMaze
} from "./maze-world.mjs";
import {startPlay,movePlayer,rotatePlayer,tickPlayer,renderScene,THEMATIC} from "./maze-play.mjs";
import {warpSquarePixels,initialCorners} from "./maze-capture.mjs";
import {suggestWalls,applyCaptureFindings} from "./maze-recognize.mjs";

const $=selector=>document.querySelector(selector);
const el=id=>document.getElementById(id);
const STORAGE="seedling-repropagation.board.v1";
const glyphs={
  hole:"◉",wall:"▰",floor:"▱",empty:"⌫",entrance:"●",exit:"◆",
  gate:"▥",info:"✉",map:"▤",riddle:"?",secret_passage:"↯",
  shadow:"◉",speed_hazard:"−",speed_powerup:"+",
  timer_hazard:"−30",timer_powerup:"+30"
};
const labels={...TILE_NAMES,hole:"Physical hole"};
const tileColors={
  entrance:"#316c4c",exit:"#a16a2e",wall:"#9e7955",gate:"#a35755",
  info:"#617c85",map:"#77949a",riddle:"#8966a2",secret_passage:"#617667",
  shadow:"#434553",speed_hazard:"#885358",speed_powerup:"#447b85",
  timer_hazard:"#99634d",timer_powerup:"#66916a",floor:"#cebfa0"
};

function restore() {
  try {
    const saved=localStorage.getItem(STORAGE);
    if(saved)return parseMaze(saved);
  }catch(e){console.warn("Saved board could not be restored",e);}
  return newMaze();
}
let maze=restore(),undo=[],redo=[],selected="wall",inspection=false,route=null,view="build";
let currentTile=null,photoImage=null,photoCorners=null,photoGuide=null;
let scanPixels=null,scanGuide=null,scanResult=null,scanSelected=new Set();
let scanAdded=new Set(),scanRemoved=new Set();
let scanSelectedHoles=new Map(),scanAddedHoles=new Map(),scanRejectedHoles=new Set();
let scanMode="walls",markerBrush="entrance";
let scanMarkers=new Map(),scanMarkerEdits=new Map();
let play=startPlay(maze),stereo=false,showMap=false,holding=new Set();
let lastFrame=0,lastBoardRect=null,boardPainting=false,boardLastCell=null;
const toolOrder=["wall","empty","hole","entrance","exit","gate","riddle","info","map",
  "secret_passage","shadow","speed_powerup","speed_hazard","timer_powerup","timer_hazard","floor"];

function persist() {
  try {
    localStorage.setItem(STORAGE,serializeMaze(maze));
    el("savedIndicator").textContent="Saved locally";
  }catch(e){
    el("savedIndicator").textContent="Save unavailable";
    console.warn("Local storage failed",e);
  }
}
function notice(message) {
  el("tileStatus").textContent=message;
  el("playMessage").textContent=message;
}
function commit(next) {
  if(JSON.stringify(next)===JSON.stringify(maze))return;
  undo.push(serializeMaze(maze,0));
  if(undo.length>60)undo.shift();
  redo=[];
  maze=parseMaze(next);route=null;
  persist();redrawAll();
}
function undoOrRedo(backward) {
  const source=backward?undo:redo,target=backward?redo:undo;
  if(!source.length)return;
  target.push(serializeMaze(maze,0));
  maze=parseMaze(source.pop());route=null;
  persist();redrawAll();
}
function refreshActions() {
  el("undoButton").disabled=!undo.length;
  el("redoButton").disabled=!redo.length;
  el("themeSelect").value=maze.data.theme;
  el("buildTitle").textContent=maze.name||"My Maze";
  el("boardStatus").textContent=maze.data.scale[0]+" × "+maze.data.scale[2];
  el("mazeNameInput").value=maze.name??"";
}
function redrawAll() {
  refreshActions();
  renderBoard();
  if(view==="explore")renderPlay();
}

function canvasSize(canvas,cap=900) {
  const rect=canvas.getBoundingClientRect();
  const scale=Math.min(window.devicePixelRatio||1,2.5,cap/Math.max(1,rect.width));
  const width=Math.max(1,Math.round(rect.width*scale));
  const height=Math.max(1,Math.round(rect.height*scale));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  return {rect,width,height};
}
function indexAt(event,canvas) {
  const rect=canvas.getBoundingClientRect();
  const x=Math.floor((event.clientX-rect.left)/rect.width*Number(maze.data.scale[0]));
  const z=Math.floor((event.clientY-rect.top)/rect.height*Number(maze.data.scale[2]));
  if(x<0||z<0||x>=Number(maze.data.scale[0])||z>=Number(maze.data.scale[2]))return null;
  return [x,z];
}
function tileMap() {
  const map=new Map();
  maze.data.cells.forEach(c=>{
    const [x,z]=cellCoordinates(c),key=x+","+z;
    const old=map.get(key);
    const ranking=kind=>({entrance:40,exit:40,wall:30,gate:29,shadow:22,secret_passage:22,floor:0})[kind]??15;
    if(!old||ranking(c.type)>=ranking(old.type))map.set(key,c);
  });
  return map;
}
function renderBoard() {
  const canvas=el("boardCanvas");
  if(!canvas||canvas.offsetParent===null)return;
  const {width:w,height:h}=canvasSize(canvas);
  const ctx=canvas.getContext("2d");
  const rows=Number(maze.data.scale[2]),cols=Number(maze.data.scale[0]);
  const tw=w/cols,th=h/rows;
  ctx.clearRect(0,0,w,h);
  const boardTheme=THEMATIC[maze.data.theme]??THEMATIC.marble_maze;
  ctx.fillStyle="#d6c39f";ctx.fillRect(0,0,w,h);
  if(photoGuide){
    ctx.globalAlpha=.55;ctx.drawImage(photoGuide,0,0,w,h);ctx.globalAlpha=1;
  }
  const tiles=tileMap();
  for(let z=0;z<rows;z++)for(let x=0;x<cols;x++){
    const cell=tiles.get(x+","+z);
    if(!photoGuide){ctx.fillStyle=(x+z)%2?"#d5c29e":"#cdb992";ctx.fillRect(x*tw,z*th,tw,th);}
    if(!cell)continue;
    const xx=x*tw,yy=z*th,type=cell.type;
    if(type==="wall"){
      ctx.fillStyle="#5b4739";ctx.fillRect(xx+tw*.09,yy+th*.12,tw*.85,th*.82);
      ctx.fillStyle="#977855";ctx.fillRect(xx+tw*.07,yy+th*.08,tw*.8,th*.73);
      ctx.fillStyle="#c5a984";ctx.fillRect(xx+tw*.1,yy+th*.09,tw*.69,th*.1);
    }else if(type==="floor"){
      ctx.fillStyle="rgba(255,255,255,.22)";ctx.fillRect(xx+tw*.1,yy+th*.1,tw*.8,th*.8);
    }else{
      const size=Math.min(tw,th);
      ctx.beginPath();ctx.fillStyle=tileColors[type]??"#67717c";
      ctx.arc(xx+tw/2,yy+th/2,size*.36,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#fff8e8";ctx.font="bold "+Math.max(10,size*.38)+"px -apple-system, sans-serif";
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillText(glyphs[type]??"•",xx+tw/2,yy+th/2+size*.01);
    }
  }
  // Physical holes are preserved in our own namespace until their original
  // Android cell representation can be verified independently.
  for(const item of maze.repropagation?.physicalHoles??[]){
    const x=Number(item.position?.[0]),z=Number(item.position?.[2]);
    if(!Number.isInteger(x)||!Number.isInteger(z)||x<0||z<0||x>=cols||z>=rows)continue;
    ctx.beginPath();ctx.fillStyle="#151a1b";
    ctx.arc((x+.5)*tw,(z+.5)*th,Math.min(tw,th)*.28,0,Math.PI*2);
    ctx.fill();
    ctx.strokeStyle="#d0984a";ctx.lineWidth=Math.max(1,w/500);ctx.stroke();
  }
  ctx.beginPath();ctx.strokeStyle="rgba(75,58,38,.30)";ctx.lineWidth=Math.max(.6,w/680);
  for(let x=0;x<=cols;x++){const xx=Math.round(x*tw)+.5;ctx.moveTo(xx,0);ctx.lineTo(xx,h);}
  for(let z=0;z<=rows;z++){const yy=Math.round(z*th)+.5;ctx.moveTo(0,yy);ctx.lineTo(w,yy);}
  ctx.stroke();
  if(route){
    ctx.fillStyle="rgba(54,101,86,.25)";
    for(const [x,z] of route)ctx.fillRect(x*tw,z*th,tw,th);
  }
  if(currentTile){
    const [x,z]=currentTile;
    ctx.strokeStyle="#fff9e0";ctx.lineWidth=Math.max(2,w/170);
    ctx.strokeRect(x*tw+1,z*th+1,tw-2,th-2);
  }
  // A restrained physical board outline without copying the original art.
  ctx.lineWidth=Math.max(3,w/120);ctx.strokeStyle="#594a35";ctx.strokeRect(1,1,w-2,h-2);
  lastBoardRect={tw,th,w,h};
}

function prepareToolbox() {
  const group=el("toolbox");
  group.replaceChildren();
  for(const type of toolOrder){
    const button=document.createElement("button");
    button.type="button";button.className="tool";
    button.dataset.tool=type;button.setAttribute("aria-pressed",String(type===selected));
    const mark=document.createElement("span");mark.className="glyph";mark.textContent=glyphs[type];
    const name=document.createElement("span");name.className="tool-name";
    name.textContent=type==="empty"?"Erase":labels[type];
    button.append(mark,name);
    button.addEventListener("click",()=>{
      selected=type;inspection=false;
      el("inspectButton").setAttribute("aria-pressed","false");
      for(const child of group.children)child.setAttribute("aria-pressed",String(child===button));
      notice((type==="empty"?"Erase":labels[type])+" selected · Tap or drag on the board");
    });
    group.append(button);
  }
}
function paint(x,z) {
  if(inspection){openTileDialog(x,z);return;}
  // One entrance and one exit in newly edited mazes.
  let target=maze;
  if(selected==="entrance"||selected==="exit"){
    target=parseMaze(target);
    target.data.cells=target.data.cells.filter(c=>{
      const [cx,cz]=cellCoordinates(c);
      return c.type!==selected || (cx===x&&cz===z);
    });
  }
  if(selected==="hole"||selected==="empty"){
    const next=parseMaze(target);
    const previous=next.repropagation?.physicalHoles??[];
    const others=previous.filter(item=>
      !(Number(item.position?.[0])===x&&Number(item.position?.[2])===z));
    if(selected==="hole"&&others.length===previous.length)
      others.push({position:[String(x),"0",String(z)],
        kind:"physical_floor_hole",source:"manual_editor"});
    next.repropagation={...next.repropagation,physicalHoles:others};
    if(selected==="hole"){
      commit(next);currentTile=[x,z];renderBoard();
      notice("Physical hole updated at "+(x+1)+", "+(z+1));return;
    }
    target=next;
  }
  commit(paintTile(target,x,z,selected));
  currentTile=[x,z];
  renderBoard();
  notice((selected==="empty"?"Erased":labels[selected])+" · "+(x+1)+", "+(z+1));
}
function initializeBoardInput() {
  const canvas=el("boardCanvas");
  canvas.addEventListener("pointerdown",event=>{
    if(event.button!==0&&event.pointerType==="mouse")return;
    const cell=indexAt(event,canvas);
    if(!cell)return;
    boardPainting=true;boardLastCell=cell.join(",");
    canvas.setPointerCapture(event.pointerId);
    paint(...cell);
  });
  canvas.addEventListener("pointermove",event=>{
    if(!boardPainting||inspection)return;
    const cell=indexAt(event,canvas);
    if(!cell)return;
    const key=cell.join(",");
    if(key!==boardLastCell){boardLastCell=key;paint(...cell);}
  });
  const finish=()=>{boardPainting=false;boardLastCell=null;};
  canvas.addEventListener("pointerup",finish);
  canvas.addEventListener("pointercancel",finish);
  canvas.addEventListener("keydown",event=>{
    if(!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter"," "].includes(event.key))return;
    event.preventDefault();
    currentTile??=[1,1];
    const [x,z]=currentTile;
    if(event.key==="ArrowUp")currentTile=[x,Math.max(0,z-1)];
    else if(event.key==="ArrowDown")currentTile=[x,Math.min(Number(maze.data.scale[2])-1,z+1)];
    else if(event.key==="ArrowLeft")currentTile=[Math.max(0,x-1),z];
    else if(event.key==="ArrowRight")currentTile=[Math.min(Number(maze.data.scale[0])-1,x+1),z];
    else paint(...currentTile);
    renderBoard();
  });
}

function openTileDialog(x,z) {
  const present=primaryCell(maze,x,z)?.cell;
  if(!present){notice("No tile at "+(x+1)+", "+(z+1));return;}
  currentTile=[x,z];
  el("tileDialogTitle").textContent="Tile "+(x+1)+", "+(z+1);
  el("tileDetailType").textContent=labels[present.type]??present.type;
  el("variantInput").value=present.variant??"";
  el("messageInput").value=present.text??present.message??"";
  el("tileDialog").showModal();
}
function initializeDialogs() {
  el("menuButton").addEventListener("click",()=>{
    el("mazeNameInput").value=maze.name??"";
    el("menuDialog").showModal();
  });
  el("renameButton").addEventListener("click",()=>{
    const newName=el("mazeNameInput").value.trim();
    if(!newName){notice("A maze needs a name");return;}
    commit({...maze,name:newName});el("menuDialog").close();
  });
  el("importButton").addEventListener("click",()=>el("importInput").click());
  el("importInput").addEventListener("change",async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      const next=parseMaze(await file.text());
      commit(next);play=startPlay(maze);el("menuDialog").close();
      notice("Imported "+(maze.name??file.name)+" · Original fields preserved");
    }catch(error){alert("Could not read this maze file: "+error.message);}
    event.target.value="";
  });
  el("exportButton").addEventListener("click",()=>{
    const text=serializeMaze(maze);
    const blob=new Blob([text],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;link.download=(maze.name||"my-maze").replace(/[^a-z0-9_-]+/gi,"-")+".json";
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),20000);
    el("menuDialog").close();notice("Maze exported to Files or Downloads");
  });
  el("newButton").addEventListener("click",()=>{
    if(!confirm("Start a new maze? Your current maze can be recovered with Undo or an exported backup."))return;
    commit(newMaze());play=startPlay(maze);el("menuDialog").close();notice("Blank maze ready");
  });
  el("practiceButton").addEventListener("click",()=>{
    if(!confirm("Load the original-format practice maze? Your current maze will be undoable."))return;
    commit(sampleMaze());play=startPlay(maze);el("menuDialog").close();notice("Practice maze loaded");
  });
  el("saveTileButton").addEventListener("click",()=>{
    if(!currentTile)return;
    const [x,z]=currentTile;
    const original=primaryCell(maze,x,z)?.cell;
    if(!original)return;
    const edits={};
    const variant=el("variantInput").value.trim();
    if(variant)edits.variant=variant;
    const text=el("messageInput").value.trim();
    if(text)edits.text=text;
    commit(changeCellDetails(maze,x,z,edits));
    el("tileDialog").close();notice("Tile details saved");
  });
  el("deleteTileButton").addEventListener("click",()=>{
    if(!currentTile)return;
    commit(eraseAt(maze,...currentTile));
    el("tileDialog").close();notice("Tile erased");
  });
}

function setView(next) {
  view=next;
  for(const name of ["build","photo","explore"]){
    el(name+"View").hidden=name!==next;
  }
  document.querySelectorAll(".tab").forEach(tab=>{
    const active=tab.dataset.view===next;
    tab.classList.toggle("active",active);
    if(active)tab.setAttribute("aria-current","page");
    else tab.removeAttribute("aria-current");
  });
  el("main").scrollTop=0;
  holding.clear();lastFrame=0;
  if(next==="build")requestAnimationFrame(renderBoard);
  if(next==="explore"){
    play=startPlay(maze);requestAnimationFrame(renderPlay);
  }
  if(next==="photo")requestAnimationFrame(renderPhoto);
}

function renderMapOverlay(ctx) {
  const w=ctx.canvas.width,h=ctx.canvas.height;
  const size=Math.min(w*.32,h*.56),x=16,y=h-size-15;
  const gw=Number(maze.data.scale[0]),gh=Number(maze.data.scale[2]);
  ctx.save();ctx.globalAlpha=.87;ctx.fillStyle="#18242b";ctx.fillRect(x-5,y-5,size+10,size+10);
  ctx.globalAlpha=1;
  ctx.fillStyle="#9ba9ae";ctx.fillRect(x,y,size,size);
  const tw=size/gw,th=size/gh;
  for(const item of maze.data.cells){
    const [cx,cz]=cellCoordinates(item);
    if(cx<0||cz<0||cx>=gw||cz>=gh)continue;
    ctx.fillStyle=item.type==="wall"?"#3d4448":item.type==="gate"?"#e7bd78":
      item.type==="exit"?"#ffc67e":item.type==="entrance"?"#356b4c":"#829697";
    ctx.fillRect(x+cx*tw,y+cz*th,tw,th);
  }
  for(const hole of maze.repropagation?.physicalHoles??[]){
    const hx=Number(hole.position?.[0]),hz=Number(hole.position?.[2]);
    if(!Number.isInteger(hx)||!Number.isInteger(hz)||hx<0||hz<0||hx>=gw||hz>=gh)continue;
    ctx.beginPath();ctx.arc(x+(hx+.5)*tw,y+(hz+.5)*th,
      Math.max(1.8,tw*.32),0,Math.PI*2);
    ctx.fillStyle="#101113";ctx.fill();
    ctx.strokeStyle="#f2b765";ctx.lineWidth=1;ctx.stroke();
  }
  ctx.fillStyle="#fdf7e4";ctx.beginPath();
  ctx.arc(x+play.x*tw,y+play.z*th,Math.max(3,tw*.65),0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function renderPlay() {
  if(view!=="explore")return;
  const canvas=el("sceneCanvas");
  if(canvas.offsetParent===null)return;
  canvasSize(canvas,1024);
  const ctx=canvas.getContext("2d");
  renderScene(ctx,maze,play,{stereo});
  if(showMap)renderMapOverlay(ctx);
  const seconds=Math.ceil(play.remaining);
  el("timeReadout").textContent=Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");
  el("playReadout").textContent=play.ended?(play.won?"Completed":"Game over"):play.message;
  el("playMessage").textContent=play.message;
}
function initializePlay() {
  el("restartButton").addEventListener("click",()=>{play=startPlay(maze);renderPlay();});
  el("mapButton").addEventListener("click",event=>{
    showMap=!showMap;event.currentTarget.setAttribute("aria-pressed",String(showMap));
    renderPlay();
  });
  el("stereoButton").addEventListener("click",event=>{
    stereo=!stereo;event.currentTarget.setAttribute("aria-pressed",String(stereo));
    event.currentTarget.textContent=stereo?"Exit Cardboard":"Cardboard";
    renderPlay();
  });
  document.querySelectorAll("[data-control]").forEach(button=>{
    const name=button.dataset.control;
    const release=()=>{holding.delete(name);button.classList.remove("pressed");};
    button.addEventListener("pointerdown",event=>{
      if(event.button!==0&&event.pointerType==="mouse")return;
      event.preventDefault();holding.add(name);button.classList.add("pressed");
      button.setPointerCapture(event.pointerId);
    });
    for(const event of ["pointerup","pointercancel","lostpointercapture"])
      button.addEventListener(event,release);
  });
  const keyMap={ArrowUp:"forward",KeyW:"forward",ArrowDown:"backward",
    KeyS:"backward",KeyA:"strafeLeft",KeyD:"strafeRight",
    ArrowLeft:"turnLeft",KeyQ:"turnLeft",ArrowRight:"turnRight",KeyE:"turnRight"};
  window.addEventListener("keydown",event=>{
    if(view!=="explore"||event.target.closest("input,textarea,select"))return;
    const move=keyMap[event.code];if(move){event.preventDefault();holding.add(move);}
  });
  window.addEventListener("keyup",event=>{const move=keyMap[event.code];if(move)holding.delete(move);});
  const canvas=el("sceneCanvas");
  let lookX=null;
  canvas.addEventListener("pointerdown",event=>{lookX=event.clientX;canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener("pointermove",event=>{
    if(lookX===null)return;
    play=rotatePlayer(play,(event.clientX-lookX)*.008);lookX=event.clientX;renderPlay();
  });
  const endLook=()=>{lookX=null;};
  canvas.addEventListener("pointerup",endLook);canvas.addEventListener("pointercancel",endLook);
  const frame=time=>{
    if(view==="explore" && !document.hidden){
      const dt=lastFrame?Math.min(.075,(time-lastFrame)/1000):0;lastFrame=time;
      if(dt && !play.ended) {
        const turn=Number(holding.has("turnRight"))-Number(holding.has("turnLeft"));
        const forward=Number(holding.has("forward"))-Number(holding.has("backward"));
        const strafe=Number(holding.has("strafeRight"))-Number(holding.has("strafeLeft"));
        if(turn)play=rotatePlayer(play,turn*dt*1.9);
        if(forward||strafe)play=movePlayer(maze,play,forward*dt*6,strafe*dt*6);
        play=tickPlayer(play,dt);
      }
      renderPlay();
    }else lastFrame=0;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function renderPhoto() {
  if(!photoImage||view!=="photo")return;
  const canvas=el("photoCanvas"),ctx=canvas.getContext("2d");
  // Canvas image dimensions are source-space, limited during import.
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(photoImage,0,0,canvas.width,canvas.height);
  if(!photoCorners)return;
  ctx.strokeStyle="#ffe8a2";ctx.lineWidth=Math.max(2,canvas.width/250);
  ctx.beginPath();photoCorners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.closePath();ctx.stroke();
  photoCorners.forEach((p,i)=>{
    const radius=Math.max(12,canvas.width/33);
    ctx.beginPath();ctx.arc(p.x,p.y,radius,0,2*Math.PI);
    ctx.fillStyle="#171f29";ctx.fill();ctx.strokeStyle="#fff0bd";ctx.lineWidth=3;ctx.stroke();
    ctx.font="bold "+Math.round(radius)+"px sans-serif";
    ctx.fillStyle="#ffeabd";ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText(String(i+1),p.x,p.y);
  });
}
function initializePhoto() {
  const canvas=el("photoCanvas");
  function loadPhoto(event) {
    const file=event.target.files?.[0];if(!file)return;
    if(!file.type.startsWith("image/")){notice("Select a photograph");return;}
    const url=URL.createObjectURL(file);
    const image=new Image();
    image.onload=()=>{
      URL.revokeObjectURL(url);
      photoImage=image;
      const max=980,scale=Math.min(max/image.naturalWidth,max/image.naturalHeight,1);
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      canvas.style.aspectRatio=canvas.width+" / "+canvas.height;
      photoCorners=initialCorners(canvas.width,canvas.height);
      scanPixels=null;scanGuide=null;scanResult=null;scanSelected.clear();
      scanAdded.clear();scanRemoved.clear();
      scanSelectedHoles.clear();scanAddedHoles.clear();scanRejectedHoles.clear();
      scanMarkers.clear();scanMarkerEdits.clear();
      el("scanStage").hidden=true;
      el("photoStage").hidden=false;
      el("photoActions").hidden=false;
      el("detectButton").disabled=false;
      el("traceButton").disabled=false;el("clearPhotoButton").disabled=false;
      renderPhoto();
    };
    image.onerror=()=>{URL.revokeObjectURL(url);alert("Unable to decode this photograph.");};
    image.src=url;
    event.target.value="";
  }
  el("photoInput").addEventListener("change",loadPhoto);
  let activeCorner=-1;
  const coord=event=>{
    const r=canvas.getBoundingClientRect();
    return {x:(event.clientX-r.left)/r.width*canvas.width,
      y:(event.clientY-r.top)/r.height*canvas.height};
  };
  canvas.addEventListener("pointerdown",event=>{
    if(!photoCorners)return;
    const p=coord(event);
    let closest=Infinity;
    photoCorners.forEach((point,i)=>{
      const dist=Math.hypot(point.x-p.x,point.y-p.y);
      if(dist<closest){closest=dist;activeCorner=i;}
    });
    if(closest>canvas.width*.13){activeCorner=-1;return;}
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove",event=>{
    if(activeCorner<0)return;
    const p=coord(event);
    photoCorners[activeCorner]={
      x:Math.max(0,Math.min(canvas.width-1,p.x)),
      y:Math.max(0,Math.min(canvas.height-1,p.y))
    };
    scanPixels=null;scanGuide=null;scanResult=null;scanSelected.clear();
    scanAdded.clear();scanRemoved.clear();
    scanSelectedHoles.clear();scanAddedHoles.clear();scanRejectedHoles.clear();
    scanMarkers.clear();scanMarkerEdits.clear();
    el("scanStage").hidden=true;
    renderPhoto();
  });
  const release=()=>activeCorner=-1;
  canvas.addEventListener("pointerup",release);canvas.addEventListener("pointercancel",release);
  /** Perspective-corrected photograph is held locally and never uploaded. */
  function rectifyPhoto() {
    if(!photoImage||!photoCorners)throw new Error("Select and align a photograph first");
    const sourceCanvas=document.createElement("canvas");
    sourceCanvas.width=canvas.width;sourceCanvas.height=canvas.height;
    const context=sourceCanvas.getContext("2d",{willReadFrequently:true});
    context.drawImage(photoImage,0,0,canvas.width,canvas.height);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height);
    const warped=warpSquarePixels(pixels.data,canvas.width,canvas.height,photoCorners);
    const target=document.createElement("canvas");
    target.width=warped.width;target.height=warped.height;
    target.getContext("2d").putImageData(new ImageData(warped.data,warped.width,warped.height),0,0);
    return {warped,target};
  }
  function updateScanStatus() {
    if(!scanResult)return;
    const spanCount=scanResult.segments?.length??0;
    const instruction=scanMode==="holes"
      ?"Tap amber circles to remove them, or tap an unmarked square to add a hole."
      :scanMode==="markers"
        ?"Select Start or Finish below, then tap its position on the photograph."
        :"Tap a green tile to remove it, or tap an unmarked square to add a wall.";
    el("scanStatus").textContent=scanSelected.size+" wall tiles, "+
      scanSelectedHoles.size+" possible holes, "+spanCount+
      " straight image spans, "+scanMarkers.size+" colored markers. "+instruction+
      " Correct the proposals before importing.";
    el("applyScanButton").disabled=scanSelected.size===0&&scanSelectedHoles.size===0&&scanMarkers.size===0;
    el("applyScanButton").textContent="Import "+scanSelected.size+" walls, "+
      scanSelectedHoles.size+" holes, "+scanMarkers.size+" markers";
  }
  function renderScan() {
    if(!scanGuide)return;
    const output=el("scanCanvas");
    output.width=scanGuide.width;output.height=scanGuide.height;
    const context=output.getContext("2d");
    const width=output.width,height=output.height;
    context.drawImage(scanGuide,0,0,width,height);
    const cols=Number(maze.data.scale[0]),rows=Number(maze.data.scale[2]);
    const tw=width/cols,th=height/rows;
    context.save();
    for(let z=0;z<rows;z++)for(let x=0;x<cols;x++){
      if(!scanSelected.has(x+","+z))continue;
      context.fillStyle="rgba(48,189,116,.09)";
      context.fillRect(x*tw,z*th,tw,th);
      context.strokeStyle="#45e59f";
      context.lineWidth=Math.max(1.5,width/350);
      context.strokeRect(x*tw+2,z*th+2,tw-4,th-4);
    }
    // Real wall traces: these show continuous straight spans and measured
    // image geometry, not arbitrarily named factory block sizes.
    for(const segment of scanResult?.segments??[]){
      context.beginPath();
      context.moveTo(segment.x0,segment.y0);
      context.lineTo(segment.x1,segment.y1);
      context.strokeStyle="rgba(40,235,158,.82)";
      context.lineWidth=Math.max(2,Math.min(5,segment.widthPixels*.18));
      context.lineCap="round";
      context.stroke();
    }
    // Candidate floor holes are circles, not green wall squares.
    for(const hole of scanSelectedHoles.values()){
      const r=Math.max(5,hole.radius+2);
      context.beginPath();
      context.arc(hole.cx,hole.cy,r,0,Math.PI*2);
      context.strokeStyle=scanMode==="holes"?"#ffdc80":"#e9bd67";
      context.lineWidth=Math.max(2,width/220);
      context.stroke();
      context.beginPath();
      context.arc(hole.cx,hole.cy,2,0,Math.PI*2);
      context.fillStyle="#ffd178";
      context.fill();
    }
    for(const marker of scanMarkers.values()){
      const cx=(marker.x+.5)*tw,cy=(marker.z+.5)*th;
      context.beginPath();context.arc(cx,cy,Math.max(9,tw*.39),0,Math.PI*2);
      context.strokeStyle=marker.type==="entrance"?"#fd7066":"#70d6ff";
      context.lineWidth=Math.max(3,width/160);context.stroke();
      context.font="bold "+Math.round(tw*.5)+"px sans-serif";
      context.fillStyle="#fffdf1";context.textAlign="center";
      context.textBaseline="middle";
      context.fillText(marker.type==="entrance"?"S":"F",cx,cy);
    }
    context.beginPath();context.lineWidth=Math.max(.6,width/900);
    context.strokeStyle="rgba(255,250,232,.60)";
    for(let x=0;x<=cols;x++){
      context.moveTo(x*tw,0);context.lineTo(x*tw,height);
    }
    for(let z=0;z<=rows;z++){
      context.moveTo(0,z*th);context.lineTo(width,z*th);
    }
    context.stroke();
    context.restore();
    updateScanStatus();
  }
  function analyzePhoto(reveal=false) {
    try {
      // Re-evaluate the same aligned image when sensitivity changes.
      if(!scanPixels){
        const rectified=rectifyPhoto();
        scanPixels=rectified.warped;scanGuide=rectified.target;
      }
      scanResult=suggestWalls(scanPixels,{
        columns:Number(maze.data.scale[0]),rows:Number(maze.data.scale[2]),
        sensitivity:Number(el("sensitivitySlider").value)/100
      });
      const detected=new Set(scanResult.suggestions.map(item=>item.x+","+item.z));
      scanSelected=new Set([...detected].filter(key=>!scanRemoved.has(key)));
      for(const key of scanAdded)scanSelected.add(key);
      scanSelectedHoles=new Map();
      for(const hole of scanResult.holes??[]){
        const key=hole.x+","+hole.z;
        if(!scanRejectedHoles.has(key))scanSelectedHoles.set(key,hole);
      }
      for(const [key,hole] of scanAddedHoles)scanSelectedHoles.set(key,hole);
      scanMarkers=new Map((scanResult.markers??[])
        .map(marker=>[marker.type,marker]));
      for(const [type,position] of scanMarkerEdits){
        if(position)scanMarkers.set(type,position);
        else scanMarkers.delete(type);
      }
      el("scanStage").hidden=false;
      renderScan();
      if(reveal)el("scanStage").scrollIntoView({behavior:"smooth",block:"nearest"});
    }catch(error) {
      alert("Could not analyze this photograph: "+error.message);
    }
  }
  function setScanMode(next){
    scanMode=next;
    for(const [name,id] of [
      ["walls","reviewWallsButton"],["holes","reviewHolesButton"],
      ["markers","reviewMarkersButton"]]){
      el(id).setAttribute("aria-pressed",String(name===next));
    }
    el("markerControls").hidden=next!=="markers";
    if(scanResult)renderScan();
  }
  el("reviewWallsButton").addEventListener("click",()=>setScanMode("walls"));
  el("reviewHolesButton").addEventListener("click",()=>setScanMode("holes"));
  el("reviewMarkersButton").addEventListener("click",()=>setScanMode("markers"));
  for(const [type,id] of [["entrance","placeStartButton"],["exit","placeFinishButton"]]){
    el(id).addEventListener("click",()=>{
      markerBrush=type;
      for(const [name,button] of [["entrance","placeStartButton"],["exit","placeFinishButton"]])
        el(button).setAttribute("aria-pressed",String(name===type));
    });
  }
  el("clearMarkersButton").addEventListener("click",()=>{
    scanMarkers.clear();
    scanMarkerEdits.set("entrance",null);scanMarkerEdits.set("exit",null);
    renderScan();
  });
  el("detectButton").addEventListener("click",()=>analyzePhoto(true));
  el("sensitivitySlider").addEventListener("input",()=>{
    if(scanPixels)analyzePhoto(false);
  });
  el("scanCanvas").addEventListener("pointerdown",event=>{
    if(!scanGuide)return;
    const r=event.currentTarget.getBoundingClientRect();
    const x=Math.floor((event.clientX-r.left)/r.width*Number(maze.data.scale[0]));
    const z=Math.floor((event.clientY-r.top)/r.height*Number(maze.data.scale[2]));
    if(x<0||z<0||x>=Number(maze.data.scale[0])||z>=Number(maze.data.scale[2]))return;
    const key=x+","+z;
    if(scanMode==="markers"){
      const position={type:markerBrush,x,z,
        cx:(x+.5)*scanGuide.width/Number(maze.data.scale[0]),
        cy:(z+.5)*scanGuide.height/Number(maze.data.scale[2]),
        confidence:0};
      scanMarkers.set(markerBrush,position);
      scanMarkerEdits.set(markerBrush,position);
    }else if(scanMode==="holes"){
      if(scanSelectedHoles.has(key)){
        scanSelectedHoles.delete(key);
        scanAddedHoles.delete(key);
        scanRejectedHoles.add(key);
      }else{
        const hole={x,z,cx:(x+.5)*scanGuide.width/Number(maze.data.scale[0]),
          cy:(z+.5)*scanGuide.height/Number(maze.data.scale[2]),
          radius:Math.min(scanGuide.width/Number(maze.data.scale[0]),
            scanGuide.height/Number(maze.data.scale[2]))*.3,
          confidence:0};
        scanSelectedHoles.set(key,hole);
        scanAddedHoles.set(key,hole);
        scanRejectedHoles.delete(key);
      }
    }else if(scanSelected.has(key)){
      scanSelected.delete(key);
      scanRemoved.add(key);
      scanAdded.delete(key);
    }else{
      scanSelected.add(key);
      scanAdded.add(key);
      scanRemoved.delete(key);
    }
    renderScan();
  });
  el("cancelScanButton").addEventListener("click",()=>{
    el("scanStage").hidden=true;
    scanSelected.clear();
    scanAdded.clear();scanRemoved.clear();
    scanSelectedHoles.clear();scanAddedHoles.clear();scanRejectedHoles.clear();
    scanMarkers.clear();scanMarkerEdits.clear();
    scanResult=null;
  });
  el("applyScanButton").addEventListener("click",()=>{
    if(!scanGuide||(!scanSelected.size&&!scanSelectedHoles.size&&!scanMarkers.size))return;
    const suggestions=[...scanSelected].map(key=>{
      const [x,z]=key.split(",").map(Number);
      return {x,z};
    });
    const {maze:updated,appliedWalls,annotatedHoles,movedMarkers}=applyCaptureFindings(
      maze,suggestions,[...scanSelectedHoles.values()],
      Object.fromEntries(scanMarkers));
    photoGuide=scanGuide;
    commit(updated);
    setView("build");
    notice("Imported "+appliedWalls+" wall tiles, "+annotatedHoles+
      " holes and "+movedMarkers+" updated start/finish markers. Review your maze.");
  });
  el("traceButton").addEventListener("click",()=>{
    try {
      const {target}=rectifyPhoto();
      photoGuide=target;setView("build");
      notice("Photograph aligned. Trace walls using the drawing tools.");
    }catch(error){
      alert("Corner alignment could not be completed: "+error.message);
    }
  });
  el("clearPhotoButton").addEventListener("click",()=>{
    photoImage=null;photoCorners=null;photoGuide=null;
    scanPixels=null;scanGuide=null;scanResult=null;scanSelected.clear();
    scanAdded.clear();scanRemoved.clear();
    scanSelectedHoles.clear();scanAddedHoles.clear();scanRejectedHoles.clear();
    scanMarkers.clear();scanMarkerEdits.clear();
    el("scanStage").hidden=true;
    el("photoActions").hidden=true;
    el("photoStage").hidden=true;el("detectButton").disabled=true;
    el("traceButton").disabled=true;el("clearPhotoButton").disabled=true;
    redrawAll();notice("Photograph removed");
  });
}

function initialize() {
  prepareToolbox();initializeBoardInput();initializeDialogs();initializePlay();initializePhoto();
  el("undoButton").addEventListener("click",()=>undoOrRedo(true));
  el("redoButton").addEventListener("click",()=>undoOrRedo(false));
  el("inspectButton").setAttribute("aria-pressed","false");
  el("inspectButton").addEventListener("click",event=>{
    inspection=!inspection;
    event.currentTarget.setAttribute("aria-pressed",String(inspection));
    notice(inspection?"Tap a populated tile to inspect it":labels[selected]+" selected");
  });
  el("themeSelect").addEventListener("change",event=>{
    const next=parseMaze(maze);next.data.theme=event.target.value;commit(next);
  });
  el("routeButton").addEventListener("click",()=>{
    const info=examineMaze(maze);route=findRoute(maze);
    if(info.startCount!==1||info.finishCount!==1)
      notice("Add exactly one Start and one Finish");
    else if(!route)notice("No direct walkable path to the finish (locked gates may need keys)");
    else notice("Walkable route found · "+info.shortestSteps+" steps");
    renderBoard();
  });
  document.querySelectorAll(".tab").forEach(button=>{
    button.addEventListener("click",()=>setView(button.dataset.view));
  });
  window.addEventListener("resize",()=>{renderBoard();renderPhoto();renderPlay();});
  window.addEventListener("pagehide",persist);
  refreshActions();persist();setView("build");
  if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(console.warn);
}
initialize();
