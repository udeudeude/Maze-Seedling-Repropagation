import {cellCoordinates, locate, primaryCell, passable} from "./maze-world.mjs";
import {photoAt} from "./maze-media.mjs";
import {voiceAt} from "./maze-voice.mjs";

export const THEMATIC = Object.freeze({
  adventure:{sky:"#27322d",floor:"#8d754b",wall:"#a28b58",mortar:"#3f4035",accent:"#f0c274",name:"Forbidden Temple"},
  hedge:{sky:"#7897ad",floor:"#536741",wall:"#486542",mortar:"#1d3729",accent:"#eadcae",name:"Castle Quest"},
  marble_maze:{sky:"#535c67",floor:"#998567",wall:"#bf9f76",mortar:"#634f3f",accent:"#f6d184",name:"Marble Mayhem"},
  space:{sky:"#111a32",floor:"#354358",wall:"#6d849b",mortar:"#18293d",accent:"#6bf8e8",name:"Space Race"}
});

const clamp=(number,lo,hi)=>Math.min(hi,Math.max(lo,number));
export function startPlay(maze) {
  const entry=locate(maze,"entrance")[0]??[1,1];
  return {x:entry[0]+0.5,z:entry[1]+0.5,heading:0,remaining:Math.max(1,Number(maze.data.duration)||300),
    ended:false,won:false,visited:[],message:"Find the exit.",keys:[],boostUntil:0,slowUntil:0,
    passageLatch:null,pendingRiddle:null,pendingPhoto:null,solvedRiddles:[],
    // Exploration is run-local, distinct from 'visited' (one-time tile effects).
    explored:[entry.join(",")],mapRevealed:false,
    // Original shadow spawn tiles are never moved in the maze document.
    shadows:locate(maze,"shadow").filter(([x,z])=>passable(maze,x,z))
      .map(([x,z])=>({x:x+.5,z:z+.5,target:null}))};
}
/** Record a visited square without retriggering its one-time tile effect. */
function noteExplored(state) {
  const key=Math.floor(state.x)+","+Math.floor(state.z);
  return (state.explored??[]).includes(key)?state:
    {...state,explored:[...(state.explored??[]),key]};
}

/**
 * A Map tile reveals the whole chart. Until then the map shows traversed
 * squares and their immediate neighbors. null means fully revealed.
 * This is a reconstruction rule, not a recovered native scoring mechanic.
 */
export function mapVisibleCells(maze,state) {
  if(state.mapRevealed)return null;
  const width=Number(maze.data.scale[0]),height=Number(maze.data.scale[2]);
  const visible=new Set();
  const explored=state.explored?.length?state.explored:
    [Math.floor(state.x)+","+Math.floor(state.z)];
  for(const key of explored){
    const match=/^(\d+),(\d+)$/.exec(key);
    if(!match)continue;
    const x=Number(match[1]),z=Number(match[2]);
    for(const [dx,dz] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]){
      const nx=x+dx,nz=z+dz;
      if(nx>=0&&nz>=0&&nx<width&&nz<height)visible.add(nx+","+nz);
    }
  }
  return visible;
}
export function rotatePlayer(state,delta) {
  return {...state,heading:(state.heading+delta+Math.PI*8)%(Math.PI*2)};
}
/**
 * Movement is swept in small increments. A fast move must not jump through
 * walls, physical holes, keys, riddles, or shadows between rendered frames.
 * Sprint is a deliberate modern equivalent of the original iPhone's hard
 * press to go faster, not a claim of matching its exact acceleration curve.
 */
