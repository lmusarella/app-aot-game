import { GAME_STATE } from '../../../core/data.js';
import { getStat, capModSum } from '../../../game-business-logic/utils.js';

let SUMMARY_TIMER = null;

function hpPct(u) {
  const max = u.hp ?? 1;
  const cur = Math.max(0, Math.min(max, u.currHp ?? max));
  return (cur / max) * 100;
}

function roleLabel(u) {
  if (u.role === 'enemy') return 'Gigante';
  if (u.role === 'recruit') return 'Recluta';
  if (u.role === 'commander') return 'Comandante';
  if (u.role === 'wall') return 'Muro';
  return 'Unità';
}

function ringColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--oro') || '#facc15';
}

function makeCard(u) {
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

  const chip = (label, val, cls = '') =>
    `<span class="stat-chip ${cls}">
     <span class="sc-label">${label}</span>
     <span class="sc-val">${val}</span>
   </span>`;

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

  return `
  <div class="vs-avatar" style="--ring:${ring}"><img src="${img}" alt=""></div>
  <div class="vs-info">
    <div class="vs-name">${name}</div>
    <div class="vs-sub">${sub}</div>
    <div class="vs-hp">❤️ ${u.currHp ?? u.hp}/${u.hp}</div>
    <div class="vs-bar"><div class="vs-fill" style="width:${pct.toFixed(1)}%"></div></div>
  </div>`;
}

export function showAttackSummaryOverlay(attacker, defender, {
  badgeText = 'Esito',
  lines = [],
  rollText = '',
  autoHideMs = 4000
} = {}) {
  const root = document.getElementById('atk-overlay');
  if (!root) return;
  const left = root.querySelector('.vs-card.vs-left');
  const right = root.querySelector('.vs-card.vs-right');
  const badge = root.querySelector('#atk-badge');
  const list = root.querySelector('#atk-lines');

  left.innerHTML = makeCard(attacker);
  right.innerHTML = makeCard(defender);
  if (badge) badge.textContent = badgeText;
  if (list) {
    const items = [];
    if (rollText) items.push(`<li>${rollText}</li>`);
    lines.filter(Boolean).forEach(line => items.push(`<li>${line}</li>`));
    list.innerHTML = items.join('');
  }

  root.removeAttribute('hidden');
  root.classList.add('show');
  clearTimeout(SUMMARY_TIMER);
  if (autoHideMs > 0) {
    SUMMARY_TIMER = setTimeout(() => hideAttackSummaryOverlay(), autoHideMs);
  }
}

export function hideAttackSummaryOverlay() {
  const root = document.getElementById('atk-overlay');
  if (!root) return;
  root.classList.remove('show');
  root.setAttribute('hidden', '');
  clearTimeout(SUMMARY_TIMER);
}
