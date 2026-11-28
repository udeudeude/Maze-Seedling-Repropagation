import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewCellAt,reviewPixelAt,centeredReviewScroll} from "../src/maze-scan-viewport.mjs";
import {holeForPhotoReview} from "../src/maze-scan-evaluation.mjs";

test("the same photographed tile is selected at every zoom and pan position",()=>{
  const cols=18,rows=18;
  for(const zoom of [1,2,3,4]){
    const canvasSize=320*zoom;
    for(const cell of [[0,0],[6,7],[17,17]]){
      // A scrolled image changes the bounding rectangle, not the cell.
      const panX=zoom>1?155:0,panY=zoom>1?210:0;
      const rect={left:12-panX,top:40-panY,width:canvasSize,height:canvasSize};
      const x=rect.left+(cell[0]+.5)*canvasSize/cols;
      const y=rect.top+(cell[1]+.5)*canvasSize/rows;
      assert.deepEqual(reviewCellAt(rect,x,y,cols,rows),{x:cell[0],z:cell[1]});
      assert.equal(reviewCellAt(rect,rect.left-2,y,cols,rows),null);
      assert.equal(reviewCellAt(rect,rect.left+rect.width,y,cols,rows),null);
    }
  }
});

test("zooming keeps current photograph center anchored, including zoom back out",()=>{
  const inZoom=centeredReviewScroll({scrollLeft:0,scrollTop:0,
    contentWidth:320,contentHeight:320,viewportWidth:320,viewportHeight:320,
    nextWidth:1280,nextHeight:1280});
  assert.deepEqual(inZoom,{left:480,top:480});
  const more=centeredReviewScroll({scrollLeft:300,scrollTop:470,
    contentWidth:960,contentHeight:960,viewportWidth:320,viewportHeight:320,
    nextWidth:1280,nextHeight:1280});
  assert.ok(Math.abs(more.left-453.3333333333333)<1e-6);
  assert.ok(Math.abs(more.top-680)<1e-6);
  const back=centeredReviewScroll({scrollLeft:750,scrollTop:950,
    contentWidth:1280,contentHeight:1280,viewportWidth:320,viewportHeight:320,
    nextWidth:320,nextHeight:320});
  assert.deepEqual(back,{left:0,top:0});
  assert.throws(()=>centeredReviewScroll({contentWidth:0}),TypeError);
  assert.throws(()=>reviewCellAt(null,1,2,18,18),TypeError);
});

test("review magnification is for actual correction, not detector or layout scaling",()=>{
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const css=readFileSync(new URL("../style.css",import.meta.url),"utf8");
  const worker=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  assert.match(html,/id="scanViewport"/);
  assert.match(html,/id="scanSurface"/);
  assert.match(html,/id="scanPanButton"/);
  assert.match(app,/reviewCellAt\(event\.currentTarget\.getBoundingClientRect\(\)/);
  assert.match(app,/if\(scanPan\)\{/);
  assert.match(app,/scanViewport\.scrollLeft=scanDrag\.left-/);
  assert.match(app,/scanSurface\.style\.width=scanZoom\*100\+"%"/);
  assert.match(css,/#scanViewport\{[^}]*overflow:auto/);
  assert.match(worker,/maze-scan-viewport\.mjs/);
});

test("manual hole centers stay at the touched image pixel across zoom and scrolling",()=>{
  const width=504,height=504,columns=18,rows=18;
  const expected={cx:60.75,cy:135.25};
  for(const zoom of [1,2,3,4]){
    const rect={left:11-zoom*27,top:83-zoom*34,
      width:width*zoom,height:height*zoom};
    const atX=rect.left+expected.cx*zoom;
    const atY=rect.top+expected.cy*zoom;
    const point=reviewPixelAt(rect,atX,atY,width,height);
    const cell=reviewCellAt(rect,atX,atY,columns,rows);
    const hole=holeForPhotoReview([],{...cell,...point,width,height,columns,rows});
    assert.deepEqual(cell,{x:2,z:4});
    assert.ok(Math.abs(hole.cx-expected.cx)<1e-8);
    assert.ok(Math.abs(hole.cy-expected.cy)<1e-8);
    assert.notEqual(hole.cx,(cell.x+.5)*width/columns);
  }
});
