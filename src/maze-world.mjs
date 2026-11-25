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
  const allowed=new Set(["variant","text","message","audioPath","photoPath","riddle","info"]);
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

/** Deterministic original-format *new* sample; not a copied Seedling level. */
export function sampleMaze() {
  let maze=newMaze("Practice maze");
  const obstacles=[];
  for(let z=3;z<=14;z++)if(z!==7)obstacles.push([5,z]);
  for(let z=2;z<=14;z++)if(z!==12)obstacles.push([11,z]);
  for(let x=5;x<=11;x++)if(x!==8)obstacles.push([x,10]);
  for(const [x,z] of obstacles)maze=paintTile(maze,x,z,"wall");
  maze=paintTile(maze,2,2,"map");
  maze=paintTile(maze,4,7,"speed_powerup");
  maze=paintTile(maze,9,12,"timer_powerup");
  if(!findRoute(maze))throw new Error("Practice maze must be solvable");
  return maze;
}
