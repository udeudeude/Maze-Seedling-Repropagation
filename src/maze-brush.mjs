/**
 * Grid-space line rasterization for drag painting. Browser pointermove events
 * are not delivered at each cell, especially on mobile devices.
 * This interpolation never changes a source maze document.
 */
export function strokeBetween(from,to,columns,rows) {
  if(!Number.isSafeInteger(columns)||!Number.isSafeInteger(rows)||columns<1||rows<1)
    throw new RangeError("Board dimensions must be positive safe integers");
  const valid=point=>Array.isArray(point)&&point.length===2&&
    Number.isSafeInteger(point[0])&&Number.isSafeInteger(point[1])&&
    point[0]>=0&&point[0]<columns&&point[1]>=0&&point[1]<rows;
  if(!valid(from)||!valid(to))throw new RangeError("Stroke endpoint outside board");
  let [x,z]=from;
  const [targetX,targetZ]=to;
  const dx=Math.abs(targetX-x),dz=Math.abs(targetZ-z);
  const stepX=x<targetX?1:-1,stepZ=z<targetZ?1:-1;
  let error=dx-dz;
  const visited=[];
  while(true) {
    visited.push([x,z]);
    if(x===targetX&&z===targetZ)break;
    const doubled=2*error;
    if(doubled>-dz){error-=dz;x+=stepX;}
    if(doubled<dx){error+=dx;z+=stepZ;}
  }
  return visited;
}
