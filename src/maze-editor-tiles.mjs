import {parseMaze} from "./maze-document.mjs";
import {paintTile} from "./maze-world.mjs";

/**
 * Physical holes are reconstruction annotations, not native Seedling tiles.
 * Editing them must never discard user-created or imported original cells.
 */
const sameSquare=(position,x,z)=>
  Number(position?.[0])===x&&Number(position?.[2])===z;
export function hasPhysicalHole(maze,x,z) {
  return Array.isArray(maze?.repropagation?.physicalHoles)&&
    maze.repropagation.physicalHoles.some(item=>sameSquare(item.position,x,z));
}

export function editBoardTile(source,x,z,type) {
  const maze=parseMaze(source);
  const width=Number(maze.data.scale[0]),height=Number(maze.data.scale[2]);
  if(!Number.isInteger(x)||!Number.isInteger(z)||
      x<0||z<0||x>=width||z>=height)
    throw new RangeError("Tile outside maze");
  const physical=maze.repropagation?.physicalHoles;
  if(physical!==undefined&&!Array.isArray(physical))
    throw new TypeError("Physical hole annotations are malformed");
  const holes=physical??[];
  const hasHole=hasPhysicalHole(maze,x,z);
  if(type==="hole") {
    if(hasHole)return maze;
    if(maze.data.cells.some(cell=>sameSquare(cell.position,x,z)&&
        !["floor","empty"].includes(cell.type)))
      throw new Error("This square contains a tile. Erase or move it before adding a hole.");
    maze.repropagation={...maze.repropagation,physicalHoles:[
      ...holes,{position:[String(x),"0",String(z)],
        kind:"physical_floor_hole",source:"manual_editor"}]};
    return maze;
  }
  if(type==="empty"&&hasHole) {
    // First Erase removes only the trap; a second may remove the native floor.
    maze.repropagation={...maze.repropagation,
      physicalHoles:holes.filter(item=>!sameSquare(item.position,x,z))};
    return maze;
  }
  if(hasHole)
    throw new Error("Erase this physical hole before placing a tile.");
  if(type==="entrance"||type==="exit") {
    const opposite=type==="entrance"?"exit":"entrance";
    if(maze.data.cells.some(cell=>sameSquare(cell.position,x,z)&&
        cell.type===opposite))
      throw new Error("Start and Finish must occupy different squares.");
    maze.data.cells=maze.data.cells.filter(cell=>
      cell.type!==type||sameSquare(cell.position,x,z));
  }
  return paintTile(maze,x,z,type);
}
