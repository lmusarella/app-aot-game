import { registerGameAPI } from '../core/app-state.js';
import { requestPrecache } from './sw-manager.js';
import { loadViews } from './view-loader.js';

export const startApplication = async () => {
    await loadViews();
    requestPrecache();

    const [
        { bootDataApplication },
        { initRenderApp },
        { initGeneralListeners },
    ] = await Promise.all([
        import('../core/data.js'),
        import('./render-app.js'),
        import('./general-listeners.js'),
    ]);

    registerGameAPI({
        renderGameFromState: () => initRenderApp(true)
    });

    initGeneralListeners();

    await bootDataApplication();

    initRenderApp(false);
};
