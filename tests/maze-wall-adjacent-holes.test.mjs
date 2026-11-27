import test from 'node:test';
import assert from 'node:assert/strict';
import {findRoundHolesByEdges} from '../src/maze-shapes.mjs';

const cells=18,pitch=28,size=cells*pitch;
const center={x:9*pitch+14,y:12*pitch+14};

/** Independently created geometric control: one paper hole touching a block. */
function photograph({hole=true,wall=true,radius=10,wallDistance=8,dim=false}={}){
  const data=new Uint8ClampedArray(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const circle=hole&&Math.hypot(x-center.x,y-center.y)<radius;
    const strip=wall&&x>center.x-wallDistance-25&&
      x<center.x-wallDistance&&Math.abs(y-center.y)<45;
    const paperInk=x%pitch===0||y%pitch===0;
    const brightness=circle||strip?dim?39:15:paperInk?174:dim?209:230;
    data.set([brightness,brightness,brightness,255],(y*size+x)*4);
  }
  return {width:size,height:size,data};
}

const near=(entries,x=center.x,y=center.y)=>entries.filter(entry=>
  Math.hypot(entry.cx-x,entry.cy-y)<15);

function clockwise(image){
  const data=new Uint8ClampedArray(image.data.length);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const from=(y*size+x)*4,to=(x*size+(size-1-y))*4;
    for(let c=0;c<4;c++)data[to+c]=image.data[from+c];
  }
  return {...image,data};
}

test('recovers a partially obscured punched hole directly beside a wall',()=>{
  const source=photograph();
  const original=source.data.slice();
  const result=findRoundHolesByEdges(source);
  assert.equal(near(result).length,1,'A partly hidden dark hole must remain a candidate');
  assert.equal(result.length,1,'The wall must not create another fake hole');
  assert.deepEqual(source.data,original,'The scan cannot alter a source photograph');
});

test('a solid dark wall with grid ink never becomes a round hole',()=>{
  for(const wallDistance of [0,6,12,20,30]){
    const results=findRoundHolesByEdges(photograph({hole:false,wallDistance}));
    assert.deepEqual(results,[],`No false punched holes next to wall offset ${wallDistance}`);
  }
});

test('circular paper perforations are not confused with broad square blocks',()=>{
  const results=findRoundHolesByEdges(photograph({wall:false}));
  assert.equal(near(results).length,1);
  assert.equal(results.length,1);
});

test('wall-adjacent hole remains identifiable at four exact quarter-turns',()=>{
  let image=photograph();
  for(let turns=0;turns<4;turns++){
    const expected=Array.from({length:turns}).reduce(([x,y])=>
      [size-1-y,x],[center.x,center.y]);
    const results=findRoundHolesByEdges(image);
    assert.equal(near(results,...expected).length,1,
      `Hole not recognized after ${turns*90} degree rotation`);
    assert.equal(results.length,1);
    image=clockwise(image);
  }
});
