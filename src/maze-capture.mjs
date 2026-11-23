/**
 * Perspective alignment for photographs of the user's own physical maze.
 * Four user-selected image corners map to a square tracing reference.
 * No claim is made that this is the original Seedling recognition algorithm.
 */
export function solveLinear(matrix, output) {
  const n=output.length;
  const a=matrix.map((row,i)=>[...row,output[i]]);
  for(let c=0;c<n;c++){
    let pivot=c;
    for(let r=c+1;r<n;r++)if(Math.abs(a[r][c])>Math.abs(a[pivot][c]))pivot=r;
    if(Math.abs(a[pivot][c])<1e-11)throw new Error("Board corners do not form a usable quadrilateral");
    [a[c],a[pivot]]=[a[pivot],a[c]];
    const divisor=a[c][c];
    for(let k=c;k<=n;k++)a[c][k]/=divisor;
    for(let r=0;r<n;r++){
      if(r===c)continue;
      const factor=a[r][c];
      for(let k=c;k<=n;k++)a[r][k]-=factor*a[c][k];
    }
  }
  return a.map(row=>row[n]);
}

/**
 * Returns a transform from normalized output square (u,v) to input image (x,y).
 * Input order: top-left, top-right, bottom-right, bottom-left.
 */
export function homographyForCorners(corners) {
  if(!Array.isArray(corners)||corners.length!==4||corners.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))){
    throw new TypeError("Expected four image-space corners");
  }
  const square=[[0,0],[1,0],[1,1],[0,1]],matrix=[],values=[];
  square.forEach(([u,v],i)=>{
    const {x,y}=corners[i];
    matrix.push([u,v,1,0,0,0,-x*u,-x*v]);values.push(x);
    matrix.push([0,0,0,u,v,1,-y*u,-y*v]);values.push(y);
  });
  const [a,b,c,d,e,f,g,h]=solveLinear(matrix,values);
  return (u,v)=>{
    const denominator=g*u+h*v+1;
    return {x:(a*u+b*v+c)/denominator,y:(d*u+e*v+f)/denominator};
  };
}

export function warpSquarePixels(input,width,height,corners,size=504) {
  if(!Number.isInteger(size)||size<1||size>2048)throw new RangeError("Invalid output dimension");
  if(input.length!==width*height*4)throw new Error("Invalid RGBA image data");
  const project=homographyForCorners(corners);
  const out=new Uint8ClampedArray(size*size*4);
  for(let row=0;row<size;row++){
    for(let column=0;column<size;column++){
      const {x,y}=project((column+.5)/size,(row+.5)/size);
      const o=(row*size+column)*4;
      if(x<0||y<0||x>=width||y>=height){
        out[o+3]=0;continue;
      }
      const left=Math.floor(x),top=Math.floor(y);
      const right=Math.min(width-1,left+1),bottom=Math.min(height-1,top+1);
      const fx=x-left,fy=y-top;
      const tl=(top*width+left)*4,tr=(top*width+right)*4;
      const bl=(bottom*width+left)*4,br=(bottom*width+right)*4;
      for(let channel=0;channel<4;channel++){
        out[o+channel]=
          input[tl+channel]*(1-fx)*(1-fy)+
          input[tr+channel]*fx*(1-fy)+
          input[bl+channel]*(1-fx)*fy+
          input[br+channel]*fx*fy;
      }
    }
  }
  return {width:size,height:size,data:out};
}

/** Four inset control points, scaled in actual image pixels. */
export function initialCorners(width,height) {
  const left=width*.08,right=width*.92,top=height*.08,bottom=height*.92;
  return [{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];
}
