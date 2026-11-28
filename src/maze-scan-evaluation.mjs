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
 * Review a photographed physical hole at the ACTUAL tap location. A detector
 * candidate may be approved only when the tap falls inside its drawn circle,
 * not merely somewhere in the same (potentially misregistered) grid square.
 * Otherwise retain the tap as an independent, unverified manual observation.
 * Multiple candidates in one square are disambiguated by image-space distance.
 * This is review safety, NOT recovered original scanner or board calibration.
 */
export function holeForPhotoReview(candidates,{x,z,width,height,columns,rows,cx,cy}={}){
  if(!Array.isArray(candidates)||![x,z,width,height,columns,rows].every(Number.isFinite)||
    ![x,z,width,height,columns,rows].every(Number.isInteger)||
    columns<2||rows<2||width<columns||height<rows||
    x<0||z<0||x>=columns||z>=rows)
    throw new TypeError("Expected a valid photographic grid square");
  // Even if the classifier proposed a circle, the person's tap must be real
  // and inside the square. Never use a candidate to launder an invalid tap.
  if(!Number.isFinite(cx)||!Number.isFinite(cy)||
      cx<0||cy<0||cx>=width||cy>=height||
      Math.floor(cx*columns/width)!==x||
      Math.floor(cy*rows/height)!==z)
    throw new TypeError("Tap the actual photographed hole inside its square");
  const pitch=Math.min(width/columns,height/rows);
  let nearest=null,nearestDistance=Infinity;
  for(const hole of candidates){
    if(hole?.x!==x||hole?.z!==z||
        !Number.isFinite(hole.cx)||!Number.isFinite(hole.cy)||
        !Number.isFinite(hole.radius)||hole.radius<=0||
        hole.cx<0||hole.cy<0||hole.cx>=width||hole.cy>=height||
        Math.floor(hole.cx*columns/width)!==x||
        Math.floor(hole.cy*rows/height)!==z)continue;
    // The visible ring has radius max(5, radius+2). Cap the hit area at
    // 0.35 cell so another perforation in the same square is not selected
    // just because the detector returned a large/incorrect circle radius.
    const hitRadius=Math.min(pitch*.35,Math.max(5,hole.radius+2));
    const distance=Math.hypot(hole.cx-cx,hole.cy-cy);
    if(distance<=hitRadius&&distance<nearestDistance){
      nearest=hole;nearestDistance=distance;
    }
  }
  if(nearest)return {...nearest};
  // Nearby base perforations and false circles are not proof this tap marks
  // the detected object. Keep the actual point, with no detector confidence.
  return {x,z,cx,cy,radius:pitch*.3,confidence:0};
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
