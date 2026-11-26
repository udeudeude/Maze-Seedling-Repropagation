/**
 * Opt-in live camera preview helpers. No images or sampled frame data leave
 * the device. A conservative optional outline is only a framing suggestion,
 * not original Seedling board calibration or automatic document import.
 */
export function assessCameraFrame(frame) {
  const {width,height,data}=frame??{};
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<8||height<8
    ||data?.length!==width*height*4)
    throw new TypeError("Expected an RGBA camera frame of at least 8 by 8 pixels");
  const histogram=new Uint32Array(256);
  let total=0,sum=0,dark=0,clipped=0;
  const stride=Math.max(1,Math.floor(Math.sqrt(width*height/5000)));
  for(let y=0;y<height;y+=stride)for(let x=0;x<width;x+=stride){
    const i=(y*width+x)*4;
    if(data[i+3]<128)continue;
    const light=Math.round(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2]);
    histogram[light]++;sum+=light;total++;
    if(light<48)dark++;
    if(light>247)clipped++;
  }
  if(!total)return {level:"unknown",message:"No visible camera image yet."};
  const percentile=fraction=>{
    const target=Math.max(1,Math.ceil(total*fraction));
    let tally=0;
    for(let i=0;i<256;i++){tally+=histogram[i];if(tally>=target)return i;}
    return 255;
  };
  const mean=sum/total,spread=percentile(.9)-percentile(.1);
  let level="ready",message="Lighting looks usable. Center the board, then align its corners after capture.";
  if(mean<64||dark/total>.65){
    level="dark";message="Too dark for reliable wall contrast. Add even light and avoid strong shadows.";
  }else if(mean>225||clipped/total>.40){
    level="bright";message="Highlights are washed out. Reduce glare or move away from direct light.";
  }else if(spread<32){
    level="flat";message="Very little contrast is visible. Change the angle or lighting.";
  }
  return {level,message,mean:Number(mean.toFixed(1)),spread};
}

/** Guard a camera permission request that may finish after Cancel or navigation. */
export function createCameraSession(acquire) {
  if(typeof acquire!=="function")throw new TypeError("Camera acquisition must be a function");
  let token=0,stream=null;
  const release=media=>{
    if(media?.getTracks)for(const track of media.getTracks()){
      try{track.stop();}catch{}
    }
  };
  function stop(){token++;release(stream);stream=null;}
  return {
    async start(){
      stop();
      const request=token;
      const obtained=await acquire();
      if(request!==token){release(obtained);return null;}
      stream=obtained;
      return stream;
    },
    stop,
    getStream:()=>stream
  };
}

/**
 * Place detected pixel-space corners over an object-fit:contain video element.
 * Video pixels can be letterboxed inside a differently shaped preview box.
 * Never stretch the detected polygon to the element's aspect ratio.
 */
export function projectBoardOutline(corners, sourceWidth, sourceHeight, viewWidth, viewHeight) {
  if(!Array.isArray(corners)||corners.length!==4||
    corners.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))
    throw new TypeError("Expected four finite detected corners");
  if(![sourceWidth,sourceHeight,viewWidth,viewHeight].every(n=>
    Number.isFinite(n)&&n>0))throw new RangeError("Invalid preview dimensions");
  const scale=Math.min(viewWidth/sourceWidth,viewHeight/sourceHeight);
  const left=(viewWidth-sourceWidth*scale)/2;
  const top=(viewHeight-sourceHeight*scale)/2;
  return corners.map(p=>({x:left+p.x*scale,y:top+p.y*scale}));
}
