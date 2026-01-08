import { DB } from '../data.js';
import { keyRC } from '../utils.js';

export const HEX_CFG = {
  base: 1,
  layout: 'odd-r',
  autoSwapRC: false
};

export function gridSize() {
  const R = DB?.SETTINGS?.gridSettings?.rows ?? 0;
  const C = DB?.SETTINGS?.gridSettings?.cols ?? 0;
  return { R, C };
}

export function inBoundsRC(r, c) {
  const { R, C } = gridSize();
  if (HEX_CFG.base === 0) {
    return r >= 0 && r < R && c >= 0 && c < C;
  }
  return r >= 1 && r <= R && c >= 1 && c <= C;
}

function normalizeRC(r, c) {
  if (!HEX_CFG.autoSwapRC) return { r, c };

  const rcOK = inBoundsRC(r, c);
  if (rcOK) return { r, c };

  const crOK = inBoundsRC(c, r);
  return crOK ? { r: c, c: r } : { r, c };
}

export function hexNeighbors(row, col, includeSelf = true) {
  ({ r: row, c: col } = normalizeRC(row, col));

  const evenRow = ((row - HEX_CFG.base) % 2 === 0);

  const DELTAS_EVENR = evenRow
    ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
    : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];

  const DELTAS_ODDR = evenRow
    ? [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]]
    : [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];

  const build = (deltas) =>
    deltas.map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
      .filter(p => inBoundsRC(p.row, p.col));

  let neigh;
  if (HEX_CFG.layout === 'odd-r') {
    neigh = build(DELTAS_ODDR);
  } else if (HEX_CFG.layout === 'even-r') {
    neigh = build(DELTAS_EVENR);
  } else {
    const a = build(DELTAS_ODDR);
    const b = build(DELTAS_EVENR);
    const seen = new Set();
    neigh = [...a, ...b].filter(p => {
      const k = `${p.row}:${p.col}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  if (includeSelf) neigh.unshift({ row, col, self: true });
  return neigh;
}

export function hexWithinRadius(row, col, radius = 1, includeSelf = false) {
  ({ r: row, c: col } = normalizeRC(row, col));
  radius = Math.max(0, radius | 0);

  const seen = new Set([keyRC(row, col)]);
  const out = [];
  let frontier = [{ row, col }];

  if (includeSelf) out.push({ row, col, self: true });

  for (let dist = 1; dist <= radius; dist++) {
    const next = [];
    for (const p of frontier) {
      const ns = hexNeighbors(p.row, p.col, false);
      for (const n of ns) {
        const k = keyRC(n.row, n.col);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(n);
        next.push(n);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return out;
}

export function offsetToCube(row, col) {
  const base = HEX_CFG.base || 0;
  const r0 = row - base;
  const c0 = col - base;

  let x, z;
  if (HEX_CFG.layout === 'odd-r') {
    const q = c0 - ((r0 - (r0 & 1)) >> 1);
    x = q;
    z = r0;
  } else {
    const q = c0 - ((r0 + (r0 & 1)) >> 1);
    x = q;
    z = r0;
  }
  const y = -x - z;
  return { x, y, z };
}

export function cubeToOffset(x, y, z) {
  const base = HEX_CFG.base || 0;
  const r0 = z;
  let c0;
  if (HEX_CFG.layout === 'odd-r') {
    c0 = x + Math.floor((r0 - (r0 & 1)) / 2);
  } else {
    c0 = x + Math.floor((r0 + (r0 & 1)) / 2);
  }
  return { row: r0 + base, col: c0 + base };
}

export function hexDistance(r1, c1, r2, c2) {
  ({ r: r1, c: c1 } = normalizeRC(r1, c1));
  ({ r: r2, c: c2 } = normalizeRC(r2, c2));
  const a = offsetToCube(r1, c1), b = offsetToCube(r2, c2);
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}
