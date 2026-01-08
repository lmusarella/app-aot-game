

import { bootDataApplication } from './src/data.js'
import { initAppListeners, initRenderApp, showWelcomePopup } from './src/services.js';
import { showTutorialPopupViaDialog } from './src/ui.js';
import { initAuthUI } from './src/auth/auth.js'
import { initLobbyUI } from './src/lobby/lobby-ui.js';
import { showScreen } from './src/core/ui-helpers.js'

document.addEventListener('DOMContentLoaded', async () => {

    showScreen('login');

    initAppListeners();
    
    await bootDataApplication();

    initRenderApp(false);

    setTimeout(async () => {
        initAuthUI();
        initLobbyUI();

        /*if (booted) {
            await showWelcomePopup(!booted, "assets/img/comandanti/erwin_popup_benvenuto.jpg");
        } else {
            await showTutorialPopupViaDialog({ startIndex: 0, force: true });
            // main.js         
        }*/
       
    }, 60);

    const btn = document.getElementById('btn-tutorial');
    btn?.addEventListener('click', async (e) => {
        e.preventDefault();
        await showTutorialPopupViaDialog({ startIndex: 0, force: true });
    });

});

