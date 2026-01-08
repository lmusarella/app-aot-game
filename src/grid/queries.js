import { HEX_CFG, gridSize, hexDistance } from './hex.js';
import { unitById, GAME_STATE } from '../data.js';
import { getStack, hasWallInCell } from './stacks.js';

export function findUnitCell(unitId) {
  for (const s of GAME_STATE.spawns) {
    const arr = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
    if (arr.includes(unitId)) return { row: s.row, col: s.col };
  }
  return null;
}

export function unitsAtCell(row, col) {
  const ids = getStack(row, col) || [];
  const res = [];
  for (const id of ids) {
    const u = unitById.get(id);
    if (u) res.push(u);
  }
  return res;
}

export function nearestWallCell(fromR, fromC) {
  const { R, C } = gridSize();
  const rMin = HEX_CFG.base ? 1 : 0;
  const rMax = HEX_CFG.base ? R : R - 1;
  const cMin = rMin;
  const cMax = HEX_CFG.base ? C : C - 1;

  let best = null, bestD = Infinity;
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      if (!hasWallInCell(r, c)) continue;
      const d = hexDistance(fromR, fromC, r, c);
      if (d < bestD) { bestD = d; best = { row: r, col: c }; }
    }
  }
  return best;
}
