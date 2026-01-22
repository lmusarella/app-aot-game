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

const DEFAULT_TIMER_SEC = 1200;

export function buildDefaultMissionState() {
    const totalSec = DB?.SETTINGS?.missionDefaults?.timerTotalSec ?? DEFAULT_TIMER_SEC;
    return {
        curIndex: 0,
        timerTotalSec: totalSec,
        remainingSec: totalSec,
        ticking: false,
        intervalId: null,
        timerAnchorAt: null,
        timerAnchorSec: totalSec,
        timerExpiredNotified: false,
        kills: {
            Puro: 0,
            Anomalo: 0,
            Mutaforma: 0
        }
    };
}

export const GAME_STATE = {
    missionState: buildDefaultMissionState(),
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
    events: [],
    turnState: null,
    stateVersion: 0,
    stateUpdatedAt: null,
    modRolls: {
        atk: 0,
        tec: 0,
        agi: 0,
        all: 0
    },
    turnEngine: {},
    setupMoves: {}
};

export function populateGameStateFromDB({ resetMissionState = true } = {}) {
    if (resetMissionState) {
        Object.assign(GAME_STATE.missionState, buildDefaultMissionState());
    }
    GAME_STATE.xpMoraleState = structuredClone(DB.SETTINGS?.xpMoralDefault ?? {});

    const allies = Array.isArray(DB.ALLIES) ? DB.ALLIES : [];
    const giants = Array.isArray(DB.GIANTS) ? DB.GIANTS : [];
    const events = Array.isArray(DB.EVENTS) ? DB.EVENTS : [];
    const consumable = Array.isArray(DB.CONSUMABLE) ? DB.CONSUMABLE : [];

    GAME_STATE.alliesPool.length = 0;
    GAME_STATE.alliesPool.push(...allies.filter(unit => unit.role !== "wall").map(u => ({
        ...u,
        currHp: u.hp,
        template: true,
        dead: false
    })));

    GAME_STATE.giantsPool.length = 0;
    GAME_STATE.giantsPool.push(...giants.map(u => ({
        role: "enemy",
        ...u,
        currHp: u.hp,
        template: true
    })));

    GAME_STATE.walls.length = 0;
    GAME_STATE.walls.push(...allies.filter(unit => unit.role === "wall").map(u => ({
        ...u,
        currHp: u.hp
    })));

    GAME_STATE.decks.event.draw = structuredClone(events);
    GAME_STATE.decks.consumable.draw = structuredClone(consumable);
}

export function resetInMemoryGameState() {
    if (!DB.ALLIES || !DB.GIANTS || !DB.EVENTS || !DB.CONSUMABLE || !DB.SETTINGS) {
        console.warn('[resetInMemoryGameState] DB non pronto per il reset.');
        return;
    }

    unitById.clear();
    GIANT_ENGAGEMENT.clear();
    UNIT_SELECTED.selectedUnitId = null;

    populateGameStateFromDB();

    GAME_STATE.missionStats = {};
    GAME_STATE.unitMods = {};

    GAME_STATE.spawns.length = 0;
    GAME_STATE.hand.length = 0;

    GAME_STATE.decks.event.discard = [];
    GAME_STATE.decks.event.removed = [];
    GAME_STATE.decks.consumable.discard = [];
    GAME_STATE.decks.consumable.removed = [];

    GAME_STATE.alliesRoster.length = 0;
    GAME_STATE.giantsRoster.length = 0;

    GAME_STATE.logs = [];
    GAME_STATE.events = [];
    GAME_STATE.turnState = null;
    GAME_STATE.stateVersion = 0;
    GAME_STATE.stateUpdatedAt = null;
    GAME_STATE.modRolls = {
        atk: 0,
        tec: 0,
        agi: 0,
        all: 0
    };
    GAME_STATE.turnEngine = {};
    GAME_STATE.setupMoves = {};
}

export function rebuildUnitIndex() {
    unitById.clear();
    [...GAME_STATE.alliesRoster, ...GAME_STATE.giantsRoster, ...GAME_STATE.walls].forEach(u => unitById.set(u.id, u));
}
