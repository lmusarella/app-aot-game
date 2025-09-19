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

  "assets/img/reclute/armin_arlet.png",
  "assets/img/reclute/connie_springer.png",
  "assets/img/reclute/sasha_braus.png",
  "assets/img/reclute/reiner_braun.png",
  "assets/img/reclute/bertholdt_hoover.png",
  "assets/img/reclute/annie_leonhart.png",
  "assets/img/reclute/ymir.png",
  "assets/img/reclute/historia_reiss.png",
  "assets/img/reclute/marco_bodt.png",
  "assets/img/reclute/marlo_freudeberg.png",
  "assets/img/reclute/hitch.png",
  "assets/img/reclute/rico_brezenska.png",
  "assets/img/reclute/mikasa.png",
  "assets/img/reclute/jean_kirsten.png",
  "assets/img/reclute/flock.png",
  "assets/img/reclute/eren.png",
  "assets/img/comandanti/hange.png",
  "assets/img/comandanti/mike.png",
  "assets/img/comandanti/erwin.png",
  "assets/img/comandanti/levi.png",
  "assets/img/comandanti/sadis.png",
  "assets/img/mura/wall_maria.png",
  "assets/img/mura/wall_rose.jpg",
  "assets/img/mura/wall_sina.jpg",
  // === img root ===
  './assets/img/comandanti/erwin_popup_benvenuto.jpg',
  './assets/img/icona_app_192.jpg',
  './assets/img/icona_app_512.jpg',
  './assets/img/logo.jpg',

  // === sounds/carte ===
  './assets/sounds/carte/carta_consumabile.mp3',
  './assets/sounds/carte/carta_evento.mp3',

  // === sounds root ===
  "./assets/sounds/ape_titan_sound.mp3",
  "./assets/sounds/commander_march_sound.mp3",
  "./assets/sounds/female_titan.mp3",
  "./assets/sounds/flash_effect_sound.mp3",
  "./assets/sounds/gigante_anomalo_rod.mp3",
  "./assets/sounds/giganti_puri.mp3",
  "./assets/sounds/mutaform_sound.mp3",
  "./assets/sounds/attacco_gigante.mp3",
  "./assets/sounds/attacco_uomo.mp3",
  "./assets/sounds/attacco_donna.mp3",
  "./assets/sounds/morte_umano.mp3",
  "./assets/sounds/morte_gigante.mp3",
  "./assets/sounds/risorsa_audio_avvio_app.mp3",
  "./assets/sounds/muro_distrutto.mp3",
  "./assets/sounds/reclute/annie_presentazione.mp3",
  "./assets/sounds/reclute/armin_presentazione.mp3",
  "./assets/sounds/reclute/bertold_presentazione.mp3",
  "./assets/sounds/reclute/conny_presentazione.mp3",
  "./assets/sounds/reclute/eren_presentazione.mp3",
  "./assets/sounds/reclute/flock_presentazione.mp3",
  "./assets/sounds/reclute/historia_presentazione.mp3",
  "./assets/sounds/reclute/hitch_presentazione.mp3",
  "./assets/sounds/reclute/jean_presentazione.mp3",
  "./assets/sounds/reclute/marco_presentazione.mp3",
  "./assets/sounds/reclute/marlo_presentazione.mp3",
  "./assets/sounds/reclute/mikasa_presentazione.mp3",
  "./assets/sounds/reclute/morte_recluta_comandante.mp3",
  "./assets/sounds/reclute/reiner_presentazione.mp3",
  "./assets/sounds/reclute/rico_presentazione.mp3",
  "./assets/sounds/reclute/sasha_presentazione.mp3",
  "./assets/sounds/reclute/ymir_presentazione.mp3",
  "./assets/sounds/carte/carta_consumabile.mp3",
  "./assets/sounds/carte/carta_evento.mp3",
  "./assets/sounds/comandanti/hange_presentazione.mp3",
  "./assets/sounds/comandanti/levi_presentazione.mp3",
  "./assets/sounds/comandanti/mike_presentazione.mp3",
  "./assets/sounds/comandanti/sadis_presentazione.mp3",
  "./assets/sounds/comandanti/urlo_erwin.mp3"
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
