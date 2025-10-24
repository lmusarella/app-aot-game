import { fmtSigned, getUnitBonus, signClass, availableTemplates, countAlive, totalByRole, displayHpForTemplate, cappedDelta, getStat, capModSum } from './utils.js';
import { UNIT_SELECTED, unitById, GIANT_ENGAGEMENT, GAME_STATE } from './data.js';
import { initAudio, playBg } from './audio.js'

const queue = [];
const leftEl = document.querySelector('.leftbar');
const rightEl = document.querySelector('aside');
const btnL = document.getElementById('toggle-left');
const btnR = document.getElementById('toggle-right');
const region = document.getElementById('snackbar-region');

export const tooltipEl = document.getElementById("tooltip");
let _modalEls = null;
const LONG_PRESS_MS = 320;

export function initTooltipListeners() {
  tooltipEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-hp-delta]');
    if (!btn) return;
    const actions = e.target.closest('.tt-actions');
    const uid = actions?.dataset.uid || UNIT_SELECTED.selectedUnitId;
    if (!uid) return;
    // Aggiorna solo il numerino inline senza ridisegnare tutto
    const u = unitById.get(uid);
    const span = actions.querySelector('.hp-num');
    if (u && span) span.textContent = `${u.currHp}/${u.hp}`;
  });
}



