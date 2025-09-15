async function play(url, opts = {}) {
    const { loop = false, volume = 1 } = opts;
    const audio = new Audio();
    audio.src = url; audio.preload = 'auto'; audio.loop = loop; audio.volume = clamp(volume, 0, 1); audio.crossOrigin = 'anonymous';
    try { await audio.play(); } catch (e) { console.warn('Autoplay blocked or error:', e); }
    return audio;
}
const gameSoundTrack = {
    background: null
}
// DB unico globale in memoria
let DB = {
    allies: null,
    giants: null,
    event: null,
    consumable: null,
    missions: null,
    settings: null
};

const MAX_PER_HEX = 12;
const DISPLAY_LIMIT = 8;
const COLOR_VAR = {
    red: 'var(--rosso)', yellow: 'var(--oro)', silver: 'var(--argento)', verde: 'var(--verde)',
    gray: 'var(--grigio)', blu: 'var(--blu)', argento: 'var(--argento)', viola: 'var(--viola)'
};

const ROWS = 12, COLS = 6;

const WALL_ROWS = { 10: 'w1', 11: 'w2', 12: 'w3' };

const ROW_BY_WALL_ID = Object.fromEntries(
    Object.entries(WALL_ROWS).map(([r, id]) => [id, Number(r)])
);


const SAVE_VERSION = 1;
const SAVE_KEY = 'aot-save-v' + SAVE_VERSION;
const LONG_PRESS_MS = 320;

const MISSIONS = [
    {
        id: 1, title: "Caccia ai Puri I",
        objectives: ["Uccidi 3 Giganti Puri."],
        reward: { xp: 2, morale: 0 },
        event: "Spawn di 2 Giganti Puri",
        timerSec: 1200,
        spawnRate: { Puro: { min: 1, max: 16 }, Anomalo: { min: 17, max: 19 }, Mutaforma: { min: 20, max: 20 } }
    },
    {
        id: 2, title: "Caccia ai Puri II",
        objectives: ["Uccidi 4 Giganti Puri."],
        reward: { xp: 2, morale: 0 },
        event: "Spawn di 3 Giganti Puri",
        timerSec: 1200,
        spawnRate: { Puro: { min: 1, max: 15 }, Anomalo: { min: 16, max: 18 }, Mutaforma: { min: 19, max: 20 } }
    },
    {
        id: 3, title: "Anomalo & Puri",
        objectives: ["Uccidi 1 Gigante Anomalo e 2 Giganti Puri."],
        reward: { xp: 3, morale: 0 },
        event: "Spawn di 1 Gigante Anomalo",
        timerSec: 1200,
        spawnRate: { Puro: { min: 1, max: 14 }, Anomalo: { min: 15, max: 17 }, Mutaforma: { min: 18, max: 20 } }
    },
    {
        id: 4, title: "Doppio Anomalo",
        objectives: ["Uccidi 2 Giganti Anomali."],
        reward: { xp: 5, morale: 1 },
        event: "Spawn di 2 Giganti Anomali",
        timerSec: 1200,
        spawnRate: { Puro: { min: 1, max: 13 }, Anomalo: { min: 14, max: 16 }, Mutaforma: { min: 17, max: 20 } }
    }
];



// Stato missione/timer
const MISSION_STATE = {
    missions: MISSIONS,
    curIndex: 0,              // indice nell'array missions
    timerTotalSec: 1200,      // default 20 min
    remainingSec: 1200,
    ticking: false,
    intervalId: null
};


let selectedUnitId = null;
let isDraggingNow = false;
let _modalEls = null;

let log_list = [];
let alliesRoster = [];
const baseHpOverride = new Map();
let giantsCatalog = [];
const spawns = [];
const unitById = new Map();
const decks = {
    event: { draw: [], discard: [], removed: [] },
    consumable: { draw: [], discard: [], removed: [] },
};
let _lastTooltipXY = null;


const queue = [];
let showing = false;

// === XP / LIVELLI ===
// Tabella cumulativa XP per raggiungere ogni livello (index = livello-1).
// Esempio: XP_TABLE[0]=0 (Lv.1), XP_TABLE[1]=100 (Lv.2), ...
const XP_TABLE = [2, 4, 8, 16, 64, 128, 256, 512, 1024];

// Bonus sbloccati dal Livello (cumulativi per soglie raggiunte)
const LEVEL_BONUS_TABLE = [
    { lvl: 2, text: '+1 AGI', bonus: { agi: 1, tec: 0, atk: 0 } },
    { lvl: 3, text: '+1 TEC', bonus: { agi: 0, tec: 1, atk: 0 } },
    { lvl: 4, text: '+1 ATK', bonus: { agi: 0, tec: 0, atk: 1 } },
    { lvl: 5, text: 'Cura le tue reclute di 5 HP complessivi.', bonus: { agi: 1, tec: 1, atk: 1 } },
    { lvl: 6, text: 'Ogni giocatore può pescare una carta equipaggiamento.', bonus: { agi: 1, tec: 1, atk: 1 } },
    { lvl: 7, text: 'Ripara le tue attuali mura di 5 HP.', bonus: { agi: 1, tec: 1, atk: 1 } },
    { lvl: 8, text: 'Cura i tuoi comandanti di 8 HP complessivi.', bonus: { agi: 1, tec: 1, atk: 1 } },
    { lvl: 9, text: 'Cura le tue reclute di 10 HP complessivi.', bonus: { agi: 1, tec: 1, atk: 1 } },
    { lvl: 10, text: 'Le tue reclute subiscono un danno in meno da tutte le fonti.', bonus: { agi: 1, tec: 1, atk: 1 } },
];

const LEVEL_MALUS_TABLE = [
    { range: { min: 75, max: 90 }, text: 'Tensione crescente', bonus: { agi: -1, tec: 0, atk: 0 }, type: 'warning' },
    { range: { min: 50, max: 75 }, text: 'Scarsa disciplina', bonus: { agi: 0, tec: -1, atk: 0 }, type: 'warning' },
    { range: { min: 25, max: 50 }, text: 'Catena di comando instabile', bonus: { agi: 0, tec: 0, atk: -1 }, type: 'error' },
    { range: { min: 1, max: 25 }, text: 'Panico tra la popolazione', bonus: { agi: -1, tec: -1, atk: -1 }, type: 'error' },
    { range: { min: 0, max: 1 }, text: 'Umanità sterminata', bonus: { agi: 0, tec: 0, atk: 0 }, type: 'error' },
];

const giantsPool = [
    // Mutaforma
    { id: "u1", name: "Gigante Femmina", img: "assets/img/giganti/gigante_femmina.jpg", type: "Mutaforma", color: "red", hp: 12, atk: 4, cd: 14, abi: "Test" },
    { id: "u2", name: "Gigante Bestia", img: "assets/img/giganti/gigante_bestia.jpg", type: "Mutaforma", color: "red", hp: 12, atk: 4, cd: 14, abi: "Test" },
    { id: "u3", name: "Gigante Carro", img: "assets/img/giganti/gigante_carro.jpg", type: "Mutaforma", color: "red", hp: 12, atk: 4, cd: 14, abi: "Test" },
    { id: "u4", name: "Gigante Martello", img: "assets/img/giganti/gigante_martello.png", type: "Mutaforma", color: "red", hp: 12, atk: 4, cd: 14, abi: "Test" },
    { id: "u5", name: "Gigante Mascella", img: "assets/img/giganti/gigante_mascella.png", type: "Mutaforma", color: "red", hp: 12, atk: 4, cd: 14, abi: "Test" },
    { id: "u6", name: "Gigante Colossale", img: "assets/img/giganti/gigante_colossale.png", type: "Mutaforma", color: "red", hp: 12, atk: 4, cd: 14, abi: "Test" },
    { id: "u7", name: "Gigante Corazzato", img: "assets/img/giganti/gigante_corazzato.png", type: "Mutaforma", color: "red", hp: 12, atk: 4, cd: 14, abi: "Test" },
    // Anomalo
    { id: "u8", name: "Gigante Anomalo", img: "assets/img/giganti/anomalo.png", type: "Anomalo", color: "yellow", hp: 12, atk: 4, cd: 14, abi: "Test" },
    { id: "u9", name: "Gigante Anomalo", img: "assets/img/giganti/anomalo_1.png", type: "Anomalo", color: "yellow", hp: 12, atk: 4, cd: 14, abi: "Test" },
    { id: "u10", name: "Gigante Anomalo", img: "assets/img/giganti/anomalo_2.png", type: "Anomalo", color: "yellow", hp: 12, atk: 4, cd: 14, abi: "Test" },
    { id: "u11", name: "Gigante Anomalo", img: "assets/img/giganti/anomalo_3.png", type: "Anomalo", color: "yellow", hp: 12, atk: 4, cd: 14, abi: "Test" },
    { id: "u12", name: "Gigante Anomalo", img: "assets/img/giganti/anomalo_4.png", type: "Anomalo", color: "yellow", hp: 12, atk: 4, cd: 14, abi: "Test" },

    { id: "u15", name: "Gigante Anomalo", img: "assets/img/giganti/anomalo_6.png", type: "Anomalo", color: "yellow", hp: 12, atk: 4, cd: 14, abi: "Test" },
    { id: "u16", name: "Gigante Anomalo", img: "assets/img/giganti/anomalo_7.png", type: "Anomalo", color: "yellow", hp: 12, atk: 4, cd: 14, abi: "Test" },
    { id: "u17", name: "Gigante Anomalo", img: "assets/img/giganti/anomalo_8.png", type: "Anomalo", color: "yellow", hp: 12, atk: 4, cd: 14, abi: "Test" },
    // Puro
    { id: "u13", name: "Gigante Nano", img: "assets/img/giganti/gigante_puro.jpg", type: "Puro", color: "silver", hp: 12, atk: 2, cd: 12, abi: "Nessuna" },
    { id: "u18", name: "Gigante Nano", img: "assets/img/giganti/gigante_puro_1.png", type: "Puro", color: "silver", hp: 12, atk: 2, cd: 12, abi: "Nessuna" },
    { id: "u19", name: "Gigante Nano", img: "assets/img/giganti/gigante_puro_2.png", type: "Puro", color: "silver", hp: 12, atk: 2, cd: 12, abi: "Nessuna" },
    { id: "u20", name: "Gigante Nano", img: "assets/img/giganti/gigante_puro_3.png", type: "Puro", color: "silver", hp: 12, atk: 2, cd: 12, abi: "Nessuna" },
    { id: "u21", name: "Gigante Nano", img: "assets/img/giganti/gigante_puro_4.png", type: "Puro", color: "silver", hp: 12, atk: 2, cd: 12, abi: "Nessuna" },
    { id: "u22", name: "Gigante Nano", img: "assets/img/giganti/gigante_puro_5.png", type: "Puro", color: "silver", hp: 12, atk: 2, cd: 12, abi: "Nessuna" },
    { id: "u23", name: "Gigante Nano", img: "assets/img/giganti/gigante_puro_6.png", type: "Puro", color: "silver", hp: 12, atk: 2, cd: 12, abi: "Nessuna" },
    { id: "u24", name: "Gigante Nano", img: "assets/img/giganti/gigante_puro_7.png", type: "Puro", color: "silver", hp: 12, atk: 2, cd: 12, abi: "Nessuna" },
    { id: "u14", name: "Gigante Nano", img: "assets/img/giganti/gigante_puro_8.png", type: "Puro", color: "silver", hp: 12, atk: 2, cd: 12, abi: "Nessuna" },

].map(u => ({ role: "enemy", ...u, currHp: u.hp, template: true }));

const alliesPool = [
    { id: "r1", role: "recruit", name: "Armin Arlert", img: "https://static.wikia.nocookie.net/shingekinokyojin/images/f/ff/Armin_Arlelt_%28Anime%29_character_image_%28850%29.png/revision/latest/scale-to-width/360?cb=20210124214612", hp: 10, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "r2", role: "recruit", name: "Connie Springer", img: "https://placehold.co/60x60/d3d3d3/000000?text=C", hp: 8, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "r3", role: "recruit", name: "Sasha Braus", img: "https://placehold.co/60x60/c4a683/FFFFFF?text=S", hp: 7, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "r4", role: "recruit", name: "Reiner Braun", img: "https://placehold.co/60x60/e2e8f0/000000?text=R", hp: 9, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "r5", role: "recruit", name: "Bertholdt Hoover", img: "https://placehold.co/60x60/a0aec0/000000?text=B", hp: 8, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "r6", role: "recruit", name: "Annie Leonhart", img: "https://placehold.co/60x60/fde68a/000000?text=A", hp: 8, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "r7", role: "recruit", name: "Ymir Fritz", img: "https://placehold.co/60x60/718096/FFFFFF?text=Y", hp: 7, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "r8", role: "recruit", name: "Historia Reiss", img: "https://images.everyeye.it/img-notizie/attack-on-titan-cosa-succede-historia-storia-v3-693469.jpg", hp: 8, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "r9", role: "recruit", name: "Marco Bodt", img: "https://placehold.co/60x60/b7791f/FFFFFF?text=M", hp: 5, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "r10", role: "recruit", name: "Marlo Freudeberg", img: "https://placehold.co/60x60/9b2c2c/FFFFFF?text=T", hp: 5, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "r11", role: "recruit", name: "Hitch Dreyse", img: "https://placehold.co/60x60/6b46c1/FFFFFF?text=M", hp: 5, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "r12", role: "recruit", name: "Rico Brzenska", img: "https://placehold.co/60x60/000000/FFFFFF?text=S", hp: 5, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "r13", role: "recruit", name: "Mikasa Ackerman", img: "https://static.wikitide.net/greatcharacterswiki/a/a2/850_Mikasa.jpg", hp: 13, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "r14", role: "recruit", name: "Jean Kirstein", img: "https://placehold.co/60x60/c4a683/000000?text=J", hp: 12, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "r15", role: "recruit", name: "Floch Forster", img: "https://placehold.co/60x60/e53e3e/FFFFFF?text=F", hp: 6, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "r16", role: "recruit", name: "Eren Yeager", img: "https://www.georgefiorini.eu/images/manga/attacco-dei-giganti/eren-jaeger-tv.jpg", hp: 10, atk: 4, tec: 3, agi: 2, color: "verde", abi: "Test" },
    { id: "c1", role: "commander", name: "Hange Zoë", img: "https://4kwallpapers.com/images/wallpapers/hange-zoe-5k-attack-5120x2880-15185.jpg", hp: 17, atk: 4, tec: 3, agi: 2, color: "viola", abi: "Test" },
    { id: "c2", role: "commander", name: "Mike Zacharias", img: "https://cdn.shopify.com/s/files/1/0252/1736/8154/files/33e7abb895a05bea2fee9350c37446cca48d1355r5-967-609_00_480x480.jpg?v=1646473635", hp: 18, atk: 4, tec: 3, agi: 2, color: "viola", abi: "Test" },
    { id: "c3", role: "commander", name: "Erwin Smith", img: "https://static.wikia.nocookie.net/shingekinokyojin/images/3/3f/Erwin_puts_on_his_ODM.png/revision/latest?cb=20171102013340", hp: 16, atk: 4, tec: 3, agi: 2, color: "viola", abi: "Test" },
    { id: "c4", role: "commander", name: "Levi Ackerman", img: "https://media.printler.com/media/photo/144700.jpg?rmode=crop&width=725&height=1024", hp: 20, atk: 4, tec: 3, agi: 2, color: "viola", abi: "Test" },
    { id: "c5", role: "commander", name: "Keith Shadis", img: "https://static.wikia.nocookie.net/shingekinokyojin/images/e/e6/Keith.png/revision/latest?cb=20130930182018&path-prefix=it", hp: 17, atk: 4, tec: 3, agi: 2, color: "viola", abi: "Test" },

].map(u => ({ ...u, currHp: u.hp, template: true, dead: false }));

const wallsCatalog = [
    { id: "w1", role: "wall", name: "Wall Maria", img: "assets/img/wall_maria.png", color: "gray", hp: 12, atk: 0, abi: "Difesa Esterna" },
    { id: "w2", role: "wall", name: "Wall Rose", img: "assets/img/wall_rose.jpg", color: "gray", hp: 15, atk: 0, abi: "Difesa Intermedia" },
    { id: "w3", role: "wall", name: "Wall Sina", img: "assets/img/wall_sina.jpg", color: "gray", hp: 18, atk: 0, abi: "Difesa Interna" },
].map(u => ({ ...u, currHp: u.hp }));

