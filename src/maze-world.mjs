import {parseMaze, validateMaze} from "./maze-document.mjs";

export const SIZE = 18;
export const TILE_NAMES = Object.freeze({
  wall:"Wall", floor:"Floor", empty:"Empty", entrance:"Start",
  exit:"Finish", gate:"Gate", info:"Message", map:"Map",
  riddle:"Riddle", secret_passage:"Secret passage", shadow:"Shadow",
  speed_hazard:"Slowdown", speed_powerup:"Speed boost",
  timer_hazard:"Time penalty", timer_powerup:"Extra time"
});

const clone = value => JSON.parse(JSON.stringify(value));
const isValid = (x,z,maze) => Number.isInteger(x) && Number.isInteger(z) &&
  x >= 0 && z >= 0 && x < Number(maze.data.scale[0]) &&
  z < Number(maze.data.scale[2]);
const pos = (x,z) => [String(x),"0",String(z)];
export const cellCoordinates = cell => [Number(cell.position[0]),Number(cell.position[2])];
const priority = kind => ({entrance:40,exit:40,wall:30,gate:29,shadow:22,secret_passage:22,floor:0})[kind] ?? 15;

export function newMaze(name="My Maze", theme="marble_maze") {
  return {
    source:"repropagation", uniqueIdentifier:globalThis.crypto?.randomUUID?.() ?? "new-maze",
    version:"1", name,
    options:{add_borders:"true",fill_floors:"true",music_enabled:"true",sound_enabled:"true"},
    data:{scale:[String(SIZE),"1",String(SIZE)],duration:"300.0",theme,
      player_avatars:{}, cells:[
        {position:pos(1,1),type:"entrance"},
        {position:pos(SIZE-2,SIZE-2),type:"exit"}
      ]}
  };
}

/** No mutation. Returns all objects on one tile; imported overlapping objects survive. */
export function cellsAt(maze,x,z) {
  validateMaze(maze);
  if (!isValid(x,z,maze)) return [];
  return maze.data.cells
    .map((cell,index)=>({cell,index}))
    .filter(({cell})=>Number(cell.position[0])===x && Number(cell.position[2])===z)
    .sort((a,b)=>priority(b.cell.type)-priority(a.cell.type)||b.index-a.index);
}

export function primaryCell(maze,x,z) {
  return cellsAt(maze,x,z)[0] ?? null;
}

function preservePosition(original,x,z) {
  const coordinateTypes=original?.position?.map(value=>typeof value)??["string","string","string"];
  const values=[x,0,z];
  return values.map((value,i)=>coordinateTypes[i]==="number"?value:String(value));
}

/** Editing the visible layer preserves other original entries at the same position. */
export function paintTile(source,x,z,type,variant) {
  const maze=parseMaze(source);
  if (!isValid(x,z,maze)) throw new RangeError("Tile outside maze");
  if (!(type in TILE_NAMES)) throw new TypeError("Unknown tile type");
  const original=primaryCell(maze,x,z);
  const index=original?.index??-1;
  const old=original?.cell;
  if (type==="empty") {
    if (index>=0) maze.data.cells.splice(index,1);
    return maze;
  }
  const sameType=old?.type===type;
  const next=sameType?{...old}:{type,position:preservePosition(old,x,z)};
  if (variant!==undefined && variant!==null && variant!=="") next.variant=String(variant);
  if (index>=0) maze.data.cells.splice(index,1,next);
  else maze.data.cells.push(next);
  return maze;
}

/**
 * Move or duplicate exactly the topmost editable cell. Never silently overwrite
 * another cell or rewrite the original imported document's other layers.
 * Physical floor holes are independent annotations, not ordinary cells.
 */
