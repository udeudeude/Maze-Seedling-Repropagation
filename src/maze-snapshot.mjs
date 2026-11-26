/** The explorer's rendered view is encoded on-device, never automatically uploaded. */
export function snapshotFileName(name,date=new Date()) {
  if(!(date instanceof Date)||Number.isNaN(date.valueOf()))
    throw new TypeError("A valid date is required");
  const slug=String(name??"").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")
    .slice(0,48).replace(/-+$/g,"")||"my-maze";
  return slug+"-"+date.toISOString().slice(0,10)+".png";
}
export function sceneAsPng(canvas) {
  return new Promise((resolve,reject)=>{
    if(!canvas||!canvas.width||!canvas.height||typeof canvas.toBlob!=="function"){
      reject(new TypeError("A rendered canvas is required"));return;
    }
    try{
      canvas.toBlob(blob=>{
        if(blob&&blob.size>0&&blob.type==="image/png")resolve(blob);
        else reject(new Error("The browser could not encode this screenshot"));
      },"image/png");
    }catch(error){reject(error);}
  });
}
export function canShareSnapshot(navigatorObject,file) {
  try {
    return !!(file&&navigatorObject&&
      typeof navigatorObject.share==="function"&&
      typeof navigatorObject.canShare==="function"&&
      navigatorObject.canShare({files:[file]}));
  }catch{return false;}
}

/**
 * Add an independently drawn player card to a saved scene, never to live play.
 * Only invoked after a user opts in on the snapshot preview. No maze mutation.
 */
export function drawSnapshotPlayerBadge(ctx,player={},portrait=null) {
  const width=ctx?.canvas?.width,height=ctx?.canvas?.height;
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<80||height<80)
    throw new RangeError("A valid screenshot canvas is required");
  const name=typeof player?.name==="string"?
    player.name.replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,48):"";
  const hasPortrait=!!(portrait&&portrait.naturalWidth>0&&portrait.naturalHeight>0);
  if(!name&&!hasPortrait)return false;
  const inset=Math.max(8,Math.round(Math.min(width,height)*.018));
  const portraitSize=hasPortrait?Math.min(72,Math.round(height*.13)):0;
  const cardH=Math.min(height-inset*2,Math.max(52,portraitSize+inset*2));
  const cardW=Math.min(width-inset*2,Math.max(125,Math.min(360,width*.42)));
  const x=width-cardW-inset,y=height-cardH-inset;
  ctx.save();
  ctx.globalAlpha=.92;
  ctx.fillStyle="#14212b";ctx.fillRect(x,y,cardW,cardH);
  ctx.globalAlpha=1;
  ctx.strokeStyle="#e6b678";ctx.lineWidth=Math.max(1,Math.round(inset*.12));
  ctx.strokeRect(x+.5,y+.5,cardW-1,cardH-1);
  let textX=x+inset;
  if(hasPortrait){
    const imageX=x+inset,imageY=y+(cardH-portraitSize)/2;
    ctx.drawImage(portrait,imageX,imageY,portraitSize,portraitSize);
    ctx.strokeStyle="#d8c4aa";ctx.strokeRect(imageX,imageY,portraitSize,portraitSize);
    textX+=portraitSize+inset;
  }
  const available=Math.max(12,x+cardW-inset-textX);
  ctx.fillStyle="#d6b47e";ctx.textBaseline="middle";
  ctx.font="600 "+Math.max(9,Math.round(cardH*.15))+"px system-ui";
  ctx.fillText("PLAYER",textX,y+cardH*.30,available);
  ctx.fillStyle="#fff7e7";
  ctx.font="600 "+Math.max(12,Math.round(cardH*.23))+"px system-ui";
  ctx.fillText(name||"Explorer",textX,y+cardH*.64,available);
  ctx.restore();
  return true;
}
