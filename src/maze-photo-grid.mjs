/**
 * Project the proposed tracing lattice onto the ORIGINAL photograph.
 *
 * The user must align the printed 18-by-18 paper grid by eye: recovered
 * documents and contemporary kit specifications support the cell count,
 * but neither photographic calibration nor the correct playable edges.
 *
 * The preview uses the same four-corner homography and per-edge inset as
 * insetRectifiedBoard. This is a visual alignment guide, not a detector, a
 * claim about original Seedling processing, or a replacement for labels.
 */
import {homographyForCorners} from "./maze-capture.mjs";

export function projectPhotoGrid(corners,margins=0,columns=18,rows=18,rectifiedSize=504){
  if(!Number.isInteger(columns)||!Number.isInteger(rows)||
      columns<2||rows<2||columns>60||rows>60||
      !Number.isInteger(rectifiedSize)||rectifiedSize<16)
    throw new RangeError("Invalid paper-grid geometry");
  const edges=typeof margins==="number"?
    {top:margins,right:margins,bottom:margins,left:margins}:margins;
  const names=["top","right","bottom","left"];
  if(!edges||typeof edges!=="object"||Array.isArray(edges)||
      Object.keys(edges).length!==4||
      names.some(side=>!Number.isFinite(edges[side])||
        edges[side]<0||edges[side]>.2))
    throw new RangeError("Invalid playable-grid margins");
  const project=homographyForCorners(corners);
  // The rectification routine leaves zero-inset photos untouched. When an
  // inset is applied it deliberately samples the last pixel one step in from
  // the opposite edge to avoid blending border pixels.
  const trim=names.some(side=>edges[side]!==0)?1/rectifiedSize:0;
  const left=edges.left,right=1-edges.right-trim;
  const top=edges.top,bottom=1-edges.bottom-trim;
  if(!(right>left&&bottom>top))
    throw new RangeError("Playable-grid edges overlap");
  const point=(x,y)=>project(left+(right-left)*x,top+(bottom-top)*y);
  const vertical=Array.from({length:columns+1},(_,i)=>({
    from:point(i/columns,0),to:point(i/columns,1)
  }));
  const horizontal=Array.from({length:rows+1},(_,i)=>({
    from:point(0,i/rows),to:point(1,i/rows)
  }));
  return {vertical,horizontal};
}
