/**
 * Experimental local wall candidate classifier for perspective-corrected photos.
 * Looks for dark, relatively warm wooden blocks on a pale paper grid.
 * NOT Seedling's native OpenCV implementation; requires review before applying.
 * Does not yet identify holes, starts, finishes, or the actual scanning grid.
 */
function bound(value,min,max){return Math.max(min,Math.min(max,value));}
function percentile(sorted,fraction){
  if(!sorted.length)return 0;
  const at=(sorted.length-1)*fraction,i=Math.floor(at),part=at-i;
  return sorted[i]*(1-part)+sorted[Math.min(i+1,sorted.length-1)]*part;
}
function median(values){return percentile([...values].sort((a,b)=>a-b),.5);}
function validatePixels(image){
  if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)
    ||image.width<16||image.height<16||image.data?.length!==image.width*image.height*4)
    throw new TypeError("Image requires at least 16 by 16 RGBA pixels");
}

/** Sample centers to avoid the photographed grid's dark printed lines. */
export function sampleGrid(image,columns=18,rows=18){
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

/** Returns provisional tile coordinates and diagnostic, never mutates a maze. */
export function suggestWalls(image,{columns=18,rows=18,sensitivity=.5}={}){
  if(!Number.isFinite(sensitivity)||sensitivity<0||sensitivity>1)
    throw new RangeError("Sensitivity must be between zero and one");
  const cells=sampleGrid(image,columns,rows),valid=cells.filter(c=>c.count>0);
  if(valid.length<columns*rows*.7)
    return {suggestions:[],grid:[columns,rows],quality:"insufficient-image",
      message:"The aligned board is partly outside the photograph.",threshold:null};
  const bg={r:median(valid.map(c=>c.r)),g:median(valid.map(c=>c.g)),b:median(valid.map(c=>c.b))};
  const luminosity=v=>.2126*v.r+.7152*v.g+.0722*v.b;
  const light=luminosity(bg),warm=(bg.r-bg.b)/255;
  const measured=cells.map(cell=>{
    if(!cell.count)return {...cell,score:0};
    const darkness=Math.max(0,(light-luminosity(cell))/255);
    const tint=(cell.r-cell.b)/255;
    const extraWarm=Math.max(0,tint-warm);
    const relativeTint=bound((tint-warm*.45)/Math.max(.06,warm+.035),0,1.45);
    // Neutral black trap holes should not automatically become walls.
    const woodScore=darkness*(.08+.58*relativeTint)+extraWarm*1.08;
    return {...cell,score:woodScore};
  });
  const scores=measured.map(c=>c.score).sort((a,b)=>a-b);
  const baseline=percentile(scores,.5),spread=percentile(scores,.89)-baseline;
  if(spread<.044)
    return {suggestions:[],grid:[columns,rows],quality:"low-contrast",
      message:"Wooden walls could not be separated reliably from the board.",
      threshold:baseline+.044,background:bg,contrast:spread};
  const threshold=baseline+Math.max(.039,spread*(.54-(sensitivity-.5)*.65));
  const suggestions=measured.filter(c=>c.count>0&&c.score>threshold).map(c=>({
    x:c.x,z:c.z,score:Number(c.score.toFixed(3)),
    confidence:Number(bound((c.score-threshold)/Math.max(.08,spread),0,1).toFixed(2))
  }));
  const fraction=suggestions.length/cells.length;
  const quality=fraction>.55?"too-many":fraction<.008?"very-few":"review";
  const message=quality==="too-many"
    ?"Many tiles were selected. Check the board corners or lower sensitivity."
    :quality==="very-few"
      ?"Only a few possible walls were found. Check the board corners."
      :"Review every suggested wall; dark shadows and holes may be mistaken for blocks.";
  return {suggestions,grid:[columns,rows],threshold,background:bg,
    contrast:spread,quality,message};
}

/** Add suggestions to empty cells only, preserving original metadata and all existing tiles. */
export function applyWallSuggestions(document,suggestions){
  if(!document||!Array.isArray(document.data?.cells))
    throw new TypeError("Expected a maze document");
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
