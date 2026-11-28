/**
 * One controlled photographic-ink observation across two decode resolutions.
 *
 * This is an UNLABELED original-kit photograph, NOT a reconstruction benchmark.
 * Both versions come from the same pinned photograph and the same approximate
 * corners and crop; more pixels cannot fix a wrong calibration.
 * Report only aggregate contrasts and consistency, never source pixels,
 * original maze coordinates, tiles or images.
 */
import {readFileSync} from "node:fs";
import {warpSquarePixels,insetRectifiedBoard} from "../src/maze-capture.mjs";
import {measurePaperLatticeEvidence} from "./measure-paper-lattice.mjs";

const nominalCorners=[
  {x:102,y:155},{x:440,y:172},
  {x:459,y:442},{x:70,y:441}
];
function inspect(file,side){
  const data=readFileSync(file);
  if(data.byteLength!==side*side*4)
    throw new RangeError("Unexpected temporary original-photo byte count");
  const corners=nominalCorners.map(p=>({x:p.x*side/512,y:p.y*side/512}));
  const rectifiedSide=side===512?504:1008;
  const aligned=warpSquarePixels(data,side,side,corners,rectifiedSide);
  const rows=[];
  for(const margin of [0,.04,.08,.12]){
    const observed=measurePaperLatticeEvidence(insetRectifiedBoard(aligned,margin));
    const axes={};
    for(const key of ["columns","rows"]){
      const result=observed.observed[key];
      axes[key]={
        fullTentative:result.full?.tentative??false,
        fullMedianInkContrast:result.full?.bestMedianInkContrast??null,
        fullLinesAboveThreshold:result.full?.linesAbove2Point5GreyLevels??null,
        fullLineSites:result.full?.linesExamined??null,
        nearTentative:result.near?.tentative??false,
        farTentative:result.far?.tentative??false,
        crossBandConsistent:result.crossBandConsistent
      };
    }
    rows.push({marginPercent:margin*100,axes});
  }
  return {decodedSquarePixels:side,rectifiedPixels:rectifiedSide,
    manuallyEstimatedSamePhysicalCorners:true,observations:rows};
}
if(process.argv.length!==4)
  throw new Error("Expected two temporary RGBA images: 512 and 1024 pixels");
const low=inspect(process.argv[2],512),high=inspect(process.argv[3],1024);
console.log(JSON.stringify({
  source:"checksum-pinned original Vat19 physical Seedling kit photograph",
  sourcePhotoLabels:"none",
  calibration:"same unverified paper corners and four guessed crop insets",
  comparison:"Two spatial resamplings from one photograph; not independent scenes",
  originalPixelsOrTileCoordinatesPublished:false,
  low,high
},null,2));