const eventPool = [
    { id: "e1", type: "event", name: "Rifornimenti Inattesi", desc: "Le tue squadre trovano una cassa di rifornimenti. Tutti i giocatori pescano una carta equipaggiamento.", img: "assets/img/cards/logo.jpg" },
    { id: "e2", type: "malus", name: "Maltempo Improvviso", desc: "Una pioggia torrenziale riduce la visibilità. Malus di -1 a tutti i tiri di dado per questo turno.", img: "assets/img/cards/logo.jpg" },
    { id: "e3", type: "event", name: "Kit di sopravvivenza", desc: "Le tue squadre trovano una cassa di rifornimenti. Tutti i giocatori pescano una carta consumabile.", img: "assets/img/cards/logo.jpg" },
    { id: "e4", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e5", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e6", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e7", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e8", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e9", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e10", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e11", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e12", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e13", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e14", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e15", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e16", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e17", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e18", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e19", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e20", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e21", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e22", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e23", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e24", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e25", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e26", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e27", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e28", type: "spawn", name: "Discesa del Gigante!", desc: "Si sente un rombo di tuono in lontananza...", img: "assets/img/cards/fulmine.jpg" },
    { id: "e29", type: "event", name: "Duello", desc: "Scegli una recluta e muovila in un esagono adiacente ad un gigante. La recluta e il gigante combattono solo con i bonus da essi generati lanciando regolarmente i dadi finchè uno dei due non muore.", img: "assets/img/cards/logo.jpg" },
    { id: "e30", type: "malus", name: "Tremore", desc: "Il comandante ha avvertito un tremore e ordina a tutte le squadre di non muoversi. Tutti i personaggi saltano il turno di movimento per questo turno", img: "assets/img/cards/logo.jpg" },
    { id: "e31", type: "bonus", name: "Accelerazione", desc: "Il comandante ordina di accelerare la missione. Tutti i personaggi devono compiere un'azione di movimento aggiuntiva per questo turno", img: "assets/img/cards/logo.jpg" },
    { id: "e32", type: "spawn", name: "Mutazione!", desc: "Appare un gigante mutaforma nell'ultima fila di esagoni. Lancia un d6 per stabilire la colonna.", img: "assets/img/cards/logo.jpg" },
    { id: "e33", type: "malus", name: "Processo truccato", desc: "Conserva questa carta fino alla fine della missione. Per ogni recluta di ritorno dalla missione puoi decidere se infliggerle 2 danni oppure perdere 1 morale", img: "assets/img/cards/logo.jpg" },
    { id: "e34", type: "malus", name: "Mutazione d'attacco", desc: "I giganti sembrano avere denti più affilati del solito. Ogniqualvolta un gigante dovrebbe infliggere danno in questa missione, egli infligge un danno aggiuntivo", img: "assets/img/cards/logo.jpg" },
    { id: "e35", type: "malus", name: "Mutazione di difesa", desc: "I giganti sembrano avere una pelle più dura del solito. Ogniqualvolta un gigante dovrebbe subire danno in questa missione, egli subisce un danno in meno", img: "assets/img/cards/logo.jpg" },
    { id: "e36", type: "event", name: "Assedio alle mura", desc: "Ogni gigante entro le prime due file di esagoni infligge il proprio danno alle mura. Se non ci sono giganti in questa zona, tutti i giganti non in combattimento avanzano verso le mura di 1 esagono", img: "assets/img/cards/logo.jpg" },
    { id: "e37", type: "event", name: "Imboscata", desc: "Se un gigante entra in combattimento contro un personaggio il prossimo turno anche un altro gigante entro tre esagoni da esso viene spostato in un esagono ad egli adiacente e si unisce al combattimento ", img: "assets/img/cards/logo.jpg" },
    { id: "e38", type: "event", name: "Mutilazione", desc: "Il comandante ha perso un braccio. Perde 5HP e non può attaccare il prossimo turno", img: "assets/img/cards/logo.jpg" },
    { id: "e39", type: "event", name: "Rifugio nella torre", desc: "Se una recluta si reca nella torre nel prossimo turno, quella recluta può pescare 1 carta equipaggiamento", img: "assets/img/cards/logo.jpg" },
    { id: "e40", type: "event", name: "Corsia laterale", desc: "Tutte le reclute nei due esagoni laterali di ogni fila possono compiere un'azione movimento bonus il prossimo turno", img: "assets/img/cards/logo.jpg" },
    { id: "e41", type: "event", name: "Guerra", desc: "Questa missione è considerata completata solo se tutti i giganti presenti sulla mappa sono stati uccisi", img: "assets/img/cards/logo.jpg" },
    { id: "e42", type: "event", name: "Corruzione della Gendarmeria", desc: "Senza il corpo di ricerca in città serpeggia la corruzione. Puoi scegliere se pescare un'altra carta evento oppure perdere 2 morale", img: "assets/img/cards/logo.jpg" },
    { id: "e43", type: "event", name: "Obiettivo: Mare", desc: "Questa missione può essere completata solo raggiungendo il mare", img: "assets/img/cards/logo.jpg" },
    { id: "e44", type: "event", name: "Sovrappopolazione", desc: "La popolazione all'interno delle mura è troppa e affamata. Se è caduto il Wall Maria perdi 2 morale. Se è caduto il Wall Rose perdi 5 morale", img: "assets/img/cards/logo.jpg" },
    { id: "e45", type: "event", name: "Breccia nelle mura", desc: "Tutti i giganti non in combattimento entro la quarta fila di esagoni si muovono di due esagoni verso le mura", img: "assets/img/cards/logo.jpg" },
    { id: "e46", type: "event", name: "Ritirata strategica", desc: "Puoi riposizionare le truppe non in combattimento entro due esagoni, ma non possono avanzare", img: "assets/img/cards/logo.jpg" },
    { id: "e47", type: "event", name: "Quiete", desc: "Non succede nulla", img: "assets/img/cards/logo.jpg" },
    { id: "e48", type: "event", name: "Sacrificio", desc: "Il morale sale a 15. Il comandante non in missione cone meno HP viene sacrificato e rimosso dal gioco", img: "assets/img/cards/logo.jpg" },
    { id: "e49", type: "spawn", name: "Pioggia di giganti", desc: "Riattiva l'ultima carta 'Discesa del Gigante' pescata, due volte. Verranno evocati due giganti dello stesso tipo di quello evocato in precedenza e nella stessa posizione", img: "assets/img/cards/logo.jpg" },
    { id: "e50", type: "event", name: "Disarcionamento", desc: "La recluta più arretrata viene disarcionata da cavallo per il resto della missione. E' considerata immobilizzata per questo turno ma potrà comunque attaccare", img: "assets/img/cards/logo.jpg" },
    { id: "e51", type: "event", name: "Resistenza", desc: "Nessuna recluta può morire il prossimo turno. Una recluta che dovrebbe subire danni che la porterebbero alla morte, previene quei danni e può essere riposizionata entro due esagoni", img: "assets/img/cards/logo.jpg" },
    { id: "e52", type: "event", name: "Carica!", desc: "Nel prossimo turno si può compiere um'azione di movimento bonus", img: "assets/img/cards/logo.jpg" },
    { id: "e53", type: "event", name: "Amuleto della fortuna", desc: "La recluta con meno HP sceglie un numero. Durante questa missione ogni volta che il risultato di qualsiasi d20 è pari a quel numero, la recluta recupera 1HP", img: "assets/img/cards/logo.jpg" },
    { id: "e54", type: "event", name: "Maledizione", desc: "La recluta con più HP sceglie un numero. Durante questa missione ogni volta che il risultato di qualsiasi d20 è pari a quel numero, la recluta perde 1HP", img: "assets/img/cards/logo.jpg" },
    { id: "e55", type: "event", name: "Boato della terra", desc: "Tutti i giganti sulla mappa si muovono di due esagoni verso le mura. Ogni soldato presente sul loro cammino deve effettuare un tiro salvezza CD=13 o subire 3 danni. I personaggi immobilizzati non possono effettuare tiri salvezza", img: "assets/img/cards/logo.jpg" },
    { id: "e56", type: "event", name: "Linfa vitale", desc: "Ogni recluta che mette a segno un attacco il prossimo turno, si cura di 1HP", img: "assets/img/cards/logo.jpg" },
    { id: "e57", type: "event", name: "Attacco coordinato", desc: "Il comandante ordina di mirare ai legamenti delle caviglie. Durante il prossimo turno ogni attacco che ottiene 15+ naturale immobilizza il gigante", img: "assets/img/cards/logo.jpg" },
    { id: "e58", type: "bonus", name: "Rifugio nel bosco", desc: "Durante il prossimo turno è possibile nascondersi nel bosco senza tirare i dadi. Ogni attacco sferrato dal bosco infligge 2 danni aggiuntivi per questo turno", img: "assets/img/cards/logo.jpg" },
    { id: "e59", type: "event", name: "Linfa vitale", desc: "Ogni recluta che mette a segno un attacco il prossimo turno, si cura di 1HP", img: "assets/img/cards/logo.jpg" },
    { id: "e60", type: "malus", name: "Avvelenamento", desc: "Il morso di un gigante ha avvelenato un compagno. La prima recluta a subire danno nel prossimo turno viene avvelenata e subisce 1 danno ogni turno passato in combattimento per il resto della missione", img: "assets/img/cards/logo.jpg" },
    { id: "e61", type: "event", name: "Urlo del  Bestia", desc: "Tutti i giganti puri avanzano immediatamente di 1 esagono. Tutti i giganti anomali avanzano di 1 esagono e guadagnano +1 danni al prossimo attacco", img: "assets/img/cards/logo.jpg" },
    { id: "e62", type: "malus", name: "Nebbia fitta", desc: "La visibilità cala drasticamente. Tutti i tiri salvezza hanno svantaggio al prossimo turno", img: "assets/img/cards/logo.jpg" },
    { id: "e63", type: "bonus", name: "Furia disperata", desc: "La recluta con meno HP guadagna +2 danni al prossimo attacco", img: "assets/img/cards/logo.jpg" },
    { id: "e64", type: "malus", name: "Sabotaggio armature", desc: "Un infiltrato sabota la missione e manomette un equipaggiamento: Una recluta deve scartare un equipaggiamento", img: "assets/img/cards/logo.jpg" },
    { id: "e65", type: "event", name: "Furia di Hange", desc: "Una recluta può spostarsi rapidamente con movimento tridimensionale per tutta la mappa. Può effettuare un attacco contro ognuno dei giganti in missione, prima di morire", img: "assets/img/cards/logo.jpg" },
    { id: "e66", type: "event", name: "Pioggia di fuoco", desc: "I giganti vengono colpiti da catapulte. Ogni gigante entro le prime due file di esagoni subisce 2 danni", img: "assets/img/cards/logo.jpg" },
    { id: "e67", type: "event", name: "Ruggito paralizzante", desc: "Il prossimo attacco di un gigante infligge il doppio dei danni ma non potrà muoversi nel turno successivo", img: "assets/img/cards/logo.jpg" },
    { id: "e68", type: "bonus", name: "Indurimento parziale", desc: "Per il prossimo turno tutti i danni inferiori a 3 vengono prevenuti, tutti i dannu superiori a 3 vengono raddoppiati", img: "assets/img/cards/logo.jpg" },
    { id: "e69", type: "malus", name: "Crollo improvviso", desc: "Un edificio cede nell'incrocio di 2d6: quell'esagono diventa non calpestabile per il resto della missione. Se un gigante era presente sull'esagono subisce 3 danni. Se un personaggio era presente sull'esagono deve effettuare un tiro salvezza CD 14 o subire 3 danni.", img: "assets/img/cards/logo.jpg" },
    { id: "e70", type: "event", name: "Richiamo alle armi", desc: "Il giocatore che controlla la recluta con più HP può piazzare una nuova recluta in una casella di partenza libera. Questa recluta subisce 2 danni", img: "assets/img/cards/logo.jpg" },
    { id: "e71", type: "malus", name: "Esplosione di rabbia", desc: "Il prossimo attacco di un gigante ignora armature e riduzioni di danno", img: "assets/img/cards/logo.jpg" },
    { id: "e72", type: "bonus", name: "Bandiera del coraggio", desc: "Il morale aumenta di 3", img: "assets/img/cards/logo.jpg" },
    { id: "e73", type: "malus", name: "Evacuazione fallita", desc: "Un gruppo di civili viene travolto. Perdi 2 morale", img: "assets/img/cards/logo.jpg" },
    { id: "e74", type: "event", name: "Squadra di supporto", desc: "Tutti i giocatori che hanno perso almeno una recluta pescano una carta equipaggiamento", img: "assets/img/cards/logo.jpg" },
    { id: "e75", type: "event", name: "Inseguimento", desc: "Un gigante non in combattimento si muove immediatamente di 2 esagoni verso la recluta più vicina. Se la raggiunge, compie un attacco immediato senza possibilità di contrattaco", img: "assets/img/cards/logo.jpg" },
    { id: "e76", type: "bonus", name: "Granata fumogena", desc: "La vista dei giganti è offuscata. Tutte le squadre possono riposizionarsi di 1 esagono", img: "assets/img/cards/logo.jpg" },
    { id: "e77", type: "malus", name: "Lama scheggiata", desc: "Le lame sono scheggiate. Durante il prossimo turno, tutti gli attacchi delle squadre infliggono 1 danno in meno", img: "assets/img/cards/logo.jpg" },
    { id: "e78", type: "bonus", name: "Recluta eroica", desc: "Una recluta a scelta può ignorare i danni subiti in questo turno", img: "assets/img/cards/logo.jpg" },
    { id: "e79", type: "event", name: "Muro instabile", desc: "Un gigante tira un masso contro le mura. Le mura subiscono immediatamente 3 danni", img: "assets/img/cards/logo.jpg" },
    { id: "e80", type: "event", name: "Morale a terra", desc: "Per questa missione i malus del morale sono raddoppiati", img: "assets/img/cards/logo.jpg" },
    { id: "e81", type: "malus", name: "Rifornimenti avariati", desc: "Un carico di provviste si rivela marcio. Tutti i giocatori scartano una carta consumabile se ne hanno una. Nessun istantaneo può essere usato in questa fase", img: "assets/img/cards/logo.jpg" },
    { id: "e82", type: "bonus", name: "Coraggio inaspettato", desc: "La recluta con meno morale personale (se esiste) guadagna +2 al prossimo tiro", img: "assets/img/cards/logo.jpg" },
    { id: "e83", type: "spawn", name: "Gigante errante", desc: "Un nuovo gigante viene avvistato senza fumogeni. Spawn di un gigante nella stessa fila della recluta più arretrata, in colonna 1", img: "assets/img/cards/logo.jpg" },
    { id: "e84", type: "event", name: "Caduta dalle mura", desc: "Un masso colpisce una sezione delle mura. Ogni recluta posizionata su o adiacente alle mura subisce 1 danno", img: "assets/img/cards/logo.jpg" },
    { id: "e85", type: "malus", name: "Ordini confusi", desc: "Il comandante sbaglia le disposizioni: le reclute non possono attaccare lo stesso gigante durante il prossimo turno", img: "assets/img/cards/logo.jpg" },
    { id: "e86", type: "bonus", name: "Cavalleria di supporto", desc: "Una recluta a scelta guadagna due movimenti extra se può posizionarsi fuori dal cono di visuale di un gigante", img: "assets/img/cards/logo.jpg" },
    { id: "e87", type: "spawn", name: "Rinforzi Anomali", desc: "Spawn di un gigante anomalo nella fila più arretrata", img: "assets/img/cards/logo.jpg" },
    { id: "e88", type: "malus", name: "Notte senza luna", desc: "La scarsa visibilità rende difficile colpire. Tutti i tiri di dado ottengono -2 finché non viene pescata un’altra carta Evento", img: "assets/img/cards/logo.jpg" },
    { id: "e89", type: "event", name: "Sacrificio eroico", desc: "Una recluta può decidere di morire istantaneamente per eliminare un gigante puro o anomalo entro 2 esagoni", img: "assets/img/cards/logo.jpg" },
    { id: "e90", type: "malus", name: "Pioggia torrenziale", desc: "Piove a dirotto. I giganti avanzano di 1 esagono extra perché i movimenti delle reclute sono rallentati", img: "assets/img/cards/logo.jpg" },
    { id: "e91", type: "event", name: "Resa dei conti", desc: "Se ci sono più giganti che reclute sulla mappa, il morale scende di 3", img: "assets/img/cards/logo.jpg" },
    { id: "e92", type: "bonus", name: "Armi affilate", desc: "Le lame sono state stostituite. Durante il prossimo turno, tutti gli attacchi delle squadre infliggono 1 danno in più", img: "assets/img/cards/logo.jpg" },
    { id: "e93", type: "event", name: "Vendetta!", desc: "Per ogni recluta caduta il morale aumenta di 1", img: "assets/img/cards/logo.jpg" },
    { id: "e94", type: "malus", name: "Urla tra le strade", desc: "La paura dilaga tra i civili. Se una breccia nelle mura è aperta, perdi 4 morale, altrimenti perdi 2 morale", img: "assets/img/cards/logo.jpg" },
    { id: "e95", type: "event", name: "Notte senza luna", desc: "I giocatori possono decidere di non pescare più carte evento ma le reclute subiscono 1 danno ogni turno. Pescare una carta evento, quando possibile, per interrompere l'effetto", img: "assets/img/cards/logo.jpg" },
    { id: "e96", type: "bonus", name: "Medico da campo", desc: "Puoi curare di 2 HP una recluta in missione", img: "assets/img/cards/logo.jpg" },
    { id: "e97", type: "event", name: "Trappola a filo", desc: "Piazza una trappola su un esagono adiacente su cui non è presente un gigante. Se un gigante si muove su quell'esagono subisce 2 danni ed è immobilizzato per 1 turno", img: "assets/img/cards/logo.jpg" },
    { id: "e98", type: "malus", name: "Morso letale", desc: "Il prossimo attacco di un gigante infligge danni critici: raddoppia i danni inflitti", img: "assets/img/cards/logo.jpg" },
    { id: "e99", type: "bonus", name: "Manovra diversiva", desc: "Una bomba fumogena offusca la vista dei giganti. Una recluta può sparire dalla mappa per 1 turno e riapparire in un esagono libero entro 3 esagoni dalla sua posizione", img: "assets/img/cards/logo.jpg" },
    { id: "e100", type: "bonus", name: "Assetto da tank", desc: "Tutti i personaggi che ottengono 'aggro' da parte di un gigante nel prossimo turno prevengono 2 danni contro quel gigante ", img: "assets/img/cards/logo.jpg" },
];

