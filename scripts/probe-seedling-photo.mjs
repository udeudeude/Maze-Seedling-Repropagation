/**
 * Private, repeatable reconnaissance against a PUBLIC historical kit photograph.
 * This is NOT a labeled accuracy benchmark. Original photo bytes are never
 * committed, cached in GitHub artifacts, or included in diagnostic output.
 * Usage: node scripts/probe-seedling-photo.mjs temporary-512x512.rgba sha256
 */
import {readFileSync} from "node:fs";
import {warpSquarePixels,insetRectifiedBoard} from "../src/maze-capture.mjs";
import {suggestWalls} from "../src/maze-recognize.mjs";

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

export function measurePhotoProposals(pixels,config={}) {
  if(pixels?.length!==SIZE*SIZE*4)
    throw new RangeError("Expected a 512 x 512 RGBA reference image");
  const corners=config.corners??CORNERS;
  const settings=config.variants??variants;
  const aligned=warpSquarePixels(pixels,SIZE,SIZE,corners,504);
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
      // Aggregate only; original-photo pixels and layout stay private.
      wallCells:new Set(result.suggestions.map(cell=>cell.x+","+cell.z))
    });
  }
  const baseline=observations[0].wallCells;
  const stability=observations.slice(1).map(item=>({
    versus:item.variant,...wallOverlap(baseline,item.wallCells)
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
      ...wallOverlap(baseline,other)
    };
  });
  return {
    imageSource:"Vat19 original Seedling kit product photograph (third-party)",
    labelStatus:"unlabeled historical product photograph; no accuracy claim",
    geometryStatus:"approximate manually estimated corners, not calibrated",
    sourceImageIsIncluded:false,
    observed:observations.map(({wallCells,...rest})=>rest),
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
