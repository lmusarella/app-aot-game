import { notifyTimerExpired, startTimer, stopTimer, syncMissionTimerFromAnchor } from "../view-components/header/header.js";
import { TurnEngine } from "../game-business-logic/phases.js";
import { seedWallRows } from "../game-business-logic/entity/entity.js";
import { DB, GAME_STATE, rebuildUnitIndex } from "../core/data.js";
import { applyCommanderAccess } from '../core/permissions.js';

export function ensureWallSpawns() {
    if (!DB?.SETTINGS?.gridSettings?.wall) return;
    if (!Array.isArray(GAME_STATE.walls) || GAME_STATE.walls.length === 0) return;
    const wallRows = Object.keys(DB.SETTINGS.gridSettings.wall || {}).map((r) => Number(r));
    const hasWallSpawn = GAME_STATE.spawns?.some((spawn) => wallRows.includes(Number(spawn?.row)));
    if (!hasWallSpawn) {
        seedWallRows();
        rebuildUnitIndex();
    }
}

export function restoreTimerState() {
    try {
        if (GAME_STATE.missionState.ticking) {
            const remainingSec = syncMissionTimerFromAnchor();
            if (remainingSec > 0) {
                startTimer({ skipSave: true });
            } else {
                stopTimer({ skipSave: true });
                notifyTimerExpired();
            }
        }
    } catch { }
}

export function initTurnEngine(savedTurn) {
    GAME_STATE.turnEngine = TurnEngine;
    Object.assign(GAME_STATE.turnEngine, savedTurn);
    GAME_STATE.turnEngine.init();
    applyCommanderAccess();
}