const consumablePool = [

];

const alliesEl = document.getElementById("bench-allies");
const enemiesEl = document.getElementById("bench-enemies");
const wallsEl = document.getElementById("bench-walls");
const countAlliesEl = document.getElementById("count-allies");
const countEnemiesEl = document.getElementById("count-enemies");
const countWallsEl = document.getElementById("count-walls");

const grid = document.getElementById("hex-grid");
const tooltipEl = document.getElementById("tooltip");
const missionCard = document.getElementById('mission-card');
const logBox = document.getElementById('log-box');

const fabs = Array.from(document.querySelectorAll('.fab'));
const diceRes = document.getElementById('dice-res');
const btnReset = document.getElementById('btn-reset-game');

/* ===== Collapsible sidebars: logic ===== */
const leftEl = document.querySelector('.leftbar');
const rightEl = document.querySelector('aside');
const btnL = document.getElementById('toggle-left');
const btnR = document.getElementById('toggle-right');
const region = document.getElementById('snackbar-region');
const box = document.getElementById('bm-box');

const elMissionNumTop = document.getElementById('m-num');       // header (numero)
const elMissionNumCard = document.querySelector('#missione-corrente #mc-num'); // card (numero)
const elMissionCardWrap = document.getElementById('missione-corrente');        // container card

const elPlay = document.getElementById('t-play');
const elReset = document.getElementById('t-reset');
const elTime = document.getElementById('t-time');

const elDec = document.getElementById('m-dec');
const elInc = document.getElementById('m-inc');

const xpDOM = {
    fill: document.getElementById("xp-fill"),
    pct: document.getElementById("xp-val"),
    lvl: document.getElementById("lvl-val"),
};

const moraleDOM = {
    fill: document.getElementById("morale-fill"),
    pct: document.getElementById("morale-val"),
};

// Stato iniziale XP: deducilo dal DOM se presente, altrimenti default
const initialLevel = (() => {
    const txt = xpDOM.lvl?.textContent || "";
    const m = txt.match(/Lv\.\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : 1;
})();

const initialPct = (() => {
    const txt = xpDOM.pct?.textContent || "0%";
    const m = txt.match(/(\d+(\.\d+)?)\s*%/);
    return m ? parseFloat(m[1]) : 0;
})();

const EXP_MORAL_STATE = {
    xp: (() => {
        const base = xpThreshold(initialLevel);
        const next = xpThreshold(initialLevel + 1);
        const range = Math.max(1, next - base);
        return Math.round(base + (initialPct / 100) * range);
    })(),
    moralePct: 100,
    effectiveBonus: {
        agi: 0,
        tec: 0,
        atk: 0,
    }
};


function snapshot() {
    // NB: non salvo unitById (si ricostruisce). Salvo solo ciò che serve davvero.
    return {
        ver: SAVE_VERSION,
        savedAt: Date.now(),

        // campo - griglia
        spawns: structuredClone(spawns),

        // panchine/pool
        alliesPool: structuredClone(alliesPool),
        alliesRoster: structuredClone(alliesRoster),
        giantsPool: structuredClone(giantsPool),
        giantsCatalog: structuredClone(giantsCatalog),
        wallsCatalog: structuredClone(wallsCatalog), // base walls (w1,w2,w3)

        // mazzi
        decks: structuredClone(decks),

        // UI/stati
        state: structuredClone(EXP_MORAL_STATE),
        // log
        logs: structuredClone(log_list),
        missionState: (() => {
            const m = structuredClone(MISSION_STATE);
            // leggero “sanitize”: niente intervalId/oggetti runtime
            delete m.intervalId;
            return m;
        })()
    };
}
/** Reset totale del gioco: cancella storage e ripristina i default */
function resetGame() {
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

    // 1) ripristina array principali (mantenendo i riferimenti)
    spawns.length = 0; spawns.push(...save.spawns);
    alliesPool.length = 0; alliesPool.push(...save.alliesPool);
    alliesRoster.length = 0; alliesRoster.push(...save.alliesRoster);
    giantsPool.length = 0; giantsPool.push(...save.giantsPool);
    giantsCatalog.length = 0; giantsCatalog.push(...save.giantsCatalog);
    wallsCatalog.length = 0; wallsCatalog.push(...save.wallsCatalog);

    // 2) mazzi
    decks.event.draw = save.decks?.event?.draw ?? [];
    decks.event.discard = save.decks?.event?.discard ?? [];
    decks.event.removed = save.decks?.event?.removed ?? [];
    decks.consumable.draw = save.decks?.consumable?.draw ?? [];
    decks.consumable.discard = save.decks?.consumable?.discard ?? [];
    decks.consumable.removed = save.decks?.consumable?.removed ?? [];
    log_list = save.logs ?? [];

    // 3) stati
    Object.assign(EXP_MORAL_STATE, save.state || {});
    Object.assign(MISSION_STATE, save.missionState || {});
    MISSION_STATE.intervalId = null; // sempre nullo a cold start

    // 4) ricostruisci unitById dai cataloghi + muri base
    unitById.clear();
    rebuildUnitIndex(); // mette alliesRoster + giantsCatalog + wallsCatalog (base)

    // 5) assicurati che i SEGMENTI MURA esistano per ogni cella muro salvata
    //    Se vedi un id "w1_r10c3" in spawns e non è nel map, crealo dal base corrispondente.
    const baseByPrefix = new Map(wallsCatalog.map(w => [w.id, w]));
    for (const s of spawns) {
        const ids = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
        for (const id of ids) {
            if (unitById.has(id)) continue;
            const m = String(id).match(/^(w\d+)_r\d+c\d+$/);
            if (m) {
                const baseId = m[1];
                const base = baseByPrefix.get(baseId);
                if (base) {
                    unitById.set(id, { ...base, id, name: `${base.name}`, segment: true, role: 'wall', currHp: base.currHp ?? base.hp });
                }
            }
        }
    }

    // 6) riprendi il TIMER in modo resiliente
    try {
        if (MISSION_STATE.ticking) {
            const elapsedSec = Math.floor((Date.now() - (save.savedAt || Date.now())) / 1000);
            MISSION_STATE.remainingSec = clamp((MISSION_STATE.remainingSec || 0) - elapsedSec, 0, MISSION_STATE.timerTotalSec || 1200);
            if (MISSION_STATE.remainingSec > 0) {
                startTimer();
            } else {
                stopTimer();
                log("Tempo Scaduto! Ogni turno apparirà un gigante!");
                playCornoGuerra();
            }
        }
    } catch { }

    // 7) UI refresh
    refreshXPUI();
    refreshMoraleUI();
    renderBonusMalus();
    renderBenches();
    renderGrid(grid, ROWS, COLS, spawns);
    restoreLayout();
    renderHeader();
    renderLogs();
    updateFabDeckCounters();
    return true;
}

function saveToLocal() {
    try {
        const data = snapshot();
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Salvataggio fallito', e);
        // opzionale: notifica
        // window.snackbar('Impossibile salvare lo stato (localStorage pieno?)', {}, 'warning');
    }
}

function loadFromLocal() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        return restore(data);
    } catch (e) {
        console.warn('Restore fallito, riparto pulito.', e);
        return false;
    }
}

function debounce(fn, ms = 400) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const scheduleSave = debounce(saveToLocal, 500);
const isTemplate = (u) => !!u.template;
const isClone = (u) => !u.template && !!u.baseId;
function rebuildUnitIndex() {
    unitById.clear();
    [...alliesRoster, ...giantsCatalog, ...wallsCatalog].forEach(u => unitById.set(u.id, u));
}
function seedWallRows() {
    // 1) togli eventuali vecchie entry in r.10/11/12
    for (let i = spawns.length - 1; i >= 0; i--) {
        const r = spawns[i].row;
        if (WALL_ROWS[r]) spawns.splice(i, 1);
    }
    // 2) crea segmenti (cloni con id univoco) e mettili in campo
    for (const [rStr, baseId] of Object.entries(WALL_ROWS)) {
        const r = +rStr;
        const base = wallsCatalog.find(w => w.id === baseId);
        if (!base) continue;
        for (let c = 1; c <= COLS; c++) {
            const segId = `${baseId}`;
            if (!unitById.has(segId)) {
                const copy = { ...base, id: segId, name: base.name + ` — ${c}`, currHp: base.hp, segment: true };
                unitById.set(segId, copy); // NB: non lo aggiungo a wallsCatalog per non affollare la panchina
            }
            spawns.push({ row: r, col: c, unitIds: [segId] });
        }
    }
}
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
function resetDeckFromPool(type) {
    const pool = (type === 'event') ? eventPool : consumablePool;
    const d = decks[type];
    d.draw = shuffle(pool.slice()); // copia + shuffle
    d.discard = [];
    d.removed = [];
    scheduleSave();
    updateFabDeckCounters();
}
const keyRC = (r, c) => `${r},${c}`;
function findCellIndex(r, c) { return spawns.findIndex(s => s.row === r && s.col === c); }
function getStack(r, c) {
    const idx = findCellIndex(r, c);
    if (idx < 0) return [];
    const s = spawns[idx];
    if (Array.isArray(s.unitIds)) return [...s.unitIds];
    if (s.unitId) return [s.unitId];
    return [];
}
const countAlive = (role) => alliesPool.filter(u => u.role === role && !u.dead).length;
const totalByRole = (role) => alliesPool.filter(u => u.role === role).length;
function setStack(r, c, arr) {
    const idx = findCellIndex(r, c);
    if (!arr || arr.length === 0) { if (idx >= 0) spawns.splice(idx, 1); return; }
    if (idx < 0) spawns.push({ row: r, col: c, unitIds: [...arr] });
    else spawns[idx] = { row: r, col: c, unitIds: [...arr] };
    scheduleSave();
}
function removeUnitEverywhere(unitId) {
    for (let i = spawns.length - 1; i >= 0; i--) {
        const s = spawns[i];
        const arr = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
        const idx = arr.indexOf(unitId);
        if (idx >= 0) {
            arr.splice(idx, 1);
            if (arr.length === 0) spawns.splice(i, 1);
            else spawns[i] = { row: s.row, col: s.col, unitIds: arr };
            scheduleSave();
            return;
        }
    }
}
function bringToFront(cell, unitId) {
    const list = getStack(cell.row, cell.col);
    const i = list.indexOf(unitId);
    if (i < 0) return;
    list.splice(i, 1);
    list.push(unitId);
    setStack(cell.row, cell.col, list);
}
function isOnField(unitId) {
    return spawns.some(s => {
        const arr = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
        return arr.includes(unitId);
    });
}
function findUnitCell(unitId) {
    for (const s of spawns) {
        const arr = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
        if (arr.includes(unitId)) return { row: s.row, col: s.col };
    }
    return null;
}
function pickGiantFromPool(type = null) {
    // escludo quelli già attivi in panchina (giantsCatalog)
    const activeIds = new Set(giantsCatalog.map(g => g.id));
    const avail = giantsPool.filter(g => !activeIds.has(g.id) && (!type || g.type === type));
    if (avail.length === 0) return null;
    return avail[Math.floor(Math.random() * avail.length)];
}
function putGiantIntoRoster(giant) {
    // sposta dal pool alla panchina attiva
    const ix = giantsPool.findIndex(g => g.id === giant.id);
    const unit = ix >= 0 ? giantsPool.splice(ix, 1)[0] : { ...giant };
    unit.template = false;
    giantsCatalog.push(unit);
    rebuildUnitIndex();
    renderBenches();
    return unit;
}
function spawnGiantToFieldRandom(unitId) {
    const attempts = 100;
    for (let i = 0; i < attempts; i++) {
        const x = Math.floor(Math.random() * 6); // 0..5
        const y = Math.floor(Math.random() * 6); // 0..5
        const r = x + 2; // 1..6
        const c = y + 1; // 1..6
        const s = getStack(r, c);
        if (s.length < MAX_PER_HEX) {
            removeUnitEverywhere(unitId);
            s.push(unitId);
            setStack(r, c, s);
            renderGrid(grid, ROWS, COLS, spawns);
            return { row: r, col: c };
        }
    }
    return null; // full
}
async function spawnGiant(type = null) {

    const roll20 = Math.floor(Math.random() * 20) + 1;
    const m = MISSION_STATE.missions[MISSION_STATE.curIndex];
    const tipo = type !== null ? type : getSpawnType(roll20, m.spawnRate);
    const pick = pickGiantFromPool(tipo);

    if (!pick) {
        const t = tipo ? `di tipo ${tipo}` : 'disponibile';
        log(`Nessun gigante ${t} nel pool.`, 'warning');
        return false;
    }
    const unit = putGiantIntoRoster(pick);
    const cell = spawnGiantToFieldRandom(unit.id);

    if (cell) {

        if (type === "Mutaforma") {
            const url_mutaform = './assets/sounds/mutaform_sound.mp3';
            gameSoundTrack.background.pause();
            const music = await play(url_mutaform, { loop: true, volume: 1 });
            gameSoundTrack.background = music;
        }

        if (type === "Anomalo") {
            const url_mutaform = './assets/sounds/ape_titan_sound.mp3';
            gameSoundTrack.background.pause();
            const music = await play(url_mutaform, { loop: true, volume: 1 });
            gameSoundTrack.background = music;
        }


        log(`Gigante ${tipo} appare in ${cell.row}-${cell.col}`, 'warning');
        const url = './assets/sounds/flash_effect_sound.mp3';
        await play(url, { loop: false, volume: 1 });
        focusUnitOnField(unit.id);
    } else {
        log('Campo pieno nelle zone consentite. Il gigante è in panchina.', 'warning');
    }
    return true;
}
function renderBenches() {
    renderBenchSection(alliesEl, alliesRoster, ["recruit", "commander"]);
    renderBenchSection(enemiesEl, giantsCatalog, ["enemy"]);
    renderBenchSection(wallsEl, wallsCatalog, ["wall"], /*readOnly*/ true);

    countAlliesEl.textContent = `${alliesRoster.length} unità`;
    countEnemiesEl.textContent = `${giantsCatalog.length} unità`;
    countWallsEl.textContent = `${wallsCatalog.length} mura`;
}
function hpColor(pct) {
    const p = Math.max(0, Math.min(1, pct));
    const hue = Math.round(p * 120);
    const sat = Math.round(40 + 45 * p);
    const lig = Math.round(35 + 15 * p);
    return `hsl(${hue} ${sat}% ${lig}%)`;
}
function applyHpBar(fillEl, unit) {
    const max = unit.hp ?? 1;
    const cur = Math.max(0, Math.min(max, unit.currHp ?? max));
    const pct = cur / max;
    fillEl.style.width = (pct * 100) + "%";
    fillEl.style.backgroundColor = hpColor(pct);
    fillEl.style.filter = `saturate(${0.5 + 0.5 * pct})`;
    fillEl.parentElement.title = `${cur}/${max} HP`;
}
function benchClickFocusAndTop(u, card) {
    const unitId = u.id;
    const cell = findUnitCell(unitId);

    if (cell) {
        // È in campo: porta davanti e seleziona come già fai
        bringToFront(cell, unitId);
        selectedUnitId = unitId;
        renderGrid(grid, ROWS, COLS, spawns);
        renderBenches();

        requestAnimationFrame(() => {
            const content = document.querySelector(`.hex-content[data-unit-id="${CSS.escape(unitId)}"]`);
            if (!content) return;
            const member = content.parentElement;
            const circle = member.querySelector('.hex-circle');
            member.classList.add('is-selected');
            circle.classList.add('focus-ring');
            content.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            setTimeout(() => circle.classList.remove('focus-ring'), 1600);
        });
    } else {
        // NON è in campo: seleziona la card in panchina + tooltip + micro-animazione
        selectedUnitId = unitId;
        renderBenches();

        // Trova la nuova card (re-render) e applica pulse ring all’avatar
        requestAnimationFrame(() => {
            const newCard = document.querySelector(`.unit-card[data-unit-id="${CSS.escape(unitId)}"]`);
            const avatar = newCard?.querySelector('.unit-avatar');
            if (avatar) {
                avatar.classList.add('focus-ring');
                newCard.classList.add('pulse');
                setTimeout(() => {
                    avatar.classList.remove('focus-ring');
                    newCard.classList.remove('pulse');
                }, 1100);
            }
        });

        // Mostra tooltip come prima
        const html = getUnitTooltipHTML(u);
        const rect = card.getBoundingClientRect();
        showTooltip(html, rect.right + 6, rect.top + rect.height / 2);
    }
}

