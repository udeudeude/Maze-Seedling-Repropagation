import {separateRoundHoles,findRoundHolesByEdges,findStraightWallSpans} from "./maze-shapes.mjs";
import {detectColoredMarkers} from "./maze-markers.mjs";
import {estimatePrintedGrid} from "./maze-printed-grid.mjs";
import {removeThinPrintedGridInk} from "./maze-grid-ink.mjs";
import {quarterCellWallCoverages,classifyWallRegistration} from "./maze-registration-stability.mjs";

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
  // Most pixels can be light paper in a nearly empty physical maze.
  // The eighth percentile then misses every real dark wall or hole. Use a
  // small but nonzero dark population to measure scene contrast without
  // letting a single defective/salt-and-pepper pixel dominate the estimate.
  const darkTail=percentileHistogram(histogram,total,.002);
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
    threshold,contrast:Math.max(p85-p8,p85-darkTail)};
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

// Reuse expensive edge/shape analysis while the user moves the sensitivity
// slider. The photo is immutable; new corner alignment creates a new image.
const captureCache=new WeakMap();

/** Candidate physical walls and holes; analysis is local and provisional. */
export function suggestWalls(image,{columns=18,rows=18,sensitivity=.5}={}){
  if(!Number.isFinite(sensitivity)||sensitivity<0||sensitivity>1)
    throw new RangeError("Sensitivity must be from 0 to 1");
  sampleGrid(image,columns,rows);
  let computed=captureCache.get(image);
  if(!computed||computed.columns!==columns||computed.rows!==rows){
    const {width,height,mask,darkFraction,threshold,contrast}=darkPixelMask(image);
    const printedGrid=estimatePrintedGrid(image,{expectedColumns:columns,expectedRows:rows});
    // Contemporary documentation describes 18-by-18 squares on the kit.
    // A partly hidden printed grid can still expose one contradictory axis.
    // Never require both axes to be visible before rejecting unsafe mapping.
    const conflicts=[
      printedGrid.columns?.confidence>=.9&&printedGrid.columns.cells!==columns
        ?"width: "+printedGrid.columns.cells+" observed vs "+columns+" expected":null,
      printedGrid.rows?.confidence>=.9&&printedGrid.rows.cells!==rows
        ?"height: "+printedGrid.rows.cells+" observed vs "+rows+" expected":null
    ].filter(Boolean);
    const mismatch=conflicts.length>0;
    // Matching printed-line counts do not prove that ink lines coincide with
    // the actual cell boundaries. A half-cell offset shifts tile mapping.
    // This is a conservative diagnostic; real-board alignment is untested.
    const offsets=[
      printedGrid.columns?.confidence>=.9&&printedGrid.columns.cells===columns&&
        printedGrid.columns.phaseOffsetCells>.25
        ?"horizontal: "+printedGrid.columns.phaseOffsetCells+" cell":null,
      printedGrid.rows?.confidence>=.9&&printedGrid.rows.cells===rows&&
        printedGrid.rows.phaseOffsetCells>.25
        ?"vertical: "+printedGrid.rows.phaseOffsetCells+" cell":null
    ].filter(Boolean);
    const misaligned=!mismatch&&offsets.length>0;
    // The printed paper may still be skewed after a seemingly successful
    // four-corner alignment. Withhold proposals only when two spatially
    // separated bands independently show a large phase disagreement.
    const shearAxes=[
      printedGrid.alignment?.columns?.driftCells>.30?"vertical printed lines":null,
      printedGrid.alignment?.rows?.driftCells>.30?"horizontal printed lines":null
    ].filter(Boolean);
    const gridSkew=!mismatch&&!misaligned&&shearAxes.length>0;
    const withheld=mismatch||misaligned||gridSkew;
    computed={columns,rows,width,height,darkFraction,threshold,contrast,printedGrid,mismatch,conflicts,
      misaligned,offsets,gridSkew,shearAxes,
      holes:[],segments:[],markers:withheld?[]:detectColoredMarkers(image,columns,rows),
      coverage:new Float32Array(columns*rows)};
    if(!withheld&&darkFraction>=.0015&&darkFraction<=.72&&contrast>=25){
      const tw=width/columns,th=height/rows;
      // Black printed paper-grid lines are not wooden wall pieces. Strip only
      // independently evidenced thin, continuous ink; preserve wider blocks.
      const wallMask=removeThinPrintedGridInk(mask,width,height,
        printedGrid,columns,rows).mask;
      const separated=separateRoundHoles(wallMask,width,height,columns,rows);
      // The original kit has a densely perforated wooden base *beneath* its
      // removable paper grid (Vat19 kit-contents photograph). Without paper,
      // the entire regular field of exposed holes can resemble traps. Such a
      // photograph is ambiguous, not evidence for hundreds of lethal squares.
      // Quarantine dense circular fields before costly radial-edge voting.
      const circularCells=new Set(separated.holes.map(h=>h.x+","+h.z));
      if(circularCells.size>=Math.max(48,Math.ceil(columns*rows*.22))){
        computed.densePerforations=circularCells.size;
      }else{
        const holes=[...separated.holes];
      // Circle-edge voting finds holes that are merged with nearby wall pixels.
      for(const proposed of findRoundHolesByEdges(image,columns,rows)){
        if(holes.some(previous=>Math.hypot(previous.cx-proposed.cx,
            previous.cy-proposed.cy)<Math.max(previous.radius,proposed.radius)))continue;
        holes.push(proposed);
        const radius=Math.max(2,proposed.radius*.89);
        for(let y=Math.max(0,Math.floor(proposed.cy-radius));
            y<Math.min(height,Math.ceil(proposed.cy+radius));y++)
          for(let x=Math.max(0,Math.floor(proposed.cx-radius));
              x<Math.min(width,Math.ceil(proposed.cx+radius));x++)
            if((x-proposed.cx)**2+(y-proposed.cy)**2<radius*radius)
              separated.mask[y*width+x]=0;
      }
      const runLength=Math.max(8,Math.round(Math.min(tw,th)*.70));
      const extended=extendedStripMask(separated.mask,width,height,runLength);
      const segments=findStraightWallSpans(extended,width,height,Math.min(tw,th));
      const totals=new Uint32Array(columns*rows);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        if(!extended[y*width+x])continue;
        const cx=Math.min(columns-1,Math.floor(x/tw));
        const cz=Math.min(rows-1,Math.floor(y/th));
        totals[cz*columns+cx]++;
      }
      for(let z=0;z<rows;z++)for(let x=0;x<columns;x++){
        const x0=Math.ceil(x*tw),x1=Math.ceil((x+1)*tw);
        const z0=Math.ceil(z*th),z1=Math.ceil((z+1)*th);
        computed.coverage[z*columns+x]=totals[z*columns+x]/
          Math.max(1,(x1-x0)*(z1-z0));
      }
      // Empirically test small uncertainty in tracing-square registration.
      // Keep expensive image/shape classification cached while sensitivity changes.
      computed.registrationCoverages=quarterCellWallCoverages(extended,
        width,height,columns,rows);
      computed.holes=holes;computed.segments=segments;
      }
    }
    captureCache.set(image,computed);
  }
  const {threshold,darkFraction,contrast,holes,segments,markers,coverage,
    printedGrid,mismatch,conflicts,misaligned,offsets,gridSkew,shearAxes,densePerforations}=computed;
  if(mismatch||misaligned||gridSkew){
    return {suggestions:[],holes:[],segments:[],markers:[],
      grid:[columns,rows],printedGrid,
      quality:mismatch?"grid-mismatch":misaligned?"grid-offset":"grid-skew",
      message:mismatch
        ?"Printed-line spacing conflicts with the current "+
          columns+" by "+rows+" maze ("+conflicts.join("; ")+
          "). Automatic placement is suspended. Check board corners and grid margins before tracing manually."
        :misaligned?"Printed grid lines are offset from the tracing-square boundaries ("+
          offsets.join("; ")+"). Automatic placement is suspended. Adjust the four board corners and playable-grid margins before reviewing manually."
        :"Printed grid lines diverge between separated regions ("+
          shearAxes.join(" and ")+"). Automatic placement is suspended. Recheck all four printed-grid corners before reviewing manually.",
      threshold,darkFraction};
  }
  if(densePerforations){
    return {suggestions:[],holes:[],segments:[],markers:[],
      grid:[columns,rows],printedGrid,quality:"dense-perforations",
      message:"A dense field of dark circular perforations was detected ("+
        densePerforations+" squares). The exposed wooden base may have been photographed without its paper grid. Automatic tracing is suspended; align and review a photograph of the assembled paper maze instead.",
      threshold,darkFraction};
  }
  if(darkFraction<.0015||darkFraction>.72||contrast<25){
    return {suggestions:[],holes:[],segments:[],markers,grid:[columns,rows],printedGrid,
      quality:"low-contrast",
      message:"Insufficient separation between dark walls and paper. Check lighting and corners.",
      threshold,darkFraction};
  }
  const minimumCoverage=.31-.26*sensitivity;
  const holeTiles=new Set(holes.map(h=>h.x+","+h.z));
  const suggestions=[];
  for(let z=0;z<rows;z++)for(let x=0;x<columns;x++){
    const filled=coverage[z*columns+x];
    // A convincing hole takes precedence over a wall occupying its square.
    // The user can override either decision in the review.
    if(filled<minimumCoverage||holeTiles.has(x+","+z))continue;
    suggestions.push({x,z,score:Number(filled.toFixed(3)),
      confidence:Number(clamp((filled-minimumCoverage)/
        (1-minimumCoverage),0,1).toFixed(2))});
  }
  // Unstable positions are never preselected for import, but remain visible
  // for explicit confirmation. This sacrifices automatic recall rather than
  // silently turning uncertain geometry into apparent walls.
  const registration=computed.registrationCoverages?
    classifyWallRegistration(suggestions,computed.registrationCoverages,
      minimumCoverage,columns,rows):null;
  const ratio=suggestions.length/(columns*rows);
  const quality=ratio>.55?"too-many":ratio<.008?"very-few":"review";
  const message=quality==="too-many"
    ?"Too many cells are dark. Recheck all four corners."
    :quality==="very-few"
      ?"Few walls found. Check alignment and increase sensitivity if needed."
      :"Review candidate strips and circles before importing.";
  return {suggestions,
    stableSuggestions:registration?.stable??suggestions,
    unstableSuggestions:registration?.uncertain??[],
    registrationSensitivity:registration?{
      offsetCells:registration.offsetCells,
      stableWallTiles:registration.stable.length,
      uncertainWallTiles:registration.uncertain.length,
      shiftOnlyCount:registration.shiftOnlyCount,
      minOverlap:registration.minOverlap,
      interpretation:registration.interpretation
    }:null,
    holes,segments,markers,grid:[columns,rows],printedGrid,
    threshold,darkFraction,quality,message};
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


