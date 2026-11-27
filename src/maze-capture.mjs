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
  // Four independently dragged handles can cross, fold or nearly collapse.
  // An eight-coefficient homography can still solve some of those inputs, but
  // would transpose or duplicate physical tiles in the imported maze.
  // Screen coordinates increase downward: TL, TR, BR, BL must turn clockwise
  // with positive cross products at every corner.
  const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);
  const boxArea=(Math.max(...xs)-Math.min(...xs))*
    (Math.max(...ys)-Math.min(...ys));
  const minimumTurn=boxArea*.001;
  if(!(boxArea>0))throw new RangeError(
    "Board corners must enclose a visible area. Move all four handles apart.");
  for(let i=0;i<4;i++){
    const a=corners[i],b=corners[(i+1)%4],c=corners[(i+2)%4];
    const turn=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
    if(turn<=minimumTurn)throw new RangeError(
      "Board corners must follow the perimeter clockwise without crossing or collapsing. Move the four handles around the visible board.");
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
  // Do not synthesize transparent margins that a downstream detector could
  // mistake for dark holes, empty squares, or grid-edge evidence.
  if(corners.some(p=>p.x<0||p.y<0||p.x>width-1||p.y>height-1))
    throw new RangeError("Board corners must remain inside the photograph.");
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

/**
 * Move exactly one alignment-space pixel, independently of the physical
 * drawing gesture. This is NOT a calibrated original Seedling unit.
 * The returned array is new; unsafe corner geometry is rejected before the
 * scanner can attribute physical tiles to incorrect digital cells.
 */
export function nudgeBoardCorner(corners,index,dx,dy,width,height) {
  if(!Array.isArray(corners)||corners.length!==4||
      !Number.isInteger(index)||index<0||index>3||
      !Number.isInteger(dx)||!Number.isInteger(dy)||
      Math.abs(dx)+Math.abs(dy)!==1||
      !Number.isInteger(width)||!Number.isInteger(height)||
      width<2||height<2)
    throw new TypeError("Invalid alignment nudge");
  const moved=corners.map(point=>({...point}));
  const point=moved[index];
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y))
    throw new TypeError("Invalid corner coordinates");
  point.x+=dx;point.y+=dy;
  if(point.x<0||point.y<0||point.x>width-1||point.y>height-1)
    throw new RangeError("This corner cannot move outside the photograph");
  homographyForCorners(moved);
  return moved;
}

