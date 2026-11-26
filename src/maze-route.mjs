import {validateMaze} from "./maze-document.mjs";
import {keyPickupId} from "./maze-play.mjs";

/**
 * A finite-state route check for the reconstructed game rules. Unlike a
 * topological flood fill, this follows collectible keys and the pair-only
 * secret passage behavior used by Explore. Never edits the maze document.
 * Timers, running speed, riddles and moving shadows are deliberately outside
 * this possibility check; the result is not a guaranteed winning run.
 */
export function findPlayableRoute(maze,{maxStates=50000,maxKeyTypes=24}={}) {
  validateMaze(maze);
  const width=Number(maze.data.scale[0]),height=Number(maze.data.scale[2]);
  const inside=(x,z)=>Number.isInteger(x)&&Number.isInteger(z)&&
    x>=0&&z>=0&&x<width&&z<height;
  const at=(x,z)=>x+","+z;
  const priority=type=>({entrance:40,exit:40,wall:30,gate:29,
    shadow:22,secret_passage:22,floor:0})[type]??15;
  const board=new Map(),passages=new Map(),gateIds=new Set();
  const starts=[],finishes=[];
  maze.data.cells.forEach((cell,index)=>{
    const x=Number(cell.position[0]),z=Number(cell.position[2]);
    if(!inside(x,z))return;
    const position=at(x,z),rank=priority(cell.type);
    let square=board.get(position);
    if(!square) {
      square={cells:[],primary:null,rank:-Infinity,index:-1};
      board.set(position,square);
    }
    square.cells.push(cell);
    if(rank>square.rank||(rank===square.rank&&index>=square.index)){
      square.primary=cell;square.rank=rank;square.index=index;
    }
    if(cell.type==="entrance")starts.push([x,z]);
    if(cell.type==="exit")finishes.push([x,z]);
    if(cell.type==="gate")gateIds.add(String(cell.variant??"0"));
    if(cell.type==="secret_passage"){
      const id=String(cell.variant??"").trim();
      if(id) {
        const positions=passages.get(id)??[];
        positions.push([x,z]);
        passages.set(id,positions);
      }
    }
  });
  if(starts.length!==1||finishes.length!==1)
    return {status:"invalid",reason:"Exactly one Start and Finish are required"};
  if(gateIds.size>maxKeyTypes)
    return {status:"indeterminate",reason:"Too many distinct gate keys to check safely"};
  const bits=new Map([...gateIds].map((id,index)=>[id,1n<<BigInt(index)]));
  const holes=new Set((maze.repropagation?.physicalHoles??[])
    .map(item=>[Number(item.position?.[0]),Number(item.position?.[2])])
    .filter(([x,z])=>inside(x,z)).map(([x,z])=>at(x,z)));
  const passable=(x,z,mask)=>{
    if(!inside(x,z))return false;
    const position=at(x,z);
    if(holes.has(position))return false;
    return !(board.get(position)?.cells??[]).some(cell=>
      cell.type==="wall"||
      (cell.type==="gate"&&!(mask&(bits.get(String(cell.variant??"0"))??0n))));
  };
  const [startX,startZ]=starts[0],end=at(...finishes[0]);
  if(!passable(startX,startZ,0n))
    return {status:"blocked",reason:"The Start is blocked or contains a physical hole"};
  const initial={x:startX,z:startZ,mask:0n,latch:null,parent:-1,teleport:false};
  const queue=[initial],seen=new Set([at(startX,startZ)+"|0|"]);
  const steps=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let head=0;head<queue.length;head++){
    const current=queue[head],position=at(current.x,current.z);
    if(position===end){
      const trace=[];
      let index=head;
      while(index>=0){
        const node=queue[index];
        trace.push(node);
        index=node.parent;
      }
      trace.reverse();
      const keys=[...bits].filter(([,bit])=>Boolean(current.mask&bit)).map(([id])=>id);
      return {status:"reachable",route:trace.map(node=>[node.x,node.z]),
        moves:trace.length-1,keys,passages:trace.filter(node=>node.teleport).length};
    }
    for(const [dx,dz] of steps){
      let x=current.x+dx,z=current.z+dz,mask=current.mask;
      if(!passable(x,z,mask))continue;
      let latch=null,teleport=false;
      const arrival=at(x,z),square=board.get(arrival)?.primary;
      if(square?.type==="info"){
        const keyId=keyPickupId(square),bit=bits.get(keyId);
        if(bit)mask|=bit;
      }
      if(square?.type==="secret_passage"){
        const id=String(square.variant??"").trim();
        const partners=passages.get(id)??[];
        // As in Explore, exactly two matching passages are needed.
        if(id&&partners.length===2){
          const target=partners.find(([px,pz])=>px!==x||pz!==z);
          if(target&&passable(target[0],target[1],mask)){
            [x,z]=target;
            latch=at(x,z);
            teleport=true;
          }
        }
      }
      const label=at(x,z)+"|"+mask.toString(36)+"|"+(latch??"");
      if(seen.has(label))continue;
      seen.add(label);
      queue.push({x,z,mask,latch,parent:head,teleport});
      if(queue.length>maxStates)
        return {status:"indeterminate",reason:"The route search reached its complexity limit"};
    }
  }
  return {status:"blocked",reason:"No route survives walls, gates, holes and passage rules"};
}
