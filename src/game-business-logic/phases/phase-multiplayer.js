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
            advanceTurnSkippingDone(ts);
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
        advanceTurnSkippingDone(ts);
    }
    renderTurnTracker();
    scheduleSave('phase-turn', { force: true });
}

function advanceTurnSkippingDone(turnState) {
    if (!turnState || !Array.isArray(turnState.order) || turnState.order.length === 0) return;
    const done = new Set(Array.isArray(turnState.phaseDoneBy) ? turnState.phaseDoneBy : []);
    const total = turnState.order.length;
    let nextIndex = turnState.currentIndex ?? 0;

    for (let offset = 1; offset <= total; offset += 1) {
        const idx = (nextIndex + offset) % total;
        const candidate = turnState.order[idx];
        if (!done.has(candidate)) {
            turnState.currentIndex = idx;
            turnState.currentPlayerId = candidate;
            return;
        }
    }

    advanceTurn();
}
