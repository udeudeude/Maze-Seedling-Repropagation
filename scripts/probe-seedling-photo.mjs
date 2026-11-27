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
  const stability=observations.slice(1).map(item=>{
    let agreement=0;
    for(const key of item.wallCells)if(baseline.has(key))agreement++;
    const union=baseline.size+item.wallCells.size-agreement;
    return {versus:item.variant,sharedWallTiles:agreement,
      unionWallTiles:union,intersectionOverUnion:union?agreement/union:null};
  });
  return {
    imageSource:"Vat19 original Seedling kit product photograph (third-party)",
    labelStatus:"unlabeled historical product photograph; no accuracy claim",
    geometryStatus:"approximate manually estimated corners, not calibrated",
    sourceImageIsIncluded:false,
    observed:observations.map(({wallCells,...rest})=>rest),
    sensitivityToGridCropping:stability
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
