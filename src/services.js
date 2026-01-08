import { initHeaderListeners, renderHeader, startTimer, stopTimer, playCornoGuerra } from "./header.js";
import { initFooterListeners, refreshMoraleUI, refreshXPUI } from "./footer.js";
import { initModsListeners, initModsDiceUI, renderBonusMalus, refreshRollModsUI, mountUnitModsUI } from "./mods.js";
import { initPhasesListeners, TurnEngine } from "./phases.js";
import { initAudioListeners } from './audio.js'
import { initSidebarsListeners, initTooltipListeners, setupAccordions, setupLeftAccordions, setupRightAccordions, setupLeftCollapse, hideTooltip } from "./ui.js";
import { renderGrid, renderBenches, grid, clearHighlights } from "./grid.js";
import { ATTACK_PICK, endAttackPick, seedWallRows } from "./entity.js";
import { DB, GAME_STATE, UNIT_SELECTED, rebuildUnitIndex } from "./data.js";
import { closeAllFabs, resetDeckFromPool, updateFabDeckCounters } from './fab.js'
import { renderLogs } from './log.js';
import { loadMissions } from "./missions.js";
import showWarningC from './effects/warningOverlayC.js';
import { applyCommanderAccess } from './core/permissions.js';

export function initAppListeners() {

    initAudioListeners();

    setupLeftAccordions();
    setupRightAccordions();
    setupAccordions();
    setupLeftCollapse();

    initSidebarsListeners();
    initTooltipListeners();

    initHeaderListeners();
    initModsListeners();
    initPhasesListeners();
    initFooterListeners();

    initGeneralListeners();
}

export function initRenderApp(booted) {

    if (!booted) {

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
        GAME_STATE.turnEngine.init()
        applyCommanderAccess();
    } else {
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
        GAME_STATE.turnEngine.init()
        applyCommanderAccess();
    }
}


function initGeneralListeners() {
    document.addEventListener('click', (e) => {
        // durante la scelta NON auto-chiudere (salvo click davvero fuori da tutto)
        if (ATTACK_PICK) {
            const insideTooltip = e.target.closest('#tooltip');
            const onHex = e.target.closest('.hex-member') || e.target.closest('.hexagon');
            if (!insideTooltip && !onHex) endAttackPick(); // click “fuori”: annulla
            return; // non eseguire il reset selezione di default
        }
        if (
            !e.target.closest('.hex-member') &&
            !e.target.closest('.btn-icon') &&
            !e.target.closest('.unit-card')    // <— aggiungi panchina
        ) {
            UNIT_SELECTED.selectedUnitId = null;
            hideTooltip();
            renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
            renderBenches();
            clearHighlights();                  // rimuove highlight in panchina
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideTooltip(); UNIT_SELECTED.selectedUnitId = null;
            renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
            closeAllFabs();
            clearHighlights();
        }
    });
}
