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
 * A manually added hole must use the actual review tap, not a fabricated
 * grid-square midpoint. Neither point proves the correct physical grid.
 */
export function holeForPhotoReview(candidates,{x,z,width,height,columns,rows,cx,cy}={}){
  if(!Array.isArray(candidates)||![x,z,width,height,columns,rows].every(Number.isFinite)||
    ![x,z,width,height,columns,rows].every(Number.isInteger)||
    columns<2||rows<2||width<columns||height<rows||
    x<0||z<0||x>=columns||z>=rows)
    throw new TypeError("Expected a valid photographic grid square");
  const detected=candidates.find(h=>h?.x===x&&h?.z===z&&
    Number.isFinite(h.cx)&&Number.isFinite(h.cy)&&
    Number.isFinite(h.radius)&&h.radius>0);
  if(detected)return {...detected};
  // A failed detector supplies no image-space location. The center of a
  // digital square is not evidence of where a physical hole appeared.
  // Require a real photograph tap, and reject a point in a different square.
  if(!Number.isFinite(cx)||!Number.isFinite(cy)||
      cx<0||cy<0||cx>=width||cy>=height||
      Math.floor(cx*columns/width)!==x||
      Math.floor(cy*rows/height)!==z)
    throw new TypeError("Tap the actual center of the missing photographed hole");
  return {x,z,cx,cy,
    radius:Math.min(width/columns,height/rows)*.3,confidence:0};
}

/**
 * Independent image-space hole-center matching, unaffected by guessed cell IDs.
 * Maximum-cardinality one-to-one pairing avoids duplicate true positives and
 * avoids the false misses caused by naive greedy distance matching.
 * A 0.30-cell tolerance is an explicit research convention, not recovered
 * Seedling camera calibration. Output contains counts, not photo coordinates.
 */
export function compareHoleCenters({
  suggested,reviewed,width,height,columns,rows,toleranceCellFraction=.3
}={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||
      !Number.isInteger(columns)||!Number.isInteger(rows)||
      columns<2||rows<2||width<columns||height<rows||
      !Number.isFinite(toleranceCellFraction)||
      toleranceCellFraction<=0||toleranceCellFraction>=.5||
      !Array.isArray(suggested)||!Array.isArray(reviewed))
    throw new TypeError("Expected image dimensions and independent photo points");
  const valid=point=>point&&Number.isFinite(point.cx)&&Number.isFinite(point.cy)&&
    point.cx>=0&&point.cy>=0&&point.cx<width&&point.cy<height;
  if([...suggested,...reviewed].some(point=>!valid(point)))
    throw new TypeError("Missing or out-of-bounds photographed center");
  const tolerancePixels=Math.min(width/columns,height/rows)*toleranceCellFraction;
  const neighbors=suggested.map(point=>reviewed.map((other,i)=>({
    i,distance:Math.hypot(point.cx-other.cx,point.cy-other.cy)
  })).filter(pair=>pair.distance<=tolerancePixels)
    .sort((a,b)=>a.distance-b.distance||a.i-b.i));
  const owner=new Int32Array(reviewed.length).fill(-1);
  const augment=(i,seen)=>{
    for(const {i:target} of neighbors[i]){
      if(seen.has(target))continue;
      seen.add(target);
      if(owner[target]<0||augment(owner[target],seen)){
        owner[target]=i;
        return true;
      }
    }
    return false;
  };
  let matches=0;
  for(let i=0;i<suggested.length;i++)if(augment(i,new Set()))matches++;
  return {
    matches,falseAlarms:suggested.length-matches,misses:reviewed.length-matches,
    precision:suggested.length?matches/suggested.length:null,
    recall:reviewed.length?matches/reviewed.length:null,
    tolerancePixels:Number(tolerancePixels.toFixed(2)),toleranceCellFraction
  };
}
