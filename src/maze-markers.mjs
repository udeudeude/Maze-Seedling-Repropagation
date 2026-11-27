/** Candidate start/finish sticker detection in a rectified physical maze photo.
 * Red and turquoise correspond to sticker colors visible in surviving examples;
 * the historical color-to-role assignment is provisional and fully editable.
 */
export function detectColoredMarkers(image,columns=18,rows=18){
  const {width:w,height:h,data}=image??{};
  if(!Number.isInteger(w)||!Number.isInteger(h)||data?.length!==w*h*4)
    throw new TypeError("Expected RGBA image");
  const pitch=Math.min(w/columns,h/rows);
  const rules=[
    // A genuine kit photograph exposed a failure in the former r>90 and
    // moderate-redness rule: warm-lit charcoal wall faces were selected over
    // a darker, more strongly red end sticker. Demand chromatic separation
    // rather than brightness. Marker-to-role mapping is still provisional.
    {type:"entrance",color:"red",test:(r,g,b)=>r>55&&r>g*1.5&&r>b*1.5},
    {type:"exit",color:"blue-green",test:(r,g,b)=>b>90&&
      b>r*1.15&&g>r*1.06&&b>g*.86}
  ];
  const suggestions=[];
  for(const rule of rules){
    const mask=new Uint8Array(w*h),seen=new Uint8Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const p=(y*w+x)*4;
      if(data[p+3]>180&&rule.test(data[p],data[p+1],data[p+2]))mask[y*w+x]=1;
    }
    const queue=new Int32Array(w*h),components=[];
    for(let p=0;p<w*h;p++){
      if(!mask[p]||seen[p])continue;
      let head=0,tail=1,minX=w,maxX=0,minY=h,maxY=0,sumX=0,sumY=0;
      queue[0]=p;seen[p]=1;
      while(head<tail){
        const at=queue[head++],x=at%w,y=(at/w)|0;
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);
        minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        sumX+=x;sumY+=y;
        for(const near of [x>0?at-1:-1,x<w-1?at+1:-1,
          y>0?at-w:-1,y<h-1?at+w:-1]){
          if(near>=0&&mask[near]&&!seen[near]){
            seen[near]=1;queue[tail++]=near;
          }
        }
      }
      const bx=maxX-minX+1,by=maxY-minY+1;
      if(tail<pitch*pitch*.035||tail>pitch*pitch*3||
        bx<pitch*.18||by<pitch*.18||bx>pitch*2||by>pitch*2)continue;
      const cx=sumX/tail,cy=sumY/tail;
      const x=Math.floor(cx/(w/columns)),z=Math.floor(cy/(h/rows));
      if(x<0||z<0||x>=columns||z>=rows)continue;
      // Prefer cohesive, approximately sticker-sized patches.
      const compactness=tail/(bx*by);
      const score=compactness*Math.min(1,tail/(pitch*pitch*.22));
      components.push({type:rule.type,color:rule.color,x,z,cx,cy,
        confidence:Number(Math.min(.95,score).toFixed(2))});
    }
    components.sort((a,b)=>b.confidence-a.confidence);
    if(components.length)suggestions.push(components[0]);
  }
  return suggestions;
}
