import { fmtSigned, getUnitBonus, signClass, availableTemplates, countAlive, totalByRole, displayHpForTemplate } from './utils.js';
import { UNIT_SELECTED } from './data.js';
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

    const atk = unit.atk ?? "—";
    const tec = unit.tec ?? "—";         // per reclute/commanders
    const agi = unit.agi ?? "—";         // per reclute/commanders
    const cd = unit.cd ?? "—";
    const mov = unit.mov ?? "—";         // per giganti
    const rng = unit.rng ?? "—";

    const img = unit.img ?? "";
    const abi = (unit.abi ?? "").toString();

    // blocco statistiche condizionale
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
    </div>
  `
        : (role !== "wall") ? `<div class="tt-stats">
    <div class="tt-row">
      <div class="tt-label">ATK</div><div class="tt-value">${atk} ${getUnitBonus(unit, 'atk') !== 0 ? `<span class="stat-chip ${signClass(getUnitBonus(unit, 'atk'))}" title="Modificatori unità">${fmtSigned(getUnitBonus(unit, 'atk'))}</span>` : ''}</span></div>
      <div class="tt-label">TEC</div><div class="tt-value">${tec} ${getUnitBonus(unit, 'tec') !== 0 ? `<span class="stat-chip ${signClass(getUnitBonus(unit, 'tec'))}" title="Modificatori unità">${fmtSigned(getUnitBonus(unit, 'tec'))}</span>` : ''}</div>
      <div class="tt-label">AGI</div><div class="tt-value">${agi} ${getUnitBonus(unit, 'agi') !== 0 ? `<span class="stat-chip ${signClass(getUnitBonus(unit, 'agi'))}" title="Modificatori unità">${fmtSigned(getUnitBonus(unit, 'agi'))}</span>` : ''}</div>
    </div></div>
  ` : '';

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

export function renderPickTooltip(attacker, targets) {
    const items = targets.map(t => {
        const u = t.unit;
        const pct = Math.max(0, Math.min(100, Math.round(((u.currHp ?? 0) / (u.hp || 1)) * 100)));
        return `
    <button class="tcard tcard--mini" data-target-id="${u.id}" type="button" title="${u.name || 'Unità'}">
      <div class="tcard__avatar"><img src="${u.img || ''}" alt=""></div>
      <div class="tcard__body">
        <div class="tcard__name">${u.name || 'Unità'}</div>
        <div class="tcard__sub">(${t.cell.row}-${t.cell.col})</div>
        <div class="hpbar"><div class="hpbar-fill" style="width:${pct}%"></div></div>
        <div class="tcard__meta">❤️ ${u.currHp}/${u.hp}</div>
      </div>
    </button>
  `;
    }).join('');

    return `
  <div class="tt-card" data-role="${attacker.role}">
    <div class="tt-title">${attacker.name}</div>
    <div class="tt-ability-text" style="margin:6px 0 8px">Attacca un bersaglio ⚔️</div>
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
        <div class="unit-sub">
          ${u.role === 'recruit' ? 'Recluta' : 'Comandante'}
          • ATK ${u.atk} • ${u.abi ?? ''}
        </div>
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