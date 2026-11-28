import test from "node:test";
import assert from "node:assert/strict";
import {findRoundHolesByEdges} from "../src/maze-shapes.mjs";

const cells=18,pitch=20,size=cells*pitch;
const paperHole={x:7*pitch+10,y:8*pitch+10};
const marble={x:12*pitch+10,y:11*pitch+10};

function scene({highlight=true,smallHoleGlint=false,dim=false,hole=true,ball=true}={}){
  const data=new Uint8ClampedArray(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const holeR=Math.hypot(x-paperHole.x,y-paperHole.y);
    const ballR=Math.hypot(x-marble.x,y-marble.y);
    const ink=x%pitch===0||y%pitch===0;
    let shade=ink?(dim?139:163):(dim?206:234);
    if(hole&&holeR<8.8)shade=dim?25:20;
    if(hole&&smallHoleGlint&&Math.hypot(x-paperHole.x+2,y-paperHole.y+1)<1.25)
      shade=dim?192:244;
    if(ball&&ballR<8.8){
      shade=dim?34:42;
      if(highlight&&Math.hypot(x-marble.x+2,y-marble.y+1)<3.5)
        shade=dim?207:250;
    }
    data.set([shade,shade,shade,255],(y*size+x)*4);
  }
  return {width:size,height:size,data};
}
const hits=(results,center)=>results.filter(h=>
  Math.hypot(h.cx-center.x,h.cy-center.y)<9);

test("dark paper perforation survives beside a reflective steel marble",()=>{
  const image=scene(),before=image.data.slice();
  const found=findRoundHolesByEdges(image);
  assert.equal(hits(found,paperHole).length,1,"Must keep a genuine hole");
  assert.equal(hits(found,marble).length,0,"Reflective steel ball must not masquerade as a trap");
  assert.deepEqual(image.data,before,"Photograph must not be modified");
});

test("a tiny bright fleck in a genuine punched hole is not enough to reject it",()=>{
  const found=findRoundHolesByEdges(scene({smallHoleGlint:true,ball:false}));
  assert.equal(hits(found,paperHole).length,1);
});

test("a dim but visibly reflective marble is still distinguished from a dark hole",()=>{
  const found=findRoundHolesByEdges(scene({dim:true}));
  assert.equal(hits(found,paperHole).length,1);
  assert.equal(hits(found,marble).length,0);
});

test("control: no detected hole when only reflective marble and paper are present",()=>{
  const found=findRoundHolesByEdges(scene({hole:false}));
  assert.equal(hits(found,marble).length,0);
});

test("uncertain dark round objects without a strong glint still require review",()=>{
  // Not a claim that every physical marble is optically recognizable:
  // removing its telltale reflection makes it indistinguishable from a hole.
  const found=findRoundHolesByEdges(scene({hole:false,highlight:false}));
  assert.ok(hits(found,marble).length>=1,
    "Without a specular signature the provisional detector must not claim certainty");
});

test("end-to-end photographic suggestions do not resurrect a reflective steel ball as a punched hole",()=>{
  const image=scene(),original=image.data.slice();
  const scanned=suggestWalls(image);
  assert.notEqual(scanned.quality,"low-contrast","The full image should be analyzed");
  assert.equal(hits(scanned.holes,paperHole).length,1,
    "The real dark perforation must remain detectable");
  assert.equal(hits(scanned.holes,marble).length,0,
    "The connected-component path must not bypass the reflective-marble exclusion");
  assert.deepEqual(image.data,original,"A full scanner pass must preserve source image pixels");
});
