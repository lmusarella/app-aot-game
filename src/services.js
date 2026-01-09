import { renderHeader, startTimer, stopTimer, playCornoGuerra } from "./header.js";
import { refreshMoraleUI, refreshXPUI } from "./footer.js";
import { initModsDiceUI, renderBonusMalus, refreshRollModsUI, mountUnitModsUI } from "./mods.js";
import { TurnEngine } from "./phases.js";
import { renderGrid, renderBenches, grid } from "./grid.js";
import { seedWallRows } from "./entity.js";
import { DB, GAME_STATE, rebuildUnitIndex } from "./data.js";
import { resetDeckFromPool, updateFabDeckCounters } from './fab.js'
import { renderLogs } from './log.js';
import { loadMissions } from "./missions.js";
import showWarningC from './effects/warningOverlayC.js';
import { applyCommanderAccess } from './core/permissions.js';

export function initRenderApp(booted) {

    if (!booted) {
        const savedTurn = {};

        seedWallRows();        // crea segmenti mura 10/11/12
        renderBenches();
        renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
        resetDeckFromPool('event');
        resetDeckFromPool('consumable');
        loadMissions();

        refreshXPUI();
        refreshMoraleUI();
        renderBonusMalus();
        renderHeader();
        renderLogs();
        updateFabDeckCounters();
        rebuildUnitIndex();
        refreshRollModsUI();
        initModsDiceUI();
        mountUnitModsUI();

        GAME_STATE.turnEngine = TurnEngine;
        Object.assign(GAME_STATE.turnEngine, savedTurn);
        GAME_STATE.turnEngine.init()
        applyCommanderAccess();
    } else {
        const savedTurn = GAME_STATE.turnEngine || {};
        // 6) riprendi il TIMER in modo resiliente
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
        rebuildUnitIndex();

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
      
        GAME_STATE.turnEngine = TurnEngine;
        Object.assign(GAME_STATE.turnEngine, savedTurn);
        GAME_STATE.turnEngine.init()
        applyCommanderAccess();
    }
}
