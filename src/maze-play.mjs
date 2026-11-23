import {cellCoordinates, locate, primaryCell, passable} from "./maze-world.mjs";

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
    ended:false,won:false,visited:[],message:"Find the exit.",keys:[],boostUntil:0};
}
export function rotatePlayer(state,delta) {
  return {...state,heading:(state.heading+delta+Math.PI*8)%(Math.PI*2)};
}
export function movePlayer(maze,state,forward,strafe=0) {
  if(state.ended)return state;
  const speed=state.boostUntil>0?0.35:0.24;
  const dx=Math.cos(state.heading)*forward*speed+
    Math.cos(state.heading+Math.PI/2)*strafe*speed;
  const dz=Math.sin(state.heading)*forward*speed+
    Math.sin(state.heading+Math.PI/2)*strafe*speed;
  let x=state.x,z=state.z;
  const cushion=0.19;
  const free=(x,z)=>passable(maze,Math.floor(x),Math.floor(z),state.keys);
  if(free(x+dx+Math.sign(dx)*cushion,z) && free(x+dx+Math.sign(dx)*cushion,z+cushion)
    && free(x+dx+Math.sign(dx)*cushion,z-cushion))x+=dx;
  if(free(x,z+dz+Math.sign(dz)*cushion) && free(x+cushion,z+dz+Math.sign(dz)*cushion)
    && free(x-cushion,z+dz+Math.sign(dz)*cushion))z+=dz;
  const next={...state,x,z};
  return collectAt(maze,next);
}
export function collectAt(maze,state) {
  const x=Math.floor(state.x),z=Math.floor(state.z),key=x+","+z;
  if(state.visited.includes(key))return state;
  const cell=primaryCell(maze,x,z)?.cell;
  if(!cell)return state;
  const next={...state,visited:[...state.visited,key]};
  if(cell.type==="exit")return {...next,ended:true,won:true,message:"Maze completed!"};
  if(cell.type==="timer_powerup")return {...next,remaining:next.remaining+30,message:"+30 seconds"};
  if(cell.type==="timer_hazard")return {...next,remaining:Math.max(0,next.remaining-30),message:"−30 seconds"};
  if(cell.type==="speed_powerup")return {...next,boostUntil:25,message:"Speed boost"};
  if(cell.type==="speed_hazard")return {...next,boostUntil:0,message:"Speed boost lost"};
  if(cell.type==="shadow")return {...next,ended:true,won:false,message:"A shadow caught you"};
  if(cell.type==="info")return {...next,message:cell.text??cell.message??"A message"};
  if(cell.type==="riddle")return {...next,message:"Riddle ahead. Open the map to inspect it."};
  if(cell.type==="gate")return {...next,message:"Gate"};
  if(cell.type==="map")return {...next,message:"Map discovered"};
  if(cell.type==="secret_passage")return {...next,message:"Secret passage"};
  return next;
}
export function tickPlayer(state,seconds) {
  if(state.ended||seconds<=0)return state;
  const remaining=Math.max(0,state.remaining-seconds);
  return {...state,remaining,boostUntil:Math.max(0,state.boostUntil-seconds),
    ended:remaining===0,won:false,message:remaining===0?"Time is up":state.message};
}
export function castRay(maze,x,z,heading,maxDistance=28) {
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
    if(!passable(maze,cellX,cellZ)) {
      const contents=primaryCell(maze,cellX,cellZ)?.cell;
      const face=side===0?z+dist*dz:x+dist*dx;
      return {distance:Math.max(0.015,dist),cellX,cellZ,side,texture:face-Math.floor(face),kind:contents?.type??"wall"};
    }
  }
  return null;
}
export function renderScene(ctx,maze,player,{stereo=false}={}) {
  if(!ctx)return;
  const canvas=ctx.canvas,{width:w,height:h}=canvas;
  const color=THEMATIC[maze.data.theme]??THEMATIC.marble_maze;
  const views=stereo?2:1;
  ctx.fillStyle=color.sky;ctx.fillRect(0,0,w,h/2);
  ctx.fillStyle=color.floor;ctx.fillRect(0,h/2,w,h/2);
  for(let eye=0;eye<views;eye++){
    const left=eye*(w/views),vw=w/views,eyeOffset=stereo?(eye===0?-0.022:0.022):0;
    ctx.save();ctx.beginPath();ctx.rect(left,0,vw,h);ctx.clip();
    const beamStep=2;
    const fov=stereo?1.05:1.15;
    for(let px=0;px<vw;px+=beamStep){
      const screen=px/vw*2-1;
      const angle=player.heading+Math.atan(screen*Math.tan(fov/2));
      const side=player.heading+Math.PI/2;
      const ox=player.x+Math.cos(side)*eyeOffset,oz=player.z+Math.sin(side)*eyeOffset;
      const hit=castRay(maze,ox,oz,angle);
      if(!hit)continue;
      const corrected=hit.distance*Math.cos(angle-player.heading);
      const wallHeight=Math.min(h*4,(h*.86)/Math.max(.08,corrected));
      const top=(h-wallHeight)/2;
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