export function getUnitTooltipHTML(unit) {
  const role = unit.role ?? "recruit";
  const name = unit.name ?? "Unità";
  const sub = unit.subtitle ?? (
    role === "recruit" ? "Recluta" :
      role === "commander" ? "Comandante" :
        role === "enemy" ? "Gigante" : "Muro"
  );

  const max = unit.hp ?? 0;
  const hp = Math.min(max, Math.max(0, unit.currHp ?? max));
  const hpPct = max > 0 ? Math.round((hp / max) * 100) : 0;

 const effectiveBonus = GAME_STATE.xpMoraleState.effectiveBonus || { all: 0, tec: 0, agi: 0, atk: 0 };

  const atk = unit.atk ?? "—";
  const tec = unit.tec ?? "—";         // per reclute/commanders
  const agi = unit.agi ?? "—";         // per reclute/commanders
  const cd = unit.cd ?? "—";
  const mov = unit.mov ?? "—";         // per giganti
  const rng = unit.rng ?? "—";

  const img = unit.img ?? "";
  const abi = (unit.abi ?? "").toString();

  // calcoli delta “reali” (cappati) per le stat umane
  const atkDeltaShown = cappedDelta(atk, getUnitBonus(unit, 'atk') + effectiveBonus.atk);
  const tecDeltaShown = cappedDelta(tec, getUnitBonus(unit, 'tec') + effectiveBonus.tec);
  const agiDeltaShown = cappedDelta(agi, getUnitBonus(unit, 'agi') + effectiveBonus.agi);

  const statsForRole = (role === "enemy")
    ? `<div class="tt-stats">
      <div class="tt-row">
        <div class="tt-label">ATK</div><div class="tt-value">${atk} ${getUnitBonus(unit, 'atk') !== 0 ? `<span class="stat-chip ${signClass(getUnitBonus(unit, 'atk'))}" title="Modificatori unità">${fmtSigned(getUnitBonus(unit, 'atk'))}</span>` : ''}</div>
        <div class="tt-label">CA</div><div class="tt-value">${cd} ${getUnitBonus(unit, 'cd') !== 0 ? `<span class="stat-chip ${signClass(getUnitBonus(unit, 'cd'))}" title="Modificatori unità">${fmtSigned(getUnitBonus(unit, 'cd'))}</span>` : ''}</div>
        <div class="tt-label">MOV</div><div class="tt-value">${mov} ${getUnitBonus(unit, 'mov') !== 0 ? `<span class="stat-chip ${signClass(getUnitBonus(unit, 'mov'))}" title="Modificatori unità">${fmtSigned(getUnitBonus(unit, 'mov'))}</span>` : ''}</div>
      </div>
      <div class="tt-row">
        <div class="tt-label">RNG</div><div class="tt-value">${rng} ${getUnitBonus(unit, 'rng') !== 0 ? `<span class="stat-chip ${signClass(getUnitBonus(unit, 'rng'))}" title="Modificatori unità">${fmtSigned(getUnitBonus(unit, 'rng'))}</span>` : ''}</div>
      </div>
    </div>`
    : (role !== "wall")
      ? `<div class="tt-stats">
      <div class="tt-row">
        <div class="tt-label">ATK</div>
        <div class="tt-value">
          ${atk}
          ${atkDeltaShown !== 0 ? `<span class="stat-chip ${signClass(atkDeltaShown)}" title="Modificatori unità (cappati)">${fmtSigned(atkDeltaShown)}</span>` : ''}
        </div>
        <div class="tt-label">TEC</div>
        <div class="tt-value">
          ${tec}
          ${tecDeltaShown !== 0 ? `<span class="stat-chip ${signClass(tecDeltaShown)}" title="Modificatori unità (cappati)">${fmtSigned(tecDeltaShown)}</span>` : ''}
        </div>
        <div class="tt-label">AGI</div>
        <div class="tt-value">
          ${agi}
          ${agiDeltaShown !== 0 ? `<span class="stat-chip ${signClass(agiDeltaShown)}" title="Modificatori unità (cappati)">${fmtSigned(agiDeltaShown)}</span>` : ''}
        </div>
      </div>
    </div>`
      : '';


  return `
    <div class="tt-card" data-role="${role}">
      <div class="tt-avatar">
        <img src="${img}" alt="${name}">
      </div>

      <div class="tt-title">${name}</div>
      <div class="tt-badge">${sub}</div>

      <div class="tt-hp">
        <div class="tt-hp-top"><span>HP</span><span>${hp}/${max} (${hpPct}%)</span></div>
        <div class="tt-hpbar"><div class="tt-hpfill" style="width:${hpPct}%;"></div></div>
      </div>

        ${statsForRole}
      

      ${abi
      ? `<div class="tt-ability" data-collapsed="false">
             <span class="tt-label">ABILITÀ</span>
             <div class="tt-ability-text">${abi.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
           </div>`
      : ``}
    </div>
  `;
}


export function showTooltip(html) {
  tooltipEl.innerHTML = html;
  tooltipEl.style.display = "block";
  //posizione fissa
  positionTooltip(0, 45);
}

export function hideTooltip() { tooltipEl.style.display = "none"; }

function positionTooltip(mouseX, mouseY) {
  const offset = 14; const { innerWidth: vw, innerHeight: vh } = window;
  const rect = tooltipEl.getBoundingClientRect();
  let left = mouseX + offset, top = mouseY + offset;
  if (left + rect.width > vw) left = mouseX - rect.width - offset;
  if (top + rect.height > vh) top = mouseY - rect.height - offset;
  tooltipEl.style.left = left + "px"; tooltipEl.style.top = top + "px";
}

/* pulizia sicura azioni */
function resetModalActions() {
  const { modal, btnCancel, btnConfirm } = ensureModal();
  const actions = modal.querySelector('.modal-actions');
  actions.querySelector('.card-actions')?.remove(); // rimuovi blocco temporaneo
  btnCancel.classList.remove('is-hidden');
  btnConfirm.classList.remove('is-hidden');
}
export function ensureModal() {
  if (_modalEls) return _modalEls;
  const backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div'); modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title" id="dlg-title"></div>
      <button class="modal-close" id="dlg-close" type="button" aria-label="Chiudi">×</button>
    </div>
    <div class="modal-body" id="dlg-msg"></div>
    <div class="modal-actions">
      <button class="modal-btn" id="dlg-cancel">Annulla</button>
      <button class="modal-btn danger" id="dlg-confirm">Conferma</button>
    </div>
  `;
  document.body.append(backdrop, modal);
  _modalEls = {
    backdrop, modal,
    title: modal.querySelector('#dlg-title'),
    msg: modal.querySelector('#dlg-msg'),
    btnCancel: modal.querySelector('#dlg-cancel'),
    btnConfirm: modal.querySelector('#dlg-confirm'),
    btnClose: modal.querySelector('#dlg-close'),
  };
  return _modalEls;
}


export function setupLeftAccordions() {
  const aside = document.querySelector('nav');
  if (!aside) return;

  const sections = Array.from(aside.querySelectorAll('.accordion-section'));

  // Applica lo stato iniziale letto da data-open (0/1)
  sections.forEach(sec => {
    const btn = sec.querySelector('.accordion-trigger');
    const panel = sec.querySelector('.accordion-panel');
    const open = sec.dataset.open === '1';
    btn?.setAttribute('aria-expanded', String(open));
    panel?.setAttribute('aria-hidden', String(!open));
  });

  function expandMax(sec) {
    // Calcola lo spazio disponibile totale dentro <aside>
    const styleAside = getComputedStyle(aside);
    const gap = parseFloat(styleAside.gap) || 0;
    const padT = parseFloat(styleAside.paddingTop) || 0;
    const padB = parseFloat(styleAside.paddingBottom) || 0;
    const total = aside.clientHeight;

    // Somma le altezze delle intestazioni di TUTTE le sezioni
    let consumed = padT + padB + gap * Math.max(0, sections.length - 1);
    sections.forEach(s => {
      const hdr = s.querySelector('.accordion-header');
      consumed += hdr ? hdr.offsetHeight : 0;
    });

    const max = Math.max(120, total - consumed - 8); // margine di sicurezza
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

  // Click: apertura esclusiva. Se clicchi su quello già aperto: lo chiude.
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

  // Se una sezione è già aperta all’avvio (es. "Mura"), calcola subito l’altezza massima
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

  // Applica lo stato iniziale letto da data-open (0/1)
  sections.forEach(sec => {
    const btn = sec.querySelector('.accordion-trigger');
    const panel = sec.querySelector('.accordion-panel');
    const open = sec.dataset.open === '1';
    btn?.setAttribute('aria-expanded', String(open));
    panel?.setAttribute('aria-hidden', String(!open));
  });

  function expandMax(sec) {
    // Calcola lo spazio disponibile totale dentro <aside>
    const styleAside = getComputedStyle(aside);
    const gap = parseFloat(styleAside.gap) || 0;
    const padT = parseFloat(styleAside.paddingTop) || 0;
    const padB = parseFloat(styleAside.paddingBottom) || 0;
    const total = aside.clientHeight;

    // Somma le altezze delle intestazioni di TUTTE le sezioni
    let consumed = padT + padB + gap * Math.max(0, sections.length - 1);
    sections.forEach(s => {
      const hdr = s.querySelector('.accordion-header');
      consumed += hdr ? hdr.offsetHeight : 0;
    });

    const max = Math.max(120, total - consumed - 8); // margine di sicurezza
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

  // Click: apertura esclusiva. Se clicchi su quello già aperto: lo chiude.
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

  // Se una sezione è già aperta all’avvio (es. "Mura"), calcola subito l’altezza massima
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
      : 'allies-section'; // recruit/commander (default)

  if (typeof window.openRightAccordionById === 'function') {
    window.openRightAccordionById(id);
  }

  if (typeof window.openLeftAccordionById === 'function') {
    window.openLeftAccordionById(id);
  }
}
// opzionale: wiring semplice per tutti gli accordion
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

// === COLLASSA/ESPANDI NAV SINISTRO mantenendo i titoli visibili ===
export function setupLeftCollapse() {
  const btn = document.getElementById('toggle-left');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    // inverti stato
    btn.setAttribute('aria-expanded', String(!expanded));
    document.body.classList.toggle('is-left-collapsed', expanded);
  });
};


function applyClasses() {
  // calcola lo stato dal dataset degli elementi
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
  // ⚠️ disattiva i media query "auto" dopo il primo intervento dell’utente
  document.body.classList.add('manual-layout');

  const el = (side === 'left') ? leftEl : rightEl;
  el.classList.toggle('collapsed');
  applyClasses();
}

// init: default chiusi (come richiesto), nessuna persistenza
export function initSidebarsListeners() {
  document.getElementById('toggle-left')?.addEventListener('click', () => toggleSide('left'));
  document.getElementById('toggle-right')?.addEventListener('click', () => toggleSide('right'));

  // Click sull’area collassata riapre (UX comodo)
  leftEl.addEventListener('click', (e) => {
    if (leftEl.classList.contains('collapsed')) toggleSide('left');
  });
  rightEl.addEventListener('click', (e) => {
    if (rightEl.classList.contains('collapsed')) toggleSide('right');
  });
}

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

  // Auto-dismiss solo se non c'è action o se non è stato cliccato
  const t = setTimeout(() => { if (!acted) dismiss(el); }, duration);

  // Pausa timer su hover
  let remaining = duration, start;
  el.addEventListener('mouseenter', () => { clearTimeout(t); remaining -= (Date.now() - start || 0); });
  el.addEventListener('mouseleave', () => { start = Date.now(); setTimeout(() => { if (!acted) dismiss(el); }, remaining); });

  // Abilita ESC
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

function setStandardActions({ confirmText = 'OK', cancelText = 'Annulla', danger = false, cancellable = true } = {}) {
  const { btnCancel, btnConfirm, btnClose } = ensureModal();
  resetModalActions();
  btnConfirm.textContent = confirmText;
  btnConfirm.classList.toggle('danger', !!danger);
  btnCancel.textContent = cancelText;
  btnCancel.style.display = cancellabile(cancellable);
  btnClose.style.display = cancellabile(cancellable);
}

const cancellabile = (c) => c ? '' : 'none';


export function openDialog({
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Annulla',
  danger = false,
  cancellable = true,
  detailed = false, // <-- opzionale: se true ritorna {ok, reason}
}) {
  const { backdrop, modal, title: ttl, msg, btnCancel, btnConfirm, btnClose } = ensureModal();
  ttl.textContent = title || '';
  msg.innerHTML = message || '';
  setStandardActions({ confirmText, cancelText, danger, cancellable });

  return new Promise((resolve) => {
    let resolved = false;

    const finish = (ok, reason) => {
      if (resolved) return;
      resolved = true;
      backdrop.classList.remove('show'); modal.classList.remove('show');
      setTimeout(() => resolve(detailed ? { ok, reason } : ok), 100);
      document.removeEventListener('keydown', onKey);
      backdrop.removeEventListener('click', onBackdrop);
      btnCancel.onclick = btnConfirm.onclick = btnClose.onclick = null;
      resetModalActions(); // ripristina SEMPRE
    };

    const onKey = (e) => {
      if (e.key === 'Escape' && cancellable) finish(false, 'escape');
      if (e.key === 'Enter') finish(true, 'enter');
    };

    const onBackdrop = (e) => {
      // chiudi solo se clicco “fuori” dal box e la dialog è cancellabile
      if (e.target === backdrop && cancellable) finish(false, 'backdrop');
    };

    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', onBackdrop);

    btnCancel.onclick = () => finish(false, 'cancel-button');
    btnConfirm.onclick = () => finish(true, 'confirm-button');
    btnClose.onclick = () => finish(false, 'close-x');

    requestAnimationFrame(() => {
      backdrop.classList.add('show'); modal.classList.add('show');
    });
  });
}

export function confirmDialog(opts) { return openDialog({ ...opts, cancellable: true }); }

export function renderPickTooltip(attacker, targets, nemesi) {

  const engagedTargetId = (attacker.role === 'enemy')
    ? GIANT_ENGAGEMENT.get(String(attacker.id))
    : null;

  // per evidenziare anche se il bersaglio (umano) è già ingaggiato da qualche gigante
  const engagedBy = new Map(); // targetId -> attackerId
  if (attacker.role !== 'enemy') {
    // mappa inversa: chi sta colpendo chi
    for (const [g, t] of GIANT_ENGAGEMENT.entries()) {
      engagedBy.set(t, g);
    }
  }



  const items = targets.map(t => {
    const u = t;
    const pct = Math.max(0, Math.min(100, Math.round(((u.currHp ?? 0) / (u.hp || 1)) * 100)));


    // badge per lo stato
    let badge = '';
    if (attacker.role === 'enemy' && engagedTargetId === String(u.id)) {
      badge = `<span class="tcard__badge tag-engaged" title="Bersaglio ingaggiato">🎯 Ingaggiato</span>`;
    } else if (attacker.role !== 'enemy' && engagedBy.get(String(attacker.id))) {
      const gId = engagedBy.get(String(attacker.id));
      const g = unitById.get(gId);
      badge = `<span class="tcard__badge tag-engaged" title="In combattimento con ${g?.name || 'Gigante'}">⚔️ In combat</span>`;
    }

    return `
      <button class="tcard tcard--mini" data-target-id="${u.id}" type="button" title="${u.name || 'Unità'}">
        <div class="tcard__avatar"><img src="${u.img || ''}" alt=""></div>
        <div class="tcard__body">
          <div class="tcard__name">${u.name || 'Unità'} ${badge}</div>
          <div class="tcard__sub">(${u.cell.row}-${u.cell.col})</div>
          <div class="hpbar"><div class="hpbar-fill" style="width:${pct}%"></div></div>
          <div class="tcard__meta">❤️ ${u.currHp}/${u.hp}</div>
        </div>
      </button>
    `;
  }).join('');

  const textnemesi = nemesi ? `Tiene d'occhio ${nemesi?.name} 👁️` : '';
  const textBersaglio = targets.length ? 'Scegli un bersaglio ⚔️' : '';
  return `
    <div class="tt-card" data-role="${attacker.role}">
      <div class="tt-title">${attacker.name}</div>
      <div class="tt-ability-text" style="margin:6px 0 8px">${textnemesi}</div>
      <div class="tt-ability-text" style="margin:6px 0 8px">${textBersaglio}</div>
      <div class="picklist picklist--grid">${items}</div>
    </div>
  `;
}
export function addLongPress(el, { onLongPress, onClick }) {
  let t = null, fired = false, startX = 0, startY = 0, pointerId = null;

  const isInteractive = (target) =>
    target.closest('button, a, input, textarea, select, .btn-icon');

  const clear = () => { if (t) { clearTimeout(t); t = null; } };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;              // solo click primario
    if (isInteractive(e.target)) return;     // NON partire su controlli
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

function cardChipHTML(kind) {
  const label = kind === 'consumable' ? 'Consumabile' : 'Evento';
  const cls = kind === 'consumable' ? 'card-chip--consumable' : 'card-chip--event';
  return `<span class="card-chip ${cls}">${label}</span>`;
}

export function cardSheetHTML(deck, card, actions) {
  const name = card?.name || 'Carta';
  const img = card?.img || '';
  const desc = card?.desc || '';
  const chip = cardChipHTML(deck);

  // actions = array di { key:'use'|'discard'|'add'|'remove'|'close', label:'...' , kind:'primary'|'danger'|'' }
  const actBtns = (actions || []).map(a =>
    `<button class="card-btn ${a.kind || ''}" data-act="${a.key}">${a.label}</button>`
  ).join('');

  return `
  <article class="tt-card card-sheet" data-deck="${deck}">
    <div class="tt-title">${name}</div>
    <div>${chip}</div>
    <div class="tt-avatar">${img ? `<img src="${img}" alt="${name}">` : ''}</div>
    <div class="tt-ability" data-collapsed="false">
      <span class="tt-label">DESCRIZIONE</span>
      <div class="tt-ability-text">${desc}</div>
    </div>
    <div class="picker__live"></div>
    <div class="card-actions">${actBtns}</div>
  </article>`;
}

export function showCardDetail(deckType, card) {
  const root = document.getElementById('hand-overlay');
  const strip = document.getElementById('hand-strip');
  const stage = root?.querySelector('.hand-stage');
  if (!root || !strip || !stage) return;
  stage.classList.add('hand-stage--single');
  strip.classList.remove('hand-strip')
  strip.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'hand-card';

  const actionCard = [];

  wrap.innerHTML = cardSheetHTML(deckType, card, actionCard);

  wrap.addEventListener('click', (ev) => {
    closeOverlay();
  }, { passive: true });

  strip.appendChild(wrap);

  function closeOverlay() {
    root.setAttribute('hidden', '');
    root.querySelector('.hand-backdrop').onclick = null;
    root.querySelector('.hand-close').onclick = null;
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') closeOverlay(); }

  root.querySelector('.hand-backdrop').onclick = () => {
    closeOverlay();

  };
  root.querySelector('.hand-close').onclick = () => {
    closeOverlay();

  };
  document.addEventListener('keydown', onKey);

  root.removeAttribute('hidden');
}

export function alliesPickerHTML(role) {
  const list = availableTemplates(role);
  const roleLabel = role === 'recruit' ? 'Reclute' : 'Comandanti';
  const alive = countAlive(role), tot = totalByRole(role);

  const cards = list.map(u => {
    const hpNow = displayHpForTemplate(u);
    const deadCls = u.dead ? ' is-dead' : '';
    const actions = u.dead ? `<button type="button" class="btn-resurrect" data-id="${u.id}" title="Resuscita">Resuscita</button>` : '';
    // icona HP: cuore se viva, teschio se morta
    const hpIcon = u.dead ? '☠️' : '❤️';

    return `
    <div class="unit-card pick-card${deadCls}" data-id="${u.id}" data-name="${u.name.toLowerCase()}" tabindex="${u.dead ? -1 : 0}" role="button" aria-pressed="false" aria-disabled="${u.dead}">
     
      <div class="unit-avatar"><img src="${u.img}" alt="${u.name}"></div>
      <div class="unit-info">
        <div class="unit-name">${u.name}</div>      
        <div class="pick-hprow">
          <div class="hpbar"><div class="hpbar-fill"></div></div>
          <span class="hp-inline-right">${hpIcon} ${hpNow}/${u.hp}</span>
        </div>
      </div>
      <div class="unit-actions">${actions}</div>
    </div>`;
  }).join('');

  return `
    <div class="picker" data-role="${role}">
      <div class="picker__head">
        <input id="ally-search" class="picker__search" type="search" placeholder="Cerca per nome..." autocomplete="off">
      </div>
      <div class="picker__tools">
        <div class="picker__count" id="picker-count">Selezionate: 0</div>
        <div class="picker__live" id="picker-live">Vivi: ${alive} / ${tot}</div>
        <div class="picker__spacer"></div>
        <button type="button" class="picker__btn" data-act="all">Seleziona tutto</button>
        <button type="button" class="picker__btn" data-act="none">Nessuno</button>
      </div>
      <div class="picker__grid" id="ally-grid">
        ${cards || `<div class="picker__empty">Nessuna ${roleLabel.toLowerCase()} disponibile.</div>`}
      </div>
    </div>
  `;
}



// Crea la UI avanzata solo se mancano i nodi attesi (non distrugge nulla se già presente)
export function ensureMissionCardSkeleton(card) {
  if (!card) return;
  const hasHead = card.querySelector('.mission-head');
  if (hasHead) return; // già pronto

  card.innerHTML = `


    <div id="mission-head" class="mission-head mission-card">
      <p class="mission-title">
        <strong>#<span id="mc-num"></span> — <span id="mc-title"></span></strong>
      </p>
      <ul id="mc-brief" class="mission-brief"></ul>
      <p id="mc-reward" class="mission-reward"></p>
    </div>

    <div class="mission-stats">
      <div class="msn-badge"><span class="lbl">Uccisioni</span><span id="msn-kills">0</span></div>
      <div class="msn-badge"><span class="lbl">Perdite</span><span id="msn-losses">0</span></div>
      <div class="msn-badge"><span class="lbl">Tentativi</span><span id="msn-attempts">0</span></div>
      <div class="msn-badge"><span class="lbl">Round</span><span id="msn-round">0</span></div>
    </div>

    <div class="mission-subtitle">Eventi attivati</div>
    <ul id="msn-evlist" class="msn-list"></ul>

    <div class="mission-subtitle">Effetti attivi</div>
    <div id="msn-evactive" class="msn-chips"></div>
  `;
}

// =============== VS OVERLAY ===============
let VS_TIMER = null;
const VS_THROTTLE = new Map(); // key "A|B" -> last ts

function hpPct(u) {
  const max = u.hp ?? 1; const cur = Math.max(0, Math.min(max, u.currHp ?? max));
  return (cur / max) * 100;
}
function roleLabel(u) {
  if (u.role === 'enemy') return 'Gigante';
  if (u.role === 'recruit') return 'Recluta';
  if (u.role === 'commander') return 'Comandante';
  if (u.role === 'wall') return 'Muro';
  return 'Unità';
}
function ringColor(u) {
  return getComputedStyle(document.documentElement).getPropertyValue('--oro') || '#facc15';
}

export async function showVersusOverlay(attacker, defender, {
  title = 'Scontro',
  mode = 'attack',     // 'attack' | 'engage'
  duration = 0,     // ms; se null/0 => non auto-hide
  throttleMs = 900,
} = {}) {
  const key = `${attacker.id}|${defender.id}|${mode}`;
  const now = performance.now();
  if (VS_THROTTLE.has(key) && (now - VS_THROTTLE.get(key) < throttleMs)) return { hide: hideVersusOverlay };
  VS_THROTTLE.set(key, now);

  const root = document.getElementById('vs-overlay');
  if (!root) return { hide: () => { } };

  const left = root.querySelector('.vs-card.vs-left');
  const right = root.querySelector('.vs-card.vs-right');
  const badge = root.querySelector('.vs-badge');

  const makeCard = (u) => {
    const pct = Math.max(0, Math.min(100, hpPct(u)));
    const name = u.name || '—';
    const sub = roleLabel(u);
    const ring = ringColor(u);
    const img = u.img || '';
    const effectiveBonus = GAME_STATE.xpMoraleState.effectiveBonus || { all: 0, tec: 0, agi: 0, atk: 0 };

    const TEC = getStat(u, 'tec') || 0;
    const AGI = getStat(u, 'agi') || 0;
    const ATK = getStat(u, 'atk') || 0;
    const TEC_TOTAL = capModSum(TEC, effectiveBonus.tec);
    const AGI_TOTAL = capModSum(AGI, effectiveBonus.agi);
    const ATK_TOTAL = capModSum(ATK, effectiveBonus.atk);

    // helper chip
    const chip = (label, val, cls = '') =>
      `<span class="stat-chip ${cls}">
       <span class="sc-label">${label}</span>
       <span class="sc-val">${val}</span>
     </span>`;

    // ENEMY: CA, CD ABI, ATK, RNG
    if (u.role === 'enemy') {
      return `
      <div class="vs-avatar" style="--ring:${ring}"><img src="${img}" alt=""></div>
      <div class="vs-info">
        <div class="vs-name">${name}</div>
        <div class="vs-sub">${sub}</div>
        <div class="vs-hp">❤️ ${u.currHp ?? u.hp}/${u.hp}</div>
        <div class="vs-bar"><div class="vs-fill" style="width:${pct.toFixed(1)}%"></div></div>
        <div class="vs-chips">
          ${chip('CA', u.cd ?? '—', 'chip-ca')}
          ${chip('CD', u?.ability?.cd ?? '—', 'chip-cd')}
          ${chip('ATK', getStat(u, 'atk'), 'chip-atk')}
          ${chip('RNG', getStat(u, 'rng'), 'chip-rng')}
        </div>
      </div>`;
    }

    // HUMAN (non-wall): ATK, TEC, AGI
    if (u.role !== 'enemy' && u.role !== 'wall') {
      return `
      <div class="vs-avatar" style="--ring:${ring}"><img src="${img}" alt=""></div>
      <div class="vs-info">
        <div class="vs-name">${name}</div>
        <div class="vs-sub">${sub}</div>
        <div class="vs-hp">❤️ ${u.currHp ?? u.hp}/${u.hp}</div>
        <div class="vs-bar"><div class="vs-fill" style="width:${pct.toFixed(1)}%"></div></div>
        <div class="vs-chips">
          ${chip('ATK', ATK_TOTAL, 'chip-atk')}
          ${chip('TEC', TEC_TOTAL, 'chip-tec')}
          ${chip('AGI', AGI_TOTAL, 'chip-agi')}
        </div>
      </div>`;
    }

    // WALL / altri
    return `
    <div class="vs-avatar" style="--ring:${ring}"><img src="${img}" alt=""></div>
    <div class="vs-info">
      <div class="vs-name">${name}</div>
      <div class="vs-sub">${sub}</div>
      <div class="vs-hp">❤️ ${u.currHp ?? u.hp}/${u.hp}</div>
      <div class="vs-bar"><div class="vs-fill" style="width:${pct.toFixed(1)}%"></div></div>
    </div>`;
  };


  left.innerHTML = makeCard(attacker);
  right.innerHTML = makeCard(defender);
  badge.textContent = mode === 'engage' ? 'ENGAGE' : 'VS';

  root.classList.add('show');
  root.removeAttribute('hidden');

  // no auto-hide se duration falsy
  if (duration) {
    clearTimeout(VS_TIMER);
    VS_TIMER = setTimeout(() => hideVersusOverlay(), duration);
  }

  const controller = { hide: hideVersusOverlay };

  return controller;
}

export function hideVersusOverlay() {
  const root = document.getElementById('vs-overlay');
  if (!root) return;
  root.classList.remove('show');
  root.setAttribute('hidden', '');
  clearTimeout(VS_TIMER);
}

// src/ui/diceOverlay.js
let overlayEl = null;

function buildMarkup() {
  // markup identico a quello che avevi, MA incapsulato e con backdrop/close
  return `
  <div class="diceov-backdrop" data-close></div>
  <div class="diceov-stage" role="dialog" aria-modal="true" aria-label="Lancio dadi">
    <button class="diceov-close" data-close aria-label="Chiudi" hidden>×</button>

    <div id="diceRoller"></div>
    <main id="diceRollerUI">
      <div class="top_field" hidden>
        <input type="text" id="textInput" spellcheck="false" inputmode="none" virtualkeyboardpolicy="manual"
               value="1d20"/>
      </div>
      <div id="diceLimit" style="display:none">Wow that's a lot of dice! <br>[Limit: 20]</div>
      <div id="center_div" class="center_field">
        <div id="instructions" style="display: none"><p>Swipe to roll dice</p></div>
      </div>
      <div id="numPad" class="center_field" style="display:none">
        <table class="numPad">
          <tr><td onclick="main.input('del')" colspan="2">del</td><td onclick="main.input('bksp')" colspan="2">bksp</td></tr>
          <tr><td onclick="main.input('7')">7</td><td onclick="main.input('8')">8</td><td onclick="main.input('9')">9</td><td onclick="main.input('+')" rowspan="2">+</td></tr>
          <tr><td onclick="main.input('4')">4</td><td onclick="main.input('5')">5</td><td onclick="main.input('6')">6</td></tr>
          <tr><td onclick="main.input('1')">1</td><td onclick="main.input('2')">2</td><td onclick="main.input('3')">3</td><td onclick="main.input('-')" rowspan="2">-</td></tr>
          <tr><td onclick="main.input('0')" colspan="2">0</td><td onclick="main.input('d')">d</td></tr>
        </table>
        <button onclick="main.clearInput()">CLEAR</button>
        <button onclick="main.setInput()">OK</button>
      </div>
      <div class="bottom_field" hidden><span id="result"></span></div>
    </main>
    
  </div>`;
}

function parseLastInt(text) {
  const m = String(text).match(/\d+/g);
  return m ? parseInt(m[m.length - 1], 10) : null;
}

export function openDiceOverlay({ sides = 20, keepOpen = false } = {}) {
  // crea/reusa l'overlay
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.id = 'dice-overlay';
    overlayEl.innerHTML = buildMarkup();
    document.body.appendChild(overlayEl);

    // init libreria dadi una sola volta
    if (window.main && typeof window.main.init === 'function') {
      window.main.init();
    }
    // init libreria una sola volta
    if (window.main && typeof window.main.setInput === 'function') {
      window.main.setInput();
    }

    overlayEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) closeDiceOverlay();
    });
    document.addEventListener('keydown', escClose, true);
  }

  // 🔧 reset UI ad ogni apertura: svuota risultato precedente + nascondi warning
  try {
    const res = overlayEl.querySelector('#result');
    if (res) res.textContent = '—';
    const lim = overlayEl.querySelector('#diceLimit');
    if (lim) lim.style.display = 'none';
  } catch { }

  // opzionale: chiudi eventuale riepilogo precedente sotto ai dadi
  try { hideAttackOverlayUnderDice(); } catch { }

  // mostra
  overlayEl.removeAttribute('hidden');

  // preset del dado (es. 1d20)
  const input = overlayEl.querySelector('#textInput');
  if (input) input.value = `1d${sides}`;

  // osserva #result e risolvi quando cambia
  const resultEl = overlayEl.querySelector('#result');
  let last = null;

  let resolveFn, rejectFn;
  const waitForRoll = new Promise((resolve, reject) => {
    resolveFn = resolve; rejectFn = reject;
  });

  const onMut = () => {
    const n = parseLastInt(resultEl?.textContent || '');
    if (n != null) {
      last = n;
      if (!keepOpen) closeDiceOverlay();
      cleanup();
      resolveFn(n);
    }
  };

  const mo = resultEl ? new MutationObserver(onMut) : null;
  mo?.observe(resultEl, { childList: true, characterData: true, subtree: true });

  function cleanup() {
    try { mo?.disconnect(); } catch { }
  }

  // se l'utente chiude prima di tirare → reject
  const closeRef = closeDiceOverlay;
  closeDiceOverlay = function () {
    cleanup();
    if (overlayEl) overlayEl.setAttribute('hidden', '');

    // se non c'è stato un risultato, reject la promise
    if (last == null) rejectFn?.(new Error('Dice overlay closed'));

    // ❗ chiudi anche i due overlay
    try { hideAttackOverlayUnderDice(); } catch { }
    try { hideVersusOverlay(); } catch { }

    // ripristina la funzione originale
    closeDiceOverlay = closeRef;
  };


  return {
    waitForRoll,
    close: () => { cleanup(); closeRef(); }
  };
}


