
import {initAudio, playBg } from './src/audio.js'
import { DB, GAME_STATE, loadDataAndGameState, getLastSaveInfo, rebuildUnitIndex } from './src/data.js'
import {
    openDialog,
} from './src/ui.js'
import { initAppListeners } from './src/services.js';
import {
    renderBenches, renderGrid, grid
} from './src/grid.js';
import {
    seedWallRows
} from './src/entity.js'
import { log, renderLogs } from './src/log.js';
import { loadMissions } from './src/missions.js';
import { initModsDiceUI, renderBonusMalus, refreshRollModsUI, mountUnitModsUI } from './src/mods.js';
import { renderHeader, startTimer, stopTimer, playCornoGuerra } from './src/header.js';
import { refreshMoraleUI, refreshXPUI } from './src/footer.js';
import { TurnEngine } from './src/phases.js';

import { resetDeckFromPool, updateFabDeckCounters } from './src/fab.js'



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

async function showWelcomePopup(isFirstRun, imgUrl) {
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
        <ul>
          <li>Usa i pulsanti in basso per <em>Spawn</em>, <em>Carte</em> e <em>Arruolo</em>.</li>
          <li>Tieni premuto su unità e card per visualizzare il dettaglio, drag per spostare.</li>
          <li>Timer, Morale e XP si salvano in automatico.</li>
        </ul>
      </div>
    </div>
  `;

    await openDialog({
        title: isFirstRun ? 'Benvenuto/a! Soldato!' : 'Bentornato/a! Soldato!',
        message: html,
        confirmText: isFirstRun ? 'Inizia' : 'Riprendi',
        cancelText: 'Chiudi',
        danger: true,
        cancellable: true
    });

    initAudio();
    GAME_STATE.turnEngine.phase === 'idle' ? await playBg('./assets/sounds/risorsa_audio_avvio_app.mp3') : await GAME_STATE.turnEngine.setPhaseMusic();
}

document.addEventListener('DOMContentLoaded', async () => {

    initAppListeners();
    // BOOT dati
    const booted = await loadDataAndGameState();

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
                    log("Tempo Scaduto! Ogni turno apparirà un gigante!");
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
    // Mostra welcome/bentornato
    setTimeout(() => { showWelcomePopup(!booted, "assets/img/comandanti/erwin_popup_benvenuto.jpg"); }, 60);
});

