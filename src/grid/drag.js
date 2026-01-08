export function enablePointerDrag(el, { makePayload, onDrop }) {
  (function ensureDragGhostStyles() {
    if (document.getElementById('drag-ghost-styles')) return;
    const css = `
    .drag-ghost {
      position: fixed;
      left: 0; top: 0;
      transform: translate(-50%,-50%);
      width: var(--ghost-size, 72px);
      height: var(--ghost-size, 72px);
      pointer-events: none;
      z-index: 99999;
      will-change: transform, filter, opacity;
      filter: drop-shadow(0 6px 10px rgba(0,0,0,.25));
      animation: dg-float 1.2s ease-in-out infinite alternate;
    }
    .drag-ghost.dg-pop { animation: dg-pop .16s ease-out, dg-float 1.2s ease-in-out .16s infinite alternate; }

    .drag-ghost .dg-chip {
      position: absolute; inset: 0;
      display: grid; place-items: center;
      transform: rotate(var(--tilt, 0deg));
    }
    .drag-ghost .dg-circle {
      position: relative;
      width: 100%; height: 100%;
      border-radius: 999px;
      background: radial-gradient(40% 40% at 50% 35%, rgba(255,255,255,.25), rgba(255,255,255,0)) ,
                  var(--ghost-bg, #1b1b1b);
      outline: 2px solid color-mix(in srgb, var(--sel, #66f) 55%, #fff 45%);
      box-shadow:
        0 0 0 3px color-mix(in srgb, var(--sel, #66f) 30%, transparent),
        0 10px 18px rgba(0,0,0,.28),
        0 1px 0 rgba(255,255,255,.1) inset;
      overflow: visible;
    }
    .drag-ghost .dg-inner{
      position: absolute; inset: 10%;
      border-radius: inherit;
      overflow: hidden;
      display: grid; place-items: center;
      background: transparent;
    }
    .drag-ghost .dg-inner img {
      width: 100%; height: 100%;
      object-fit: contain; display: block;
      -webkit-user-drag: none; user-select: none; pointer-events: none;
      image-rendering: auto;
      transform: translateZ(0);
    }

    .drag-ghost .dg-shadow{
      position:absolute; left:50%; top: calc(100% - 6px);
      width: 55%; height: 14px; transform: translateX(-50%);
      background: radial-gradient(50% 60% at 50% 50%, rgba(0,0,0,.35), rgba(0,0,0,0));
      filter: blur(2px);
      opacity:.85;
    }

    .drag-ghost::after{
      content:""; position:absolute; inset:-8%;
      background: conic-gradient(from 200deg, color-mix(in srgb, var(--sel,#66f) 18%, transparent), transparent 30% 100%);
      filter: blur(10px);
      opacity:.25; transform: rotate(calc(var(--tilt,0deg)*.4));
      pointer-events:none;
    }

    @keyframes dg-pop { from{ transform: translate(-50%,-50%) scale(.86);} to{ transform: translate(-50%,-50%) scale(1);} }
    @keyframes dg-float { from{ transform: translate(-50%,-50%) translateY(-1.5px);} to{ transform: translate(-50%,-50%) translateY(1.5px);} }
    @keyframes dg-pulse {
      0%,100%{ filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
      50%{ filter: drop-shadow(0 6px 10px rgba(0,0,0,.18)); }
    }
    `;
    const tag = document.createElement('style');
    tag.id = 'drag-ghost-styles';
    tag.textContent = css;
    document.head.appendChild(tag);
  })();

  const INTERACTIVE_SEL = 'button, a, input, textarea, select, [role="button"], .hp-btn, .card-trash';
  const isInteractiveTarget = (t) => !!t?.closest?.(INTERACTIVE_SEL);

  el.addEventListener('dragstart', e => e.preventDefault(), { passive: false });
  el.querySelectorAll('img').forEach(img => {
    img.draggable = false;
    img.addEventListener('dragstart', e => e.preventDefault(), { passive: false });
  });

  el.querySelectorAll(INTERACTIVE_SEL).forEach(btn => {
    const stop = (ev) => ev.stopPropagation();
    btn.addEventListener('pointerdown', stop, { capture: true });
    btn.addEventListener('pointerup', stop, { capture: true });
    btn.addEventListener('touchstart', stop, { capture: true });
    btn.addEventListener('touchend', stop, { capture: true });
    btn.style.touchAction = 'auto';
    btn.style.pointerEvents = 'auto';
  });

  el.style.touchAction = 'none';

  let ghost = null;
  let startX = 0, startY = 0;
  let prevX = 0, prevY = 0;
  let activeId = null;
  let dragging = false;
  let lastHoverHex = null;
  const MOVE_THRESHOLD = 8;

  const createGhost = (x, y) => {
    if (ghost) return;
    const imgEl =
      el.querySelector('img') ||
      el.closest('.unit-card')?.querySelector('.unit-avatar img');

    let size = 72;
    const hex = el.closest?.('.hexagon');
    if (hex) {
      size = parseFloat(getComputedStyle(hex).getPropertyValue('--member-size')) || size;
    } else {
      const av = el.closest?.('.unit-card')?.querySelector('.unit-avatar img');
      if (av) size = Math.min(86, Math.max(56, av.clientWidth || size));
    }

    const sel = getComputedStyle(el).getPropertyValue('--sel') || '#66f';

    ghost = document.createElement('div');
    ghost.className = 'drag-ghost dg-pop';
    ghost.style.setProperty('--ghost-size', `${size}px`);
    ghost.style.setProperty('--sel', sel.trim());
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
    ghost.innerHTML = `
      <div class="dg-shadow"></div>
      <div class="dg-chip">
        <div class="dg-circle">
          <div class="dg-inner">
            ${imgEl ? `<img src="${imgEl.currentSrc || imgEl.src}" alt="">` : ''}
          </div>
        </div>
      </div>`;
    document.body.appendChild(ghost);
  };

  const destroyGhost = () => { ghost?.remove(); ghost = null; };

  const highlightHexAt = (x, y) => {
    const target = document.elementFromPoint(x, y);
    const hex = target?.closest?.('.hexagon') || null;
    if (hex !== lastHoverHex) {
      if (lastHoverHex) lastHoverHex.classList.remove('drop-ok');
      if (hex) hex.classList.add('drop-ok');
      lastHoverHex = hex;
    }
  };

  const clearHover = () => {
    if (lastHoverHex) lastHoverHex.classList.remove('drop-ok');
    lastHoverHex = null;
  };

  const onDown = (e) => {
    if (isInteractiveTarget(e.target)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    activeId = e.pointerId;
    try { el.setPointerCapture(activeId); } catch { }
    startX = prevX = e.clientX; startY = prevY = e.clientY;
    dragging = false;
  };

  const onMove = (e) => {
    if (activeId == null || e.pointerId !== activeId) return;
    if (e.pointerType === 'mouse' && e.buttons !== 1) return cleanup();
    if (isInteractiveTarget(e.target)) return;
    e.preventDefault();

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragging && (dx * dx + dy * dy) >= MOVE_THRESHOLD * MOVE_THRESHOLD) {
      dragging = true;
      createGhost(startX, startY);
    }

    if (dragging && ghost) {
      const vx = e.clientX - prevX;
      const speed = Math.hypot(vx, e.clientY - prevY);
      const maxTilt = 10;
      const tilt = Math.max(-maxTilt, Math.min(maxTilt, vx * 0.5));
      ghost.style.setProperty('--tilt', tilt.toFixed(2) + 'deg');
      ghost.style.opacity = Math.max(.85, Math.min(1, 0.9 + speed * 0.005));
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      highlightHexAt(e.clientX, e.clientY);
      prevX = e.clientX; prevY = e.clientY;
    }
  };

  const dropAtPoint = (x, y) => {
    const target = document.elementFromPoint(x, y);
    const hex = target?.closest?.('.hexagon');
    const payload = makePayload?.();
    if (hex && payload) onDrop(hex, payload);
  };

  const onUp = (e) => {
    if (activeId == null || e.pointerId !== activeId) return;
    if (dragging) dropAtPoint(e.clientX, e.clientY);
    cleanup();
  };

  const onCancel = () => cleanup();

  const cleanup = () => {
    try { el.releasePointerCapture(activeId); } catch { }
    activeId = null;
    dragging = false;
    clearHover();
    destroyGhost();
    document.removeEventListener('pointermove', onMove, { passive: false });
    document.removeEventListener('pointerup', onUp, { passive: true });
    document.removeEventListener('pointercancel', onCancel, { passive: true });
  };

  el.addEventListener('pointerdown', onDown);
  document.addEventListener('pointermove', onMove, { passive: false });
  document.addEventListener('pointerup', onUp, { passive: true });
  document.addEventListener('pointercancel', onCancel, { passive: true });
}