export function movePlayer(maze,state,forward,strafe=0,sprint=false) {
  if(state.ended||state.pendingRiddle||state.pendingPhoto)return state;
  const speed=state.boostUntil>0?.35:state.slowUntil>0?.14:.24;
  const magnitude=Math.hypot(forward,strafe);
  const inputScale=magnitude?Math.max(Math.abs(forward),Math.abs(strafe))/magnitude:1;
  const stepSpeed=speed*(sprint?1.6:1)*inputScale;
  const dx=(Math.cos(state.heading)*forward+
    Math.cos(state.heading+Math.PI/2)*strafe)*stepSpeed;
  const dz=(Math.sin(state.heading)*forward+
    Math.sin(state.heading+Math.PI/2)*strafe)*stepSpeed;
  const increments=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
  const xStep=dx/increments,zStep=dz/increments,cushion=.19;
  let next=state;
  for(let i=0;i<increments;i++) {
    const free=(x,z)=>passable(maze,Math.floor(x),Math.floor(z),next.keys);
    let x=next.x,z=next.z;
    if(xStep!==0&&free(x+xStep+Math.sign(xStep)*cushion,z) &&
      free(x+xStep+Math.sign(xStep)*cushion,z+cushion) &&
      free(x+xStep+Math.sign(xStep)*cushion,z-cushion))x+=xStep;
    if(zStep!==0&&free(x,z+zStep+Math.sign(zStep)*cushion) &&
      free(x+cushion,z+zStep+Math.sign(zStep)*cushion) &&
      free(x-cushion,z+zStep+Math.sign(zStep)*cushion))z+=zStep;
    next=catchShadow(collectAt(maze,{...next,x,z}));
    if(next.ended||next.pendingRiddle||next.pendingPhoto)break;
    if(x===next.x&&z===next.z&&xStep===0&&zStep===0)break;
  }
  return next;
}
/**
 * Viewer button / screen tap: a short swept move in the looked-at direction.
 * Reuses the same wall, gate, hole, shadow, and collectible rules as touch
 * movement. A tap is not a teleport; power-ups still affect step distance.
 */
export function cardboardTriggerStep(maze,state) {
  return movePlayer(maze,state,2.7,0,false);
}
/** A release counts as a viewer trigger, never a drag, hold, or second finger. */
export function isCardboardTriggerTap(start,end) {
  return !!start&&!!end&&!start.moved&&start.id===end.id&&
    Number.isFinite(start.x)&&Number.isFinite(start.y)&&
    Number.isFinite(end.x)&&Number.isFinite(end.y)&&
    Number.isFinite(start.at)&&Number.isFinite(end.at)&&
    end.at>=start.at&&end.at-start.at<=650&&
    Math.hypot(end.x-start.x,end.y-start.y)<=14;
}
/**
 * Optional reconstructed interactions. Never reinterpret unknown native riddle
 * objects or invent an original tile type: user-authored puzzles are namespaced.
 */
