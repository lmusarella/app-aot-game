import { hexNeighbors, hexDistance } from './hex.js';
import { DB } from '../../core/data.js';
import { pickRandom } from '../../game-business-logic/utils.js';
import { getStack, hasWallInCell } from './stacks.js';

function defaultWalkableFn(r, c) {
  if (hasWallInCell(r, c)) return false;
  const stack = getStack(r, c) || [];
  const maxCap = DB?.SETTINGS?.gridSettings?.maxUnitHexagon ?? Infinity;
  return stack.length < maxCap;
}

export function nextStepTowards(fromR, fromC, toR, toC, { walkableFn = defaultWalkableFn } = {}) {
  const currD = hexDistance(fromR, fromC, toR, toC);
  const neigh = hexNeighbors(fromR, fromC, false).filter(p => walkableFn(p.row, p.col));

  const better = neigh
    .map(p => ({ ...p, d: hexDistance(p.row, p.col, toR, toC) }))
    .filter(p => p.d < currD);

  if (better.length) {
    const bestD = Math.min(...better.map(p => p.d));
    const best = better.filter(p => p.d === bestD);
    return pickRandom(best);
  }
  return null;
}
