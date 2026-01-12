import { renderHeader, startTimer, stopTimer, playCornoGuerra } from "../view-components/header/header.js";
import { refreshMoraleUI, refreshXPUI } from "../view-components/footer/footer.js";
import { initModsDiceUI, renderBonusMalus, refreshRollModsUI, mountUnitModsUI } from "../view-components/leftbar/mods.js";
import { TurnEngine } from "../game-business-logic/phases.js";
import { renderGrid, renderBenches, grid } from "../view-components/grid/grid.js";
import { seedWallRows } from "../game-business-logic/entity/entity.js";
import { DB, GAME_STATE, rebuildUnitIndex } from "../core/data.js";
import { resetDeckFromPool, updateFabDeckCounters } from '../view-components/fabs/fab.js'
import { renderLogs } from '../view-components/leftbar/log.js';
import { loadMissions } from "../view-components/leftbar/missions.js";
import showWarningC from '../game-business-logic/effects/warningOverlayC.js';
import { applyCommanderAccess } from '../core/permissions.js';

function renderCoreUI() {
    refreshXPUI();
    refreshMoraleUI();
    renderBonusMalus();
    renderBenches();
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
    renderHeader();
    renderLogs();
    updateFabDeckCounters();
    refreshRollModsUI();
    initModsDiceUI();
    mountUnitModsUI();
}

function restoreTimerState() {
    try {
        if (GAME_STATE.missionState.ticking) {
            const elapsedSec = Math.floor((Date.now() - (save.savedAt || Date.now())) / 1000);
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

function initTurnEngine(savedTurn) {
    GAME_STATE.turnEngine = TurnEngine;
    Object.assign(GAME_STATE.turnEngine, savedTurn);
    GAME_STATE.turnEngine.init();
    applyCommanderAccess();
}

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
    renderCoreUI();
    initTurnEngine(booted ? (GAME_STATE.turnEngine || {}) : {});
}
