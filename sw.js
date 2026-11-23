/* Maze Repropagation: self-contained offline shell. Never cache camera images. */
const VERSION="maze-shell-2026-11-22-1";
const ASSETS=[
  "./","./index.html","./style.css","./manifest.webmanifest",
  "./src/app.mjs","./src/maze-document.mjs","./src/maze-world.mjs",
  "./src/maze-play.mjs","./src/maze-capture.mjs"
];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("maze-shell-")&&key!==VERSION).map(key=>caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.endsWith(".json")&&!url.pathname.endsWith("manifest.webmanifest"))return;
  if(event.request.mode==="navigate"){
    event.respondWith(fetch(event.request).then(response=>{
      if(response.ok){
        const copy=response.clone();
        caches.open(VERSION).then(cache=>cache.put("./index.html",copy)).catch(()=>{});
      }
      return response;
    }).catch(()=>caches.match("./index.html")));
  }else{
    event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
      if(response.ok&&url.pathname.startsWith(new URL(self.registration.scope).pathname)){
        const copy=response.clone();caches.open(VERSION).then(cache=>cache.put(event.request,copy));
      }
      return response;
    })));
  }
});