export function riddleAt(cell) {
  const extension=cell?.repropagation?.riddle;
  if(!extension||typeof extension.question!=="string"||
      typeof extension.answer!=="string"||!extension.question.trim()||
      !extension.answer.trim())return null;
  return {question:extension.question.trim(),answer:extension.answer.trim()};
}
export function answerRiddle(state,response,{skip=false}={}) {
  if(!state.pendingRiddle)return state;
  const {key,answer}=state.pendingRiddle;
  if(skip)return {...state,pendingRiddle:null,message:"Riddle left unanswered"};
  const normalize=text=>String(text).normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase();
  if(normalize(response)!==normalize(answer))
    return {...state,message:"Not quite. Try again or continue without answering."};
  return {...state,pendingRiddle:null,
    solvedRiddles:[...(state.solvedRiddles??[]),key],
    message:"Riddle solved!"};
}
/** An opt-in reconstructed pickup on an original info cell, never a new native tile type. */
export function keyPickupId(cell) {
  const id=cell?.type==="info"?cell.repropagation?.keyId:null;
  return typeof id==="string"&&id.trim()?id.trim():null;
}
export function dismissPhoto(state) {
  return state.pendingPhoto?{...state,pendingPhoto:null}:state;
}
export function collectAt(maze,state) {
  if(state.ended||state.pendingRiddle||state.pendingPhoto)return state;
  // Record every traversed square, including empty floor and physical holes.
  const surveyed=noteExplored(state);
  if(shadowTouches(surveyed))return catchShadow(surveyed);
  const x=Math.floor(surveyed.x),z=Math.floor(surveyed.z),key=x+","+z;
  // The latch prevents an immediate return trip on arrival at the other end.
  // Stepping off a passage arms it again for a later visit.
  const active=surveyed.passageLatch&&surveyed.passageLatch!==key
    ?{...surveyed,passageLatch:null}:surveyed;
  const isPhysicalHole=(maze.repropagation?.physicalHoles??[])
    .some(item=>Number(item.position?.[0])===x&&Number(item.position?.[2])===z);
  if(isPhysicalHole)return {...active,ended:true,won:false,
    message:"Fell into a physical maze hole (provisional simulation)"};
  const cell=primaryCell(maze,x,z)?.cell;
  if(cell?.type==="secret_passage") {
    if(active.passageLatch===key)return active;
    const id=String(cell.variant??"").trim();
    const destinations=id?maze.data.cells.filter(other=>
      other!==cell&&other.type==="secret_passage"&&
      String(other.variant??"").trim()===id):[];
    if(destinations.length===1) {
      const target=cellCoordinates(destinations[0]);
      const targetKey=target.join(",");
      const blocked=(maze.repropagation?.physicalHoles??[]).some(hole=>
        Number(hole.position?.[0])===target[0]&&
        Number(hole.position?.[2])===target[1]);
      if(!blocked&&passable(maze,...target,active.keys))
        return catchShadow(noteExplored({...active,x:target[0]+.5,z:target[1]+.5,
          passageLatch:targetKey,visited:[...new Set([...active.visited,key,targetKey])],
          message:"Secret passage: transported to "+(target[0]+1)+", "+(target[1]+1)}));
    }
    if(active.visited.includes(key))return active;
    return {...active,visited:[...active.visited,key],
      message:"This passage needs exactly one safe matching partner."};
  }
  if(active.visited.includes(key))return active;
  if(!cell)return active;
  const next={...active,visited:[...active.visited,key]};
  if(cell.type==="exit")return {...next,ended:true,won:true,message:"Maze completed!"};
  if(cell.type==="timer_powerup")return {...next,remaining:next.remaining+30,message:"+30 seconds"};
  if(cell.type==="timer_hazard")return {...next,remaining:Math.max(0,next.remaining-30),message:"−30 seconds"};
  if(cell.type==="speed_powerup")return {...next,boostUntil:25,slowUntil:0,message:"Speed boost"};
  if(cell.type==="speed_hazard")return {...next,boostUntil:0,slowUntil:12,
    message:"Slowed for 12 seconds"};
  if(cell.type==="info") {
    const id=keyPickupId(cell);
    const caption=typeof cell.text==="string"?cell.text:
      typeof cell.message==="string"?cell.message:"";
    const url=photoAt(cell),voiceUrl=voiceAt(cell);
    const pendingPhoto=url||voiceUrl?
      {key,url,caption,...(voiceUrl?{voiceUrl}:{})}:null;
    if(id) {
      const keys=next.keys.includes(id)?next.keys:[...next.keys,id];
      return {...next,keys,pendingPhoto,
        message:"Picked up key "+id+(caption?" · "+caption:"")};
    }
    return {...next,pendingPhoto,message:caption||"A message"};
  }
  if(cell.type==="riddle") {
    const puzzle=riddleAt(cell);
    return puzzle?{...next,pendingRiddle:{key,...puzzle},message:"Answer the riddle"}
      :{...next,message:"Riddle tile has no playable question and answer yet"};
  }
  if(cell.type==="gate")return {...next,
    message:"Opened gate "+String(cell.variant??"0").trim()};
  if(cell.type==="map")return {...next,mapRevealed:true,message:"Map found · Full layout revealed"};
  return next;
}

/**
 * Reconstructed shadow chasers, not a claim about the original Unity rules.
 * Spawn markers stay in the maze; moving actors exist only in play state.
 * Pursuit respects walls, locked gates and photographed physical holes.
 */
