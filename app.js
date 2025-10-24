

import { loadDataAndGameState } from './src/data.js'
import { initAppListeners, initRenderApp, showWelcomePopup } from './src/services.js';
import { showTutorialPopupViaDialog } from './src/ui.js';


document.addEventListener('DOMContentLoaded', async () => {
    initAppListeners();
    const booted = await loadDataAndGameState();
    initRenderApp(booted);

    setTimeout(async () => {
        if (booted)
            await showWelcomePopup(!booted, "assets/img/comandanti/erwin_popup_benvenuto.jpg");
        else
            await showTutorialPopupViaDialog({ startIndex: 0, force: true });

    }, 60);

    const btn = document.getElementById('btn-tutorial');
    btn?.addEventListener('click', async (e) => {
        e.preventDefault();
        await showTutorialPopupViaDialog({ startIndex: 0, force: true });
    });

});

