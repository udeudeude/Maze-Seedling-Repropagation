import test from "node:test";
import assert from "node:assert/strict";
import {solveLinear,homographyForCorners,initialCorners,warpSquarePixels,insetRectifiedBoard} from "../src/maze-capture.mjs";
import {readFileSync} from "node:fs";

const close=(actual,expected,tol=1e-7)=>assert.ok(Math.abs(actual-expected)<tol,actual+" ≠ "+expected);

test("solves 8-variable linear systems with pivoting",()=>{
  assert.deepEqual(solveLinear([[0,1],[3,2]],[5,13]).map(Math.round),[1,5]);
  assert.throws(()=>solveLinear([[1,1],[1,1]],[2,3]));
});

test("identity square geometry preserves four corners",()=>{
  const corner=[{x:0,y:0},{x:10,y:0},{x:10,y:20},{x:0,y:20}];
  const apply=homographyForCorners(corner);
  for(const [u,v,x,y] of [[0,0,0,0],[1,0,10,0],[1,1,10,20],[0,1,0,20],[.5,.5,5,10]]){
    const actual=apply(u,v);close(actual.x,x);close(actual.y,y);
  }
});

test("skewed trapezoid aligns endpoints correctly",()=>{
  const corner=[{x:13,y:5},{x:90,y:8},{x:120,y:120},{x:7,y:112}];
  const apply=homographyForCorners(corner);
  [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{
    close(apply(u,v).x,corner[i].x);close(apply(u,v).y,corner[i].y);
  });
});

test("perspective warp retains a constant source value",()=>{
  const width=30,height=30;
  const bytes=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<bytes.length;i+=4){bytes.set([25,50,75,255],i);}
  const warped=warpSquarePixels(bytes,width,height,
    [{x:0,y:0},{x:29,y:0},{x:29,y:29},{x:0,y:29}],18);
  assert.equal(warped.width,18);
  for(let i=0;i<warped.data.length;i+=4)
    assert.deepEqual([...warped.data.slice(i,i+4)],[25,50,75,255]);
});

test("photo corner defaults avoid unadjustable edge handles",()=>{
  const c=initialCorners(1000,500);
  assert.deepEqual(c,[{x:80,y:40},{x:920,y:40},{x:920,y:460},{x:80,y:460}]);
  assert.throws(()=>homographyForCorners([]),TypeError);
});


test("playable grid margin removes symmetric board border without altering the photograph",()=>{
  const width=80,data=new Uint8ClampedArray(width*width*4);
  for(let y=0;y<width;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,edge=x<8||x>=72||y<8||y>=72;
    data.set(edge?[15,15,15,255]:[235,235,235,255],i);
  }
  const source={width,height:width,data},before=data.slice();
  const unchanged=insetRectifiedBoard(source,0);
  assert.deepEqual(unchanged.data,data);
  assert.notStrictEqual(unchanged.data,data);
  const inner=insetRectifiedBoard(source,.1);
  assert.equal(inner.width,80);
  for(const [x,y] of [[0,0],[79,0],[0,79],[79,79],[40,40]]){
    const i=(y*width+x)*4;
    assert.ok(inner.data[i]>220,"Border survived at "+x+","+y);
  }
  assert.deepEqual(data,before,"Scanning must never rewrite the source photo");
});

test("playable grid margin rejects unsafe or unaligned crops",()=>{
  const image={width:16,height:16,data:new Uint8ClampedArray(16*16*4)};
  for(const margin of [-.01,.21,NaN,Infinity])
    assert.throws(()=>insetRectifiedBoard(image,margin),RangeError);
  assert.throws(()=>insetRectifiedBoard({width:20,height:19,data:new Uint8ClampedArray(20*19*4)},.1),TypeError);
});

test("capture shows and recalculates a correctable playable-grid margin",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  assert.match(html,/id="gridInsetSlider"[^>]*min="0" max="20"/);
  assert.match(html,/id="gridInsetValue"/);
  assert.match(app,/insetRectifiedBoard\(scanBoardPixels,/);
  assert.match(app,/el\("gridInsetSlider"\)\.addEventListener\("change"/);
  assert.match(app,/scanPixels=null;scanGuide=null;scanResult=null;scanSelected.clear\(\)/);
});