export function shadowTouches(state) {
  return (state.shadows??[]).some(actor=>
    Math.hypot(actor.x-state.x,actor.z-state.z)<.39);
}
function catchShadow(state) {
  return state.ended||!shadowTouches(state)?state:
    {...state,ended:true,won:false,message:"A shadow caught you"};
}
function nextShadowCell(maze,fromX,fromZ,toX,toZ,keys,holes) {
  const start=fromX+","+fromZ,goal=toX+","+toZ;
  if(start===goal)return null;
  const queue=[[fromX,fromZ]],parents=new Map([[start,null]]);
  for(let head=0;head<queue.length;head++) {
    const [x,z]=queue[head],here=x+","+z;
    if(here===goal) {
      let node=here,parent=parents.get(node);
      while(parent!==start&&parent!==null) {
        node=parent;parent=parents.get(node);
      }
      return parent===null?null:node.split(",").map(Number);
    }
    for(const [dx,dz] of [[0,-1],[-1,0],[1,0],[0,1]]) {
      const nx=x+dx,nz=z+dz,key=nx+","+nz;
      if(parents.has(key)||holes.has(key)||!passable(maze,nx,nz,keys))continue;
      parents.set(key,here);queue.push([nx,nz]);
    }
  }
  return null;
}
export function advanceShadows(maze,state,seconds) {
  if(state.ended||state.pendingRiddle||state.pendingPhoto||!state.shadows?.length||!(seconds>0))return state;
  const shadows=state.shadows.map(actor=>({...actor,target:actor.target?[...actor.target]:null}));
  const next={...state,shadows};
  if(shadowTouches(next))return catchShadow(next);
  const holes=new Set((maze.repropagation?.physicalHoles??[]).map(item=>
    Number(item.position?.[0])+","+Number(item.position?.[2])));
  // Split longer updates for consistent speed and collision detection.
  const elapsed=Math.min(seconds,5),steps=Math.ceil(elapsed/.075),step=elapsed/steps;
  for(let frame=0;frame<steps;frame++) {
    for(const actor of shadows) {
      if(!actor.target) {
        const target=nextShadowCell(maze,Math.floor(actor.x),Math.floor(actor.z),
          Math.floor(state.x),Math.floor(state.z),state.keys,holes);
        if(target)actor.target=[target[0]+.5,target[1]+.5];
      }
      if(actor.target) {
        const dx=actor.target[0]-actor.x,dz=actor.target[1]-actor.z;
        const distance=Math.hypot(dx,dz),travel=Math.min(distance,.84*step);
        if(distance>0) {
          actor.x+=dx/distance*travel;actor.z+=dz/distance*travel;
        }
        if(distance<=travel+1e-9) {
          actor.x=actor.target[0];actor.z=actor.target[1];actor.target=null;
        }
      }
      if(shadowTouches(next))return catchShadow(next);
    }
  }
  return next;
}

