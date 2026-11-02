// Service worker for the installable version: the app works offline after the first visit.
// The build replaces e4ac018122 with a hash of the page, so every new version gets a fresh cache.
const CACHE = 'karteikasten-e4ac018122';
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

// the daily reminder (Ajustes › Recordatorio diario): the server sends {body, lang} when the day's goal is not met
// yet at the hour chosen (competition/supabase/functions/send-reminders). A push must always show a notification.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const en = data.lang === 'en';
  const icon = new URL('icons/icon-192.png', self.registration.scope).href;
  event.waitUntil(
    self.registration.showNotification('FlaXCards', {
      body: String(data.body || (en ? 'Time for your words of the day!' : '¡Te esperan tus palabras de hoy!')).slice(0, 300),
      lang: en ? 'en' : 'es',
      icon,
      badge: icon,
      tag: 'flaxcards-reminder', // a newer reminder replaces the one still showing
    })
  );
});

// tapping it: the app if it is already open, else a new window of it
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(scope) && 'focus' in c);
      return open ? open.focus() : self.clients.openWindow(scope);
    })
  );
});
