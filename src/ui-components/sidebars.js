const leftEl = document.querySelector('.leftbar');
const rightEl = document.querySelector('aside');
const btnL = document.getElementById('toggle-left');
const btnR = document.getElementById('toggle-right');

export function setupLeftCollapse() {
  const btn = document.getElementById('toggle-left');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    document.body.classList.toggle('is-left-collapsed', expanded);
  });
};

function applyClasses() {
  const L = leftEl.classList.contains('collapsed');
  const R = rightEl.classList.contains('collapsed');

  document.body.classList.toggle('collapse-left', L && !R);
  document.body.classList.toggle('collapse-right', R && !L);
  document.body.classList.toggle('collapse-both', L && R);

  btnL.setAttribute('aria-expanded', String(!L));
  btnR.setAttribute('aria-expanded', String(!R));

  btnL.textContent = L ? '⟩' : '⟨';
  btnR.textContent = R ? '⟨' : '⟩';
}

function toggleSide(side) {
  document.body.classList.add('manual-layout');

  const el = (side === 'left') ? leftEl : rightEl;
  el.classList.toggle('collapsed');
  applyClasses();
}

export function initSidebarsListeners() {
  document.getElementById('toggle-left')?.addEventListener('click', () => toggleSide('left'));
  document.getElementById('toggle-right')?.addEventListener('click', () => toggleSide('right'));

  leftEl.addEventListener('click', () => {
    if (leftEl.classList.contains('collapsed')) toggleSide('left');
  });
  rightEl.addEventListener('click', () => {
    if (rightEl.classList.contains('collapsed')) toggleSide('right');
  });
}
