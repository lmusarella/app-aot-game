import { log } from '../../view-components/leftbar/log.js';
import { GAME_STATE } from './store.js';

const SAVE_VERSION = 1;
const SAVE_KEY = 'aot-save-v' + SAVE_VERSION;

export function snapshot() {
    return {
        ver: SAVE_VERSION,
        savedAt: Date.now(),
        stateVersion: GAME_STATE.stateVersion ?? 0,
        stateUpdatedAt: GAME_STATE.stateUpdatedAt ?? null,
        // campo - griglia
        spawns: structuredClone(GAME_STATE.spawns),
        // panchine/pool
        alliesPool: structuredClone(GAME_STATE.alliesPool),
        alliesRoster: structuredClone(GAME_STATE.alliesRoster),
        giantsPool: structuredClone(GAME_STATE.giantsPool),
        giantsRoster: structuredClone(GAME_STATE.giantsRoster),
        walls: structuredClone(GAME_STATE.walls), // base walls (w1,w2,w3)
        //mano
        hand: structuredClone(GAME_STATE.hand),
        // mazzi
        decks: structuredClone(GAME_STATE.decks),
        // UI/stati
        xpMoraleState: structuredClone(GAME_STATE.xpMoraleState),
        modRolls: structuredClone(GAME_STATE.modRolls),
        missionStats: structuredClone(GAME_STATE.missionStats),
        // log
        logs: structuredClone(GAME_STATE.logs),
        events: structuredClone(GAME_STATE.events),
        turnState: structuredClone(GAME_STATE.turnState),
        //turnengine
        turnEngine: GAME_STATE.turnEngine,
        missionState: (() => {
            const m = structuredClone(GAME_STATE.missionState);
            // leggero “sanitize”: niente intervalId/oggetti runtime
            delete m.intervalId;
            return m;
        })()
    };
}

/** Reset totale del gioco: cancella storage e ripristina i default */
export function resetGame() {
    try {
        // 1. elimina dati persistiti
        localStorage.removeItem(SAVE_KEY);
        location.reload();
    } catch (e) {
        console.error("Errore reset:", e);
        log("Errore durante il reset!", "error");
    }
}

export function restore(save) {
    // ver check
    if (!save || save.ver !== SAVE_VERSION) return false;

    GAME_STATE.spawns.length = 0; GAME_STATE.spawns.push(...save.spawns);
    // 1) ripristina array principali (mantenendo i riferimenti)

    GAME_STATE.alliesPool.length = 0; GAME_STATE.alliesPool.push(...save.alliesPool);
    GAME_STATE.alliesRoster.length = 0; GAME_STATE.alliesRoster.push(...save.alliesRoster);
    GAME_STATE.giantsPool.length = 0; GAME_STATE.giantsPool.push(...save.giantsPool);
    GAME_STATE.giantsRoster.length = 0; GAME_STATE.giantsRoster.push(...save.giantsRoster);
    GAME_STATE.walls.length = 0; GAME_STATE.walls.push(...save.walls);

    // 2) mazzi
    GAME_STATE.decks.event.draw = save.decks?.event?.draw ?? [];
    GAME_STATE.decks.event.discard = save.decks?.event?.discard ?? [];
    GAME_STATE.decks.event.removed = save.decks?.event?.removed ?? [];
    GAME_STATE.decks.consumable.draw = save.decks?.consumable?.draw ?? [];
    GAME_STATE.decks.consumable.discard = save.decks?.consumable?.discard ?? [];
    GAME_STATE.decks.consumable.removed = save.decks?.consumable?.removed ?? [];
    GAME_STATE.logs = save.logs ?? [];
    GAME_STATE.events = Array.isArray(save.events) ? save.events : [];
    GAME_STATE.turnState = save.turnState ?? GAME_STATE.turnState ?? null;
    GAME_STATE.stateVersion = save.stateVersion ?? 0;
    GAME_STATE.stateUpdatedAt = save.stateUpdatedAt ?? save.savedAt ?? null;
    //mano
    GAME_STATE.hand = Array.isArray(save.hand) ? save.hand : [];

    // 3) stati
    Object.assign(GAME_STATE.xpMoraleState, save.xpMoraleState || {});
    Object.assign(GAME_STATE.modRolls, save.modRolls || {});
    Object.assign(GAME_STATE.missionState, save.missionState || {});
    if (typeof GAME_STATE.turnEngine?.init === 'function') {
        Object.assign(GAME_STATE.turnEngine, save.turnEngine || {});
    } else {
        GAME_STATE.turnEngine = save.turnEngine || {};
    }
    Object.assign(GAME_STATE.missionStats, save.missionStats || {});
    GAME_STATE.missionState.intervalId = null; // sempre nullo a cold start


    return true;
}

export function saveLocalGameState(state = snapshot()) {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error('Salvataggio fallito', e);
    }
}

export function loadLocalGameState() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        console.error('Caricamento salvataggio fallito', e);
        return null;
    }
}

export function getLastSaveInfo() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data?.savedAt) return null;
        const d = new Date(data.savedAt);
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        const hhmm = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        return sameDay ? `oggi alle ${hhmm}` : d.toLocaleString('it-IT');
    } catch { return null; }
}
