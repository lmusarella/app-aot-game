
/**
 * swordSlash.js — Effetto singolo: taglio di spada (overlay canvas) con fade automatico.
 * Uso: import swordSlash from './swordSlash.js'; swordSlash({ angle: 'right-down' });
 */
export function swordSlash(opts = {}) {
  const {
    slashMs = 180, holdMs = 120, fadeMs = 520,
    thickness = 24, glow = 22, length = 1.2,
    angleDeg, angle = 'right-down',
    splatter = 0.8,
    centerSafe = true, safeInset = 0.24,
    container = typeof document !== 'undefined' ? document.body : null
  } = opts;
  if (!container) throw new Error('swordSlash: missing container/document');

  const root = document.createElement('div');
  Object.assign(root.style, { position:'fixed', inset:'0', pointerEvents:'none', zIndex:'9999', opacity:'0', transition:`opacity ${Math.max(60, Math.min(240, slashMs))}ms ease-out` });
  container.appendChild(root);

  const c = document.createElement('canvas'); const g = c.getContext('2d');
  const DPR = Math.min((globalThis.devicePixelRatio || 1), 2);

  const angDeg2 = (typeof angleDeg === 'number') ? angleDeg : (angle==='left-down'?225: angle==='right-up'?45: angle==='left-up'?135: 315);
  const ang = (angDeg2 % 360) * Math.PI / 180;

  function fit(){ c.width=Math.max(1, Math.floor((innerWidth||1)*DPR)); c.height=Math.max(1, Math.floor((innerHeight||1)*DPR)); c.style.width=(innerWidth||1)+'px'; c.style.height=(innerHeight||1)+'px'; draw(0); }
  root.appendChild(c); addEventListener('resize', fit, {passive:true}); fit();

  requestAnimationFrame(()=> root.style.opacity='1');

  const t0=performance.now(); let raf;
  function frame(t){ const e=t-t0; draw(e); if(e<(slashMs+holdMs+fadeMs)) raf=requestAnimationFrame(frame); else cleanup(); }
  raf=requestAnimationFrame(frame);

  function draw(el){
    const W=c.width,H=c.height; g.clearRect(0,0,W,H);
    const appear=Math.min(1, el/slashMs); const fs=slashMs+holdMs; const fk = el<fs?1:Math.max(0,1-(el-fs)/fadeMs); const o=appear*fk;
    const cx=W/2, cy=H/2, diag=Math.hypot(W,H), len=diag*length; const dx=Math.cos(ang)*len/2, dy=Math.sin(ang)*len/2; const x1=cx-dx,y1=cy-dy,x2=cx+dx,y2=cy+dy;
    g.save(); g.globalAlpha=o; g.lineCap='round';
    const glowG=g.createLinearGradient(x1,y1,x2,y2); glowG.addColorStop(0,'rgba(255,255,255,0)'); glowG.addColorStop(0.5,'rgba(255,255,255,0.18)'); glowG.addColorStop(1,'rgba(255,255,255,0)'); g.strokeStyle=glowG; g.lineWidth=(thickness+glow)*DPR; g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.stroke();
    const redG=g.createLinearGradient(x1,y1,x2,y2); redG.addColorStop(0,'rgba(177,6,14,0.0)'); redG.addColorStop(0.47,'rgba(177,6,14,0.95)'); redG.addColorStop(0.53,'rgba(122,0,5,1.0)'); redG.addColorStop(1,'rgba(177,6,14,0.0)'); g.strokeStyle=redG; g.lineWidth=thickness*DPR; g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.stroke();
    const core=g.createLinearGradient(x1,y1,x2,y2); core.addColorStop(0,'rgba(255,255,255,0)'); core.addColorStop(0.5,'rgba(255,255,255,0.75)'); core.addColorStop(1,'rgba(255,255,255,0)'); g.strokeStyle=core; g.lineWidth=Math.max(2, thickness*0.24)*DPR; g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.stroke();
    if (splatter>0){ const nx=-Math.sin(ang), ny=Math.cos(ang); const count=Math.round(140*splatter); const inner={x:W*safeInset,y:H*safeInset,w:W*(1-2*safeInset),h:H*(1-2*safeInset)};
      for(let i=0;i<count;i++){ const t=(Math.random()-0.5)*len; const px=cx+Math.cos(ang)*t, py=cy+Math.sin(ang)*t; const off=(Math.random()**1.1)*(thickness*1.4*DPR); const sgn=Math.random()<0.5?-1:1; const x=px+nx*off*sgn,y=py+ny*off*sgn; if (centerSafe && (x>inner.x&&x<inner.x+inner.w&&y>inner.y&&y<inner.y+inner.h)) continue; const r=(Math.random()**0.25)*2.8*DPR; g.fillStyle='rgba(177,6,14,'+(0.45+Math.random()*0.4)*o+')'; g.beginPath(); g.ellipse(x,y, r*(0.6+Math.random()*0.8), r*(0.3+Math.random()*0.7), ang+(Math.random()-0.5)*0.8, 0, Math.PI*2); g.fill(); }
    }
    g.restore();
  }
  function cleanup(){ cancelAnimationFrame(raf); removeEventListener('resize', fit); try{ root.remove(); }catch{} }
  return { dispose: cleanup };
}
export default swordSlash;
