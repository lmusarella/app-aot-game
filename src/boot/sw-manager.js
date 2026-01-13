export const requestPrecache = async () => {
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
