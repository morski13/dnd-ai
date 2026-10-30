// Leomund's Tiny Hut service worker: keeps the app's own files (code, styles, fonts, icons, dice textures)
// on the device, so screens open faster and the app starts quicker the next time.
// Pages and data are never stored here: they always come fresh from the server (they're private and live).
const CACHE = "tiny-hut-static-v1";
const STATIC = /^\/(_next\/static\/|icons\/|apple-icon|icon\.svg|favicon\.ico)/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !STATIC.test(url.pathname)) return;
  // These files have the version in their name, so a stored copy is always right: use it, else download and keep it.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === "basic") cache.put(req, res.clone()).catch(() => {});
    return res;
  })());
});
