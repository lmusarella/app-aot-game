const SAVE_VERSION = 1;
const SAVE_KEY = 'aot-save-v' + SAVE_VERSION;

export const unitById = new Map();
export const GIANT_ENGAGEMENT = new Map();

export const UNIT_SELECTED = {
    selectedUnitId: null
};

// DB unico globale in memoria
export const DB = {
    ALLIES: null,
    GIANTS: null,
    EVENTS: null,
    CONSUMABLE: null,
    MISSIONS: null,
    SETTINGS: null
};

export const GAME_STATE = {
    missionState: {
        curIndex: 0,
        timerTotalSec: 1200,
        remainingSec: 1200,
        ticking: false,
        intervalId: null,
        kills: {
            Puro: 0,
            Anomalo: 0,
            Mutaforma: 0
        }
    },
    missionStats: {},
    unitMods: {},
    spawns: [],
    hand: [],
    decks: {
        event: { draw: [], discard: [], removed: [] },
        consumable: { draw: [], discard: [], removed: [] },
    },
    xpMoraleState: {},
    alliesPool: [],
    alliesRoster: [],
    giantsPool: [],
    giantsRoster: [],
    walls: [],
    logs: [],
    modRolls: {
        atk: 0,
        tec: 0,
        agi: 0,
        all: 0
    },
    turnEngine: {}
}

export function rebuildUnitIndex() {
    unitById.clear();
    [...GAME_STATE.alliesRoster, ...GAME_STATE.giantsRoster, ...GAME_STATE.walls].forEach(u => unitById.set(u.id, u));
}

// utility per caricare un json
async function loadJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Errore fetch ${url}: ${res.status}`);
    return res.json();
}

async function bootDataApplication() {
    // Config delle sorgenti JSON
    const BOOT_CONFIG = {
        allies: 'assets/data/unita.json',
        giants: 'assets/data/giganti.json',
        events: 'assets/data/carte_evento.json',
        consumable: 'assets/data/carte_consumabili.json',
        missions: 'assets/data/missioni.json',
        settings: 'assets/data/settings_app.json'
    };

    try {
        // carico in parallelo
        const [allies, giants, events, consumable, missions, settings] = await Promise.all([
            loadJSON(BOOT_CONFIG.allies),
            loadJSON(BOOT_CONFIG.giants),
            loadJSON(BOOT_CONFIG.events),
            loadJSON(BOOT_CONFIG.consumable),
            loadJSON(BOOT_CONFIG.missions),
            loadJSON(BOOT_CONFIG.settings)
        ]);

        // merge in un DB unico      
        DB.ALLIES = allies;
        DB.GIANTS = giants;
        DB.EVENTS = events;
        DB.MISSIONS = missions;
        DB.CONSUMABLE = consumable;
        DB.SETTINGS = settings;

        console.log('[boot] DB inizializzato:', DB);
        populateGameStateData();
        return DB;
    } catch (e) {
        console.warn('Caricamento JSON fallito, uso i fallback locali:', e);
        return DB;
    }
}

function populateGameStateData() {
    GAME_STATE.xpMoraleState = DB.SETTINGS.xpMoralDefault;
    GAME_STATE.walls = DB.ALLIES.filter(unit => unit.role === "wall").map(u => ({ ...u, currHp: u.hp }));
    GAME_STATE.alliesPool = DB.ALLIES.filter(unit => unit.role !== "wall").map(u => ({ ...u, currHp: u.hp, template: true, dead: false }));
    GAME_STATE.giantsPool = DB.GIANTS.map(u => ({ role: "enemy", ...u, currHp: u.hp, template: true }));
    GAME_STATE.decks.event.draw = DB.EVENTS;
    GAME_STATE.decks.consumable.draw = DB.CONSUMABLE;
    console.log('gamestate', GAME_STATE);
}

function snapshot() {
   
    return {
        ver: SAVE_VERSION,
        savedAt: Date.now(),
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

function restore(save) {
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
    //mano
    GAME_STATE.hand = Array.isArray(save.hand) ? save.hand : [];

    // 3) stati
    Object.assign(GAME_STATE.xpMoraleState, save.xpMoraleState || {});
    Object.assign(GAME_STATE.modRolls, save.modRolls || {});
    Object.assign(GAME_STATE.missionState, save.missionState || {});
    Object.assign(GAME_STATE.turnEngine = save.turnEngine || {});
    Object.assign(GAME_STATE.missionStats, save.missionStats || {});
    GAME_STATE.missionState.intervalId = null; // sempre nullo a cold start


    return true;
}

function saveToLocal() {
    try {
        const data = snapshot();
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Salvataggio fallito', e);
    }
}

export async function loadDataAndGameState() {
    await bootDataApplication()
    try {
        const gameState = localStorage.getItem(SAVE_KEY);
        if (!gameState) return false;
        const gameStateData = JSON.parse(gameState);
        return restore(gameStateData);
    } catch (e) {
        console.warn('Restore fallito, riparto pulito.', e);
        return false;
    }
}

function debounce(fn, ms = 400) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export const scheduleSave = debounce(saveToLocal, 500);

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