(function injectTouchGuardsCSS() {
    if (document.getElementById('touch-guards-css')) return;
    const css = document.createElement('style');
    css.id = 'touch-guards-css';
    css.textContent = `
    /* niente click/long-press/drag sulle immagini */
    .hex-content img,
    .unit-avatar img,
    .cardmodal__media img{
      pointer-events: none;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
      -webkit-user-drag: none;
    }
  `;
    document.head.appendChild(css);
})();

function renderBenchSection(container, units, acceptRoles, readOnly = false) {
    container.textContent = "";
    units.forEach(u => {
        const card = document.createElement("div");
        card.className = "unit-card";

        card.dataset.role = u.role;
        if (isOnField(u.id)) card.classList.add("is-fielded");
        if (!readOnly) card.draggable = true;
        card.dataset.unitId = u.id;

        const avatar = document.createElement("div");
        avatar.className = "unit-avatar";

        // Colore per bordo card/avatar (riuso palette esistente)
        const colVar = COLOR_VAR[u.color] || '#444';
        card.style.setProperty('--ring', colVar);

        // Stato selezione sulle card della panchina
        if (u.id === selectedUnitId) {
            card.classList.add('is-selected');
        }

        const img = document.createElement("img");
        img.src = u.img;
        img.alt = "";                 // decorativa
        img.draggable = false;
        img.setAttribute('aria-hidden', 'true');               // decorativa
        avatar.appendChild(img);

        const info = document.createElement("div");
        info.className = "unit-info";
        const name = document.createElement("div");
        name.className = "unit-name"; name.textContent = u.name;
        const sub = document.createElement("div");
        sub.className = "unit-sub";
        sub.textContent = (u.role === "recruit") ? "Recluta" :
            (u.role === "commander") ? "Comandante" :
                (u.role === "enemy") ? "Gigante" : "Muro";
        info.append(name, sub);

        const actions = document.createElement("div"); actions.className = "unit-actions";

        /* === Riga HP: - [bar] HP + === */
        const hpRow = document.createElement("div");
        hpRow.className = "hpbar-row";

        /* minus */
        const hpMinus = document.createElement("button");
        hpMinus.className = "btn-mini";
        hpMinus.type = "button";
        hpMinus.title = "-1 HP (Shift -5)";
        hpMinus.textContent = "−";

        /* plus */
        const hpPlus = document.createElement("button");
        hpPlus.className = "btn-mini";
        hpPlus.type = "button";
        hpPlus.title = "+1 HP (Shift +5)";
        hpPlus.textContent = "+";

        /* barra */
        const hpWrap = document.createElement("div");
        hpWrap.className = "hpbar";
        const hpFill = document.createElement("div");
        hpFill.className = "hpbar-fill";
        hpWrap.appendChild(hpFill);
        applyHpBar(hpFill, u);

        /* hp testo a destra */
        const hpRight = document.createElement("span");
        hpRight.className = "hp-inline-right";
        hpRight.textContent = `❤️ ${u.currHp}/${u.hp}`;
        const isWall = u.role === 'wall';
        const isDestroyed = isWall && (u.destroyed || (u.currHp ?? u.hp) <= 0);
        if (isDestroyed) card.classList.add("is-destroyed");
        /* handlers */
        hpMinus.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isWall && isDestroyed) return;
            adjustUnitHp(u.id, e.shiftKey ? -5 : -1);
            hpRight.textContent = `${u.currHp}/${u.hp}`;
            applyHpBar(hpFill, u);
        });
        hpPlus.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isWall && isDestroyed) return;
            adjustUnitHp(u.id, e.shiftKey ? +5 : +1);
            hpRight.textContent = `${u.currHp}/${u.hp}`;
            applyHpBar(hpFill, u);
        });




        // se è muro distrutto, disattiva i controlli HP
        if (isDestroyed) {
            hpMinus.disabled = true;
            hpPlus.disabled = true;
            hpMinus.classList.add('is-disabled');
            hpPlus.classList.add('is-disabled');
        }
        /* monta riga: - [bar] HP + */
        hpRow.append(hpMinus, hpWrap, hpPlus, hpRight);

        /* append nella card: avatar, info, actions (se ti servono), hpRow */
        card.append(avatar, info, actions, hpRow);
        // ===== Bottone Cestino =====
        // Cestino in alto a destra
        if (!readOnly) {
            const trashTop = document.createElement("button");
            trashTop.className = "card-trash";
            trashTop.type = "button";
            trashTop.title = "Elimina";
            trashTop.setAttribute("aria-label", "Elimina");
            trashTop.innerHTML = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 3h6a1 1 0 0 1 1 1v1h3v2h-1v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7H5V5h3V4a1 1 0 0 1 1-1Z" fill="currentColor"/>
    <path d="M9 9v8M12 9v8M15 9v8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`;
            trashTop.addEventListener("click", async (e) => {
                e.preventDefault(); e.stopPropagation();
                card.classList.add('removing');
                const ok = await deleteUnit(u.id);
                if (!ok) card.classList.remove('removing');
            });
            card.appendChild(trashTop);
        }

        // CLICK = focus/porta in cima. LONG-PRESS = tooltip (senza trascinare)
        addLongPress(card, {
            onClick: () => { if (!isDraggingNow) benchClickFocusAndTop(u, card); },
            onLongPress: () => {
                const html = getUnitTooltipHTML(u);
                const rect = card.getBoundingClientRect();
                showTooltip(html, rect.right + 6, rect.top + rect.height / 2);
                // piccolo flash visivo
                card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 450);
            }
        });

        container.appendChild(card);

        card.addEventListener("click", (e) => {
            if (isDraggingNow) return;
            benchClickFocusAndTop(u, card);
        });

        if (!readOnly) {
            card.addEventListener("dragstart", (e) => {
                if (e.target.closest('.btn-detail, .btn-trash')) { e.preventDefault(); return; }
                isDraggingNow = true;
                card.classList.add("dragging");
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("application/json", JSON.stringify({
                    type: "from-bench",
                    unitId: u.id
                }));
            });
            card.addEventListener("dragend", () => {
                isDraggingNow = false;
                card.classList.remove("dragging");
            });
        }
    });

    if (!readOnly) {
        container.addEventListener("dragover", (e) => { e.preventDefault(); container.classList.add("drop-ok"); });
        container.addEventListener("dragleave", () => container.classList.remove("drop-ok"));
        container.addEventListener("drop", (e) => {
            e.preventDefault(); container.classList.remove("drop-ok");
            const raw = e.dataTransfer.getData("application/json"); if (!raw) return;
            let payload; try { payload = JSON.parse(raw); } catch { return; }
            if (payload.type === "from-cell") {
                const unit = unitById.get(payload.unitId);
                if (!unit) return;
                if (!acceptRoles.includes(unit.role)) return;

                const src = getStack(payload.from.row, payload.from.col);
                const idx = src.indexOf(payload.unitId);
                if (idx >= 0) { src.splice(idx, 1); setStack(payload.from.row, payload.from.col, src); }

                selectedUnitId = null;
                renderGrid(grid, ROWS, COLS, spawns);
                renderBenches();
            }
        });
    }
}

/* =======================
   GRIGLIA
   ======================= */

function renderGrid(container, rows = ROWS, cols = COLS, occupancy = []) {
    container.textContent = "";

    const occMap = new Map();
    for (const s of occupancy) {
        const k = keyRC(s.row, s.col);
        const list = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
        if (list.length) occMap.set(k, list);
    }

    for (let r = 1; r <= rows; r++) {
        const rowEl = document.createElement("div");
        rowEl.className = "hex-row";
        rowEl.dataset.row = r;

        for (let c = 1; c <= cols; c++) {
            const stack = occMap.get(keyRC(r, c)) ?? getStack(r, c);
            const hex = createHexagon(r, c, stack);
            rowEl.appendChild(hex);
        }
        container.appendChild(rowEl);
    }
}

/* =======================
   DIMENSIONI & LAYOUT MEMBRI
   ======================= */
function setStackVisuals(hexEl, count) {
    let size;
    if (count <= 1) { size = 82; }
    else if (count === 2) { size = 62; }
    else if (count === 3) { size = 58; }
    else if (count <= 8) { size = 52; }
    else { size = 48; }
    hexEl.style.setProperty('--member-size', `${size}px`);
}

function layoutMembers(hex, members, totalCount) {
    const n = members.length;
    const hexW = 100, hexH = 110;
    const ms = parseFloat(getComputedStyle(hex).getPropertyValue('--member-size')) || 60;
    const padding = 6;
    const maxR = Math.min(hexW, hexH) / 2 - ms / 2 - padding;

    const place = (m, dx, dy) => { m.style.transform = `translate(-50%,-50%) translate(${dx}px, ${dy}px)`; };

    if (totalCount <= 1) { members.forEach(m => place(m, 0, 0)); return; }
    if (totalCount === 2) {
        const r = Math.max(8, maxR * 0.28);
        place(members[0], -r, 0);
        place(members[1], r, 0);
        return;
    }
    if (totalCount === 3) {
        const r = Math.max(10, maxR * 0.32);
        place(members[0], -r, r * 0.35);
        place(members[1], r, r * 0.35);
        place(members[2], 0, -r * 0.55);
        return;
    }
    const count = n;
    const radius = Math.max(10, maxR);
    for (let i = 0; i < count; i++) {
        const theta = (2 * Math.PI * i / count) - Math.PI / 2;
        const dx = Math.cos(theta) * radius;
        const dy = Math.sin(theta) * radius;
        place(members[i], dx, dy);
    }
}

/* =======================
   CREATE HEX
   ======================= */
function createHexagon(row, col, unitIds = []) {
    const hex = document.createElement("div");
    hex.className = "hexagon";
    hex.dataset.row = row; hex.dataset.col = col;
    if (row === 1) hex.setAttribute("data-color", "blu");
    if (row === 8 || row === 9) hex.setAttribute("data-color", "gray");
    if (row === 10 || row === 11 || row === 12) hex.setAttribute("data-color", "silver");

    const allUnits = unitIds.map(id => unitById.get(id)).filter(Boolean);
    const overflow = Math.max(0, allUnits.length - DISPLAY_LIMIT);
    const visibleUnits = overflow > 0 ? allUnits.slice(-DISPLAY_LIMIT) : allUnits;

    setStackVisuals(hex, allUnits.length);

    if (visibleUnits.length === 0) {
        hex.classList.add("is-empty");
    } else {
        const stackEl = document.createElement("div");
        stackEl.className = "hex-stack";

        const members = visibleUnits.map((unit, i) => {
            const member = document.createElement("div");
            member.className = "hex-member";
            member.style.setProperty("--i", i);

            const content = document.createElement("div");
            content.className = "hex-content";
            content.draggable = true;
            content.dataset.unitId = unit.id;
            content.dataset.stackIndex = String(i);

            const circle = document.createElement("div");
            circle.className = "hex-circle";
            const img = document.createElement("img");
            img.src = unit.img;
            img.alt = "";                 // decorativa
            img.draggable = false;
            img.setAttribute('aria-hidden', 'true');
            circle.appendChild(img);

            content.appendChild(circle);
            member.appendChild(content);
            stackEl.appendChild(member);

            const colVar = COLOR_VAR[unit.color] || '#fff';
            member.style.setProperty('--sel', colVar);
            if (unit.id === selectedUnitId) { member.classList.add('is-selected'); }


            // Long-press sul membro in campo: mostra tooltip; click breve = focus + bringToFront
            addLongPress(member, {
                onClick: (e) => {
                    selectedUnitId = unit.id;
                    bringToFront({ row, col }, unit.id);
                    renderGrid(grid, 12, 6, spawns);
                    // NOVITÀ: evidenzia anche la card in panchina
                    focusBenchCard(unit.id, { scroll: true, pulse: true });
                },
                onLongPress: (e) => {
                    selectedUnitId = unit.id;
                    const html = getUnitTooltipHTML(unit);
                    showTooltip(html, e.clientX, e.clientY);
                }
            });

            content.addEventListener("dragstart", (e) => {
                selectedUnitId = unit.id;
                member.classList.add('is-selected');
                content.classList.add("dragging");
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("application/json", JSON.stringify({
                    type: "from-cell",
                    unitId: unit.id,
                    from: { row, col, stackIndex: i }
                }));
            });
            content.addEventListener("dragend", () => content.classList.remove("dragging"));

            return member;
        });

        layoutMembers(hex, members, allUnits.length);
        hex.appendChild(stackEl);
    }

    hex.addEventListener("dragover", (e) => { e.preventDefault(); hex.classList.add("drop-ok"); });
    hex.addEventListener("dragleave", () => hex.classList.remove("drop-ok"));
    hex.addEventListener("drop", (e) => {
        e.preventDefault(); hex.classList.remove("drop-ok");
        const raw = e.dataTransfer.getData("application/json"); if (!raw) return;
        let payload; try { payload = JSON.parse(raw); } catch { return; }
        handleDrop(payload, { row, col });
    });

    hex.addEventListener("click", () => {
        selectedUnitId = null;
        document.querySelectorAll('.hex-member.is-selected').forEach(el => el.classList.remove('is-selected'));
        hideTooltip();
    });

    return hex;
}
function hasWallInCell(r, c) {
    const stack = getStack(r, c);
    return stack.some(id => (unitById.get(id)?.role === 'wall'));
}
const sameCell = (a, b) => a && b && a.row === b.row && a.col === b.col;
/** Ritorna true se l'unità è già nello stack della cella target ({row,col}). */
const sameId = (unitId, target) => {
    if (!target || target.row == null || target.col == null) return false;
    const wanted = String(unitId);
    const stack = getStack(+target.row, +target.col); // array di id in quella cella
    return stack.some(id => String(id) === wanted);
};

/* =======================
   DROP LOGIC
   ======================= */