export function tickPlayer(state,seconds) {
  if(state.ended||state.pendingRiddle||state.pendingPhoto||seconds<=0)return state;
  const remaining=Math.max(0,state.remaining-seconds);
  return {...state,remaining,boostUntil:Math.max(0,state.boostUntil-seconds),
    slowUntil:Math.max(0,(state.slowUntil??0)-seconds),
    ended:remaining===0,won:false,message:remaining===0?"Time is up":state.message};
}
/** Build one collision index for all rays in a rendered frame. */
export function createWallIndex(maze,keys=[]) {
  const width=Number(maze.data.scale[0]),height=Number(maze.data.scale[2]);
  const tiles=new Array(width*height).fill(null);
  for(const cell of maze.data.cells) {
    const x=Number(cell.position[0]),z=Number(cell.position[2]);
    if(!Number.isInteger(x)||!Number.isInteger(z)||x<0||z<0||x>=width||z>=height)continue;
    if(cell.type==="wall"||(cell.type==="gate"&&!keys.includes(String(cell.variant??"0"))))
      tiles[z*width+x]=cell.type;
  }
  return {width,height,tiles};
}
export function castRay(maze,x,z,heading,maxDistance=28,wallIndex=null) {
  const dx=Math.cos(heading),dz=Math.sin(heading);
  let cellX=Math.floor(x),cellZ=Math.floor(z);
  const stepX=dx>=0?1:-1,stepZ=dz>=0?1:-1;
  const tdeltaX=Math.abs(1/(dx||1e-14)),tdeltaZ=Math.abs(1/(dz||1e-14));
  let sideX=(dx>=0?(cellX+1-x):(x-cellX))*tdeltaX;
  let sideZ=(dz>=0?(cellZ+1-z):(z-cellZ))*tdeltaZ;
  while(true) {
    let dist,side;
    if(sideX<sideZ){dist=sideX;sideX+=tdeltaX;cellX+=stepX;side=0;}
    else{dist=sideZ;sideZ+=tdeltaZ;cellZ+=stepZ;side=1;}
    if(dist>maxDistance)break;
    const indexed=wallIndex && cellX>=0&&cellZ>=0&&cellX<wallIndex.width&&cellZ<wallIndex.height;
    const outside=wallIndex&&(cellX<0||cellZ<0||cellX>=wallIndex.width||cellZ>=wallIndex.height);
    const obstacle=wallIndex ? (outside?"wall":wallIndex.tiles[cellZ*wallIndex.width+cellX])
      : (!passable(maze,cellX,cellZ)?(primaryCell(maze,cellX,cellZ)?.cell.type??"wall"):null);
    if(obstacle) {
      const face=side===0?z+dist*dz:x+dist*dx;
      return {distance:Math.max(0.015,dist),cellX,cellZ,side,texture:face-Math.floor(face),kind:obstacle};
    }
  }
  return null;
}

/**
 * Independent, copyright-safe signposts for native interactive tile categories.
 * The original game used three-dimensional objects, but their artwork has not
 * been recovered. Keeping them visible is essential: effects must not be
 * discoverable only by accidentally walking across an invisible floor tile.
 * This is a rendering projection, never a mutation of original document data.
 */
const LANDMARK_TYPES=new Set([
  "exit","map","info","riddle","secret_passage","timer_powerup",
  "timer_hazard","speed_powerup","speed_hazard"
]);

export function sceneLandmarks(maze,player,{eyeOffset=0,fov=1.15,
  maxDistance=14,wallIndex=null}={}) {
  const index=wallIndex??createWallIndex(maze,player.keys??[]);
  const lateral=player.heading+Math.PI/2;
  const ox=player.x+Math.cos(lateral)*eyeOffset;
  const oz=player.z+Math.sin(lateral)*eyeOffset;
  const cosine=Math.cos(player.heading),sine=Math.sin(player.heading);
  const tanHalf=Math.tan(fov/2),visited=new Set(player.visited??[]);
  const result=[];
  for(const cell of maze.data.cells) {
    if(!LANDMARK_TYPES.has(cell.type))continue;
    const [x,z]=cellCoordinates(cell),key=x+","+z;
    if(!Number.isInteger(x)||!Number.isInteger(z))continue;
    // Passage portals can be reused; the finish must remain visible.
    if(cell.type!=="exit"&&cell.type!=="secret_passage"&&
      (visited.has(key)||(cell.type==="map"&&player.mapRevealed)))continue;
    const dx=x+.5-ox,dz=z+.5-oz;
    const forward=dx*cosine+dz*sine;
    if(forward<=.22||forward>maxDistance)continue;
    const screenX=(-dx*sine+dz*cosine)/(forward*tanHalf);
    if(Math.abs(screenX)>1.3)continue;
    const distance=Math.hypot(dx,dz);
    const hit=castRay(maze,ox,oz,Math.atan2(dz,dx),distance,index);
    if(hit&&hit.distance<distance-.22)continue;
    result.push({type:cell.type,key,screenX,forward,
      isKey:cell.type==="info"&&!!keyPickupId(cell),
      photoUrl:cell.type==="info"?photoAt(cell):null});
  }
  // Distant billboards are painted first, so nearby objects cover them.
  return result.sort((a,b)=>b.forward-a.forward);
}

