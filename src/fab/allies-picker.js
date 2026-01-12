import { GAME_STATE, rebuildUnitIndex } from '../data.js';
import { scheduleSave } from '../game/game-sync.js';
import { log } from '../log.js';
import { renderBenches } from '../grid.js';
import { applyHpBar, COLOR_VAR, countAlive, totalByRole } from '../utils.js';
import { addLongPress, showTooltip, getUnitTooltipHTML, alliesPickerHTML, ensureModal, openAccordionForRole } from '../ui/ui.js';

export async function openAlliesPicker(role) {
  const baseIds = await pickAlliesDialog(role);
  if (!baseIds || baseIds.length === 0) return;

  const moved = [];
  for (const id of baseIds) {
    const ix = GAME_STATE.alliesPool.findIndex(a => a.id === id && a.role === role);
    if (ix === -1) continue;
    const unit = GAME_STATE.alliesPool.splice(ix, 1)[0];
    unit.template = false;
    GAME_STATE.alliesRoster.push(unit);
    moved.push(unit);
  }

  rebuildUnitIndex();
  renderBenches();

  const bench = document.getElementById('bench-allies');
  bench.style.boxShadow = '0 0 0 2px rgba(39,183,168,.55)';
  setTimeout(() => bench.style.boxShadow = '', 350);

  log(moved.length === 1 ? `Aggiunto in panchina ${moved[0].name}` : `Aggiunte ${moved.length} unità in panchina.`);
  openAccordionForRole(moved[0].role);
  scheduleSave('fab');
}

