/**
 * Research-only paper-grid evidence from a rectified photographed maze.
 *
 * Unlike the production scanner, this intentionally measures the strength of
 * the 18-cell hypothesis even when recognition is NOT supported. It samples
 * local light-paper contrast (excluding charcoal walls), reports only
 * aggregate line counts and fractional pitch/phase, and never logs source
 * pixels, candidate coordinates or third-party images.
 *
 * The unknown playable-paper edges, perspective, ink fading and wall
 * occlusion prevent interpreting a peak as demonstrated calibration.
 */
const median=(values)=>{
  if(!values.length)return null;
  const sorted=values.slice().sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
};
const luminance=(data,idx)=>
  .2126*data[idx]+.7152*data[idx+1]+.0722*data[idx+2];

function axisEvidence(image,axis,cells,band){
  const {width,height,data}=image;
  const length=axis==="columns"?width:height;
  const across=axis==="columns"?height:width;
  const pitch=length/cells;
  const offset=Math.max(2,Math.round(pitch*.18));
  const samples=65;
  const strengths=new Float64Array(length);
  for(let position=offset+1;position<length-offset-1;position++){
    const contrasts=[];
    for(let j=0;j<samples;j++){
      const cross=Math.min(across-1,Math.floor(across*
        (band[0]+(band[1]-band[0])*(j+.5)/samples)));
      const at=(along)=>axis==="columns"
        ?(cross*width+along)*4:(along*width+cross)*4;
      const ci=at(position),li=at(position-offset),ri=at(position+offset);
      if(data[ci+3]<200||data[li+3]<200||data[ri+3]<200)continue;
      const center=luminance(data,ci),left=luminance(data,li),
        right=luminance(data,ri);
      // Cut away actual charcoal strips and their flanks: this is the paper
      // lattice, not evidence that a long dark wall is a printed line.
      if(Math.min(center,left,right)<164)continue;
      contrasts.push((left+right)/2-center);
    }
    if(contrasts.length>=35){
      contrasts.sort((a,b)=>a-b);
      strengths[position]=Math.max(0,
        contrasts[Math.floor(contrasts.length*.60)]);
    }
  }
  const phaseSamples=[];
  // Grid lines at equal pitch may have any position inside one cell when
  // four photo corners are guessed. Search that phase, never call it truth.
  for(let step=0;step<Math.ceil(pitch*2);step++){
    const phase=step*.5;
    const lineStrengths=[];
    for(let k=0;k<=cells;k++){
      const position=Math.round(phase+k*pitch);
      if(position<length*.025||position>=length*.975)continue;
      lineStrengths.push((strengths[position-1]+2*strengths[position]+
        strengths[position+1])/4);
    }
    if(lineStrengths.length<Math.max(8,cells*.7))continue;
    const matchCount=lineStrengths.filter(v=>v>=2.5).length;
    phaseSamples.push({phase,score:median(lineStrengths),matchCount,
      examined:lineStrengths.length});
  }
  if(!phaseSamples.length)return null;
  phaseSamples.sort((a,b)=>b.score-a.score||b.matchCount-a.matchCount);
  const best=phaseSamples[0];
  const centerScore=median(phaseSamples.map(item=>item.score));
  return {
    // A score is a grey-level *contrast* in a synthetic grid-phase model,
    // neither a probability nor independent photographic ground truth.
    bestMedianInkContrast:Number(best.score.toFixed(2)),
    medianAlternativePhaseContrast:Number(centerScore.toFixed(2)),
    peakContrastExcess:Number((best.score-centerScore).toFixed(2)),
    linesAbove2Point5GreyLevels:best.matchCount,
    linesExamined:best.examined,
    bestPhaseCells:Number((best.phase/pitch).toFixed(2)),
    fractionSupported:Number((best.matchCount/best.examined).toFixed(2)),
    // Require MANY distinct observed lines, not one selected strong stripe.
    tentative:best.score>=2.5&&best.matchCount>=Math.ceil(cells*.70)&&
      best.score-centerScore>=1.5
  };
}

export function measurePaperLatticeEvidence(image,{cells=18}={}){
  if(!Number.isInteger(cells)||cells<8||cells>40||
      !Number.isInteger(image?.width)||!Number.isInteger(image?.height)||
      image.width<160||image.height<160||
      image.data?.length!==image.width*image.height*4)
    throw new TypeError("Expected a rectified RGBA photograph and grid count");
  const axes={};
  for(const axis of ["columns","rows"]){
    const all=axisEvidence(image,axis,cells,[.12,.88]);
    const near=axisEvidence(image,axis,cells,[.20,.30]);
    const far=axisEvidence(image,axis,cells,[.70,.80]);
    const one=near?.bestPhaseCells,two=far?.bestPhaseCells;
    const delta=one===undefined||two===undefined?null:
      Math.min(Math.abs(one-two),1-Math.abs(one-two));
    axes[axis]={
      full:all,
      near,
      far,
      nearFarPhaseDriftCells:delta===null?null:Number(delta.toFixed(2)),
      // A band disagreement forbids treating a whole-image peak as
      // evidence of correctly registered paper-grid corners.
      crossBandConsistent:!!(all?.tentative&&near?.tentative&&far?.tentative&&
        delta!==null&&delta<=.12)
    };
  }
  return {
    hypothesis:"equally spaced printed paper lines at the documented cell count",
    sourcePixelsIncluded:false,
    calibrated:false,
    observed:axes
  };
}
