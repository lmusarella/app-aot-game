import { APP_STATE } from '../../core/app-state.js';
import { GAME_STATE } from '../../core/data.js';
import { advanceTurn } from '../turn-tracker.js';
import { scheduleSave } from '../game-sync.js';

export function isMultiplayer() {
    return !!APP_STATE.roomId;
}

export async function handleMultiplayerPhaseEnd(phase) {
    const ts = GAME_STATE.turnState || {};
    const order = ts.order || [];
    const myId = APP_STATE.user?.id || null;
    if (!myId || order.length === 0) return;

    if (!Array.isArray(ts.phaseDoneBy)) ts.phaseDoneBy = [];
    if (!ts.phaseDoneBy.includes(myId)) ts.phaseDoneBy.push(myId);

    if (ts.phaseDoneBy.length >= order.length) {
        ts.phaseDoneBy = [];
        ts.currentIndex = 0;
        ts.currentPlayerId = order[0] || null;
        await GAME_STATE.turnEngine.endPhase(phase);
    } else {
        advanceTurn();
    }
    scheduleSave('phase-turn', { force: true });
}
