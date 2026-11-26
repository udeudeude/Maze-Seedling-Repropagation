/* Original, procedural architecture for the four recovered maze themes.
 * No proprietary Seedling models, textures or copied shader code are used.
 * Canvas-only: drawing never modifies or persists a maze document.
 */
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export const environmentKind=kind=>
  ["adventure","hedge","marble_maze","space"].includes(kind)?kind:"marble_maze";

/** Horizon and perspective floor cues, drawn once per eye behind the walls. */
export function drawWorldBackdrop(ctx,theme,left,width,height,horizon){
  const kind=environmentKind(theme),center=left+width/2;
  const ground={
    adventure:"rgba(40,28,17,.27)",hedge:"rgba(18,44,23,.28)",
    marble_maze:"rgba(84,58,45,.27)",space:"rgba(9,25,39,.46)"
  }[kind];
  const edge={
    adventure:"rgba(245,206,135,.26)",hedge:"rgba(173,222,132,.21)",
    marble_maze:"rgba(255,229,179,.36)",space:"rgba(92,239,221,.40)"
  }[kind];
  ctx.save();
  ctx.lineWidth=Math.max(.8,height/500);
  for(const d of [1.4,2.3,3.5,5.3,8.4,13.5,21]){
    const y=horizon+height*.39/d;
    if(y<horizon||y>height)continue;
    ctx.globalAlpha=clamp(1-d/30,.16,.8);
    ctx.strokeStyle=ground;ctx.beginPath();
    ctx.moveTo(left,y);ctx.lineTo(left+width,y);ctx.stroke();
  }
  ctx.globalAlpha=1;ctx.strokeStyle=edge;
  const lanes=kind==="space"?[-.75,-.24,.24,.75]:
    kind==="marble_maze"?[-.67,0,.67]:[-.62,.62];
  for(const lane of lanes){
    ctx.beginPath();ctx.moveTo(center,horizon);
    ctx.lineTo(center+lane*width*.75,height);ctx.stroke();
  }
  if(kind==="space"){
    // Ship hangar ceiling conduits and subtle ceiling indicator lamps.
    ctx.fillStyle="rgba(3,9,20,.27)";
    ctx.fillRect(left,0,width,Math.max(0,horizon*.14));
    ctx.strokeStyle="rgba(110,230,225,.29)";
    for(const v of [.16,.54,.83]){
      ctx.beginPath();ctx.moveTo(left,horizon*v);
      ctx.lineTo(left+width,horizon*v);ctx.stroke();
    }
    ctx.fillStyle="rgba(140,255,244,.28)";
    for(let i=0;i<9;i++){
      const u=((i*73+29)%101)/101,v=((i*47+13)%89)/89;
      ctx.fillRect(left+u*width,v*horizon,Math.max(1,width/430),Math.max(1,height/370));
    }
  }else if(kind==="adventure"){
    ctx.fillStyle="rgba(24,26,23,.22)";
    for(const v of [.14,.37,.68])
      ctx.fillRect(left,horizon*v,width,Math.max(1,height*.012));
  }else if(kind==="marble_maze"){
    ctx.strokeStyle="rgba(246,229,197,.23)";
    for(const v of [.2,.49,.78]){
      ctx.beginPath();ctx.moveTo(left,horizon*v);
      ctx.lineTo(left+width,horizon*v);ctx.stroke();
    }
  }else{
    // Hedge is outdoors: only faint distant cloud bands.
    ctx.strokeStyle="rgba(245,249,224,.23)";
    for(const v of [.16,.33]){
      ctx.beginPath();ctx.moveTo(left+width*.09,horizon*v);
      ctx.lineTo(left+width*.42,horizon*v);ctx.stroke();
    }
  }
  ctx.restore();
}

