import { APP_STATE } from '../../core/app-state.js';
import { GAME_STATE } from '../../core/data.js';
import { advanceTurn, ensureMultiplayerTurnOrder, renderTurnTracker } from '../turn-tracker.js';
import { scheduleSave } from '../game-sync.js';
import { drawCard, showDrawnCard, closeAllFabs } from '../../view-components/fabs/fab.js';
import { playSfx } from '../../view-components/audio/audio.js';
import { log } from '../../view-components/leftbar/log.js';
import { pushGameEvent } from '../event-manager.js';

export function isMultiplayer() {
    return !!APP_STATE.roomId;
}

function getTurnContext() {
    let ts = GAME_STATE.turnState || {};
    let order = Array.isArray(ts.order) ? ts.order : [];
    if (order.length === 0) {
        ensureMultiplayerTurnOrder();
        if (GAME_STATE.turnState) {
            ts = GAME_STATE.turnState;
        }
        order = Array.isArray(ts.order) ? ts.order : [];
    }
    const myId = APP_STATE.user?.id || null;
    if (!myId || order.length === 0) return null;
    if (!ts.currentPlayerId) {
        ts.currentIndex = ts.currentIndex ?? 0;
        ts.currentPlayerId = order[ts.currentIndex] || order[0] || null;
    }
    return { ts, order, myId };
}

async function finalizePhaseTurn(phase, ctx) {
    if (!ctx) return;
    let { ts, order, myId } = ctx;

    if (!Array.isArray(ts.phaseDoneBy)) ts.phaseDoneBy = [];
    if (!ts.phaseDoneBy.includes(myId)) ts.phaseDoneBy.push(myId);

    const allDone = ts.phaseDoneBy.length >= order.length;

    if (phase === 'setup' || phase === 'move_phase' || phase === 'event_card') {
        if (allDone) {
            if (phase !== 'move_phase') {
                ensureMultiplayerTurnOrder({ resetToCommander: true });
                ts = GAME_STATE.turnState || ts;
                order = Array.isArray(ts.order) ? ts.order : order;
            }
            ts.phaseReady = true;
        } else {
            advanceTurnSkippingDone(ts);
        }
        renderTurnTracker();
        scheduleSave('phase-turn', { force: true });
        if (phase === 'move_phase' && allDone) {
            await GAME_STATE.turnEngine.startPhase('move_phase');
        }
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

export async function handleMultiplayerPhaseEnd(phase) {
    const ctx = getTurnContext();
    if (!ctx) return;
    if (phase === 'event_card') {
        const card = drawCard('event');

        if (!card) {
            log('Il mazzo è vuoto. Rimescola gli scarti o ricarica le carte.', 'warning', 3000, true);
            closeAllFabs();
            return;
        }
        log(`Pescata carta evento: "${card.name}".`, 'info', 3000, true);
        await playSfx('assets/sounds/carte/carta_evento.mp3', { volume: 0.3, loop: false });

        showDrawnCard('event', card);
        if (APP_STATE.gameMode === 'multiplayer') {
            pushGameEvent('card_draw', { deckType: 'event' });
        }
        return;
    }
    await finalizePhaseTurn(phase, ctx);
}

export async function completeMultiplayerPhaseTurn(phase) {
    if (APP_STATE.gameMode !== 'multiplayer') return;
    const ctx = getTurnContext();
    if (!ctx) return;
    await finalizePhaseTurn(phase, ctx);
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
