
/**
 * giantDust.js
 * Effetto polvere che si alza dopo l'impatto / caduta del gigante.
 * - Canvas in overlay, nessuna dipendenza.
 * - Due componenti: ring di polvere al suolo + pennacchi che salgono.
 *
 * Usage base:
 *   import giantDust from './giantDust.js';
 *   giantDust({ delayMs: 250 }); // parte dopo 250ms
 *
 * Accoppiamento con giantFallQuake (esempio):
 *   import { giantFallQuake } from './screenQuake.js';
 *   const impactMs = 220, prepMs = 450;
 *   giantFallQuake({ prepMs, impactMs, afterMs: 1400 });
 *   giantDust({ delayMs: prepMs + impactMs - 30 }); // poco prima della fine dell'impatto
 */

/**
 * @typedef {Object} DustOptions
 * @property {HTMLElement} [container=document.body]  Dove montare l'overlay
 * @property {number} [delayMs=0]                     Ritardo di avvio
 * @property {number} [durationMs=2000]               Durata animazione (auto-cleanup)
 * @property {number} [ringLife=900]                  Durata ring al suolo
 * @property {number} [ringSize=0.9]                  Raggio relativo iniziale del ring (0..1 della larghezza)
 * @property {number} [plumeCount=120]                Numero particelle pennacchio
 * @property {number} [plumeLife=1600]                Durata media particelle pennacchio
 * @property {number} [wind=0.06]                     Vento laterale (px/ms @ DPR=1)
 * @property {number} [buoyancy=0.08]                 Spinta verso l'alto (px/ms @ DPR=1)
 * @property {number} [gravity=0.02]                  Gravità verso il basso (px/ms @ DPR=1) applicata dopo metà vita
 * @property {number} [turb=0.0018]                   Intensità turbolenza per rumore finto
 * @property {string} [tone='#a78b6d']                Tinta polvere (beige/sabbia)
 * @property {number} [maxAlpha=0.28]                 Opacità massima delle particelle
 * @property {number} [ringAlpha=0.35]                Opacità massima del ring
 */