function handleDrop(payload, target) {
    // blocca drop se nella cella target c'è una Muraglia
    if (hasWallInCell(target.row, target.col)) return;
    if (payload.type === "from-bench") {
        // stesso esagono → non spostare né duplicare    
        if (sameId(payload.unitId, target)) {
            renderGrid(grid, ROWS, COLS, spawns);
            return;
        }
        placeFromBench(target, payload.unitId);
        renderGrid(grid, ROWS, COLS, spawns);
    } else if (payload.type === "from-cell") {
        const u = unitById.get(payload.unitId);
        if (u?.role === 'wall') return;
        moveOneUnitBetweenStacks(payload.from, target, payload.unitId);
        renderGrid(grid, ROWS, COLS, spawns);
        renderBenches();
    }
}

function placeFromBench(target, unitId) {
    if (hasWallInCell(target.row, target.col)) return;
    const unit = unitById.get(unitId);
    if (unit?.role === 'wall') return; // i muri non si piazzano sul campo

    const tgt = getStack(target.row, target.col);
    if (tgt.length >= MAX_PER_HEX) return;

    removeUnitEverywhere(unitId);
    tgt.push(unitId);
    selectedUnitId = unitId;
    setStack(target.row, target.col, tgt);
    renderBenches();
}

function moveOneUnitBetweenStacks(from, to, unitId) {
    if (hasWallInCell(to.row, to.col)) return;
    // se per qualsiasi motivo source/target coincidono, non fare nulla
    //if (sameCell(from, to)) return;
    const src = getStack(from.row, from.col);
    const idx = src.indexOf(unitId);
    if (idx < 0) return;
    src.splice(idx, 1);
    setStack(from.row, from.col, src);

    const tgt = getStack(to.row, to.col);
    if (tgt.length >= MAX_PER_HEX) {
        src.splice(Math.min(idx, src.length), 0, unitId);
        setStack(from.row, from.col, src);
        return;
    }
    tgt.push(unitId);
    selectedUnitId = unitId;
    setStack(to.row, to.col, tgt);
}

/* =======================
   FOCUS
   ======================= */
function focusUnitOnField(unitId) {
    const cell = findUnitCell(unitId);
    if (!cell) return;

    bringToFront(cell, unitId);
    selectedUnitId = unitId;
    renderGrid(grid, 12, 6, spawns);
    renderBenches();

    requestAnimationFrame(() => {
        const content = document.querySelector(`.hex-content[data-unit-id="${CSS.escape(unitId)}"]`);
        if (!content) return;
        const member = content.parentElement;
        const circle = member.querySelector('.hex-circle');
        member.classList.add('is-selected');
        circle.classList.add('focus-ring');
        content.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        setTimeout(() => circle.classList.remove('focus-ring'), 1600);
    });
}
function focusBenchCard(unitId, { scroll = true, pulse = true } = {}) {
    // marca come selezionato e ridisegna panchine
    selectedUnitId = unitId;
    renderBenches();

    // dopo il render, applica pulse e porta in vista
    requestAnimationFrame(() => {
        const sel = `.unit-card[data-unit-id="${CSS.escape(unitId)}"]`;
        const card = document.querySelector(sel);
        if (!card) return;

        card.classList.add('is-selected');
        if (scroll) card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

        const avatar = card.querySelector('.unit-avatar');
        if (pulse) {
            card.classList.add('pulse');
            avatar?.classList.add('focus-ring');
            setTimeout(() => {
                card.classList.remove('pulse');
                avatar?.classList.remove('focus-ring');
            }, 1200);
        }
    });
}

/* =======================
   TOOLTIP
   ======================= */
function getUnitTooltipHTML(unit) {
    const role = unit.role ?? "recruit";
    const name = unit.name ?? "Unità";
    const sub = unit.subtitle ?? (
        role === "recruit" ? "Recluta" :
            role === "commander" ? "Comandante" :
                role === "enemy" ? "Gigante" : "Muro"
    );

    const max = unit.hp ?? 0;
    const hp = Math.min(max, Math.max(0, unit.currHp ?? max));
    const hpPct = max > 0 ? Math.round((hp / max) * 100) : 0;

    const atk = unit.atk ?? "—";
    const tec = unit.tec ?? "—";         // per reclute/commanders
    const agi = unit.agi ?? "—";         // per reclute/commanders
    const cd = unit.cd ?? "—";         // per giganti

    const img = unit.img ?? "";
    const abi = (unit.abi ?? "").toString();

    // blocco statistiche condizionale
    const statsForRole = (role === "enemy")
        ? `<div class="tt-stats">
    <div class="tt-row">
      <div class="tt-label">ATK</div><div class="tt-value">${atk}</div>
      <div class="tt-label">CD</div><div class="tt-value">${cd}</div>
    </div></div>
  `
        : (role !== "wall") ? `<div class="tt-stats">
    <div class="tt-row">
      <div class="tt-label">ATK</div><div class="tt-value">${atk}</div>
      <div class="tt-label">TEC</div><div class="tt-value">${tec}</div>
      <div class="tt-label">AGI</div><div class="tt-value">${agi}</div>
    </div></div>
  ` : '';

    return `
    <div class="tt-card" data-role="${role}">
      <div class="tt-avatar">
        <img src="${img}" alt="${name}">
      </div>

      <div class="tt-title">${name}</div>
      <div class="tt-badge">${sub}</div>

      <div class="tt-hp">
        <div class="tt-hp-top"><span>HP</span><span>${hp}/${max} (${hpPct}%)</span></div>
        <div class="tt-hpbar"><div class="tt-hpfill" style="width:${hpPct}%;"></div></div>
      </div>

        ${statsForRole}
      

      ${abi
            ? `<div class="tt-ability" data-collapsed="false">
             <span class="tt-label">ABILITÀ</span>
             <div class="tt-ability-text">${abi.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
           </div>`
            : ``}
    </div>
  `;
}

tooltipEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-hp-delta]');
    if (!btn) return;
    const actions = e.target.closest('.tt-actions');
    const uid = actions?.dataset.uid || selectedUnitId;
    if (!uid) return;
    const delta = btn.dataset.hpDelta === '+1' ? 1 : -1;
    const realDelta = e.shiftKey ? delta * 5 : delta;
    adjustUnitHp(uid, realDelta);
    // Aggiorna solo il numerino inline senza ridisegnare tutto
    const u = unitById.get(uid);
    const span = actions.querySelector('.hp-num');
    if (u && span) span.textContent = `${u.currHp}/${u.hp}`;
});


function showTooltip(html, x, y) {
    tooltipEl.innerHTML = html;
    tooltipEl.style.display = "block";
    _lastTooltipXY = { x, y };
    positionTooltip(x, y);
}
function hideTooltip() { tooltipEl.style.display = "none"; }
function positionTooltip(mouseX, mouseY) {
    const offset = 14; const { innerWidth: vw, innerHeight: vh } = window;
    const rect = tooltipEl.getBoundingClientRect();
    let left = mouseX + offset, top = mouseY + offset;
    if (left + rect.width > vw) left = mouseX - rect.width - offset;
    if (top + rect.height > vh) top = mouseY - rect.height - offset;
    tooltipEl.style.left = left + "px"; tooltipEl.style.top = top + "px";
}

document.addEventListener('click', (e) => {
    if (
        !e.target.closest('.hex-member') &&
        !e.target.closest('.btn-icon') &&
        !e.target.closest('.unit-card')    // <— aggiungi panchina
    ) {
        selectedUnitId = null;
        hideTooltip();
        renderGrid(grid, ROWS, COLS, spawns); // rimuove highlight in campo
        renderBenches();                      // rimuove highlight in panchina
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideTooltip(); selectedUnitId = null; renderGrid(grid, 12, 6, spawns);
        closeAllFabs();
    }
});

/* =======================
   HEADER CONTROLS: Missione, Morale, XP, Timer, Reset
   ======================= */

// Reset partita (in header)
btnReset.addEventListener('click', async () => {
    const ok = await confirmDialog({
        title: 'Reset Partita',
        message: 'Sei sicuro di voler resettare la partita?',
        confirmText: 'Resetta',
        cancelText: 'Annulla',
        danger: true
    });
    if (ok) resetGame();
});

/* =======================
   Mission card click (placeholder azione)
   ======================= */
missionCard.addEventListener('click', async () => {
    const ok = await openDialog({
        title: `Completare la Missione #${MISSION_STATE.curIndex + 1}?`,
        message: `
     
      <p>Confermi il completamento della missione corrente?</p>
    `,
        confirmText: 'Completa',
        cancelText: 'Annulla',
        danger: true,         // metti true se vuoi il bottone rosso
        cancellable: true
    });

    if (!ok) return;

    completeMission();       // tua funzione esistente
});


missionCard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); missionCard.click(); }
});

/* =======================
   SPAWN / EVENTI / ARRUOLA
   ======================= */

function flash(el) {
    const old = el.style.boxShadow;
    el.style.boxShadow = '0 0 0 3px rgba(255,255,255,.25) inset, 0 0 18px rgba(255,0,0,.45)';
    setTimeout(() => el.style.boxShadow = old, 260);
}
function getSpawnType(roll, spawnRate) {
    for (const [tipo, range] of Object.entries(spawnRate)) {
        if (roll >= range.min && roll <= range.max) {
            return tipo;
        }
    }
    return null; // nessuna corrispondenza
}

function closeAllFabs() { fabs.forEach(f => { f.classList.remove('open'); f.setAttribute('aria-expanded', 'false'); }); }

fabs.forEach(fab => {
    const mainBtn = fab.querySelector('.fab-main');
    mainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !fab.classList.contains('open');
        closeAllFabs();
        fab.classList.toggle('open', willOpen);
        fab.setAttribute('aria-expanded', String(willOpen));
    });
});

document.addEventListener('click', (e) => { if (!e.target.closest('.fab')) closeAllFabs(); });

document.querySelectorAll('#fab-spawn .fab-option').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const type = btn.dataset.type; // "Casuale" | "Puro" | "Anomalo" | "Mutaforma"
        let ok = false;
        if (type === 'Casuale') ok = await spawnGiant();
        else ok = await spawnGiant(type);
        if (!ok) {
            const anchor = document.querySelector('#fab-spawn .fab-main');
            flash(anchor);
        }
        closeAllFabs();
    });
});

document.querySelectorAll('#fab-event .fab-option').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const t = btn.dataset.ev; // "evento" | "consumabile"

        if (t === 'reshuffle') {
            // RIMESCOLA SCARTI (tutti i mazzi) dal FAB “Carte”          
            reshuffleAllDiscards();
            closeAllFabs();
            return;
        }

        const type = (t === 'evento') ? 'event' : 'consumable';
        const card = drawCard(type);

        if (!card) {
            log('Il mazzo è vuoto. Rimescola gli scarti o ricarica le carte.', 'warning');
            closeAllFabs();
            return;
        }

        log(`Pescata carta ${t}: "${card.name}".`);
        const act = await showCardPopup(type, card);
        if (act) applyCardAction(type, card, act);

        closeAllFabs();
    });
});


function completeMission() {
    stopTimer();
    log(`Missione #${MISSION_STATE.curIndex + 1} completata!`, 'success');
    const m = MISSION_STATE.missions[MISSION_STATE.curIndex];
    const reward = m?.reward ?? { morale: 0, xp: 0 };
    addMorale(reward.morale);
    addXP(reward?.xp)
    setMissionByIndex(MISSION_STATE.curIndex + 1);
}

/* =======================
   LOG & DADI (inline result)
   ======================= */
function log(msg, type = 'info') {
    const now = new Date();
    const hhmm = now.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
    });
    const message = `[${hhmm}] - ${msg}`
    log_list.push({ message, type });
    window.snackbar(msg, {}, type);
    renderLogs();
    scheduleSave();
}


function rollAnimText(txt) {
    diceRes.innerHTML = `<span class="roll">${txt}</span>`;
}

document.getElementById('roll-d20').addEventListener('click', () => {
    const n = 1 + Math.floor(Math.random() * 20); rollAnimText('d20 → ' + n);
});
document.getElementById('roll-d4').addEventListener('click', () => {
    const n = 1 + Math.floor(Math.random() * 4); rollAnimText('d4  → ' + n);
});

/* ======================= LONG PRESS UTILS ======================= */

function addLongPress(el, { onLongPress, onClick }) {
    let t = null, fired = false, startX = 0, startY = 0, pointerId = null;

    const isInteractive = (target) =>
        target.closest('button, a, input, textarea, select, .btn-icon');

    const clear = () => { if (t) { clearTimeout(t); t = null; } };

    el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;              // solo click primario
        if (isInteractive(e.target)) return;     // NON partire su controlli
        fired = false;
        startX = e.clientX; startY = e.clientY;
        pointerId = e.pointerId;
        el.setPointerCapture?.(pointerId);
        t = setTimeout(() => { fired = true; onLongPress?.(e); }, LONG_PRESS_MS);
    });

    el.addEventListener('pointermove', (e) => {
        if (Math.abs(e.clientX - startX) > 6 || Math.abs(e.clientY - startY) > 6) clear();
    });

    el.addEventListener('pointerup', (e) => {
        pointerId = e.pointerId;
        el.releasePointerCapture?.(pointerId);
        if (t && !fired && !isInteractive(e.target)) onClick?.(e);
        clear();
    });

    el.addEventListener('pointercancel', clear);
}


