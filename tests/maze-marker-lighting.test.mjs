import test from "node:test";
import assert from "node:assert/strict";
import {detectColoredMarkers} from "../src/maze-markers.mjs";

// Authored synthetic pixel colors, not an uploaded or recovered Seedling image.
// Motivated by a real physical-board photograph: a dim maroon sticker can be
// substantially darker than a warm-lit charcoal wall. High red brightness by
// itself is poor evidence of a marker.
const SIDE=18*28,PITCH=28;

function dimMarkerControl(){
  const data=new Uint8ClampedArray(SIDE*SIDE*4);
  for(let y=0;y<SIDE;y++)for(let x=0;x<SIDE;x++){
    const col=Math.floor(x/PITCH),row=Math.floor(y/PITCH);
    const dx=x%PITCH,dy=y%PITCH;
    let color=[229,221,211];
    // A warm-lit charcoal wall at the upper edge is reddish but unsaturated.
    if(col>=10&&col<=13&&row===0&&dy<8)color=[158,122,95];
    // Sticker in a deliberately different corner than the reddish wall.
    // A white printed symbol interrupts the sticker's red-colored pixels.
    if(col===16&&row===17&&dx>=3&&dx<=24&&dy>=3&&dy<=24){
      color=[65,27,23];
      if(dx>=12&&dx<=14&&dy>=9&&dy<=18)color=[239,234,221];
    }
    if(col===1&&row===1&&dx>=4&&dx<=23&&dy>=4&&dy<=23)
      color=[101,148,143];
    data.set([...color,255],(y*SIDE+x)*4);
  }
  return {width:SIDE,height:SIDE,data};
}

function rotate(image){
  const {data,width:w,height:h}=image;
  const output=new Uint8ClampedArray(data.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const src=(y*w+x)*4,dst=(x*w+(w-1-y))*4;
    for(let c=0;c<4;c++)output[dst+c]=data[src+c];
  }
  return {width:w,height:h,data:output};
}

test("dark crimson printed sticker outranks warm reddish wooden wall",()=>{
  const found=detectColoredMarkers(dimMarkerControl());
  assert.deepEqual(found.map(f=>[f.color,f.x,f.z]),[
    ["red",16,17],["blue-green",1,1]
  ]);
});

test("color marker recognition follows the sticker through all four orientations",()=>{
  let scene=dimMarkerControl();
  for(let turns=0;turns<4;turns++){
    const found=detectColoredMarkers(scene);
    const red=found.find(f=>f.color==="red");
    const blue=found.find(f=>f.color==="blue-green");
    let redSpot=[red?.x,red?.z],blueSpot=[blue?.x,blue?.z];
    for(let j=0;j<turns;j++){
      [redSpot[0],redSpot[1]]=[redSpot[1],17-redSpot[0]];
      [blueSpot[0],blueSpot[1]]=[blueSpot[1],17-blueSpot[0]];
    }
    assert.deepEqual(redSpot,[16,17]);
    assert.deepEqual(blueSpot,[1,1]);
    scene=rotate(scene);
  }
});
