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

/** Select a conservative threshold that follows the dark/bright populations.
 * A global threshold retains uniformly charcoal interiors, which a local
 * threshold can mistakenly turn white. */
function percentileHistogram(histogram,total,fraction){
  const target=total*fraction;let count=0;
  for(let i=0;i<histogram.length;i++){
    count+=histogram[i];if(count>=target)return i;
  }
  return 255;
}
function otsu(histogram,total){
  let sum=0;for(let i=0;i<256;i++)sum+=i*histogram[i];
  let lowWeight=0,lowSum=0,best=-1,threshold=0;
  for(let i=0;i<256;i++){
    lowWeight+=histogram[i];
    if(!lowWeight)continue;
    const highWeight=total-lowWeight;
    if(!highWeight)break;
    lowSum+=i*histogram[i];
    const difference=lowSum/lowWeight-(sum-lowSum)/highWeight;
    const score=lowWeight*highWeight*difference*difference;
    if(score>best){best=score;threshold=i;}
  }
  return threshold;
}
export function darkPixelMask(image){
  validatePixels(image);
  const {width,height,data}=image,total=width*height;
  const luminance=new Uint8Array(total),histogram=new Uint32Array(256);
  for(let p=0;p<total;p++){
    const i=p*4;
    const y=Math.round(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722);
    const value=data[i+3]<160?255:y;
    luminance[p]=value;histogram[value]++;
  }
  const p8=percentileHistogram(histogram,total,.08);
  const p85=percentileHistogram(histogram,total,.85);
  const otsuThreshold=otsu(histogram,total);
  const threshold=Math.min(150,otsuThreshold+17,p8+.30*(p85-p8));
  const mask=new Uint8Array(total);
  let count=0;
  for(let p=0;p<total;p++){
    const i=p*4;
    const chroma=Math.max(data[i],data[i+1],data[i+2])-
      Math.min(data[i],data[i+1],data[i+2]);
    if(luminance[p]<threshold && chroma<75){
      mask[p]=1;count++;
    }
  }
  return {mask,width,height,darkFraction:count/total,
    threshold,contrast:p85-p8};
}

/**
 * Keep only dark pixels belonging to LONG horizontal or vertical runs. This
 * rejects round punched holes, ink dots, and tiny photographic artifacts.
 * Runs are collected independently for each axis and unioned.
 */
export function extendedStripMask(mask,width,height,minimumLength){
  const result=new Uint8Array(width*height);
  const horizontal=Math.max(2,Math.round(minimumLength));
  const vertical=horizontal;
  for(let y=0;y<height;y++){
    let x=0;
    while(x<width){
      const start=x;
      while(x<width&&!mask[y*width+x])x++;
      if(x!==start)continue;
      while(x<width&&mask[y*width+x])x++;
      if(x-start>=horizontal){
        for(let at=start;at<x;at++)result[y*width+at]=1;
      }
    }
  }
  for(let x=0;x<width;x++){
    let y=0;
    while(y<height){
      const start=y;
      while(y<height&&!mask[y*width+x])y++;
      if(y!==start)continue;
      while(y<height&&mask[y*width+x])y++;
      if(y-start>=vertical){
        for(let at=start;at<y;at++)result[at*width+x]=1;
      }
    }
  }
  return result;
}

/** Provisional physical-wall coordinates, to be reviewed before changing a maze. */
export function suggestWalls(image,{columns=18,rows=18,sensitivity=.5}={}){
  if(!Number.isFinite(sensitivity)||sensitivity<0||sensitivity>1)
    throw new RangeError("Sensitivity must be from 0 to 1");
  sampleGrid(image,columns,rows);
  const {width,height,mask,darkFraction,threshold,contrast}=darkPixelMask(image);
  if(darkFraction<.0015||darkFraction>.72||contrast<25){
    return {suggestions:[],grid:[columns,rows],quality:"low-contrast",
      message:"Insufficient separation between dark walls and paper. Check lighting and corners.",
      threshold,darkFraction};
  }
  const tileWidth=width/columns,tileHeight=height/rows;
  const minLength=Math.max(8,Math.round(Math.min(tileWidth,tileHeight)*.70));
  const extended=extendedStripMask(mask,width,height,minLength);
  const tileCount=columns*rows;
  const totals=new Uint32Array(tileCount);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if(!extended[y*width+x])continue;
    const column=Math.min(columns-1,Math.floor(x/tileWidth));
    const row=Math.min(rows-1,Math.floor(y/tileHeight));
    totals[row*columns+column]++;
  }
  const minimumCoverage=.235-.27*sensitivity; // 0.10 at default; 0.235 at minimum
  const suggestions=[];
  for(let z=0;z<rows;z++)for(let x=0;x<columns;x++){
    const x0=Math.ceil(x*tileWidth),x1=Math.ceil((x+1)*tileWidth);
    const z0=Math.ceil(z*tileHeight),z1=Math.ceil((z+1)*tileHeight);
    const coverage=totals[z*columns+x]/Math.max(1,(x1-x0)*(z1-z0));
    if(coverage>=minimumCoverage)suggestions.push({x,z,
      score:Number(coverage.toFixed(3)),
      confidence:Number(clamp((coverage-minimumCoverage)/(1-minimumCoverage),0,1).toFixed(2))});
  }
  const ratio=suggestions.length/tileCount;
  const quality=ratio>.55?"too-many":ratio<.008?"very-few":"review";
  const message=quality==="too-many"
    ?"Too many cells are dark. Recheck all four corners; the photograph may include the frame or background."
    :quality==="very-few"
      ?"Few wall strips found. Check corner placement and try a higher sensitivity."
      :"Proposals are provisional. Correct missing walls and mistakes before adding them.";
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
