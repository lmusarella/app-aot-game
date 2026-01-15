import { showSnackBar } from '../../ui-components/ui-helpers.js'
import { APP_STATE } from '../../core/app-state.js';
import { GAME_STATE } from '../../core/data.js'
import { scheduleSave } from '../../game-business-logic/game-sync.js';

let logBox = null;

function getLogBox() {
    if (!logBox) {
        logBox = document.getElementById('log-box');
    }
    return logBox;
}

export function log(msg, type = 'info', time = 3000, silent = false, broadcast = true) {
    const now = new Date();
    const hhmm = now.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
    });
    const message = `[${hhmm}] - ${msg}`
    GAME_STATE.logs.push({ message, type });
    if (!silent) showSnackBar(msg, { duration: time }, type);
    if (broadcast && !silent && APP_STATE.gameMode === 'multiplayer') {
        import('../../game-business-logic/event-manager.js').then(({ pushGameEvent }) => {
            pushGameEvent('log', { msg, type, time });
        });
    }
    renderLogs();
    scheduleSave('log', { force: true });
}

export function renderLogs() {
    const box = getLogBox();
    if (!box) return;
    box.textContent = '';
    // Mostra al massimo "limit" righe, tagliando le più vecchie
    GAME_STATE.logs.forEach(entry => {
        const p = document.createElement('p');
        p.className = `log-entry log-${entry.type || 'info'}`;
        p.style.margin = '0 0 6px';
        p.textContent = entry.message;
        box.appendChild(p);
    });
    box.scrollTop = box.scrollHeight;

}
