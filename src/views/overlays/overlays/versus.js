import { GAME_STATE } from '../../../core/data.js';
import { getStat, capModSum } from '../../utils.js';

let VS_TIMER = null;
const VS_THROTTLE = new Map();

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
  mode = 'attack',
  duration = 0,
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
  };

  left.innerHTML = makeCard(attacker);
  right.innerHTML = makeCard(defender);
  badge.textContent = mode === 'engage' ? 'ENGAGE' : 'VS';

  root.classList.add('show');
  root.removeAttribute('hidden');

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
