const CACHE="arrcc-v2";
const ASSETS=["./","./index.html","./styles.css","./app.js","./locales.js","./manifest.webmanifest"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{
    const copy=r.clone(); caches.open(CACHE).then(cache=>cache.put(e.request,copy)); return r;
  }).catch(()=>caches.match("./index.html"))));
});
