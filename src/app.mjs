import {parseMaze, serializeMaze, validateMaze} from "./maze-document.mjs";
import {strokeBetween} from "./maze-brush.mjs";
import {editBoardTile,hasPhysicalHole} from "./maze-editor-tiles.mjs";
import {
  SIZE,TILE_NAMES,newMaze,sampleMaze,changeCellDetails,transferTile,
  cellCoordinates,primaryCell,locate
} from "./maze-world.mjs";
import {startPlay,movePlayer,rotatePlayer,tickPlayer,renderScene,THEMATIC,answerRiddle,keyPickupId,mapVisibleCells,advanceShadows,dismissPhoto,cardboardTriggerStep,isCardboardTriggerTap} from "./maze-play.mjs";
import {findPlayableRoute} from "./maze-route.mjs";
import {orientationPose,relativePose,shortestAngle} from "./maze-orientation.mjs";
import {AUDIO_SETTINGS_KEY,audioPreferences,createMazeAudio} from "./maze-audio.mjs";
import {MAX_PHOTO_DATA_URL_LENGTH,photoAt,photoEdit,photoDataUrl} from "./maze-media.mjs";
import {avatarAt,avatarEdit,avatarCropRect} from "./maze-avatar.mjs";
import {voiceAt,voiceEdit,createVoiceRecorder} from "./maze-voice.mjs";
import {warpSquarePixels,homographyForCorners,initialCorners,nudgeBoardCorner,insetRectifiedBoard,suggestPlayableGridEdges} from "./maze-capture.mjs";
import {projectPhotoGrid,confirmPrintedGridCorners} from "./maze-photo-grid.mjs";
import {suggestPrintedGridRefinement} from "./maze-grid-refine.mjs";
import {suggestBoardCorners} from "./maze-board-corners.mjs";
import {assessCameraFrame,createCameraSession,projectBoardOutline} from "./maze-live.mjs";
import {snapshotFileName,sceneAsPng,canShareSnapshot,drawSnapshotPlayerBadge} from "./maze-snapshot.mjs";
import {MAX_BACKUP_BYTES,createLibraryBackup,parseLibraryBackup,mergeLibraryBackup,
  libraryBackupFileName,mazeFileName,canShareMaze} from "./maze-backup.mjs";
import {suggestWalls,applyCaptureFindings} from "./maze-recognize.mjs";
import {compareScanReview,compareHoleCenters,holeForPhotoReview} from "./maze-scan-evaluation.mjs";
import {newPhotoReference,editPhotoReference,photoReferenceLabels} from "./maze-photo-reference.mjs";
import {scanReviewWarning} from "./maze-scan-notice.mjs";
import {reviewCellAt,reviewPixelAt,centeredReviewScroll} from "./maze-scan-viewport.mjs";
import {LIBRARY_STORAGE_KEY,newLibrary,readLibrary,activeDocument,saveActiveDocument,
  addMaze,openMaze,duplicateMaze,deleteMaze,sortedMazes} from "./maze-library.mjs";
import {saveMazeLocally,emergencyMazeExport} from "./maze-storage.mjs";

const $=selector=>document.querySelector(selector);
const el=id=>document.getElementById(id);
const STORAGE="seedling-repropagation.board.v1";
const glyphs={
  hole:"◉",wall:"▰",floor:"▱",empty:"⌫",entrance:"●",exit:"◆",
  gate:"▥",info:"✉",map:"▤",riddle:"?",secret_passage:"↯",
  shadow:"◉",speed_hazard:"−",speed_powerup:"+",
  timer_hazard:"−30",timer_powerup:"+30"
};
const labels={...TILE_NAMES,info:"Message / key",hole:"Physical hole"};
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
let maze=restore(),library;
try{
  const savedCollection=localStorage.getItem(LIBRARY_STORAGE_KEY);
  library=readLibrary(savedCollection,maze);
  if(savedCollection)maze=activeDocument(library);
}catch(error){
  console.warn("Saved maze collection could not be restored; keeping last single-maze backup",error);
  library=newLibrary(maze);
}
let undo=[],redo=[],selected="wall",inspection=false,route=null,view="build";
let currentTile=null,photoImage=null,photoCorners=null,photoGuide=null;
let photoGridCornerDraft=null,photoRefinementDraft=null;
let stopLiveCamera=()=>{};
let pendingTilePhoto=null,tilePhotoChanged=false,photoImportGeneration=0;
let pendingTileVoice=null,tileVoiceChanged=false;
let pendingAvatarPhoto=null,avatarPhotoPending=false,avatarImportGeneration=0;
const voiceRecorder=createVoiceRecorder({
  onStatus:message=>{el("tileVoiceStatus").textContent=message;},
  onReady:url=>{
    if(!el("tileDialog").open)return;
    pendingTileVoice=url;tileVoiceChanged=true;renderTileVoiceEditor();
  },
  onBusy:()=>renderTileVoiceEditor()
});
let scanBoardPixels=null,scanPixels=null,scanGuide=null,scanResult=null,scanSelected=new Set();
let scanAdded=new Set(),scanRemoved=new Set();
let scanSelectedHoles=new Map(),scanAddedHoles=new Map(),scanRejectedHoles=new Set();
let scanMode="walls",markerBrush="entrance";
let scanMarkers=new Map(),scanMarkerEdits=new Map();
let photoSuggestionsSeen=false,photoReferenceMode=false;
let photoReference=newPhotoReference();
let play=startPlay(maze),stereo=false,showMap=false,holding=new Set(),runEnabled=false;
// Scene photographs are never fetched from a server. A bounded cache of
// decoded, locally embedded JPEGs is scoped to the current maze document.
let scenePhotoMaze=maze;
const scenePhotoImages=new Map();
function resolveScenePhoto(url) {
  if(!photoDataUrl(url))return null;
  if(scenePhotoMaze!==maze){
    scenePhotoImages.clear();
    scenePhotoMaze=maze;
  }
  let image=scenePhotoImages.get(url);
  if(!image){
    if(scenePhotoImages.size>=24)
      scenePhotoImages.delete(scenePhotoImages.keys().next().value);
    image=new Image();
    image.decoding="async";
    scenePhotoImages.set(url,image);
    image.src=url;
  }
  return image.complete&&image.naturalWidth>0?image:null;
}

function clearHeldControls() {
  holding.clear();
  document.querySelectorAll("[data-control].pressed")
    .forEach(button=>button.classList.remove("pressed"));
}
function setRun(enabled) {
  runEnabled=!!enabled;
  const button=el("runButton");
  button.textContent=runEnabled?"Running":"Run";
  button.setAttribute("aria-pressed",String(runEnabled));
}
let snapshotOpen=false,snapshotBlob=null,snapshotURL=null,snapshotRequest=0,snapshotBase=null;
const audio=createMazeAudio();
let audioOptions;
try{audioOptions=audioPreferences(localStorage.getItem(AUDIO_SETTINGS_KEY));}
catch{audioOptions=audioPreferences(null);}
audio.setOptions(audioOptions);
let motionPose=null,motionAnchor=null,motionHeading=0,motionPitch=0;
let motionActive=false,motionRotation=null;
let lastFrame=0,lastBoardRect=null,boardStroke=null;
let placement=null,boardZoom=1,boardPanning=false,panDrag=null;
const toolOrder=["wall","empty","hole","entrance","exit","gate","riddle","info","map",
  "secret_passage","shadow","speed_powerup","speed_hazard","timer_powerup","timer_hazard","floor"];

