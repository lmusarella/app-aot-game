import { DB, GAME_STATE, populateGameStateFromDB } from './store.js';

// utility per caricare un json
async function loadJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Errore fetch ${url}: ${res.status}`);
    return res.json();
}

function ensureDbDefaults() {
    DB.ALLIES ??= [];
    DB.GIANTS ??= [];
    DB.EVENTS ??= [];
    DB.CONSUMABLE ??= [];
    DB.MISSIONS ??= [];
    DB.SETTINGS ??= {};
    DB.SETTINGS.missionDefaults ??= {};
    DB.SETTINGS.xpMoralDefault ??= {};
    DB.SETTINGS.gridSettings ??= {};
}

export async function bootDataApplication() {
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

        ensureDbDefaults();
        console.log('[boot] DB inizializzato:', DB);
        populateGameStateData();
        return DB;
    } catch (e) {
        console.warn('Caricamento JSON fallito, uso i fallback locali:', e);
        ensureDbDefaults();
        return DB;
    }
}

function populateGameStateData() {
    ensureDbDefaults();
    populateGameStateFromDB({ resetMissionState: true });
    console.log('init gamestate', GAME_STATE);
}

export async function loadDataAndGameState() {
    await bootDataApplication();
}