function escClose(e) {
  if (e.key === 'Escape') closeDiceOverlay();
}

export function closeDiceOverlay() {
  if (!overlayEl) return;
  document.removeEventListener('keydown', escClose, true);
  overlayEl.setAttribute('hidden', '');
}

export function showAttackOverlayUnderDice({
  badge = 'Successo',
  badgeClass = '',             // 'atk-win' | 'atk-lose' | 'atk-tie'
  // NUOVO: dettagli “Per colpire” e “Tiro salvezza”
  hit = { d20: null, modLabel: 'TEC', modValue: 0, total: null, target: null, success: false },
  dodge = { d20: null, modLabel: 'AGI', modValue: 0, total: null, target: null, success: false },
  // opzionale: lista riepilogo a destra
  lines = [],
  gap = 12,
  autoHideMs = 0
} = {}) {
  const root = document.getElementById('dice-overlay');
  if (!root) return;
  const stage = root.querySelector('.diceov-stage');
  if (!stage) return;

  let under = root.querySelector('#atk-under');
  if (!under) {
    under = document.createElement('div');
    under.id = 'atk-under';
    root.appendChild(under);
  }

  const fmtMod = (v) => (v === 0 ? '' : `${v > 0 ? '+' : '-'}${Math.abs(v)}`);
  const hitStr = (hit && hit.d20 != null)
    ? `(${hit.d20}${fmtMod(hit.modValue ?? 0)}) = <b>${hit.total}</b> • CD <b>${hit.target}</b>`
    : '—';
  const dodgeStr = (dodge && dodge.d20 != null)
    ? `(${dodge.d20}${fmtMod(dodge.modValue ?? 0)}) = <b>${dodge.total}</b> • CD <b>${dodge.target}</b>`
    : '—';

  under.innerHTML = `
  <div class="atk-card">
    <div class="atk-header">
      <div class="badge-circle ${badgeClass}">${badge}</div>
    </div>

    <div class="atk-tworows">
      <div class="atk-row">
        <span class="r-emoji">🎯</span>
        <span class="r-label">Attacco</span>
        <span class="r-formula">${hitStr}</span>
        <span class="r-outcome ${hit?.success ? 'ok' : 'no'}">${hit?.success ? '🟢' : '🔴'}</span>
      </div>

      <div class="atk-row">
        <span class="r-emoji">🛡️</span>
        <span class="r-label">Schivata</span>
        <span class="r-formula">${dodgeStr}</span>
        <span class="r-outcome ${dodge?.success ? 'ok' : 'no'}">${dodge?.success ? '🟢' : '🔴'}</span>
      </div>
    </div>

    <div class="atk-tworows">
      <div class="atk-row-2">
        <span class="r-formula-2">${lines[0]}</span>
      </div>

      <div class="atk-row-2">
         <span class="r-formula-2">${lines[1]}</span>
      </div>
    </div>

  </div>
`;


  // posizionamento sotto ai dadi
  const rect = stage.getBoundingClientRect();
  under.style.top = `${rect.bottom + gap}px`;

  requestAnimationFrame(() => under.classList.add('show'));

  // reposition on resize
  const onResize = () => {
    const r = stage.getBoundingClientRect();
    under.style.top = `${r.bottom + gap}px`;
  };
  window.addEventListener('resize', onResize);
  under._onResize = onResize;

  if (autoHideMs > 0) {
    clearTimeout(under._timer);
    under._timer = setTimeout(() => hideAttackOverlayUnderDice(), autoHideMs);
  }
}

