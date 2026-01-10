

const viewPartials = [
    { id: 'view-login', path: 'src/views/screen-login.html', init: './src/views/view-login.js' },
    { id: 'view-lobby', path: 'src/views/screen-lobby.html', init: './src/views/view-lobby.js' },
    { id: 'view-room', path: 'src/views/screen-room.html' },
    { id: 'view-header', path: 'src/views/header.html', init: './src/views/view-header.js' },
    { id: 'view-leftbar', path: 'src/views/leftbar.html', init: './src/views/view-leftbar.js' },
    { id: 'view-rightbar', path: 'src/views/rightbar.html', init: './src/views/view-rightbar.js' },
    { id: 'view-footer', path: 'src/views/footer.html', init: './src/views/view-footer.js' },
    { id: 'view-layout-controls', path: 'src/views/layout-controls.html', init: './src/views/view-layout-controls.js' },
    { id: 'view-audio', path: 'src/views/audio-modal.html', init: './src/views/view-audio.js' },
    { id: 'view-overlays', path: 'src/views/overlays.html' },
    { id: 'view-fabs', path: 'src/views/fabs.html', init: './src/views/view-fabs.js' },
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
            const module = await import(initPath);
            if (typeof module.initView === 'function') {
                await module.initView();
            }
        })
    );
};

document.addEventListener('DOMContentLoaded', async () => {

    await requestPrecache();
    await loadViews();

    const [
        { bootDataApplication },
        { initRenderApp },
        { initGeneralListeners },
    ] = await Promise.all([
        import('./src/data.js'),
        import('./src/services.js'),
        import('./src/app/init-general-listeners.js'),
    ]);

    initGeneralListeners();
    
    await bootDataApplication();

    initRenderApp(false);

});
