import { showSnackBar } from '../../ui-components/ui-helpers.js';
import { startAttackPick, getEngagedHuman, getEngagingGiant } from '../../game-business-logic/entity/entity.js';
import { getStat, isHuman } from '../../game-business-logic/utils.js';
import { unitById } from '../../core/data.js';
import { hexWithinRadius, hexNeighbors, hexDistance } from './hex.js';
import { getStack } from './stacks.js';
import { findUnitCell } from './queries.js';
import { getGiantNemesiTarget, getGiantConeCells } from './cone.js';

const GIANT_VIEW_RADIUS = 2;

function unitsAtCell(row, col) {
  const ids = getStack(row, col) || [];
  const res = [];
  for (const id of ids) {
    const u = unitById.get(id);
    if (u) res.push(u);
  }
  return res;
}

export function humanTargetsWithin2(fromR, fromC) {
  const area = hexWithinRadius(fromR, fromC, GIANT_VIEW_RADIUS, true);
  const hits = [];
  for (const c of area) {
    const units = unitsAtCell(c.row, c.col).filter(isHuman);
    for (const u of units) {
      hits.push({ unit: u, row: c.row, col: c.col });
    }
  }
  return hits;
}

export function hasHumanInCell(row, col) {
  const stack = getStack(row, col) || [];
  return stack.some(id => {
    const u = unitById.get(id);
    return u && u.role !== 'enemy' && u.role !== 'wall';
  });
}

export function sameOrAdjCells(idA, idB) {
  const a = findUnitCell(idA), b = findUnitCell(idB);
  if (!a || !b) return false;
  if (a.row === b.row && a.col === b.col) return true;
  const neigh = hexNeighbors(a.row, a.col, true);
  return neigh.some(p => p.row === b.row && p.col === b.col);
}

function findTargetsFor(attacker, cell) {
  const out = [];
  const rng = getStat(attacker, 'rng') || 1;

  const nemesi = getGiantNemesiTarget(attacker.id) || null;
  if (attacker.role === 'enemy') {
    const cone = getGiantConeCells(attacker.id);
    const seenHuman = lowestHpHumanWithin(attacker, cell.row, cell.col, Math.max(GIANT_VIEW_RADIUS, rng)) != null;

    for (const p of cone) {
      for (const id of getStack(p.row, p.col)) {
        const u = unitById.get(id);
        if (!u) continue;
        if (seenHuman) {
          if (u.role === 'recruit' || u.role === 'commander') out.push({ ...u, cell: p });
        } else {
          if (u.role === 'wall') out.push({ ...u, cell: p });
        }
      }
    }
    return { targets: out, nemesi };
  }

  for (const p of hexWithinRadius(cell.row, cell.col, rng, true)) {
    for (const id of getStack(p.row, p.col)) {
      const u = unitById.get(id);
      if (u && u.role === 'enemy') out.push({ ...u, cell: p });
    }
  }
  return { targets: out, nemesi };
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

export function handleUnitLongPress({ unit, cell }) {
  if (unit.role === 'wall') return;

  const { targets, nemesi } = findTargetsFor(unit, cell);

  const engaged = getEngagedHuman(unit.id) || getEngagingGiant(unit.id);
  const filteredtargets = engaged ? targets.filter(target => target.id === engaged) : targets;

  if (!filteredtargets.length && !nemesi) {
    showSnackBar('Nessun bersaglio a portata.', {}, 'info');
    return;
  }

  startAttackPick(unit, filteredtargets, nemesi);
}