function pickAlliesDialog(role) {
  const { backdrop, modal, title, msg, btnCancel, btnConfirm, btnClose } = ensureModal();
  const roleLabel = role === 'recruit' ? 'Reclute' : 'Comandanti';
  title.textContent = `Seleziona ${roleLabel}`;
  msg.innerHTML = alliesPickerHTML(role);
  btnConfirm.textContent = 'Arruola';

  btnCancel.textContent = 'Annulla';
  btnCancel.style.display = '';
  btnClose.style.display = '';
  const grid = msg.querySelector('#ally-grid');
  const search = msg.querySelector('#ally-search');
  const tools = msg.querySelector('.picker__tools');
  const countEl = msg.querySelector('#picker-count');

  const paintPicker = () => {
    msg.querySelectorAll('.pick-card').forEach(card => {
      const id = card.dataset.id;
      const base = GAME_STATE.alliesPool.find(a => a.id === id);
      if (!base) return;

      card.classList.toggle('is-dead', !!base.dead);
      card.setAttribute('aria-disabled', String(!!base.dead));
      card.setAttribute('tabindex', base.dead ? '-1' : '0');
      const colVar = COLOR_VAR[base.color] || '#444';
      card.style.setProperty('--ring', colVar);
      card.style.setProperty('--sel', colVar);
      const actions = card.querySelector('.unit-actions');
      if (base.dead) {
        if (!card.querySelector('.pick-dead-badge')) {
          const badge = document.createElement('div');
          badge.className = 'pick-dead-badge';
          badge.title = 'Morto/a';
          card.prepend(badge);
        }
        if (!actions.querySelector('.btn-resurrect')) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn-resurrect';
          btn.dataset.id = id;
          btn.title = 'Resuscita';
          btn.textContent = 'Resuscita';
          actions.appendChild(btn);
        }
      } else {
        card.querySelector('.pick-dead-badge')?.remove();
        actions.querySelector('.btn-resurrect')?.remove();
      }

      const fill = card.querySelector('.hpbar-fill');
      const txt = card.querySelector('.hp-inline-right');
      if (fill) applyHpBar(fill, base);
      if (txt) {
        const icon = base.dead ? '☠️' : '❤️';
        const cur = base.currHp ?? base.hp;
        txt.textContent = `${icon} ${cur}/${base.hp}`;
      }

      addLongPress(card, {
        onLongPress: () => {
          const html = getUnitTooltipHTML(base);
          showTooltip(html);
        }
      });
    });

    const liveEl = msg.querySelector('#picker-live');
    if (liveEl) {
      const role = msg.querySelector('.picker').dataset.role;
      liveEl.textContent = `Vivi: ${countAlive(role)} / ${totalByRole(role)}`;
    }
  };
  paintPicker();
  const selected = new Set();
  const updateCount = () => { countEl.textContent = `Selezionate: ${selected.size}`; };
  const updateAria = (card) => {
    card.setAttribute('aria-pressed', String(card.classList.contains('is-selected')));
  };
  const toggleCard = (card) => {
    if (!card || !card.dataset.id) return;
    const id = card.dataset.id;
    if (card.classList.contains('is-selected')) {
      card.classList.remove('is-selected'); selected.delete(id);
    } else {
      card.classList.add('is-selected'); selected.add(id);
    }
    updateAria(card); updateCount();
  };
  const setCardSelected = (card, yes) => {
    if (!card) return;
    card.classList.toggle('is-selected', !!yes);
    if (yes) selected.add(card.dataset.id); else selected.delete(card.dataset.id);
    updateAria(card); updateCount();
  };
  const applyFilter = () => {
    const q = (search.value || '').toLowerCase().trim();
    grid.querySelectorAll('.pick-card').forEach(card => {
      const ok = !q || card.dataset.name.includes(q);
      card.style.display = ok ? '' : 'none';
    });
  };
  search.addEventListener('input', applyFilter);
  tools.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const act = b.dataset.act;
    const visible = Array.from(grid.querySelectorAll('.pick-card')).filter(c => c.style.display !== 'none');
    if (act === 'all') visible.forEach(c => setCardSelected(c, true));
    else if (act === 'none') visible.forEach(c => setCardSelected(c, false));
  });

  grid.addEventListener('click', (e) => {
    const resBtn = e.target.closest('.btn-resurrect');
    if (resBtn) {
      const id = resBtn.dataset.id;
      if (resurrectInPool(id)) {
        const card = resBtn.closest('.pick-card');
        const base = GAME_STATE.alliesPool.find(a => a.id === id);

        card.classList.remove('is-dead');
        card.setAttribute('aria-disabled', 'false');
        card.setAttribute('tabindex', '0');

        card.querySelector('.btn-resurrect')?.remove();
        card.querySelector('.pick-dead-badge')?.remove();

        const txt = card.querySelector('.hp-inline-right');
        const fill = card.querySelector('.hpbar-fill');
        if (txt) txt.textContent = `❤️ ${(base.currHp ?? base.hp)}/${base.hp}`;
        if (fill) applyHpBar(fill, base);

        card.classList.add('is-selected');
        selected.add(id);
        updateAria(card); updateCount();

        paintPicker();
      }
      return;
    }

    const card = e.target.closest('.pick-card');
    if (!card || !grid.contains(card)) return;
    if (card.classList.contains('is-dead')) return;

    const id = card.dataset.id;
    if (card.classList.contains('is-selected')) {
      card.classList.remove('is-selected'); selected.delete(id);
    } else {
      card.classList.add('is-selected'); selected.add(id);
    }
    updateAria(card); updateCount();
  });

  grid.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const card = e.target.closest('.pick-card'); if (!card) return;
    if (card.classList.contains('is-dead')) return;
    e.preventDefault(); toggleCard(card);
  });

  updateCount();
  return new Promise((resolve) => {
    const close = (payload) => {
      backdrop.classList.remove('show'); modal.classList.remove('show');
      document.removeEventListener('keydown', onKey);
      btnCancel.onclick = btnConfirm.onclick = null;
      setTimeout(() => resolve(payload), 100);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && e.target === document.body) btnConfirm.click();
    };
    document.addEventListener('keydown', onKey);
    btnClose.onclick = () => close(null);
    btnCancel.onclick = () => close(null);
    btnConfirm.onclick = () => close(Array.from(selected));

    requestAnimationFrame(() => {
      backdrop.classList.add('show'); modal.classList.add('show');
      search?.focus();
    });
  });
}

function resurrectInPool(id) {
  const u = GAME_STATE.alliesPool.find(a => a.id === id);
  if (!u) return false;
  u.dead = false;
  u.currHp = u.hp;
  scheduleSave('fab');
  return true;
}
