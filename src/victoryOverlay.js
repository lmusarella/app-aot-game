
/**
 * victoryOverlay.js (v1)
 * Overlay di vittoria: scritta (VITTORIA) con icona (corona) dietro e piccoli coriandoli.
 * ES Module – nessuna dipendenza.
 */
const STYLE_ID = 'victory-overlay-styles-v1';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
  @keyframes vo-fade-in { from { opacity: 0 } to { opacity: 1 } }
  @keyframes vo-fade-out { from { opacity: 1 } to { opacity: 0 } }
  @keyframes vo-pulse    { 0%,100% { transform: translateZ(0) scale(1)} 50% { transform: translateZ(0) scale(1.02)} }
  @keyframes vo-shine    { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
  .victory-overlay { position: fixed; inset: 0; z-index: 999999; display: grid; place-items: center; pointer-events: auto; animation: vo-fade-in 360ms ease-out forwards; }
  .victory-overlay.is-hiding { animation: vo-fade-out 260ms ease-in forwards; }
  .victory-overlay__bg { position: absolute; inset: 0; z-index: 0; background: radial-gradient(120% 80% at 50% 40%, rgba(0,0,0,0) 0%, rgba(0,0,0,.35) 50%, rgba(0,0,0,.78) 85%), linear-gradient(180deg, rgba(0,15,6,.7), rgba(0,0,0,.85)); backdrop-filter: blur(var(--vo-blur, 1.5px)); -webkit-backdrop-filter: blur(var(--vo-blur, 1.5px)); }
  .victory-overlay__glow { position: absolute; inset: 0; z-index: 1; pointer-events: none; background: radial-gradient(40% 25% at 50% 42%, rgba(255,255,180,.22), rgba(255,255,180,0) 60%), radial-gradient(20% 10% at 50% 32%, rgba(255,220,120,.35), rgba(255,220,120,0) 55%); mix-blend-mode: screen; }
  .victory-overlay__icon { position: absolute; inset: 0; display:grid; place-items:center; pointer-events:none; z-index: 2; opacity: var(--vo-icon-op, .18); transform: translateZ(0) scale(var(--vo-icon-scale, 1)); filter: drop-shadow(0 10px 40px rgba(0,0,0,.45)); }
  .victory-overlay__icon .spinner { position: absolute; width: min(80vmin, 980px); height: min(80vmin, 980px); border-radius: 50%; background: conic-gradient(from 0deg, rgba(255,240,150,.2), rgba(255,255,255,0) 35%, rgba(255,240,150,.2) 70%, rgba(255,255,255,0)); mask: radial-gradient(circle, rgba(0,0,0,.0) 55%, rgba(0,0,0,1) 56%); animation: vo-shine 12s linear infinite; filter: blur(1px); }
  .victory-overlay__icon svg { width: min(60vmin, 820px); height: auto; }
  .victory-overlay__content { position: relative; z-index: 3; text-align:center; pointer-events:none; padding: 0 24px; transform: translateZ(0); }
  .victory-overlay__title { font-family: Impact, Haettenschweiler, 'Arial Black', system-ui, sans-serif; font-size: clamp(40px, 7vw, 108px); letter-spacing: .04em; color: #f6f36b; text-shadow: 0 2px 0 #6b5f00, 0 10px 24px rgba(0,0,0,.55); margin: 0 0 8px 0; line-height: .95; animation: vo-pulse 2200ms ease-in-out infinite; }
  .victory-overlay__subtitle { font-family: system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif; font-weight: 700; font-size: clamp(14px, 2.2vw, 22px); color: #fff7c7; opacity: .95; text-shadow: 0 1px 0 #524900, 0 6px 16px rgba(0,0,0,.5); margin: 0; }
  .victory-overlay__hint { margin-top: 14px; font-size: 13px; letter-spacing: .06em; color: #ddd; opacity: .8; }
  .victory-overlay__closezone { position:absolute; inset:0; appearance:none; background: transparent; border: 0; outline: 0; opacity: 0; pointer-events: auto; }
  canvas.victory-overlay__confetti { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
  `;
  const style = document.createElement('style'); style.id = STYLE_ID; style.textContent = css; document.head.appendChild(style);
}

function crownSVG(fill = '#f6f36b') {
  return `
  <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="${fill}" d="M8 40l20 24 20-28 16 24 20-26 16 30 20-24v48H8z"/>
  </svg>`;
}

/**
 * Mostra la schermata e ritorna un controller.
 * @param {Object} options
 * @param {string} [options.text='VITTORIA']
 * @param {string} [options.subtext='Il gigante è stato abbattuto!']
 * @param {boolean} [options.allowDismiss=true]
 * @param {number|null} [options.autoDismissMs=null]
 * @param {number} [options.iconOpacity=0.18]
 * @param {number} [options.iconScale=1.0]
 * @param {number} [options.blur=1.5]
 * @param {boolean} [options.confetti=true]
 * @returns {{ close: () => void, setText:(t:string)=>void, setSubtext:(s:string)=>void, el:HTMLElement }}
 */
export function showVictoryScreen(options = {}) {
  injectStyles();
  const {
    text = 'VITTORIA',
    subtext = 'Il gigante è stato abbattuto!',
    allowDismiss = false,
    autoDismissMs = null,
    iconOpacity = 0.18,
    iconScale = 1.0,
    blur = 1.5,
    confetti = true
  } = options;

  const root = document.createElement('div');
  root.className = 'victory-overlay';
  root.style.setProperty('--vo-icon-op', String(iconOpacity));
  root.style.setProperty('--vo-icon-scale', String(iconScale));
  root.style.setProperty('--vo-blur', `${blur}px`);

  root.innerHTML = `
    <div class="victory-overlay__bg"></div>
    <div class="victory-overlay__glow"></div>
    <div class="victory-overlay__icon">
      <div class="spinner" aria-hidden="true"></div>
      ${crownSVG('#f6f36b')}
    </div>
    <div class="victory-overlay__content" role="dialog" aria-live="polite" aria-label="${text}">
      <h1 class="victory-overlay__title">${text}</h1>
      ${subtext ? `<p class="victory-overlay__subtitle">${subtext}</p>` : ''}
      ${allowDismiss ? `<div class="victory-overlay__hint">clic o tasto per chiudere</div>` : ''}
    </div>
    ${allowDismiss ? `<button class="victory-overlay__closezone" aria-label="Chiudi"></button>` : ''}
  `;

  // confetti soft
  let disposeConfetti = () => {};
  if (confetti) {
    const canvas = document.createElement('canvas');
    canvas.className = 'victory-overlay__confetti';
    const g = canvas.getContext('2d');
    const DPR = Math.min(devicePixelRatio || 1, 2);
    root.appendChild(canvas);
    const fit = () => {
      canvas.width  = Math.floor((innerWidth || 1) * DPR);
      canvas.height = Math.floor((innerHeight || 1) * DPR);
      canvas.style.width = (innerWidth || 1) + 'px';
      canvas.style.height= (innerHeight || 1) + 'px';
    };
    fit(); addEventListener('resize', fit, { passive: true });

    const parts = [];
    const colors = ['#f6f36b','#ffe19c','#9cf3ff','#c6ff9c','#ffc9f4'];
    const rnd = (a,b)=> a + Math.random()*(b-a);

    for (let i=0;i<160;i++) {
      parts.push({
        x: rnd(0, canvas.width), y: rnd(-canvas.height*0.3, 0),
        vx: rnd(-0.05,0.05), vy: rnd(0.06,0.18),
        w: rnd(4,9)*DPR, h: rnd(8,16)*DPR,
        a: rnd(0, Math.PI*2), va: rnd(-0.03,0.03),
        c: colors[(Math.random()*colors.length)|0]
      });
    }

    let raf;
    const frame = (t) => {
      g.clearRect(0,0,canvas.width,canvas.height);
      for (const p of parts) {
        p.x += p.vx * 16; p.y += p.vy * 16; p.a += p.va * 16;
        if (p.y > canvas.height + 40) { p.y = -20; p.x = rnd(0,canvas.width); }
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.a);
        g.fillStyle = p.c;
        g.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        g.restore();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    disposeConfetti = () => { cancelAnimationFrame(raf); removeEventListener('resize', fit); canvas.remove(); };
  }

  document.body.appendChild(root);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.classList.add('is-hiding');
    setTimeout(() => { try { disposeConfetti(); root.remove(); } catch {} }, 260);
    detach();
  };

  function onKey(e){ if (!allowDismiss) return; if (e.key) close(); }
  function onClick(){ if (!allowDismiss) return; close(); }
  function detach(){
    document.removeEventListener('keydown', onKey);
    root.removeEventListener('click', onClick);
  }

  if (allowDismiss) {
    document.addEventListener('keydown', onKey);
    root.addEventListener('click', onClick);
  }
  if (autoDismissMs && Number.isFinite(autoDismissMs)) {
    setTimeout(close, Math.max(0, autoDismissMs|0));
  }

  function setText(t){ const el = root.querySelector('.victory-overlay__title'); if (el) el.textContent = t; }
  function setSubtext(s){ const el = root.querySelector('.victory-overlay__subtitle'); if (el) el.textContent = s; }

  return { close, setText, setSubtext, el: root };
}

export default showVictoryScreen;