function ensureModal() {
    if (_modalEls) return _modalEls;
    const backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div'); modal.className = 'modal';
    modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title" id="dlg-title"></div>
      <button class="modal-close" id="dlg-close" type="button" aria-label="Chiudi">×</button>
    </div>
    <div class="modal-body" id="dlg-msg"></div>
    <div class="modal-actions">
      <button class="modal-btn" id="dlg-cancel">Annulla</button>
      <button class="modal-btn danger" id="dlg-confirm">Conferma</button>
    </div>
  `;
    document.body.append(backdrop, modal);
    _modalEls = {
        backdrop, modal,
        title: modal.querySelector('#dlg-title'),
        msg: modal.querySelector('#dlg-msg'),
        btnCancel: modal.querySelector('#dlg-cancel'),
        btnConfirm: modal.querySelector('#dlg-confirm'),
        btnClose: modal.querySelector('#dlg-close'),
    };
    return _modalEls;
}

/* pulizia sicura azioni */
function resetModalActions() {
    const { modal, btnCancel, btnConfirm } = ensureModal();
    const actions = modal.querySelector('.modal-actions');
    actions.querySelector('.card-actions')?.remove(); // rimuovi blocco temporaneo
    btnCancel.classList.remove('is-hidden');
    btnConfirm.classList.remove('is-hidden');
}
function setStandardActions({ confirmText = 'OK', cancelText = 'Annulla', danger = false, cancellable = true } = {}) {
    const { btnCancel, btnConfirm, btnClose } = ensureModal();
    resetModalActions();
    btnConfirm.textContent = confirmText;
    btnConfirm.classList.toggle('danger', !!danger);
    btnCancel.textContent = cancelText;
    btnCancel.style.display = cancellabile(cancellable);
    btnClose.style.display = cancellabile(cancellable);
}
const cancellabile = (c) => c ? '' : 'none';

function openDialog({ title, message, confirmText = 'OK', cancelText = 'Annulla', danger = false, cancellable = true }) {
    const { backdrop, modal, title: ttl, msg, btnCancel, btnConfirm, btnClose } = ensureModal();
    ttl.textContent = title || '';
    msg.innerHTML = message || '';
    setStandardActions({ confirmText, cancelText, danger, cancellable });

    return new Promise((resolve) => {
        const close = (ok) => {
            backdrop.classList.remove('show'); modal.classList.remove('show');
            setTimeout(() => resolve(ok), 100);
            document.removeEventListener('keydown', onKey);
            btnCancel.onclick = btnConfirm.onclick = btnClose.onclick = null;
            resetModalActions(); // ripristina SEMPRE
        };
        const onKey = (e) => {
            if (e.key === 'Escape' && cancellable) close(false);
            if (e.key === 'Enter') close(true);
        };
        document.addEventListener('keydown', onKey);
        btnCancel.onclick = () => close(false);
        btnConfirm.onclick = () => close(true);
        btnClose.onclick = () => close(false);

        requestAnimationFrame(() => {
            backdrop.classList.add('show'); modal.classList.add('show');
        });
    });
}
function confirmDialog(opts) { return openDialog({ ...opts, cancellable: true }); }

// --- una volta sola: stile per la chip ---
(function injectCardChipCSS() {
    if (document.getElementById('card-chip-css')) return;
    const css = document.createElement('style');
    css.id = 'card-chip-css';
    css.textContent = `
    #dlg-title { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .card-chip{
      --chip-color: var(--blu);
      display:inline-flex; align-items:center; gap:6px;
      padding:2px 8px; border-radius:999px;
      font-size:12px; line-height:1; font-weight:600;
      border:1px solid currentColor; color: var(--blu);
      background: color-mix(in srgb, var(--chip-color) 16%, transparent);
    }
    .card-chip::before{
      content:""; width:8px; height:8px; border-radius:50%;
      background: var(--chip-color);
    }
    /* mapping colori */
    .card-chip--event     { --chip-color: var(--blu);     color: var(--blu); }
    .card-chip--spawn     { --chip-color: var(--oro);     color: var(--oro); }
    .card-chip--malus     { --chip-color: var(--rosso);   color: var(--rosso); }
    .card-chip--bonus     { --chip-color: var(--verde);   color: var(--verde); }
    .card-chip--consumable{ --chip-color: var(--argento); color: var(--argento); }
  `;
    document.head.appendChild(css);
})();

async function showCardPopup(deckType, card) {
    const url = deckType === 'consumable' ? './assets/sounds/carte/carta_consumabile.mp3' : './assets/sounds/carte/carta_evento.mp3';
    await play(url, { loop: false, volume: 1 });


    const { backdrop, modal, title, msg, btnClose, btnCancel, btnConfirm } = ensureModal();

    // --- prepara chip tipo carta ---
    const rawKind = String(card.type || '').toLowerCase();
    const known = new Set(['spawn', 'event', 'malus', 'bonus']);
    const kind = known.has(rawKind) ? rawKind : (deckType === 'consumable' ? 'consumable' : 'event');
    const label =
        kind === 'spawn' ? 'Spawn' :
            kind === 'malus' ? 'Malus' :
                kind === 'bonus' ? 'Bonus' :
                    kind === 'consumable' ? 'Consumabile' : 'Evento';

    // header: titolo + chip
    title.textContent = card.name || 'Carta';
    const chip = document.createElement('span');
    chip.className = `card-chip card-chip--${kind}`;
    chip.setAttribute('aria-label', `Tipo: ${label}`);
    chip.textContent = label;
    title.appendChild(chip);

    // corpo
    msg.innerHTML = `
    <div class="cardmodal">
      <div class="cardmodal__media">
        <img src="${card.img || ''}" alt="${card.name || 'Carta'}" onerror="this.style.display='none'">
      </div>
      <div class="cardmodal__desc">${card.desc || ''}</div>
    </div>
  `;

    // Nascondi i bottoni standard e aggiungi le azioni temporanee
    btnCancel.classList.add('is-hidden');
    btnConfirm.classList.add('is-hidden');

    const actions = modal.querySelector('.modal-actions');
    actions.querySelector('.card-actions')?.remove();
    const temp = document.createElement('div');
    temp.className = 'card-actions';
    temp.innerHTML = `
    <button class="modal-btn" data-act="discard">Scarta</button>
    <button class="modal-btn rimescola" data-act="reshuffle">Rimescola</button>
    <button class="modal-btn danger" data-act="remove">Rimuovi</button>
  `;
    actions.appendChild(temp);

    // la X è sempre visibile
    btnClose.style.display = '';

    return new Promise(resolve => {
        const cleanup = () => {
            actions.querySelector('.card-actions')?.remove();
            btnCancel.classList.remove('is-hidden');
            btnConfirm.classList.remove('is-hidden');
            btnClose.onclick = null;
            actions.removeEventListener('click', onClick);
            document.removeEventListener('keydown', onKey);
        };
        const close = (result) => {
            backdrop.classList.remove('show'); modal.classList.remove('show');
            setTimeout(() => { cleanup(); resolve(result); }, 100);
        };
        const onKey = (e) => { if (e.key === 'Escape') close(null); };
        const onClick = (e) => {
            const b = e.target.closest('button[data-act]');
            if (b) close(b.dataset.act);
        };

        document.addEventListener('keydown', onKey);
        actions.addEventListener('click', onClick);
        btnClose.onclick = () => close(null);

        requestAnimationFrame(() => {
            backdrop.classList.add('show'); modal.classList.add('show');
        });
    });
}

function adjustUnitHp(unitId, delta) {
    const u = unitById.get(unitId);
    if (!u) return;
    const max = u.hp ?? 1;
    const cur = (u.currHp ?? max) + delta;
    window.setUnitHp(unitId, Math.max(0, Math.min(max, cur)));
}

/* =======================
   API: set HP a runtime
   ======================= */
window.setUnitHp = function (unitId, newHp) {
    const u = unitById.get(unitId);
    if (!u) return;

    // muro distrutto: niente riparazioni
    if (u.role === 'wall' && u.destroyed) {
        return;
    }
    const clamped = Math.max(0, Math.min(u.hp ?? newHp, newHp));
    const was = u.currHp ?? u.hp;
    u.currHp = clamped;

    // Se è alleato e scende a 0 → morte
    if ((u.role === 'recruit' || u.role === 'commander') && clamped === 0) {
        handleAllyDeath(u);
        return; // già refreshato tutto
    }
    // Morte giganti
    if (u.role === 'enemy' && clamped === 0) {
        handleGiantDeath(u);
        return; // UI già aggiornata
    }

    // Morte MURA → rimuovi tutta la riga
    if (u.role === 'wall' && clamped === 0) {
        handleWallDeath(u);
        return;
    }

    scheduleSave();
    renderBenches();
    renderGrid(grid, 12, 6, spawns);
};

/* Elimina unità (da panchina e campo) */
async function deleteUnit(unitId) {

    const u = unitById.get(unitId);
    if (!u) return false;
    if (u.role === 'wall') {
        return false;
    }

    const name = u.name || 'Unità';
    const ok = await confirmDialog({
        title: 'Elimina unità',
        message: `Eliminare definitivamente “${name}”?`,
        confirmText: 'Elimina',
        cancelText: 'Annulla',
        danger: true
    });
    if (!ok) return false;

    // 1) Togli dal campo
    removeUnitEverywhere(unitId);
    // 2) Togli dai cataloghi

    if (u.role === 'recruit' || u.role === 'commander') {
        // rimuovi dal ROSTER
        const i = alliesRoster.findIndex(x => x.id === unitId);
        if (i >= 0) {
            const removed = alliesRoster.splice(i, 1)[0];
            // torna nel POOL con gli HP aggiornati
            const back = { ...removed, template: true }; // torna “template: true”
            alliesPool.push(back);
        }
    } else if (u.role === 'enemy') {
        // rimuovi dal ROSTER attivo
        const i = giantsCatalog.findIndex(x => x.id === unitId);
        if (i >= 0) {
            const removed = giantsCatalog.splice(i, 1)[0];
            // torna nel POOL (di default a FULL HP)
            const back = { ...removed, template: true, currHp: removed.hp };
            giantsPool.push(back);
        }
    }

    // 3) Map globale
    unitById.delete(unitId);
    // Se elimino un CLONE alleato, salvo gli HP nel suo template per il prossimo arruolo
    if ((u.role === 'recruit' || u.role === 'commander') && isClone(u) && u.baseId) {
        baseHpOverride.set(u.baseId, u.currHp ?? u.hp);
    }
    // 4) UI
    if (selectedUnitId === unitId) selectedUnitId = null;
    rebuildUnitIndex();
    renderBenches();
    renderGrid(grid, 12, 6, spawns);
    // 5) Log
    log(`Rimossa unità: ${name}.`);
    scheduleSave();
    return true;
}

ensureModal().backdrop.addEventListener('click', () => {
    // noop: gestito in openDialog (per semplicità potresti non abilitarlo
    // per evitare chiusure accidentali). Se lo vuoi, serve wiring interno.
});

function handleWallDeath(wallUnit) {
    // segna lo stato "distrutta"
    wallUnit.currHp = 0;
    wallUnit.destroyed = true;

    // individua la/e righe da rimuovere
    const rows = [];
    const mapped = ROW_BY_WALL_ID[wallUnit.id];
    if (mapped) rows.push(mapped);
    for (const s of spawns) {
        const arr = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
        if (arr.includes(wallUnit.id) && !rows.includes(s.row)) rows.push(s.row);
    }

    // rimuovi tutte le entry della/e riga/righe trovate
    for (let i = spawns.length - 1; i >= 0; i--) {
        if (rows.includes(spawns[i].row)) spawns.splice(i, 1);
    }
    renderGrid(grid, 12, 6, spawns);
    renderBenches();
    log(`${wallUnit.name} è stato distrutto!`, 'error');
    scheduleSave();
}

function handleGiantDeath(unit) {
    // 1) rimuovi dal campo
    removeUnitEverywhere(unit.id);

    // 2) rimuovi dalla panchina attiva (roster giganti)
    const i = giantsCatalog.findIndex(g => g.id === unit.id);
    if (i >= 0) giantsCatalog.splice(i, 1);

    // 3) NON rimettere nel pool: il gigante è “consumato”
    // (quindi niente push in giantsPool)

    // 4) UI + log
    rebuildUnitIndex();
    renderBenches();
    renderGrid(grid, 12, 6, spawns);
    log(`${unit.name} è morto.`, 'success');
    scheduleSave();
}

function handleAllyDeath(unit) {
    // rimuovi da campo
    removeUnitEverywhere(unit.id);
    // rimuovi da roster
    const i = alliesRoster.findIndex(a => a.id === unit.id);
    if (i >= 0) alliesRoster.splice(i, 1);
    // torna nel pool come morto
    const back = { ...unit, template: true, dead: true, currHp: 0 };
    // se già esiste nel pool con stesso id, aggiorna, altrimenti push
    const j = alliesPool.findIndex(a => a.id === back.id);
    if (j >= 0) alliesPool[j] = back; else alliesPool.push(back);

    rebuildUnitIndex();
    renderBenches();
    renderGrid(grid, 12, 6, spawns);
    log(`${unit.name} è morto/a.`, 'error');
    scheduleSave();
}

function resurrectInPool(id) {
    const u = alliesPool.find(a => a.id === id);
    if (!u) return false;
    u.dead = false;
    u.currHp = u.hp; // full heal; se preferisci metà vita, metti Math.ceil(u.hp/2)
    scheduleSave();
    return true;
}

function applyClasses() {
    // calcola lo stato dal dataset degli elementi
    const L = leftEl.classList.contains('collapsed');
    const R = rightEl.classList.contains('collapsed');
    document.body.classList.toggle('collapse-left', L && !R);
    document.body.classList.toggle('collapse-right', R && !L);
    document.body.classList.toggle('collapse-both', L && R);

    btnL.setAttribute('aria-expanded', String(!L));
    btnR.setAttribute('aria-expanded', String(!R));
    btnL.textContent = L ? '⟩' : '⟨';
    btnR.textContent = R ? '⟨' : '⟩';
}

function setCollapsed(side, collapsed, manual = true) {
    if (side === 'left') {
        leftEl.classList.toggle('collapsed', collapsed);
    } else {
        rightEl.classList.toggle('collapsed', collapsed);
    }
    if (manual) {
        document.body.classList.add('manual-layout'); // blocca auto-resize fino a reload
        // persisti preferenza
        localStorage.setItem('aotLayout', JSON.stringify({
            left: leftEl.classList.contains('collapsed'),
            right: rightEl.classList.contains('collapsed')
        }));
    }
    applyClasses();
}

// Toggle via maniglie
btnL.addEventListener('click', () => {
    setCollapsed('left', !leftEl.classList.contains('collapsed'), true);
});
btnR.addEventListener('click', () => {
    setCollapsed('right', !rightEl.classList.contains('collapsed'), true);
});

// Click sull’area collassata riapre (UX comodo)
leftEl.addEventListener('click', (e) => {
    if (leftEl.classList.contains('collapsed')) setCollapsed('left', false, true);
});
rightEl.addEventListener('click', (e) => {
    if (rightEl.classList.contains('collapsed')) setCollapsed('right', false, true);
});

// Ripristina preferenza utente (se esiste)
function restoreLayout() {
    const saved = localStorage.getItem('aotLayout');
    if (saved) {
        const st = JSON.parse(saved);
        leftEl.classList.toggle('collapsed', !!st.left);
        rightEl.classList.toggle('collapsed', !!st.right);
        document.body.classList.add('manual-layout');
        applyClasses();
    } else {
        // Auto-collapse iniziale in base alla larghezza
        const w = window.innerWidth;
        if (w <= 900) {
            leftEl.classList.add('collapsed');
            rightEl.classList.add('collapsed');
        } else if (w <= 1200) {
            rightEl.classList.add('collapsed');
        }
        applyClasses();
    }
};

// Aggiorna lo stato quando la finestra cambia (solo se non manuale)
window.addEventListener('resize', () => {
    if (document.body.classList.contains('manual-layout')) return;
    const w = window.innerWidth;
    leftEl.classList.toggle('collapsed', w <= 900);
    rightEl.classList.toggle('collapsed', w <= 1200);
    applyClasses();
});

function createSnack({ message, type = 'info', duration = 3000, actionText = null, onAction = null }) {
    const el = document.createElement('div');
    el.className = `snackbar snackbar--${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const icon = document.createElement('span');
    icon.className = 'snackbar__icon';
    icon.textContent = '🔔';

    const msg = document.createElement('div');
    msg.className = 'snackbar__msg';
    msg.textContent = message;

    const close = document.createElement('button');
    close.className = 'snackbar__close';
    close.type = 'button';
    close.title = 'Chiudi';
    close.setAttribute('aria-label', 'Chiudi');
    close.textContent = '×';

    el.append(icon, msg);

    let acted = false;

    if (actionText) {
        const actionBtn = document.createElement('button');
        actionBtn.className = 'snackbar__action';
        actionBtn.type = 'button';
        actionBtn.textContent = actionText;
        actionBtn.addEventListener('click', () => {
            acted = true;
            try { onAction && onAction(); } catch (e) { console.error(e); }
            dismiss(el);
        });
        el.appendChild(actionBtn);
    }

    el.appendChild(close);

    function dismiss(target) {
        target.style.animation = 'sb-exit .14s ease-in forwards';
        setTimeout(() => {
            region.removeChild(target);
            showing = false;
            showNext();
        }, 140);
        // rimuove handler ESC
        window.removeEventListener('keydown', onEsc);
    }

    const onEsc = (ev) => {
        if (ev.key === 'Escape') dismiss(el);
    };

    close.addEventListener('click', () => dismiss(el));

    // Auto-dismiss solo se non c'è action o se non è stato cliccato
    const t = setTimeout(() => { if (!acted) dismiss(el); }, duration);

    // Pausa timer su hover
    let remaining = duration, start;
    el.addEventListener('mouseenter', () => { clearTimeout(t); remaining -= (Date.now() - start || 0); });
    el.addEventListener('mouseleave', () => { start = Date.now(); setTimeout(() => { if (!acted) dismiss(el); }, remaining); });

    // Abilita ESC
    window.addEventListener('keydown', onEsc);

    return el;
}

function showNext() {
    //if (showing) return;
    const item = queue.shift();
    if (!item) return;
    showing = true;
    const el = createSnack(item);
    region.appendChild(el);
}

function enqueue(opts) {
    queue.push(opts);
    showNext();
}

// API pubblica
window.snackbar = function (message, options = {}, type = 'success') {
    const { duration = 3000, actionText = null, onAction = null } = options;
    enqueue({ message, type, duration, actionText, onAction });
};

/* =========================================================
   ARRUOLO: PICKER DIALOG (multi-selezione con ricerca)
   Usa la tua ensureModal() per mostrare un popup custom
   ========================================================= */

function availableTemplates(role) {
    return alliesPool.filter(u => u.role === role); // nel pool = non in panchina
}
function displayHpForTemplate(base) {
    return base.currHp ?? base.hp;
}