export function transferTile(source,fromX,fromZ,toX,toZ,{copy=false}={}) {
  const maze=parseMaze(source);
  if(!isValid(fromX,fromZ,maze)||!isValid(toX,toZ,maze))
    throw new RangeError("Tile position is outside the maze");
  const original=primaryCell(maze,fromX,fromZ);
  if(!original)throw new Error("There is no tile to move or copy");
  if(fromX===toX&&fromZ===toZ)
    throw new Error("Choose a different destination square");
  if(primaryCell(maze,toX,toZ))
    throw new Error("That square already contains a tile");
  if((maze.repropagation?.physicalHoles??[]).some(item=>
    Number(item.position?.[0])===toX&&Number(item.position?.[2])===toZ))
    throw new Error("That square contains a physical hole");
  if(copy&&["entrance","exit"].includes(original.cell.type))
    throw new Error("Start and Finish cannot be duplicated");
  const moved=clone(original.cell);
  moved.position=preservePosition(original.cell,toX,toZ);
  if(!copy)maze.data.cells.splice(original.index,1);
  maze.data.cells.push(moved);
  return maze;
}

export function eraseAt(source,x,z) {
  return paintTile(source,x,z,"empty");
}

export function changeCellDetails(source,x,z,updates) {
  const maze=parseMaze(source);
  const selected=primaryCell(maze,x,z);
  if (!selected) throw new Error("Nothing at that location");
  const allowed=new Set(["variant","text","message","audioPath","photoPath","riddle","info","repropagation"]);
  for (const key of Object.keys(updates)) {
    if (!allowed.has(key)) throw new TypeError("Unsupported detail: "+key);
  }
  maze.data.cells[selected.index]={...selected.cell,...clone(updates)};
  return maze;
}

export function locate(maze,type) {
  return maze.data.cells.filter(c=>c.type===type).map(c=>cellCoordinates(c));
}
export function passable(maze,x,z,keys=[]) {
  if (!isValid(x,z,maze)) return false;
  const occupants=cellsAt(maze,x,z).map(o=>o.cell);
  return !occupants.some(c=>c.type==="wall" || (c.type==="gate"&&!keys.includes(String(c.variant??"0"))));
}
const neighbors=([x,z])=>[[x+1,z],[x-1,z],[x,z+1],[x,z-1]];
const coordKey=([x,z])=>x+","+z;

/**
 * Shortest four-direction route from first entrance to first exit.
 * It deliberately ignores collectible keys and teleport rules: results are
 * conservative topological diagnostics, not a verdict on the original game.
 */
export function findRoute(maze, keys=[]) {
  const start=locate(maze,"entrance")[0], end=locate(maze,"exit")[0];
  if (!start || !end) return null;
  const queue=[start], seen=new Map([[coordKey(start),null]]);
  for(let head=0;head<queue.length;head++){
    const at=queue[head], key=coordKey(at);
    if (key===coordKey(end)) {
      const route=[];
      for(let here=key;here!==null;here=seen.get(here)) route.push(here.split(",").map(Number));
      return route.reverse();
    }
    for(const next of neighbors(at)){
      const nk=coordKey(next);
      if (seen.has(nk)||!passable(maze,next[0],next[1],keys)) continue;
      seen.set(nk,key);queue.push(next);
    }
  }
  return null;
}

export function examineMaze(maze) {
  const start=locate(maze,"entrance");
  const finish=locate(maze,"exit");
  const duplicates=new Map();
  for(const cell of maze.data.cells){
    const key=coordKey(cellCoordinates(cell));
    duplicates.set(key,(duplicates.get(key)??0)+1);
  }
  const route=findRoute(maze);
  return {
    width:Number(maze.data.scale[0]),height:Number(maze.data.scale[2]),
    startCount:start.length,finishCount:finish.length,
    overlappingTiles:[...duplicates].filter(([,count])=>count>1).length,
    hasRoute:!!route,shortestSteps:route?route.length-1:null
  };
}

/**
 * Eight independently generated training mazes in four recovered environment
 * identifiers, NOT reproductions of the original bundled levels. Stable seeds
 * make layouts reproducible without distributing proprietary maze documents.
 */
