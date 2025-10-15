import { initHeaderListeners } from "./header.js";
import { initFooterListeners } from "./footer.js";
import { initModsListeners } from "./mods.js";
import { initPhasesListeners } from "./phases.js";
import { initAudioListeners } from './audio.js'
import { initSidebarsListeners, initTooltipListeners, setupAccordions, setupLeftAccordions, setupRightAccordions, setupLeftCollapse, hideTooltip } from "./ui.js";
import { renderGrid, renderBenches, grid } from "./grid.js";
import { ATTACK_PICK, endAttackPick } from "./entity.js";
import { DB, GAME_STATE, UNIT_SELECTED } from "./data.js";
import { closeAllFabs } from './fab.js'
import { clearHighlights } from "./grid.js";

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

export function initRenderApp() {

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
