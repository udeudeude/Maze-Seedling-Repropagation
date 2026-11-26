/**
 * Conservative, opt-in estimate of the four outer edges of a bright physical
 * maze board against a darker surrounding surface. Unlike the original
 * scanner, this is not calibrated to the Seedling kit or camera hardware.
 * A failure returns null; a result is a suggestion, never an automatic import.
 *
 * Sample only on-device pixels. Search multiple transects for a strong,
 * sustained light-to-dark border, fit each of four sides independently, and
 * reject implausible or inconsistent quadrilaterals.
 */
export function suggestBoardCorners(frame) {
  const {width,height,data}=frame??{};
  if(!Number.isInteger(width)||!Number.isInteger(height)||
     width<96||height<96||data?.length!==width*height*4)
    throw new TypeError("Expected a photograph with at least 96 by 96 RGBA pixels");
  const scale=Math.min(1,240/Math.max(width,height));
  const w=Math.max(1,Math.round(width*scale));
  const h=Math.max(1,Math.round(height*scale));
  if(Math.min(w,h)<92)return null;

  // Integral-image smoothing reduces the influence of thin grid lines and
  // individual dark wall strips without allocating a full-size extra image.
  const pitch=w+1,integral=new Float64Array((w+1)*(h+1));
  for(let y=0;y<h;y++){
    let rowSum=0;
    const sourceY=Math.min(height-1,Math.floor((y+.5)*height/h));
    for(let x=0;x<w;x++){
      const sourceX=Math.min(width-1,Math.floor((x+.5)*width/w));
      const i=(sourceY*width+sourceX)*4;
      const opacity=data[i+3]/255;
      rowSum+=(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])*opacity;
      integral[(y+1)*pitch+x+1]=integral[y*pitch+x+1]+rowSum;
    }
  }
  const mean=(x,y)=>{
    x=Math.round(x);y=Math.round(y);
    const left=Math.max(0,x-3),right=Math.min(w,x+4);
    const top=Math.max(0,y-3),bottom=Math.min(h,y+4);
    return (integral[bottom*pitch+right]-integral[top*pitch+right]-
      integral[bottom*pitch+left]+integral[top*pitch+left])/
      ((right-left)*(bottom-top));
  };
  const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const border=(axis,position,fromStart)=>{
    const length=axis==="x"?w:h;
    const sample=p=>axis==="x"?mean(p,position):mean(position,p);
    const inner=median([.37,.43,.5,.57,.63].map(f=>sample(f*length)));
    const outside=sample(length*(fromStart?.025:.975));
    const contrast=inner-outside;
    if(contrast<38)return null;
    const threshold=outside+.48*contrast;
    const first=Math.round(length*(fromStart?.035:.965));
    const last=Math.round(length*(fromStart?.46:.54));
    const direction=fromStart?1:-1;
    for(let p=first;fromStart?p<=last:p>=last;p+=direction){
      const before=sample(p-4*direction);
      const after=sample(p+4*direction);
      if(before<threshold&&after>threshold &&
        after-before>Math.max(16,contrast*.30)){
        return {position:p,contrast};
      }
    }
    return null;
  };
  const fractions=[.28,.324,.368,.412,.456,.5,.544,.588,.632,.676,.72];
  const fit=(points,dimension)=>{
    if(points.length<7)return null;
    const solve=entries=>{
      const n=entries.length;
      let su=0,sv=0,suu=0,suv=0;
      for(const {u,v} of entries){su+=u;sv+=v;suu+=u*u;suv+=u*v;}
      const denominator=n*suu-su*su;
      if(Math.abs(denominator)<1)return null;
      const slope=(n*suv-su*sv)/denominator;
      return {slope,intercept:(sv-slope*su)/n};
    };
    let model=solve(points);
    if(!model)return null;
    const tolerance=Math.max(3,dimension*.023);
    const kept=points.filter(p=>
      Math.abs(p.v-(model.slope*p.u+model.intercept))<=tolerance);
    if(kept.length<7)return null;
    model=solve(kept);
    if(!model)return null;
    if(kept.some(p=>
      Math.abs(p.v-(model.slope*p.u+model.intercept))>tolerance*1.25))return null;
    return {...model,count:kept.length};
  };
  const detectSide=(axis,fromStart)=>{
    const points=[],contrasts=[];
    for(const f of fractions){
      const fixed=(axis==="x"?h:w)*f;
      const detection=border(axis,fixed,fromStart);
      if(detection){
        points.push({u:fixed,v:detection.position});
        contrasts.push(detection.contrast);
      }
    }
    const model=fit(points,axis==="x"?w:h);
    return model?{...model,contrast:median(contrasts)}:null;
  };
  const left=detectSide("x",true),right=detectSide("x",false);
  const top=detectSide("y",true),bottom=detectSide("y",false);
  if(!left||!right||!top||!bottom)return null;
  const intersection=(vertical,horizontal)=>{
    const denominator=1-vertical.slope*horizontal.slope;
    if(Math.abs(denominator)<.2)return null;
    const x=(vertical.slope*horizontal.intercept+vertical.intercept)/denominator;
    return {x,y:horizontal.slope*x+horizontal.intercept};
  };
  const corners=[
    intersection(left,top),intersection(right,top),
    intersection(right,bottom),intersection(left,bottom)
  ];
  if(corners.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
      p.x<2||p.y<2||p.x>w-3||p.y>h-3))return null;
  let twiceArea=0;
  for(let i=0;i<4;i++){
    const a=corners[i],b=corners[(i+1)%4],c=corners[(i+2)%4];
    const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
    if(cross<=0)return null;
    twiceArea+=a.x*b.y-b.x*a.y;
  }
  if(twiceArea<w*h*.44)return null;
  if(Math.hypot(corners[1].x-corners[0].x,corners[1].y-corners[0].y)<w*.36 ||
     Math.hypot(corners[2].x-corners[1].x,corners[2].y-corners[1].y)<h*.36)return null;
  return {
    corners:corners.map(p=>({x:+(p.x*width/w).toFixed(1),
      y:+(p.y*height/h).toFixed(1)})),
    // This is an image-border score, not a calibrated probability of success.
    edgeContrast:Math.round(Math.min(left.contrast,right.contrast,
      top.contrast,bottom.contrast))
  };
}
