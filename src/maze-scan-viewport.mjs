/**
 * Precise review of photographed Seedling mazes.
 *
 * Zooming changes only the displayed canvas dimensions. The source image,
 * detector, cell grid and reviewed labels retain their original coordinates.
 * Independent tests prevent a scrolled or magnified image from changing which
 * physical square a tap selects.
 */
export function reviewCellAt(rect,clientX,clientY,columns,rows) {
  if(!rect||![rect.left,rect.top,rect.width,rect.height,clientX,clientY]
    .every(Number.isFinite)||rect.width<=0||rect.height<=0||
    !Number.isInteger(columns)||!Number.isInteger(rows)||
    columns<1||rows<1)throw new TypeError("Invalid review geometry");
  const fx=(clientX-rect.left)/rect.width;
  const fy=(clientY-rect.top)/rect.height;
  if(fx<0||fx>=1||fy<0||fy>=1)return null;
  return {x:Math.floor(fx*columns),z:Math.floor(fy*rows)};
}

/** Preserve the same normalized image center while changing magnification. */
export function centeredReviewScroll({
  scrollLeft,scrollTop,contentWidth,contentHeight,
  viewportWidth,viewportHeight,nextWidth,nextHeight
}) {
  if(![scrollLeft,scrollTop,contentWidth,contentHeight,viewportWidth,
    viewportHeight,nextWidth,nextHeight].every(Number.isFinite)||
    [contentWidth,contentHeight,viewportWidth,viewportHeight,nextWidth,nextHeight]
      .some(n=>n<=0))throw new TypeError("Invalid zoom dimensions");
  const x=(scrollLeft+viewportWidth/2)/contentWidth;
  const y=(scrollTop+viewportHeight/2)/contentHeight;
  const clamp=(n,upper)=>Math.max(0,Math.min(Math.max(0,upper),n));
  return {
    left:clamp(x*nextWidth-viewportWidth/2,nextWidth-viewportWidth),
    top:clamp(y*nextHeight-viewportHeight/2,nextHeight-viewportHeight)
  };
}

/** Recover independent photograph point despite canvas display zoom or scroll. */
export function reviewPixelAt(rect,clientX,clientY,width,height){
  if(!rect||![rect.left,rect.top,rect.width,rect.height,clientX,clientY]
    .every(Number.isFinite)||rect.width<=0||rect.height<=0||
    !Number.isInteger(width)||!Number.isInteger(height)||
    width<1||height<1)throw new TypeError("Invalid review geometry");
  const fx=(clientX-rect.left)/rect.width,fy=(clientY-rect.top)/rect.height;
  if(fx<0||fy<0||fx>=1||fy>=1)return null;
  return {cx:fx*width,cy:fy*height};
}
