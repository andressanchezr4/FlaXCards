// Service worker for the installable version: the app works offline after the first visit.
// The build replaces 0ba18c3ce3 with a hash of the page, so every new version gets a fresh cache.
const CACHE = 'karteikasten-0ba18c3ce3';
const FONTS = 'kk-fonts';
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('karteikasten-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin && req.mode === 'navigate') {
    // the page: the newest one when there is connection, so an update shows at once; the saved copy without
    // connection, or when the network takes more than 3 seconds to answer (it is then saved for next time)
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req, { ignoreSearch: true });
        const fresh = fetch(req).then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        });
        if (!hit) return fresh;
        const slow = new Promise((resolve) => setTimeout(() => resolve(hit), 3000));
        return Promise.race([fresh.catch(() => hit), slow]);
      })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    // the rest of the app (icons, manifest): answer from the cache at once and refresh it in the background
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req, { ignoreSearch: true });
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || fresh;
      })
    );
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONTS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      })
    );
  }
});
