/**
 * lightningStrike.js (v1.1)
 * Overlay "fulmine" che taglia lo schermo con flash e tremolio.
 * Nessuna dipendenza. Nessun HTML aggiuntivo.
 *
 * Usage (ESM):
 *   import lightningStrike from './lightningStrike.js';
 *   lightningStrike({ angleDeg: 90, crackX: 0.5 });
 *
 * Opzioni:
 *   duration, fadeAfter, fadeMs   — tempi animazioni
 *   angleDeg (90 = verticale)     — angolo del fulmine in gradi
 *   crackX 0..1                   — posizione orizzontale del taglio (se verticale)
 *   container                     — nodo dove montare overlay + applicare tremolio (default: document.body)
 *   shakeMs, shakePx              — intensità tremolio
 *   dprMax                        — limite DPR canvas
 *   colors                        — override palette { glowTop, glowBottom, core, flashInner, flashOuter }
 */
export function lightningStrike(opts = {}) {
  const {
    duration = 110,
    fadeAfter = 420,
    fadeMs = 320,
    angleDeg = 90,
    crackX = 0.5,
    container = typeof document !== 'undefined' ? document.body : null,
    shakeMs = 300,
    shakePx = 7,
    dprMax = 2,
    colors = {
      glowTop: 'rgba(255,245,200,0.95)',
      glowBottom: 'rgba(255,220,120,0.85)',
      core: 'rgba(255,255,255,0.98)',
      flashInner: 'rgba(255,255,210,0.05)',
      flashOuter: 'rgba(255,230,120,0.15)'
    }
  } = opts;

  if (!container) throw new Error('lightningStrike: missing container/document');

  // Root overlay
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '9999',
    opacity: '0',
    transition: `opacity ${Math.max(50, duration)}ms ease-out`
  });
  container.appendChild(root);

  // Canvas
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const DPR = Math.min((globalThis.devicePixelRatio || 1), dprMax);

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

  function draw() {
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);

    // Direzione e base centrata verticalmente; crackX controlla l'offset orizzontale
    const ang = (angleDeg * Math.PI) / 180;
    const dirX = Math.cos(ang), dirY = Math.sin(ang);
    const perpX = Math.cos(ang + Math.PI / 2), perpY = Math.sin(ang + Math.PI / 2);

    const baseX = W * crackX;
    const baseY = H * 0.5;

    // Lunghezza sufficiente ad attraversare lo schermo anche dopo resize
    const L = Math.hypot(W, H);
    const segments = 14;
    const step = (2 * L) / segments; // da -L a +L

    // Partenza ben fuori dallo schermo
    let x = baseX - dirX * L;
    let y = baseY - dirY * L;

    g.lineCap = 'round';
    g.lineJoin = 'round';

    // Pass alone (glow)
    g.save();
    g.shadowBlur = 24 * DPR;
    g.shadowColor = 'rgba(255,240,170,0.95)';
    g.lineWidth = 5.5 * DPR;
    const glow = g.createLinearGradient(0, 0, 0, H);
    glow.addColorStop(0, colors.glowTop);
    glow.addColorStop(1, colors.glowBottom);
    g.strokeStyle = glow;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < segments; i++) {
      const jitter = (Math.random() - 0.5) * step * 0.55;
      x += dirX * step + perpX * jitter;
      y += dirY * step + perpY * jitter;
      g.lineTo(x, y);
    }
    g.stroke();
    g.restore();

    // Pass nucleo
    g.lineWidth = 2.4 * DPR;
    g.strokeStyle = colors.core;
    g.beginPath();
    x = baseX - dirX * L;
    y = baseY - dirY * L;
    g.moveTo(x, y);
    for (let i = 0; i < segments; i++) {
      const jitter = (Math.random() - 0.5) * step * 0.28;
      x += dirX * step + perpX * jitter;
      y += dirY * step + perpY * jitter;
      g.lineTo(x, y);
    }
    g.stroke();

    // Flash globale
    const flash = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H));
    flash.addColorStop(0, colors.flashInner);
    flash.addColorStop(1, colors.flashOuter);
    g.fillStyle = flash;
    g.fillRect(0, 0, W, H);
  }

  function shakeScreen() {
    const px = Math.max(1, shakePx);
    const kf = [
      { transform: 'translate(0,0)' },
      { transform: `translate(${ px}px,${-px}px)` },
      { transform: `translate(${-px}px,${ Math.round(px*0.5)}px)` },
      { transform: `translate(${ Math.round(px*0.6)}px,${ Math.round(px*0.3)}px)` },
      { transform: 'translate(0,0)' }
    ];
    container.animate(kf, { duration: shakeMs, iterations: 1 });
  }

  // Fade-in + impatto
  requestAnimationFrame(() => {
    root.style.opacity = '1';
    shakeScreen();
  });

  // Fade-out & cleanup
  const hideTimer = setTimeout(() => {
    root.style.transition = `opacity ${fadeMs}ms ease-in`;
    root.style.opacity = '0';
    endTimer = setTimeout(clean, fadeMs + 40);
  }, fadeAfter);

  let endTimer;
  function clean() {
    clearTimeout(hideTimer);
    if (endTimer) clearTimeout(endTimer);
    globalThis.removeEventListener('resize', fit);
    try { root.remove(); } catch {}
  }

  return { dispose: clean };
}

export default lightningStrike;
