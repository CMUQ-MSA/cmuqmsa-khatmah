/**
 * Khatmah - Service Worker
 * Caches app shell for offline use and faster repeat loads.
 *
 * Strategy: stale-while-revalidate for assets in the ASSETS allowlist.
 * IMPORTANT: bump CACHE_NAME whenever any file in ASSETS changes; the SWR
 * fetch handler will not detect content changes without a version bump.
 */
const CACHE_NAME = 'khatmah-v9';
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

function isCachableAsset(request) {
  if (request.mode === 'navigate') return true;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\//, '');
  return ASSETS.includes(path);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!isCachableAsset(req)) return;

  const cacheKey = req.mode === 'navigate' ? 'index.html' : req;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(cacheKey);

    const networkPromise = fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          cache.put(cacheKey, res.clone()).catch(() => {});
        }
        return res;
      })
      .catch(() => null);

    e.waitUntil(networkPromise);

    if (cached) return cached;
    const fresh = await networkPromise;
    if (fresh) return fresh;
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  })());
});
