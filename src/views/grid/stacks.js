import { DB, GAME_STATE, UNIT_SELECTED, unitById } from '../../core/data.js';
import { scheduleSave } from '../../game/game-sync.js';

export function getStack(r, c) {
  const idx = findCellIndex(r, c);
  if (idx < 0) return [];
  const s = GAME_STATE.spawns[idx];
  if (Array.isArray(s.unitIds)) return [...s.unitIds];
  if (s.unitId) return [s.unitId];
  return [];
}

export function setStack(r, c, arr) {
  const idx = findCellIndex(r, c);
  if (!arr || arr.length === 0) { if (idx >= 0) GAME_STATE.spawns.splice(idx, 1); return; }
  if (idx < 0) GAME_STATE.spawns.push({ row: r, col: c, unitIds: [...arr] });
  else GAME_STATE.spawns[idx] = { row: r, col: c, unitIds: [...arr] };
  scheduleSave('grid');
}

function findCellIndex(r, c) { return GAME_STATE.spawns.findIndex(s => s.row === r && s.col === c); }

export function setStackVisuals(hexEl, count) {
  let size;
  if (count <= 1) { size = 82; }
  else if (count === 2) { size = 62; }
  else if (count === 3) { size = 58; }
  else if (count <= 8) { size = 52; }
  else { size = 48; }
  hexEl.style.setProperty('--member-size', `${size}px`);
}

export function bringToFront(cell, unitId) {
  const list = getStack(cell.row, cell.col);
  const i = list.indexOf(unitId);
  if (i < 0) return;
  list.splice(i, 1);
  list.push(unitId);
  setStack(cell.row, cell.col, list);
}

export function removeUnitEverywhere(unitId) {
  for (let i = GAME_STATE.spawns.length - 1; i >= 0; i--) {
    const s = GAME_STATE.spawns[i];
    const arr = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
    const idx = arr.indexOf(unitId);
    if (idx >= 0) {
      arr.splice(idx, 1);
      if (arr.length === 0) GAME_STATE.spawns.splice(i, 1);
      else GAME_STATE.spawns[i] = { row: s.row, col: s.col, unitIds: arr };
      scheduleSave('grid');
      return;
    }
  }
}

export function hasWallInCell(r, c) {
  const stack = getStack(r, c);
  return stack.some(id => (unitById.get(id)?.role === 'wall'));
}

export function moveOneUnitBetweenStacks(from, to, unitId) {
  if (hasWallInCell(to.row, to.col)) return;
  const src = getStack(from.row, from.col);
  const idx = src.indexOf(unitId);
  if (idx < 0) return;
  src.splice(idx, 1);
  setStack(from.row, from.col, src);

  const tgt = getStack(to.row, to.col);
  if (tgt.length >= DB.SETTINGS.gridSettings.maxUnitHexagon) {
    src.splice(Math.min(idx, src.length), 0, unitId);
    setStack(from.row, from.col, src);
    return;
  }
  tgt.push(unitId);
  UNIT_SELECTED.selectedUnitId = unitId;
  setStack(to.row, to.col, tgt);
}
