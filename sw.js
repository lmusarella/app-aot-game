// sw.js - Service Worker base per PWA
const CACHE_NAME = 'aot-cache-v3';
const BASE_ASSETS = [
  './',
  './index.html',
  './styles/game/00-base.css',
  './styles/game/01-header.css',
  './styles/game/02-leftbar.css',
  './styles/game/03-rightbar.css',
  './styles/game/04-field.css',
  './styles/game/05-fab.css',
  './styles/game/06-dice-log.css',
  './styles/game/07-footer-modal.css',
  './styles/game/08-responsive-snackbar.css',
  './styles/game/09-tooltips-cards.css',
  './styles/game/10-accordions-pickers.css',
  './styles/game/11-overlays.css',
  './styles/game/12-audio-controls.css',
  './styles/game/13-unit-mods.css',
  './styles/game/14-vs-overlay.css',
  './styles/game/15-tutorial-overlay.css',
  './styles/screens.css',
  './src/app.js',
  './manifest.json',
  './libs/three.min.js',
  './libs/cannon.min.js',
  './libs/teal.js',
  './src/dice-roller/styles.css',
  './src/dice-roller/dice.js',
  './src/dice-roller/main.js',

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
    "./assets/sounds/start_app.mp3",
  "./assets/sounds/start_mission.mp3",
  "./assets/sounds/ape_mutaform.mp3",
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
  "./assets/sounds/comandanti/hange_presentazione.mp3",
  "./assets/sounds/comandanti/levi_presentazione.mp3",
  "./assets/sounds/comandanti/mike_presentazione.mp3",
  "./assets/sounds/comandanti/sadis_presentazione.mp3",
  "./assets/sounds/comandanti/urlo_erwin.mp3"
];

const VIEW_ASSETS = [
  './src/view-components/pages/login/screen-login.html',
  './src/view-components/pages/lobby/screen-lobby.html',
  './src/view-components/pages/room/screen-room.html',
  './src/view-components/header/header.html',
  './src/view-components/leftbar/leftbar.html',
  './src/view-components/rightbar/rightbar.html',
  './src/view-components/footer/footer.html',
  './src/view-components/layout-controls/layout-controls.html',
  './src/view-components/audio/audio-modal.html',
  './src/view-components/overlays/overlays.html',
  './src/view-components/fabs/fabs.html'
];

const SCRIPT_ASSETS = [
  './src/boot/general-listeners.js',
  './src/services.js',
  './src/ui-components/ui-helpers.js',
  './src/view-components/pages/login/view-login.js',
  './src/view-components/pages/lobby/view-lobby.js',
  './src/view-components/header/view-header.js',
  './src/view-components/leftbar/view-leftbar.js',
  './src/view-components/rightbar/view-rightbar.js',
  './src/view-components/footer/view-footer.js',
  './src/view-components/layout-controls/view-layout-controls.js',
  './src/view-components/audio/view-audio.js',
  './src/view-components/fabs/view-fabs.js'
];

const ASSETS = Array.from(new Set([...BASE_ASSETS, ...VIEW_ASSETS, ...SCRIPT_ASSETS]));

const precacheAssets = () => caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS));


// Installazione: cache iniziale
self.addEventListener('install', (event) => {
  event.waitUntil(precacheAssets());
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

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'PRECACHE') return;
  const replyPort = event.ports?.[0];
  event.waitUntil(
    precacheAssets().then(() => {
      replyPort?.postMessage({ type: 'PRECACHE_DONE' });
    })
  );
});