export function sampleMaze(theme="marble_maze",difficulty="practice") {
  const designs={
    adventure:{label:"Temple",seed:0x06ab37c1,waypoints:[[15,1],[15,15]]},
    hedge:{label:"Garden",seed:0x06ab37c2,waypoints:[[1,15],[15,15]]},
    marble_maze:{label:"Workshop",seed:0x06ab37c3,
      waypoints:[[7,1],[7,9],[15,9],[15,15]]},
    space:{label:"Starship",seed:0x06ab37c4,
      waypoints:[[1,7],[11,7],[11,15],[15,15]]}
  };
  if(!Object.hasOwn(designs,theme))throw new RangeError("Unknown practice environment");
  if(!["practice","challenge"].includes(difficulty))
    throw new RangeError("Unknown practice difficulty");
  const design=designs[theme],challenge=difficulty==="challenge";
  let seed=(design.seed^(challenge?0x9e3779b9:0))>>>0;
  const random=()=>{
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    return (seed>>>0)/4294967296;
  };
  const point=(x,z)=>x+","+z;
  const open=new Set([point(1,1)]),visited=new Set(open);
  const stack=[[1,1]];
  // A spanning-tree maze on an 8x8 node lattice. Connecting squares are
  // individual 18x18 document cells; Challenge has a unique route to Finish.
  while(stack.length){
    const [x,z]=stack[stack.length-1],options=[];
    for(const [dx,dz] of [[2,0],[-2,0],[0,2],[0,-2]]){
      const nx=x+dx,nz=z+dz;
      if(nx>=1&&nx<=15&&nz>=1&&nz<=15&&!visited.has(point(nx,nz)))
        options.push([nx,nz,dx/2,dz/2]);
    }
    if(!options.length){stack.pop();continue;}
    const [nx,nz,mx,mz]=options[Math.floor(random()*options.length)];
    open.add(point(x+mx,z+mz));open.add(point(nx,nz));
    visited.add(point(nx,nz));stack.push([nx,nz]);
  }
  if(!challenge){
    // Short, theme-dependent route plus loops and explorable side corridors.
    let x=1,z=1;
    for(const [targetX,targetZ] of design.waypoints){
      while(x!==targetX||z!==targetZ){
        x+=Math.sign(targetX-x);z+=Math.sign(targetZ-z);
        open.add(point(x,z));
      }
    }
    for(let i=0;i<18;i++){
      const x=1+2*Math.floor(random()*8),z=1+2*Math.floor(random()*8);
      const [dx,dz]=random()<.5?[1,0]:[0,1];
      if(x+2*dx<=15&&z+2*dz<=15)open.add(point(x+dx,z+dz));
    }
  }
  // Derive safe, separated interaction positions from the actual shortest
  // path rather than assigning arbitrary cells that might be inside walls.
  const queue=[[1,1]],parents=new Map([[point(1,1),null]]);
  for(let i=0;i<queue.length;i++){
    const [x,z]=queue[i],here=point(x,z);
    if(here===point(15,15))break;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,nz=z+dz,key=point(nx,nz);
      if(!open.has(key)||parents.has(key))continue;
      parents.set(key,here);queue.push([nx,nz]);
    }
  }
  if(!parents.has(point(15,15)))throw new Error("Training maze generation failed");
  const route=[];
  for(let here=point(15,15);here!==null;here=parents.get(here))
    route.push(here.split(",").map(Number));
  route.reverse();
  const cells=[{position:pos(1,1),type:"entrance"},
    {position:pos(15,15),type:"exit"}];
  for(let z=0;z<SIZE;z++)for(let x=0;x<SIZE;x++)
    if(!open.has(point(x,z)))
      cells.push({position:pos(x,z),type:"wall",variant:"0"});
  const place=(fraction,type,properties={})=>{
    const [x,z]=route[Math.round((route.length-1)*fraction)];
    cells.push({position:pos(x,z),type,...properties});
  };
  if(challenge){
    const keyId="training-"+theme;
    place(.24,"info",{text:"A key for the locked door ahead.",
      repropagation:{keyId}});
    place(.43,"map");
    place(.55,"timer_powerup");
    place(.68,"gate",{variant:keyId});
    place(.84,"speed_hazard");
  }else{
    place(.22,"map");
    place(.45,"speed_powerup");
    place(.72,"timer_powerup");
  }
  const maze=newMaze(design.label+" - "+(challenge?"Challenge":"Practice"),theme);
  maze.data.cells=cells;
  return maze;
}
