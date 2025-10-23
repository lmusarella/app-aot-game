
/**
 * bloodHitClean.js
 * Overlay "blood hit" minimalista: vignetta ai bordi + spruzzi statici naturali.
 * Nessuna dipendenza. Nessun HTML aggiuntivo. Centro libero configurabile.
 *
 * Usage:
 *   import bloodHitClean from './bloodHitClean.js';
 *   // oppure: import { bloodHitClean } from './bloodHitClean.js';
 *   bloodHitClean({ side: 'right', intensity: 1, density: 1.2, safeInset: 0.26 });
 */

/**
 * @typedef {Object} BloodHitOptions
 * @property {number} [duration=120]      Millisecondi di fade-in.
 * @property {number} [fadeAfter=1400]    Millisecondi prima di iniziare il fade-out.
 * @property {number} [fadeMs=650]        Millisecondi di fade-out.
 * @property {number} [intensity=1.0]     0..1 quantità globale.
 * @property {number} [density=1.2]       ~0.5..2.0 densità macchie.
 * @property {number} [safeInset=0.26]    0..0.45 quanto grande resta il centro pulito (frazione per lato).
 * @property {'top'|'right'|'bottom'|'left'|'center'} [side='center'] Bias del colpo (accentua quel bordo).
 * @property {HTMLElement} [container=document.body] Nodo dove montare l’overlay.
 * @property {string[]} [palette=['#5e0205','#7a0005','#8d0106','#b1060e']] Tavolozza rossi.
 */

/**
 * Crea e mostra l'effetto blood hit.
 * @param {BloodHitOptions} [opts]
 * @returns {{ dispose: () => void }} controller per interrompere/forzare cleanup.
 */
