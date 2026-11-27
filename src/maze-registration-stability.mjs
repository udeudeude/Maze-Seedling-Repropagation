/**
 * An empirical stress test of wall-square assignments when the tracing-grid
 * origin moves by a quarter of a cell. The historical paper's true boundaries
 * are not calibrated: this is sensitivity, NOT accuracy or original behavior.
 *
 * Work on the already classified wall-pixel mask, so the expensive image
 * recognition passes do not repeat for every sensitivity-slider change.
 * No photograph pixels, candidate coordinates, or maze data are persisted.
 */
export function quarterCellWallCoverages(mask,width,height,columns,rows) {
  if(!(mask instanceof Uint8Array)||mask.length!==width*height||
      !Number.isInteger(width)||!Number.isInteger(height)||
      !Number.isInteger(columns)||!Number.isInteger(rows)||
      columns<2||rows<2||width<columns*3||height<rows*3)
    throw new TypeError("Expected a wall mask and valid tracing-grid dimensions");
  const cellArea=width*height/(columns*rows);
  const shifts=[[-.25,0],[.25,0],[0,-.25],[0,.25]];
  return shifts.map(([dx,dy])=>{
    const xs=Int16Array.from({length:width},(_,x)=>
      Math.floor((x+.5)*columns/width-dx));
    const ys=Int16Array.from({length:height},(_,y)=>
      Math.floor((y+.5)*rows/height-dy));
    const amounts=new Uint32Array(columns*rows);
    for(let y=0;y<height;y++){
      const z=ys[y];
      if(z<0||z>=rows)continue;
      const row=y*width;
      for(let x=0;x<width;x++){
        const col=xs[x];
        if(col>=0&&col<columns&&mask[row+x])amounts[z*columns+col]++;
      }
    }
    // Retain the full nominal cell area at cropped edges. Filling a partly
    // visible edge square must not misleadingly improve its confidence.
    return Float32Array.from(amounts,amount=>amount/cellArea);
  });
}

/**
 * Separates candidate walls consistent across all four small grid shifts from
 * candidates dependent on the unmeasured lattice origin. These are NOT
 * probability estimates or a substitute for independently labeled photos.
 */
export function classifyWallRegistration(suggestions,coverages,minimumCoverage,columns,rows){
  if(!Array.isArray(suggestions)||!Array.isArray(coverages)||
      coverages.length!==4||coverages.some(a=>a?.length!==columns*rows)||
      !Number.isFinite(minimumCoverage)||minimumCoverage<=0||
      minimumCoverage>=1)
    throw new TypeError("Expected four shifted wall-coverages and a cell threshold");
  const baseline=new Set(suggestions.map(({x,z})=>z*columns+x));
  const stable=[],uncertain=[];
  for(const entry of suggestions){
    const i=entry.z*columns+entry.x;
    if(coverages.every(values=>values[i]>=minimumCoverage))
      stable.push(entry);
    else uncertain.push(entry);
  }
  const shiftOnly=new Set();
  const overlaps=[];
  for(const coverage of coverages){
    const shifted=new Set();
    for(let i=0;i<coverage.length;i++)
      if(coverage[i]>=minimumCoverage)shifted.add(i);
    for(const i of shifted)if(!baseline.has(i))shiftOnly.add(i);
    let shared=0;
    for(const i of baseline)if(shifted.has(i))shared++;
    const union=baseline.size+shifted.size-shared;
    overlaps.push(union?Number((shared/union).toFixed(3)):null);
  }
  return {
    offsetCells:.25,stable,uncertain,shiftOnlyCount:shiftOnly.size,
    minOverlap:overlaps.some(v=>v!==null)?
      Math.min(...overlaps.filter(v=>v!==null)):null,
    // A whole-cell translation and corner-perspective errors require
    // independent evidence. Four local shifts cannot detect either.
    interpretation:"Grid-origin sensitivity only; original alignment unverified"
  };
}
