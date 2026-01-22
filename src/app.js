import { startApplication } from './boot/bootstrap.js';
import { showSnackBar } from './ui-components/ui-helpers.js';

const registerServiceWorker = () => {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    let refreshing = false;

    const notifyUpdate = (registration) => {
        showSnackBar(
            'È disponibile una versione più recente. Vuoi aggiornare?',
            {
                duration: 10000,
                actionText: 'Aggiorna',
                onAction: () => {
                    if (registration.waiting) {
                        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                    }
                },
            },
            'info'
        );
    };

    navigator.serviceWorker.register('./sw.js')
        .then((registration) => {
            if (registration.waiting) {
                notifyUpdate(registration);
            }

            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (!newWorker) {
                    return;
                }

                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        notifyUpdate(registration);
                    }
                });
            });

            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) {
                    return;
                }
                refreshing = true;
                window.location.reload();
            });
        })
        .catch((err) => console.error('SW registration failed:', err));
};

document.addEventListener('DOMContentLoaded', () => {
    startApplication();
    registerServiceWorker();
});