export function hideAttackOverlayUnderDice() {
  const under = document.getElementById('atk-under');
  if (!under) return;
  if (under._onResize) window.removeEventListener('resize', under._onResize);
  under.classList.remove('show');
  setTimeout(() => under.remove(), 240);
}

// === Tutorial Overlay (slider) =============================================
//
// Dipendenze “morbide” che già hai in app:
// - log (opzionale)
// - GAME_STATE, DB (solo se vuoi far partire musiche o leggere impostazioni)
// - playSfx / playBg (opzionali)
// - phases: usiamo i nomi a testo, nessuna import hard. 

const TUTORIAL_KEY = 'aot_companion_tutorial_seen_v1';

function getTutorialSlides1() {
  // immagini opzionali: metti i path che hai a progetto (gif/png/jpg)
  return [
    {
      title: 'Benvenuto!',
      html: `
        <p class="tut-lead">In questa guida impari in 1 minuto come funziona AOT Companion.</p>
        <ul class="tut-ul">
          <li>Plancia esagonale: trascina reclute/commander, clic per dettagli.</li>
          <li>In alto: <b>Missione</b> + <b>Timer</b>; in basso <b>Morale</b> e <b>XP</b>.</li>
          <li>Nel dock: <em>Giganti</em>, <em>Carte</em>, <em>Squadra</em>.</li>
        </ul>
      `,
      img: "assets/img/comandanti/erwin_popup_benvenuto.jpg",
    },
    {
      title: 'Flusso del round',
      html: `
        <p>Un round tipico segue queste fasi:</p>
        <ol class="tut-ol">
          <li><b>Allies:</b> muovi e agisci con Reclute/Comandanti.</li>
          <li><b>Giants Move:</b> ogni gigante avanza (priorità: ingaggio → bersaglio con meno HP → mura).</li>
          <li><b>Combat:</b> risolvi gli attacchi. Umano e gigante usano un <b>unico tiro</b> d20:
            <br><small>TEC vs CD per colpire • AGI vs CD per schivare abilità/attacco.</small>
          </li>
          <li><b>End:</b> tick effetti, scala cooldown abilità.</li>
        </ol>
      `,
      img: "assets/img/comandanti/erwin_popup_benvenuto.jpg",
    },
    {
      title: 'Ingaggi & movimento giganti',
      html: `
        <p>I giganti possono ingaggiarsi con <b>un solo umano</b> alla volta.</p>
        <ul class="tut-ul">
          <li>Se esiste un ingaggio valido, il gigante si muove verso quel bersaglio (anche fuori vista).</li>
          <li>Altrimenti cerca umani entro 2 esagoni e sceglie quello con <b>meno HP</b> (in parità, più vicino).</li>
          <li>Se non vede umani, avanza verso le <b>Mura</b>.</li>
        </ul>
      `,
      img: "assets/img/comandanti/erwin_popup_benvenuto.jpg",
    },
    {
      title: 'VS overlay + Dadi',
      html: `
        <p>Quando parte uno scontro, compare il <b>Versus Overlay</b> e sotto il <b>popup dadi 3D</b>.</p>
        <ul class="tut-ul">
          <li>Tira il d20 nel popup: il risultato guida <b>to-hit (TEC)</b> e <b>dodge (AGI)</b>.</li>
          <li>Il riepilogo sotto i dadi mostra badge (Successo/Fallito/Pareggio), formule e outcome.</li>
          <li>Chiudi i dadi: si chiude anche il VS.</li>
        </ul>
      `,
      img: "assets/img/comandanti/erwin_popup_benvenuto.jpg",
    },
    {
      title: 'Modificatori & cap',
      html: `
        <p>I modificatori globali/unità sono <b>cap a +5</b> per evitare sbilanciamenti.</p>
        <ul class="tut-ul">
          <li>Nel pannello a sinistra gestisci i <b>Modificatori Globali</b> e i <b>Mod Unità</b>.</li>
          <li>Tooltip e chip mostrano i delta rispetto alla statistica base.</li>
        </ul>
      `,
      img: "assets/img/comandanti/erwin_popup_benvenuto.jpg",
    },
    {
      title: 'Morte e progressione',
      html: `
        <ul class="tut-ul">
          <li>Alla morte: rimozione dal campo e aggiornamento roster/pool.</li>
          <li>Morale/XP si aggiornano automaticamente (log in tempo reale).</li>
          <li>Le abilità dei giganti vanno in cooldown, poi tornano pronte.</li>
        </ul>
        <p class="tut-lead">Buona caccia, soldato!</p>
      `,
      img: "assets/img/comandanti/erwin_popup_benvenuto.jpg",
    },
  ];
}

