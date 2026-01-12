import { HEX_CFG, gridSize, findUnitCell, getStack, hasHumanInCell, nextStepTowards, hexDistance, moveOneUnitBetweenStacks, nearestWallCell, setStack, renderGrid, renderBenches, clearHighlights, focusUnitOnField, humanTargetsWithin2, removeUnitEverywhere, grid } from '../../game-components/grid/grid.js';
import { pickRandom, getStat, getMusicUrlById, d, shuffle, availableTemplates } from '../../utils.js';
import { playSfx, playBg } from '../../game-components/audio/audio.js';
import { unitById, rebuildUnitIndex, GAME_STATE, DB } from '../../core/data.js';
import { scheduleSave } from '../game-sync.js';
import { openAccordionForRole } from '../../ui-components/ui.js';
import { log } from '../../core/log.js';
import { getEngagedHuman } from './engagement.js';
import showWarningC from '../effects/warningOverlayC.js';

// helper: tra i candidati ritorna quello con meno HP; a parità usa distanza, poi random
function pickLowestHpTarget(cands, fromR, fromC) {
  if (!cands.length) return null;
  const ranked = cands.map(t => ({
    ...t,
    hp: (t.unit.currHp ?? t.unit.hp ?? 0),
    d: hexDistance(fromR, fromC, t.row, t.col)
  }));
  ranked.sort((a, b) => a.hp - b.hp || a.d - b.d);
  const top = ranked.filter(x => x.hp === ranked[0].hp && x.d === ranked[0].d);
  return pickRandom(top);
}

export function stepGiant(giantId) {
  const g = unitById.get(giantId);
  if (!g || g.role !== 'enemy') return false;

  let here = findUnitCell?.(giantId) || null;
  if (!here) {
    const { R, C } = gridSize();
    const rMin = HEX_CFG.base ? 1 : 0, rMax = HEX_CFG.base ? R : R - 1;
    const cMin = rMin, cMax = HEX_CFG.base ? C : C - 1;
    outer:
    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        if ((getStack(r, c) || []).includes(giantId)) { here = { row: r, col: c }; break outer; }
      }
    }
  }
  if (!here) return false;

  const { row: r, col: c } = here;

  if (hasHumanInCell(r, c)) return false;

  const engagedHumanId = getEngagedHuman(String(giantId));
  if (engagedHumanId) {
    const tgtCell = findUnitCell(engagedHumanId);
    if (tgtCell) {
      const d = hexDistance(r, c, tgtCell.row, tgtCell.col);
      if (d > 1) {
        const step = nextStepTowards(r, c, tgtCell.row, tgtCell.col, {});
        if (step) {
          moveOneUnitBetweenStacks({ row: r, col: c }, { row: step.row, col: step.col }, giantId);
          return true;
        }
        return false;
      } else if (d === 1) {
        moveOneUnitBetweenStacks({ row: r, col: c }, { row: tgtCell.row, col: tgtCell.col }, giantId);
        return true;
      }
      return false;
    }
  }

  const humansInSight = humanTargetsWithin2(r, c);
  if (humansInSight.length) {
    const target = pickLowestHpTarget(humansInSight, r, c);
    const d = hexDistance(r, c, target.row, target.col);
    if (d > 1) {
      const step = nextStepTowards(r, c, target.row, target.col, {});
      if (step) {
        moveOneUnitBetweenStacks({ row: r, col: c }, { row: step.row, col: step.col }, giantId);
        return true;
      }
      return false;
    } else if (d === 1) {
      moveOneUnitBetweenStacks({ row: r, col: c }, { row: target.row, col: target.col }, giantId);
      return true;
    }
    return false;
  }

  const wall = nearestWallCell(r, c);
  if (!wall) return false;

  const step = nextStepTowards(r, c, wall.row, wall.col, {});
  if (step) {
    moveOneUnitBetweenStacks({ row: r, col: c }, { row: step.row, col: step.col }, giantId);
    return true;
  }
  return false;
}

export function giantsPhaseMove() {
  const giants = [...unitById.values()].filter(u => u.role === 'enemy');

  if (giants.length) {
    log('I giganti iniziano a muoversi...', 'warning', 3000, true);
    showWarningC({
      text: 'ATTENZIONE',
      subtext: 'I giganti iniziano a muoversi...',
      theme: 'red',
      ringAmp: 1.0,
      autoDismissMs: 2500
    });
    playSfx('./assets/sounds/movimento-gigianti-2.mp3', { volume: 1, loop: false });
    setTimeout(() => {
      for (const g of giants) {
        const movimento = getStat(g, 'mov');
        if (movimento > 0) {
          for (let i = 0; i < movimento; i++) {
            const ok = stepGiant(g.id);
            if (ok === false) break;
          }
        }
      }

      clearHighlights();
      renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
    }, 2500);
  } else {
    log('Nessun gigante sulla griglia', 'warning');
  }
}

