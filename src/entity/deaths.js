import { clearConeGiantData, renderBenches, renderGrid, removeUnitEverywhere, grid } from '../grid.js';
import { rebuildUnitIndex, GAME_STATE, DB } from '../data.js';
import { scheduleSave } from '../game/game-sync.js';
import { log } from '../log.js';
import { missionStatsOnUnitDeath, renderMissionUI } from '../missions.js';
import { addMorale, addXP } from '../footer.js';
import { playSfx } from '../audio.js';
import { giantFallQuake } from '../effects/screenQuake.js';
import { giantDust } from '../effects/giantDust.js';
import showDeathScreen from '../effects/deathOverlay.js';
import showVictoryScreen from '../effects/victoryOverlay.js';
import wallCollapse from '../effects/wallCollapse.js';
import { getEngagedHuman, getEngagingGiant } from './engagement.js';

export async function handleWallDeath(wallUnit) {
  wallCollapse({
    intensity: 28,
    debrisCount: 180,
    durationMs: 2000,
    emitBand: 'top',
    bandHeight: 0.22
  });
  const ROW_BY_WALL_ID = Object.fromEntries(
    Object.entries(DB.SETTINGS.gridSettings.wall).map(([r, id]) => [id, Number(r)])
  );
  wallUnit.currHp = 0;
  wallUnit.destroyed = true;

  const rows = [];
  const mapped = ROW_BY_WALL_ID[wallUnit.id];
  if (mapped) rows.push(mapped);
  for (const s of GAME_STATE.spawns) {
    const arr = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
    if (arr.includes(wallUnit.id) && !rows.includes(s.row)) rows.push(s.row);
  }

  for (let i = GAME_STATE.spawns.length - 1; i >= 0; i--) {
    if (rows.includes(GAME_STATE.spawns[i].row)) GAME_STATE.spawns.splice(i, 1);
  }

  showDeathScreen({
    text: `${wallUnit.name} è stato distrutto`,
    effect: 'chroma',
    skullOpacity: 0.13,
    skullScale: 1.0,
    blur: 2,
    allowDismiss: false,
    autoDismissMs: 3000,
  });

  renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
  renderBenches();
  log(`${wallUnit.name} è stato distrutto!`, 'error');
  scheduleSave('entity');
  await playSfx('./assets/sounds/muro_distrutto.mp3');

  setTimeout(() => {
    addMorale(DB.SETTINGS.xpMoralDefault.unitsDeathMoral[wallUnit.role]);
  }, 3000);
}

export async function handleGiantDeath(unit) {
  removeUnitEverywhere(unit.id);

  const i = GAME_STATE.giantsRoster.findIndex(g => g.id === unit.id);
  if (i >= 0) GAME_STATE.giantsRoster.splice(i, 1);

  clearConeGiantData(unit.id);

  rebuildUnitIndex();
  renderBenches();
  renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);

  log(`${unit.name} è morto.`, 'success', 3000, true);

  scheduleSave('entity');

  await playSfx('./assets/sounds/morte_gigante.mp3');

  showVictoryScreen({
    text: 'VITTORIA',
    subtext: `${unit.name} è stato abbattuto!`,
    confetti: false,
    autoDismissMs: 3000
  });

  setTimeout(() => {
    giantFallQuake({ delayMs: 0, intensity: 28 });
    giantDust({
      delayMs: 300,
      plumeCount: 140,
      durationMs: 2200,
      ringLife: 1000,
      wind: 0.08,
      tone: '#a78b6d'
    });
  }, 2200);

  setTimeout(() => {
    addMorale(DB.SETTINGS.xpMoralDefault.unitsDeathMoral[unit.type]);
    addXP(DB.SETTINGS.xpMoralDefault.giantsDeathXP[unit.type]);
  }, 3000);

  GAME_STATE.missionState.kills[unit.type] = GAME_STATE.missionState.kills[unit.type] + 1;
  renderMissionUI();
  missionStatsOnUnitDeath(unit);
  getEngagedHuman(unit.id);
  try {
    const ev = new CustomEvent('unitDeath', { unit });
    document.dispatchEvent(ev);
  } catch { }
}

export async function handleAllyDeath(unit) {
  removeUnitEverywhere(unit.id);
  const i = GAME_STATE.alliesRoster.findIndex(a => a.id === unit.id);
  if (i >= 0) GAME_STATE.alliesRoster.splice(i, 1);
  const back = { ...unit, template: true, dead: true, currHp: 0 };
  const j = GAME_STATE.alliesPool.findIndex(a => a.id === back.id);
  if (j >= 0) GAME_STATE.alliesPool[j] = back; else GAME_STATE.alliesPool.push(back);

  rebuildUnitIndex();
  renderBenches();
  renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
  log(`${unit.name} è morto/a.`, 'error');
  await playSfx('./assets/sounds/morte_umano.mp3');
  await playSfx('./assets/sounds/reclute/morte_recluta_comandante.mp3');
  showDeathScreen({
    text: `${unit.name} è ${unit.sex === 'm' ? 'morto' : 'morta'}`,
    effect: 'chroma',
    skullOpacity: 0.13,
    skullScale: 1.0,
    blur: 2,
    allowDismiss: false,
    autoDismissMs: 3000,
  });
  setTimeout(() => {
    addMorale(DB.SETTINGS.xpMoralDefault.unitsDeathMoral[unit.role]);
  }, 3000);

  missionStatsOnUnitDeath(unit);
  getEngagingGiant(unit.id);
  try {
    const ev = new CustomEvent('unitDeath', { unit });
    document.dispatchEvent(ev);
  } catch { }

  scheduleSave('entity');
}
