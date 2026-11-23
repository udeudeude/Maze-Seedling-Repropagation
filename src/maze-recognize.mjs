/**
 * Experimental wall classifier for the original Seedling kit's DARK WALL STRIPS.
 *
 * The actual wooden walls are dark charcoal strips in 3 lengths, mounted on a
 * light gridded paper board. Here we look for long dark bands, not brown wood.
 * Round punched holes tend to have much shorter one-axis run lengths.
 *
 * This does not reproduce the original OpenCV implementation and cannot
 * recover starts, finishes, holes or the physical grid automatically.
 * User approval is always required before any change to the maze.
 */

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

function validatePixels(image){
  if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)
    ||image.width<16||image.height<16||image.data?.length!==image.width*image.height*4)
    throw new TypeError("Expected RGBA image data at least 16 by 16 pixels");
}

/** Center-color samples help diagnostics and future empirical calibration. */
export function sampleGrid(image,columns=18,rows=18) {
  validatePixels(image);
  if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<2||rows<2
    ||columns>60||rows>60||image.width<columns*3||image.height<rows*3)
    throw new RangeError("Unsupported grid dimensions");
  const cells=[];
  for(let z=0;z<rows;z++)for(let x=0;x<columns;x++){
    const x0=Math.floor((x+.23)*image.width/columns),
      x1=Math.ceil((x+.77)*image.width/columns),
      y0=Math.floor((z+.23)*image.height/rows),
      y1=Math.ceil((z+.77)*image.height/rows);
    let count=0,r=0,g=0,b=0;
    const stride=Math.max(1,Math.floor(Math.min(x1-x0,y1-y0)/14));
    for(let yy=y0;yy<y1;yy+=stride)for(let xx=x0;xx<x1;xx+=stride){
      const k=(yy*image.width+xx)*4;
      if(image.data[k+3]<200)continue;
      r+=image.data[k];g+=image.data[k+1];b+=image.data[k+2];count++;
    }
    cells.push({x,z,r:count?r/count:0,g:count?g/count:0,b:count?b/count:0,count});
  }
  return cells;
}

function rectangleSum(table,stride,x0,y0,x1,y1){
  return table[y1*stride+x1]-table[y0*stride+x1]
    -table[y1*stride+x0]+table[y0*stride+x0];
}
function integralOf(values,width,height){
  const stride=width+1,table=new Float64Array(stride*(height+1));
  for(let y=0;y<height;y++){
    let row=0;
    for(let x=0;x<width;x++){
      row+=values[y*width+x];
      table[(y+1)*stride+x+1]=table[y*stride+x+1]+row;
    }
  }
  return table;
}

/**
 * Locally adaptive dark-pixel segmentation. Using a local brightness reference
 * helps preserve contrast in uneven lighting, rather than treating all shadows
 * as blocks. This is a candidate mask, not a hole/marker classifier.
 */
export function darkPixelMask(image,columns=18){
  validatePixels(image);
  const {width:w,height:h}=image,gray=new Float64Array(w*h);
  for(let p=0;p<w*h;p++){
    const i=p*4;
    gray[p]=image.data[i+3]<160?255:
      image.data[i]*.2126+image.data[i+1]*.7152+image.data[i+2]*.0722;
  }
  const integral=integralOf(gray,w,h),stride=w+1;
  const radius=Math.max(7,Math.round(w/columns*.9));
  const mask=new Uint8Array(w*h);
  let count=0;
  for(let y=0;y<h;y++){
    const top=Math.max(0,y-radius),bottom=Math.min(h,y+radius+1);
    for(let x=0;x<w;x++){
      const left=Math.max(0,x-radius),right=Math.min(w,x+radius+1);
      const avg=rectangleSum(integral,stride,left,top,right,bottom)/
        ((right-left)*(bottom-top));
      const isDark=gray[y*w+x]<Math.min(177,Math.max(32,avg*.67));
      if(isDark){mask[y*w+x]=1;count++;}
    }
  }
  return {mask,width:w,height:h,darkFraction:count/(w*h)};
}

const offsets=[.10,.20,.30,.40,.50,.60,.70,.80,.90];

