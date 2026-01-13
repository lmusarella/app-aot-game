const FX_DURATION_DRAW = 2000;
const FX_DURATION_USE = 1400;

function mountFx(classes, duration) {
  if (typeof document === 'undefined') return null;
  const root = document.createElement('div');
  root.className = classes;
  document.body.appendChild(root);
  const ttl = Math.max(0, Number(duration) || 0);
  const timer = setTimeout(() => {
    try { root.remove(); } catch {}
  }, ttl);
  return {
    el: root,
    close: () => {
      clearTimeout(timer);
      try { root.remove(); } catch {}
    }
  };
}

export function showCardDrawEffect() {
  return mountFx('card-fx-overlay card-fx--draw', FX_DURATION_DRAW);
}

export function showCardUseEffect(kind = 'event') {
  const safeKind = kind || 'event';
  return mountFx(`card-fx-overlay card-fx--use card-fx--${safeKind}`, FX_DURATION_USE);
}

export default showCardUseEffect;
