/**
 * Compare raw photographic suggestions to an independently reviewed tracing.
 *
 * This deliberately measures exact cell agreement, not image similarity or
 * the original Seedling scanner's accuracy. The caller must confirm that the
 * review is complete before describing the corrected labels as a reference.
 * No photograph, coordinates or maze document are stored or transmitted.
 */
function cells(entries,columns,rows,type=null) {
  if(!Array.isArray(entries))throw new TypeError("Expected candidate arrays");
  const result=new Set();
  for(const item of entries){
    if(!item||type!==null&&item.type!==type)continue;
    const {x,z}=item;
    if(!Number.isInteger(x)||!Number.isInteger(z)||
       x<0||x>=columns||z<0||z>=rows)continue;
    result.add(x+","+z);
  }
  return result;
}
function measure(suggestions,reference) {
  let matches=0;
  for(const key of suggestions)if(reference.has(key))matches++;
  const falseAlarms=suggestions.size-matches,misses=reference.size-matches;
  return {matches,falseAlarms,misses,
    precision:suggestions.size?matches/suggestions.size:null,
    recall:reference.size?matches/reference.size:null};
}
export function compareScanReview({columns,rows,suggested,reviewed}) {
  if(!Number.isInteger(columns)||!Number.isInteger(rows)||
      columns<2||rows<2||columns>60||rows>60)
    throw new RangeError("Invalid scanned grid size");
  if(!suggested||!reviewed)throw new TypeError("Both suggestion and review sets are required");
  const kinds=[
    ["walls","walls",null],["holes","holes",null],
    ["start","markers","entrance"],["finish","markers","exit"]
  ];
  const result={};
  for(const [name,field,type] of kinds){
    result[name]=measure(
      cells(suggested[field]??[],columns,rows,type),
      cells(reviewed[field]??[],columns,rows,type));
  }
  return result;
}

/**
 * Approve a photographed hole only when its square is deliberately selected.
 * Keep a detected circle's actual pixel center and radius rather than silently
 * replacing them with the center of a possibly misregistered 18x18 cell.
 */
export function holeForPhotoReview(candidates,{x,z,width,height,columns,rows}={}){
  if(!Array.isArray(candidates)||![x,z,width,height,columns,rows].every(Number.isFinite)||
    ![x,z,width,height,columns,rows].every(Number.isInteger)||
    columns<2||rows<2||width<columns||height<rows||
    x<0||z<0||x>=columns||z>=rows)
    throw new TypeError("Expected a valid photographic grid square");
  const detected=candidates.find(h=>h?.x===x&&h?.z===z&&
    Number.isFinite(h.cx)&&Number.isFinite(h.cy)&&
    Number.isFinite(h.radius)&&h.radius>0);
  if(detected)return {...detected};
  return {x,z,cx:(x+.5)*width/columns,cy:(z+.5)*height/rows,
    radius:Math.min(width/columns,height/rows)*.3,confidence:0};
}