function getSpawnType(roll, spawnRate) {
  for (const [tipo, range] of Object.entries(spawnRate)) {
    if (roll >= range.min && roll <= range.max) {
      return tipo;
    }
  }
  return null;
}

export async function spawnGiant(type = null, flagNoSound = false) {
  const roll20 = d(20);
  const m = DB.MISSIONS[GAME_STATE.missionState.curIndex];
  const tipo = type !== null ? type : getSpawnType(roll20, m.spawnRate);
  const pick = pickGiantFromPool(tipo);

  if (!pick) {
    const t = tipo ? `di tipo ${tipo}` : 'disponibile';
    log(`Nessun gigante ${t} nel pool.`, 'warning');
    return false;
  }

  const unit = putGiantIntoRoster(pick);
  const cell = spawnGiantToFieldRandom(unit);

  if (cell) {
    const url = getMusicUrlById(unit.id);
    if (!flagNoSound) {
      await playSfx('./assets/sounds/flash_effect_sound.mp3', { volume: 0.3, loop: false });
      await playBg(url ? url : (tipo === 'Anomalo' ? './assets/sounds/ape_titan_sound.mp3' : './assets/sounds/start_app.mp3'));
    }

    log(`Gigante ${tipo} appare in ${cell.row}-${cell.col}`, 'warning');

    focusUnitOnField(unit.id);
    openAccordionForRole(unit.role);
  } else {
    log('Campo pieno nelle zone consentite. Il gigante è in panchina.', 'warning');
  }
  return unit.id;
}

function pickGiantFromPool(type = null) {
  const activeIds = new Set(GAME_STATE.giantsRoster.map(g => g.id));
  const avail = GAME_STATE.giantsPool.filter(g => !activeIds.has(g.id) && (!type || g.type === type));
  if (avail.length === 0) return null;
  return avail[Math.floor(Math.random() * avail.length)];
}

function putGiantIntoRoster(giant) {
  const ix = GAME_STATE.giantsPool.findIndex(g => g.id === giant.id);
  const unit = ix >= 0 ? GAME_STATE.giantsPool.splice(ix, 1)[0] : { ...giant };
  unit.template = false;
  GAME_STATE.giantsRoster.push(unit);
  rebuildUnitIndex();
  renderBenches();
  return unit;
}

function spawnGiantToFieldRandom(unit) {
  const { id, spawnArea } = unit;
  const attempts = 100;
  for (let i = 0; i < attempts; i++) {
    const x = spawnArea ? d(spawnArea.x) : d(6);
    const y = spawnArea ? d(spawnArea.y) : d(6);
    const r = y + 1;
    const c = x;
    const s = getStack(r, c);
    if (s.length < DB.SETTINGS.gridSettings.maxUnitHexagon) {
      removeUnitEverywhere(id);
      s.push(id);
      setStack(r, c, s);
      renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
      return { row: r, col: c };
    }
  }
  return null;
}

export function pickRandomTeam({ commanders = 1, recruits = 3 } = {}) {
  const poolCmd = availableTemplates('commander').filter(u => !u.dead);
  const poolRec = availableTemplates('recruit').filter(u => !u.dead);

  if (poolCmd.length < commanders || poolRec.length < recruits) {
    log('Non ci sono abbastanza unità vive nel pool per creare la squadra.', 'warning');
    return false;
  }

  shuffle(poolCmd);
  shuffle(poolRec);

  const chosen = [
    ...poolCmd.slice(0, commanders),
    ...poolRec.slice(0, recruits),
  ];

  const movedNames = [];
  for (const base of chosen) {
    const ix = GAME_STATE.alliesPool.findIndex(a => a.id === base.id);
    if (ix >= 0) {
      const unit = GAME_STATE.alliesPool.splice(ix, 1)[0];
      unit.template = false;
      GAME_STATE.alliesRoster.push(unit);
      movedNames.push(unit.name);
    }
  }

  rebuildUnitIndex();
  renderBenches();
  log(`Squadra casuale arruolata: ${movedNames.join(', ')}.`, 'success');
  openAccordionForRole('commander');
  scheduleSave('entity');
  return true;
}
