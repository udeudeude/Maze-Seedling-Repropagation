/**
 * Separate, prediction-free labels for evaluating one photographed paper maze.
 *
 * This is a reconstruction research control, NOT an original Seedling feature.
 * An annotator starts with an empty reference and only sees the photograph and
 * manually aligned grid. Predicted cells and detector centers never enter it.
 * In-memory only: no photo, annotation, or original maze data is persisted.
 */

export function newPhotoReference(){
  return {walls:new Set(),holes:new Map(),markers:new Map()};
}

export function editPhotoReference(reference,{mode,x,z,markerBrush="entrance",
    width,height,columns,rows,cx,cy}={}){
  if(!reference||!(reference.walls instanceof Set)||
      !(reference.holes instanceof Map)||!(reference.markers instanceof Map)||
      !Number.isInteger(x)||!Number.isInteger(z)||
      !Number.isInteger(columns)||!Number.isInteger(rows)||
      x<0||z<0||x>=columns||z>=rows||
      !["walls","holes","markers"].includes(mode))
    throw new TypeError("Expected a valid independently labeled photograph square");
  const updated={
    walls:new Set(reference.walls),
    holes:new Map(reference.holes),
    markers:new Map(reference.markers)
  };
  const key=x+","+z;
  if(mode==="walls"){
    if(updated.walls.has(key))updated.walls.delete(key);
    else updated.walls.add(key);
  }else if(mode==="holes"){
    if(updated.holes.has(key))updated.holes.delete(key);
    else {
      if(!Number.isFinite(cx)||!Number.isFinite(cy)||
          !Number.isInteger(width)||!Number.isInteger(height)||
          cx<0||cy<0||cx>=width||cy>=height||
          Math.floor(cx*columns/width)!==x||
          Math.floor(cy*rows/height)!==z)
        throw new TypeError("Hole reference requires a tapped photo center inside its square");
      updated.holes.set(key,{x,z,cx,cy,radius:Math.min(width/columns,height/rows)*.3});
    }
  }else{
    if(!["entrance","exit"].includes(markerBrush))
      throw new TypeError("Unknown original start/finish marker");
    updated.markers.set(markerBrush,{type:markerBrush,x,z});
  }
  return updated;
}

export function photoReferenceLabels(reference){
  if(!reference||!(reference.walls instanceof Set)||
      !(reference.holes instanceof Map)||!(reference.markers instanceof Map))
    throw new TypeError("Expected independent reference labels");
  return {
    walls:[...reference.walls].map(key=>{
      const [x,z]=key.split(",").map(Number);
      return {x,z};
    }),
    holes:[...reference.holes.values()].map(({x,z,cx,cy})=>({x,z,cx,cy})),
    markers:[...reference.markers.values()].map(({type,x,z})=>({type,x,z}))
  };
}
