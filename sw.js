/* Maze Repropagation: offline shell; photographs remain on the user's device. */
const VERSION="maze-shell-2026-11-27-14";
const ASSETS=[
  "./","./index.html","./style.css","./manifest.webmanifest",
  "./src/app.mjs","./src/maze-photo-reference.mjs","./src/maze-scan-viewport.mjs","./src/maze-scan-notice.mjs","./src/maze-scan-evaluation.mjs","./src/maze-brush.mjs","./src/maze-editor-tiles.mjs","./src/maze-printed-grid.mjs","./src/maze-document.mjs","./src/maze-world.mjs",
  "./src/maze-play.mjs","./src/maze-environments.mjs","./src/maze-route.mjs","./src/maze-capture.mjs","./src/maze-board-corners.mjs","./src/maze-live.mjs","./src/maze-recognize.mjs",
  "./src/maze-shapes.mjs",
  "./src/maze-grid-ink.mjs","./src/maze-registration-stability.mjs",
  "./src/maze-markers.mjs","./src/maze-library.mjs","./src/maze-orientation.mjs",
  "./src/maze-audio.mjs","./src/maze-media.mjs","./src/maze-voice.mjs",
  "./src/maze-snapshot.mjs","./src/maze-backup.mjs","./src/maze-avatar.mjs",
  "./src/maze-storage.mjs"
];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(VERSION)
    .then(cache=>cache.addAll(ASSETS))
    .then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys
      .filter(key=>key.startsWith("maze-shell-")&&key!==VERSION)
      .map(key=>caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.endsWith(".json")&&!url.pathname.endsWith("manifest.webmanifest"))return;
  const scope=new URL(self.registration.scope).pathname;
  if(!url.pathname.startsWith(scope))return;
  if(event.request.mode==="navigate"){
    event.respondWith(fetch(event.request).then(response=>{
      if(response.ok){
        const copy=response.clone();
        event.waitUntil(caches.open(VERSION).then(cache=>cache.put("./index.html",copy)));
      }
      return response;
    }).catch(()=>caches.match("./index.html")));
    return;
  }
  // Network first keeps published JavaScript current without needing another
  // manual cache-version bump every time. Cached files provide offline fallback.
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){
      const copy=response.clone();
      event.waitUntil(caches.open(VERSION).then(cache=>cache.put(event.request,copy)));
    }
    return response;
  }).catch(async()=>{
    const cached=await caches.match(event.request);
    return cached??Response.error();
  }));
});
