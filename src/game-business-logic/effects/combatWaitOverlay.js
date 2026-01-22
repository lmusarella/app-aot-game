export function showCombatWaitOverlay({
  title = 'Scontro in corso',
  subtitle = 'Attendi il risultato...',
  autoHideMs = 0
} = {}) {
  if (typeof document === 'undefined') return { close: () => {} };
  const root = document.createElement('div');
  root.className = 'combat-wait-overlay';
  root.innerHTML = `
    <div class="combat-wait-card">
      <div class="combat-wait-title">${title}</div>
      <div class="combat-wait-sub">${subtitle}</div>
      <div class="combat-wait-dots" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  let timer;
  const close = () => {
    if (timer) clearTimeout(timer);
    try { root.remove(); } catch {}
  };
  if (autoHideMs > 0) {
    timer = setTimeout(close, autoHideMs);
  }
  return { close, el: root };
}

export default showCombatWaitOverlay;