function alliesPickerHTML(role) {
    const list = availableTemplates(role);
    const roleLabel = role === 'recruit' ? 'Reclute' : 'Comandanti';
    const alive = countAlive(role), tot = totalByRole(role);

    const cards = list.map(u => {
        const hpNow = displayHpForTemplate(u);
        const deadCls = u.dead ? ' is-dead' : '';
        const actions = u.dead ? `<button type="button" class="btn-resurrect" data-id="${u.id}" title="Resuscita">Resuscita</button>` : '';
        // icona HP: cuore se viva, teschio se morta
        const hpIcon = u.dead ? '☠️' : '❤️';

        return `
    <div class="unit-card pick-card${deadCls}" data-id="${u.id}" data-name="${u.name.toLowerCase()}" tabindex="${u.dead ? -1 : 0}" role="button" aria-pressed="false" aria-disabled="${u.dead}">
     
      <div class="unit-avatar"><img src="${u.img}" alt="${u.name}"></div>
      <div class="unit-info">
        <div class="unit-name">${u.name}</div>
        <div class="unit-sub">
          ${u.role === 'recruit' ? 'Recluta' : 'Comandante'}
          • ATK ${u.atk} • ${u.abi ?? ''}
        </div>
        <div class="pick-hprow">
          <div class="hpbar"><div class="hpbar-fill"></div></div>
          <span class="hp-inline-right">${hpIcon} ${hpNow}/${u.hp}</span>
        </div>
      </div>
      <div class="unit-actions">${actions}</div>
    </div>`;
    }).join('');

    return `
    <div class="picker" data-role="${role}">
      <div class="picker__head">
        <input id="ally-search" class="picker__search" type="search" placeholder="Cerca per nome..." autocomplete="off">
      </div>
      <div class="picker__tools">
        <div class="picker__count" id="picker-count">Selezionate: 0</div>
        <div class="picker__live" id="picker-live">Vivi: ${alive} / ${tot}</div>
        <div class="picker__spacer"></div>
        <button type="button" class="picker__btn" data-act="all">Seleziona tutto</button>
        <button type="button" class="picker__btn" data-act="none">Nessuno</button>
      </div>
      <div class="picker__grid" id="ally-grid">
        ${cards || `<div class="picker__empty">Nessuna ${roleLabel.toLowerCase()} disponibile.</div>`}
      </div>
    </div>
  `;
}

function pickAlliesDialog(role) {
    const { backdrop, modal, title, msg, btnCancel, btnConfirm, btnClose } = ensureModal();
    const roleLabel = role === 'recruit' ? 'Reclute' : 'Comandanti';
    title.textContent = `Seleziona ${roleLabel}`;
    msg.innerHTML = alliesPickerHTML(role);
    btnConfirm.textContent = 'Arruola';

    btnCancel.textContent = 'Annulla';
    btnCancel.style.display = '';
    btnClose.style.display = '';
    const grid = msg.querySelector('#ally-grid');
    const search = msg.querySelector('#ally-search');
    const tools = msg.querySelector('.picker__tools');
    const countEl = msg.querySelector('#picker-count');

    // Popola barra HP per ogni card (dal POOL)
    const paintPicker = () => {
        msg.querySelectorAll('.pick-card').forEach(card => {
            const id = card.dataset.id;
            const base = alliesPool.find(a => a.id === id);
            if (!base) return;

            // Stato visivo + accessibilità
            card.classList.toggle('is-dead', !!base.dead);
            card.setAttribute('aria-disabled', String(!!base.dead));
            card.setAttribute('tabindex', base.dead ? '-1' : '0');

            // Badge / Bottone
            const actions = card.querySelector('.unit-actions');
            if (base.dead) {
                // aggiungi badge se non c'è
                if (!card.querySelector('.pick-dead-badge')) {
                    const badge = document.createElement('div');
                    badge.className = 'pick-dead-badge';
                    badge.title = 'Morto/a';
                    card.prepend(badge);
                }
                // aggiungi pulsante se non c'è
                if (!actions.querySelector('.btn-resurrect')) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'btn-resurrect';
                    btn.dataset.id = id;
                    btn.title = 'Resuscita';
                    btn.textContent = 'Resuscita';
                    actions.appendChild(btn);
                }
            } else {
                // rimuovi elementi di morte se presenti
                card.querySelector('.pick-dead-badge')?.remove();
                actions.querySelector('.btn-resurrect')?.remove();
            }

            // HP bar + testo (cuore/teschio)
            const fill = card.querySelector('.hpbar-fill');
            const txt = card.querySelector('.hp-inline-right');
            if (fill) applyHpBar(fill, base);
            if (txt) {
                const icon = base.dead ? '☠️' : '❤️';
                const cur = base.currHp ?? base.hp;
                txt.textContent = `${icon} ${cur}/${base.hp}`;
            }

            addLongPress(card, {
                onLongPress: (e) => {
                    const html = getUnitTooltipHTML(base);
                    const rect = card.getBoundingClientRect();
                    // Mostra appena fuori a destra del picker card
                    showTooltip(html, rect.right + 8, rect.top + rect.height / 2);
                }
            });
        });

        // Contatore vivi
        const liveEl = msg.querySelector('#picker-live');
        if (liveEl) {
            const role = msg.querySelector('.picker').dataset.role;
            liveEl.textContent = `Vivi: ${countAlive(role)} / ${totalByRole(role)}`;
        }
    };


    paintPicker();
    const selected = new Set();
    const updateCount = () => { countEl.textContent = `Selezionate: ${selected.size}`; };

    const updateAria = (card) => {
        card.setAttribute('aria-pressed', String(card.classList.contains('is-selected')));
    };
    const toggleCard = (card) => {
        if (!card || !card.dataset.id) return;
        const id = card.dataset.id;
        if (card.classList.contains('is-selected')) {
            card.classList.remove('is-selected'); selected.delete(id);
        } else {
            card.classList.add('is-selected'); selected.add(id);
        }
        updateAria(card); updateCount();
    };
    const setCardSelected = (card, yes) => {
        if (!card) return;
        card.classList.toggle('is-selected', !!yes);
        if (yes) selected.add(card.dataset.id); else selected.delete(card.dataset.id);
        updateAria(card); updateCount();
    };

    const applyFilter = () => {
        const q = (search.value || '').toLowerCase().trim();
        grid.querySelectorAll('.pick-card').forEach(card => {
            const ok = !q || card.dataset.name.includes(q);
            card.style.display = ok ? '' : 'none';
        });
    };
    search.addEventListener('input', applyFilter);


    tools.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act]'); if (!b) return;
        const act = b.dataset.act;
        const visible = Array.from(grid.querySelectorAll('.pick-card')).filter(c => c.style.display !== 'none');
        if (act === 'all') visible.forEach(c => setCardSelected(c, true));
        else if (act === 'none') visible.forEach(c => setCardSelected(c, false));
    });


    // Click card: seleziona SOLO se non morta
    grid.addEventListener('click', (e) => {
        const resBtn = e.target.closest('.btn-resurrect');
        if (resBtn) {
            const id = resBtn.dataset.id;
            if (resurrectInPool(id)) {
                const card = resBtn.closest('.pick-card');
                const base = alliesPool.find(a => a.id === id);

                // 1) stato "vivo"
                card.classList.remove('is-dead');
                card.setAttribute('aria-disabled', 'false');
                card.setAttribute('tabindex', '0');

                // 2) rimuovi elementi "morte"
                card.querySelector('.btn-resurrect')?.remove();
                card.querySelector('.pick-dead-badge')?.remove();

                // 3) icona HP + barra
                const txt = card.querySelector('.hp-inline-right');
                const fill = card.querySelector('.hpbar-fill');
                if (txt) txt.textContent = `❤️ ${(base.currHp ?? base.hp)}/${base.hp}`;
                if (fill) applyHpBar(fill, base);

                // 4) (opzionale) auto-seleziona
                card.classList.add('is-selected');
                selected.add(id);
                updateAria(card); updateCount();

                // 5) aggiorna contatore vivi
                paintPicker(); // (vedi patch 2 sotto)
            }
            return;
        }

        // --- click su card viva: toggle selezione
        const card = e.target.closest('.pick-card');
        if (!card || !grid.contains(card)) return;
        if (card.classList.contains('is-dead')) return; // morte: non selezionabile

        const id = card.dataset.id;
        if (card.classList.contains('is-selected')) {
            card.classList.remove('is-selected'); selected.delete(id);
        } else {
            card.classList.add('is-selected'); selected.add(id);
        }
        updateAria(card); updateCount();
    });

    // Tastiera: evita selezione se morta
    grid.addEventListener('keydown', (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        const card = e.target.closest('.pick-card'); if (!card) return;
        if (card.classList.contains('is-dead')) return;
        e.preventDefault(); toggleCard(card);
    });

    updateCount();
    return new Promise((resolve) => {
        const close = (payload) => {
            backdrop.classList.remove('show'); modal.classList.remove('show');
            document.removeEventListener('keydown', onKey);
            btnCancel.onclick = btnConfirm.onclick = null;
            setTimeout(() => resolve(payload), 100);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') close(null);
            if (e.key === 'Enter' && e.target === document.body) btnConfirm.click();
        };
        document.addEventListener('keydown', onKey);
        btnClose.onclick = () => close(null);
        btnCancel.onclick = () => close(null);
        btnConfirm.onclick = () => close(Array.from(selected));

        requestAnimationFrame(() => {
            backdrop.classList.add('show'); modal.classList.add('show');
            search?.focus();
        });
    });
}

// Arruola dal picker (clona tutti i selezionati) + feedback
async function openAlliesPicker(role) {
    const baseIds = await pickAlliesDialog(role);
    if (!baseIds || baseIds.length === 0) return;

    const moved = [];
    for (const id of baseIds) {
        const ix = alliesPool.findIndex(a => a.id === id && a.role === role);
        if (ix === -1) continue;
        const unit = alliesPool.splice(ix, 1)[0]; // rimuovi dal pool
        unit.template = false;                    // ora è “attivo”
        alliesRoster.push(unit);                  // metti in panchina
        moved.push(unit);
    }

    rebuildUnitIndex();
    renderBenches();

    const bench = document.getElementById('bench-allies');
    bench.style.boxShadow = '0 0 0 2px rgba(39,183,168,.55)';
    setTimeout(() => bench.style.boxShadow = '', 350);

    log(moved.length === 1 ? `Aggiunto in panchina ${moved[0].name}` : `Aggiunte ${moved.length} unità in panchina.`);
    scheduleSave();
}

/** Ricostruisce il pannello log a partire da log_list.
 *  @param {number} limit - numero massimo di voci da mostrare (le più recenti).
 */
function renderLogs() {
    if (!logBox) return;
    logBox.textContent = '';
    // Mostra al massimo "limit" righe, tagliando le più vecchie
    log_list.forEach(entry => {
        const p = document.createElement('p');
        p.className = `log-entry log-${entry.type || 'info'}`;
        p.style.margin = '0 0 6px';
        p.textContent = entry.message;
        logBox.appendChild(p);
    });
    logBox.scrollTop = logBox.scrollHeight;

}

/** Facciata semplice per sincronizzare l’header:
 *  riallinea missione e timer (testo e pulsanti).
 */
function renderHeader() {
    renderMissionUI();
    renderTimerUI();
}


(function injectPickerCSS() {
    if (document.getElementById('picker-css')) return;
    const css = document.createElement('style');
    css.id = 'picker-css';
    css.textContent = `
  .picker{ display:flex; flex-direction:column; gap:10px; min-width:0; }
  .picker__head{ display:flex; gap:10px; align-items:center; min-width:0; }
  .picker__title{ font-weight:600; white-space:nowrap; }
  .picker__search{
    flex:1; min-width:0; padding:8px 10px; border-radius:10px;
    border:1px solid #2a2a2a; background:#0f111a; color:#eaeaea;
  }
  .picker__tools{ display:flex; align-items:center; gap:8px; }
  .picker__spacer{ flex:1; }
  .picker__count{ opacity:.9; font-size:12px; }

  .picker__btn{
    padding:6px 10px; border-radius:10px; border:1px solid #2a2a2a;
    background:#121421; color:#ddd; cursor:pointer;
  }

  .picker__grid{
    display:grid; gap:10px; padding-right:2px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }

  /* Card stile bench */
  .pick-card.unit-card{
    cursor:pointer; user-select:none;
    /* compattiamo un filo rispetto alla bench */
    padding:8px 10px;
  }
  .pick-card.unit-card:hover{
    box-shadow: 0 6px 16px rgba(0,0,0,.35);
  }
  .pick-card .unit-avatar{ width:34px; height:34px; border-radius:50%; border:2px solid #444; overflow:hidden; }
  .pick-card .unit-name{ font-weight:600; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pick-card .unit-sub{ font-size:12px; opacity:.9; }

  /* Stato selezionato: bordo pulsante (oro) + pulse */
  .pick-card.is-selected{
    border-color: var(--oro);
    box-shadow: 0 0 0 1px var(--oro), 0 0 12px rgba(207,148,57,.35);
    animation: pickPulse 1.1s ease-in-out infinite;
  }
  @keyframes pickPulse{
    0%,100% { box-shadow: 0 0 0 1px var(--oro), 0 0 10px rgba(207,148,57,.25); }
    50%     { box-shadow: 0 0 0 2px var(--oro), 0 0 18px rgba(207,148,57,.55); }
  }

  /* Empty state */
  .picker__empty{ opacity:.8; padding:20px; text-align:center; }
  `;
    document.head.appendChild(css);
})();

(function injectModalFixCSS() {
    if (document.getElementById('modal-fix-css')) return;
    const css = document.createElement('style');
    css.id = 'modal-fix-css';
    css.textContent = `
    .modal{ box-sizing:border-box; max-height:min(84vh,100dvh - 40px);
            display:flex; flex-direction:column; gap:12px; padding:16px; border-radius:14px; overflow:hidden; }
    .modal-body{ min-height:0; overflow:auto; }
    .modal input[type="search"], .modal input[type="text"]{ width:100%; min-width:0; box-sizing:border-box; }
  `;
    document.head.appendChild(css);
})();

function drawCard(type /* 'event' | 'consumable' */) {
    const d = decks[type];
    if (!d) return null;

    if (d.draw.length === 0) {
        if (d.discard.length === 0) return null;        // mazzo vuoto
        // rimescola gli scarti nel draw
        d.draw = shuffle(d.discard.splice(0));
    }
    const pop = d.draw.pop();
    scheduleSave();
    updateFabDeckCounters();
    return pop; // pesca dal top
}

function applyCardAction(type, card, action /* 'discard' | 'reshuffle' | 'remove' */) {
    const d = decks[type];
    if (!d || !card) return;

    if (action === 'discard') {
        d.discard.push(card);
        log(`Carta "${card.name}" scartata.`);
    } else if (action === 'reshuffle') {
        // rimetti nel draw e rimescola
        d.draw.push(card);
        shuffle(d.draw);
        log(`Carta "${card.name}" rimescolata nel mazzo.`);
    } else if (action === 'remove') {
        d.removed.push(card);
        log(`Carta "${card.name}" rimossa dal gioco.`);
    }
    scheduleSave();
    updateFabDeckCounters();
}

function reshuffleDiscardsOf(type /* 'event' | 'consumable' */) {
    const d = decks[type];
    if (!d) return 0;

    let moved = [];

    // scarti
    if (Array.isArray(d.discard) && d.discard.length > 0) {
        moved.push(...d.discard.splice(0));
    }

    // rimossi
    if (Array.isArray(d.removed) && d.removed.length > 0) {
        moved.push(...d.removed.splice(0));
    }

    if (moved.length === 0) return 0;

    d.draw.push(...moved);     // rientrano nel mazzo
    shuffle(d.draw);           // rimescola
    scheduleSave();
    return moved.length;
}

function reshuffleAllDiscards() {
    const e = reshuffleDiscardsOf('event');
    const c = reshuffleDiscardsOf('consumable');

    if (e === 0 && c === 0) {
        log('Nessuna carta negli scarti.', 'info');
    } else {
        const parts = [];
        if (e) parts.push(`Eventi: ${e}`);
        if (c) parts.push(`Consumabili: ${c}`);
        log(`Rimescolati gli scarti → ${parts.join(' • ')}.`, 'info');
    }

    updateFabDeckCounters();
}

function updateFabDeckCounters() {
    const evDraw = decks.event?.draw?.length || 0;
    const consDraw = decks.consumable?.draw?.length || 0;

    const evBadge = document.querySelector('[data-deck-badge="event"]');
    const consBadge = document.querySelector('[data-deck-badge="consumable"]');

    if (evBadge) evBadge.textContent = evDraw;
    if (consBadge) consBadge.textContent = consDraw;
}

/* =========================================================
   SOSTITUISCI il wiring dei bottoni Arruola con il picker
   (al posto di arruola(role) diretto)
   ========================================================= */
document.querySelectorAll('#fab-arruola .fab-option').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const role = btn.dataset.role; // 'recruit' | 'commander'
        await openAlliesPicker(role);
        closeAllFabs();
    });
});

