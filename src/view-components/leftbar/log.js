import { showSnackBar } from '../../ui-components/ui-helpers.js'
import { GAME_STATE } from '../../core/data.js'
import { scheduleSave } from '../../game-business-logic/game-sync.js';

const logBox = document.getElementById('log-box');

export function log(msg, type = 'info', time = 3000, silent = false) {
    const now = new Date();
    const hhmm = now.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
    });
    const message = `[${hhmm}] - ${msg}`
    GAME_STATE.logs.push({ message, type });
    if (!silent) showSnackBar(msg, { duration: time }, type);
    renderLogs();
    scheduleSave('log');
}

export function renderLogs() {
    if (!logBox) return;
    logBox.textContent = '';
    // Mostra al massimo "limit" righe, tagliando le più vecchie
    GAME_STATE.logs.forEach(entry => {
        const p = document.createElement('p');
        p.className = `log-entry log-${entry.type || 'info'}`;
        p.style.margin = '0 0 6px';
        p.textContent = entry.message;
        logBox.appendChild(p);
    });
    logBox.scrollTop = logBox.scrollHeight;

}
