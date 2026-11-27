/**
 * Remove thin, continuous *printed* grid lines from dark wall candidates.
 *
 * A dark paper lattice can otherwise appear to be hundreds of solid walls.
 * Only an independently supported, properly registered periodic lattice is
 * eligible. Each line must be continuous across most of the photograph and
 * locally thinner than a small fraction of the measured grid pitch. Wider
 * physical wall silhouettes are retained, even where they cross grid ink.
 *
 * This is provisional image processing, not a calibrated Seedling wall size.
 * It never modifies the source photograph or the original maze document.
 */
export function removeThinPrintedGridInk(mask,width,height,printedGrid,columns,rows) {
  if(mask?.length!==width*height)throw new RangeError("Invalid dark mask");
  const filtered=mask.slice();
  let removed=0;
  for(const [axis,count,length,cross,observation] of [
    ["columns",columns,width,height,printedGrid?.columns],
    ["rows",rows,height,width,printedGrid?.rows]
  ]){
    if(!observation||observation.cells!==count||
       observation.confidence<.90||observation.phaseOffsetCells>.20||
       !Number.isFinite(observation.phasePixels))continue;
    const pitch=length/count;
    const search=Math.max(1,Math.min(3,Math.round(pitch*.075)));
    const maximumInkWidth=Math.max(2,Math.floor(pitch*.13));
    const at=(position,across)=>axis==="columns"
      ?across*width+position:position*width+across;
    for(let k=-1;k<=count+1;k++){
      const center=Math.round(observation.phasePixels+k*pitch);
      if(center<search+1||center>=length-search-1)continue;
      const erase=[];
      let narrow=0;
      for(let across=0;across<cross;across++){
        let best=null;
        for(let candidate=center-search;candidate<=center+search;candidate++){
          if(!mask[at(candidate,across)])continue;
          let lo=candidate,hi=candidate;
          while(lo>0&&mask[at(lo-1,across)]&&hi-lo+1<=maximumInkWidth)lo--;
          while(hi<length-1&&mask[at(hi+1,across)]&&hi-lo+1<=maximumInkWidth)hi++;
          if(hi-lo+1>maximumInkWidth)continue;
          const deviation=Math.abs((lo+hi)/2-center);
          if(!best||deviation<best.deviation)best={lo,hi,deviation};
        }
        if(!best)continue;
        narrow++;
        for(let p=best.lo;p<=best.hi;p++)erase.push(at(p,across));
      }
      // A short dark wall aligned to a grid boundary is not a printed line.
      if(narrow/cross<.68)continue;
      for(const pixel of erase){
        if(filtered[pixel]){filtered[pixel]=0;removed++;}
      }
    }
  }
  return {mask:filtered,removed};
}