const TUTORIAL_DONE_KEY = 'AOT_TUTORIAL_DONE_V1';
async function preloadImg(src) {
  return new Promise(res => {
    if (!src) return res(null);
    const im = new Image();
    im.onload = () => res(src);
    im.onerror = () => res(null);
    im.src = src;
  });
}

/**
 * Tutorial a step, con “Indietro” (usando il tasto cancel del tuo openDialog).
 * Nota: assumo che openDialog ritorni true per conferma e false per cancel/chiudi.
 */
export async function showTutorialPopupViaDialog({ startIndex = 0, force = false } = {}) {
  try {
    if (!force && localStorage.getItem(TUTORIAL_DONE_KEY) === '1') return;

    const slides = getTutorialSlides1();
    if (!slides.length) return;

    let i = Math.min(Math.max(0, startIndex), slides.length - 1);

    while (i >= 0 && i < slides.length) {
      const s = slides[i];
      const okSrc = await preloadImg(s.img);
      const mediaHTML = okSrc
        ? `<img src="${okSrc}" alt="${s.title}" style="width:100%;height:auto;border-radius:8px;">`
        : `<div style="aspect-ratio:16/9;background:#1e2333;border-radius:8px;display:grid;place-items:center;color:#9aa4c7;">(Nessuna immagine)</div>`;

      const html = `
        <div class="welcome">
          <div class="welcome__media" style="margin-bottom:10px">${mediaHTML}</div>
          <div class="welcome__txt">
            <h3 style="margin:6px 0 8px;font-weight:800">${s.title}</h3>
            <div>${s.html}</div>
            <div style="margin-top:12px;opacity:.75;font-size:12px">Slide ${i + 1} di ${slides.length}</div>
          </div>
        </div>
      `;

      // Bottoni dinamici:
      const isFirst = i === 0;
      const isLast = i === slides.length - 1;

      // Se sei sulla prima slide: Cancel = Chiudi
      // Altrimenti: Cancel = Indietro
      const cancelText = isFirst ? 'Chiudi' : 'Indietro';
      const confirmText = isLast ? 'Fine' : 'Avanti';

      // openDialog: true (confirm) -> avanti; false (cancel) -> indietro/chiudi
      const res = await openDialog({
        title: 'Tutorial',
        message: html,
        confirmText,
        cancelText,
        cancellable: true,
        danger: true
      });

      if (res) { // conferma
        if (isLast) {
          // completato
          try { localStorage.setItem(TUTORIAL_DONE_KEY, '1'); } catch { }
          break;
        } else {
          i++; // avanti
        }
      } else { // cancel
        if (isFirst) {
          // Chiudi dal primo step => non segnare come completato
          break;
        } else {
          i--; // indietro
        }
      }
    }

    initAudio();
    GAME_STATE.turnEngine.phase === 'idle' ? await playBg('./assets/sounds/risorsa_audio_avvio_app.mp3') : await GAME_STATE.turnEngine.setPhaseMusic();
  } catch (err) {
    console.error('[tutorial] error', err);
  }
}