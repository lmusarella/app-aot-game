import { fmtSigned, getUnitBonus, signClass, cappedDelta } from '../game-business-logic/utils.js';
import { UNIT_SELECTED, unitById, GIANT_ENGAGEMENT, GAME_STATE } from '../core/data.js';

export const tooltipEl = document.getElementById('tooltip');

export function initTooltipListeners() {
  tooltipEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-hp-delta]');
    if (!btn) return;
    const actions = e.target.closest('.tt-actions');
    const uid = actions?.dataset.uid || UNIT_SELECTED.selectedUnitId;
    if (!uid) return;
    const u = unitById.get(uid);
    const span = actions.querySelector('.hp-num');
    if (u && span) span.textContent = `${u.currHp}/${u.hp}`;
  });
}

export function getUnitTooltipHTML(unit) {
  const role = unit.role ?? 'recruit';
  const name = unit.name ?? 'Unità';
  const sub = unit.subtitle ?? (
    role === 'recruit' ? 'Recluta' :
      role === 'commander' ? 'Comandante' :
        role === 'enemy' ? 'Gigante' : 'Muro'
  );

  const max = unit.hp ?? 0;
  const hp = Math.min(max, Math.max(0, unit.currHp ?? max));
  const hpPct = max > 0 ? Math.round((hp / max) * 100) : 0;

  const effectiveBonus = GAME_STATE.xpMoraleState.effectiveBonus || { all: 0, tec: 0, agi: 0, atk: 0 };

  const atk = unit.atk ?? '—';
  const tec = unit.tec ?? '—';
  const agi = unit.agi ?? '—';
  const cd = unit.cd ?? '—';
  const mov = unit.mov ?? '—';
  const rng = unit.rng ?? '—';

  const img = unit.img ?? '';
  const abi = (unit.abi ?? '').toString();

  const atkDeltaShown = cappedDelta(atk, getUnitBonus(unit, 'atk') + effectiveBonus.atk);
  const tecDeltaShown = cappedDelta(tec, getUnitBonus(unit, 'tec') + effectiveBonus.tec);
  const agiDeltaShown = cappedDelta(agi, getUnitBonus(unit, 'agi') + effectiveBonus.agi);

  const statsForRole = (role === 'enemy')
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
    : (role !== 'wall')
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
  tooltipEl.style.display = 'block';
  positionTooltip(0, 45);
}

export function hideTooltip() {
  tooltipEl.style.display = 'none';
}

function positionTooltip(mouseX, mouseY) {
  const offset = 14; const { innerWidth: vw, innerHeight: vh } = window;
  const rect = tooltipEl.getBoundingClientRect();
  let left = mouseX + offset, top = mouseY + offset;
  if (left + rect.width > vw) left = mouseX - rect.width - offset;
  if (top + rect.height > vh) top = mouseY - rect.height - offset;
  tooltipEl.style.left = `${left}px`; tooltipEl.style.top = `${top}px`;
}

export function renderPickTooltip(attacker, targets, nemesi) {
  const engagedTargetId = (attacker.role === 'enemy')
    ? GIANT_ENGAGEMENT.get(String(attacker.id))
    : null;

  const engagedBy = new Map();
  if (attacker.role !== 'enemy') {
    for (const [g, t] of GIANT_ENGAGEMENT.entries()) {
      engagedBy.set(t, g);
    }
  }

  const items = targets.map(t => {
    const u = t;
    const pct = Math.max(0, Math.min(100, Math.round(((u.currHp ?? 0) / (u.hp || 1)) * 100)));

    let badge = '';
    if (attacker.role === 'enemy' && engagedTargetId === String(u.id)) {
      badge = '<span class="tcard__badge tag-engaged" title="Bersaglio ingaggiato">🎯 Ingaggiato</span>';
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
