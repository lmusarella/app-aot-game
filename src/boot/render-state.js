import { playCornoGuerra, startTimer, stopTimer } from "../view-components/header/header.js";
import { clamp } from "../game-business-logic/utils.js";
import { TurnEngine } from "../game-business-logic/phases.js";
import { seedWallRows } from "../game-business-logic/entity/entity.js";
import { DB, GAME_STATE, rebuildUnitIndex } from "../core/data.js";
import showWarningC from '../game-business-logic/effects/warningOverlayC.js';
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
            const lastSavedAt = GAME_STATE.stateUpdatedAt || Date.now();
            const elapsedSec = Math.floor((Date.now() - lastSavedAt) / 1000);
            GAME_STATE.missionState.remainingSec = clamp((GAME_STATE.missionState.remainingSec || 0) - elapsedSec, 0, GAME_STATE.missionState.timerTotalSec || 1200);
            if (GAME_STATE.missionState.remainingSec > 0) {
                startTimer();
            } else {
                stopTimer();
                showWarningC({
                    text: `TEMPO SCADUTO`,
                    subtext: `Ad ogni fine turno verrà pescata una carta evento`,
                    theme: 'red',
                    ringAmp: 1.0,
                    autoDismissMs: 3000
                });
                playCornoGuerra();
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
