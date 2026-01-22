import { renderCoreUI } from "./render-core.js";
import { ensureWallSpawns, restoreTimerState, initTurnEngine } from "./render-state.js";
import { seedWallRows } from "../game-business-logic/entity/entity.js";
import { GAME_STATE, rebuildUnitIndex } from "../core/data.js";
import { resetDeckFromPool } from '../view-components/fabs/fab.js';
import { loadMissions } from "../view-components/leftbar/missions.js";

export function initRenderApp(booted) {
    if (!booted) {
        seedWallRows();        // crea segmenti mura 10/11/12
        resetDeckFromPool('event');
        resetDeckFromPool('consumable');
        loadMissions();
    } else {
        restoreTimerState();
    }

    rebuildUnitIndex();
    ensureWallSpawns();
    renderCoreUI();
    initTurnEngine(booted ? (GAME_STATE.turnEngine || {}) : {});
}
