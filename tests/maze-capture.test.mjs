import test from "node:test";
import assert from "node:assert/strict";
import {solveLinear,homographyForCorners,initialCorners,warpSquarePixels} from "../src/maze-capture.mjs";

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
