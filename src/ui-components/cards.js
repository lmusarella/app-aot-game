import { availableTemplates, countAlive, totalByRole, displayHpForTemplate } from '../utils.js';

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
  strip.classList.remove('hand-strip');
  strip.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'hand-card';

  const actionCard = [];

  wrap.innerHTML = cardSheetHTML(deckType, card, actionCard);

  wrap.addEventListener('click', () => {
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
