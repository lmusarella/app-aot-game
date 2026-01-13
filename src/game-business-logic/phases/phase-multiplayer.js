import { APP_STATE } from '../../core/app-state.js';
import { GAME_STATE } from '../../core/data.js';
import { advanceTurn, renderTurnTracker } from '../turn-tracker.js';
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

    const allDone = ts.phaseDoneBy.length >= order.length;

    if (phase === 'setup' || phase === 'move_phase') {
        if (allDone) {
            ts.phaseReady = true;
            ts.currentIndex = 0;
            ts.currentPlayerId = order[0] || null;
        } else {
            advanceTurn();
        }
        renderTurnTracker();
        scheduleSave('phase-turn', { force: true });
        return;
    }

    if (allDone) {
        ts.phaseDoneBy = [];
        ts.currentIndex = 0;
        ts.currentPlayerId = order[0] || null;
        await GAME_STATE.turnEngine.endPhase(phase);
    } else {
        advanceTurn();
    }
    renderTurnTracker();
    scheduleSave('phase-turn', { force: true });
}
