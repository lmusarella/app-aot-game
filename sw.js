// sw.js - Service Worker base per PWA
const CACHE_NAME = 'aot-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './aot_db.json',
  './manifest.json',
  './favicon.png',
  './icona_app_512.jpg',
  './icona_app_192.jpg'
];

// Installazione: cache iniziale
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Attivazione: pulizia cache vecchie
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first per gli asset, network-first per il resto
self.addEventListener('fetch', (event) => {
  const req = event.request;
  event.respondWith((async () => {
    const url = new URL(req.url);
    const isAsset = ASSETS.some((a) => url.pathname.endsWith(a.replace('./', '/')));

    if (isAsset) {
      const cached = await caches.match(req);
      return cached || fetch(req);
    }

    try {
      const network = await fetch(req);
      if (req.method === 'GET') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, network.clone());
      }
      return network;
    } catch {
      return caches.match(req) || caches.match('./index.html');
    }
  })());
});