let unsavedChanges=false;
function markSaved(saved) {
  unsavedChanges=!saved;
  el("savedIndicator").textContent=saved?"Saved locally":"Not saved";
  el("rescueSaveButton").hidden=saved;
}
function persist() {
  try {
    const saved=saveMazeLocally(localStorage,library,maze,{
      libraryKey:LIBRARY_STORAGE_KEY,legacyKey:STORAGE});
    library=saved.library;
    if(!saved.recoverySaved)
      console.warn("Maze library saved, but the optional legacy recovery copy is full");
    markSaved(true);
    return true;
  }catch(error){
    markSaved(false);
    console.warn("Local library storage failed; keep an external rescue copy",error);
    return false;
  }
}
function notice(message) {
  el("tileStatus").textContent=message;
  el("playMessage").textContent=message;
}
function activateLibrary(updated,message){
  const next=activeDocument(updated);
  // Commit atomically before changing the active maze, so quota failures
  // cannot make a switch or deletion appear successful.
  try{localStorage.setItem(LIBRARY_STORAGE_KEY,JSON.stringify(updated));}
  catch(error){
    el("savedIndicator").textContent="Save unavailable";
    console.warn("Could not save maze collection",error);
    alert("Storage is full or unavailable; no maze was changed. Save a backup before continuing.");
    return false;
  }
  library=updated;maze=next;
  undo=[];redo=[];route=null;currentTile=null;photoGuide=null;
  play=startPlay(maze);clearPlacement();
  try{localStorage.setItem(STORAGE,serializeMaze(maze));}
  catch(error){console.warn("Legacy recovery copy was not updated",error);}
  markSaved(true);
  el("menuDialog").close();setView("build");redrawAll();
  notice(message||"Maze opened");
  return true;
}
function renderLibraryList(){
  const list=el("libraryList");
  if(!list)return;
  list.replaceChildren();
  el("libraryCount").textContent=library.entries.length+" saved";
  for(const entry of sortedMazes(library)){
    const active=entry.id===library.activeId;
    const item=document.createElement("div");
    item.className="library-entry";
    item.setAttribute("aria-current",String(active));
    const name=document.createElement("span");name.className="library-name";
    const heading=document.createElement("strong");heading.textContent=entry.name;
    const detail=document.createElement("small");
    detail.textContent=active?"Currently open":"Saved on this device";
    name.append(heading,detail);
    const actions=document.createElement("span");actions.className="library-controls";
    const makeButton=(label,onClick,disabled=false)=>{
      const button=document.createElement("button");
      button.type="button";button.textContent=label;button.disabled=disabled;
      button.setAttribute("aria-label",label+" "+entry.name);
      button.addEventListener("click",onClick);return button;
    };
    actions.append(
      makeButton("Open",()=>{
        if(!persist())return alert("Save your current maze before switching.");
        activateLibrary(openMaze(library,entry.id),"Opened "+entry.name);
      },active),
      makeButton("Copy",()=>{
        if(!persist())return alert("Save unavailable; cannot create a safe copy.");
        activateLibrary(duplicateMaze(library,entry.id),"Duplicated "+entry.name);
      }),
      makeButton("Delete",()=>{
        if(library.entries.length===1)return;
        if(!confirm("Permanently delete "+entry.name+" from this phone? Export it first if you need a backup."))return;
        if(!persist())return alert("Save unavailable; cannot safely delete.");
        activateLibrary(deleteMaze(library,entry.id),"Removed "+entry.name);
      },library.entries.length===1)
    );
    item.append(name,actions);list.append(item);
  }
}
function commit(next,{stroke=false}={}) {
  if(JSON.stringify(next)===JSON.stringify(maze))return;
  // Paint continuously and save every change, but record the pre-stroke
  // document only once. One drag must equal one undoable action.
  if(!stroke||!boardStroke?.changed){
    undo.push(serializeMaze(maze,0));
    if(undo.length>60)undo.shift();
    redo=[];
  }
  if(stroke&&boardStroke)boardStroke.changed=true;
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
function renderPlayerButton() {
  const avatar=avatarAt(maze),image=el("playerButtonImage");
  if(avatar.dataUrl) {
    if(image.getAttribute("src")!==avatar.dataUrl)image.src=avatar.dataUrl;
    image.hidden=false;
  } else {
    image.removeAttribute("src");image.hidden=true;
  }
  el("playerButtonLabel").textContent=avatar.name||"Player";
  el("playerButton").setAttribute("aria-label",
    avatar.name?"Edit player portrait for "+avatar.name:"Add a player selfie");
}
function refreshActions() {
  renderPlayerButton();
  el("undoButton").disabled=!undo.length;
  el("redoButton").disabled=!redo.length;
  el("themeSelect").value=maze.data.theme;
  el("buildTitle").textContent=maze.name||"My Maze";
  el("boardStatus").textContent=maze.data.scale[0]+" × "+maze.data.scale[2];
  el("mazeNameInput").value=maze.name??"";
  if(el("menuDialog").open)renderLibraryList();
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
  const {width:w,height:h}=canvasSize(canvas,1400);
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
      ctx.beginPath();ctx.fillStyle=keyPickupId(cell)?"#97713d":tileColors[type]??"#67717c";
      ctx.arc(xx+tw/2,yy+th/2,size*.36,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#fff8e8";ctx.font="bold "+Math.max(10,size*.38)+"px -apple-system, sans-serif";
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillText(keyPickupId(cell)?"K":glyphs[type]??"•",xx+tw/2,yy+th/2+size*.01);
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
      clearPlacement();
      el("inspectButton").setAttribute("aria-pressed","false");
      for(const child of group.children)child.setAttribute("aria-pressed",String(child===button));
      notice((type==="empty"?"Erase":labels[type])+" selected · Tap or drag on the board");
    });
    group.append(button);
  }
}
function clearPlacement() {
  placement=null;
  el("cancelPlacementButton").hidden=true;
  el("routeButton").hidden=false;
}
function setBoardPan(enabled) {
  boardPanning=Boolean(enabled&&boardZoom>1);
  el("panButton").setAttribute("aria-pressed",String(boardPanning));
  el("boardCanvas").classList.toggle("pan-mode",boardPanning);
}
function setBoardZoom(next) {
  const viewport=el("boardScroller"),surface=el("boardSurface");
  const previousWidth=viewport.scrollWidth||viewport.clientWidth;
  const previousHeight=viewport.scrollHeight||viewport.clientHeight;
  const centerX=(viewport.scrollLeft+viewport.clientWidth/2)/previousWidth;
  const centerY=(viewport.scrollTop+viewport.clientHeight/2)/previousHeight;
  boardZoom=Math.max(1,Math.min(4,next));
  surface.style.width=(boardZoom*100)+"%";
  el("zoomLevel").textContent=boardZoom+"×";
  el("zoomInButton").disabled=boardZoom===4;
  el("zoomOutButton").disabled=boardZoom===1;
  if(boardZoom===1)setBoardPan(false);
  requestAnimationFrame(()=>{
    viewport.scrollLeft=centerX*viewport.scrollWidth-viewport.clientWidth/2;
    viewport.scrollTop=centerY*viewport.scrollHeight-viewport.clientHeight/2;
    renderBoard();
  });
}
function paint(x,z) {
  if(placement) {
    try {
      const copy=placement.copy;
      const updated=transferTile(maze,...placement.source,x,z,{copy});
      commit(updated);
      clearPlacement();currentTile=[x,z];renderBoard();
      notice((copy?"Copied":"Moved")+" tile to "+(x+1)+", "+(z+1)+" · Undo available");
    }catch(error){notice(error.message+" · Choose an empty square or cancel");}
    return;
  }
  if(inspection){openTileDialog(x,z);return;}
  // A physical-hole annotation must never silently conceal an original tile.
  const erasedHole=selected==="empty"&&hasPhysicalHole(maze,x,z);
  try{
    const updated=editBoardTile(maze,x,z,selected);
    commit(updated,{stroke:Boolean(boardStroke)});
    currentTile=[x,z];renderBoard();
    notice(erasedHole?"Physical hole removed; underlying tile preserved":
      (selected==="empty"?"Erased":labels[selected])+" · "+(x+1)+", "+(z+1));
  }catch(error){notice(error.message);}
}
function initializeBoardInput() {
  const canvas=el("boardCanvas");
  canvas.addEventListener("pointerdown",event=>{
    if(event.button!==0&&event.pointerType==="mouse")return;
    // Only the initiating finger/mouse owns this stroke. A second finger
    // cannot introduce unexpected paint marks or prematurely finish a drag.
    if(boardStroke||panDrag)return;
    if(boardPanning){
      if(event.pointerType==="mouse"){
        const viewport=el("boardScroller");
        panDrag={id:event.pointerId,x:event.clientX,y:event.clientY,
          left:viewport.scrollLeft,top:viewport.scrollTop};
        canvas.setPointerCapture(event.pointerId);
      }
      return;
    }
    const cell=indexAt(event,canvas);
    if(!cell)return;
    if(placement||inspection){paint(...cell);return;}
    boardStroke={id:event.pointerId,last:cell,changed:false};
    canvas.setPointerCapture(event.pointerId);
    paint(...cell);
  });
  canvas.addEventListener("pointermove",event=>{
    if(panDrag?.id===event.pointerId){
      const viewport=el("boardScroller");
      viewport.scrollLeft=panDrag.left-(event.clientX-panDrag.x);
      viewport.scrollTop=panDrag.top-(event.clientY-panDrag.y);
      return;
    }
    if(!boardStroke||boardStroke.id!==event.pointerId||boardPanning||placement||inspection)return;
    const cell=indexAt(event,canvas);
    if(!cell)return;
    // Browser pointer events can skip many cells on a fast finger sweep.
    // Rasterize the intervening squares rather than leaving accidental gaps.
    const cells=strokeBetween(boardStroke.last,cell,
      Number(maze.data.scale[0]),Number(maze.data.scale[2]));
    boardStroke.last=cell;
    for(const [x,z] of cells.slice(1))paint(x,z);
  });
  const finish=event=>{
    if(boardStroke?.id===event.pointerId)boardStroke=null;
    if(panDrag?.id===event.pointerId)panDrag=null;
  };
  canvas.addEventListener("pointerup",finish);
  canvas.addEventListener("pointercancel",finish);
  canvas.addEventListener("lostpointercapture",finish);
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
function renderTileVoiceEditor(){
  const preview=el("tileVoicePreview");
  if(pendingTileVoice){
    if(preview.getAttribute("src")!==pendingTileVoice)preview.src=pendingTileVoice;
    preview.hidden=false;
  }else{
    preview.pause();preview.removeAttribute("src");preview.hidden=true;
  }
  const busy=voiceRecorder.isBusy();
  el("recordVoiceButton").disabled=busy;
  el("stopVoiceButton").disabled=!voiceRecorder.isRecording();
  el("removeTileVoiceButton").disabled=busy||!pendingTileVoice;
  el("saveTileButton").disabled=busy;
}
function renderTilePhotoEditor() {
  const preview=el("tilePhotoPreview");
  if(pendingTilePhoto){preview.src=pendingTilePhoto;preview.hidden=false;}
  else{preview.removeAttribute("src");preview.hidden=true;}
  el("removeTilePhotoButton").disabled=!pendingTilePhoto;
}
function compressTilePhoto(image) {
  if(!image.naturalWidth||!image.naturalHeight)
    throw new Error("This image could not be decoded.");
  const canvas=document.createElement("canvas"),context=canvas.getContext("2d");
  if(!context)throw new Error("Image processing is unavailable.");
  const originalMax=Math.max(image.naturalWidth,image.naturalHeight);
  let edge=Math.min(560,originalMax);
  for(let iteration=0;iteration<5;iteration++){
    const factor=edge/originalMax;
    canvas.width=Math.max(1,Math.round(image.naturalWidth*factor));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*factor));
    context.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [.78,.64,.48,.34,.24]){
      const dataUrl=canvas.toDataURL("image/jpeg",quality);
      if(dataUrl.startsWith("data:image/jpeg;base64,")&&
        dataUrl.length<=MAX_PHOTO_DATA_URL_LENGTH)return dataUrl;
    }
    edge=Math.max(100,Math.floor(edge*.72));
  }
  throw new Error("Photograph is too detailed to save safely. Choose a simpler image.");
}
function compressAvatarPhoto(image) {
  if(!image.naturalWidth||!image.naturalHeight)
    throw new Error("This selfie could not be decoded.");
  const canvas=document.createElement("canvas"),context=canvas.getContext("2d");
  if(!context)throw new Error("Image processing is unavailable.");
  const crop=avatarCropRect(image.naturalWidth,image.naturalHeight);
  for(const edge of [256,192,144,96]){
    canvas.width=edge;canvas.height=edge;
    context.drawImage(image,crop.x,crop.y,crop.size,crop.size,0,0,edge,edge);
    for(const quality of [.82,.66,.5,.35]){
      const dataUrl=canvas.toDataURL("image/jpeg",quality);
      if(photoDataUrl(dataUrl))return dataUrl;
    }
  }
  throw new Error("The portrait is too detailed to store. Try another photograph.");
}
function openTileDialog(x,z) {
  const present=primaryCell(maze,x,z)?.cell;
  if(hasPhysicalHole(maze,x,z)){
    notice("Physical hole at "+(x+1)+", "+(z+1)+" · Choose Erase to remove it first");return;
  }
  if(!present){notice("No tile at "+(x+1)+", "+(z+1));return;}
  currentTile=[x,z];
  el("tileDialogTitle").textContent="Tile "+(x+1)+", "+(z+1);
  el("tileDetailType").textContent=keyPickupId(present)?"Key pickup":labels[present.type]??present.type;
  el("variantInput").value=present.variant??"";
  el("variantInputLabel").textContent=present.type==="secret_passage"?
    "Passage pairing code":present.type==="gate"?"Gate identifier":"Variant / identifier";
  el("passageHelp").hidden=present.type!=="secret_passage";
  el("gateHelp").hidden=present.type!=="gate";
  el("keyEditor").hidden=present.type!=="info";
  el("keyIdInput").value=keyPickupId(present)??"";
  el("tilePhotoEditor").hidden=present.type!=="info";
  pendingTilePhoto=photoAt(present);
  tilePhotoChanged=false;photoImportGeneration++;
  el("tilePhotoInput").value="";
  el("tilePhotoStatus").textContent="Photos are saved within the maze and included in JSON exports.";
  renderTilePhotoEditor();
  voiceRecorder.cancel();
  el("tileVoiceEditor").hidden=present.type!=="info";
  pendingTileVoice=voiceAt(present);tileVoiceChanged=false;
  el("tileVoiceStatus").textContent="Record and listen here. Save tile to keep the recording.";
  renderTileVoiceEditor();
  const isRiddle=present.type==="riddle";
  el("riddleEditor").hidden=!isRiddle;
  el("messageInputLabel").hidden=isRiddle;
  el("messageInput").hidden=isRiddle;
  const imported=present.riddle;
  const authored=present.repropagation?.riddle;
  el("riddleQuestionInput").value=authored?.question??(
    typeof imported==="string"?imported:
    typeof imported?.prompt==="string"?imported.prompt:
    present.text??"");
  el("riddleAnswerInput").value=authored?.answer??"";
  el("messageInput").value=present.text??present.message??"";
  el("copyTileButton").disabled=present.type==="entrance"||present.type==="exit";
  el("tileDialog").showModal();
}
function initializeDialogs() {
  el("recordVoiceButton").addEventListener("click",()=>voiceRecorder.start());
  el("stopVoiceButton").addEventListener("click",()=>voiceRecorder.stop());
  el("removeTileVoiceButton").addEventListener("click",()=>{
    pendingTileVoice=null;tileVoiceChanged=true;renderTileVoiceEditor();
    el("tileVoiceStatus").textContent="Recording will be removed when you Save tile.";
  });
  el("tileDialog").addEventListener("close",()=>{
    voiceRecorder.cancel();el("tileVoicePreview").pause();
  });
  el("tilePhotoInput").addEventListener("change",event=>{
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    if(!file.type.startsWith("image/")&&!/\.hei[cf]$/i.test(file.name)){
      el("tilePhotoStatus").textContent="Choose an image file.";return;
    }
    if(file.size>25*1024*1024){
      el("tilePhotoStatus").textContent="Choose an image under 25 megabytes.";return;
    }
    const generation=++photoImportGeneration;
    const url=URL.createObjectURL(file),image=new Image();
    el("tilePhotoStatus").textContent="Preparing photograph on this device…";
    image.onload=()=>{
      URL.revokeObjectURL(url);
      if(generation!==photoImportGeneration||!el("tileDialog").open)return;
      try{
        pendingTilePhoto=compressTilePhoto(image);
        tilePhotoChanged=true;renderTilePhotoEditor();
        el("tilePhotoStatus").textContent="Ready. Save tile to keep this photo.";
      }catch(error){el("tilePhotoStatus").textContent=error.message;}
    };
    image.onerror=()=>{
      URL.revokeObjectURL(url);
      if(generation===photoImportGeneration)
        el("tilePhotoStatus").textContent="This image could not be opened by the browser.";
    };
    image.src=url;
  });
  el("removeTilePhotoButton").addEventListener("click",()=>{
    photoImportGeneration++;pendingTilePhoto=null;tilePhotoChanged=true;
    renderTilePhotoEditor();
    el("tilePhotoStatus").textContent="Photo removal will apply when you save this tile.";
  });
  el("menuButton").addEventListener("click",()=>{
    el("mazeNameInput").value=maze.name??"";
    renderLibraryList();
    el("menuDialog").showModal();
  });
  el("duplicateButton").addEventListener("click",()=>{
    if(!persist())return alert("Save unavailable; cannot make a safe duplicate.");
    activateLibrary(duplicateMaze(library,library.activeId),"Duplicated current maze");
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
      if(!persist())throw new Error("Current maze is not saved; import cancelled");
      activateLibrary(addMaze(library,next),
        "Imported "+(next.name??file.name)+" into My mazes · Original fields preserved");
    }catch(error){alert("Could not read this maze file: "+error.message);}
    event.target.value="";
  });
  // A file goes to a native destination only when the user requests it.
  // No account, upload API or network connection is involved.
  async function offerJsonFile(text,filename,title){
    const blob=new Blob([text],{type:"application/json"});
    const file=typeof File==="function"?
      new File([blob],filename,{type:"application/json"}):null;
    if(canShareMaze(navigator,file)){
      try{
        await navigator.share({files:[file],title});
        return "Share sheet closed. Verify the file was saved or received.";
      }catch(error){
        if(error?.name==="AbortError")return null;
        throw error;
      }
    }
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;link.download=filename;
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),20000);
    return "Download started. Keep this file outside browser storage.";
  }
  el("rescueSaveButton").addEventListener("click",async()=>{
    const button=el("rescueSaveButton");
    button.disabled=true;
    try{
      const rescue=emergencyMazeExport(library,maze);
      const status=await offerJsonFile(rescue.content,rescue.filename,rescue.title);
      if(status){
        notice("Local saving is unavailable. "+status+
          (rescue.scope==="maze"?" Only this maze fits in the rescue copy.":""));
        el("transferStatus").textContent="Rescue offered: "+rescue.filename+
          ". Verify the file outside this browser before leaving.";
      }
    }catch(error){
      notice("Rescue failed: "+error.message+". Keep this page open and try exporting from Maze files.");
    }finally{button.disabled=false;}
  });
  el("exportButton").addEventListener("click",async()=>{
    try{
      const status=await offerJsonFile(serializeMaze(maze),
        mazeFileName(maze.name),maze.name||"My maze");
      if(status)el("transferStatus").textContent=status;
    }catch(error){el("transferStatus").textContent="Export failed: "+error.message;}
  });
  el("backupButton").addEventListener("click",async()=>{
    try{
      if(!persist())throw new Error("The library could not be saved first.");
      const status=await offerJsonFile(createLibraryBackup(library),
        libraryBackupFileName(),"Maze library backup");
      if(status)el("transferStatus").textContent=status;
    }catch(error){el("transferStatus").textContent="Backup failed: "+error.message;}
  });
  el("restoreBackupButton").addEventListener("click",()=>el("restoreBackupInput").click());
  el("restoreBackupInput").addEventListener("change",async event=>{
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    try{
      if(file.size>MAX_BACKUP_BYTES)throw new RangeError("Choose a file under 25 megabytes.");
      const incoming=parseLibraryBackup(await file.text());
      if(!persist())throw new Error("Current maze not saved; restore cancelled.");
      const result=mergeLibraryBackup(library,incoming);
      if(!result.added){
        el("transferStatus").textContent="All "+result.total+" mazes are already present.";
        return;
      }
      if(!confirm("Add "+result.added+" maze"+(result.added===1?"":"s")+
        " from this backup? "+result.skipped+" duplicates will be skipped. Existing mazes are preserved."))return;
      // Only adopt the restored library after storage has accepted it.
      localStorage.setItem(LIBRARY_STORAGE_KEY,JSON.stringify(result.library));
      library=result.library;renderLibraryList();
      markSaved(true);
      el("transferStatus").textContent="Restored "+result.added+" maze"+
        (result.added===1?"":"s")+"; "+result.skipped+" duplicates skipped. Your current maze is unchanged.";
    }catch(error){
      el("transferStatus").textContent="Restore failed; existing mazes are unchanged: "+error.message;
    }
  });
  el("newButton").addEventListener("click",()=>{
    if(!persist())return alert("Save unavailable. Export your current maze before creating another.");
    activateLibrary(addMaze(library,newMaze()),"New blank maze created. Your previous maze is safe in My mazes.");
  });
  el("practiceButton").addEventListener("click",()=>{
    if(!persist())return alert("Save unavailable. Export your current maze before creating another.");
    const theme=el("practiceThemeSelect").value;
    const difficulty=el("practiceDifficultySelect").value;
    activateLibrary(addMaze(library,sampleMaze(theme,difficulty)),
      "New "+difficulty+" maze created. Your previous maze is safe in My mazes.");
  });
  for(const [buttonId,copy] of [["moveTileButton",false],["copyTileButton",true]]) {
    el(buttonId).addEventListener("click",()=>{
      if(!currentTile||!primaryCell(maze,...currentTile))return;
      placement={source:[...currentTile],copy};
      setBoardPan(false);
      inspection=false;el("inspectButton").setAttribute("aria-pressed","false");
      el("tileDialog").close();
      el("cancelPlacementButton").hidden=false;
      el("routeButton").hidden=true;
      notice("Tap an empty square to "+(copy?"copy":"move")+" the tile · Cancel to keep it here");
    });
  }
  el("saveTileButton").addEventListener("click",()=>{
    if(!currentTile||voiceRecorder.isBusy())return;
    const [x,z]=currentTile;
    const original=primaryCell(maze,x,z)?.cell;
    if(!original)return;
    const edits={};
    const variant=el("variantInput").value.trim();
    if(variant)edits.variant=variant;
    else if(original.type==="secret_passage"&&original.variant!==undefined)
      edits.variant="";
    if(original.type==="riddle"){
      const question=el("riddleQuestionInput").value.trim();
      const answer=el("riddleAnswerInput").value.trim();
      if(Boolean(question)!==Boolean(answer)){
        notice("Add both a riddle question and answer, or leave both empty.");
        return;
      }
      const extension={...original.repropagation};
      if(question)extension.riddle={question,answer};
      else delete extension.riddle;
      edits.repropagation=extension;
    }else{
      const text=el("messageInput").value.trim();
      if(text)edits.text=text;
      if(original.type==="info"){
        const extension={...original.repropagation};
        const id=el("keyIdInput").value.trim();
        if(id)extension.keyId=id;
        else delete extension.keyId;
        edits.repropagation=extension;
        if(tilePhotoChanged)
          edits.repropagation=photoEdit({type:"info",repropagation:edits.repropagation},
            pendingTilePhoto).repropagation;
        if(tileVoiceChanged)
          edits.repropagation=voiceEdit({type:"info",repropagation:edits.repropagation},
            pendingTileVoice).repropagation;
      }
    }
    commit(changeCellDetails(maze,x,z,edits));
    el("tileDialog").close();notice("Tile details saved");
  });
  el("deleteTileButton").addEventListener("click",()=>{
    if(!currentTile)return;
    commit(editBoardTile(maze,...currentTile,"empty"));
    el("tileDialog").close();notice("Tile erased");
  });
}