// Se superi la tabella, continua con una formula (incremento crescente)
function xpThreshold(level) {
    // XP cumulativo richiesto per INIZIARE quel livello
    if (level <= XP_TABLE.length) return XP_TABLE[level - 1];
    // oltre la tabella: aumento progressivo
    let lastLevel = XP_TABLE.length;
    let xp = XP_TABLE[lastLevel - 1];
    for (let L = lastLevel + 1; L <= level; L++) {
        // incremento che cresce con il livello (regolabile)
        const inc = 300 + (L - 1) * 50;
        xp += inc;
    }
    return xp;
}

function levelFromXP(xp) {
    let L = 1;
    while (xp >= xpThreshold(L + 1)) L++;
    return Math.max(1, L);
}

function levelProgressPercent(xp, level) {
    const base = xpThreshold(level);
    const next = xpThreshold(level + 1);
    const range = Math.max(1, next - base);
    const pct = ((xp - base) / range) * 100;
    // clamp 0..99.999 per non arrivare mai "visivamente" a 100
    return Math.max(0, Math.min(99.999, pct));
}

// === BONUS / MALUS dinamici (solo Morale per i malus, solo Livello per i bonus) ===

// === MALUS da Morale (allineato a LEVEL_MALUS_TABLE) ===
function malusFromMorale(moralePctRaw) {
    const moralePct = Math.max(0, Math.min(100, Number(moralePctRaw) || 0));
    // Trova la riga di tabella che copre il range del morale corrente (inclusivo)
    const row = LEVEL_MALUS_TABLE.find(r =>
        moralePct >= r.range.min && moralePct <= r.range.max
    );

    if (!row) return [];

    const hasEffect =
        row && row.bonus && (row.bonus.agi || 0) !== 0 ||
        (row.bonus && (row.bonus.tec || 0) !== 0) ||
        (row.bonus && (row.bonus.atk || 0) !== 0) ||
        (row.text && row.text.trim().length > 0);

    // Se non c'è nessun testo e i bonus sono tutti 0, non renderiamo pillole
    if (!hasEffect) return [];

    return [{
        type: 'malus',
        text: row.text || '',           // Puoi popolarlo nella tabella
        bonus: row.bonus || { agi: 0, tec: 0, atk: 0 }
    }];
}
// === Utility merge/somma di tutti i bonus/malus ===
function mergeBonuses(pills) {
    const totals = { agi: 0, tec: 0, atk: 0 };
    for (const p of pills) {
        if (!p || !p.bonus) continue;
        totals.agi += p.bonus.agi || 0;
        totals.tec += p.bonus.tec || 0;
        totals.atk += p.bonus.atk || 0;
    }
    return totals;
}

function fmtSigned(n) {
    return (n > 0 ? '+' : '') + n;
}

function bonusesFromLevel(level) {
    return LEVEL_BONUS_TABLE
        .filter(b => level >= b.lvl)
        .map(b => ({ type: 'bonus', text: b.text, bonus: b.bonus }));
}

// Render unico
function renderBonusMalus() {
    if (!box) return;

    const level = levelFromXP(EXP_MORAL_STATE.xp);
    const morale = Number(EXP_MORAL_STATE.moralePct) || 0;

    // 1) raccogli pillole: bonus (cumulativi per soglia) + malus (unico per range)
    const pills = [
        ...bonusesFromLevel(level),
        ...malusFromMorale(morale),
    ];

    // 2) calcola la somma effettiva
    const totals = mergeBonuses(pills);
    // opzionale: salviamo nello state se vuoi riusarlo altrove
    EXP_MORAL_STATE.effectiveBonus = totals;

    // 3) render UI pillole + somma finale
    const pillsHtml = pills.length
        ? pills.map(p => `<span class="pill ${p.type}">${p.text || ''}</span>`).join('')
        : '';

    const totalsHtml = `<span class="pill total">Totale: AGI ${fmtSigned(totals.agi)} • TEC ${fmtSigned(totals.tec)} • ATK ${fmtSigned(totals.atk)}</span>`;

    box.innerHTML = pillsHtml + totalsHtml;
}

function refreshXPUI() {
    const L = levelFromXP(EXP_MORAL_STATE.xp);
    const pct = levelProgressPercent(EXP_MORAL_STATE.xp, L);
    if (xpDOM.fill) xpDOM.fill.style.width = pct + "%";
    if (xpDOM.pct) xpDOM.pct.textContent = Math.round(pct) + "%";
    if (xpDOM.lvl) xpDOM.lvl.textContent = "Lv. " + L;
    renderBonusMalus();
}

function refreshMoraleUI() {
    const pct = Math.max(0, Math.min(100, Number(EXP_MORAL_STATE.moralePct) || 0));
    if (moraleDOM.fill) moraleDOM.fill.style.width = pct + "%";
    if (moraleDOM.pct) moraleDOM.pct.textContent = Math.round(pct) + "%";
    renderBonusMalus();
}

// Helper: trova la riga malus corrispondente a una percentuale di morale
function getMalusRow(moralePct) {
    const m = Math.max(0, Math.min(100, Number(moralePct) || 0));
    return LEVEL_MALUS_TABLE.find(r => m >= r.range.min && m <= r.range.max) || null;
}

// Mutatore con logging dettagliato
function addMorale(deltaPct) {
    const prev = Math.max(0, Math.min(100, Number(EXP_MORAL_STATE.moralePct) || 0));
    const delta = Number(deltaPct) || 0;
    const next = Math.max(0, Math.min(100, prev + delta));

    // Aggiorna stato
    EXP_MORAL_STATE.moralePct = next;

    // UI + pillole
    refreshMoraleUI();     // richiama già renderBonusMalus()
    scheduleSave();
    // Cambio fascia malus?
    const prevBand = getMalusRow(prev);
    const nextBand = getMalusRow(next);
    if (prevBand?.text !== nextBand?.text) {
        if (nextBand) {
            // Entrata in nuova fascia
            const txt = nextBand.text ? `${nextBand.text}` : '';
            // Se morale scende, warning; se sale e alleggerisce il malus, info/success

            log(`${txt}`, nextBand.type);
        } else {
            // Uscito da ogni fascia (nessun malus attivo)
            log(`Nessun malus attivo.`, 'info');
        }
    }
}

function addXP(delta) {
    const prevXP = EXP_MORAL_STATE.xp;
    const prevLevel = levelFromXP(prevXP);

    // aggiorna XP (può salire o scendere)
    const nextXP = Math.max(0, prevXP + (Number(delta) || 0));
    EXP_MORAL_STATE.xp = nextXP;

    const nextLevel = levelFromXP(nextXP);

    // UI immediata
    refreshXPUI();   // aggiorna barra, % e pillole
    scheduleSave();

    // Annunci di livello
    if (nextLevel > prevLevel) {
        for (let L = prevLevel + 1; L <= nextLevel; L++) {
            log(`Salito al livello ${L}!`, 'success');
            // evidenzia i bonus appena sbloccati (se presenti)
            const unlocked = LEVEL_BONUS_TABLE.filter(b => b.lvl === L);
            unlocked.forEach(b => log(`Sbloccato: ${b.text}`, 'info'));
        }
    } else if (nextLevel < prevLevel) {
        // opzionale: logga il level-down
        for (let L = prevLevel - 1; L >= nextLevel; L--) {
            log(`Sei sceso al livello ${L}.`, 'warning');
        }
    }
}


// === BIND pulsanti ===
document.querySelectorAll(".bbtn").forEach(btn => {
    btn.addEventListener("click", () => {
        const target = btn.dataset.target;

        if (target === "xp") {
            // Usa data-xp (valori reali); se assente, fallback a 10 XP
            const deltaXP = parseInt(btn.dataset.xp || "10", 10);
            addXP(deltaXP);
        } else if (target === "morale") {
            const deltaPct = parseInt(btn.dataset.delta || "0", 10);
            addMorale(deltaPct);
        }
    });
});

// Helpers
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const fmtClock = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// Carica JSON missioni
async function loadMissions() {
    // Missioni cablate per test (stesso formato normalizzato che ti ho proposto)
    MISSION_STATE.missions = MISSIONS;
    setMissionByIndex(0);
}

// Imposta missione corrente (per indice nell’array)
function setMissionByIndex(idx) {
    idx = clamp(idx, 0, MISSION_STATE.missions.length - 1);
    MISSION_STATE.curIndex = idx;

    const m = MISSION_STATE.missions[idx];
    // Timer: totale = timerSec (o 1200)
    const total = Number(m?.timerSec) > 0 ? Math.floor(m.timerSec) : 1200;
    MISSION_STATE.timerTotalSec = total;
    MISSION_STATE.remainingSec = total;
    stopTimer();
    renderMissionUI();
    renderTimerUI();
    scheduleSave();
}

// Render UI missione (header + card)
function renderMissionUI() {
    const m = MISSION_STATE.missions[MISSION_STATE.curIndex];
    const num = m?.id ?? (MISSION_STATE.curIndex + 1);
    const title = m?.title ?? 'Missione';
    const objectives = Array.isArray(m?.objectives) ? m.objectives : [];
    const reward = m?.reward ?? { morale: 0, xp: 0 };

    if (elMissionNumTop) elMissionNumTop.textContent = String(num);
    if (elMissionNumCard) elMissionNumCard.textContent = String(num);

    // Rigenera il contenuto della card (mantieni il div#mission-card)
    const card = elMissionCardWrap.querySelector('#mission-card');
    if (card) {
        card.innerHTML = `
      <p style="margin:0 0 8px; opacity:.9;"><strong>#<span>${num}</span> — ${title}</strong></p>
      <ul style="margin:0 0 10px 18px; padding:0; opacity:.9">
        ${objectives.map(li => `<li>${li}</li>`).join('')}
      </ul>
      <p style="margin:0; font-size:12px; opacity:.8">Ricompensa: ${reward.morale ? `+${reward.morale} Morale` : ''}${(reward.morale && reward.xp) ? ', ' : ''}${reward.xp ? `+${reward.xp} XP` : ''}</p>
    `;
    }
}

// Render UI timer
function renderTimerUI() {
    if (elTime) elTime.textContent = fmtClock(MISSION_STATE.remainingSec);
    if (elPlay) elPlay.textContent = MISSION_STATE.ticking ? '⏸' : '▶';
}

// Timer controls
function startTimer() {
    if (MISSION_STATE.ticking) return;
    MISSION_STATE.ticking = true;
    renderTimerUI();

    MISSION_STATE.intervalId = setInterval(() => {
        MISSION_STATE.remainingSec = clamp(MISSION_STATE.remainingSec - 1, 0, MISSION_STATE.timerTotalSec);
        renderTimerUI();

        if (MISSION_STATE.remainingSec <= 0) {
            stopTimer();
            log("Tempo Scaduto! Ogni turno apparirà un gigante!")
            playCornoGuerra();
        }
    }, 1000);
}

function playCornoGuerra() {

}

function stopTimer() {
    MISSION_STATE.ticking = false;
    if (MISSION_STATE.intervalId) {
        clearInterval(MISSION_STATE.intervalId);
        MISSION_STATE.intervalId = null;
    }
    renderTimerUI();
    scheduleSave();
}

function resetTimer() {
    MISSION_STATE.remainingSec = MISSION_STATE.timerTotalSec || 1200;
    stopTimer();
    renderTimerUI();
    scheduleSave();
}

// Play/Pausa
elPlay?.addEventListener('click', () => {
    MISSION_STATE.ticking ? stopTimer() : startTimer();
});

// Reset
elReset?.addEventListener('click', resetTimer);

// Cambia missione
elDec?.addEventListener('click', () => {
    setMissionByIndex(MISSION_STATE.curIndex - 1);
});
elInc?.addEventListener('click', () => {
    setMissionByIndex(MISSION_STATE.curIndex + 1);
});

// === Welcome popup @ startup (immagine a destra) ============================
const WELCOME_PREF_KEY = 'aot-hide-welcome';



function getLastSaveInfo() {
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

// Precarica immagine; se 404, ritorna null
function preloadImg(src) {
    return new Promise(resolve => {
        if (!src) return resolve(null);
        const im = new Image();
        im.onload = () => resolve(src);
        im.onerror = () => resolve(null);
        im.src = src;
    });
}

async function showWelcomePopup(isFirstRun, imgUrl) {
    // lista fallback (metti qualcosa che sicuramente esiste nel tuo progetto)
    const candidates = [
        imgUrl
    ].filter(Boolean);

    let okSrc = null;
    for (const c of candidates) {
        okSrc = await preloadImg(c);
        if (okSrc) break;
    }

    const last = getLastSaveInfo?.() || null;
    const mediaHTML = okSrc
        ? `<img src="${okSrc}" alt="${isFirstRun ? 'Benvenuto' : 'Bentornato'}">`
        : `<div class="welcome__ph">Immagine non disponibile</div>`;

    const html = `
    <div class="welcome">
    <div class="welcome__media">
        ${mediaHTML}
      </div>
      <div class="welcome__txt">
        <p>${isFirstRun
            ? 'Questa è la tua plancia: gestisci Reclute e Comandanti, difendi le Mura e sconfiggi i Giganti.'
            : `Abbiamo ripristinato il tuo stato${last ? ` (ultimo salvataggio: <small>${last}</small>)` : ''}.`}
        </p>
        <ul>
          <li>Usa i pulsanti in basso per <em>Spawn</em>, <em>Carte</em> e <em>Arruolo</em>.</li>
          <li>Tieni premuto su unità e card per visualizzare il dettaglio, drag per spostare.</li>
          <li>Timer, Morale e XP si salvano in automatico.</li>
        </ul>
      </div>
    </div>
  `;

    const ok = await openDialog({
        title: isFirstRun ? 'Benvenuto/a!' : 'Bentornato/a!',
        message: html,
        confirmText: isFirstRun ? 'Inizia' : 'Riprendi',
        cancelText: 'Chiudi',
        danger: true,
        cancellable: true
    });

    if (ok) {
        const url = './assets/sounds/risorsa_audio_avvio_app.mp3';
        const backgroundSound = await play(url, { loop: true, volume: 1 });
        gameSoundTrack.background = backgroundSound;
    }
}


function getLastSaveInfo() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data?.savedAt) return null;
        const d = new Date(data.savedAt);
        // es: "oggi alle 14:05" / fallback: data e ora locale
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        const hhmm = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        return sameDay ? `oggi alle ${hhmm}` : d.toLocaleString('it-IT');
    } catch { return null; }
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
        DB = { allies, giants, events, consumable, missions, settings };

        console.log('[boot] DB inizializzato:', DB);
        return DB;
    } catch (e) {
        console.warn('Caricamento JSON fallito, uso i fallback locali:', e);
        // fallback: qui puoi mettere i tuoi array hardcoded
        DB = {
            allies: alliesPool ?? [],
            giants: giantsPool ?? [],
            event: eventPool ?? [],
            consumable: consumablePool ?? [],
            missions: MISSIONS ?? [],
            settings: {}
        };
        return DB;
    }
}

(function setupWallsAccordion() {
    const sec = document.getElementById('walls-section');
    const btn = document.getElementById('walls-toggle');
    const panel = document.getElementById('walls-panel');
    if (!sec || !btn || !panel) return;

    const KEY = 'ui:walls-accordion-open';

    // stato iniziale (persistito)
    const saved = localStorage.getItem(KEY);
    const startOpen = saved == null ? true : saved === '1';
    apply(startOpen);

    btn.addEventListener('click', () => {
        const next = btn.getAttribute('aria-expanded') !== 'true';
        apply(next);
    });

    function apply(isOpen) {
        sec.dataset.open = isOpen ? '1' : '0';
        btn.setAttribute('aria-expanded', String(isOpen));
        panel.setAttribute('aria-hidden', String(!isOpen));
        localStorage.setItem(KEY, isOpen ? '1' : '0');
    }
})();


rebuildUnitIndex();

async function init() {
    await bootDataApplication();
}

init();
// BOOT: prova restore; se non c'è, fai seed mura
const booted = loadFromLocal();

if (!booted) {

    seedWallRows();              // crea segmenti mura 10/11/12
    renderBenches();
    renderGrid(grid, ROWS, COLS, spawns);

    resetDeckFromPool('event');
    resetDeckFromPool('consumable');

    loadMissions();
    refreshXPUI();
    refreshMoraleUI();
    renderBonusMalus();
    renderHeader();
    renderLogs();
    updateFabDeckCounters();
}

// Mostra welcome/bentornato (se non disattivato dall’utente)
setTimeout(() => { showWelcomePopup(!booted, "assets/img/erwin_popup_benvenuto.jpg"); }, 60);