export function bloodHitClean(opts = {}) {
  const {
    duration = 120,
    fadeAfter = 1400,
    fadeMs = 650,
    intensity = 1.0,
    density = 1.2,
    safeInset = 0.26,
    side = 'center',
    container = typeof document !== 'undefined' ? document.body : null,
    palette = ['#5e0205','#7a0005','#8d0106','#b1060e']
  } = opts;

  if (!container) {
    throw new Error('bloodHitClean: missing container/document');
  }

  // Root overlay
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '9999',
    opacity: '0',
    transition: `opacity ${Math.max(80, duration)}ms ease-out`
  });
  container.appendChild(root);

  // Canvas
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const DPR = Math.min((globalThis.devicePixelRatio || 1), 2);

  function fit() {
    c.width  = Math.max(1, Math.floor(globalThis.innerWidth  * DPR));
    c.height = Math.max(1, Math.floor(globalThis.innerHeight * DPR));
    c.style.width  = (globalThis.innerWidth || 1) + 'px';
    c.style.height = (globalThis.innerHeight || 1) + 'px';
    draw();
  }

  root.appendChild(c);
  globalThis.addEventListener('resize', fit, { passive: true });
  fit();

  // Fade-in
  requestAnimationFrame(() => { root.style.opacity = '1'; });

  // Auto fade-out & cleanup
  const hideTimer = setTimeout(() => {
    root.style.transition = `opacity ${fadeMs}ms ease-in`;
    root.style.opacity = '0';
    // small safety buffer
    endTimer = setTimeout(clean, fadeMs + 40);
  }, fadeAfter);

  /** @type {number|undefined} */
  let endTimer;

  function clean() {
    clearTimeout(hideTimer);
    if (endTimer) clearTimeout(endTimer);
    globalThis.removeEventListener('resize', fit);
    try { root.remove(); } catch {}
  }

  // ---- Static render ----
  function draw() {
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);

    const inner = {
      x: W * safeInset,
      y: H * safeInset,
      w: W * (1 - 2 * safeInset),
      h: H * (1 - 2 * safeInset)
    };
    const cx = inner.x + inner.w / 2;
    const cy = inner.y + inner.h / 2;
    const maxR = Math.hypot(W / 2, H / 2);

    // 1) Vignetta scura/rossastra (centro trasparente)
    const rad = g.createRadialGradient(cx, cy, maxR * 0.35, cx, cy, maxR * 0.98);
    rad.addColorStop(0.00, 'rgba(0,0,0,0)');
    rad.addColorStop(0.60, 'rgba(0,0,0,0.10)');
    rad.addColorStop(0.82, 'rgba(0,0,0,0.55)');
    rad.addColorStop(1.00, 'rgba(0,0,0,0.85)');
    g.fillStyle = rad;
    g.fillRect(0, 0, W, H);

    // 2) Spruzzi statici naturali
    const reds = palette;
    const randRed = (a) => {
      const hex = reds[(Math.random() * reds.length) | 0].replace('#', '');
      const n = parseInt(hex, 16);
      const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
      return `rgba(${r},${gg},${b},${a})`;
    };
    const sideWeight = (x, y) => {
      const nx = x / W, ny = y / H;
      switch (side) {
        case 'top': return Math.max(0.6, 1.3 - ny);
        case 'bottom': return Math.max(0.6, ny + 0.3);
        case 'left': return Math.max(0.6, 1.3 - nx);
        case 'right': return Math.max(0.6, nx + 0.3);
        default: return 1;
      }
    };
    const perSide = 2;
    const lerp = (a, b, t) => a + (b - a) * t;
    const bursts = [];
    for (let n = 0; n < perSide; n++) {
      const t = (n + 0.5) / perSide;
      bursts.push([lerp(inner.x, inner.x + inner.w, t), inner.y]);                 // top
      bursts.push([lerp(inner.x, inner.x + inner.w, t), inner.y + inner.h]);       // bottom
      bursts.push([inner.x, lerp(inner.y, inner.y + inner.h, t)]);                 // left
      bursts.push([inner.x + inner.w, lerp(inner.y, inner.y + inner.h, t)]);       // right
    }
    const insideInner = (x, y) =>
      x > inner.x && x < inner.x + inner.w && y > inner.y && y < inner.y + inner.h;

    const dropletsBase = Math.round(320 * density);
    bursts.forEach(([bx, by]) => {
      const dirAng = Math.atan2(cy - by, cx - bx);

      // Cluster denso vicino al bordo
      for (let i = 0; i < Math.round(dropletsBase * 0.22); i++) {
        const r = (Math.random() ** 0.6) * 18 * DPR;
        const ang = dirAng + (Math.random() - 0.5) * 0.9;
        const x = bx + Math.cos(ang) * r;
        const y = by + Math.sin(ang) * r;
        const rad = 1 + (Math.random() ** 0.3) * 6 * DPR;
        g.fillStyle = randRed((0.55 + Math.random() * 0.35) * intensity * sideWeight(x, y));
        g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      }

      // Spruzzo radiale (power-law sizes), evitando il centro
      for (let i = 0; i < dropletsBase; i++) {
        const dist = (Math.random() ** 0.55) * (Math.hypot(W, H) * 0.45);
        const spread = 0.55 + Math.random() * 0.35;
        const ang = dirAng + (Math.random() - 0.5) * spread;
        const x = bx + Math.cos(ang) * dist;
        const y = by + Math.sin(ang) * dist;
        if (insideInner(x, y)) continue;
        const rad = 0.6 * DPR + (Math.random() ** 0.25) * 4.8 * DPR;
        g.fillStyle = randRed((0.35 + Math.random() * 0.5) * intensity * sideWeight(x, y));
        g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      }

      // Streaks sottili statiche verso il centro
      g.lineCap = 'round';
      g.lineWidth = 1.3 * DPR;
      g.strokeStyle = `rgba(141,1,6,${(0.45 * intensity).toFixed(3)})`;
      for (let i = 0; i < Math.round(28 * density); i++) {
        const d1 = (Math.random() ** 0.6) * (Math.hypot(W, H) * 0.28);
        const d2 = d1 + 16 * DPR + Math.random() * 60 * DPR;
        const ang = dirAng + (Math.random() - 0.5) * 0.38;
        const x1 = bx + Math.cos(ang) * d1, y1 = by + Math.sin(ang) * d1;
        const x2 = bx + Math.cos(ang) * d2, y2 = by + Math.sin(ang) * d2;
        const midx = (x1 + x2) / 2, midy = (y1 + y2) / 2;
        if (insideInner(midx, midy)) continue;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      }
    });

    // 3) Tinta sangue unificante (source-in)
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.00, '#5e0205');
    grad.addColorStop(0.55, '#7a0005');
    grad.addColorStop(1.00, '#b1060e');
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  }

  return { dispose: clean };
}

// Default export per comodità
export default bloodHitClean;
