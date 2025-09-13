// sw.js - Service Worker base per PWA
const CACHE_NAME = 'aot-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',

  // === img/cards ===
  './assets/img/cards/fulmine.jpg',
  './assets/img/cards/logo.jpg',

  // === img/giganti ===
  './assets/img/giganti/anomalo_1.png',
  './assets/img/giganti/anomalo_2.png',
  './assets/img/giganti/anomalo_3.png',
  './assets/img/giganti/anomalo_4.png',
  './assets/img/giganti/anomalo_6.png',
  './assets/img/giganti/anomalo_7.png',
  './assets/img/giganti/anomalo_8.png',
  './assets/img/giganti/anomalo.png',
  './assets/img/giganti/gigante_bestia.jpg',
  './assets/img/giganti/gigante_carro.jpg',
  './assets/img/giganti/gigante_colossale.png',
  './assets/img/giganti/gigante_corazzato.png',
  './assets/img/giganti/gigante_femmina.jpg',
  './assets/img/giganti/gigante_martello.png',
  './assets/img/giganti/gigante_mascella.png',
  './assets/img/giganti/gigante_puro_1.png',
  './assets/img/giganti/gigante_puro_2.png',
  './assets/img/giganti/gigante_puro_3.png',
  './assets/img/giganti/gigante_puro_4.png',
  './assets/img/giganti/gigante_puro_5.png',
  './assets/img/giganti/gigante_puro_6.png',
  './assets/img/giganti/gigante_puro_7.png',
  './assets/img/giganti/gigante_puro_8.png',
  './assets/img/giganti/gigante_puro.jpg',

  // === img root ===
  './assets/img/erwin_popup_benvenuto.jpg',
  './assets/img/icona_app_192.jpg',
  './assets/img/icona_app_512.jpg',
  './assets/img/logo.jpg',
  './assets/img/wall_maria.png',
  './assets/img/wall_rose.jpg',
  './assets/img/wall_sina.jpg',
  // === sounds/carte ===
  './assets/sounds/carte/carta_consumabile.mp3',
  './assets/sounds/carte/carta_evento.mp3',

  // === sounds root ===
  './assets/sounds/ape_titan_sound.mp3',
  './assets/sounds/commander_march_sound.mp3',
  './assets/sounds/flash_effect_sound.mp3',
  './assets/sounds/mutaform_sound.mp3',
  './assets/sounds/risorsa_audio_avvio_app.mp3'
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
