import { unitById, GAME_STATE, DB } from '../data.js';

export function seedWallRows() {
  // 1) togli eventuali vecchie entry in r.10/11/12
  for (let i = GAME_STATE.spawns.length - 1; i >= 0; i--) {
    const r = GAME_STATE.spawns[i].row;
    if (DB.SETTINGS.gridSettings.wall[r]) GAME_STATE.spawns.splice(i, 1);
  }
  // 2) crea segmenti (cloni con id univoco) e mettili in campo
  for (const [rStr, baseId] of Object.entries(DB.SETTINGS.gridSettings.wall)) {
    const r = +rStr;
    const base = GAME_STATE.walls.find(w => w.id === baseId);
    if (!base) continue;
    for (let c = 1; c <= DB.SETTINGS.gridSettings.cols; c++) {
      const segId = `${baseId}`;
      if (!unitById.has(segId)) {
        const copy = { ...base, id: segId, name: base.name + ` — ${c}`, currHp: base.hp, segment: true };
        unitById.set(segId, copy);
      }
      GAME_STATE.spawns.push({ row: r, col: c, unitIds: [segId] });
    }
  }
}
