/**
 * Experimental observation of the printed paper grid in a rectified photograph.
 * The original digital presets are 18x18, but that does not establish the
 * physical kit's board dimensions. This returns evidence, never a new maze
 * size or an automatic import decision.
 */
const median=values=>{
  const sorted=values.sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
};

function axisEstimate(image,axis,minCells,maxCells){
  const {width:w,height:h,data}=image;
  const length=axis==="columns"?w:h;
  const cross=axis==="columns"?h:w;
  const profile=new Float64Array(length);
  for(let position=0;position<length;position++){
    const values=[];
    for(let s=0;s<65;s++){
      const perpendicular=Math.min(cross-1,Math.floor(cross*(.12+.76*(s+.5)/65)));
      const x=axis==="columns"?position:perpendicular;
      const y=axis==="columns"?perpendicular:position;
      const i=(y*w+x)*4;
      if(data[i+3]<200)continue;
      values.push(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2]);
    }
    if(values.length<45)return null;
    values.sort((a,b)=>a-b);
    profile[position]=values[Math.floor(values.length*.64)];
  }
  // Narrow ink lines are darker than local paper; broad illumination changes
  // are discarded by this high-pass operation.
  const radius=Math.max(7,Math.round(length/maxCells));
  const ink=new Float64Array(length);
  for(let i=0;i<length;i++){
    const neighboring=[];
    for(let k=Math.max(0,i-radius);k<=Math.min(length-1,i+radius);k+=2)
      neighboring.push(profile[k]);
    ink[i]=Math.max(0,median(neighboring)-profile[i]);
  }
  const smoothed=new Float64Array(length);
  for(let i=1;i<length-1;i++)smoothed[i]=(ink[i-1]+2*ink[i]+ink[i+1])/4;
  const peaks=[];
  const separation=Math.max(3,Math.floor(length/maxCells*.35));
  for(let i=Math.ceil(length*.025);i<Math.floor(length*.975);i++){
    if(smoothed[i]<13||smoothed[i]<smoothed[i-1]||smoothed[i]<=smoothed[i+1])continue;
    const previous=peaks.at(-1);
    if(previous&&i-previous.position<separation){
      if(smoothed[i]>previous.strength)peaks[peaks.length-1]={position:i,strength:smoothed[i]};
    }else peaks.push({position:i,strength:smoothed[i]});
  }
  if(peaks.length<7)return null;
  let best=null;
  for(let count=minCells;count<=maxCells;count++){
    const spacing=length/count;
    const tolerance=Math.max(2,Math.min(4.5,spacing*.15));
    for(let phase=0;phase<spacing;phase+=.5){
      let matches=0,expected=0;
      const explained=new Set();
      for(let k=0;k<=count+1;k++){
        const location=phase+k*spacing;
        if(location<length*.025||location>=length*.975)continue;
        expected++;
        let chosen=-1,distance=tolerance;
        for(let p=0;p<peaks.length;p++){
          const delta=Math.abs(peaks[p].position-location);
          if(delta<distance){chosen=p;distance=delta;}
        }
        if(chosen>=0){matches++;explained.add(chosen);}
      }
      if(expected<7)continue;
      const recall=matches/expected;
      const precision=explained.size/peaks.length;
      const score=2*precision*recall/(precision+recall||1);
      if(!best||score>best.score||score===best.score&&matches>best.matches)
        best={count,score,precision,recall,matches,expected,peaks:peaks.length};
    }
  }
  if(!best||best.score<.78||best.recall<.78||best.precision<.72||best.matches<7)return null;
  return {cells:best.count,confidence:Number(best.score.toFixed(2)),
    matchedLines:best.matches,observedLines:best.peaks};
}

export function estimatePrintedGrid(image){
  const {width,height,data}=image??{};
  if(!Number.isInteger(width)||!Number.isInteger(height)||
    width<160||height<160||data?.length!==width*height*4)
    throw new TypeError("Expected a rectified RGBA photograph at least 160 pixels across");
  const columns=axisEstimate(image,"columns",8,40);
  const rows=axisEstimate(image,"rows",8,40);
  if(!columns||!rows)return {status:"unresolved",columns,rows};
  return {status:columns.cells===rows.cells?"supported":"inconsistent",columns,rows};
}
