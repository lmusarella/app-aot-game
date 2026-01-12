const viewPartials = [
    { id: 'view-login', path: 'src/view-components/pages/login/screen-login.html', init: 'src/view-components/pages/login/view-login.js' },
    { id: 'view-lobby', path: 'src/view-components/pages/lobby/screen-lobby.html', init: 'src/view-components/pages/lobby/view-lobby.js' },
    { id: 'view-room', path: 'src/view-components/pages/room/screen-room.html' },
    { id: 'view-header', path: 'src/view-components/header/header.html', init: 'src/view-components/header/view-header.js' },
    { id: 'view-leftbar', path: 'src/view-components/leftbar/leftbar.html', init: 'src/view-components/leftbar/view-leftbar.js' },
    { id: 'view-rightbar', path: 'src/view-components/rightbar/rightbar.html', init: 'src/view-components/rightbar/view-rightbar.js' },
    { id: 'view-footer', path: 'src/view-components/footer/footer.html', init: 'src/view-components/footer/footer.js' },
    { id: 'view-layout-controls', path: 'src/view-components/layout-controls/layout-controls.html', init: 'src/view-components/layout-controls/view-layout-controls.js' },
    { id: 'view-audio', path: 'src/view-components/audio/audio-modal.html', init: 'src/view-components/audio/view-audio.js' },
    { id: 'view-overlays', path: 'src/view-components/overlays/overlays.html' },
    { id: 'view-fabs', path: 'src/view-components/fabs/fabs.html', init: 'src/view-components/fabs/view-fabs.js' },
];

const requestPrecache = async () => {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    await navigator.serviceWorker.ready;
    const controller = navigator.serviceWorker.controller;
    if (!controller) {
        return;
    }

    await new Promise((resolve) => {
        const channel = new MessageChannel();
        const timeout = setTimeout(resolve, 8000);
        channel.port1.onmessage = () => {
            clearTimeout(timeout);
            resolve();
        };
        controller.postMessage({ type: 'PRECACHE' }, [channel.port2]);
    });
};

const loadViews = async () => {
    const viewInits = await Promise.all(
        viewPartials.map(async ({ id, path, init }) => {
            const target = document.getElementById(id);
            if (!target) {
                return null;
            }

            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to load ${path}`);
            }
            const html = await response.text();
            target.innerHTML = html;

            return init || null;
        })
    );

    const initModules = viewInits.filter(Boolean);
    await Promise.all(
        initModules.map(async (initPath) => {
            const module = await import(new URL(initPath, window.location.href));
            if (typeof module.initView === 'function') {
                await module.initView();
            }
        })
    );
};

export const startApplication = async () => {
    await requestPrecache();
    await loadViews();

    const [
        { bootDataApplication },
        { initRenderApp },
        { initGeneralListeners },
    ] = await Promise.all([
        import('../core/data.js'),
        import('./render-app.js'),
        import('./general-listeners.js'),
    ]);

    initGeneralListeners();

    await bootDataApplication();

    initRenderApp(false);
};
