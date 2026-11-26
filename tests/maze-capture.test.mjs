import test from "node:test";
import assert from "node:assert/strict";
import {solveLinear,homographyForCorners,initialCorners,warpSquarePixels,insetRectifiedBoard,suggestPlayableGridEdges} from "../src/maze-capture.mjs";
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

test("uneven physical-board margins independently crop all four sides",()=>{
  const width=100,data=new Uint8ClampedArray(width*width*4);
  for(let y=0;y<width;y++)for(let x=0;x<width;x++){
    const border=x<14||x>=92||y<5||y>=83;
    data.set(border?[12,12,12,255]:[225,225,225,255],(y*width+x)*4);
  }
  const before=data.slice(),source={width,height:width,data};
  const equal=insetRectifiedBoard(source,.08);
  assert.ok(equal.data[0]<100,"An equal margin cannot fix an uneven left border");
  const fixed=insetRectifiedBoard(source,{top:.05,right:.08,bottom:.17,left:.14});
  for(const [x,y] of [[0,0],[99,0],[0,99],[99,99],[50,50]])
    assert.ok(fixed.data[(y*width+x)*4]>210,"Dark border survived at "+x+","+y);
  assert.deepEqual(data,before,"Individual crop must not change original photograph");
});

test("per-edge calibration rejects missing, inverted and invalid margins",()=>{
  const image={width:32,height:32,data:new Uint8ClampedArray(32*32*4)};
  const okay={top:0,right:.05,bottom:.1,left:.2};
  assert.equal(insetRectifiedBoard(image,okay).width,32);
  for(const edges of [
    {...okay,top:-.01},{...okay,bottom:.201},{...okay,right:NaN},
    {...okay,left:Infinity},{top:.05,right:.05,bottom:.05},
    {...okay,other:0},null,[0,0,0,0]
  ])assert.throws(()=>insetRectifiedBoard(image,edges),RangeError);
});

test("capture shows and recalculates a correctable playable-grid margin",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  assert.match(html,/id="gridInsetSlider"[^>]*min="0" max="20"/);
  assert.match(html,/id="gridInsetValue"/);
  assert.match(app,/insetRectifiedBoard\(scanBoardPixels,/);
  assert.match(app,/el\("gridInsetSlider"\)\.addEventListener\("change"/);
  assert.match(app,/scanPixels=null;scanGuide=null;scanResult=null;scanSelected.clear\(\)/);
  for(const edge of ["Top","Right","Bottom","Left"]){
    assert.match(html,new RegExp('id="gridInset'+edge+'Slider"'));
    assert.match(html,new RegExp('id="gridInset'+edge+'Value"'));
  }
  assert.match(app,/const gridEdges=\["Top","Right","Bottom","Left"\]/);
  assert.match(app,/el\("gridInset"\+edge\+"Slider"\)/);
  assert.match(html,/id="gridEdgeDetails"/);
  assert.match(app,/slider.addEventListener\("change",restartAlignedScan\)/);
});


function borderFixture({width=504,edges={},green=false,grid=true,wall=true,gradient=false}={}){
  const data=new Uint8ClampedArray(width*width*4);
  for(let y=0;y<width;y++)for(let x=0;x<width;x++){
    const border=x<width*(edges.left??0)/100||
      x>=width*(1-(edges.right??0)/100)||
      y<width*(edges.top??0)/100||
      y>=width*(1-(edges.bottom??0)/100);
    const printed=grid&&(x%28===0||y%28===0);
    const wallBlock=wall&&x>=width*.40&&x<width*.43&&
      y>=width*.26&&y<width*.72;
    const rgb=border?(green?[125,187,115]:[18,21,24]):
      wallBlock?[28,29,32]:printed?[165,160,149]:
      gradient?[230-x/width*75,230-x/width*75,224-x/width*75]:
      [232,230,220];
    data.set([...rgb,255],(y*width+x)*4);
  }
  return {width,height:width,data};
}
test("offers independent border suggestions amid printed grid lines and wall blocks",()=>{
  const result=suggestPlayableGridEdges(borderFixture({
    edges:{top:5,right:9,bottom:17,left:14}}));
  assert.ok(result);
  for(const [side,expected] of Object.entries({top:5,right:9,bottom:17,left:14}))
    assert.ok(Math.abs(result.edges[side]-expected)<=1,
      side+": "+JSON.stringify(result));
  assert.equal(result.detected.length,4);
});
test("suggests colored borders without assuming charcoal edges",()=>{
  const result=suggestPlayableGridEdges(borderFixture({
    edges:{top:8,right:10,bottom:5,left:12},green:true}));
  assert.ok(result);
  for(const [side,expected] of Object.entries({top:8,right:10,bottom:5,left:12}))
    assert.ok(Math.abs(result.edges[side]-expected)<=1,
      side+": "+JSON.stringify(result));
});
test("only proposes supported edges, never fabricating margins for clear sides",()=>{
  const result=suggestPlayableGridEdges(borderFixture({edges:{left:12,bottom:8}}));
  assert.ok(result);
  assert.ok(Math.abs(result.edges.left-12)<=1);
  assert.ok(Math.abs(result.edges.bottom-8)<=1);
  assert.equal(result.edges.top,0);
  assert.equal(result.edges.right,0);
});
test("refuses grids without borders and smooth lighting gradients",()=>{
  assert.equal(suggestPlayableGridEdges(borderFixture()),null);
  assert.equal(suggestPlayableGridEdges(borderFixture({grid:false,wall:false})),null);
  assert.equal(suggestPlayableGridEdges(borderFixture({
    grid:false,wall:false,gradient:true})),null);
});
test("border estimator preserves source pixels and validates input dimensions",()=>{
  const image=borderFixture({edges:{left:9}}),before=image.data.slice();
  suggestPlayableGridEdges(image);
  assert.deepEqual(image.data,before);
  for(const invalid of [null,
    {width:90,height:90,data:new Uint8Array(90*90*4)},
    {width:504,height:503,data:new Uint8Array(504*503*4)}])
    assert.throws(()=>suggestPlayableGridEdges(invalid),TypeError);
});
test("border proposal is explicitly user-invoked and rechecks all manual corrections",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  assert.match(html,/id="suggestGridEdgesButton"/);
  assert.match(html,/id="edgeSuggestionStatus"/);
  assert.match(app,/suggestPlayableGridEdges\(scanBoardPixels\)/);
  assert.match(app,/el\("suggestGridEdgesButton"\)\.addEventListener\("click"/);
  assert.match(app,/restartAlignedScan\(\)/);
  assert.match(app,/proposal\.detected\.includes\(side\)\?proposal\.edges\[side\]/);
  assert.match(app,/Number\(el\("gridInset"\+edge\+"Slider"\)\.value\)/);
});
