
/**
 * phaseBanner.js (v1)
 * Banner rapido per cambio fase.
 */
const STYLE_ID = 'phase-banner-styles-v1';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
  :root { --pb-z: 99990; }
  @keyframes pb-in   { 0% { transform: translateY(-18px); opacity: 0 } 100% { transform: translateY(0); opacity: 1 } }
  @keyframes pb-out  { 0% { transform: translateY(0); opacity: 1 } 100% { transform: translateY(-18px); opacity: 0 } }
  @keyframes pb-sheen {
    0% { transform: translateX(-130%) skewX(-12deg); opacity: .0 }
    40%{ opacity: .25 }
    100%{ transform: translateX(130%) skewX(-12deg); opacity: .0 }
  }
  .pb-root { position: fixed; inset: 0; z-index: var(--pb-z); pointer-events:none; display:grid; place-items:center; }
  .pb-wrap {
    position: relative;
    pointer-events: none;
    user-select: none;
    padding: 12px 20px;
    border-radius: 14px;
    box-shadow: 0 12px 36px rgba(0,0,0,.35);
    color: #fff;
    backdrop-filter: blur(6px) saturate(1.1);
    -webkit-backdrop-filter: blur(6px) saturate(1.1);
    border: 1px solid rgba(255,255,255,.08);
    animation: pb-in 260ms cubic-bezier(.22,.9,.3,1) forwards;
  }
  .pb-wrap.is-out { animation: pb-out 220ms ease-in forwards; }
  .pb-title {
    font-family: Impact, Haettenschweiler, 'Arial Black', system-ui, sans-serif;
    letter-spacing: .06em;
    font-size: clamp(22px, 4vw, 42px);
    line-height: 1.02;
    margin: 0;
    text-shadow: 0 2px 0 rgba(0,0,0,.35), 0 8px 18px rgba(0,0,0,.35);
    position: relative;
  }
  .pb-sub {
    margin: 2px 0 0 0;
    font: 600 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif;
    opacity: .95;
    text-shadow: 0 1px 0 rgba(0,0,0,.25);
  }
  .pb-sheen {
    position: absolute; inset: 0; pointer-events:none; overflow:hidden; border-radius: inherit;
  }
  .pb-sheen::before {
    content: '';
    position: absolute; top: -20%; bottom: -20%; width: 40%;
    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.3) 50%, rgba(255,255,255,0) 100%);
    filter: blur(2px);
    animation: pb-sheen 1200ms ease-out 120ms both;
  }
  /* THEMES */
  .pb-theme-red    { background: linear-gradient(180deg, rgba(120,10,20,.75), rgba(8,2,4,.75)); }
  .pb-theme-blue   { background: linear-gradient(180deg, rgba(10,60,120,.75), rgba(2,6,12,.75)); }
  .pb-theme-green  { background: linear-gradient(180deg, rgba(14,120,40,.75), rgba(2,8,4,.75)); }
  .pb-theme-neutral{ background: linear-gradient(180deg, rgba(35,40,50,.75), rgba(10,12,15,.75)); }
  .pb-bar {
    position:absolute; inset: -2px; border-radius: inherit; pointer-events:none;
    padding: 2px;
    -webkit-mask: 
      linear-gradient(#000 0 0) content-box, 
      linear-gradient(#000 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
  }
  .pb-theme-red    .pb-bar { background: linear-gradient(90deg, #ff4d4d, #ffb3b3); }
  .pb-theme-blue   .pb-bar { background: linear-gradient(90deg, #70d6ff, #b3e5ff); }
  .pb-theme-green  .pb-bar { background: linear-gradient(90deg, #7CFF6B, #d0ffd0); }
  .pb-theme-neutral .pb-bar{ background: linear-gradient(90deg, #a0a6b4, #d8dbe2); }
  `;
  const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = css; document.head.appendChild(s);
}

export default function showPhaseBanner(opts = {}) {
  injectStyles();
  const { text='NUOVA FASE', subtext='', theme='neutral', autoDismissMs=1500, zIndex=99990 } = opts;
  const root = document.createElement('div');
  root.className = 'pb-root';
  root.style.setProperty('--pb-z', String(zIndex));
  const wrap = document.createElement('div');
  wrap.className = `pb-wrap pb-theme-${theme}`;
  wrap.innerHTML = `
    <div class="pb-sheen" aria-hidden="true"></div>
    <div class="pb-bar" aria-hidden="true"></div>
    <h2 class="pb-title">${text}</h2>
    ${subtext ? `<div class="pb-sub">${subtext}</div>` : ''}
  `;
  root.appendChild(wrap);
  document.body.appendChild(root);
  let closed=false;
  const close=()=>{ if(closed) return; closed=true; wrap.classList.add('is-out'); setTimeout(()=>{ try{ root.remove(); }catch{} }, 240); };
  if (autoDismissMs && Number.isFinite(autoDismissMs)) setTimeout(close, Math.max(0, autoDismissMs|0));
  return { close, el: root };
}
