/**
 * Khatmah - Service Worker
 * Caches app shell for offline use and faster repeat loads.
 */
const CACHE_NAME = 'khatmah-v8';
const ASSETS = [
  'index.html',
  'styles.css',
  'app.js',
  'khatmah_logo.png',
  'icon-192.png',
  'icon-512.png',
  'manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  const cacheKey = e.request.mode === 'navigate' ? 'index.html' : e.request;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, clone));
        }
        return response;
      })
      .catch(() => caches.match(cacheKey))
  );
});