/**
 * Import a reviewed physical photograph without discarding original cell data.
 * Physical trap holes remain in a namespaced reconstruction field, rather
 * than inventing an unsupported original cell category.
 * Native scanner evidence shows both start and end were tracked, but its
 * original relocation semantics have not been recovered. Treat simultaneous
 * marker approvals as a transaction, with neither changed if either is unsafe.
 *
 * Move approved markers BEFORE importing photographed walls. Otherwise a
 * newly photographed wall at a vacated default marker square is discarded
 * as "occupied". Never alter existing original marker fields.
 */
export function applyCaptureFindings(document,wallSuggestions,holeSuggestions,markers={}){
  if(!document||!Array.isArray(document.data?.cells))
    throw new TypeError("Expected maze document with data.cells");
  const prepared=JSON.parse(JSON.stringify(document));
  const width=Number(prepared.data.scale[0]),height=Number(prepared.data.scale[2]);
  const originalHoles=Array.isArray(prepared.repropagation?.physicalHoles)
    ?prepared.repropagation.physicalHoles:[];
  const holeTiles=new Set((holeSuggestions??[])
    .filter(h=>Number.isInteger(h.x)&&Number.isInteger(h.z))
    .map(h=>h.x+","+h.z));
  for(const entry of originalHoles)
    holeTiles.add(String(entry.position?.[0])+","+String(entry.position?.[2]));

  const roles=["entrance","exit"];
  const requested=roles.filter(type=>markers?.[type]!=null)
    .map(type=>({type,point:markers[type]}));
  const valid=point=>Number.isInteger(point?.x)&&Number.isInteger(point?.z)&&
    point.x>=0&&point.z>=0&&point.x<width&&point.z<height;
  const targetKey=point=>point.x+","+point.z;
  const markerTiles=new Set(requested.filter(({point})=>valid(point))
    .map(({point})=>targetKey(point)));
  let movedMarkers=0;
  // Preflight the complete proposed pair on the original arrangement.
  // An invalid pair must not leave Start and Finish in a hybrid state.
  const originals=new Map(requested.map(({type})=>[
    type,prepared.data.cells.filter(cell=>cell.type===type)
  ]));
  const distinct=markerTiles.size===requested.length;
  const unambiguous=[...originals.values()].every(cells=>cells.length<=1);
  const usable=requested.every(({type,point})=>valid(point)&&
    !holeTiles.has(targetKey(point))&&
    prepared.data.cells.every(cell=>{
      if(Number(cell.position?.[0])!==point.x||
          Number(cell.position?.[2])!==point.z)return true;
      if(cell.type===type)return true;
      // The opposite marker can vacate this square only if it has its own
      // approved destination different from its existing position.
      const departing=requested.find(candidate=>candidate.type===cell.type);
      return roles.includes(cell.type)&&departing&&
        targetKey(departing.point)!==targetKey(point);
    }));
  if(distinct&&unambiguous&&usable){
    const moving=requested.filter(({type,point})=>{
      const previous=originals.get(type)[0];
      return !previous||Number(previous.position?.[0])!==point.x||
        Number(previous.position?.[2])!==point.z;
    });
    const movingTypes=new Set(moving.map(({type})=>type));
    prepared.data.cells=prepared.data.cells.filter(cell=>!movingTypes.has(cell.type));
    for(const {type,point} of moving){
      const previous=originals.get(type)[0];
      prepared.data.cells.push(previous?
        {...previous,position:previous.position.map((value,index)=>
          index===0?String(point.x):index===2?String(point.z):value)}:
        {type,position:[String(point.x),"0",String(point.z)]});
    }
    movedMarkers=moving.length;
  }

  const safeWalls=wallSuggestions.filter(w=>
    !holeTiles.has(w.x+","+w.z)&&!markerTiles.has(w.x+","+w.z));
  const {maze,applied}=applyWallSuggestions(prepared,safeWalls);
  const byPosition=new Map(originalHoles.map(item=>[
    String(item.position?.[0])+","+String(item.position?.[2]),item
  ]));
  let added=0,skippedHoles=0;
  for(const hole of holeSuggestions??[]){
    if(!Number.isInteger(hole.x)||!Number.isInteger(hole.z)||
      hole.x<0||hole.z<0||hole.x>=width||hole.z>=height)continue;
    const key=hole.x+","+hole.z;
    if(byPosition.has(key))continue;
    // A photographed hole cannot silently cover an existing original object.
    if(maze.data.cells.some(cell=>
      Number(cell.position?.[0])===hole.x&&Number(cell.position?.[2])===hole.z&&
      !["floor","empty"].includes(cell.type))){
      skippedHoles++;continue;
    }
    byPosition.set(key,{position:[String(hole.x),"0",String(hole.z)],
      kind:"physical_floor_hole",source:"photograph_review"});
    added++;
  }
  maze.repropagation={...maze.repropagation,
    physicalHoles:[...byPosition.values()]};
  return {maze,appliedWalls:applied,annotatedHoles:added,movedMarkers,skippedHoles};
}
