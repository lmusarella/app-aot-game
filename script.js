async function play(url, opts = {}) {
    const { loop = false, volume = 1 } = opts;
    const audio = new Audio();
    audio.src = url; audio.preload = 'auto'; audio.loop = loop; audio.volume = clamp(volume, 0, 1); audio.crossOrigin = 'anonymous';
    try { await audio.play(); } catch (e) { console.warn('Autoplay blocked or error:', e); }
    return audio;
}
const GAME_SOUND_TRACK = {
    background: null
}

async function playBg(url, { volume = 0.1, loop = true } = {}) {
    try {
        if (loop) {
            GAME_SOUND_TRACK.background?.pause();
        }
    } catch { }
    const music = await play(url, { loop, volume });
    if (loop) GAME_SOUND_TRACK.background = music
}

// DB unico globale in memoria
const DB = {
    ALLIES: null,
    GIANTS: null,
    EVENTS: null,
    CONSUMABLE: null,
    MISSIONS: null,
    SETTINGS: null
};
function setDefaultGameStateData() {
    GAME_STATE.xpMoraleState = DB.SETTINGS.xpMoralDefault;
    GAME_STATE.walls = DB.ALLIES.filter(unit => unit.role === "wall").map(u => ({ ...u, currHp: u.hp }));
    GAME_STATE.alliesPool = DB.ALLIES.filter(unit => unit.role !== "wall").map(u => ({ ...u, currHp: u.hp, template: true, dead: false }));
    GAME_STATE.giantsPool = DB.GIANTS.map(u => ({ role: "enemy", ...u, currHp: u.hp, template: true }));
    GAME_STATE.decks.event.draw = DB.EVENTS;
    GAME_STATE.decks.consumable.draw = DB.CONSUMABLE;

    console.log('gamestate', GAME_STATE);
}

const GAME_STATE = {
    missionState: {
        curIndex: 0,
        timerTotalSec: 1200,
        remainingSec: 1200,
        ticking: false,
        intervalId: null
    },
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
    logs: []
}

const COLOR_VAR = {
    red: 'var(--rosso)', yellow: 'var(--oro)', silver: 'var(--argento)', verde: 'var(--verde)',
    gray: 'var(--grigio)', blu: 'var(--blu)', argento: 'var(--argento)', viola: 'var(--viola)'
};
const SAVE_VERSION = 1;
const SAVE_KEY = 'aot-save-v' + SAVE_VERSION;
const LONG_PRESS_MS = 320;

let selectedUnitId = null;
let isDraggingNow = false;
let _modalEls = null;

const baseHpOverride = new Map();
const unitById = new Map();
const queue = [];

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



