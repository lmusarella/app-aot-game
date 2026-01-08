const LONG_PRESS_MS = 320;

export function addLongPress(el, { onLongPress, onClick }) {
  let t = null; let fired = false; let startX = 0; let startY = 0; let pointerId = null;

  const isInteractive = (target) =>
    target.closest('button, a, input, textarea, select, .btn-icon');

  const clear = () => { if (t) { clearTimeout(t); t = null; } };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (isInteractive(e.target)) return;
    fired = false;
    startX = e.clientX; startY = e.clientY;
    pointerId = e.pointerId;
    el.setPointerCapture?.(pointerId);
    t = setTimeout(() => { fired = true; onLongPress?.(e); }, LONG_PRESS_MS);
  });

  el.addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - startX) > 6 || Math.abs(e.clientY - startY) > 6) clear();
  });

  el.addEventListener('pointerup', (e) => {
    pointerId = e.pointerId;
    el.releasePointerCapture?.(pointerId);
    if (t && !fired && !isInteractive(e.target)) onClick?.(e);
    clear();
  });

  el.addEventListener('pointercancel', clear);
}
