
/**
 * warningOverlayC.js (Design C: Centered Beacon)
 * Overlay centrato con beacon circolare pulsante.
 */
const STYLE_ID = 'warning-overlay-C-styles-v1';

function injectStyles(){ 
  if(document.getElementById(STYLE_ID)) return; 
  const css=`
    @keyframes wc-fade-in { from { opacity: 0 } to { opacity: 1 } }
    @keyframes wc-fade-out{ from { opacity: 1 } to { opacity: 0 } }
    @keyframes wc-ring    { 0% { transform: scale(0.85); opacity:.35 } 70% { opacity:.0 } 100% { transform: scale(1.6); opacity: 0 } }
    @keyframes wc-breath  { 0%,100% { transform: scale(1)} 50% { transform: scale(1.015)} }

    .w3-root { position: fixed; inset:0; z-index:999998; display:grid; place-items:center; animation: wc-fade-in 220ms ease-out both; }
    .w3-root.is-out { animation: wc-fade-out 200ms ease-in both; }

    .w3-bg { position:absolute; inset:0; background: radial-gradient(120% 80% at 50% 40%, rgba(0,0,0,0) 0%, rgba(0,0,0,.45) 55%, rgba(0,0,0,.78) 85%), linear-gradient(180deg, rgba(15,12,0,.65), rgba(0,0,0,.85)); filter: saturate(1.05); backdrop-filter: blur(var(--w3-blur,1.5px)); -webkit-backdrop-filter: blur(var(--w3-blur,1.5px)); }

    .w3-stack { position:relative; display:grid; place-items:center; pointer-events:none; }

    .w3-beacon { position:absolute; width:min(70vmin, 900px); aspect-ratio:1; display:grid; place-items:center; filter: drop-shadow(0 8px 30px rgba(0,0,0,.5)); }
    .w3-beacon .ring { position:absolute; inset:0; border-radius:50%; border:2px solid color-mix(in srgb, var(--w3-accent) 60%, #fff0); opacity:.4; }
    .w3-beacon .ring.r1 { animation: wc-ring 1600ms ease-out infinite; }
    .w3-beacon .ring.r2 { animation: wc-ring 1600ms ease-out 400ms infinite; }
    .w3-beacon .ring.r3 { animation: wc-ring 1600ms ease-out 800ms infinite; }
    .w3-beacon .core { width: 30%; aspect-ratio:1; border-radius:50%; background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--w3-accent) 55%, #fff), color-mix(in srgb, var(--w3-accent) 15%, #000)); box-shadow: 0 0 40px color-mix(in srgb, var(--w3-accent) 45%, transparent), 0 0 120px color-mix(in srgb, var(--w3-accent) 25%, transparent); animation: wc-breath 2200ms ease-in-out infinite; transform: scale(var(--w3-core-scale,1)); }

    .w3-content { position:relative; text-align:center; z-index:2; padding:0 24px; }
    .w3-title { font-family: Impact, Haettenschweiler, 'Arial Black', system-ui, sans-serif; letter-spacing:.06em; font-size: clamp(34px, 7vw, 108px); line-height: .98; margin: 0 0 6px 0; color: var(--w3-accent); text-shadow: 0 2px 0 color-mix(in srgb, var(--w3-accent) 40%, #000), 0 10px 24px rgba(0,0,0,.55); }
    .w3-sub { margin: 0; font: 800 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif; color: color-mix(in srgb, var(--w3-accent) 85%, #fff); text-shadow: 0 1px 0 color-mix(in srgb, var(--w3-accent) 35%, #000), 0 6px 16px rgba(0,0,0,.5); opacity:.95 }

    .w3-close { position:absolute; inset:0; appearance:none; background:transparent; border:0; outline:0; opacity:0; pointer-events:auto; }

    .w3-root.theme-amber { --w3-accent:#fbbf24; }
    .w3-root.theme-orange{ --w3-accent:#fb923c; }
    .w3-root.theme-red   { --w3-accent:#f87171; }
    .w3-root.theme-cyan  { --w3-accent:#38bdf8; }
    .w3-root.theme-green { --w3-accent:#22c55e; }
    .w3-root.theme-violet{ --w3-accent:#a78bfa; }
  `; 
  const s=document.createElement('style'); 
  s.id=STYLE_ID; 
  s.textContent=css; 
  document.head.appendChild(s); 
}

export function showWarningC(opts={}){
  injectStyles();
  const { text='ATTENZIONE', subtext='Zona pericolosa', theme='amber', allowDismiss=true, autoDismissMs=null, blur=1.5, ringAmp=0.8 } = opts;
  const root=document.createElement('div'); 
  root.className='w3-root'; 
  root.classList.add('theme-'+theme); 
  root.style.setProperty('--w3-blur', String(blur)+'px'); 
  root.style.setProperty('--w3-core-scale', String(ringAmp));
  root.innerHTML=`
    <div class='w3-bg'></div>
    <div class='w3-stack'>
      <div class='w3-beacon'>
        <div class='ring r1'></div>
        <div class='ring r2'></div>
        <div class='ring r3'></div>
        <div class='core'></div>
      </div>
      <div class='w3-content'>
        <h2 class='w3-title'>${text}</h2>
        ${subtext?`<p class='w3-sub'>${subtext}</p>`:''}
      </div>
    </div>
    ${allowDismiss?`<button class='w3-close' aria-label='Chiudi'></button>`:''}
  `;
  document.body.appendChild(root);

  let closed=false; 
  const close=()=>{ 
    if(closed) return; 
    closed=true; 
    root.classList.add('is-out'); 
    setTimeout(()=>{ try{ root.remove(); }catch{} }, 200); 
    detach(); 
  };
  function onKey(e){ if(!allowDismiss) return; if(e.key) close(); }
  function onClick(){ if(!allowDismiss) return; close(); }
  function detach(){ document.removeEventListener('keydown', onKey); root.removeEventListener('click', onClick); }
  if(allowDismiss){ document.addEventListener('keydown', onKey); root.addEventListener('click', onClick); }
  if(autoDismissMs && Number.isFinite(autoDismissMs)){ setTimeout(close, Math.max(0, autoDismissMs|0)); }
  return { close, el: root };
}

export default showWarningC;
