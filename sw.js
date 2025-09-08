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
  './icona_app_192.jpg',
  './assets/risorsa_audio_avvio_app.mp3',
  './corpo_di_ricerca.jpg',
  './assets/gigante_puro.jpg',
  './assets/anomalo.png',
  './assets/gigante_carro.jpg',
  './assets/ape_titan_sound.mp3', './assets/commander_march_sound.mp3', './assets/flash_effect_sound.mp3', './assets/mutaform_sound.mp3',
  './assets/gigante_bestia.jpg', './assets/gigante_colossale.png', './assets/gigante_corazzato.png', './assets/gigante_femmina.jpg',
   './assets/gigante_martello.png', './assets/gigante_mascella.png',
   './assets/anomalo_1.png', './assets/anomalo_2.png', './assets/anomalo_3.png', './assets/anomalo_4.png'
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
