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
