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
      ratio>1.32||fill<.46||fill>.88||tail<12)continue;
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