function setView(next) {
  if(next!=="photo")stopLiveCamera();
  if(next!=="explore"){
    audio.pause();snapshotRequest++;
    snapshotOpen=false;
    if(el("snapshotDialog").open)el("snapshotDialog").close();
  }
  if(next!=="build")clearPlacement();
  if(next!=="explore"&&el("avatarDialog").open)el("avatarDialog").close();
  if(next!=="explore"&&stereo)leaveCardboard();
  if(next!=="explore"&&el("tilePhotoDialog").open){
    el("playVoiceAudio").pause();
    el("tilePhotoDialog").close();play=dismissPhoto(play);
  }
  if(next!=="explore"&&el("riddleDialog").open){
    el("riddleDialog").close();
    play=answerRiddle(play,"",{skip:true});
  }
  view=next;
  if(next!=="explore")setRun(false);
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
  clearHeldControls();lastFrame=0;
  if(next==="build")requestAnimationFrame(renderBoard);
  if(next==="explore"){
    play=startPlay(maze);setRun(false);motionAnchor=null;motionPitch=0;motionHeading=0;
    if(audio.wantsAudio())void audio.activate(maze.data.theme).then(updateAudioUI);
    requestAnimationFrame(renderPlay);
  }
  if(next==="photo")requestAnimationFrame(renderPhoto);
}

