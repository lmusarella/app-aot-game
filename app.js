

const viewPartials = [
    { id: 'view-login', path: 'src/views/screen-login.html' },
    { id: 'view-lobby', path: 'src/views/screen-lobby.html' },
    { id: 'view-room', path: 'src/views/screen-room.html' },
    { id: 'view-header', path: 'src/views/header.html' },
    { id: 'view-leftbar', path: 'src/views/leftbar.html' },
    { id: 'view-rightbar', path: 'src/views/rightbar.html' },
    { id: 'view-footer', path: 'src/views/footer.html' },
];

const loadViews = async () => {
    await Promise.all(
        viewPartials.map(async ({ id, path }) => {
            const target = document.getElementById(id);
            if (!target) {
                return;
            }

            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to load ${path}`);
            }
            const html = await response.text();
            target.innerHTML = html;
        })
    );
};

document.addEventListener('DOMContentLoaded', async () => {

    await loadViews();

    const [
        { bootDataApplication },
        { initAppListeners, initRenderApp },
        { showTutorialPopupViaDialog },
        { initAuthUI },
        { initLobbyUI },
        { showScreen },
    ] = await Promise.all([
        import('./src/data.js'),
        import('./src/services.js'),
        import('./src/ui.js'),
        import('./src/auth/auth.js'),
        import('./src/lobby/lobby-ui.js'),
        import('./src/core/ui-helpers.js'),
    ]);

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
