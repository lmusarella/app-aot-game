
/**
 * deathOverlay.js (v2)
 * Overlay di morte: scritta (SEI MORTO) con teschio sullo sfondo.
 * ES Module – nessuna dipendenza.
 */
const STYLE_ID = 'death-overlay-styles-v2';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
  @keyframes do-fade-in { from { opacity: 0 } to { opacity: 1 } }
  @keyframes do-fade-out { from { opacity: 1 } to { opacity: 0 } }
  @keyframes do-pulse { 0%,100% { transform: translateZ(0) scale(1)} 50% { transform: translateZ(0) scale(1.025)} }
  @keyframes do-glitch-x { 0%,30%,37%,100% { transform: translateX(0) } 31% { transform: translateX(-2px)} 33% { transform: translateX(2px)} 35% { transform: translateX(-1px)} }
  @keyframes do-chroma { 0%,100% { filter: drop-shadow(0 0 0 rgba(255,0,0,.5)) drop-shadow(0 0 0 rgba(0,200,255,.5)); } 50% { filter: drop-shadow(1px 0 0 rgba(255,0,0,.6)) drop-shadow(-1px 0 0 rgba(0,200,255,.6)); } }
  .death-overlay { position: fixed; inset: 0; z-index: 999999; display: grid; place-items: center; pointer-events: auto; animation: do-fade-in 320ms ease-out forwards; }
  .death-overlay.is-hiding { animation: do-fade-out 260ms ease-in forwards; }
  .death-overlay__bg { position: absolute; inset: 0; z-index: 0; background: radial-gradient(120% 80% at 50% 40%, rgba(0,0,0,0) 0%, rgba(0,0,0,.55) 55%, rgba(0,0,0,.88) 85%), linear-gradient(180deg, rgba(10,0,0,.8), rgba(0,0,0,.9)); backdrop-filter: blur(var(--do-blur, 2px)); -webkit-backdrop-filter: blur(var(--do-blur, 2px)); }
  .death-overlay__skull { position: absolute; inset: 0; display:grid; place-items:center; pointer-events:none; z-index:1; opacity: var(--do-skull-op, .13); transform: translateZ(0) scale(var(--do-skull-scale, 1)); }
  .death-overlay__skull svg { width: min(68vmin, 900px); height: auto; filter: drop-shadow(0 10px 40px rgba(0,0,0,.55)); }
  .death-overlay__content { position: relative; z-index: 2; text-align:center; pointer-events:none; padding: 0 24px; transform: translateZ(0); }
  .death-overlay__title { font-family: Impact, Haettenschweiler, 'Arial Black', system-ui, sans-serif; font-size: clamp(42px, 7.5vw, 120px); letter-spacing: .04em; color: #ff2b2b; text-shadow: 0 2px 0 #5e0000, 0 10px 24px rgba(0,0,0,.55); margin: 0 0 8px 0; line-height: .95; animation: do-pulse 2200ms ease-in-out infinite; }
  .death-overlay.glitch .death-overlay__title { animation: do-pulse 2200ms ease-in-out infinite, do-glitch-x 1800ms steps(12) infinite; }
  .death-overlay.chroma .death-overlay__title { animation: do-pulse 2200ms ease-in-out infinite, do-chroma 1400ms ease-in-out infinite; }
  .death-overlay__subtitle { font-family: system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif; font-weight: 700; font-size: clamp(14px, 2.4vw, 24px); color: #ffe6e6; opacity: .9; text-shadow: 0 1px 0 #460000, 0 6px 16px rgba(0,0,0,.5); margin: 0; }
  .death-overlay__hint { margin-top: 14px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif; font-size: 13px; letter-spacing: .06em; color: #ddd; opacity: .8; }
  .death-overlay__closezone { position:absolute; inset:0; appearance:none; background: transparent; border: 0; outline: 0; opacity: 0; pointer-events: auto; }
  `;
  const style = document.createElement('style'); style.id = STYLE_ID; style.textContent = css; document.head.appendChild(style);
}

function skullSVG(fill = '#8a0a0a') {
  return `
  <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g fill="${fill}">
      <path d="M64 8c-26 0-46 19-46 42 0 12 5 19 12 26 3 3 6 7 6 10v6c0 2 2 4 4 4h8v8c0 2 2 4 4 4h24c2 0 4-2 4-4v-8h8c2 0 4-2 4-4v-6c0-3 3-7 6-10 7-7 12-14 12-26C110 27 90 8 64 8zM40 54c-6 0-10-4-10-10s4-10 10-10 10 4 10 10-4 10-10 10zm48 0c-6 0-10-4-10-10s4-10 10-10 10 4 10 10-4 10-10 10zM56 86c0-2 4-6 8-6s8 4 8 6-4 4-8 4-8-2-8-4z"/>
    </g>
  </svg>`;
}

/**
 * Mostra la schermata e ritorna un controller.
 * @param {Object} options
 * @param {string} [options.text='SEI MORTO']
 * @param {string} [options.subtext='Premi un tasto per continuare']
 * @param {boolean} [options.allowDismiss=true]
 * @param {number|null} [options.autoDismissMs=null]
 * @param {number} [options.skullOpacity=0.13]
 * @param {number} [options.skullScale=1.0]
 * @param {number} [options.blur=2]
 * @param {'none'|'glitch'|'chroma'} [options.effect='none']
 * @returns {{ close: () => void, setText:(t:string)=>void, setSubtext:(s:string)=>void, el:HTMLElement }}
 */
export function showDeathScreen(options = {}) {
  injectStyles();
  const {
    text = 'SEI MORTO',
    subtext = '',
    allowDismiss = true,
    autoDismissMs = null,
    skullOpacity = 0.13,
    skullScale = 1.0,
    blur = 2,
    effect = 'none'
  } = options;

  const root = document.createElement('div');
  root.className = 'death-overlay';
  if (effect === 'glitch') root.classList.add('glitch');
  if (effect === 'chroma') root.classList.add('chroma');
  root.style.setProperty('--do-skull-op', String(skullOpacity));
  root.style.setProperty('--do-skull-scale', String(skullScale));
  root.style.setProperty('--do-blur', `${blur}px`);

  root.innerHTML = `
    <div class="death-overlay__bg"></div>
    <div class="death-overlay__skull">${skullSVG('#8a0a0a')}</div>
    <div class="death-overlay__content" role="dialog" aria-live="assertive" aria-label="${text}">
      <h1 class="death-overlay__title">${text}</h1>
      ${subtext ? `<p class="death-overlay__subtitle">${subtext}</p>` : ''}
      ${allowDismiss ? `<div class="death-overlay__hint">clic o tasto per chiudere</div>` : ''}
    </div>
    ${allowDismiss ? `<button class="death-overlay__closezone" aria-label="Chiudi"></button>` : ''}
  `;

  document.body.appendChild(root);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.classList.add('is-hiding');
    setTimeout(() => { try { root.remove(); } catch {} }, 260);
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

  function setText(t){ const el = root.querySelector('.death-overlay__title'); if (el) el.textContent = t; }
  function setSubtext(s){ const el = root.querySelector('.death-overlay__subtitle'); if (el) el.textContent = s; }

  return { close, setText, setSubtext, el: root };
}

export default showDeathScreen;