/** Perspective-projected material features; a few operations per ray column. */
export function drawWallDetail(ctx,theme,hit,x,top,width,height,visibility=1){
  if(!(height>2)||!Number.isFinite(top)||!Number.isFinite(x))return;
  const kind=environmentKind(theme);
  const u=clamp(Number(hit.texture)||0,0,1);
  const joint=Math.max(1,Math.min(2,height*.012));
  const close=hit.distance<13;
  ctx.save();ctx.globalAlpha=clamp(visibility,.18,1);
  if(kind==="adventure"){
    // Staggered stone courses with lintel highlights.
    ctx.fillStyle="#544732";
    for(const v of [.29,.58,.87])
      ctx.fillRect(x,top+height*v,width,joint);
    if(close){
      ctx.fillStyle="rgba(249,219,148,.19)";
      for(const v of [.29,.58,.87])
        ctx.fillRect(x,top+height*v+joint,width,joint*.6);
      const boundaries=[0,.29,.58,.87,1];
      ctx.fillStyle="#6d5737";
      for(let row=0;row<4;row++){
        const seam=(.32+(Math.abs(hit.cellX+hit.cellZ)%2)*.24+row*.29)%1;
        if(Math.abs(u-seam)<.024)
          ctx.fillRect(x,top+height*boundaries[row],width,
            height*(boundaries[row+1]-boundaries[row]));
      }
    }
  }else if(kind==="hedge"){
    // Organic interleaved foliage: intentionally avoids masonry lines.
    ctx.fillStyle="rgba(13,47,25,.48)";
    for(const v of [.21,.45,.72,.93]){
      const offset=Math.sin(u*31+hit.cellX*1.7+hit.cellZ*.9+v*13)*.048;
      ctx.fillRect(x,top+height*(v+offset),width,Math.max(1,height*.038));
    }
    if(close){
      ctx.fillStyle="rgba(181,226,117,.46)";
      for(const v of [.14,.37,.63,.84]){
        const leaf=Math.sin(u*53+v*79+hit.cellX*2+hit.cellZ*3);
        if(leaf>.18)
          ctx.fillRect(x,top+height*(v+leaf*.03),width,Math.max(1,height*.024));
      }
    }
  }else if(kind==="marble_maze"){
    // Inlaid stone panels and non-repeating quartz veins.
    ctx.fillStyle="rgba(65,52,47,.40)";
    for(const v of [.07,.91])
      ctx.fillRect(x,top+height*v,width,Math.max(1,height*.016));
    if(close){
      ctx.fillStyle="rgba(248,218,163,.50)";
      for(const v of [.084,.927])
        ctx.fillRect(x,top+height*v,width,Math.max(1,height*.008));
      const a=Math.sin(u*21+hit.cellX*2.13-hit.cellZ*.69);
      const b=Math.sin(u*37-hit.cellX*.7+hit.cellZ*1.31);
      if(a>.76||b<-.89){
        const v=.23+.55*(Math.sin(u*9+hit.cellZ)+1)/2;
        ctx.fillStyle="rgba(80,73,65,.31)";
        ctx.fillRect(x,top+height*v,width,Math.max(1,height*.12));
      }
    }
  }else{
    // Cruiser bulkheads: panel divisions, conduits, illuminated buses.
    ctx.fillStyle="rgba(8,24,38,.68)";
    for(const v of [.12,.84])
      ctx.fillRect(x,top+height*v,width,Math.max(1,height*.036));
    if(Math.abs(u-.5)<.027||u<.034||u>.966)
      ctx.fillRect(x,top,width,height);
    if(close){
      ctx.fillStyle="rgba(114,246,230,.58)";
      for(const v of [.15,.85])
        ctx.fillRect(x,top+height*v,width,Math.max(1,height*.012));
      if(Math.abs(u-.2)<.025||Math.abs(u-.8)<.025){
        ctx.fillStyle="rgba(107,246,241,.49)";
        ctx.fillRect(x,top+height*.22,width,height*.49);
      }
    }
  }
  if(hit.kind==="gate"){
    // The gate reads as a functional obstacle rather than another wall.
    ctx.fillStyle="rgba(14,20,28,.68)";
    for(const v of [.12,.31,.5,.69,.88])
      ctx.fillRect(x,top+height*v,width,Math.max(1,height*.025));
    if(u<.07||u>.93){
      ctx.fillStyle="rgba(255,219,146,.45)";
      ctx.fillRect(x,top,width,height);
    }
  }
  ctx.restore();
}
