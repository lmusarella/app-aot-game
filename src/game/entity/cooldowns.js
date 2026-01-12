import { unitById, GAME_STATE } from '../../core/data.js';
import { scheduleSave } from '../game-sync.js';
import { log } from '../../log.js';

export function resetMissionEffectsAllUnits({ includeRoles = ['recruit', 'commander', 'enemy'], skipWalls = true } = {}) {
  const touched = [];
  const iter = (unitById && typeof unitById.values === 'function')
    ? unitById.values()
    : (Array.isArray(GAME_STATE?.alliesRoster) ? [...GAME_STATE.alliesRoster, ...GAME_STATE.giantsRoster] : []);

  for (const u of iter) {
    if (!u) continue;
    if (skipWalls && u.role === 'wall') continue;
    if (!includeRoles.includes(u.role)) continue;

    const effs = Array.isArray(u._effects) ? u._effects : [];
    if (!effs.length) continue;

    const before = effs.length;

    u._effects = effs.filter(e => {
      const isMission = (e?.type === 'mission') || (e?.rounds === Infinity);
      return !isMission;
    });

    if (u._effects.length !== before) touched.push(u.id);
  }

  try { scheduleSave?.('entity'); } catch { }
  try { log?.(`Reset modificatori di missione per ${touched.length} unità.`, 'info'); } catch { }

  try {
    const ev = new CustomEvent('unitEffectsChanged', { detail: { unitIds: touched } });
    document.dispatchEvent(ev);
  } catch { }

  return touched;
}

function tickUnitCooldowns(unit, delta = 1) {
  const ab = unit?.ability;
  if (!ab) return;
  if (ab.coolDownLeft > 0) {
    ab.coolDownLeft = Math.max(0, ab.coolDownLeft - Math.max(1, delta));
  }
}

export function advanceAllCooldowns(
  delta = 1,
  { giantsOnly = false, humansOnly = false, silent = false } = {}
) {
  if (!unitById || typeof unitById.values !== 'function') return;

  for (const u of unitById.values()) {
    if (giantsOnly && u.role !== 'enemy') continue;
    if (humansOnly && (u.role === 'enemy' || u.role === 'wall')) continue;

    const ab = u?.ability;
    if (!ab) continue;

    const before = Number(ab.coolDownLeft || 0);
    if (before <= 0) continue;

    tickUnitCooldowns(u, delta);

    if (!silent && before > 0 && ab.coolDownLeft === 0) {
      try {
        log(`L'abilità di ${u.name} è di nuovo pronta: ${ab.name || 'Abilità'}.`, 'warning');
      } catch { }
    }
  }
}

function* iterUnitsForEffects() {
  if (unitById && typeof unitById.values === 'function') {
    for (const u of unitById.values()) yield u;
  } else {
    const allies = (GAME_STATE?.alliesRoster || []);
    const giants = (GAME_STATE?.giantsRoster || []);
    for (const u of [...allies, ...giants]) yield u;
  }
}

export function tickUnitModsOnNewRound() {
  for (const u of iterUnitsForEffects()) {
    const arr = Array.isArray(u._effects) ? u._effects : [];
    if (!arr.length) continue;

    for (const ef of arr) {
      if (Number.isFinite(ef.rounds) && ef.rounds > 0) ef.rounds--;
    }

    u._effects = arr.filter(ef => !Number.isFinite(ef.rounds) || ef.rounds > 0);
  }
  scheduleSave('entity');
}
