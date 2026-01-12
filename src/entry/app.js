

import { bootDataApplication } from '../core/data.js'
import { initAppListeners, initRenderApp } from '../services.js'
import { showTutorialPopupViaDialog } from '../ui/ui.js'
import { initAuthUI } from '../auth/auth.js'
import { initLobbyUI } from '../views/lobby/lobby-ui.js'
import { showScreen } from '../core/ui-helpers.js'

/**
 * Bootstrap dell'applicazione: carica dati, inizializza UI e gestisce tutorial.
 */
document.addEventListener('DOMContentLoaded', async () => {

    showScreen('login');

    initAppListeners();
    
    await bootDataApplication();

    initRenderApp(false);

    setTimeout(async () => {
        initAuthUI();
        initLobbyUI();

    }, 60);

    const btn = document.getElementById('btn-tutorial');
    btn?.addEventListener('click', async (e) => {
        e.preventDefault();
        await showTutorialPopupViaDialog({ startIndex: 0, force: true });
    });

});
