
/**
 * wallCollapse.js (v1)
 * Effetto "crollo mura": shake dello schermo + detriti + polvere.
 * ES Module – nessuna dipendenza.
 *
 * API base:
 *   import wallCollapse from './wallCollapse.js';
 *   wallCollapse({ intensity: 26, debrisCount: 160, durationMs: 1800 });
 */
const STYLE_ID = 'wall-collapse-styles-v1';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
  @keyframes wc-fade-in  { from { opacity: 0 } to { opacity: 1 } }
  @keyframes wc-fade-out { from { opacity: 1 } to { opacity: 0 } }
  .wc-root {
    position: fixed; inset: 0; z-index: 99995;
    pointer-events: none;
    animation: wc-fade-in 180ms ease-out both;
  }
  canvas.wc-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  /* opzionale vignette leggera per dramma */
  .wc-vignette {
    position: absolute; inset: 0; pointer-events:none;
    background: radial-gradient(120% 80% at 50% 40%, rgba(0,0,0,0) 0%, rgba(0,0,0,.35) 60%, rgba(0,0,0,.65) 95%);
    opacity: var(--wc-vignette, .0);
    transition: opacity 240ms ease-out;
  }
  `;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * @param {Object} opts
 * @param {HTMLElement} [opts.container=document.body]
 * @param {number} [opts.durationMs=1600]        // durata totale effetto
 * @param {number} [opts.intensity=22]           // ampiezza shake (px)
 * @param {number} [opts.freq=28]                // Hz approssimativi dello shake
 * @param {number} [opts.debrisCount=120]        // numero frammenti
 * @param {number} [opts.gravity=0.18]           // gravità particelle
 * @param {number} [opts.friction=0.985]         // perdita di velocità
 * @param {number} [opts.dust=1]                 // 0..1 quantità polvere
 * @param {number} [opts.vignette=0.18]          // 0..1 vignette sullo sfondo
 * @param {'top'|'center'|'bottom'} [opts.emitBand='top'] // zona d'emissione detriti
 * @param {number} [opts.bandHeight=0.2]         // altezza banda rispetto viewport (0..1)
 * @param {number} [opts.delayMs=0]              // ritardo avvio
 * @returns {{ dispose:()=>void }}
 */
export default function wallCollapse(opts = {}) {
  injectStyles();
  const {
    container = document.body,
    durationMs = 1600,
    intensity = 22,
    freq = 28,
    debrisCount = 120,
    gravity = 0.18,
    friction = 0.985,
    dust = 1,
    vignette = 0.18,
    emitBand = 'top',
    bandHeight = 0.2,
    delayMs = 0
  } = opts;

  if (!container) throw new Error('wallCollapse: container mancante');

  // overlay root + canvas
  const root = document.createElement('div');
  root.className = 'wc-root';
  root.style.setProperty('--wc-vignette', String(vignette));
  const canvas = document.createElement('canvas'); canvas.className = 'wc-canvas';
  const vgn = document.createElement('div'); vgn.className = 'wc-vignette';
  root.appendChild(canvas); root.appendChild(vgn);
  container.appendChild(root);
  const g = canvas.getContext('2d', { alpha: true });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  function fit() {
    canvas.width = Math.max(1, Math.floor(window.innerWidth * DPR));
    canvas.height = Math.max(1, Math.floor(window.innerHeight * DPR));
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }
  fit(); addEventListener('resize', fit, { passive: true });

  // Particelle detriti + polvere
  const rnd = (a,b) => a + Math.random()*(b-a);
  const parts = [];
  const dusts = [];

  const W = () => canvas.width;
  const H = () => canvas.height;

  // banda d'emissione (simula crollo muro: dall'alto o centro/basso)
  const bh = Math.max(0.02, Math.min(0.9, bandHeight)) * H();
  let y0 = 0;
  if (emitBand === 'top') y0 = 0;
  else if (emitBand === 'center') y0 = (H() - bh)/2;
  else y0 = H() - bh;

  // spawn detriti
  for (let i=0;i<debrisCount;i++) {
    const x = rnd(0, W());
    const y = rnd(y0, y0 + bh*0.6);
    const speed = rnd(0.6, 2.4);
    const ang = rnd(Math.PI*0.85, Math.PI*1.15); // giù con cono
    const vx = Math.cos(ang) * speed + rnd(-0.6,0.6);
    const vy = Math.sin(ang) * speed + rnd(0.2, 1.4);
    const size = rnd(6, 22) * DPR;
    const rect = Math.random() < 0.6;
    parts.push({
      x, y, vx, vy,
      ax: 0, ay: gravity,
      w: rect ? size*rnd(0.7,1.3) : size,
      h: size,
      rect,
      rot: rnd(0, Math.PI*2),
      vr: rnd(-0.08, 0.08),
      life: rnd(durationMs*0.6, durationMs*1.1),
      age: 0,
      shade: Math.floor(rnd(90, 140)) // grigio pietra
    });
  }

  // spawn polvere soffice in basso
  const dustCount = Math.floor(140 * dust);
  for (let i=0;i<dustCount;i++) {
    const x = rnd(0, W());
    const y = H() * rnd(0.65, 0.9);
    const r = rnd(18, 60) * DPR;
    const life = rnd(900, 1600);
    dusts.push({
      x, y, r,
      born: 0,
      life,
      alpha: rnd(0.08, 0.22)
    });
  }

  // Shake dello schermo (trasforma il body)
  const body = document.body;
  const prevTransform = body.style.transform;
  const prevWill = body.style.willChange;
  const prevOrigin = body.style.transformOrigin;
  body.style.willChange = 'transform';
  body.style.transformOrigin = '50% 50%';

  const tStart = performance.now() + Math.max(0, delayMs|0);
  const tEnd = tStart + durationMs;
  let raf;

  function frame(t) {
    if (t < tStart) { raf = requestAnimationFrame(frame); return; }
    const k = Math.min(1, (t - tStart) / durationMs);
    const decay = 1 - k; // lineare, va bene qui

    // shake sin+noise
    const sx = Math.sin(t/1000 * freq * 2*Math.PI) * intensity * decay;
    const sy = Math.cos(t/1000 * (freq*0.83) * 2*Math.PI) * (intensity*0.7) * decay;
    const rot = Math.sin(t/1000 * (freq*0.5) * 2*Math.PI) * 0.8 * decay;
    body.style.transform = `translate(${sx}px, ${sy}px) rotate(${rot}deg)`;

    // draw
    g.clearRect(0,0,W(),H());
    // detriti
    for (let i=0;i<parts.length;i++) {
      const p = parts[i];
      if (p.age > p.life) continue;
      p.vx += p.ax; p.vy += p.ay;
      p.x += p.vx; p.y += p.vy;
      p.vx *= friction; p.vy = p.vy*friction + gravity*0.35;
      p.rot += p.vr;
      p.age += 16;

      // collide con suolo
      if (p.y > H() - p.h*0.5) {
        p.y = H() - p.h*0.5;
        p.vy *= -0.32;
        p.vx *= 0.75;
        p.vr *= -0.4;
      }
      // limiti laterali
      if (p.x < 0) { p.x = 0; p.vx *= -0.5; }
      if (p.x > W()) { p.x = W(); p.vx *= -0.5; }

      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = `rgb(${p.shade},${p.shade},${p.shade})`;
      if (p.rect) {
        g.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      } else {
        g.beginPath();
        g.moveTo(-p.w*0.5, p.h*0.5);
        g.lineTo(p.w*0.5, p.h*0.3);
        g.lineTo(0, -p.h*0.5);
        g.closePath();
        g.fill();
      }
      g.restore();
    }

    // polvere (radial gradient soft)
    for (let i=0;i<dusts.length;i++) {
      const d = dusts[i];
      const age = (t - tStart) - d.born;
      if (age < 0) continue;
      const kk = Math.min(1, age / d.life);
      const a = d.alpha * (kk < 0.6 ? (kk/0.6) : (1 - (kk-0.6)/0.4));
      const r = d.r * (0.9 + (1-kk)*0.5);
      const grd = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, r);
      // marrone/grigio polvere
      const col = '#b7a792';
      grd.addColorStop(0, hexWithAlpha(col, a));
      grd.addColorStop(1, hexWithAlpha(col, 0));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(d.x, d.y, r, 0, Math.PI*2);
      g.fill();
    }

    if (t < tEnd) {
      raf = requestAnimationFrame(frame);
    } else {
      cleanup();
    }
  }

  // avvia
  if (delayMs > 0) setTimeout(()=> raf = requestAnimationFrame(frame), delayMs);
  else raf = requestAnimationFrame(frame);

  function cleanup() {
    cancelAnimationFrame(raf);
    removeEventListener('resize', fit);
    root.classList.add('is-out');
    body.style.transform = prevTransform;
    body.style.willChange = prevWill;
    body.style.transformOrigin = prevOrigin;
    setTimeout(()=>{ try { root.remove(); } catch {} }, 180);
  }

  return { dispose: cleanup };
}

function hexWithAlpha(hex, a) {
  // accetta #rgb, #rrggbb
  let r,g,b;
  if (hex.length === 4) {
    r = parseInt(hex[1]+hex[1], 16);
    g = parseInt(hex[2]+hex[2], 16);
    b = parseInt(hex[3]+hex[3], 16);
  } else {
    r = parseInt(hex.slice(1,3), 16);
    g = parseInt(hex.slice(3,5), 16);
    b = parseInt(hex.slice(5,7), 16);
  }
  const aa = Math.max(0, Math.min(255, Math.round(a*255)));
  return `rgba(${r},${g},${b},${(aa/255).toFixed(3)})`;
}

export { wallCollapse as createWallCollapse };
