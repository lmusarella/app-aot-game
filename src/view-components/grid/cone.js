import { HEX_CFG, inBoundsRC, hexWithinRadius, hexDistance, offsetToCube, cubeToOffset } from './hex.js';
import { getStat, isHuman } from '../../game-business-logic/utils.js';
import { unitById, GIANT_ENGAGEMENT } from '../../core/data.js';
import { findUnitCell, nearestWallCell, unitsAtCell } from './queries.js';
import { nextStepTowards } from './pathing.js';

const HILITE = { cone: new Set() };
const GIANT_CONE_CELLS = new Map();
const GIANT_NEMESI_TARGET = new Map();

export function clearConeGiantData(gid) { GIANT_CONE_CELLS.delete(String(gid)); GIANT_NEMESI_TARGET.delete(String(gid)); }
export function clearHighlights() { HILITE.cone.clear(); }

export function setGiantConeCells(gid, cells) { GIANT_CONE_CELLS.set(String(gid), cells); }
export function getGiantConeCells(gid) { return GIANT_CONE_CELLS.get(String(gid)); }

export function setGiantNemesiTarget(gid, nemesi) { GIANT_NEMESI_TARGET.set(String(gid), nemesi); }
export function getGiantNemesiTarget(gid) { return GIANT_NEMESI_TARGET.get(String(gid)); }

export function setCone(cells) { HILITE.cone = new Set(cells.map(p => `${p.row}:${p.col}`)); }
export function isConeCell(r, c) { return HILITE.cone.has(`${r}:${c}`); }

// Cono regolare: profondità = range, 3 "raggi" (dir-1, dir, dir+1)
export function hexCone(fromR, fromC, dir, range = 1, { includeOrigin = false } = {}) {
  const main = ((dir % 6) + 6) % 6;
  const vF = dirVec(main);
  const vL = dirVec((main + 5) % 6);
  const vR = dirVec((main + 1) % 6);

  const o = offsetToCube(fromR, fromC);
  const cells = [];
  const seen = new Set();

  const push = (x, y, z) => {
    const { row, col } = cubeToOffset(x, y, z);
    if (!inBoundsRC(row, col)) return;
    const k = row + ':' + col;
    if (seen.has(k)) return;
    seen.add(k); cells.push({ row, col });
  };

  if (includeOrigin) push(o.x, o.y, o.z);

  for (let d = 1; d <= Math.max(1, range | 0); d++) {
    for (let s = -d; s <= d; s++) {
      const a = (s < 0) ? -s : 0;
      const c = (s > 0) ? s : 0;
      const b = d - a - c;
      const x = o.x + vL.x * a + vF.x * b + vR.x * c;
      const y = o.y + vL.y * a + vF.y * b + vR.y * c;
      const z = o.z + vL.z * a + vF.z * b + vR.z * c;
      push(x, y, z);
    }
  }
  return cells;
}

export function facingDirTowards(fromR, fromC, toR, toC) {
  if (fromR === toR && fromC === toC) return 0;
  const step = nextStepTowards(fromR, fromC, toR, toC) || { row: toR, col: toC };
  let dir = dirIndexTo(fromR, fromC, step.row, step.col);
  if (dir < 0) dir = bestDirectionToward(fromR, fromC, toR, toC);
  return normDir(dir);
}

function lowestHpHumanWithin(attacker, fromR, fromC, radius) {
  const area = hexWithinRadius(fromR, fromC, radius, true);
  let best = null, bestHp = Infinity, bestD = Infinity;
  for (const p of area) {
    for (const u of unitsAtCell(p.row, p.col)) {
      if (!isHuman(u)) continue;
      const cur = u.currHp ?? u.hp ?? 0;
      const d = hexDistance(fromR, fromC, p.row, p.col);
      if (cur < bestHp || (cur === bestHp && d < bestD)) {
        best = { unit: u, row: p.row, col: p.col }; bestHp = cur; bestD = d;
      }
    }
  }
  return best;
}

const GIANT_VISION = 2;

export function pickGiantFacing(attacker, cell) {
  const R = Math.max(GIANT_VISION, getStat(attacker, 'rng') || 1);

  const engagedId = GIANT_ENGAGEMENT.get(String(attacker.id));
  if (engagedId) {
    const engaged = unitById.get(engagedId);
    const engagedCell = engaged ? findUnitCell(engaged.id) : null;
    const alive = engaged && (engaged.currHp ?? engaged.hp) > 0;
    if (alive && engagedCell) {
      return {
        dir: facingDirTowards(cell.row, cell.col, engagedCell.row, engagedCell.col),
        targetHint: { unit: engaged, row: engagedCell.row, col: engagedCell.col },
        reason: 'engaged'
      };
    } else {
      GIANT_ENGAGEMENT.delete(String(attacker.id));
    }
  }

  const human = lowestHpHumanWithin(attacker, cell.row, cell.col, R);
  if (human) {
    return {
      dir: facingDirTowards(cell.row, cell.col, human.row, human.col),
      targetHint: human,
      reason: 'lowest-hp'
    };
  }

  const wall = nearestWallCell(cell.row, cell.col);
  if (wall) {
    return {
      dir: facingDirTowards(cell.row, cell.col, wall.row, wall.col),
      targetHint: null,
      reason: 'wall'
    };
  }

  return { dir: 0, targetHint: null, reason: 'fallback' };
}

const normDir = (d) => ((d % 6) + 6) % 6;

function sixDirs(row) {
  const even = ((row - HEX_CFG.base) % 2 === 0);

  if (HEX_CFG.layout === 'odd-r') {
    return even
      ? [[0, +1], [-1, 0], [-1, -1], [0, -1], [+1, -1], [+1, 0]]
      : [[0, +1], [-1, +1], [-1, 0], [0, -1], [+1, 0], [+1, +1]];
  }
  return even
    ? [[0, +1], [-1, +1], [-1, 0], [0, -1], [+1, 0], [+1, +1]]
    : [[0, +1], [-1, 0], [-1, -1], [0, -1], [+1, -1], [+1, 0]];
}

const CUBE_DIRS = [
  { x: +1, y: -1, z: 0 }, { x: +1, y: 0, z: -1 }, { x: 0, y: +1, z: -1 },
  { x: -1, y: +1, z: 0 }, { x: -1, y: 0, z: +1 }, { x: 0, y: -1, z: +1 },
];

function dirVec(ix) { const i = ((ix % 6) + 6) % 6; return CUBE_DIRS[i]; }

function stepDir(row, col, dirIx, steps = 1) {
  const v = dirVec(dirIx);
  const c = offsetToCube(row, col);
  const nx = c.x + v.x * steps;
  const ny = c.y + v.y * steps;
  const nz = c.z + v.z * steps;
  return cubeToOffset(nx, ny, nz);
}

function dirIndexTo(fromR, fromC, toR, toC) {
  const deltas = sixDirs(fromR);
  for (let k = 0; k < 6; k++) {
    const [dr, dc] = deltas[k];
    if (fromR + dr === toR && fromC + dc === toC) return k;
  }
  return -1;
}

function bestDirectionToward(fromR, fromC, toR, toC) {
  const d0 = hexDistance(fromR, fromC, toR, toC);
  let bestIx = 0, best = Infinity;
  for (let i = 0; i < 6; i++) {
    const p = stepDir(fromR, fromC, i, 1);
    const d = hexDistance(p.row, p.col, toR, toC);
    if (d < best && d < d0) { best = d; bestIx = i; }
  }
  return bestIx;
}