/** Four inset control points, scaled in actual image pixels. */
export function initialCorners(width,height) {
  const left=width*.08,right=width*.92,top=height*.08,bottom=height*.92;
  return [{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];
}

/**
 * Crop the playable grid inside a perspective-aligned board photograph.
 * Some physical boards include a border outside their tile grid. The inset is
 * a user-controlled fraction of each edge, not an inferred factory
 * measurement. Accepts a legacy uniform number or an explicit four-edge
 * object. Original image pixels are never mutated.
 */
export function insetRectifiedBoard(image,margin=0) {
  const {width,height,data}=image??{};
  if(!Number.isInteger(width)||width<16||height!==width||
      data?.length!==width*height*4)
    throw new TypeError("Expected square, rectified RGBA photograph");
  const edges=typeof margin==="number"
    ?{top:margin,right:margin,bottom:margin,left:margin}:margin;
  const sides=["top","right","bottom","left"];
  if(!edges||typeof edges!=="object"||Array.isArray(edges)||
      Object.keys(edges).length!==4||
      sides.some(side=>!Number.isFinite(edges[side])||
        edges[side]<0||edges[side]>.2))
    throw new RangeError("Each playable-grid edge must be between 0 and 20 percent");
  if(sides.every(side=>edges[side]===0))
    return {width,height,data:data.slice()};
  // Keep the final output sample inside every individual playable edge.
  // -1 is essential: bilinear interpolation must not blend a border pixel.
  const x0=width*edges.left,x1=width*(1-edges.right)-1;
  const y0=height*edges.top,y1=height*(1-edges.bottom)-1;
  return warpSquarePixels(data,width,height,[
    {x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}
  ],width);
}


/**
 * Conservatively suggest outer paper-grid margins in a rectified maze photo.
 * These are visual border estimates, not measurements of the Seedling kit's
 * physical grid pitch or reproductions of its original scanning algorithm.
 * No source photograph or maze document is changed.
 */
export function suggestPlayableGridEdges(image) {
  const {width:w,height:h,data}=image??{};
  if(!Number.isInteger(w)||w<100||h!==w||data?.length!==w*h*4)
    throw new TypeError("Expected a square rectified RGBA photograph at least 100 pixels wide");
  const median=values=>{
    const sorted=values.slice().sort((a,b)=>a-b);
    return sorted[Math.floor(sorted.length/2)];
  };
  const mean=(values,from,to)=>{
    let sum=0;
    for(let i=from;i<to;i++)sum+=values[i];
    return sum/Math.max(1,to-from);
  };
  const profiles=[];
  for(const axis of ["x","y"]){
    const entries=[];
    for(let pos=0;pos<w;pos++){
      const rgb=[[],[],[]];
      // Central samples resist isolated wall blocks and thin paper grid lines.
      for(let k=0;k<41;k++){
        const cross=Math.round((.2+.6*(k+.5)/41)*(w-1));
        const at=axis==="x"?(cross*w+pos)*4:(pos*w+cross)*4;
        if(data[at+3]<200)continue;
        for(let c=0;c<3;c++)rgb[c].push(data[at+c]);
      }
      entries.push(rgb[0].length>=30?rgb.map(median):null);
    }
    const interior=[];
    for(let i=Math.floor(w*.32);i<Math.ceil(w*.68);i++)
      if(entries[i])interior.push(entries[i]);
    if(interior.length<Math.floor(w*.30))return null;
    const paper=[0,1,2].map(c=>median(interior.map(v=>v[c])));
    // RGB distance recognizes a green frame as well as a dark one.
    const distance=entries.map(v=>v?
      Math.hypot(...v.map((n,c)=>n-paper[c]))/Math.sqrt(3):0);
    const radius=Math.max(2,Math.round(w*.004));
    profiles.push(distance.map((_,i)=>mean(distance,
      Math.max(0,i-radius),Math.min(w,i+radius+1))));
  }
  const edges={top:0,right:0,bottom:0,left:0},detected=[];
  const minimum=Math.ceil(w*.02),maximum=Math.floor(w*.2);
  const window=Math.max(4,Math.round(w*.012));
  const settle=Math.max(9,Math.round(w*.045));
  for(const side of ["top","right","bottom","left"]){
    const alongX=side==="left"||side==="right";
    const profile=profiles[alongX?0:1];
    const signal=side==="right"||side==="bottom"?profile.slice().reverse():profile;
    let best=null;
    for(let p=minimum;p<=maximum;p++){
      const before=mean(signal,p-window,p);
      const after=mean(signal,p,p+window);
      const outer=mean(signal,0,p);
      const settled=mean(signal,p+window,p+window+settle);
      const drop=before-after;
      const sustained=signal.slice(0,Math.max(1,p-window))
        .filter(v=>v>32).length/Math.max(1,p-window);
      // Require a continuous border followed by a sharp, sustained
      // transition to pale paper; gradients and narrow dark strips fail.
      if(outer<42||sustained<.7||before<42||drop<31||
          after>39||settled>26)continue;
      const score=drop-.6*after-.2*settled;
      if(!best||score>best.score)best={p,score};
    }
    if(best){
      const percent=Math.round(best.p/w*100);
      if(percent>=2&&percent<=20){
        edges[side]=percent;
        detected.push(side);
      }
    }
  }
  return detected.length?{edges,detected}:null;
}