/** Small, perspective-scaled floor markers, not copied Seedling graphics. */
function drawSceneLandmark(ctx,item,x,groundY,height,theme,photoResolver=null) {
  const size=Math.min(height*.45,height*.53/Math.max(item.forward,.45));
  if(size<2)return;
  const hazard=item.type.endsWith("_hazard");
  const ink=hazard?"#f08e6b":theme.accent;
  ctx.save();
  ctx.translate(x,groundY);ctx.scale(size,size);
  ctx.globalAlpha=clamp(1-item.forward/32,.55,1);
  ctx.fillStyle="rgba(7,12,20,.55)";
  ctx.beginPath();ctx.ellipse(0,-.04,.34,.11,0,0,Math.PI*2);ctx.fill();
  ctx.lineWidth=.045;ctx.strokeStyle=ink;
  ctx.fillStyle="rgba(12,20,27,.88)";
  // Only locally authored, bounded JPEGs reach this resolver. An unavailable
  // or undecodable image leaves the normal interaction symbol in place.
  if(item.type==="info"&&item.photoUrl&&photoResolver) {
    const photo=photoResolver(item.photoUrl);
    const width=Number(photo?.naturalWidth),height=Number(photo?.naturalHeight);
    if(width>0&&height>0) {
      ctx.fillStyle="rgba(9,15,22,.94)";
      ctx.fillRect(-.33,-.88,.66,.65);
      ctx.strokeRect(-.33,-.88,.66,.65);
      // Letterbox, rather than crop, personal photos: their full contents
      // matter more than an edge-to-edge decorative thumbnail.
      const fit=Math.min(.56/width,.55/height);
      ctx.drawImage(photo,-width*fit/2,-.555-height*fit/2,width*fit,height*fit);
      if(item.isKey) {
        // A small keyed corner preserves the gate clue when a photograph
        // and collectible key share the same original Message tile.
        ctx.fillStyle=ink;
        ctx.beginPath();ctx.arc(.245,-.29,.115,0,Math.PI*2);ctx.fill();
        ctx.lineWidth=.023;ctx.strokeStyle="#111820";
        ctx.beginPath();ctx.arc(.215,-.3,.035,0,Math.PI*2);
        ctx.moveTo(.25,-.3);ctx.lineTo(.305,-.3);
        ctx.moveTo(.29,-.3);ctx.lineTo(.29,-.26);ctx.stroke();
      }
      ctx.restore();
      return;
    }
  }
  if(item.type==="exit"){
    ctx.fillRect(-.27,-.93,.54,.84);
    ctx.strokeRect(-.27,-.93,.54,.84);
    ctx.fillStyle=ink;ctx.fillRect(-.17,-.83,.34,.67);
    ctx.fillStyle="rgba(14,19,24,.75)";ctx.fillRect(-.115,-.76,.23,.6);
  }else{
    ctx.beginPath();ctx.ellipse(0,-.52,.31,.34,0,0,Math.PI*2);
    ctx.fill();ctx.stroke();
    ctx.strokeStyle=ink;ctx.fillStyle=ink;ctx.lineWidth=.052;
    if(item.type==="map"){
      ctx.strokeRect(-.19,-.69,.38,.31);
      ctx.beginPath();ctx.moveTo(-.06,-.69);ctx.lineTo(-.06,-.38);
      ctx.moveTo(.08,-.69);ctx.lineTo(.08,-.38);ctx.stroke();
    }else if(item.type==="info"){
      if(item.isKey){
        ctx.beginPath();ctx.arc(-.085,-.55,.083,0,Math.PI*2);
        ctx.moveTo(-.01,-.55);ctx.lineTo(.2,-.55);
        ctx.moveTo(.13,-.55);ctx.lineTo(.13,-.43);ctx.stroke();
      }else{
        ctx.strokeRect(-.2,-.66,.4,.29);
        ctx.beginPath();ctx.moveTo(-.2,-.65);ctx.lineTo(0,-.49);
        ctx.lineTo(.2,-.65);ctx.stroke();
      }
    }else if(item.type==="riddle"){
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.font="bold .53px sans-serif";ctx.fillText("?",0,-.53);
    }else if(item.type==="secret_passage"){
      ctx.beginPath();ctx.arc(0,-.52,.19,-Math.PI*.25,Math.PI*1.2);
      ctx.lineTo(-.13,-.39);ctx.stroke();
      ctx.beginPath();ctx.arc(0,-.52,.075,0,Math.PI*2);ctx.fill();
    }else if(item.type.startsWith("timer_")){
      ctx.beginPath();ctx.moveTo(-.14,-.72);ctx.lineTo(.14,-.72);
      ctx.lineTo(-.11,-.36);ctx.lineTo(.11,-.36);ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.moveTo(-.11,-.39);ctx.lineTo(.11,-.39);
      ctx.lineTo(0,-.49);ctx.closePath();ctx.fill();
      if(hazard){ctx.beginPath();ctx.moveTo(-.1,-.68);ctx.lineTo(.1,-.68);
        ctx.lineTo(0,-.59);ctx.closePath();ctx.fill();}
    }else if(item.type.startsWith("speed_")){
      for(const cx of [-.11,.09]){
        ctx.beginPath();
        if(hazard){ctx.moveTo(cx+.08,-.7);ctx.lineTo(cx-.035,-.52);
          ctx.lineTo(cx+.08,-.35);}
        else{ctx.moveTo(cx-.08,-.7);ctx.lineTo(cx+.035,-.52);
          ctx.lineTo(cx-.08,-.35);}
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

export function renderScene(ctx,maze,player,{stereo=false,pitch=0,photoResolver=null}={}) {
  if(!ctx)return;
  const canvas=ctx.canvas,{width:w,height:h}=canvas;
  const color=THEMATIC[maze.data.theme]??THEMATIC.marble_maze;
  const views=stereo?2:1;
  const walls=createWallIndex(maze,player.keys);
  const lateral=player.heading+Math.PI/2;
  // Looking upward lowers the apparent horizon, without changing gameplay.
  const horizon=h/2+clamp(Math.tan(pitch),-1,1)*h*.38;
  ctx.fillStyle=color.sky;ctx.fillRect(0,0,w,horizon);
  ctx.fillStyle=color.floor;ctx.fillRect(0,horizon,w,h-horizon);
  for(let eye=0;eye<views;eye++){
    const left=eye*(w/views),vw=w/views,eyeOffset=stereo?(eye===0?-0.022:0.022):0;
    ctx.save();ctx.beginPath();ctx.rect(left,0,vw,h);ctx.clip();
    const beamStep=2;
    const fov=stereo?1.05:1.15;
    // Lightweight floor-hole silhouettes, hidden behind the wall columns
    // painted afterward. This is a provisional effect, not original art.
    for(const hole of maze.repropagation?.physicalHoles??[]){
      const dx=Number(hole.position?.[0])+.5-player.x-
        Math.cos(lateral)*eyeOffset;
      const dz=Number(hole.position?.[2])+.5-player.z-
        Math.sin(lateral)*eyeOffset;
      if(!Number.isFinite(dx)||!Number.isFinite(dz))continue;
      const forward=dx*Math.cos(player.heading)+dz*Math.sin(player.heading);
      const sideways=-dx*Math.sin(player.heading)+dz*Math.cos(player.heading);
      if(forward<.35||forward>19||
          Math.abs(sideways)>forward*1.8)continue;
      const sx=left+vw/2+(sideways/forward)*vw/(2*Math.tan(fov/2));
      const sy=horizon+h*.39/forward;
      const rx=Math.min(vw*.4,h*.18/forward),ry=rx*.31;
      if(sy>h+ry||sx<left-rx||sx>left+vw+rx)continue;
      ctx.beginPath();ctx.ellipse(sx,sy,rx,ry,0,0,Math.PI*2);
      ctx.fillStyle="#101011";ctx.fill();
      ctx.strokeStyle="rgba(238,183,104,.35)";
      ctx.lineWidth=Math.max(1,w/1000);ctx.stroke();
    }
    for(let px=0;px<vw;px+=beamStep){
      const screen=px/vw*2-1;
      const angle=player.heading+Math.atan(screen*Math.tan(fov/2));
      const ox=player.x+Math.cos(lateral)*eyeOffset,oz=player.z+Math.sin(lateral)*eyeOffset;
      const hit=castRay(maze,ox,oz,angle,28,walls);
      if(!hit)continue;
      const corrected=hit.distance*Math.cos(angle-player.heading);
      const wallHeight=Math.min(h*4,(h*.86)/Math.max(.08,corrected));
      const top=horizon-wallHeight/2;
      ctx.fillStyle=color.wall;ctx.globalAlpha=clamp(1-hit.distance/39,.37,1)*(hit.side===0?1:.8);
      ctx.fillRect(left+px,top,beamStep+1,wallHeight);
      ctx.globalAlpha=1;
      ctx.fillStyle=color.mortar;
      ctx.globalAlpha=clamp((hit.distance/12)*.36,.1,.28);
      if(hit.texture<.06||hit.texture>.94)ctx.fillRect(left+px,top,beamStep+1,wallHeight);
      ctx.globalAlpha=1;
      if(hit.kind==="gate"){
        ctx.fillStyle=color.accent;ctx.globalAlpha=.55;
        ctx.fillRect(left+px,top,beamStep+1,wallHeight);ctx.globalAlpha=1;
      }
    }

    // Native interaction tiles now have visible objects in the 3D scene.
    for(const item of sceneLandmarks(maze,player,{eyeOffset,fov,wallIndex:walls})){
      const sx=left+(item.screenX+1)*vw/2;
      const groundY=horizon+h*.31/Math.max(item.forward,.35);
      drawSceneLandmark(ctx,item,sx,groundY,h,color,photoResolver);
    }

    // First-person shadow sprites share the camera and raycast wall occlusion.
    for(const actor of player.shadows??[]) {
      const ox=player.x+Math.cos(lateral)*eyeOffset;
      const oz=player.z+Math.sin(lateral)*eyeOffset;
      const dx=actor.x-ox,dz=actor.z-oz;
      const forward=dx*Math.cos(player.heading)+dz*Math.sin(player.heading);
      const sideways=-dx*Math.sin(player.heading)+dz*Math.cos(player.heading);
      if(forward<=.16||forward>16)continue;
      const distance=Math.hypot(dx,dz);
      const obstruction=castRay(maze,ox,oz,Math.atan2(dz,dx),distance,walls);
      if(obstruction&&obstruction.distance<distance-.22)continue;
      const sx=left+vw/2+(sideways/forward)*vw/(2*Math.tan(fov/2));
      const height=Math.min(h*1.5,h*.78/Math.max(forward,.35));
      if(sx<left-height||sx>left+vw+height)continue;
      const baseY=horizon+h*.31/Math.max(forward,.35);
      ctx.save();
      ctx.globalAlpha=.92;ctx.fillStyle="#181b28";
      ctx.beginPath();ctx.ellipse(sx,baseY-height*.46,height*.26,
        height*.48,0,0,2*Math.PI);ctx.fill();
      ctx.globalAlpha=.95;ctx.fillStyle=color.accent;
      const eye=Math.max(1.3,height*.045);
      ctx.fillRect(sx-height*.105,baseY-height*.58,eye,eye);
      ctx.fillRect(sx+height*.06,baseY-height*.58,eye,eye);
      ctx.restore();
    }
    ctx.restore();
  }
  if(stereo){ctx.fillStyle="#101820";ctx.fillRect(w/2-1,0,2,h);}
  // Central gaze reticle is deliberately restrained.
  ctx.strokeStyle="rgba(255,255,255,.78)";
  ctx.lineWidth=Math.max(1,canvas.width/750);
  for(let eye=0;eye<views;eye++){
    const center=(eye+.5)*(w/views);
    ctx.beginPath();ctx.moveTo(center-7,h/2);ctx.lineTo(center+7,h/2);
    ctx.moveTo(center,h/2-7);ctx.lineTo(center,h/2+7);ctx.stroke();
  }
}
