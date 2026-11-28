/**
 * Private, repeatable reconnaissance against a PUBLIC historical kit photograph.
 * This is NOT a labeled accuracy benchmark. Original photo bytes are never
 * committed, cached in GitHub artifacts, or included in diagnostic output.
 * Usage: node scripts/probe-seedling-photo.mjs temporary-512x512.rgba sha256
 */
import {readFileSync} from "node:fs";
import {warpSquarePixels,insetRectifiedBoard,homographyForCorners} from "../src/maze-capture.mjs";
import {suggestWalls} from "../src/maze-recognize.mjs";
import {suggestPrintedGridRefinement} from "../src/maze-grid-refine.mjs";
import {measurePaperLatticeEvidence} from "./measure-paper-lattice.mjs";

const SIZE=512;
// Approximate by inspection of the kit's photographed paper maze, not
// original-game calibrated corners. Vary the crop to expose registration risk.
const CORNERS=[
  {x:102,y:155},{x:440,y:172},{x:459,y:442},{x:70,y:441}
];
const variants=[
  {name:"outer-frame",margin:0},
  {name:"inset-4-percent",margin:.04},
  {name:"inset-8-percent",margin:.08},
  {name:"inset-12-percent",margin:.12}
];
// A measured comparison, not a search for a crop that makes the output
// cosmetically plausible. Six pixels of input uncertainty are around one third of a
// nominal cell on the photographed board, which occupies only part of the image. Translating
// the rectangle and changing individual handles probe distinct failure modes.
const cornerVariants=[
  {name:"all-right-6px",offsets:CORNERS.map(()=>({x:6,y:0}))},
  {name:"all-left-6px",offsets:CORNERS.map(()=>({x:-6,y:0}))},
  {name:"all-down-6px",offsets:CORNERS.map(()=>({x:0,y:6}))},
  {name:"all-up-6px",offsets:CORNERS.map(()=>({x:0,y:-6}))},
  {name:"top-left-in-6px",offsets:[{x:6,y:6},{x:0,y:0},{x:0,y:0},{x:0,y:0}]},
  {name:"top-left-out-6px",offsets:[{x:-6,y:-6},{x:0,y:0},{x:0,y:0},{x:0,y:0}]}
];
function wallOverlap(reference,other){
  let sharedWallTiles=0;
  for(const key of other)if(reference.has(key))sharedWallTiles++;
  const unionWallTiles=reference.size+other.size-sharedWallTiles;
  return {sharedWallTiles,unionWallTiles,
    intersectionOverUnion:unionWallTiles?sharedWallTiles/unionWallTiles:null};
}

/**
 * Compare detector repeatability while keeping the physical photograph fixed.
 * One-to-one nearest matching in the SOURCE photo prevents a cell shift from
 * masquerading as a missed circle. No label or original physical measurement is
 * implied. Only aggregate counts leave this function's callers.
 */
export function compareHoleRegistration(reference,observed,tolerancePixels=6) {
  if(!Array.isArray(reference)||!Array.isArray(observed)||
      !Number.isFinite(tolerancePixels)||tolerancePixels<=0||
      [...reference,...observed].some(h=>!Number.isFinite(h?.sourceX)||
        !Number.isFinite(h?.sourceY)||!Number.isInteger(h?.x)||
        !Number.isInteger(h?.z)))
    throw new TypeError("Expected hole centers in the source photograph");
  const pairs=[];
  for(let a=0;a<reference.length;a++)for(let b=0;b<observed.length;b++){
    const distance=Math.hypot(reference[a].sourceX-observed[b].sourceX,
      reference[a].sourceY-observed[b].sourceY);
    if(distance<=tolerancePixels)pairs.push({a,b,distance});
  }
  pairs.sort((a,b)=>a.distance-b.distance||a.a-b.a||a.b-b.b);
  const usedReference=new Set(),usedObserved=new Set();
  let unchangedCells=0,changedCells=0,distanceSum=0;
  for(const pair of pairs){
    if(usedReference.has(pair.a)||usedObserved.has(pair.b))continue;
    usedReference.add(pair.a);usedObserved.add(pair.b);
    distanceSum+=pair.distance;
    if(reference[pair.a].x===observed[pair.b].x&&
        reference[pair.a].z===observed[pair.b].z)unchangedCells++;
    else changedCells++;
  }
  const matched=usedReference.size;
  return {
    sourcePhotoTolerancePixels:tolerancePixels,
    baselineCandidates:reference.length,
    comparisonCandidates:observed.length,
    matchedSourcePhotoCenters:matched,
    missingBaselineCenters:reference.length-matched,
    unmatchedComparisonCenters:observed.length-matched,
    sameGridCell:unchangedCells,
    reassignedGridCell:changedCells,
    meanMatchedCenterDisplacementPixels:matched?
      Number((distanceSum/matched).toFixed(2)):null
  };
}

/**
 * Invert both stages of our artificial square crop into the ORIGINAL research
 * photograph's 512-pixel coordinate system. This prevents the same visible
 * hole from being counted as a detector miss merely because the manually
 * estimated crop moves it into another 18x18 square.
 */