/**
 * The wall is a narrow extended strip, so measure elongated vertical and
 * horizontal bands. A round hole occupies only a short fraction of those bands.
 */
export function shapeScoreForTile(integral,width,height,columns,rows,x,z){
  const sx=width/columns,sy=height/rows,stride=width+1;
  function fraction(cx,cy,halfWidth,halfHeight){
    const x0=clamp(Math.floor(cx-halfWidth),0,width-1),
      x1=clamp(Math.ceil(cx+halfWidth),x0+1,width),
      y0=clamp(Math.floor(cy-halfHeight),0,height-1),
      y1=clamp(Math.ceil(cy+halfHeight),y0+1,height);
    return rectangleSum(integral,stride,x0,y0,x1,y1)/((x1-x0)*(y1-y0));
  }
  let vertical=0,horizontal=0;
  for(const offset of offsets){
    vertical=Math.max(vertical,fraction(
      (x+offset)*sx,(z+.5)*sy,sx*.09,sy*.39));
    horizontal=Math.max(horizontal,fraction(
      (x+.5)*sx,(z+offset)*sy,sx*.39,sy*.09));
  }
  return {score:Math.max(vertical,horizontal),orientation:vertical>=horizontal?"vertical":"horizontal"};
}

/** Candidate walls only; caller must offer a review and correction stage. */
export function suggestWalls(image,{columns=18,rows=18,sensitivity=.5}={}){
  if(!Number.isFinite(sensitivity)||sensitivity<0||sensitivity>1)
    throw new RangeError("Sensitivity must be from 0 to 1");
  // Validate all sampling dimensions and image data.
  sampleGrid(image,columns,rows);
  const {width,height,mask,darkFraction}=darkPixelMask(image,columns);
  if(darkFraction<.0015 || darkFraction>.73){
    return {suggestions:[],grid:[columns,rows],quality:"low-contrast",
      message:"No reliable dark wall contours found. Adjust lighting or board corners.",
      threshold:null,darkFraction};
  }
  const integral=integralOf(mask,width,height);
  const threshold=.79-.30*sensitivity; // Default 0.64; fewer at low sensitivity.
  const suggestions=[];
  for(let z=0;z<rows;z++)for(let x=0;x<columns;x++){
    const shape=shapeScoreForTile(integral,width,height,columns,rows,x,z);
    if(shape.score>=threshold)suggestions.push({
      x,z,orientation:shape.orientation,
      score:Number(shape.score.toFixed(3)),
      confidence:Number(clamp((shape.score-threshold)/Math.max(.08,1-threshold),0,1).toFixed(2))
    });
  }
  const ratio=suggestions.length/(columns*rows);
  const quality=ratio>.55?"too-many":ratio<.008?"very-few":"review";
  const message=quality==="too-many"
    ?"Too many dark squares. Check alignment or use fewer-wall sensitivity."
    :quality==="very-few"
      ?"Only a few dark strips could be identified. Check the corners and lighting."
      :"Review all proposals. Large holes, shadows and printed patterns can still fool this detector.";
  return {suggestions,grid:[columns,rows],threshold,darkFraction,quality,message};
}

/** Adds only on empty cells; never deletes imported tiles, metadata or markers. */
export function applyWallSuggestions(document,suggestions){
  if(!document||!Array.isArray(document.data?.cells))
    throw new TypeError("Expected maze document with data.cells");
  const cloned=JSON.parse(JSON.stringify(document));
  const width=Number(cloned.data.scale[0]),height=Number(cloned.data.scale[2]);
  const occupied=new Set(cloned.data.cells.map(cell=>cell.position[0]+","+cell.position[2]));
  let count=0;
  for(const entry of suggestions){
    if(!Number.isInteger(entry.x)||!Number.isInteger(entry.z)||
      entry.x<0||entry.z<0||entry.x>=width||entry.z>=height)continue;
    const key=entry.x+","+entry.z;
    if(occupied.has(key))continue;
    cloned.data.cells.push({position:[String(entry.x),"0",String(entry.z)],type:"wall",variant:"0"});
    occupied.add(key);count++;
  }
  return {maze:cloned,applied:count};
}
