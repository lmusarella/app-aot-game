

import { loadDataAndGameState } from './src/data.js'
import { initAppListeners, initRenderApp, showWelcomePopup  } from './src/services.js';


document.addEventListener('DOMContentLoaded', async () => {
    initAppListeners();
    const booted = await loadDataAndGameState();
    initRenderApp(booted);
    setTimeout(() => { showWelcomePopup(!booted, "assets/img/comandanti/erwin_popup_benvenuto.jpg"); }, 60);
});

