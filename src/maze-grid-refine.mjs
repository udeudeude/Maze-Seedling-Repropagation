/**
 * Experimental sub-cell registration aid for a photographed Seedling paper grid.
 *
 * Actual kit documentation confirms the 18-by-18 printed lattice, not its
 * camera calibration. This is NOT original-app code. Only propose a small,
 * mutually consistent translation from two separated printed-line regions
 * on BOTH axes. Never silently alter the saved maze or prior measurements.
 *
 * Repeated printed lines cannot identify a displacement of one whole cell.
 * Refuse large/ambiguous corrections, perspective drift and poor ink evidence.
 */
import {estimatePrintedGrid} from "./maze-printed-grid.mjs";
import {homographyForCorners} from "./maze-capture.mjs";

export function suggestPrintedGridRefinement(image,corners,sourceWidth,sourceHeight,
  {columns=18,rows=18}={}){
  if(!Number.isInteger(sourceWidth)||!Number.isInteger(sourceHeight)||
      sourceWidth<160||sourceHeight<160||
      !Number.isInteger(columns)||!Number.isInteger(rows)||
      columns<2||rows<2||
      !Number.isInteger(image?.width)||!Number.isInteger(image?.height)||
      image.width<160||image.height<160||
      image.data?.length!==image.width*image.height*4)
    throw new TypeError("Expected a rectified paper photograph and its source dimensions");
  const project=homographyForCorners(corners);
  const observed=estimatePrintedGrid(image,{expectedColumns:columns,expectedRows:rows});
  if(observed.status!=="supported"||
      observed.columns?.cells!==columns||observed.rows?.cells!==rows||
      observed.columns.confidence<.92||observed.rows.confidence<.92||
      !observed.alignment.columns||!observed.alignment.rows||
      observed.alignment.columns.driftCells>.12||
      observed.alignment.rows.driftCells>.12)
    return null;
  const displacement=(axis,size,count)=>{
    const pitch=size/count;
    const phase=axis.phasePixels;
    if(!Number.isFinite(phase))return null;
    const signed=phase<=pitch/2?phase:phase-pitch;
    return Math.abs(signed/pitch)<=.24?signed:null;
  };
  const dx=displacement(observed.columns,image.width,columns);
  const dy=displacement(observed.rows,image.height,rows);
  if(dx===null||dy===null)return null;
  // Do not suggest a no-op based on mere repeated-grid periodicity.
  // Pixel quantization makes a well-aligned grid appear off by ~0.04 cell\n  // per axis. Refuse corrections smaller than 0.12 cell in aggregate.\n  // Even a zero residual cannot prove the correct integer-cell origin.
  if(Math.hypot(dx/image.width*columns,dy/image.height*rows)<.12)
    return null;
  const sx=dx/image.width,sy=dy/image.height;
  const refined=[project(sx,sy),project(1+sx,sy),
    project(1+sx,1+sy),project(sx,1+sy)];
  if(refined.some(p=>p.x<0||p.y<0||p.x>sourceWidth-1||p.y>sourceHeight-1))
    return null;
  homographyForCorners(refined);
  return {
    corners:refined,
    shiftCells:{horizontal:Number((dx*columns/image.width).toFixed(2)),
      vertical:Number((dy*rows/image.height).toFixed(2))},
    status:"sub-cell translation only; not validated physical calibration",
    printedGrid:observed
  };
}
