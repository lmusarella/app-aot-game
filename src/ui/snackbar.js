const queue = [];
const region = document.getElementById('snackbar-region');

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

  function dismiss(target) {
    target.style.animation = 'sb-exit .14s ease-in forwards';
    setTimeout(() => {
      region.removeChild(target);

      showNext();
    }, 140);

    window.removeEventListener('keydown', onEsc);
  }

  const onEsc = (ev) => {
    if (ev.key === 'Escape') dismiss(el);
  };

  close.addEventListener('click', () => dismiss(el));

  const t = setTimeout(() => { if (!acted) dismiss(el); }, duration);

  let remaining = duration, start;
  el.addEventListener('mouseenter', () => { clearTimeout(t); remaining -= (Date.now() - start || 0); });
  el.addEventListener('mouseleave', () => { start = Date.now(); setTimeout(() => { if (!acted) dismiss(el); }, remaining); });

  window.addEventListener('keydown', onEsc);

  return el;
}

function showNext() {
  const item = queue.shift();
  if (!item) return;
  const el = createSnack(item);
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