function renderMapOverlay(ctx) {
  const w=ctx.canvas.width,h=ctx.canvas.height;
  const size=Math.min(w*.32,h*.56),x=16,y=h-size-15;
  const gw=Number(maze.data.scale[0]),gh=Number(maze.data.scale[2]);
  const visible=mapVisibleCells(maze,play);
  ctx.save();
  ctx.globalAlpha=.9;ctx.fillStyle="#18242b";
  ctx.fillRect(x-5,y-5,size+10,size+10);
  ctx.globalAlpha=1;
  ctx.fillStyle=visible?"#26333c":"#9ba9ae";
  ctx.fillRect(x,y,size,size);
  const tw=size/gw,th=size/gh;
  if(visible) {
    const visited=new Set(play.explored??[]);
    for(const key of visible){
      const [cx,cz]=key.split(",").map(Number);
      ctx.fillStyle=visited.has(key)?"#9ba9ae":"#647a82";
      ctx.fillRect(x+cx*tw,y+cz*th,tw,th);
    }
  }
  for(const item of maze.data.cells){
    const [cx,cz]=cellCoordinates(item);
    if(cx<0||cz<0||cx>=gw||cz>=gh||
      (visible&&!visible.has(cx+","+cz)))continue;
    ctx.fillStyle=keyPickupId(item)?"#f4d08b":
      item.type==="wall"?"#3d4448":item.type==="gate"?
      (play.keys.includes(String(item.variant??"0").trim())?"#5daf87":"#e7bd78"):
      item.type==="exit"?"#ffc67e":item.type==="entrance"?"#356b4c":"#829697";
    ctx.fillRect(x+cx*tw,y+cz*th,tw,th);
  }
  for(const hole of maze.repropagation?.physicalHoles??[]){
    const hx=Number(hole.position?.[0]),hz=Number(hole.position?.[2]);
    if(!Number.isInteger(hx)||!Number.isInteger(hz)||hx<0||hz<0||hx>=gw||hz>=gh||
      (visible&&!visible.has(hx+","+hz)))continue;
    ctx.beginPath();ctx.arc(x+(hx+.5)*tw,y+(hz+.5)*th,
      Math.max(1.8,tw*.32),0,Math.PI*2);
    ctx.fillStyle="#101113";ctx.fill();
    ctx.strokeStyle="#f2b765";ctx.lineWidth=1;ctx.stroke();
  }
  for(const shadow of play.shadows??[]) {
    if(visible&&!visible.has(Math.floor(shadow.x)+","+Math.floor(shadow.z)))continue;
    ctx.beginPath();ctx.arc(x+shadow.x*tw,y+shadow.z*th,Math.max(2.5,tw*.48),0,Math.PI*2);
    ctx.fillStyle="#8f3e55";ctx.fill();
    ctx.strokeStyle="#ffd4a0";ctx.lineWidth=Math.max(1,tw*.1);ctx.stroke();
  }
  ctx.fillStyle="#fdf7e4";ctx.beginPath();
  ctx.arc(x+play.x*tw,y+play.z*th,Math.max(3,tw*.65),0,Math.PI*2);ctx.fill();
  ctx.font=Math.max(12,Math.round(tw*1.6))+"px system-ui";
  ctx.textBaseline="bottom";ctx.fillStyle="#e8f0ed";
  ctx.fillText(visible?"EXPLORED MAP":"FULL MAP",x,y-8);
  ctx.restore();
}
function screenRotation() {
  const value=Number(window.screen?.orientation?.angle??window.orientation??0);
  return Number.isFinite(value)?value:0;
}
function motionMessage(message) {
  const status=el("motionStatus");status.hidden=!stereo;status.textContent=message;
}
function onDeviceOrientation(event) {
  if(!stereo||view!=="explore"||document.hidden||snapshotOpen||
     el("avatarDialog").open)return;
  const rotation=screenRotation();
  if(motionRotation!==rotation) {
    motionRotation=rotation;motionAnchor=null;motionHeading=play.heading;
  }
  const pose=orientationPose(event,rotation);
  if(!pose)return;
  motionPose=pose;
  if(!motionAnchor){motionAnchor=pose;motionHeading=play.heading;}
  const next=relativePose(pose,motionAnchor,motionHeading);
  if(!next)return;
  play={...play,heading:next.heading};motionPitch=next.pitch;
  if(!motionActive){
    motionActive=true;
    el("exploreView").classList.remove("cardboard-manual");
    motionMessage("Head tracking active · Recenter if the view drifts.");
  }
}
function leaveCardboard() {
  window.removeEventListener("deviceorientation",onDeviceOrientation);
  stereo=false;motionActive=false;motionPose=null;motionAnchor=null;
  motionHeading=0;motionPitch=0;motionRotation=null;
  el("stereoButton").textContent="Cardboard";
  el("stereoButton").setAttribute("aria-pressed","false");
  el("recenterButton").hidden=true;
  el("mapButton").disabled=false;
  el("exploreView").classList.remove("cardboard-view","cardboard-manual");
  el("cardboardCommands").hidden=true;
  clearHeldControls();lastFrame=0;
  motionMessage("");
}
async function enterCardboard() {
  stereo=true;motionActive=false;motionPose=null;motionAnchor=null;
  motionHeading=play.heading;motionPitch=0;motionRotation=null;
  showMap=false;el("mapButton").setAttribute("aria-pressed","false");
  el("mapButton").disabled=true;
  el("stereoButton").textContent="Exit Cardboard";
  el("stereoButton").setAttribute("aria-pressed","true");
  el("recenterButton").hidden=false;
  el("exploreView").classList.add("cardboard-view","cardboard-manual");
  el("cardboardCommands").hidden=false;
  clearHeldControls();lastFrame=0;
  motionMessage("Tap the view or the viewer trigger to step. Rotate to landscape.");
  renderPlay();
  if(typeof window.DeviceOrientationEvent!=="function"){
    motionMessage("Motion sensors unavailable. Use the turn buttons.");
    return;
  }
  let permission="granted";
  try{
    // Safari requires this call directly within the tap's user activation.
    if(typeof window.DeviceOrientationEvent.requestPermission==="function")
      permission=await window.DeviceOrientationEvent.requestPermission();
  }catch(error){permission="denied";}
  if(!stereo||view!=="explore")return;
  if(permission!=="granted"){
    motionMessage("Motion access denied. Use the turn buttons.");
    return;
  }
  window.addEventListener("deviceorientation",onDeviceOrientation,{passive:true});
  motionMessage("Move the phone to begin head tracking · Rotate to landscape.");
}
function recenterHeadset() {
  if(!motionPose){
    motionMessage("Move the phone to initialize tracking, or turn manually.");
    return;
  }
  // Physical forward is re-aligned with the maze's starting heading.
  motionAnchor=motionPose;motionHeading=startPlay(maze).heading;
  play={...play,heading:motionHeading};
  motionMessage("Forward direction reset · Turn your head to look around.");
  renderPlay();
}
function renderPlay() {
  if(view!=="explore")return;
  const riddleDialog=el("riddleDialog");
  if(play.pendingRiddle&&!riddleDialog.open){
    clearHeldControls();
    el("riddlePrompt").textContent=play.pendingRiddle.question;
    el("riddleResponse").value="";
    el("riddleFeedback").textContent="";
    riddleDialog.showModal();
  }else if(!play.pendingRiddle&&riddleDialog.open)riddleDialog.close();
  const photoDialog=el("tilePhotoDialog");
  if(play.pendingPhoto&&!photoDialog.open){
    clearHeldControls();
    const image=el("playPhotoImage"),voice=el("playVoiceAudio");
    if(play.pendingPhoto.url){image.src=play.pendingPhoto.url;image.hidden=false;}
    else{image.removeAttribute("src");image.hidden=true;}
    if(play.pendingPhoto.voiceUrl){voice.src=play.pendingPhoto.voiceUrl;voice.hidden=false;}
    else{voice.removeAttribute("src");voice.hidden=true;}
    el("photoMessageHeading").textContent=play.pendingPhoto.voiceUrl?
      "A message in your maze":"A photograph in your maze";
    el("playPhotoCaption").textContent=play.pendingPhoto.caption;
    photoDialog.showModal();
  }else if(!play.pendingPhoto&&photoDialog.open){
    el("playVoiceAudio").pause();el("playVoiceAudio").removeAttribute("src");
    photoDialog.close();el("playPhotoImage").removeAttribute("src");
  }
  const canvas=el("sceneCanvas");
  if(canvas.offsetParent===null)return;
  canvasSize(canvas,1024);
  const ctx=canvas.getContext("2d");
  renderScene(ctx,maze,play,{stereo,pitch:stereo?motionPitch:0,photoResolver:resolveScenePhoto});
  if(showMap)renderMapOverlay(ctx);
  if(!snapshotOpen&&!el("avatarDialog").open)audio.updateScene(play);
  const seconds=Math.ceil(play.remaining);
  el("timeReadout").textContent=Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");
  el("playReadout").textContent=play.ended?(play.won?"Completed":"Game over"):play.message;
  el("mapButton").title=play.mapRevealed?"Toggle full maze map":
    "Toggle explored map · Find a Map tile to reveal the entire layout";
  const pace=el("paceReadout");
  const running=runEnabled||holding.has("sprint");
  pace.textContent=play.slowUntil>0?"Slowed":play.boostUntil>0?
    (running?"Boost + run":"Boost"):running?"Running":"";
  pace.hidden=!pace.textContent;
  const inventory=el("keyInventory");
  inventory.hidden=!play.keys.length;
  inventory.textContent=play.keys.length?"Keys: "+play.keys.join(", "):"";
  inventory.title=play.keys.length?"Collected gate keys: "+play.keys.join(", "):"";
  el("playMessage").textContent=play.message;
}
function updateAudioUI(){
  const active=audio.isActive();
  el("soundButton").textContent=active?"Sound on":"Sound off";
  el("soundButton").setAttribute("aria-pressed",String(active));
  el("audioToggleButton").textContent=active?"Turn sound off":"Turn sound on";
  el("audioToggleButton").disabled=!active&&!audioOptions.music&&!audioOptions.effects;
  el("audioStatus").textContent=active?"Playing newly synthesized audio":
    "Sound is off until you turn it on. No original game recordings are used.";
  el("musicOption").checked=audioOptions.music;
  el("effectsOption").checked=audioOptions.effects;
  el("volumeOption").value=String(Math.round(audioOptions.volume*100));
  el("volumeReadout").textContent=Math.round(audioOptions.volume*100)+"%";
}
function initializeAudio(){
  el("soundButton").addEventListener("click",()=>{
    updateAudioUI();el("audioDialog").showModal();
  });
  for(const [id,key] of [["musicOption","music"],["effectsOption","effects"]]){
    el(id).addEventListener("change",event=>{
      audioOptions={...audioOptions,[key]:event.target.checked};
      audio.setOptions(audioOptions);
      try{localStorage.setItem(AUDIO_SETTINGS_KEY,JSON.stringify(audioOptions));}
      catch(error){console.warn("Audio preferences could not be saved",error);}
      updateAudioUI();
    });
  }
  el("volumeOption").addEventListener("input",event=>{
    audioOptions={...audioOptions,volume:Number(event.target.value)/100};
    audio.setOptions(audioOptions);
    try{localStorage.setItem(AUDIO_SETTINGS_KEY,JSON.stringify(audioOptions));}
    catch(error){console.warn("Audio preferences could not be saved",error);}
    updateAudioUI();
  });
  el("audioToggleButton").addEventListener("click",async()=>{
    if(audio.isActive())audio.deactivate();
    else await audio.activate(maze.data.theme);
    updateAudioUI();
  });
  updateAudioUI();
}
function initializeAvatar() {
  const dialog=el("avatarDialog"),preview=el("avatarPhotoPreview");
  const status=el("avatarStatus"),picker=el("avatarPhotoInput");
  const save=el("saveAvatarButton");
  const updatePreview=()=>{
    if(pendingAvatarPhoto) {
      if(preview.getAttribute("src")!==pendingAvatarPhoto)preview.src=pendingAvatarPhoto;
      preview.hidden=false;
    }else{preview.removeAttribute("src");preview.hidden=true;}
    el("removeAvatarPhotoButton").disabled=!pendingAvatarPhoto;
  };
  el("playerButton").addEventListener("click",()=>{
    if(view!=="explore"||snapshotOpen)return;
    const current=avatarAt(maze);
    pendingAvatarPhoto=current.dataUrl;avatarPhotoPending=false;avatarImportGeneration++;
    picker.value="";save.disabled=false;
    el("avatarNameInput").value=current.name;
    status.textContent="Your player name and optional selfie are stored in this maze, never uploaded automatically.";
    updatePreview();clearHeldControls();lastFrame=0;dialog.showModal();
  });
  dialog.addEventListener("close",()=>{
    avatarImportGeneration++;avatarPhotoPending=false;save.disabled=false;
    pendingAvatarPhoto=null;picker.value="";preview.removeAttribute("src");
    clearHeldControls();lastFrame=0;
  });
  picker.addEventListener("change",event=>{
    const source=event.target.files?.[0];picker.value="";
    if(!source)return;
    if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(source.type)&&
       !/\.(jpg|jpeg|png|webp|heic|heif)$/i.test(source.name)){
      status.textContent="Choose a JPEG, PNG, WebP or HEIC photograph.";return;
    }
    if(source.size>25*1024*1024){
      status.textContent="Choose a photograph smaller than 25 megabytes.";return;
    }
    const generation=++avatarImportGeneration,url=URL.createObjectURL(source);
    const image=new Image();
    avatarPhotoPending=true;save.disabled=true;
    status.textContent="Preparing a small square selfie locally…";
    image.onload=()=>{
      URL.revokeObjectURL(url);
      if(generation!==avatarImportGeneration||!dialog.open)return;
      avatarPhotoPending=false;save.disabled=false;
      try{
        pendingAvatarPhoto=compressAvatarPhoto(image);updatePreview();
        status.textContent="Selfie ready. Choose Save player to keep it with this maze.";
      }catch(error){status.textContent=error.message;}
    };
    image.onerror=()=>{
      URL.revokeObjectURL(url);
      if(generation!==avatarImportGeneration||!dialog.open)return;
      avatarPhotoPending=false;save.disabled=false;
      status.textContent="This image cannot be opened by this browser.";
    };
    image.src=url;
  });
  el("removeAvatarPhotoButton").addEventListener("click",()=>{
    avatarImportGeneration++;avatarPhotoPending=false;save.disabled=false;
    pendingAvatarPhoto=null;updatePreview();
    status.textContent="The selfie will be removed when you save. Your name can remain.";
  });
  save.addEventListener("click",()=>{
    if(avatarPhotoPending)return;
    let next,updated;
    try{
      next=avatarEdit(maze,{name:el("avatarNameInput").value,dataUrl:pendingAvatarPhoto});
      // Commit the collection before replacing in-memory state. Quota failure
      // must not silently pretend that a personal photograph was saved.
      updated=saveActiveDocument(library,next);
      localStorage.setItem(LIBRARY_STORAGE_KEY,JSON.stringify(updated));
    }catch(error){
      console.warn("Player selfie could not be saved",error);
      status.textContent="Storage is full or unavailable. Nothing changed. Back up your mazes and try again.";
      return;
    }
    const previous=serializeMaze(maze,0);
    if(serializeMaze(next,0)!==previous){
      undo.push(previous);if(undo.length>60)undo.shift();redo=[];route=null;
    }
    maze=next;library=updated;
    try{localStorage.setItem(STORAGE,serializeMaze(maze));}
    catch(error){console.warn("Legacy recovery copy was not updated",error);}
    markSaved(true);
    dialog.close();redrawAll();renderPlay();
  });
}
/** Only embedded photographs are decoded; snapshot identity is opt-in per image. */
function loadSnapshotPortrait(url) {
  if(!photoDataUrl(url))return Promise.resolve(null);
  return new Promise(resolve=>{
    const image=new Image();
    image.onload=()=>resolve(image.naturalWidth>0?image:null);
    image.onerror=()=>resolve(null);
    image.src=url;
  });
}
function initializeSnapshot(){
  const dialog=el("snapshotDialog"),preview=el("snapshotPreview");
  const save=el("snapshotSaveLink"),share=el("snapshotShareButton");
  const status=el("snapshotStatus"),include=el("snapshotIncludePlayer");
  async function updateImage(){
    if(!snapshotOpen||!snapshotBase)return;
    const request=++snapshotRequest;
    // Never offer a stale image for download while the chosen version renders.
    save.hidden=true;save.removeAttribute("href");share.hidden=true;
    status.textContent="Preparing your screenshot…";
    try{
      const avatar=avatarAt(maze);
      const portrait=include.checked&&avatar.dataUrl?
        await loadSnapshotPortrait(avatar.dataUrl):null;
      if(request!==snapshotRequest||!snapshotOpen)return;
      const output=document.createElement("canvas");
      output.width=snapshotBase.width;output.height=snapshotBase.height;
      const ctx=output.getContext("2d");
      if(!ctx)throw new Error("Canvas unavailable");
      ctx.drawImage(snapshotBase,0,0);
      if(include.checked)drawSnapshotPlayerBadge(ctx,avatar,portrait);
      const blob=await sceneAsPng(output);
      if(request!==snapshotRequest||!snapshotOpen)return;
      const previous=snapshotURL;
      snapshotBlob=blob;snapshotURL=URL.createObjectURL(blob);
      preview.src=snapshotURL;
      save.href=snapshotURL;save.download=snapshotFileName(maze.name);
      save.hidden=false;
      const file=typeof File==="function"?
        new File([blob],save.download,{type:"image/png"}):null;
      share.hidden=!canShareSnapshot(navigator,file);
      status.textContent=include.checked?
        "Player identity appears on this image. Save or share only if intended.":
        "Player identity is excluded. Your screenshot stays on this device unless shared.";
      if(previous)URL.revokeObjectURL(previous);
    }catch(error){
      if(request!==snapshotRequest||!snapshotOpen)return;
      console.warn("Screenshot failed",error);
      status.textContent="Could not prepare this screenshot: "+error.message;
    }
  }
  dialog.addEventListener("close",()=>{
    snapshotOpen=false;snapshotRequest++;snapshotBase=null;
    if(snapshotURL)URL.revokeObjectURL(snapshotURL);
    snapshotURL=null;snapshotBlob=null;
    preview.removeAttribute("src");save.removeAttribute("href");
    save.hidden=true;share.hidden=true;clearHeldControls();lastFrame=0;
  });
  el("snapshotCloseButton").addEventListener("click",()=>dialog.close());
  include.addEventListener("change",()=>{void updateImage();});
  el("snapshotButton").addEventListener("click",()=>{
    if(view!=="explore"||snapshotOpen)return;
    snapshotOpen=true;clearHeldControls();lastFrame=0;
    try{
      renderPlay();
      const scene=el("sceneCanvas");
      snapshotBase=document.createElement("canvas");
      snapshotBase.width=scene.width;snapshotBase.height=scene.height;
      if(!snapshotBase.width||!snapshotBase.height)
        throw new Error("The scene is not ready to capture");
      const ctx=snapshotBase.getContext("2d");
      if(!ctx)throw new Error("Canvas unavailable");
      ctx.drawImage(scene,0,0);
      const avatar=avatarAt(maze);
      el("snapshotPlayerOption").hidden=!(avatar.name||avatar.dataUrl);
      include.checked=false; // A selfie is never added to a shared image by default.
      save.hidden=true;share.hidden=true;
      dialog.showModal();
      void updateImage();
    }catch(error){
      snapshotOpen=false;snapshotBase=null;snapshotRequest++;
      console.warn("Screenshot failed",error);
      alert("Could not capture the scene: "+error.message);
    }
  });
  share.addEventListener("click",async()=>{
    if(!snapshotBlob||!save.href||typeof File!=="function")return;
    const file=new File([snapshotBlob],snapshotFileName(maze.name),{type:"image/png"});
    if(!canShareSnapshot(navigator,file))return;
    try{
      await navigator.share({files:[file],title:maze.name||"Maze screenshot"});
      if(dialog.open)status.textContent="The share sheet has closed.";
    }catch(error){
      if(dialog.open&&error?.name!=="AbortError")
        status.textContent="Sharing failed: "+error.message;
    }
  });
}

