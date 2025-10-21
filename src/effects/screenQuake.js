
/**
 * screenQuake.js
 * Tremore generico + preset cinematografico "caduta gigante".
 * ES Module – nessuna dipendenza.
 */
export function screenQuake(opts = {}) {
  const {
    target = typeof document !== 'undefined' ? document.documentElement : null,
    delayMs = 0,
    amp = 14,
    ms = 900,
    freq = 22,
    decay = 3.2,
    axis = 'xy',
    rotateAmp = 0,
    replace = true
  } = opts;
  if (!target) throw new Error('screenQuake: missing target/document');

  const start = performance.now() + Math.max(0, delayMs | 0);
  const KEY = '__screenQuake_req__';
  if (replace && target[KEY]) cancelAnimationFrame(target[KEY]);
  const prev = target.style.transform;

  function step(t) {
    if (t < start) { target[KEY] = requestAnimationFrame(step); return; }
    const e = Math.min(1, (t - start) / ms);
    const a = amp * Math.exp(-decay * e);
    const dt = (t - start) / 1000;
    const x = (axis !== 'y') ? Math.sin(dt * Math.PI * 2 * (freq * 0.85)) * a : 0;
    const y = (axis !== 'x') ? Math.cos(dt * Math.PI * 2 * (freq * 1.10)) * (a * 0.7) : 0;
    const r = rotateAmp ? Math.sin(dt * Math.PI * 2 * (freq * 0.50)) * rotateAmp * (1 - e) : 0;
    target.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${r}deg)`;
    if (e < 1) target[KEY] = requestAnimationFrame(step);
    else { target.style.transform = prev || ''; delete target[KEY]; }
  }

  target[KEY] = requestAnimationFrame(step);
  return { stop(){ if (target[KEY]) cancelAnimationFrame(target[KEY]); target.style.transform = prev || ''; delete target[KEY]; } };
}

export function giantFallQuake(options = {}) {
  const cfg = Object.assign({
    target: typeof document !== 'undefined' ? document.documentElement : null,
    delayMs: 0,
    intensity: 28,
    prepMs: 450,
    impactMs: 220,
    afterMs: 1400,
    rotAmp: 2.2,
    verticalBias: 1.35
  }, options);
  const { target, delayMs, intensity, prepMs, impactMs, afterMs, rotAmp, verticalBias } = cfg;
  if (!target) throw new Error('giantFallQuake: missing target');

  const start = performance.now() + Math.max(0, delayMs | 0);
  const prev = target.style.transform;
  const total = prepMs + impactMs + afterMs;

  function easeOutBack(x){ const c1=1.70158, c3=c1+1; return 1 + c3*Math.pow(x-1,3) + c1*Math.pow(x-1,2); }

  let raf;
  function step(t){
    if (t < start){ raf = requestAnimationFrame(step); return; }
    const e = Math.min(1, (t - start) / total);
    const dt = (t - start) / 1000;
    let ax=0, ay=0, rot=0;
    const twoPi = Math.PI*2;

    if (e <= prepMs/total) {
      const k = e / (prepMs/total);
      const a = intensity * 0.35 * k;
      ax = Math.sin(dt * twoPi * 10.5) * a * 0.6;
      ay = Math.cos(dt * twoPi * 11.0) * a * 0.9 * verticalBias;
      rot = Math.sin(dt * twoPi * 3.0) * (rotAmp*0.25) * k;
    } else if (e <= (prepMs+impactMs)/total) {
      const p0 = prepMs/total;
      const k = (e - p0) / (impactMs/total);
      const a = intensity * (1.0 - 0.5*k);
      const impulse = easeOutBack(1 - k) * intensity * 0.9;
      ax = Math.sin(dt * twoPi * 7.5) * a * 0.5;
      ay = Math.cos(dt * twoPi * 8.5) * a * 1.2 * verticalBias + impulse;
      rot = (1 - k) * rotAmp;
    } else {
      const p1 = (prepMs+impactMs)/total;
      const k = (e - p1) / (afterMs/total);
      const decay = Math.exp(-3.6 * k);
      const a = intensity * 0.6 * decay;
      ax = Math.sin(dt * twoPi * 5.5) * a * 0.45;
      ay = Math.cos(dt * twoPi * 6.5) * a * 0.9 * verticalBias;
      rot = Math.sin(dt * twoPi * 1.2) * (rotAmp*0.6) * (1 - k);
    }

    target.style.transform = `translate3d(${ax}px, ${ay}px, 0) rotate(${rot}deg)`;
    if (e < 1) { raf = requestAnimationFrame(step); }
    else { target.style.transform = prev || ''; }
  }
  raf = requestAnimationFrame(step);
  return { stop(){ cancelAnimationFrame(raf); target.style.transform = prev || ''; } };
}

export default screenQuake;
