export function setupLeftAccordions() {
  const aside = document.querySelector('nav');
  if (!aside) return;

  const sections = Array.from(aside.querySelectorAll('.accordion-section'));

  sections.forEach(sec => {
    const btn = sec.querySelector('.accordion-trigger');
    const panel = sec.querySelector('.accordion-panel');
    const open = sec.dataset.open === '1';
    btn?.setAttribute('aria-expanded', String(open));
    panel?.setAttribute('aria-hidden', String(!open));
  });

  function expandMax(sec) {
    const styleAside = getComputedStyle(aside);
    const gap = parseFloat(styleAside.gap) || 0;
    const padT = parseFloat(styleAside.paddingTop) || 0;
    const padB = parseFloat(styleAside.paddingBottom) || 0;
    const total = aside.clientHeight;

    let consumed = padT + padB + gap * Math.max(0, sections.length - 1);
    sections.forEach(s => {
      const hdr = s.querySelector('.accordion-header');
      consumed += hdr ? hdr.offsetHeight : 0;
    });

    const max = Math.max(120, total - consumed - 8);
    const inner = sec.querySelector('.accordion-inner');
    if (inner) inner.style.maxHeight = `${max}px`;
  }

  function openOne(target) {
    sections.forEach(sec => {
      const isTarget = sec === target;
      const btn = sec.querySelector('.accordion-trigger');
      const panel = sec.querySelector('.accordion-panel');

      sec.dataset.open = isTarget ? '1' : '0';
      btn?.setAttribute('aria-expanded', String(isTarget));
      panel?.setAttribute('aria-hidden', String(!isTarget));

      if (isTarget) expandMax(sec);
    });
  }

  sections.forEach(sec => {
    const btn = sec.querySelector('.accordion-trigger');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isOpen = sec.dataset.open === '1';
      if (isOpen) {
        sec.dataset.open = '0';
        sec.querySelector('.accordion-panel')?.setAttribute('aria-hidden', 'true');
        btn.setAttribute('aria-expanded', 'false');
      } else {
        openOne(sec);
      }
    });
  });

  const initialOpen = sections.find(s => s.dataset.open === '1');
  if (initialOpen) expandMax(initialOpen);

  window.openLeftAccordionById = function (id) {
    const sec = sections.find(s => s.id === id);
    if (sec) openOne(sec);
  };
};

export function setupRightAccordions() {
  const aside = document.querySelector('aside');
  if (!aside) return;

  const sections = Array.from(aside.querySelectorAll('.accordion-section'));

  sections.forEach(sec => {
    const btn = sec.querySelector('.accordion-trigger');
    const panel = sec.querySelector('.accordion-panel');
    const open = sec.dataset.open === '1';
    btn?.setAttribute('aria-expanded', String(open));
    panel?.setAttribute('aria-hidden', String(!open));
  });

  function expandMax(sec) {
    const styleAside = getComputedStyle(aside);
    const gap = parseFloat(styleAside.gap) || 0;
    const padT = parseFloat(styleAside.paddingTop) || 0;
    const padB = parseFloat(styleAside.paddingBottom) || 0;
    const total = aside.clientHeight;

    let consumed = padT + padB + gap * Math.max(0, sections.length - 1);
    sections.forEach(s => {
      const hdr = s.querySelector('.accordion-header');
      consumed += hdr ? hdr.offsetHeight : 0;
    });

    const max = Math.max(120, total - consumed - 8);
    const inner = sec.querySelector('.accordion-inner');
    if (inner) inner.style.maxHeight = `${max}px`;
  }

  function openOne(target) {
    sections.forEach(sec => {
      const isTarget = sec === target;
      const btn = sec.querySelector('.accordion-trigger');
      const panel = sec.querySelector('.accordion-panel');

      sec.dataset.open = isTarget ? '1' : '0';
      btn?.setAttribute('aria-expanded', String(isTarget));
      panel?.setAttribute('aria-hidden', String(!isTarget));

      if (isTarget) expandMax(sec);
    });
  }

  sections.forEach(sec => {
    const btn = sec.querySelector('.accordion-trigger');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isOpen = sec.dataset.open === '1';
      if (isOpen) {
        sec.dataset.open = '0';
        sec.querySelector('.accordion-panel')?.setAttribute('aria-hidden', 'true');
        btn.setAttribute('aria-expanded', 'false');
      } else {
        openOne(sec);
      }
    });
  });

  const initialOpen = sections.find(s => s.dataset.open === '1');
  if (initialOpen) expandMax(initialOpen);

  window.openRightAccordionById = function (id) {
    const sec = sections.find(s => s.id === id);
    if (sec) openOne(sec);
  };
};

export function openAccordionForRole(role) {
  const id = (role === 'enemy')
    ? 'giants-section'
    : (role === 'wall')
      ? 'walls-section'
      : 'allies-section';

  if (typeof window.openRightAccordionById === 'function') {
    window.openRightAccordionById(id);
  }

  if (typeof window.openLeftAccordionById === 'function') {
    window.openLeftAccordionById(id);
  }
}

export function setupAccordions() {
  document.querySelectorAll('.accordion-section .accordion-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const panelId = btn.getAttribute('aria-controls');
      const panel = document.getElementById(panelId);
      btn.setAttribute('aria-expanded', String(!expanded));
      if (panel) panel.setAttribute('aria-hidden', String(expanded));
    });
  });
};