function initializePlay() {
  const continuePhoto=()=>{
    el("playVoiceAudio").pause();play=dismissPhoto(play);renderPlay();
  };
  el("photoContinueButton").addEventListener("click",continuePhoto);
  el("tilePhotoDialog").addEventListener("cancel",event=>{
    event.preventDefault();continuePhoto();
  });
  el("restartButton").addEventListener("click",()=>{
    clearHeldControls();setRun(false);play=startPlay(maze);renderPlay();
  });
  el("runButton").addEventListener("click",()=>{
    setRun(!runEnabled);renderPlay();
  });
  el("riddleForm").addEventListener("submit",event=>{
    event.preventDefault();
    const response=el("riddleResponse").value;
    const before=play;
    play=answerRiddle(play,response);
    audio.noteTransition(before,play);
    if(play.pendingRiddle){
      el("riddleFeedback").textContent=play.message;
      el("riddleResponse").select();
    }else renderPlay();
  });
  const skipRiddle=()=>{
    play=answerRiddle(play,"",{skip:true});renderPlay();
  };
  el("skipRiddleButton").addEventListener("click",skipRiddle);
  el("riddleDialog").addEventListener("cancel",event=>{
    event.preventDefault();skipRiddle();
  });
  el("mapButton").addEventListener("click",event=>{
    showMap=!showMap;event.currentTarget.setAttribute("aria-pressed",String(showMap));
    renderPlay();
  });
  el("stereoButton").addEventListener("click",()=>{
    if(stereo){leaveCardboard();renderPlay();}
    else enterCardboard();
  });
  el("recenterButton").addEventListener("click",recenterHeadset);
  el("cardboardRecenterButton").addEventListener("click",recenterHeadset);
  el("cardboardExitButton").addEventListener("click",()=>{
    leaveCardboard();renderPlay();
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
    ArrowLeft:"turnLeft",KeyQ:"turnLeft",ArrowRight:"turnRight",KeyE:"turnRight",
    ShiftLeft:"sprint",ShiftRight:"sprint"};
  window.addEventListener("keydown",event=>{
    if(view!=="explore"||snapshotOpen||event.target.closest("input,textarea,select"))return;
    const move=keyMap[event.code];if(move){event.preventDefault();holding.add(move);}
  });
  window.addEventListener("keyup",event=>{const move=keyMap[event.code];if(move)holding.delete(move);});
  const canvas=el("sceneCanvas");
  let lookX=null,triggerStart=null;
  canvas.addEventListener("pointerdown",event=>{
    if(event.pointerType==="mouse"&&event.button!==0)return;
    // A second pointer invalidates any pending viewer trigger.
    if(triggerStart){triggerStart.moved=true;return;}
    lookX=event.clientX;
    triggerStart={id:event.pointerId,x:event.clientX,y:event.clientY,
      at:event.timeStamp,moved:false};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove",event=>{
    if(lookX===null||triggerStart?.id!==event.pointerId)return;
    if(Math.hypot(event.clientX-triggerStart.x,event.clientY-triggerStart.y)>14)
      triggerStart.moved=true;
    const delta=(event.clientX-lookX)*.008;
    if(delta){
      play=rotatePlayer(play,delta);
      if(motionActive&&motionAnchor)motionHeading=shortestAngle(motionHeading+delta);
    }
    lookX=event.clientX;renderPlay();
  });
  const endLook=()=>{lookX=null;triggerStart=null;};
  canvas.addEventListener("pointerup",event=>{
    const tapped=isCardboardTriggerTap(triggerStart,
      {id:event.pointerId,x:event.clientX,y:event.clientY,at:event.timeStamp});
    endLook();
    if(!tapped||!stereo||view!=="explore"||snapshotOpen||
      el("avatarDialog").open||el("riddleDialog").open||
      el("tilePhotoDialog").open||document.hidden)return;
    const before=play;
    play=cardboardTriggerStep(maze,play);
    audio.noteTransition(before,play);
    if(play.ended&&runEnabled)setRun(false);
    renderPlay();
  });
  window.addEventListener("blur",()=>{holding.clear();endLook();});
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden){clearHeldControls();lastFrame=0;audio.pause();updateAudioUI();}
  });
  canvas.addEventListener("pointercancel",endLook);
  canvas.addEventListener("lostpointercapture",endLook);
  const frame=time=>{
    if(view==="explore" && !document.hidden){
      const dt=lastFrame?Math.min(.075,(time-lastFrame)/1000):0;lastFrame=time;
      if(dt&&!play.ended&&!snapshotOpen&&!el("avatarDialog").open) {
        const before=play;
        const turn=Number(holding.has("turnRight"))-Number(holding.has("turnLeft"));
        const forward=Number(holding.has("forward"))-Number(holding.has("backward"));
        const strafe=Number(holding.has("strafeRight"))-Number(holding.has("strafeLeft"));
        if(turn){
          const delta=turn*dt*1.9;
          play=rotatePlayer(play,delta);
          if(motionActive&&motionAnchor)motionHeading=shortestAngle(motionHeading+delta);
        }
        if(forward||strafe)play=movePlayer(maze,play,forward*dt*6,strafe*dt*6,
          runEnabled||holding.has("sprint"));
        play=tickPlayer(play,dt);
        play=advanceShadows(maze,play,dt);
        audio.noteTransition(before,play);
        if(play.ended&&runEnabled)setRun(false);
      }
      renderPlay();
    }else lastFrame=0;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function clearPhotoRefinement(){
  photoRefinementDraft=null;
  const control=el("refinePrintedGridButton");
  if(control)control.textContent="Find a small printed-line correction";
}
function renderPhoto() {
  if(!photoImage||view!=="photo")return;
  const canvas=el("photoCanvas"),ctx=canvas.getContext("2d");
  // Canvas image dimensions are source-space, limited during import.
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(photoImage,0,0,canvas.width,canvas.height);
  // Four blind manual taps make an independent playable-grid quadrilateral.
  // Do not show the previous outline or predicted placements during capture.
  if(photoGridCornerDraft!==null){
    ctx.save();
    ctx.lineWidth=Math.max(2,canvas.width/350);
    ctx.strokeStyle="#ffe8a2";
    if(photoGridCornerDraft.length){
      ctx.beginPath();
      photoGridCornerDraft.forEach((point,i)=>
        i?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));
      ctx.stroke();
    }
    photoGridCornerDraft.forEach((point,i)=>{
      const radius=Math.max(12,canvas.width/33);
      ctx.beginPath();ctx.arc(point.x,point.y,radius,0,2*Math.PI);
      ctx.fillStyle="#171f29";ctx.fill();
      ctx.strokeStyle="#fff0bd";ctx.lineWidth=3;ctx.stroke();
      ctx.font="bold "+Math.round(radius)+"px sans-serif";
      ctx.fillStyle="#ffeabd";ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillText(String(i+1),point.x,point.y);
    });
    ctx.restore();
    return;
  }
  if(!photoCorners)return;
  if(el("showPhotoGridGuide").checked){
    try{
      const margins=Object.fromEntries(["top","right","bottom","left"].map(side=>[
        side,Number(el("gridInset"+side[0].toUpperCase()+
          side.slice(1)+"Slider").value)/100
      ]));
      const guide=projectPhotoGrid(photoCorners,margins,18,18);
      ctx.save();
      // Every third line is easier to track on a small phone. Neither this
      // overlay nor its adjustable margins change the photographed pixels.
      for(const lines of [guide.vertical,guide.horizontal]){
        for(let i=0;i<lines.length;i++){
          const {from,to}=lines[i];
          const outer=i===0||i===lines.length-1;
          ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);
          ctx.lineWidth=outer?Math.max(2,canvas.width/360):i%3===0?1.6:1;
          ctx.strokeStyle=outer?"rgba(24,127,148,.95)":
            i%3===0?"rgba(22,137,160,.73)":"rgba(12,130,151,.37)";
          ctx.stroke();
        }
      }
      ctx.restore();
    }catch{
      // While a corner is being adjusted, invalid geometry must never be
      // rendered as seemingly valid grid evidence. The scanner also rejects it.
    }
  }
  // A candidate is only a *preview*. Do not move current mapping, change
  // labels or show scanner predictions before the second affirmative tap.
  if(photoRefinementDraft?.image===photoImage&&
      photoRefinementDraft.original.every((point,i)=>
        point.x===photoCorners[i].x&&point.y===photoCorners[i].y)){
    const candidate=projectPhotoGrid(photoRefinementDraft.corners,0,18,18);
    ctx.save();
    ctx.setLineDash([Math.max(3,canvas.width/175),Math.max(3,canvas.width/200)]);
    ctx.strokeStyle="rgba(231,154,48,.98)";
    ctx.lineWidth=Math.max(1.8,canvas.width/330);
    for(const lines of [candidate.vertical,candidate.horizontal])
      for(let i=0;i<lines.length;i+=3){
        const {from,to}=lines[i];
        ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();
      }
    ctx.restore();
  }
  ctx.strokeStyle="#ffe8a2";ctx.lineWidth=Math.max(2,canvas.width/250);
  ctx.beginPath();photoCorners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.closePath();ctx.stroke();
  const selectedCorner=Number(el("photoCornerSelect").value);
  photoCorners.forEach((p,i)=>{
    const radius=Math.max(12,canvas.width/33);
    ctx.beginPath();ctx.arc(p.x,p.y,radius,0,2*Math.PI);
    ctx.fillStyle=i===selectedCorner?"#7d5721":"#171f29";
    ctx.fill();ctx.strokeStyle=i===selectedCorner?"#ffffff":"#fff0bd";
    ctx.lineWidth=i===selectedCorner?5:3;ctx.stroke();
    ctx.font="bold "+Math.round(radius)+"px sans-serif";
    ctx.fillStyle="#ffeabd";ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText(String(i+1),p.x,p.y);
  });
}
function initializePhoto() {
  const canvas=el("photoCanvas"),video=el("liveCameraVideo");
  const cameraSession=createCameraSession(()=>
    navigator.mediaDevices.getUserMedia({
      audio:false,video:{facingMode:{ideal:"environment"},
        width:{ideal:1280},height:{ideal:960}}
    }));
  const sample=document.createElement("canvas");
  sample.width=96;sample.height=72;
  const sampleContext=sample.getContext("2d",{willReadFrequently:true});
  const boardSample=document.createElement("canvas");
  const boardContext=boardSample.getContext("2d",{willReadFrequently:true});
  const outline=el("liveBoardOutline"),cameraFrame=el("liveCameraFrame");
  let liveRequest=0,previewFrame=0,lastPreviewCheck=0,lastBoardCheck=0,photoLoadToken=0;
  let lastLighting=null,boardFound=false;
  function clearBoardOutline(){
    boardFound=false;
    cameraFrame.removeAttribute("data-board-found");
    outline.getContext("2d").clearRect(0,0,outline.width,outline.height);
  }
  function inspectBoardOutline(){
    if(video.videoWidth<96||video.videoHeight<96){
      clearBoardOutline();return;
    }
    const scale=Math.min(1,320/Math.max(video.videoWidth,video.videoHeight));
    boardSample.width=Math.max(1,Math.round(video.videoWidth*scale));
    boardSample.height=Math.max(1,Math.round(video.videoHeight*scale));
    boardContext.drawImage(video,0,0,boardSample.width,boardSample.height);
    const estimate=suggestBoardCorners(boardContext.getImageData(
      0,0,boardSample.width,boardSample.height));
    const width=Math.round(video.clientWidth),height=Math.round(video.clientHeight);
    if(!estimate||width<1||height<1){clearBoardOutline();return;}
    // The video uses object-fit:contain, which may letterbox the camera image.
    outline.width=width;outline.height=height;
    const points=projectBoardOutline(estimate.corners,boardSample.width,
      boardSample.height,width,height);
    const context=outline.getContext("2d");
    context.clearRect(0,0,width,height);
    context.beginPath();
    points.forEach((point,i)=>i?context.lineTo(point.x,point.y):
      context.moveTo(point.x,point.y));
    context.closePath();
    context.lineWidth=Math.max(2,width/160);
    context.strokeStyle="#6ff4dc";
    context.stroke();
    for(const point of points){
      context.beginPath();
      context.arc(point.x,point.y,Math.max(3,width/130),0,Math.PI*2);
      context.fillStyle="#6ff4dc";
      context.fill();
    }
    boardFound=true;
    cameraFrame.dataset.boardFound="true";
  }
  function liveCameraMessage(){
    if(!lastLighting)return "Center the entire board in the live preview.";
    if(lastLighting.level!=="ready")return lastLighting.message;
    return boardFound?
      "Possible board outline highlighted. Keep every corner visible; verify after capture.":
      "Lighting looks usable. Include the entire board against a contrasting background.";
  }
  function stopCamera(){
    liveRequest++;
    cameraSession.stop();
    if(previewFrame)cancelAnimationFrame(previewFrame);
    previewFrame=0;lastLighting=null;
    clearBoardOutline();
    video.pause();video.srcObject=null;
    el("liveCameraStage").hidden=true;
    el("startLiveCameraButton").disabled=false;
    el("captureLiveButton").disabled=true;
  }
  stopLiveCamera=stopCamera;
  function inspectPreview(timestamp){
    if(!cameraSession.getStream()||view!=="photo"||document.hidden)return;
    if(timestamp-lastPreviewCheck>850&&video.readyState>=2){
      lastPreviewCheck=timestamp;
      try{
        sampleContext.drawImage(video,0,0,sample.width,sample.height);
        lastLighting=assessCameraFrame(sampleContext.getImageData(
          0,0,sample.width,sample.height));
        el("liveCameraStatus").textContent=liveCameraMessage();
      }catch(error){
        lastLighting=null;
        el("liveCameraStatus").textContent="Preview active. Center the board, then capture.";
      }
    }
    // A slower, bounded 320-pixel sample avoids doing expensive analysis on
    // every animation frame. A failed estimate simply clears the overlay.
    if(timestamp-lastBoardCheck>1800&&video.readyState>=2){
      lastBoardCheck=timestamp;
      try{inspectBoardOutline();}catch{clearBoardOutline();}
      el("liveCameraStatus").textContent=liveCameraMessage();
    }
    previewFrame=requestAnimationFrame(inspectPreview);
  }
  el("startLiveCameraButton").addEventListener("click",async()=>{
    if(!navigator.mediaDevices?.getUserMedia){
      el("liveCameraStatus").textContent=
        "Live preview is unavailable in this browser. Use the photograph picker.";
      return;
    }
    stopCamera();
    const request=liveRequest;
    el("startLiveCameraButton").disabled=true;
    el("liveCameraStage").hidden=false;
    el("liveCameraStatus").textContent="Requesting camera permission…";
    try{
      const stream=await cameraSession.start();
      if(!stream||request!==liveRequest)return;
      if(view!=="photo"){stopCamera();return;}
      video.srcObject=stream;
      await video.play();
      if(request!==liveRequest||cameraSession.getStream()!==stream)return;
      el("captureLiveButton").disabled=false;
      lastPreviewCheck=-1000;
      lastBoardCheck=-2000;
      previewFrame=requestAnimationFrame(inspectPreview);
    }catch(error){
      if(request!==liveRequest)return;
      stopCamera();
      el("liveCameraStatus").textContent=error?.name==="NotAllowedError"?
        "Camera access was denied. You can still choose a photograph.":
        "Live camera could not open. Use the photograph picker instead.";
    }
  });
  el("stopLiveCameraButton").addEventListener("click",()=>{
    stopCamera();
    el("liveCameraStatus").textContent="Live camera closed. No image was saved.";
  });
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden)stopCamera();
  });
  window.addEventListener("pagehide",stopCamera);
  function acceptPhoto(source,width,height,proposeAlignment=false) {
    if(!width||!height)throw new Error("No image pixels are available");
    photoImage=source;
    const max=980,scale=Math.min(max/width,max/height,1);
    canvas.width=Math.max(1,Math.round(width*scale));
    canvas.height=Math.max(1,Math.round(height*scale));
    canvas.style.aspectRatio=canvas.width+" / "+canvas.height;
    photoCorners=initialCorners(canvas.width,canvas.height);
    photoGridCornerDraft=null;
    clearPhotoRefinement();
    el("markPrintedCornersButton").textContent="Mark four printed-grid corners";
    el("photoCornerSelect").value="0";
    el("photoCornerFine").hidden=false;
    el("photoGridCalibration").hidden=false;
    el("showPhotoGridGuide").checked=true;
    el("cornerNudgeStatus").textContent=
      "Select a numbered handle, then adjust it one alignment pixel at a time. Check the paper-grid boundary before tracing.";
    invalidateScanMeasurement();
    let foundAlignment=false;
    if(proposeAlignment){
      // The still image, not an old live-video estimate, supplies the
      // suggested corners. A stale frame can never silently move the handles.
      try{
        const surface=document.createElement("canvas");
        surface.width=canvas.width;surface.height=canvas.height;
        const context=surface.getContext("2d",{willReadFrequently:true});
        context.drawImage(source,0,0,surface.width,surface.height);
        const estimate=suggestBoardCorners(context.getImageData(
          0,0,surface.width,surface.height));
        if(estimate){photoCorners=estimate.corners;foundAlignment=true;}
      }catch{}
    }
    scanBoardPixels=null;scanPixels=null;scanGuide=null;scanResult=null;scanSelected.clear();
    scanAdded.clear();scanRemoved.clear();
    scanSelectedHoles.clear();scanAddedHoles.clear();scanRejectedHoles.clear();
    scanMarkers.clear();scanMarkerEdits.clear();
    el("gridInsetSlider").value="0";
    el("gridInsetValue").textContent="0%";
    for(const edge of ["Top","Right","Bottom","Left"]){
      el("gridInset"+edge+"Slider").value="0";
      el("gridInset"+edge+"Value").textContent="0%";
    }
    el("gridEdgeDetails").open=false;
    el("scanStage").hidden=true;
    el("photoStage").hidden=false;
    el("photoActions").hidden=false;
    photoSuggestionsSeen=false;
    abandonPhotoReference();
    el("annotateBeforeDetectButton").disabled=false;
    el("detectButton").disabled=false;
    el("suggestCornersButton").disabled=false;
    el("traceButton").disabled=false;el("clearPhotoButton").disabled=false;
    renderPhoto();
    return foundAlignment;
  }
  el("captureLiveButton").addEventListener("click",()=>{
    if(!cameraSession.getStream()||video.readyState<2)return;
    try{
      const scale=Math.min(980/video.videoWidth,980/video.videoHeight,1);
      const frame=document.createElement("canvas");
      frame.width=Math.max(1,Math.round(video.videoWidth*scale));
      frame.height=Math.max(1,Math.round(video.videoHeight*scale));
      frame.getContext("2d").drawImage(video,0,0,frame.width,frame.height);
      photoLoadToken++;
      stopCamera();
      const aligned=acceptPhoto(frame,frame.width,frame.height,true);
      el("liveCameraStatus").textContent=aligned?
        "Possible board outline placed on your photograph. Verify all four handles before importing.":
        "Frame captured on this device. No reliable outline found; align all four handles manually.";
    }catch(error){
      el("liveCameraStatus").textContent=
        "Could not capture a frame. Try again or choose a photograph.";
    }
  });
  function loadPhoto(event) {
    const file=event.target.files?.[0];if(!file)return;
    if(!file.type.startsWith("image/")){
      el("liveCameraStatus").textContent="Please select an image file.";return;
    }
    stopCamera();
    const token=++photoLoadToken,url=URL.createObjectURL(file);
    const image=new Image();
    image.onload=()=>{
      URL.revokeObjectURL(url);
      if(token!==photoLoadToken)return;
      acceptPhoto(image,image.naturalWidth,image.naturalHeight);
      el("liveCameraStatus").textContent="Photograph loaded locally. Align the four corners.";
    };
    image.onerror=()=>{
      URL.revokeObjectURL(url);
      if(token===photoLoadToken)el("liveCameraStatus").textContent=
        "This photograph could not be decoded.";
    };
    image.src=url;
    event.target.value="";
  }
  el("photoInput").addEventListener("change",loadPhoto);
  el("suggestCornersButton").addEventListener("click",()=>{
    if(!photoImage)return;
    try{
      const surface=document.createElement("canvas");
      surface.width=canvas.width;surface.height=canvas.height;
      const context=surface.getContext("2d",{willReadFrequently:true});
      context.drawImage(photoImage,0,0,surface.width,surface.height);
      const estimate=suggestBoardCorners(context.getImageData(
        0,0,surface.width,surface.height));
      if(!estimate){
        el("liveCameraStatus").textContent=
          "No reliable four-edge outline found. Drag the numbered corners manually.";
        return;
      }
      // Only alignment handles change; user must still inspect and approve
      // every proposed wall, marker and hole before modifying the document.
      clearPhotoRefinement();
      photoCorners=estimate.corners;
      abandonPhotoReference();
      scanBoardPixels=null;scanPixels=null;scanGuide=null;scanResult=null;scanSelected.clear();
      scanAdded.clear();scanRemoved.clear();
      scanSelectedHoles.clear();scanAddedHoles.clear();scanRejectedHoles.clear();
      scanMarkers.clear();scanMarkerEdits.clear();
      el("scanStage").hidden=true;
      renderPhoto();
      el("liveCameraStatus").textContent=
        "Board-edge estimate ready. Check all four handles and adjust before suggesting walls.";
    }catch{
      el("liveCameraStatus").textContent=
        "Board-edge detection was unavailable. Align the corners by hand.";
    }
  });
  el("refinePrintedGridButton").addEventListener("click",()=>{
    if(!photoImage||!photoCorners||photoGridCornerDraft!==null)return;
    const edges=["Top","Right","Bottom","Left"];
    if(edges.some(edge=>Number(el("gridInset"+edge+"Slider").value)!==0)){
      clearPhotoRefinement();
      el("gridRefinementStatus").textContent=
        "This fine adjustment requires zero paper-grid margins. Mark the four actual printed-grid corners first, or align the outer border and margins manually.";
      renderPhoto();return;
    }
    const same=photoRefinementDraft?.image===photoImage&&
      photoRefinementDraft.original.every((point,i)=>
        point.x===photoCorners[i].x&&point.y===photoCorners[i].y);
    if(same){
      photoCorners=photoRefinementDraft.corners.map(p=>({...p}));
      clearPhotoRefinement();
      // A tiny translation can change the square that holds a physical hole.
      // All detection proposals and independently labeled coordinates are stale.
      abandonPhotoReference();
      scanBoardPixels=null;scanPixels=null;scanGuide=null;scanResult=null;
      scanSelected.clear();scanAdded.clear();scanRemoved.clear();
      scanSelectedHoles.clear();scanAddedHoles.clear();scanRejectedHoles.clear();
      scanMarkers.clear();scanMarkerEdits.clear();
      el("scanStage").hidden=true;
      invalidateScanMeasurement();
      el("gridRefinementStatus").textContent=
        "Fine correction applied to the four handles. Check the actual outer grid intersections and each candidate before importing; physical calibration is not independently verified.";
      renderPhoto();return;
    }
    try{
      const source=document.createElement("canvas");
      source.width=canvas.width;source.height=canvas.height;
      const context=source.getContext("2d",{willReadFrequently:true});
      context.drawImage(photoImage,0,0,source.width,source.height);
      const aligned=warpSquarePixels(context.getImageData(
        0,0,source.width,source.height).data,
        source.width,source.height,photoCorners,504);
      const proposal=suggestPrintedGridRefinement(aligned,photoCorners,
        source.width,source.height);
      if(!proposal){
        clearPhotoRefinement();
        el("gridRefinementStatus").textContent=
          "No trustworthy small translation was found in BOTH directions. Repeated lines cannot resolve whole-cell offsets, missing ink, or perspective skew. Align printed-grid corners by hand.";
      }else{
        photoRefinementDraft={corners:proposal.corners,
          original:photoCorners.map(p=>({...p})),image:photoImage};
        el("refinePrintedGridButton").textContent="Apply highlighted small correction";
        el("gridRefinementStatus").textContent=
          "Yellow dashed lines preview a "+proposal.shiftCells.horizontal+
          "-cell horizontal and "+proposal.shiftCells.vertical+
          "-cell vertical shift. Check all printed squares before applying. It cannot detect a whole-cell error.";
      }
    }catch(error){
      clearPhotoRefinement();
      el("gridRefinementStatus").textContent=
        "Printed-line evidence could not be evaluated. Keep manual alignment: "+
        error.message;
    }
    renderPhoto();
  });
  let activeCorner=-1;
  const coord=event=>{
    const r=canvas.getBoundingClientRect();
    return {x:(event.clientX-r.left)/r.width*canvas.width,
      y:(event.clientY-r.top)/r.height*canvas.height};
  };
  el("photoCornerSelect").addEventListener("change",()=>renderPhoto());
  for(const [id,dx,dy] of [
    ["cornerLeftButton",-1,0],["cornerUpButton",0,-1],
    ["cornerDownButton",0,1],["cornerRightButton",1,0]
  ]){
    el(id).addEventListener("click",()=>{
      if(!photoCorners||!photoImage||photoGridCornerDraft!==null)return;
      const selected=Number(el("photoCornerSelect").value);
      try{
        const next=nudgeBoardCorner(photoCorners,selected,dx,dy,
          canvas.width,canvas.height);
        clearPhotoRefinement();
        photoCorners=next;
        abandonPhotoReference();
        scanBoardPixels=null;scanPixels=null;scanGuide=null;scanResult=null;
        scanSelected.clear();scanAdded.clear();scanRemoved.clear();
        scanSelectedHoles.clear();scanAddedHoles.clear();scanRejectedHoles.clear();
        scanMarkers.clear();scanMarkerEdits.clear();
        el("scanStage").hidden=true;
        invalidateScanMeasurement();
        el("cornerNudgeStatus").textContent=
          "Corner "+(selected+1)+" moved one alignment pixel. Recheck the paper boundary before tracing.";
        renderPhoto();
      }catch(error){
        el("cornerNudgeStatus").textContent=error.message+
          ". Choose another direction or adjust the other handles.";
      }
    });
  }
  el("markPrintedCornersButton").addEventListener("click",()=>{
    if(!photoImage)return;
    const starting=photoGridCornerDraft===null;
    photoGridCornerDraft=starting?[]:null;
    clearPhotoRefinement();
    activeCorner=-1;
    el("markPrintedCornersButton").textContent=starting?
      "Cancel four-point alignment":"Mark four printed-grid corners";
    el("detectButton").disabled=starting;
    el("annotateBeforeDetectButton").disabled=starting||photoSuggestionsSeen;
    el("suggestCornersButton").disabled=starting;
    el("traceButton").disabled=starting;
    el("scanStage").hidden=starting||!scanResult;
    el("cornerNudgeStatus").textContent=starting?
      "Tap the four OUTER intersections of the 18 × 18 printed paper grid, in order: top left, top right, bottom right, bottom left. Do not tap the wooden board corners.":
      "Four-point alignment canceled; the previous photograph mapping is unchanged.";
    renderPhoto();
  });
  canvas.addEventListener("pointerdown",event=>{
    if(!photoCorners)return;
    const p=coord(event);
    if(photoGridCornerDraft!==null){
      const draft=[...photoGridCornerDraft,p];
      if(draft.length<4){
        photoGridCornerDraft=draft;
        el("cornerNudgeStatus").textContent=draft.length+
          " of 4 printed-grid corners marked. Continue clockwise: top left, top right, bottom right, bottom left.";
      }else{
        try{
          const chosen=confirmPrintedGridCorners(draft,canvas.width,canvas.height);
          // Only now replace the old alignment. Never mix a new direct
          // quadrilateral with stale insets, import corrections or references.
          clearPhotoRefinement();
          photoCorners=chosen;
          photoGridCornerDraft=null;
          el("markPrintedCornersButton").textContent="Mark four printed-grid corners";
          el("detectButton").disabled=false;
          el("annotateBeforeDetectButton").disabled=photoSuggestionsSeen;
          el("suggestCornersButton").disabled=false;
          el("traceButton").disabled=false;
          el("photoCornerSelect").value="0";
          el("gridInsetSlider").value="0";
          el("gridInsetValue").textContent="0%";
          for(const edge of ["Top","Right","Bottom","Left"]){
            el("gridInset"+edge+"Slider").value="0";
            el("gridInset"+edge+"Value").textContent="0%";
          }
          el("gridEdgeDetails").open=false;
          abandonPhotoReference();
          invalidateScanMeasurement();
          scanBoardPixels=null;scanPixels=null;scanGuide=null;scanResult=null;
          scanSelected.clear();scanAdded.clear();scanRemoved.clear();
          scanSelectedHoles.clear();scanAddedHoles.clear();scanRejectedHoles.clear();
          scanMarkers.clear();scanMarkerEdits.clear();
          el("scanStage").hidden=true;
          el("cornerNudgeStatus").textContent=
            "Four actual printed-grid corners aligned. Insets reset to zero. Fine-adjust the handles if needed, then scan or label independently.";
        }catch(error){
          // Atomic failure: the original alignment and annotations survive.
          photoGridCornerDraft=[];
          el("cornerNudgeStatus").textContent=
            "Invalid printed-grid quadrilateral: "+error.message+
            ". No alignment changed. Retry all four points clockwise, or cancel.";
        }
      }
      renderPhoto();
      return;
    }
    let closest=Infinity;
    photoCorners.forEach((point,i)=>{
      const dist=Math.hypot(point.x-p.x,point.y-p.y);
      if(dist<closest){closest=dist;activeCorner=i;}
    });
    if(closest>canvas.width*.13){activeCorner=-1;return;}
    el("photoCornerSelect").value=String(activeCorner);
    renderPhoto();
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove",event=>{
    if(activeCorner<0)return;
    const p=coord(event);
    const moved=photoCorners.map(point=>({...point}));
    moved[activeCorner]={
      x:Math.max(0,Math.min(canvas.width-1,p.x)),
      y:Math.max(0,Math.min(canvas.height-1,p.y))
    };
    try{
      homographyForCorners(moved);
    }catch{
      el("cornerNudgeStatus").textContent=
        "Corner movement would fold the grid. Keep all four handles around the paper.";
      return;
    }
    clearPhotoRefinement();
    photoCorners=moved;
    abandonPhotoReference();
    scanBoardPixels=null;scanPixels=null;scanGuide=null;scanResult=null;scanSelected.clear();
    scanAdded.clear();scanRemoved.clear();
    scanSelectedHoles.clear();scanAddedHoles.clear();scanRejectedHoles.clear();
    scanMarkers.clear();scanMarkerEdits.clear();
    el("scanStage").hidden=true;
    invalidateScanMeasurement();
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
  // An accuracy claim requires an explicit, exhaustive user review of
  // the photograph. Geometry, sensitivity, or tile edits revoke that check.
  let scanMeasurementReport="";
  function abandonPhotoReference(){
    photoReferenceMode=false;
    photoReference=newPhotoReference();
    el("scanReviewComplete").disabled=true;
    el("scanReviewTitle").textContent="Review detected walls";
  }
  function invalidateScanMeasurement() {
    scanMeasurementReport="";
    el("scanReviewComplete").checked=false;
    el("measureScanButton").disabled=true;
    el("copyScanReportButton").hidden=true;
    el("scanMeasurementResult").textContent="No measurement yet.";
  }
  el("scanReviewComplete").addEventListener("change",()=>{
    scanMeasurementReport="";
    el("measureScanButton").disabled=!photoReferenceMode||!el("scanReviewComplete").checked||!scanResult;
    el("copyScanReportButton").hidden=true;
    el("scanMeasurementResult").textContent="No measurement yet.";
  });
  el("measureScanButton").addEventListener("click",()=>{
    if(!photoReferenceMode||!scanResult||!el("scanReviewComplete").checked)return;
    const columns=Number(maze.data.scale[0]),rows=Number(maze.data.scale[2]);
    const reviewed=photoReferenceLabels(photoReference);
    const metrics=compareScanReview({columns,rows,
      suggested:{walls:scanResult.suggestions,holes:scanResult.holes,
        markers:scanResult.markers},reviewed
    });
    const holeCenters=compareHoleCenters({suggested:scanResult.holes,
      reviewed:reviewed.holes,width:scanGuide.width,height:scanGuide.height,
      columns,rows});
    // Predictions appear for the first time only AFTER the photograph has
    // been independently labeled. Import selections were never the reference.
    photoReferenceMode=false;
    photoSuggestionsSeen=true;
    el("annotateBeforeDetectButton").disabled=true;
    el("scanReviewComplete").disabled=true;
    el("measureScanButton").disabled=true;
    el("scanReviewTitle").textContent="Review detected walls";
    const fmt=n=>n===null?"not defined":(100*n).toFixed(1)+"%";
    const display=(label,metric)=>label+": "+metric.matches+" matched; "+
      metric.falseAlarms+" false alarms; "+metric.misses+" missed. Precision "+
      fmt(metric.precision)+", recall "+fmt(metric.recall)+".";
    el("scanMeasurementResult").textContent=[
      display("Walls (exact squares)",metrics.walls),
      display("Hole centers (within "+holeCenters.tolerancePixels+
        " rectified photo pixels)",holeCenters),
      display("Holes (exact squares)",metrics.holes),
      display("Start",metrics.start),display("Finish",metrics.finish),
      "Image-space localization and cell assignment are separate tests. "+
      "Neither establishes physical-grid calibration or original scanner accuracy."
    ].join("\n");
    const axis=entry=>entry?{cells:entry.cells,
      confidence:entry.confidence,phaseOffsetCells:entry.phaseOffsetCells}:null;
    scanMeasurementReport=JSON.stringify({
      format:"maze-repropagation-scan-review-v2",
      reference:"independently labeled photograph before detector proposals were displayed",
      note:"One user-labeled photo with manual grid alignment. Prior familiarity and labeling errors remain possible; not verified original scanner accuracy.",
      dimensions:{columns,rows},sensitivity:Number(el("sensitivitySlider").value)/100,
      scanQuality:scanResult.quality,printedGrid:{
        columns:axis(scanResult.printedGrid?.columns),
        rows:axis(scanResult.printedGrid?.rows)},
      metrics:{...metrics,holeCenters}
    },null,2);
    el("copyScanReportButton").hidden=false;
    renderScan();
  });
  el("copyScanReportButton").addEventListener("click",async()=>{
    if(!scanMeasurementReport)return;
    try{
      if(!navigator.clipboard?.writeText)throw new Error("unavailable");
      await navigator.clipboard.writeText(scanMeasurementReport);
      el("scanMeasurementResult").textContent+="\nReport copied. No photograph was included.";
    }catch{
      el("scanMeasurementResult").textContent+="\nCopy unavailable. Read the figures above.";
    }
  });
  function updateScanStatus() {
    if(!scanResult)return;
    if(photoReferenceMode){
      el("scanStatus").textContent="Independent photograph labeling: detector predictions and counts are hidden. "+
        photoReference.walls.size+" walls, "+photoReference.holes.size+
        " holes, "+photoReference.markers.size+" markers manually labeled. "+
        "Tap the visible center of each physical hole (not the grid midpoint). "+
        "Mark every actual feature, then check completion to compare. "+
        "This does not change the maze to import.";
      el("applyScanButton").disabled=true;
      return;
    }
    const spanCount=scanResult.segments?.length??0;
    const instruction=scanPan
      ?"Drag the magnified photograph to inspect another area. Turn Pan off to correct squares."
      :scanMode==="holes"
        ?"Tap a dashed circle to approve a hole, a solid circle to remove it, or an empty square to add one."
        :scanMode==="markers"
          ?"Dashed stickers are unconfirmed guesses. Choose Start or Finish below, then tap the correct square."
          :"Tap a green tile to remove it, or tap an unmarked square to add a wall.";
    const gridNotice=scanReviewWarning(scanResult);
    const unstable=scanResult.unstableSuggestions?.length??0;
    const originNotice=unstable?
      unstable+" additional wall squares change when the tracing grid moves "+
      "one quarter of a cell. They are outlined in amber, NOT selected for "+
      "import. Inspect and tap each one to include it. This is a sensitivity "+
      "check, not verified calibration. ":"";
    const unconfirmedHoles=(scanResult.holes??[]).filter(h=>
      !scanSelectedHoles.has(h.x+","+h.z)&&!scanRejectedHoles.has(h.x+","+h.z)).length;
    const unconfirmedMarkers=(scanResult.markers??[]).filter(m=>
      !scanMarkers.has(m.type)&&!scanMarkerEdits.has(m.type)).length;
    el("scanStatus").textContent=gridNotice+originNotice+scanSelected.size+" walls, "+
      scanSelectedHoles.size+" approved holes ("+unconfirmedHoles+" unconfirmed), "+
      spanCount+" straight image spans, "+scanMarkers.size+" approved markers ("+
      unconfirmedMarkers+" unconfirmed). Circle and sticker guesses are NOT selected automatically: "+
      "their positions on the physical grid have not been calibrated. "+instruction;
    el("applyScanButton").disabled=scanSelected.size===0&&scanSelectedHoles.size===0&&scanMarkers.size===0;
    el("applyScanButton").textContent="Import "+scanSelected.size+" walls, "+
      scanSelectedHoles.size+" holes, "+scanMarkers.size+" markers";
  }
  // The historical physical-grid alignment is not yet proven. Correcting
  // 18-by-18 proposals on a small phone requires being able to inspect each
  // square without resampling the photograph or changing its tile coordinates.
  const scanViewport=el("scanViewport"),scanSurface=el("scanSurface");
  const scanCanvas=el("scanCanvas");
  let scanZoom=1,scanPan=false,scanDrag=null;
  function setScanPan(enabled){
    scanPan=Boolean(enabled)&&scanZoom>1;
    scanDrag=null;
    el("scanPanButton").setAttribute("aria-pressed",String(scanPan));
    scanCanvas.classList.toggle("pan-mode",scanPan);
    if(scanResult)updateScanStatus();
  }
  function setScanZoom(next){
    next=Math.max(1,Math.min(4,next));
    if(next===scanZoom)return;
    const previous={scrollLeft:scanViewport.scrollLeft,scrollTop:scanViewport.scrollTop,
      contentWidth:scanViewport.scrollWidth,contentHeight:scanViewport.scrollHeight,
      viewportWidth:scanViewport.clientWidth,viewportHeight:scanViewport.clientHeight};
    scanZoom=next;
    scanSurface.style.width=scanZoom*100+"%";
    const scroll=centeredReviewScroll({...previous,
      nextWidth:scanViewport.scrollWidth,nextHeight:scanViewport.scrollHeight});
    scanViewport.scrollLeft=scroll.left;
    scanViewport.scrollTop=scroll.top;
    el("scanZoomLevel").textContent=scanZoom+"×";
    el("scanZoomOutButton").disabled=scanZoom===1;
    el("scanZoomInButton").disabled=scanZoom===4;
    el("scanPanButton").disabled=scanZoom===1;
    if(scanZoom===1)setScanPan(false);
  }
  el("scanZoomOutButton").addEventListener("click",()=>setScanZoom(scanZoom-1));
  el("scanZoomInButton").addEventListener("click",()=>setScanZoom(scanZoom+1));
  el("scanPanButton").addEventListener("click",()=>setScanPan(!scanPan));

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
    if(photoReferenceMode){
      // Ground-truth candidates must be authored without any predicted
      // outlines, segments, marker colors or source detector coordinates.
      for(const key of photoReference.walls){
        const [x,z]=key.split(",").map(Number);
        context.fillStyle="rgba(48,189,116,.10)";
        context.fillRect(x*tw,z*th,tw,th);
        context.strokeStyle="#45e59f";context.lineWidth=Math.max(1.5,width/350);
        context.strokeRect(x*tw+2,z*th+2,tw-4,th-4);
      }
      for(const hole of photoReference.holes.values()){
        context.beginPath();context.arc(hole.cx,hole.cy,Math.max(5,hole.radius+2),0,Math.PI*2);
        context.strokeStyle="#ffdc80";context.lineWidth=Math.max(2,width/220);
        context.stroke();
      }
      for(const marker of photoReference.markers.values()){
        const cx=(marker.x+.5)*tw,cy=(marker.z+.5)*th;
        context.beginPath();context.arc(cx,cy,Math.max(9,tw*.39),0,Math.PI*2);
        context.strokeStyle=marker.type==="entrance"?"#70d6ff":"#fd7066";
        context.lineWidth=Math.max(3,width/160);context.stroke();
        context.font="bold "+Math.round(tw*.5)+"px sans-serif";
        context.fillStyle="#fffdf1";context.textAlign="center";
        context.textBaseline="middle";
        context.fillText(marker.type==="entrance"?"S":"F",cx,cy);
      }
    }else{
      // Pale amber outlines are unresolved wall proposals; unlike the green
      // squares they are NOT preselected or silently written into the maze.
      for(const {x,z} of scanResult?.unstableSuggestions??[]){
        const key=x+","+z;
        if(scanSelected.has(key)||scanRemoved.has(key))continue;
        context.strokeStyle="#ffd17a";
        context.lineWidth=Math.max(1.5,width/330);
        context.setLineDash([Math.max(2,width/120),Math.max(2,width/160)]);
        context.strokeRect(x*tw+2,z*th+2,tw-4,th-4);
      }
      context.setLineDash([]);
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
      // Show tentative circle centers, but do not implicitly approve their
      // potentially wrong digital squares as lethal physical-floor holes.
      for(const hole of scanResult?.holes??[]){
        const key=hole.x+","+hole.z;
        if(scanSelectedHoles.has(key)||scanRejectedHoles.has(key))continue;
        context.beginPath();context.arc(hole.cx,hole.cy,Math.max(5,hole.radius+2),0,Math.PI*2);
        context.strokeStyle="#d7ae62";context.lineWidth=Math.max(2,width/260);
        context.setLineDash([Math.max(3,width/140),Math.max(3,width/220)]);
        context.stroke();context.setLineDash([]);
      }
      // Only explicitly selected holes receive solid approval rings.
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
      for(const marker of scanResult?.markers??[]){
        if(scanMarkers.has(marker.type)||scanMarkerEdits.has(marker.type))continue;
        const cx=(marker.x+.5)*tw,cy=(marker.z+.5)*th;
        context.beginPath();context.arc(cx,cy,Math.max(9,tw*.39),0,Math.PI*2);
        context.setLineDash([Math.max(3,width/140),Math.max(3,width/220)]);
        context.strokeStyle="#d7ae62";context.lineWidth=Math.max(2,width/250);
        context.stroke();context.setLineDash([]);
        context.font="bold "+Math.round(tw*.5)+"px sans-serif";
        context.fillStyle="#fffdf1";context.textAlign="center";
        context.textBaseline="middle";context.fillText("?",cx,cy);
      }
      for(const marker of scanMarkers.values()){
        const cx=(marker.x+.5)*tw,cy=(marker.z+.5)*th;
        context.beginPath();context.arc(cx,cy,Math.max(9,tw*.39),0,Math.PI*2);
        context.strokeStyle=marker.type==="entrance"?"#70d6ff":"#fd7066";
        context.lineWidth=Math.max(3,width/160);context.stroke();
        context.font="bold "+Math.round(tw*.5)+"px sans-serif";
        context.fillStyle="#fffdf1";context.textAlign="center";
        context.textBaseline="middle";
        context.fillText(marker.type==="entrance"?"S":"F",cx,cy);
      }
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
    invalidateScanMeasurement();
    try {
      // Re-evaluate the same aligned image when sensitivity changes.
      if(!scanPixels){
        // Rectification is reused while the user adjusts the playable-grid
        // margin. A new alignment or photograph invalidates both images.
        if(!scanBoardPixels)scanBoardPixels=rectifyPhoto().warped;
        scanPixels=insetRectifiedBoard(scanBoardPixels,
          Object.fromEntries(["top","right","bottom","left"].map(edge=>[
            edge,Number(el("gridInset"+edge[0].toUpperCase()+
              edge.slice(1)+"Slider").value)/100
          ])));
        scanGuide=document.createElement("canvas");
        scanGuide.width=scanPixels.width;scanGuide.height=scanPixels.height;
        scanGuide.getContext("2d").putImageData(
          new ImageData(scanPixels.data,scanPixels.width,scanPixels.height),0,0);
      }
      scanResult=suggestWalls(scanPixels,{
        columns:Number(maze.data.scale[0]),rows:Number(maze.data.scale[2]),
        sensitivity:Number(el("sensitivitySlider").value)/100
      });
      const detected=new Set((scanResult.stableSuggestions??scanResult.suggestions)
        .map(item=>item.x+","+item.z));
      scanSelected=new Set([...detected].filter(key=>!scanRemoved.has(key)));
      for(const key of scanAdded)scanSelected.add(key);
      // The real-photo probe found that four of five persistent circle
      // candidates changed assigned squares under a 4% crop change.
      scanSelectedHoles=new Map();
      for(const [key,hole] of scanAddedHoles)scanSelectedHoles.set(key,hole);
      scanMarkers=new Map();
      for(const [type,position] of scanMarkerEdits){
        if(position)scanMarkers.set(type,position);
        else scanMarkers.delete(type);
      }
      if(!photoReferenceMode){
        photoSuggestionsSeen=true;
        el("annotateBeforeDetectButton").disabled=true;
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
    invalidateScanMeasurement();
    if(photoReferenceMode){
      photoReference={...photoReference,markers:new Map()};
      renderScan();
      return;
    }
    scanMarkers.clear();
    scanMarkerEdits.set("entrance",null);scanMarkerEdits.set("exit",null);
    renderScan();
  });
  el("detectButton").addEventListener("click",()=>{
    abandonPhotoReference();
    analyzePhoto(true);
  });
  el("annotateBeforeDetectButton").addEventListener("click",()=>{
    // Avoid presenting an already-exposed prediction-assisted review as blind.
    if(photoSuggestionsSeen)return;
    photoReference=newPhotoReference();
    photoReferenceMode=true;
    el("scanReviewTitle").textContent="Label the photograph before seeing suggestions";
    el("scanReviewComplete").disabled=false;
    setScanMode("walls");
    analyzePhoto(true);
  });
  const gridEdges=["Top","Right","Bottom","Left"];
  el("showPhotoGridGuide").addEventListener("change",renderPhoto);
  // Inset changes remap tile coordinates: previous hand corrections would
  // now refer to different squares and must never be silently reused.
  const restartAlignedScan=()=>{
    clearPhotoRefinement();
    renderPhoto();
    if(!scanBoardPixels)return;
    abandonPhotoReference();
    scanPixels=null;scanGuide=null;scanResult=null;scanSelected.clear();
    scanAdded.clear();scanRemoved.clear();
    scanSelectedHoles.clear();scanAddedHoles.clear();scanRejectedHoles.clear();
    scanMarkers.clear();scanMarkerEdits.clear();
    analyzePhoto(false);
  };

  el("suggestGridEdgesButton").addEventListener("click",()=>{
    try{
      if(!scanBoardPixels)scanBoardPixels=rectifyPhoto().warped;
      const proposal=suggestPlayableGridEdges(scanBoardPixels);
      if(!proposal){
        el("edgeSuggestionStatus").textContent=
          "No convincing outer border found. Keep or adjust the margins manually.";
        return;
      }
      for(const edge of gridEdges){
        const side=edge.toLowerCase();
        // Lack of evidence for a border is not evidence of a zero margin.
        // Never discard a previously hand-calibrated, undetected side.
        const value=proposal.detected.includes(side)?proposal.edges[side]:
          Number(el("gridInset"+edge+"Slider").value);
        el("gridInset"+edge+"Slider").value=String(value);
        el("gridInset"+edge+"Value").textContent=value+"%";
      }
      const suggested=gridEdges.map(edge=>Number(el("gridInset"+edge+"Slider").value));
      if(suggested.every(value=>value===suggested[0])){
        el("gridInsetSlider").value=String(suggested[0]);
        el("gridInsetValue").textContent=suggested[0]+"%";
      }else{
        el("gridInsetValue").textContent="Custom";
      }
      el("edgeSuggestionStatus").textContent=
        "Possible border on "+proposal.detected.join(", ")+
        ". Other margins were kept. Review the refreshed tiles before importing.";
      renderPhoto();
      restartAlignedScan();
    }catch(error){
      el("edgeSuggestionStatus").textContent=
        "Could not estimate board margins: "+error.message;
    }
  });
  el("gridInsetSlider").addEventListener("input",()=>{
    const value=el("gridInsetSlider").value;
    el("gridInsetValue").textContent=value+"%";
    for(const edge of gridEdges){
      el("gridInset"+edge+"Slider").value=value;
      el("gridInset"+edge+"Value").textContent=value+"%";
    }
    renderPhoto();
  });
  el("gridInsetSlider").addEventListener("change",restartAlignedScan);
  for(const edge of gridEdges){
    const slider=el("gridInset"+edge+"Slider");
    slider.addEventListener("input",()=>{
      el("gridInset"+edge+"Value").textContent=slider.value+"%";
      const values=gridEdges.map(name=>el("gridInset"+name+"Slider").value);
      if(values.every(value=>value===values[0])){
        el("gridInsetSlider").value=values[0];
        el("gridInsetValue").textContent=values[0]+"%";
      }else{
        el("gridInsetValue").textContent="Custom";
      }
      renderPhoto();
    });
    slider.addEventListener("change",restartAlignedScan);
  }
  el("sensitivitySlider").addEventListener("input",()=>{
    if(scanPixels)analyzePhoto(false);
  });
  scanCanvas.addEventListener("pointerdown",event=>{
    if(!scanGuide||event.button!==0)return;
    if(scanPan){
      scanDrag={id:event.pointerId,x:event.clientX,y:event.clientY,
        left:scanViewport.scrollLeft,top:scanViewport.scrollTop};
      scanCanvas.setPointerCapture(event.pointerId);
      return;
    }
    const cell=reviewCellAt(event.currentTarget.getBoundingClientRect(),
      event.clientX,event.clientY,
      Number(maze.data.scale[0]),Number(maze.data.scale[2]));
    if(!cell)return;
    const {x,z}=cell;
    invalidateScanMeasurement();
    const key=x+","+z;
    if(photoReferenceMode){
      const point=reviewPixelAt(event.currentTarget.getBoundingClientRect(),
        event.clientX,event.clientY,scanGuide.width,scanGuide.height);
      if(!point)return;
      photoReference=editPhotoReference(photoReference,{
        mode:scanMode,x,z,markerBrush,width:scanGuide.width,height:scanGuide.height,
        columns:Number(maze.data.scale[0]),rows:Number(maze.data.scale[2]),
        ...point
      });
      renderScan();
      return;
    }
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
        const hole=holeForPhotoReview(scanResult?.holes??[],{
          x,z,width:scanGuide.width,height:scanGuide.height,
          columns:Number(maze.data.scale[0]),rows:Number(maze.data.scale[2])
        });
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
  scanCanvas.addEventListener("pointermove",event=>{
    if(!scanPan||scanDrag?.id!==event.pointerId)return;
    scanViewport.scrollLeft=scanDrag.left-(event.clientX-scanDrag.x);
    scanViewport.scrollTop=scanDrag.top-(event.clientY-scanDrag.y);
  });
  const finishScanPan=event=>{
    if(scanDrag?.id!==event.pointerId)return;
    scanDrag=null;
    if(scanCanvas.hasPointerCapture(event.pointerId))
      scanCanvas.releasePointerCapture(event.pointerId);
  };
  scanCanvas.addEventListener("pointerup",finishScanPan);
  scanCanvas.addEventListener("pointercancel",finishScanPan);
  scanCanvas.addEventListener("lostpointercapture",()=>{scanDrag=null;});
  el("cancelScanButton").addEventListener("click",()=>{
    invalidateScanMeasurement();
    abandonPhotoReference();
    el("scanStage").hidden=true;
    scanSelected.clear();
    scanAdded.clear();scanRemoved.clear();
    scanSelectedHoles.clear();scanAddedHoles.clear();scanRejectedHoles.clear();
    scanMarkers.clear();scanMarkerEdits.clear();
    scanResult=null;
  });
  el("applyScanButton").addEventListener("click",()=>{
    if(photoReferenceMode)return;
    if(!scanGuide||(!scanSelected.size&&!scanSelectedHoles.size&&!scanMarkers.size))return;
    const suggestions=[...scanSelected].map(key=>{
      const [x,z]=key.split(",").map(Number);
      return {x,z};
    });
    const {maze:updated,appliedWalls,annotatedHoles,movedMarkers,skippedHoles}=applyCaptureFindings(
      maze,suggestions,[...scanSelectedHoles.values()],
      Object.fromEntries(scanMarkers));
    photoGuide=scanGuide;
    commit(updated);
    setView("build");
    notice("Imported "+appliedWalls+" wall tiles, "+annotatedHoles+
      " holes and "+movedMarkers+" updated start/finish markers."+
      (skippedHoles?" Skipped "+skippedHoles+" holes conflicting with existing tiles.":"")+
      " Review your maze.");
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
    photoLoadToken++;stopCamera();
    abandonPhotoReference();
    photoSuggestionsSeen=false;
    el("annotateBeforeDetectButton").disabled=true;
    photoImage=null;photoCorners=null;photoGuide=null;
    el("photoCornerFine").hidden=true;
    el("photoGridCalibration").hidden=true;
    invalidateScanMeasurement();
    scanBoardPixels=null;scanPixels=null;scanGuide=null;scanResult=null;scanSelected.clear();
    scanAdded.clear();scanRemoved.clear();
    scanSelectedHoles.clear();scanAddedHoles.clear();scanRejectedHoles.clear();
    scanMarkers.clear();scanMarkerEdits.clear();
    el("scanStage").hidden=true;
    el("photoActions").hidden=true;
    el("photoStage").hidden=true;el("detectButton").disabled=true;
    el("traceButton").disabled=true;el("suggestCornersButton").disabled=true;
    el("clearPhotoButton").disabled=true;
    redrawAll();notice("Photograph removed");
  });
}

function initialize() {
  prepareToolbox();initializeBoardInput();initializeDialogs();initializeAudio();initializePlay();initializeAvatar();initializeSnapshot();initializePhoto();
  el("zoomInButton").addEventListener("click",()=>setBoardZoom(boardZoom+1));
  el("zoomOutButton").addEventListener("click",()=>setBoardZoom(boardZoom-1));
  el("panButton").addEventListener("click",()=>{
    setBoardPan(!boardPanning);
    notice(boardPanning?"Drag to pan the board; drawing is paused":"Board drawing enabled");
  });
  el("cancelPlacementButton").addEventListener("click",()=>{
    clearPlacement();notice("Move or copy cancelled");renderBoard();
  });
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
    const result=findPlayableRoute(maze);
    route=result.status==="reachable"?result.route:null;
    if(result.status==="invalid")notice(result.reason);
    else if(result.status==="indeterminate")notice("Route uncertain · "+result.reason);
    else if(result.status==="blocked")notice("No playable route · "+result.reason);
    else notice("Playable route · "+result.moves+" moves · "+result.keys.length+
      " key"+(result.keys.length===1?"":"s")+" · "+result.passages+
      " passage"+(result.passages===1?"":"s")+". Timers and shadows not checked.");
    renderBoard();
  });
  document.querySelectorAll(".tab").forEach(button=>{
    button.addEventListener("click",()=>setView(button.dataset.view));
  });
  window.addEventListener("resize",()=>{renderBoard();renderPhoto();renderPlay();});
  window.addEventListener("pagehide",persist);
  window.addEventListener("beforeunload",event=>{
    if(!unsavedChanges)return;
    event.preventDefault();
    event.returnValue="";
  });
  refreshActions();persist();setView("build");
  if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(console.warn);
}
initialize();
