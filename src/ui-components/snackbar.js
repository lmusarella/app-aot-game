const queue = [];
const getRegion = () => document.getElementById('snackbar-region');

function createSnack({ message, type = 'info', duration = 3000, actionText = null, onAction = null }) {
  const el = document.createElement('div');
  el.className = `snackbar snackbar--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const icon = document.createElement('span');
  icon.className = 'snackbar__icon';
  icon.textContent = '🔔';

  const msg = document.createElement('div');
  msg.className = 'snackbar__msg';
  msg.textContent = message;

  const close = document.createElement('button');
  close.className = 'snackbar__close';
  close.type = 'button';
  close.title = 'Chiudi';
  close.setAttribute('aria-label', 'Chiudi');
  close.textContent = '×';

  el.append(icon, msg);

  let acted = false;
  let dismissed = false;
  let autoTimer = null;
  let remaining = duration;
  let start = null;

  if (actionText) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'snackbar__action';
    actionBtn.type = 'button';
    actionBtn.textContent = actionText;
    actionBtn.addEventListener('click', () => {
      acted = true;
      try { onAction && onAction(); } catch (e) { console.error(e); }
      dismiss(el);
    });
    el.appendChild(actionBtn);
  }

  el.appendChild(close);

  const clearAutoDismiss = () => {
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
  };

  const scheduleAutoDismiss = (delay) => {
    clearAutoDismiss();
    start = Date.now();
    autoTimer = setTimeout(() => {
      if (!acted) dismiss(el);
    }, delay);
  };

  function dismiss(target) {
    if (dismissed) return;
    dismissed = true;
    clearAutoDismiss();
    target.style.animation = 'sb-exit .14s ease-in forwards';
    setTimeout(() => {
      const region = getRegion();
      if (region && target.parentNode === region) {
        region.removeChild(target);
      }

      showNext();
    }, 140);

    window.removeEventListener('keydown', onEsc);
  }

  const onEsc = (ev) => {
    if (ev.key === 'Escape') dismiss(el);
  };

  close.addEventListener('click', () => dismiss(el));

  scheduleAutoDismiss(duration);

  el.addEventListener('mouseenter', () => {
    remaining -= (Date.now() - start || 0);
    clearAutoDismiss();
  });
  el.addEventListener('mouseleave', () => {
    start = Date.now();
    scheduleAutoDismiss(remaining);
  });

  window.addEventListener('keydown', onEsc);

  return el;
}

function showNext() {
  const item = queue.shift();
  if (!item) return;
  const el = createSnack(item);
  const region = getRegion();
  if (!region) return;
  region.appendChild(el);
}

function enqueue(opts) {
  queue.push(opts);
  showNext();
}

export function showSnackBar(message, options = {}, type = 'success') {
  const { duration = 3000, actionText = null, onAction = null } = options;
  enqueue({ message, type, duration, actionText, onAction });
}
