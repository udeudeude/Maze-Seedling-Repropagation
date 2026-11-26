import test from "node:test";
import assert from "node:assert/strict";
import {suggestBoardCorners} from "../src/maze-board-corners.mjs";

function sample(width=480,height=360,corners=[
  {x:82,y:46},{x:396,y:59},{x:416,y:319},{x:62,y:300}
],inside=true){
  const data=new Uint8ClampedArray(width*height*4);
  const contained=(x,y)=>{
    for(let i=0;i<4;i++){
      const a=corners[i],b=corners[(i+1)%4];
      if((b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x)<0)return false;
    }
    return true;
  };
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const onBoard=inside&&contained(x,y);
    // Grid ink and charcoal wall strips interrupt the light paper in places.
    const grid=x%26===0||y%26===0;
    const wall=x>220&&x<230&&y>125&&y<215;
    const color=onBoard?(wall?26:grid?159:228):51;
    data.set([color,color,color,255],(y*width+x)*4);
  }
  return {width,height,data};
}
test("finds skewed board corners despite grid lines and charcoal walls",()=>{
  const expected=[{x:82,y:46},{x:396,y:59},{x:416,y:319},{x:62,y:300}];
  const result=suggestBoardCorners(sample(480,360,expected));
  assert.ok(result,"No conservative board estimate found");
  for(let i=0;i<4;i++)
    assert.ok(Math.hypot(result.corners[i].x-expected[i].x,
      result.corners[i].y-expected[i].y)<15,
      "Poor corner "+i+": "+JSON.stringify(result.corners[i]));
  assert.ok(result.edgeContrast>80);
});
test("finds a board even when the camera is in portrait orientation",()=>{
  const expected=[{x:53,y:75},{x:300,y:58},{x:316,y:398},{x:43,y:410}];
  const result=suggestBoardCorners(sample(360,480,expected));
  assert.ok(result);
  for(let i=0;i<4;i++)
    assert.ok(Math.hypot(result.corners[i].x-expected[i].x,
      result.corners[i].y-expected[i].y)<18);
});
test("rejects featureless or edge-to-edge photographs without moving corners",()=>{
  for(const [width,height,inside] of [[480,360,false],[480,360,true]]){
    const image=sample(width,height,undefined,inside);
    if(inside){
      image.data.fill(224);
      for(let i=3;i<image.data.length;i+=4)image.data[i]=255;
    }
    assert.equal(suggestBoardCorners(image),null);
  }
});
test("rejects malformed and undersized images",()=>{
  assert.throws(()=>suggestBoardCorners(null),TypeError);
  assert.throws(()=>suggestBoardCorners({width:100,height:100,data:[]}),TypeError);
  const small=sample(80,80);
  assert.throws(()=>suggestBoardCorners(small),TypeError);
});
test("no evidence means no proposal, including a smooth horizontal gradient",()=>{
  const image=sample(480,360,undefined,false);
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
    const c=Math.round(50+170*x/image.width);
    image.data.set([c,c,c,255],(y*image.width+x)*4);
  }
  assert.equal(suggestBoardCorners(image),null);
});