function sourcePhotoHoles(holes,corners,margin=0) {
  const project=homographyForCorners(corners);
  const side=504;
  const low=side*margin, high=side*(1-margin)-1;
  return holes.map(h=>{
    const u=(low+(high-low)*(h.cx+.5)/side+.5)/side;
    const v=(low+(high-low)*(h.cy+.5)/side+.5)/side;
    const center=project(u,v);
    return {x:h.x,z:h.z,sourceX:center.x,sourceY:center.y};
  });
}

export function measurePhotoProposals(pixels,config={}) {
  if(pixels?.length!==SIZE*SIZE*4)
    throw new RangeError("Expected a 512 x 512 RGBA reference image");
  const corners=config.corners??CORNERS;
  const settings=config.variants??variants;
  const aligned=warpSquarePixels(pixels,SIZE,SIZE,corners,504);
  // Pixel evidence from one unlabeled original-kit photograph: report only
  // eligibility and fractional magnitude, never coordinates or image pixels.
  const fineRefinement=suggestPrintedGridRefinement(aligned,corners,SIZE,SIZE);
  const observations=[];
  for(const entry of settings){
    const image=insetRectifiedBoard(aligned,entry.margin);
    const result=suggestWalls(image);
    observations.push({
      variant:entry.name,
      marginPercent:entry.margin*100,
      quality:result.quality,
      wallTileCount:result.suggestions.length,
      candidateHoleCount:result.holes.length,
      markerCandidateCount:result.markers.length,
      detectedWallSpans:result.segments.length,
      printedGrid:result.printedGrid,
      // Independently measure faint paper-ink periodicity even if the
      // production recognizer declines to resolve it. NOT tile labels.
      paperInkEvidence:measurePaperLatticeEvidence(image),
      // Shifted tracing-grid sensitivity is aggregate, never pixel labels.
      registrationSensitivity:result.registrationSensitivity,
      // Aggregate only; original-photo pixels and layout stay private.
      wallCells:new Set(result.suggestions.map(cell=>cell.x+","+cell.z)),
      holeLocations:sourcePhotoHoles(result.holes,corners,entry.margin)
    });
  }
  const baseline=observations[0].wallCells;
  const baselineHoles=observations[0].holeLocations;
  const stability=observations.slice(1).map(item=>({
    versus:item.variant,...wallOverlap(baseline,item.wallCells),
    holeRegistration:compareHoleRegistration(baselineHoles,item.holeLocations)
  }));
  // The latest real-photograph run showed serious dependence on grid margins.
  // Investigate corner-placement error separately. We publish only aggregate
  // counts/overlap, not the original photograph or its inferred tile positions.
  const cornerStability=(config.cornerVariants??cornerVariants).map(variant=>{
    if(!Array.isArray(variant.offsets)||variant.offsets.length!==4||
      variant.offsets.some(v=>!Number.isFinite(v?.x)||!Number.isFinite(v?.y)))
      throw new TypeError("Each corner variant requires four finite offsets");
    const perturbed=corners.map((point,i)=>({
      x:point.x+variant.offsets[i].x,y:point.y+variant.offsets[i].y
    }));
    const sample=warpSquarePixels(pixels,SIZE,SIZE,perturbed,504);
    const result=suggestWalls(sample);
    const other=new Set(result.suggestions.map(cell=>cell.x+","+cell.z));
    return {
      versus:variant.name,
      maximumHandleDisplacementPixels:Number(Math.max(...variant.offsets
        .map(v=>Math.hypot(v.x,v.y))).toFixed(2)),
      wallTileCount:other.size,quality:result.quality,
      printedGridStatus:result.printedGrid?.status??"unresolved",
      registrationSensitivity:result.registrationSensitivity,
      ...wallOverlap(baseline,other),
      holeRegistration:compareHoleRegistration(baselineHoles,
        sourcePhotoHoles(result.holes,perturbed))
    };
  });
  return {
    imageSource:"Vat19 original Seedling kit product photograph (third-party)",
    labelStatus:"unlabeled historical product photograph; no accuracy claim",
    geometryStatus:"approximate manually estimated corners, not calibrated",
    fineRefinement:{
      eligible:!!fineRefinement,
      shiftCells:fineRefinement?.shiftCells??null,
      interpretation:"Unlabeled photograph only; a periodic sub-cell suggestion cannot verify original physical calibration or a whole-cell origin"
    },
    sourceImageIsIncluded:false,
    observed:observations.map(({wallCells,holeLocations,...rest})=>rest),
    sensitivityToGridCropping:stability,
    sensitivityToCornerPlacement:cornerStability
  };
}

if(process.argv[1]?.endsWith("probe-seedling-photo.mjs")){
  if(process.argv.length!==4)throw new Error("Expected raw RGBA path and source SHA-256");
  const bytes=readFileSync(process.argv[2]);
  const sha=process.argv[3];
  if(!/^[0-9a-f]{64}$/.test(sha))throw new Error("Expected validated source SHA-256");
  const report=measurePhotoProposals(bytes);
  console.log(JSON.stringify({sourceSha256:sha,...report},null,2));
}