export function giantDust(opts = {}) {
  const {
    container = typeof document !== 'undefined' ? document.body : null,
    delayMs = 0,
    durationMs = 2000,
    ringLife = 900,
    ringSize = 0.9,
    plumeCount = 120,
    plumeLife = 1600,
    wind = 0.06,
    buoyancy = 0.08,
    gravity = 0.02,
    turb = 0.0018,
    tone = '#a78b6d',
    maxAlpha = 0.28,
    ringAlpha = 0.35,
  } = opts;
  if (!container) throw new Error('giantDust: missing container/document');

  // Overlay
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '9998', opacity: '0',
    transition: 'opacity 180ms ease-out'
  });
  container.appendChild(root);

  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const DPR = Math.min((globalThis.devicePixelRatio || 1), 2);
  root.appendChild(c);

  function fit() {
    c.width  = Math.max(1, Math.floor((globalThis.innerWidth || 1) * DPR));
    c.height = Math.max(1, Math.floor((globalThis.innerHeight || 1) * DPR));
    c.style.width  = (globalThis.innerWidth  || 1) + 'px';
    c.style.height = (globalThis.innerHeight || 1) + 'px';
  }
  fit();
  globalThis.addEventListener('resize', fit, { passive: true });

  // Helpers
  const now = () => performance.now();
  const rand = (a,b) => a + Math.random()*(b-a);
  // finto 'noise' periodico per turbolenza senza librerie
  function pnoise(t, seed) {
    const x = t*0.001 + seed*12.9898;
    return Math.sin(x) * 43758.5453 % 1; // [0,1) pseudo
  }

  // Systems
  const W = () => c.width, H = () => c.height;
  const groundY = () => H() * 0.82; // linea “suolo” percettiva
  const centerX = () => W() * 0.5;

  const tStart = now() + Math.max(0, delayMs|0);
  const tEnd   = tStart + durationMs;

  // Ring expanding fog near ground
  const ring = {
    born: tStart,
    life: ringLife,
    baseR: () => (W() * ringSize) * 0.5,
  };

  // Plume particles
  const parts = [];
  function spawnPlumes() {
    const cx = centerX();
    const gy = groundY();
    for (let i=0; i<plumeCount; i++) {
      const seed = Math.random()*1000;
      const life = rand(plumeLife*0.7, plumeLife*1.3);
      // angolo di emissione: verso l'alto ±55°, più denso al centro
      const ang = (-Math.PI/2) + rand(-Math.PI*0.3, Math.PI*0.3);
      const speed = rand(0.06, 0.22); // px/ms @ DPR=1
      parts.push({
        seed,
        born: tStart + rand(-80, 120), // leggera coda/anticipo
        life,
        x: cx + rand(-W()*0.06, W()*0.06),
        y: gy + rand(-H()*0.02, H()*0.01),
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        r: rand(8, 26), // raggio base (px @ DPR=1)
      });
    }
  }
  spawnPlumes();

  // Fade in root a inizio
  requestAnimationFrame(() => { root.style.opacity = '1'; });

  let raf;
  function frame(t) {
    // clear
    g.clearRect(0,0,W(),H());

    // draw ring fog
    const ringK = Math.min(1, Math.max(0, (t - ring.born) / ring.life));
    if (ringK >= 0 && ringK <= 1) {
      const cx = centerX();
      const y  = groundY();
      const r  = ring.baseR() * (0.6 + ringK*1.6);
      const h  = Math.max(18*DPR, r*0.18);
      const grd = g.createRadialGradient(cx, y, r*0.2, cx, y, r);
      grd.addColorStop(0, `rgba(167,139,109,${ringAlpha*0.7*(1-ringK)})`);
      grd.addColorStop(1, 'rgba(167,139,109,0)');
      g.fillStyle = grd;
      g.beginPath();
      // ellisse piatta
      g.ellipse(cx, y, r, h, 0, 0, Math.PI*2);
      g.fill();
    }

    // draw plume particles
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const age = t - p.born;
      if (age < 0) continue;
      const k = age / p.life;
      if (k >= 1) continue;

      // dinamica
      const buoy = buoyancy * (k < 0.55 ? 1 : (1 - (k - 0.55) / 0.45) ); // diminuisce nella coda
      const gy = (k > 0.5 ? gravity : 0); // gravità entra dopo metà vita
      const noise = (pnoise(t * turb, p.seed) - 0.5); // [-0.5,0.5)
      const lateral = wind + noise * 0.4;

      p.vx += lateral * 0.0005;
      p.vy += (-buoy + gy) * 0.0008;

      p.x += p.vx * (DPR*1000/1000);
      p.y += p.vy * (DPR*1000/1000);

      // alpha e size
      const alpha = maxAlpha * (k < 0.6 ? (k/0.6) : (1 - (k-0.6)/0.4)); // fade-in -> fade-out
      const rad   = p.r * (0.9 + (1-k)*0.6) * DPR;

      // disegno particella come blob morbido
      const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
      grd.addColorStop(0, `${tone}${alphaToHex(alpha)}`);
      grd.addColorStop(1, `${tone}00`);
      g.fillStyle = grd;
      g.beginPath();
      g.arc(p.x, p.y, rad, 0, Math.PI*2);
      g.fill();
    }

    if (t < tEnd) { raf = requestAnimationFrame(frame); }
    else { cleanup(); }
  }

  // Util: alpha 0..1 -> hex
  function alphaToHex(a) {
    const v = Math.max(0, Math.min(255, Math.round(a*255)));
    return (v | 256).toString(16).slice(1).toUpperCase();
  }

  // start after delay
  const start = () => { raf = requestAnimationFrame(frame); };
  if (delayMs > 0) setTimeout(start, delayMs); else start();

  function cleanup() {
    cancelAnimationFrame(raf);
    globalThis.removeEventListener('resize', fit);
    // fade out
    root.style.opacity = '0';
    setTimeout(() => { try { root.remove(); } catch {} }, 220);
  }

  return { dispose: cleanup };
}

export default giantDust;
