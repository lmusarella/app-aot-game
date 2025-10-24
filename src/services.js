import { initHeaderListeners, renderHeader, startTimer, stopTimer, playCornoGuerra } from "./header.js";
import { initFooterListeners, refreshMoraleUI, refreshXPUI } from "./footer.js";
import { initModsListeners, initModsDiceUI, renderBonusMalus, refreshRollModsUI, mountUnitModsUI } from "./mods.js";
import { initPhasesListeners, TurnEngine } from "./phases.js";
import { initAudioListeners, initAudio, playBg } from './audio.js'
import { initSidebarsListeners, initTooltipListeners, setupAccordions, setupLeftAccordions, setupRightAccordions, setupLeftCollapse, hideTooltip, openDialog } from "./ui.js";
import { renderGrid, renderBenches, grid, clearHighlights } from "./grid.js";
import { ATTACK_PICK, endAttackPick, seedWallRows } from "./entity.js";
import { DB, GAME_STATE, UNIT_SELECTED, getLastSaveInfo, rebuildUnitIndex } from "./data.js";
import { closeAllFabs, resetDeckFromPool, updateFabDeckCounters } from './fab.js'
import { renderLogs } from './log.js';
import { loadMissions } from "./missions.js";
import showWarningC from './effects/warningOverlayC.js';

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
        loadMissions();
        GAME_STATE.turnEngine = TurnEngine;
        GAME_STATE.turnEngine.init()
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

// Precarica immagine; se 404, ritorna null
function preloadImg(src) {
    return new Promise(resolve => {
        if (!src) return resolve(null);
        const im = new Image();
        im.onload = () => resolve(src);
        im.onerror = () => resolve(null);
        im.src = src;
    });
}

export async function showWelcomePopup(isFirstRun, imgUrl) {
    // lista fallback (metti qualcosa che sicuramente esiste nel tuo progetto)
    const candidates = [
        imgUrl
    ].filter(Boolean);

    let okSrc = null;
    for (const c of candidates) {
        okSrc = await preloadImg(c);
        if (okSrc) break;
    }

    const last = getLastSaveInfo() || null;
    const mediaHTML = okSrc
        ? `<img src="${okSrc}" alt="${isFirstRun ? 'Benvenuto' : 'Bentornato'}">`
        : `<div class="welcome__ph">Immagine non disponibile</div>`;

    const html = `
    <div class="welcome">
    <div class="welcome__media">
        ${mediaHTML}
      </div>
      <div class="welcome__txt">
        <p>${isFirstRun
            ? 'Questa è la tua plancia: gestisci Reclute e Comandanti, difendi le Mura e sconfiggi i Giganti.'
            : `Abbiamo ripristinato il tuo stato${last ? ` (ultimo salvataggio: <small>${last}</small>)` : ''}.`}
        </p>
      </div>
    </div>
  `;

    await openDialog({
        title: 'Bentornato/a! Soldato!',
        message: html,
        confirmText: 'Riprendi',
        cancelText: 'Chiudi',
        danger: true,
        cancellable: true
    });

    initAudio();
    GAME_STATE.turnEngine.phase === 'idle' ? await playBg('./assets/sounds/risorsa_audio_avvio_app.mp3') : await GAME_STATE.turnEngine.setPhaseMusic();
}