function snapshot() {
    // NB: non salvo unitById (si ricostruisce). Salvo solo ciò che serve davvero.
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
        // log
        logs: structuredClone(GAME_STATE.logs),
        missionState: (() => {
            const m = structuredClone(GAME_STATE.missionState);
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
    Object.assign(GAME_STATE.missionState, save.missionState || {});
    GAME_STATE.missionState.intervalId = null; // sempre nullo a cold start

    // 4) ricostruisci unitById dai cataloghi + muri base
    unitById.clear();
    rebuildUnitIndex(); // mette alliesRoster + giantsRoster + walls (base)

    // 5) assicurati che i SEGMENTI MURA esistano per ogni cella muro salvata
    //    Se vedi un id "w1_r10c3" in spawns e non è nel map, crealo dal base corrispondente.
    const baseByPrefix = new Map(GAME_STATE.walls.map(w => [w.id, w]));
    for (const s of GAME_STATE.spawns) {
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
        if (GAME_STATE.missionState.ticking) {
            const elapsedSec = Math.floor((Date.now() - (save.savedAt || Date.now())) / 1000);
            GAME_STATE.missionState.remainingSec = clamp((GAME_STATE.missionState.remainingSec || 0) - elapsedSec, 0, GAME_STATE.missionState.timerTotalSec || 1200);
            if (GAME_STATE.missionState.remainingSec > 0) {
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
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
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

async function loadDataAndStateFromLocal() {
    await bootDataApplication()
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
    [...GAME_STATE.alliesRoster, ...GAME_STATE.giantsRoster, ...GAME_STATE.walls].forEach(u => unitById.set(u.id, u));
}
function seedWallRows() {
    // 1) togli eventuali vecchie entry in r.10/11/12
    for (let i = GAME_STATE.spawns.length - 1; i >= 0; i--) {
        const r = GAME_STATE.spawns[i].row;
        if (DB.SETTINGS.gridSettings.wall[r]) GAME_STATE.spawns.splice(i, 1);
    }
    // 2) crea segmenti (cloni con id univoco) e mettili in campo
    for (const [rStr, baseId] of Object.entries(DB.SETTINGS.gridSettings.wall)) {
        const r = +rStr;
        const base = GAME_STATE.walls.find(w => w.id === baseId);
        if (!base) continue;
        for (let c = 1; c <= DB.SETTINGS.gridSettings.cols; c++) {
            const segId = `${baseId}`;
            if (!unitById.has(segId)) {
                const copy = { ...base, id: segId, name: base.name + ` — ${c}`, currHp: base.hp, segment: true };
                unitById.set(segId, copy); // NB: non lo aggiungo a walls per non affollare la panchina
            }
            GAME_STATE.spawns.push({ row: r, col: c, unitIds: [segId] });
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
    const pool = (type === 'event') ? DB.EVENTS : DB.CONSUMABLE;
    const d = GAME_STATE.decks[type];
    d.draw = shuffle(pool.slice()); // copia + shuffle
    d.discard = [];
    d.removed = [];
    scheduleSave();
    updateFabDeckCounters();
}
const keyRC = (r, c) => `${r},${c}`;
function findCellIndex(r, c) { return GAME_STATE.spawns.findIndex(s => s.row === r && s.col === c); }
function getStack(r, c) {
    const idx = findCellIndex(r, c);
    if (idx < 0) return [];
    const s = GAME_STATE.spawns[idx];
    if (Array.isArray(s.unitIds)) return [...s.unitIds];
    if (s.unitId) return [s.unitId];
    return [];
}
const countAlive = (role) => GAME_STATE.alliesPool.filter(u => u.role === role && !u.dead).length;
const totalByRole = (role) => GAME_STATE.alliesPool.filter(u => u.role === role).length;
function setStack(r, c, arr) {
    const idx = findCellIndex(r, c);
    if (!arr || arr.length === 0) { if (idx >= 0) GAME_STATE.spawns.splice(idx, 1); return; }
    if (idx < 0) GAME_STATE.spawns.push({ row: r, col: c, unitIds: [...arr] });
    else GAME_STATE.spawns[idx] = { row: r, col: c, unitIds: [...arr] };
    scheduleSave();
}
function removeUnitEverywhere(unitId) {
    for (let i = GAME_STATE.spawns.length - 1; i >= 0; i--) {
        const s = GAME_STATE.spawns[i];
        const arr = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
        const idx = arr.indexOf(unitId);
        if (idx >= 0) {
            arr.splice(idx, 1);
            if (arr.length === 0) GAME_STATE.spawns.splice(i, 1);
            else GAME_STATE.spawns[i] = { row: s.row, col: s.col, unitIds: arr };
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
    return GAME_STATE.spawns.some(s => {
        const arr = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
        return arr.includes(unitId);
    });
}
function findUnitCell(unitId) {
    for (const s of GAME_STATE.spawns) {
        const arr = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
        if (arr.includes(unitId)) return { row: s.row, col: s.col };
    }
    return null;
}
function pickGiantFromPool(type = null) {
    // escludo quelli già attivi in panchina (giantsRoster)
    const activeIds = new Set(GAME_STATE.giantsRoster.map(g => g.id));
    const avail = GAME_STATE.giantsPool.filter(g => !activeIds.has(g.id) && (!type || g.type === type));
    if (avail.length === 0) return null;
    return avail[Math.floor(Math.random() * avail.length)];
}
function putGiantIntoRoster(giant) {
    // sposta dal pool alla panchina attiva
    const ix = GAME_STATE.giantsPool.findIndex(g => g.id === giant.id);
    const unit = ix >= 0 ? GAME_STATE.giantsPool.splice(ix, 1)[0] : { ...giant };
    unit.template = false;
    GAME_STATE.giantsRoster.push(unit);
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
        if (s.length < DB.SETTINGS.gridSettings.maxUnitHexagon) {
            removeUnitEverywhere(unitId);
            s.push(unitId);
            setStack(r, c, s);
            renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
            return { row: r, col: c };
        }
    }
    return null; // full
}

function getMusicUrlById(unitId) {
    const map = {
        r9: './assets/sounds/reclute/marco_presentazione.mp3',
        r14: './assets/sounds/reclute/jean_presentazione.mp3',
        r1: './assets/sounds/reclute/armin_presentazione.mp3',
        r2: './assets/sounds/reclute/conny_presentazione.mp3',
        r15: './assets/sounds/reclute/flock_presentazione.mp3',
        r3: './assets/sounds/reclute/sasha_presentazione.mp3',
        c5: './assets/sounds/comandanti/sadis_presentazione.mp3',
        c3: './assets/sounds/comandanti/urlo_erwin.mp3'
    }
    return map[unitId];
}

async function spawnGiant(type = null) {

    const roll20 = Math.floor(Math.random() * 20) + 1;
    const m = DB.MISSIONS[GAME_STATE.missionState.curIndex];
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
        if (tipo === "Mutaforma") {
            if (unit.id === 'u2') await playBg('./assets/sounds/ape_titan_sound.mp3');
            if (unit.id === 'u1') await playBg('./assets/sounds/female_titan.mp3');
            if (unit.id === 'u6') await playBg('./assets/sounds/mutaform_sound.mp3');
            if (unit.id === 'u7') await playBg('./assets/sounds/mutaform_sound.mp3');
        }
        if (tipo === "Anomalo") {
            if (unit.id === 'u11')
                await playBg('./assets/sounds/gigante_anomalo_rod.mp3');
            else
                await playBg('./assets/sounds/ape_titan_sound.mp3');
        }
        if (tipo === "Puro") {
            await playBg('./assets/sounds/giganti_puri.mp3');
        }

        log(`Gigante ${tipo} appare in ${cell.row}-${cell.col}`, 'warning');
        await playBg('./assets/sounds/flash_effect_sound.mp3', { loop: false, volume: 0.4 });
        focusUnitOnField(unit.id);
        openAccordionForRole(unit.role);
    } else {
        log('Campo pieno nelle zone consentite. Il gigante è in panchina.', 'warning');
    }
    return true;
}
function renderBenches() {
    renderBenchSection(alliesEl, GAME_STATE.alliesRoster, ["recruit", "commander"]);
    renderBenchSection(enemiesEl, GAME_STATE.giantsRoster, ["enemy"]);
    renderBenchSection(wallsEl, GAME_STATE.walls, ["wall"], /*readOnly*/ true);

    countAlliesEl.textContent = `${GAME_STATE.alliesRoster.length} unità`;
    countEnemiesEl.textContent = `${GAME_STATE.giantsRoster.length} unità`;
    countWallsEl.textContent = `${GAME_STATE.walls.length} mura`;
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
        renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
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
        showTooltip(html);
    }
}

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
        card.style.setProperty('--sel', colVar);
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
            onClick: () => {
                if (!isDraggingNow) {
                    benchClickFocusAndTop(u, card);
                    const html = getUnitTooltipHTML(u);
                    const rect = card.getBoundingClientRect();
                    showTooltip(html, rect.right + 6, rect.top + rect.height / 2);
                    // piccolo flash visivo
                    card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 450);
                }
            },
            onLongPress: () => {
                hideTooltip();
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
                hideTooltip();
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
                renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
                renderBenches();
            }
        });
    }
}

/* =======================
   GRIGLIA
   ======================= */

function renderGrid(container, rows, cols, occupancy = []) {
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
    const overflow = Math.max(0, allUnits.length - DB.SETTINGS.gridSettings.dispalyLimit);
    const visibleUnits = overflow > 0 ? allUnits.slice(-DB.SETTINGS.gridSettings.dispalyLimit) : allUnits;

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
                    if (!isDraggingNow) {
                        selectedUnitId = unit.id;
                        bringToFront({ row, col }, unit.id);
                        renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
                        openAccordionForRole(unit.role);
                        focusBenchCard(unit.id, { scroll: true, pulse: true });
                        const html = getUnitTooltipHTML(unit);
                        showTooltip(html, e.clientX, e.clientY);
                    }
                },
                onLongPress: (e) => {
                    hideTooltip();
                }
            });

            content.addEventListener("dragstart", (e) => {
                isDraggingNow = true;
                hideTooltip();
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
            content.addEventListener("dragend", () => {
                content.classList.remove("dragging")
                isDraggingNow = false;
            });

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
async function handleDrop(payload, target) {
    // blocca drop se nella cella target c'è una Muraglia
    if (hasWallInCell(target.row, target.col)) return;
    if (payload.type === "from-bench") {
        // stesso esagono → non spostare né duplicare    
        if (sameId(payload.unitId, target)) {
            renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
            return;
        }
        await placeFromBench(target, payload.unitId);
        renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
    } else if (payload.type === "from-cell") {
        const u = unitById.get(payload.unitId);
        if (u?.role === 'wall') return;
        moveOneUnitBetweenStacks(payload.from, target, payload.unitId);
        renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
        renderBenches();
    }
}

async function placeFromBench(target, unitId) {
    if (hasWallInCell(target.row, target.col)) return;
    const unit = unitById.get(unitId);
    if (unit?.role === 'wall') return; // i muri non si piazzano sul campo

    const tgt = getStack(target.row, target.col);
    if (tgt.length >= DB.SETTINGS.gridSettings.maxUnitHexagon) return;

    removeUnitEverywhere(unitId);
    tgt.push(unitId);
    selectedUnitId = unitId;
    setStack(target.row, target.col, tgt);
    renderBenches();
    await playBg(getMusicUrlById(unitId), { loop: false, volume: 1 });
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
    if (tgt.length >= DB.SETTINGS.gridSettings.maxUnitHexagon) {
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
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
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


function showTooltip(html) {
    tooltipEl.innerHTML = html;
    tooltipEl.style.display = "block";
    //posizione fissa
    positionTooltip(0, 45);
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
        renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
        renderBenches();                      // rimuove highlight in panchina
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideTooltip(); selectedUnitId = null; renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
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
        title: `Completare la Missione #${GAME_STATE.missionState.curIndex + 1}?`,
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
        hideTooltip();
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

        if (t === 'showhand') {
            openHandOverlay();
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
        showDrawnCard(type, card);
        closeAllFabs();
    });
});


function completeMission() {
    stopTimer();
    log(`Missione #${GAME_STATE.missionState.curIndex + 1} completata!`, 'success');
    const m = DB.MISSIONS[GAME_STATE.missionState.curIndex];
    const reward = m?.reward ?? { morale: 0, xp: 0 };
    addMorale(reward.morale);
    addXP(reward?.xp)
    setMissionByIndex(GAME_STATE.missionState.curIndex + 1);
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
    GAME_STATE.logs.push({ message, type });
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

function cardChipHTML(kind) {
    const label = kind === 'consumable' ? 'Consumabile' : 'Evento';
    const cls = kind === 'consumable' ? 'card-chip--consumable' : 'card-chip--event';
    return `<span class="card-chip ${cls}">${label}</span>`;
}

function cardSheetHTML(deck, card, actions) {
    const name = card?.name || 'Carta';
    const img = card?.img || '';
    const desc = card?.desc || '';
    const chip = cardChipHTML(deck);

    // actions = array di { key:'use'|'discard'|'add'|'remove'|'close', label:'...' , kind:'primary'|'danger'|'' }
    const actBtns = (actions || []).map(a =>
        `<button class="card-btn ${a.kind || ''}" data-act="${a.key}">${a.label}</button>`
    ).join('');

    return `
  <article class="tt-card card-sheet" data-deck="${deck}">
    <div class="tt-title">${name}</div>
    <div>${chip}</div>
    <div class="tt-avatar">${img ? `<img src="${img}" alt="${name}">` : ''}</div>
    <div class="tt-ability" data-collapsed="false">
      <span class="tt-label">DESCRIZIONE</span>
      <div class="tt-ability-text">${desc}</div>
    </div>
    <div class="picker__live"></div>
    <div class="card-actions">${actBtns}</div>
  </article>`;
}

function handCardMiniHTML(entry) {
    const { deck, card } = entry;
    const name = card?.name || 'Carta';
    const img = card?.img || '';
    return `
  <div class="tt-card">
    <div class="tt-avatar">${img ? `<img src="${img}" alt="${name}">` : ''}</div>
    <div class="tt-title">${name}</div>
  </div>`;
}

function handCardFocusHTML(entry) {
    const { deck, card } = entry;
    const name = card?.name || 'Carta';
    const img = card?.img || '';
    const desc = card?.desc || '';
    const chip = cardChipHTML(deck);
    return `
  <div class="tt-card" data-role="event">
    <div class="tt-avatar" style="width:100%; height:220px; border-radius:12px; border:none;">
      ${img ? `<img src="${img}" alt="${name}">` : ''}
    </div>
    <div class="tt-title" style="margin-top:8px; display:flex; align-items:center; gap:8px; justify-content:center;">
      ${name} ${chip}
    </div>
    <div class="tt-ability" data-collapsed="false">
      <span class="tt-label">DESCRIZIONE</span>
      <div class="tt-ability-text">${desc}</div>
    </div>
  </div>`;
}

function showDrawnCard(deckType, card) {
    const root = document.getElementById('hand-overlay');
    const strip = document.getElementById('hand-strip');
    const stage = root?.querySelector('.hand-stage');
    if (!root || !strip || !stage) return;
    stage.classList.add('hand-stage--single');
    strip.classList.remove('hand-strip')
    strip.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'hand-card';

    const actionCard = [
        { key: 'discard', label: 'Scarta', kind: 'primary' },
        { key: 'shuffle', label: 'Rimescola', kind: 'danger' }
    ];

    wrap.innerHTML = cardSheetHTML(deckType, card, actionCard);

    wrap.addEventListener('click', (ev) => {
        const btn = ev.target.closest('.card-btn'); if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'discard') {
            GAME_STATE.decks[deckType]?.discard.push(card);
            log(`Scartata "${card.name}".`, 'info');
        }
        if (act === 'shuffle') {
            GAME_STATE.decks[deckType]?.draw.push(card);
            log(`Rimescolata ${card.name} nel mazzo "${deckType}".`, 'info');
        }
        updateFabDeckCounters();
        closeOverlay();
    }, { passive: true });

    strip.appendChild(wrap);

    function closeOverlay() {
        root.setAttribute('hidden', '');
        root.querySelector('.hand-backdrop').onclick = null;
        root.querySelector('.hand-close').onclick = null;
        document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') closeOverlay(); }

    root.querySelector('.hand-backdrop').onclick = () => {
        closeOverlay();
        if (deckType === 'consumable') {
            GAME_STATE.hand.push({ deck: deckType, card: structuredClone(card) });
            log(`Aggiunta in mano: "${card.name}".`, 'success');
            updateFabDeckCounters();
        }
        if (deckType === 'event') {
            GAME_STATE.decks[deckType]?.discard.push(card);
            log(`Carta Evento "${card.name}" è stata attivata!.`, 'warning');
            updateFabDeckCounters();
        }
    };
    root.querySelector('.hand-close').onclick = () => {
        closeOverlay();
        if (deckType === 'consumable') {
            GAME_STATE.hand.push({ deck: deckType, card: structuredClone(card) });
            log(`Aggiunta in mano: "${card.name}".`, 'success');
            updateFabDeckCounters();
        }
        if (deckType === 'event') {
            GAME_STATE.decks[deckType]?.discard.push(card);
            log(`Carta Evento "${card.name}" è stata attivata!.`, 'warning');
            updateFabDeckCounters();
        }
    };
    document.addEventListener('keydown', onKey);

    root.removeAttribute('hidden');
}



function openHandOverlay() {
    const root = document.getElementById('hand-overlay');
    const strip = document.getElementById('hand-strip');
    const stage = root?.querySelector('.hand-stage');
    if (!root || !strip || !stage) return;
    stage.classList.remove('hand-stage--single');
    strip.classList.add('hand-strip')
    if (!GAME_STATE.hand.length) { log('La mano è vuota.', 'info'); return; }

    // render
    strip.innerHTML = '';
    GAME_STATE.hand.forEach((entry, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'hand-card';
        wrap.innerHTML = cardSheetHTML(entry.deck, entry.card, [
            { key: 'discard-one', label: 'Scarta', kind: 'primary' },
            { key: 'use-one', label: 'Usa', kind: 'danger' }
        ]);
        // delega click pulsanti di questa carta
        wrap.addEventListener('click', (ev) => {
            const btn = ev.target.closest('.card-btn'); if (!btn) return;
            const act = btn.dataset.act;

            if (act === 'discard-one') {
                const it = GAME_STATE.hand.splice(i, 1)[0];
                if (it) {
                    GAME_STATE.decks[it.deck]?.discard.push(it.card);
                    log(`Scartata "${it.card.name}".`, 'info');
                    updateFabDeckCounters();
                }
            }
            if (act === 'use-one') {
                const it = GAME_STATE.hand.splice(i, 1)[0];
                if (it) {
                    let handled = false;
                    try { handled = !!window.onUseCard?.(it.deck, it.card); } catch { }
                    if (!handled) {
                        if (it.deck === 'consumable') GAME_STATE.decks[it.deck]?.discard.push(it.card);
                        else GAME_STATE.decks[it.deck]?.discard.push(it.card);
                    }
                    log(`Usata "${it.card.name}".`, 'success');
                    updateFabDeckCounters();
                }
            }

            // refresh/chiudi
            if (!GAME_STATE.hand.length) { closeOverlay(); return; }
            openHandOverlay(); // rerender semplice
        }, { passive: true });

        strip.appendChild(wrap);
    });

    function closeOverlay() {
        root.setAttribute('hidden', '');
        root.querySelector('.hand-backdrop').onclick = null;
        root.querySelector('.hand-close').onclick = null;
        document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') closeOverlay(); }

    root.querySelector('.hand-backdrop').onclick = closeOverlay;
    root.querySelector('.hand-close').onclick = closeOverlay;

    document.addEventListener('keydown', onKey);

    root.removeAttribute('hidden');
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
window.setUnitHp = async function (unitId, newHp) {
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
        await handleAllyDeath(u);
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
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
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
        const i = GAME_STATE.alliesRoster.findIndex(x => x.id === unitId);
        if (i >= 0) {
            const removed = GAME_STATE.alliesRoster.splice(i, 1)[0];
            // torna nel POOL con gli HP aggiornati
            const back = { ...removed, template: true }; // torna “template: true”
            GAME_STATE.alliesPool.push(back);
        }
    } else if (u.role === 'enemy') {
        // rimuovi dal ROSTER attivo
        const i = GAME_STATE.giantsRoster.findIndex(x => x.id === unitId);
        if (i >= 0) {
            const removed = GAME_STATE.giantsRoster.splice(i, 1)[0];
            // torna nel POOL (di default a FULL HP)
            const back = { ...removed, template: true, currHp: removed.hp };
            GAME_STATE.giantsPool.push(back);
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
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
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
    const ROW_BY_WALL_ID = Object.fromEntries(
        Object.entries(DB.SETTINGS.gridSettings.wall).map(([r, id]) => [id, Number(r)])
    );
    // segna lo stato "distrutta"
    wallUnit.currHp = 0;
    wallUnit.destroyed = true;

    // individua la/e righe da rimuovere
    const rows = [];
    const mapped = ROW_BY_WALL_ID[wallUnit.id];
    if (mapped) rows.push(mapped);
    for (const s of GAME_STATE.spawns) {
        const arr = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
        if (arr.includes(wallUnit.id) && !rows.includes(s.row)) rows.push(s.row);
    }

    // rimuovi tutte le entry della/e riga/righe trovate
    for (let i = GAME_STATE.spawns.length - 1; i >= 0; i--) {
        if (rows.includes(GAME_STATE.spawns[i].row)) GAME_STATE.spawns.splice(i, 1);
    }
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
    renderBenches();
    log(`${wallUnit.name} è stato distrutto!`, 'error');
    scheduleSave();
}

function handleGiantDeath(unit) {
    // 1) rimuovi dal campo
    removeUnitEverywhere(unit.id);

    // 2) rimuovi dalla panchina attiva (roster giganti)
    const i = GAME_STATE.giantsRoster.findIndex(g => g.id === unit.id);
    if (i >= 0) GAME_STATE.giantsRoster.splice(i, 1);

    // 3) NON rimettere nel pool: il gigante è “consumato”
    // (quindi niente push in giantsPool)

    // 4) UI + log
    rebuildUnitIndex();
    renderBenches();
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
    log(`${unit.name} è morto.`, 'success');
    scheduleSave();
}

async function handleAllyDeath(unit) {
    // rimuovi da campo
    removeUnitEverywhere(unit.id);
    // rimuovi da roster
    const i = GAME_STATE.alliesRoster.findIndex(a => a.id === unit.id);
    if (i >= 0) GAME_STATE.alliesRoster.splice(i, 1);
    // torna nel pool come morto
    const back = { ...unit, template: true, dead: true, currHp: 0 };
    // se già esiste nel pool con stesso id, aggiorna, altrimenti push
    const j = GAME_STATE.alliesPool.findIndex(a => a.id === back.id);
    if (j >= 0) GAME_STATE.alliesPool[j] = back; else GAME_STATE.alliesPool.push(back);

    rebuildUnitIndex();
    renderBenches();
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
    log(`${unit.name} è morto/a.`, 'error');
    await playBg('./assets/sounds/reclute/morte_recluta_comandante.mp3', { loop: false, volume: 1 });
    scheduleSave();
}

function resurrectInPool(id) {
    const u = GAME_STATE.alliesPool.find(a => a.id === id);
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
function toggleSide(side) {
    // ⚠️ disattiva i media query "auto" dopo il primo intervento dell’utente
    document.body.classList.add('manual-layout');

    const el = (side === 'left') ? leftEl : rightEl;
    el.classList.toggle('collapsed');
    applyClasses();
}

// init: default chiusi (come richiesto), nessuna persistenza
(function initSidebars() {
    leftEl.classList.add('collapsed');
    rightEl.classList.add('collapsed');
    applyClasses();

    document.getElementById('toggle-left')?.addEventListener('click', () => toggleSide('left'));
    document.getElementById('toggle-right')?.addEventListener('click', () => toggleSide('right'));
})();


// Click sull’area collassata riapre (UX comodo)
leftEl.addEventListener('click', (e) => {
    if (leftEl.classList.contains('collapsed')) toggleSide('left');
});
rightEl.addEventListener('click', (e) => {
    if (rightEl.classList.contains('collapsed')) toggleSide('right');
});

// Ripristina preferenza utente (se esiste)
function restoreLayout() {
    leftEl.classList.add('collapsed');
    rightEl.classList.add('collapsed');
    applyClasses();
};

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

            showNext();
        }, 140);

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
    const item = queue.shift();
    if (!item) return;
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
    return GAME_STATE.alliesPool.filter(u => u.role === role); // nel pool = non in panchina
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
            const base = GAME_STATE.alliesPool.find(a => a.id === id);
            if (!base) return;

            // Stato visivo + accessibilità
            card.classList.toggle('is-dead', !!base.dead);
            card.setAttribute('aria-disabled', String(!!base.dead));
            card.setAttribute('tabindex', base.dead ? '-1' : '0');
            const colVar = COLOR_VAR[base.color] || '#444';
            card.style.setProperty('--ring', colVar);
            card.style.setProperty('--sel', colVar);
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
                onLongPress: () => {
                    const html = getUnitTooltipHTML(base);
                    showTooltip(html);
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
                const base = GAME_STATE.alliesPool.find(a => a.id === id);

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
        const ix = GAME_STATE.alliesPool.findIndex(a => a.id === id && a.role === role);
        if (ix === -1) continue;
        const unit = GAME_STATE.alliesPool.splice(ix, 1)[0]; // rimuovi dal pool
        unit.template = false;                    // ora è “attivo”
        GAME_STATE.alliesRoster.push(unit);                  // metti in panchina
        moved.push(unit);
    }

    rebuildUnitIndex();
    renderBenches();

    const bench = document.getElementById('bench-allies');
    bench.style.boxShadow = '0 0 0 2px rgba(39,183,168,.55)';
    setTimeout(() => bench.style.boxShadow = '', 350);

    log(moved.length === 1 ? `Aggiunto in panchina ${moved[0].name}` : `Aggiunte ${moved.length} unità in panchina.`);
    openAccordionForRole(moved[0].role);
    scheduleSave();
}

/** Ricostruisce il pannello log a partire da log_list.
 *  @param {number} limit - numero massimo di voci da mostrare (le più recenti).
 */
function renderLogs() {
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

function renderHeader() {
    renderMissionUI();
    renderTimerUI();
}

function drawCard(type /* 'event' | 'consumable' */) {
    const d = GAME_STATE.decks[type];
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

function reshuffleDiscardsOf(type /* 'event' | 'consumable' */) {
    const d = GAME_STATE.decks[type];
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
    const evDraw = GAME_STATE.decks.event?.draw?.length || 0;
    const consDraw = GAME_STATE.decks.consumable?.draw?.length || 0;
    const handDraw = GAME_STATE.hand?.length || 0;

    const evBadge = document.querySelector('[data-deck-badge="event"]');
    const consBadge = document.querySelector('[data-deck-badge="consumable"]');
    const handBadge = document.querySelector('[data-deck-badge="showhand"]');
    if (evBadge) evBadge.textContent = evDraw;
    if (consBadge) consBadge.textContent = consDraw;
    if (handBadge) handBadge.textContent = handDraw;
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
    if (level <= DB.SETTINGS.xpTable.length) return DB.SETTINGS.xpTable[level - 1];
    // oltre la tabella: aumento progressivo
    let lastLevel = DB.SETTINGS.xpTable.length;
    let xp = DB.SETTINGS.xpTable[lastLevel - 1];
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

// === MALUS da Morale (allineato DB.SETTINGS.malusTable) ===
function malusFromMorale(moralePctRaw) {
    const moralePct = Math.max(0, Math.min(100, Number(moralePctRaw) || 0));
    // Trova la riga di tabella che copre il range del morale corrente (inclusivo)
    const row = DB.SETTINGS.malusTable.find(r =>
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
    return DB.SETTINGS.bonusTable
        .filter(b => level >= b.lvl)
        .map(b => ({ type: 'bonus', text: b.text, bonus: b.bonus }));
}

// Render unico
function renderBonusMalus() {
    if (!box) return;

    const level = levelFromXP(GAME_STATE.xpMoraleState.xp);
    const morale = Number(GAME_STATE.xpMoraleState.moralePct) || 0;

    // 1) raccogli pillole: bonus (cumulativi per soglia) + malus (unico per range)
    const pills = [
        ...bonusesFromLevel(level),
        ...malusFromMorale(morale),
    ];

    // 2) calcola la somma effettiva
    const totals = mergeBonuses(pills);
    // opzionale: salviamo nello state se vuoi riusarlo altrove
    GAME_STATE.xpMoraleState.effectiveBonus = totals;

    // 3) render UI pillole + somma finale
    const pillsHtml = pills.length
        ? pills.map(p => `<span class="pill ${p.type}">${p.text || ''}</span>`).join('')
        : '';

    const totalsHtml = `<span class="pill total">Totale: AGI ${fmtSigned(totals.agi)} • TEC ${fmtSigned(totals.tec)} • ATK ${fmtSigned(totals.atk)}</span>`;

    box.innerHTML = pillsHtml + totalsHtml;
}

function refreshXPUI() {
    const L = levelFromXP(GAME_STATE.xpMoraleState.xp);
    const pct = levelProgressPercent(GAME_STATE.xpMoraleState.xp, L);
    if (xpDOM.fill) xpDOM.fill.style.width = pct + "%";
    if (xpDOM.pct) xpDOM.pct.textContent = Math.round(pct) + "%";
    if (xpDOM.lvl) xpDOM.lvl.textContent = "Lv. " + L;
    renderBonusMalus();
}

function refreshMoraleUI() {
    const pct = Math.max(0, Math.min(100, Number(GAME_STATE.xpMoraleState.moralePct) || 0));
    if (moraleDOM.fill) moraleDOM.fill.style.width = pct + "%";
    if (moraleDOM.pct) moraleDOM.pct.textContent = Math.round(pct) + "%";
    renderBonusMalus();
}

// Helper: trova la riga malus corrispondente a una percentuale di morale
function getMalusRow(moralePct) {
    const m = Math.max(0, Math.min(100, Number(moralePct) || 0));
    return DB.SETTINGS.malusTable.find(r => m >= r.range.min && m <= r.range.max) || null;
}

// Mutatore con logging dettagliato
function addMorale(deltaPct) {
    const prev = Math.max(0, Math.min(100, Number(GAME_STATE.xpMoraleState.moralePct) || 0));
    const delta = Number(deltaPct) || 0;
    const next = Math.max(0, Math.min(100, prev + delta));

    // Aggiorna stato
    GAME_STATE.xpMoraleState.moralePct = next;

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
    const prevXP = GAME_STATE.xpMoraleState.xp;
    const prevLevel = levelFromXP(prevXP);

    // aggiorna XP (può salire o scendere)
    const nextXP = Math.max(0, prevXP + (Number(delta) || 0));
    GAME_STATE.xpMoraleState.xp = nextXP;

    const nextLevel = levelFromXP(nextXP);

    // UI immediata
    refreshXPUI();   // aggiorna barra, % e pillole
    scheduleSave();

    // Annunci di livello
    if (nextLevel > prevLevel) {
        for (let L = prevLevel + 1; L <= nextLevel; L++) {
            log(`Salito al livello ${L}!`, 'success');
            // evidenzia i bonus appena sbloccati (se presenti)
            const unlocked = DB.SETTINGS.bonusTable.filter(b => b.lvl === L);
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


function loadMissions() {
    setMissionByIndex(GAME_STATE.missionState.curIndex);
}

// Imposta missione corrente (per indice nell’array)
function setMissionByIndex(idx) {
    idx = clamp(idx, 0, DB.MISSIONS.length - 1);
    GAME_STATE.missionState.curIndex = idx;

    const m = DB.MISSIONS[idx];
    // Timer: totale = timerSec (o 1200)
    const total = Number(m?.timerSec) > 0 ? Math.floor(m.timerSec) : 1200;
    GAME_STATE.missionState.timerTotalSec = total;
    GAME_STATE.missionState.remainingSec = total;
    stopTimer();
    renderMissionUI();
    renderTimerUI();
    scheduleSave();
}

// Render UI missione (header + card)
function renderMissionUI() {
    const m = DB.MISSIONS[GAME_STATE.missionState.curIndex];
    const num = m?.id ?? (GAME_STATE.missionState.curIndex + 1);
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
    if (elTime) elTime.textContent = fmtClock(GAME_STATE.missionState.remainingSec);
    if (elPlay) elPlay.textContent = GAME_STATE.missionState.ticking ? '⏸' : '▶';
}

// Timer controls
function startTimer() {
    if (GAME_STATE.missionState.ticking) return;
    GAME_STATE.missionState.ticking = true;
    renderTimerUI();

    GAME_STATE.missionState.intervalId = setInterval(() => {
        GAME_STATE.missionState.remainingSec = clamp(GAME_STATE.missionState.remainingSec - 1, 0, GAME_STATE.missionState.timerTotalSec);
        renderTimerUI();

        if (GAME_STATE.missionState.remainingSec <= 0) {
            stopTimer();
            log("Tempo Scaduto! Ogni turno apparirà un gigante!")
            playCornoGuerra();
        }
    }, 1000);
}

function playCornoGuerra() {

}

function stopTimer() {
    GAME_STATE.missionState.ticking = false;
    if (GAME_STATE.missionState.intervalId) {
        clearInterval(GAME_STATE.missionState.intervalId);
        GAME_STATE.missionState.intervalId = null;
    }
    renderTimerUI();
    scheduleSave();
}

function resetTimer() {
    GAME_STATE.missionState.remainingSec = GAME_STATE.missionState.timerTotalSec || 1200;
    stopTimer();
    renderTimerUI();
    scheduleSave();
}

// Play/Pausa
elPlay?.addEventListener('click', () => {
    GAME_STATE.missionState.ticking ? stopTimer() : startTimer();
});

// Reset
elReset?.addEventListener('click', resetTimer);

// Cambia missione
elDec?.addEventListener('click', () => {
    setMissionByIndex(GAME_STATE.missionState.curIndex - 1);
});
elInc?.addEventListener('click', () => {
    setMissionByIndex(GAME_STATE.missionState.curIndex + 1);
});


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

    const last = getLastSaveInfo() || null;
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
        await playBg('./assets/sounds/risorsa_audio_avvio_app.mp3');
    }
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
        setDefaultGameStateData();
        return DB;
    } catch (e) {
        console.warn('Caricamento JSON fallito, uso i fallback locali:', e);
        return DB;
    }
}

(function setupRightAccordions() {
    const aside = document.querySelector('aside');
    if (!aside) return;

    const sections = Array.from(aside.querySelectorAll('.accordion-section'));

    // Applica lo stato iniziale letto da data-open (0/1)
    sections.forEach(sec => {
        const btn = sec.querySelector('.accordion-trigger');
        const panel = sec.querySelector('.accordion-panel');
        const open = sec.dataset.open === '1';
        btn?.setAttribute('aria-expanded', String(open));
        panel?.setAttribute('aria-hidden', String(!open));
    });

    function expandMax(sec) {
        // Calcola lo spazio disponibile totale dentro <aside>
        const styleAside = getComputedStyle(aside);
        const gap = parseFloat(styleAside.gap) || 0;
        const padT = parseFloat(styleAside.paddingTop) || 0;
        const padB = parseFloat(styleAside.paddingBottom) || 0;
        const total = aside.clientHeight;

        // Somma le altezze delle intestazioni di TUTTE le sezioni
        let consumed = padT + padB + gap * Math.max(0, sections.length - 1);
        sections.forEach(s => {
            const hdr = s.querySelector('.accordion-header');
            consumed += hdr ? hdr.offsetHeight : 0;
        });

        const max = Math.max(120, total - consumed - 8); // margine di sicurezza
        const inner = sec.querySelector('.accordion-inner');
        if (inner) inner.style.maxHeight = `${max}px`;
    }

    function openOne(target) {
        sections.forEach(sec => {
            const isTarget = sec === target;
            const btn = sec.querySelector('.accordion-trigger');
            const panel = sec.querySelector('.accordion-panel');

            sec.dataset.open = isTarget ? '1' : '0';
            btn?.setAttribute('aria-expanded', String(isTarget));
            panel?.setAttribute('aria-hidden', String(!isTarget));

            if (isTarget) expandMax(sec);
        });
    }

    // Click: apertura esclusiva. Se clicchi su quello già aperto: lo chiude.
    sections.forEach(sec => {
        const btn = sec.querySelector('.accordion-trigger');
        if (!btn) return;
        btn.addEventListener('click', () => {
            const isOpen = sec.dataset.open === '1';
            if (isOpen) {
                sec.dataset.open = '0';
                sec.querySelector('.accordion-panel')?.setAttribute('aria-hidden', 'true');
                btn.setAttribute('aria-expanded', 'false');
            } else {
                openOne(sec);
            }
        });
    });

    // Se una sezione è già aperta all’avvio (es. "Mura"), calcola subito l’altezza massima
    const initialOpen = sections.find(s => s.dataset.open === '1');
    if (initialOpen) expandMax(initialOpen);


    window.openRightAccordionById = function (id) {
        const sec = sections.find(s => s.id === id);
        if (sec) openOne(sec);
    };
})();

function openAccordionForRole(role) {
    const id = (role === 'enemy')
        ? 'giants-section'
        : (role === 'wall')
            ? 'walls-section'
            : 'allies-section'; // recruit/commander (default)

    if (typeof window.openRightAccordionById === 'function') {
        window.openRightAccordionById(id);
    }
}

// logica mano
function addCardToHand(deckType, card) {
    if (!card) return;
    GAME_STATE.hand.push({ deck: deckType, card: structuredClone(card) });
    scheduleSave();
}

function removeCardFromHand(index) {
    if (index < 0 || index >= GAME_STATE.hand.length) return null;
    const [it] = GAME_STATE.hand.splice(index, 1);
    scheduleSave();
    return it;
}

/** Scarta tutta la mano nei rispettivi scarti */
function discardFullHand() {
    let e = 0, c = 0;
    for (let i = GAME_STATE.hand.length - 1; i >= 0; i--) {
        const it = removeCardFromHand(i);
        if (!it) continue;
        const d = GAME_STATE.decks[it.deck];
        if (!d) continue;
        d.discard.push(it.card);
        if (it.deck === 'event') e++; else c++;
    }
    updateFabDeckCounters();
    if (e || c) log(`Scartate ${e ? `${e} Evento` : ''}${e && c ? ' e ' : ''}${c ? `${c} Consumabile` : ''} dalla mano.`, 'info');
}
window.addCardToHand = addCardToHand; // opzionale, comodo da console / altre parti


document.addEventListener('DOMContentLoaded', async () => {
    rebuildUnitIndex();
    // BOOT dati
    const booted = await loadDataAndStateFromLocal();

    if (!booted) {
        seedWallRows();              // crea segmenti mura 10/11/12
        renderBenches();
        renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);

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

    // Mostra welcome/bentornato
    setTimeout(() => { showWelcomePopup(!booted, "assets/img/comandanti/erwin_popup_benvenuto.jpg"); }, 60);
});

