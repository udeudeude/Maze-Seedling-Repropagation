/** Separate compact round dark regions (possible holes) from wall silhouettes. */
export function separateRoundHoles(mask,width,height,columns=18,rows=18){
  if(mask.length!==width*height)throw new RangeError("Mask dimensions do not match image");
  const tile=Math.min(width/columns,height/rows);
  const seen=new Uint8Array(mask.length),filtered=mask.slice();
  const queue=new Int32Array(mask.length),holes=[];
  for(let start=0;start<mask.length;start++){
    if(!mask[start]||seen[start])continue;
    let head=0,tail=1;
    queue[0]=start;seen[start]=1;
    let minX=width,maxX=0,minY=height,maxY=0,sumX=0,sumY=0;
    while(head<tail){
      const at=queue[head++],x=at%width,y=Math.floor(at/width);
      if(x<minX)minX=x;if(x>maxX)maxX=x;
      if(y<minY)minY=y;if(y>maxY)maxY=y;
      sumX+=x;sumY+=y;
      const neighbors=[x>0?at-1:-1,x<width-1?at+1:-1,
        y>0?at-width:-1,y<height-1?at+width:-1];
      for(const next of neighbors){
        if(next>=0&&mask[next]&&!seen[next]){
          seen[next]=1;queue[tail++]=next;
        }
      }
    }
    const boxW=maxX-minX+1,boxH=maxY-minY+1;
    const ratio=Math.max(boxW,boxH)/Math.min(boxW,boxH);
    const fill=tail/(boxW*boxH);
    const diameter=(boxW+boxH)/2;
    // Real block dimensions have not been recovered. Only generic
    // elongated-versus-circular geometry is applied at present.
    if(diameter<tile*.25||diameter>tile*1.05||
      ratio>1.32||fill<.63||fill>.88||tail<12)continue;
    const cx=sumX/tail,cy=sumY/tail;
    const x=Math.floor(cx/(width/columns)),z=Math.floor(cy/(height/rows));
    if(x<0||z<0||x>=columns||z>=rows)continue;
    holes.push({x,z,cx:Number(cx.toFixed(1)),cy:Number(cy.toFixed(1)),
      radius:Number((diameter/2).toFixed(1)),
      confidence:Number(Math.max(.12,Math.min(.98,
        1-(ratio-1)*1.3-Math.abs(fill-.77))).toFixed(2))});
    for(let i=0;i<tail;i++)filtered[queue[i]]=0;
  }
  return {mask:filtered,holes};
}


/**
 * Detect circles from their radial edges, even when blur or a nearby wall
 * connects a hole to a longer dark component. A circle creates convergent
 * votes for the center; a straight wall does not. All work runs on-device.
 *
 * Returns provisional positions, not automatically classified game cells.
 */
export function findRoundHolesByEdges(image,columns=18,rows=18){
  const {width:w,height:h,data}=image??{};
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<32||h<32||
      data?.length!==w*h*4)throw new TypeError("Expected RGBA photograph");
  const tile=Math.min(w/columns,h/rows);
  const minR=Math.max(3,Math.round(tile*.23));
  const maxR=Math.max(minR,Math.round(tile*.66));
  const raw=new Float32Array(w*h),gray=new Float32Array(w*h);
  for(let i=0;i<w*h;i++){
    const p=i*4;
    raw[i]=data[p+3]<160?255:
      data[p]*.2126+data[p+1]*.7152+data[p+2]*.0722;
  }
  // Three-by-three Gaussian blur suppresses JPEG and paper-grid noise.
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const p=y*w+x;
    gray[p]=(raw[p]*4+
      (raw[p-1]+raw[p+1]+raw[p-w]+raw[p+w])*2+
      raw[p-w-1]+raw[p-w+1]+raw[p+w-1]+raw[p+w+1])/16;
  }
  const edges=[];
  for(let y=maxR+2;y<h-maxR-2;y++)for(let x=maxR+2;x<w-maxR-2;x++){
    const p=y*w+x;
    // Sobel gradient, pointing from dark interior to bright background.
    const gx=(gray[p-w+1]-gray[p-w-1])+
      2*(gray[p+1]-gray[p-1])+(gray[p+w+1]-gray[p+w-1]);
    const gy=(gray[p+w-1]-gray[p-w-1])+
      2*(gray[p+w]-gray[p-w])+(gray[p+w+1]-gray[p-w+1]);
    const mag=Math.hypot(gx,gy);
    if(mag<110||gray[p]<33||gray[p]>210)continue;
    edges.push([x,y,gx/mag,gy/mag]);
  }
  const detected=[];
  const angleCount=32;
  for(let r=minR;r<=maxR;r++){
    const votes=new Uint16Array(w*h);
    for(const [x,y,nx,ny] of edges){
      const cx=Math.round(x-nx*r),cy=Math.round(y-ny*r);
      if(cx<r+2||cy<r+2||cx>=w-r-2||cy>=h-r-2)continue;
      const p=cy*w+cx;
      if(votes[p]!==65535)votes[p]++;
    }
    const minimumVotes=Math.max(11,Math.round(r*1.15));
    for(let y=r+2;y<h-r-2;y++)for(let x=r+2;x<w-r-2;x++){
      const p=y*w+x,v=votes[p];
      if(v<minimumVotes||gray[p]>145)continue;
      if(v<votes[p-1]||v<votes[p+1]||v<votes[p-w]||v<votes[p+w])continue;
      let good=0,contrast=0,observations=0;
      for(let k=0;k<angleCount;k++){
        const t=(k*2*Math.PI)/angleCount;
        const cx=Math.cos(t),cy=Math.sin(t);
        const ix=Math.round(x+cx*r*.68),iy=Math.round(y+cy*r*.68);
        const ox=Math.round(x+cx*r*1.35),oy=Math.round(y+cy*r*1.35);
        if(ix<0||iy<0||ox<0||oy<0||ix>=w||ox>=w||iy>=h||oy>=h)continue;
        const diff=gray[oy*w+ox]-gray[iy*w+ix];
        contrast+=diff;observations++;
        if(diff>37)good++;
      }
      const arc=observations?good/observations:0;
      const avgContrast=observations?contrast/observations:0;
      if(arc<.67||avgContrast<51)continue;
      const confidence=Math.min(1,arc*.6+
        Math.min(1,Math.max(0,avgContrast)/100)*.25+
        Math.min(1,v/(r*2.8))*.15);
      detected.push({cx:x,cy:y,radius:r,
        votes:v,score:confidence,arc,contrast:avgContrast});
    }
  }
  detected.sort((a,b)=>b.score-a.score||b.votes-a.votes);
  const accepted=[];
  for(const hole of detected){
    if(accepted.some(other=>Math.hypot(hole.cx-other.cx,hole.cy-other.cy)<
        Math.max(7,Math.min(hole.radius,other.radius)*1.1)))continue;
    const x=Math.floor(hole.cx/(w/columns)),z=Math.floor(hole.cy/(h/rows));
    if(x<0||z<0||x>=columns||z>=rows)continue;
    accepted.push({x,z,cx:hole.cx,cy:hole.cy,
      radius:hole.radius,confidence:Number(hole.score.toFixed(2))});
    if(accepted.length>=40)break;
  }
  return accepted;
}
