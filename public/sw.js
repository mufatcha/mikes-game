// School Wars service worker: makes the installed app open fast by keeping
// the game's files on the device. Pages always try the internet first so
// updates show up right away; the game itself needs internet to play.

const CACHE = "school-wars-v1";
const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>School Wars</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0d12;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:16px">
<div><img src="/icons/icon-192.png" width="96" height="96" alt="" style="border-radius:20px"><h1>You're offline</h1>
<p style="color:#a1a1aa">School Wars needs the internet to play with your friends.</p>
<button onclick="location.reload()" style="font-size:16px;padding:10px 20px;border-radius:10px;border:0;background:#facc15;font-weight:700">Try again</button></div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/icons/icon-192.png", "/icons/icon-512.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // the game server, fonts, etc.

  // Built files have unique names, so a saved copy is always right.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: internet first, then the last saved copy, then the offline screen.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(req)
            .then((hit) => hit || new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })),
        ),
    );
  }
});
