
const TurnEngine = {
    phase: 'idle',   // 'idle' | 'setup' | 'round_start' | ...
    round: 0,
    teamCreated: false,

    init() {
        document.body.dataset.phase = this.phase; // utile anche per CSS mirato
        applyPhaseUI(this.phase);
        renderStartBtn();

        if (this.phase !== 'idle') {
            stopTimer();
            startTimer()
        }
    },

    async setPhaseMusic() {
        if (this.phase === 'setup') {
            await playBg('./assets/sounds/giganti_puri.mp3');
        }
        if (this.phase === 'move_phase') {
            await playBg('./assets/sounds/commander_march_sound.mp3');
        }
        if (this.phase === 'attack_phase') {
            await playBg('./assets/sounds/start_mission.mp3');
        }
        if (this.phase === 'event_card') {
            const ids = giantsRoster.map(giant => giant.id);
            if (spawnEvents.every(event => event === "Puro")) {
                await playBg('./assets/sounds/start_app.mp3');
            }
            if (spawnEvents.some(event => event === "Anomalo")) {
                await playBg(getMusicUrlById(ids.find(id => getMusicUrlById(id))) || './assets/sounds/ape_titan_sound.mp3');
            }
            if (spawnEvents.some(event => event === "Mutaforma")) {
                await playBg(getMusicUrlById(ids.find(id => getMusicUrlById(id))) || './assets/sounds/start_app.mp3');
            }
        }
    },

    setPhase(p) {
        this.phase = p;
        document.body.dataset.phase = p; // utile anche per CSS mirato
        applyPhaseUI(p);
        renderStartBtn();
        scheduleSave();
    },

    async startPhase(phase) {
        // entra in setup (senza limiti di movimento)

        if (phase === 'idle') {
            this.setPhase('setup');
            await playBg('./assets/sounds/giganti_puri.mp3');
            startTimer();

            if (!this.teamCreated) {
                try {
                    pickRandomTeam({ commanders: 1, recruits: 3 });
                    openAccordionForRole('commander');
                } catch { }
                this.teamCreated = true;
                log('Setup: posiziona e sistema la squadra come vuoi con 3 movimenti disponibili per unità, poi premi "Termina Setup".', 'info');
            } else {
                log('Setup: Hai 3 movimenti disponibili per unità, poi premi "Termina Setup".', 'info');
            }
        }

        if (phase === 'event_mission') {
            this.setPhase('event_card');
            const m = DB.MISSIONS[GAME_STATE.missionState.curIndex];
            const spawnEvents = m.event_spawn;
            const ids = [];
            if (spawnEvents && spawnEvents.length > 0) {

                for (const event of spawnEvents) {
                    const id = await spawnGiant(event, true);
                    ids.push(id);
                }

                await playSfx('./assets/sounds/flash_effect_sound.mp3', { volume: 0.3, loop: false });

                if (spawnEvents.every(event => event === "Puro")) {
                    await playBg('./assets/sounds/start_app.mp3');
                }

                if (spawnEvents.some(event => event === "Anomalo")) {
                    await playBg(getMusicUrlById(ids.find(id => getMusicUrlById(id))) || './assets/sounds/ape_titan_sound.mp3');
                }

                if (spawnEvents.some(event => event === "Mutaforma")) {
                    await playBg(getMusicUrlById(ids.find(id => getMusicUrlById(id))) || './assets/sounds/start_app.mp3');
                }

                openAccordionForRole("enemy");
            }


        }

        if (phase === 'round_start') {
            this.setPhase('move_phase');
            startTimer();
            this.round++;
            log(`Round ${this.round} iniziato.`, 'success');
            advanceAllCooldowns(1, { giantsOnly: true });
            tickUnitModsOnNewRound();
            log(`Fase Movimento ${TurnEngine.round}° ROUND: Effettua una azione di movimento per unità, poi clicca su Termina Fase Movimento`, 'info');
            await playBg('./assets/sounds/commander_march_sound.mp3');
        }
    },

    async endPhase(phase) {
        if (phase === 'setup') {
            const flagAlleatoInGriglia = GAME_STATE.alliesRoster.some(ally => GAME_STATE.spawns.some(s => (s.unitIds ?? []).includes(ally.id)));
            if (flagAlleatoInGriglia) {
                this.setPhase('event_mission');
                log(`Setup Missione: Clicca su Evento per generare lo spawn dei giganti associati alla missione`, 'info');
            } else {
                log(`Setup Missione: Trascina almeno un'unità della tua squadra in campo`, 'info');
            }
        }

        if (phase === 'event_card') {
            const card = drawCard('event');

            if (!card) {
                log('Il mazzo è vuoto. Rimescola gli scarti o ricarica le carte.', 'warning');
                closeAllFabs();
                return;
            }
            log(`Pescata carta evento: "${card.name}".`);
            await playSfx('assets/sounds/carte/carta_evento.mp3', { volume: 0.3, loop: false });

            showDrawnCard('event', card);

            this.setPhase('round_start');
        }

        if (phase === 'move_phase') {
            log('I giganti iniziano a muoversi...', 'warning');
            giantsPhaseMove();
            this.setPhase('attack_phase');
            log(`Fase Attacco ${TurnEngine.round}° ROUND: Scegli i bersagli che ingaggeranno battaglia`, 'info');
            await playBg('./assets/sounds/start_mission.mp3');
        }

        if (phase === 'attack_phase') {
            this.setPhase('round_start');
            log(`Fase Finale ${TurnEngine.round}° ROUND`, 'info');

            const flagTempoNonScaduto = GAME_STATE.missionState.remainingSec;
            if (this.round % 2 === 0 || flagTempoNonScaduto === 0) {
                const card = drawCard('event');

                if (!card) {
                    log('Il mazzo è vuoto. Rimescola gli scarti o ricarica le carte.', 'warning');
                    closeAllFabs();
                    return;
                }
                log(`Pescata carta evento: "${card.name}".`);
                await playSfx('assets/sounds/carte/carta_evento.mp3', { volume: 0.3, loop: false });

                showDrawnCard('event', card);
            }

        }

        if (phase === 'end_round') {
            this.setPhase('round_start');
            await playBg('./assets/sounds/start_mission.mp3');
        }
    }
};

/* ================== MINI MIXER con DUCKING ================== */
/* ================== HYBRID MIXER (WebAudio su iOS/moderni, fallback su volume) ================== */
function clampAudio(v, a, b) { return Math.max(a, Math.min(b, v)); }

const GAME_SOUND_TRACK = { background: null };
// ====== AUDIO BOOTSTRAP (mobile friendly) ======
let AUDIO_UNLOCKED = false;
let PENDING_BG = null; // { url, opts }

function initAudio() {
    if (AUDIO_UNLOCKED) return;
    AUDIO_UNLOCKED = true;

    // 1) WebAudio: crea/risveglia il context se c’è
    try { MIXER.ensureCtx?.(); MIXER._ctx?.resume?.(); } catch { }

    // 2) HTMLAudio: “kick” silenzioso per iOS/Android
    try {
        const a = new Audio();
        a.src = 'data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAA'; // brevissimo silenzio
        a.muted = true;
        a.play().then(() => { a.pause(); a.remove(); }).catch(() => { });
    } catch { }

    // 3) se avevamo chiesto una musica prima dello sblocco, avviala ora
    if (PENDING_BG) {
        const { url, opts } = PENDING_BG;
        PENDING_BG = null;
        playBg(url, opts);
    }
}

// sblocca al primo gesto (meglio pointerdown/touchstart)
document.addEventListener('DOMContentLoaded', () => {
    const once = { once: true, passive: true };
    document.addEventListener('pointerdown', () => initAudio(), once);
    document.addEventListener('touchstart', () => initAudio(), once);
});

function waitForUserGestureOnce(cb) {
    const h = () => {
        try { cb(); } catch { }
        window.removeEventListener('pointerup', h);
        window.removeEventListener('touchend', h);
        document.removeEventListener('keydown', h);
    };
    window.addEventListener('pointerup', h, { once: true, passive: true });
    window.addEventListener('touchend', h, { once: true, passive: true });
    document.addEventListener('keydown', h, { once: true });
}

function unlockAudioOnFirstTap(ctxGetter) {
    if (AUDIO_UNLOCKED) return;
    waitForUserGestureOnce(async () => {
        try {
            // 1) sblocca WebAudio (se presente)
            const ctx = ctxGetter?.();
            if (ctx && ctx.state !== 'running') { try { await ctx.resume(); } catch { } }

            // 2) “kick” per HTML5 audio
            const a = new Audio();
            a.src = 'data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAA'; // brevissimo silenzio
            a.muted = true;
            await a.play().catch(() => { });
            a.pause();

            AUDIO_UNLOCKED = true;

            // riprova la musica di background se pronta
            try { GAME_SOUND_TRACK.background?.play(); } catch { }
        } catch { }
    });
}

const MIXER = (() => {
    const RAW_WA = !!(window.AudioContext || window.webkitAudioContext);
    const IS_MOBILE = /iP(ad|hone|od)|Android/i.test(navigator.userAgent);
    let useWA = RAW_WA && !IS_MOBILE;

    let ctx = null, master = null;
    const bus = { music: null, sfx: null };

    const state = {
        cfg: {
            master: 1.0,
            music: 0.25,
            sfx: 1.0,
            ducking: { duckTo: 0.18, attack: 0.06, release: 0.25, holdMs: 350 } // iOS-friendly
        },
        musicEl: null,
        _activeSfx: 0,
        // fallback path (no WebAudio)
        _duckLevel: 1,
        _fadeRAF: null,
        _holdT: null
    };

    function setMusicVolume(v) {
        v = clampAudio(parseFloat(v) || 0, 0, 1);
        state.cfg.music = v;

        if (useWA && ensureCtx()) {
            // interrompe eventuali automazioni in corso e imposta subito il valore
            const now = ctx.currentTime;
            bus.music.gain.cancelScheduledValues(now);
            bus.music.gain.setValueAtTime(v, now);
        } else {
            // fallback: ricalcola il volume del tag
            _applyMusicVolumeFallback(true);
        }
    }

    function setSfxVolume(v) {
        v = clampAudio(parseFloat(v) || 0, 0, 1);
        state.cfg.sfx = v;

        if (useWA && ensureCtx()) {
            const now = ctx.currentTime;
            bus.sfx.gain.cancelScheduledValues(now);
            bus.sfx.gain.setValueAtTime(v, now);
        } else {
            // non possiamo riparametrare SFX già in riproduzione;
            // i prossimi SFX useranno il nuovo livello (via trackSfx).
        }
    }


    function ensureCtx() {
        if (!useWA) return null;
        if (ctx) return ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = state.cfg.master; master.connect(ctx.destination);
        bus.music = ctx.createGain(); bus.music.gain.value = state.cfg.music; bus.music.connect(master);
        bus.sfx = ctx.createGain(); bus.sfx.gain.value = state.cfg.sfx; bus.sfx.connect(master);
        return ctx;
    }

    function _wireWA(el, group, elVol = 1) {
        ensureCtx();
        if (!el._wiredWA) {
            const src = ctx.createMediaElementSource(el);
            const gain = ctx.createGain();
            gain.gain.value = clampAudio(elVol, 0, 1);
            src.connect(gain);
            gain.connect(group === 'music' ? bus.music : bus.sfx);
            el._waSrc = src;
            el._waGain = gain;
            el._wiredWA = true;
            el.volume = 1; // il mix lo fa il GainNode
        } else if (el._waGain) {
            el._waGain.gain.value = clampAudio(elVol, 0, 1);
        }
    }

    function _duckOnceWA() {
        ensureCtx();
        const { duckTo, attack, release, holdMs } = state.cfg.ducking;
        const now = ctx.currentTime;
        bus.music.gain.cancelScheduledValues(now);
        const targetDown = clampAudio(state.cfg.music * duckTo, 0, 1);

        // attack
        bus.music.gain.setTargetAtTime(targetDown, now, Math.max(0.01, attack));

        // release after hold
        setTimeout(() => {
            const t = ctx.currentTime;
            bus.music.gain.cancelScheduledValues(t);
            bus.music.gain.setTargetAtTime(state.cfg.music, t, Math.max(0.01, release));
        }, holdMs);
    }

    // ===== Fallback ducking (senza WebAudio): usa el.volume e una curva con RAF =====
    function _applyMusicVolumeFallback(force = false) {
        if (!state.musicEl) return;
        const base = (typeof state.musicEl._baseVol === 'number') ? state.musicEl._baseVol : (state.musicEl.volume ?? 1);
        const v = clampAudio(base * state.cfg.master * state.cfg.music * state._duckLevel, 0, 1);
        if (force || Math.abs((state.musicEl.volume ?? 0) - v) > 0.001) state.musicEl.volume = v;
    }
    function _duckToFallback(target) {
        clearTimeout(state._holdT);
        if (!state.musicEl) return;
        const start = state._duckLevel;
        const end = clampAudio(target, 0, 1);
        if (Math.abs(start - end) < 0.001) return;
        const dur = Math.max(30, 160);
        const t0 = performance.now();
        if (state._fadeRAF) cancelAnimationFrame(state._fadeRAF);
        const step = (t) => {
            const k = Math.min(1, (t - t0) / dur);
            const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
            state._duckLevel = start + (end - start) * e;
            _applyMusicVolumeFallback();
            if (k < 1) state._fadeRAF = requestAnimationFrame(step);
        };
        state._fadeRAF = requestAnimationFrame(step);
    }

    function _sfxStart() {
        state._activeSfx++;
        if (state._activeSfx === 1) {
            if (useWA) _duckOnceWA();
            else _duckToFallback(state.cfg.ducking.duckTo);
        }
    }
    function _sfxEnd() {
        state._activeSfx = Math.max(0, state._activeSfx - 1);
        if (state._activeSfx === 0) {
            if (useWA) {
                // WA già programma il release nel _duckOnceWA; qui non serve altro
            } else {
                clearTimeout(state._holdT);
                state._holdT = setTimeout(() => _duckToFallback(1), state.cfg.ducking.holdMs);
            }
        }
    }

    function setConfig(partial) {
        if (partial.ducking) {
            state.cfg.ducking = { ...state.cfg.ducking, ...partial.ducking };
            delete partial.ducking;
        }
        Object.assign(state.cfg, partial);

        if (useWA && ensureCtx()) {
            master.gain.value = state.cfg.master;
            bus.music.gain.value = state.cfg.music;
            bus.sfx.gain.value = state.cfg.sfx;
        } else {
            _applyMusicVolumeFallback(true);
        }
    }

    function setMusicEl(el) {
        state.musicEl = el;
        if (useWA && ensureCtx()) {
            _wireWA(el, 'music', 1); // il livello della musica lo controlla bus.music.gain
            // con WA il volume HTML rimane a 1
        } else {
            el._baseVol = (typeof el._baseVol === 'number') ? el._baseVol : (el.volume ?? 1);
            _applyMusicVolumeFallback(true);
        }
    }

    function trackSfx(el, baseVol = 1) {
        if (useWA && ensureCtx()) {
            _wireWA(el, 'sfx', clamp(baseVol, 0, 1));
        } else {
            // fallback: gestiamo volume del tag direttamente (no duck sugli sfx)
            el.volume = clamp(baseVol * state.cfg.master * state.cfg.sfx, 0, 1);
        }

        const onStart = () => _sfxStart();
        const onEnd = () => {
            el.removeEventListener('ended', onEnd);
            el.removeEventListener('pause', onEnd);
            el.removeEventListener('error', onEnd);
            _sfxEnd();
        };

        if (!el.paused) onStart(); else el.addEventListener('play', onStart, { once: true });
        el.addEventListener('ended', onEnd);
        el.addEventListener('pause', onEnd);
        el.addEventListener('error', onEnd);
    }

    return { setConfig, setMusicEl, trackSfx, ensureCtx, _state: state, _bus: bus, _supportsWA: useWA, get _ctx() { return ctx; }, setMusicVolume, setSfxVolume };
})();
window.MIXER = MIXER;
const setMixerConfig = (p) => MIXER.setConfig(p);

// ======= API DI RIPRODUZIONE (stesse tue firme) =======

async function play(url, opts = {}) {
    const { loop = false, volume = 1 } = opts;
    MIXER.ensureCtx(); // crea l’audio context se disponibile

    const audio = new Audio();
    audio.src = url;
    audio.preload = 'auto';
    audio.loop = loop;
    audio.playsInline = true; // innocuo su desktop, utile su iOS
    // Con WebAudio lasciamo volume tag a 1; nel fallback usiamo quello passato
    audio.volume = MIXER._supportsWA ? 1 : clampAudio(volume, 0, 1);
    // audio.crossOrigin = 'anonymous'; // se i file sono same-origin puoi anche NON metterlo

    // Se non è sbloccato, non forzare subito .play(): lasciamo che initAudio gestisca
    if (!AUDIO_UNLOCKED) {
        // Non tentare play qui: iOS lo bloccherebbe.
        return audio;
    }

    try { await audio.play(); }
    catch (e) { console.warn('Autoplay blocked:', e); }
    return audio;
}

// --- MUSICA di fondo (registrata nel mixer)
async function playBg(url, { volume = 0.18, loop = true } = {}) {
    // se non sbloccato, metti in coda e basta
    if (!AUDIO_UNLOCKED) {
        PENDING_BG = { url, opts: { volume, loop } };
        return null;
    }

    try { if (loop) GAME_SOUND_TRACK.background?.pause(); } catch { }

    const music = await play(url, { loop, volume });

    GAME_SOUND_TRACK.background = music;
    music.playsInline = true;
    MIXER.setMusicEl(music);

    // nel fallback (no WebAudio) usare volume base per calcolo
    if (!MIXER._supportsWA) music._baseVol = volume;

    // prova a partire (se non è già partita in play(), o se play() è stato “soft”)
    try { await music.play(); } catch (e) { console.warn('BG play error:', e); }

    return music;
}


async function playSfx(url, { volume = 1, loop = false } = {}) {
    const sfx = await play(url, { loop, volume });
    MIXER.trackSfx(sfx, volume);
    try { await sfx.play(); } catch { }
    return sfx;
}


document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        try { GAME_SOUND_TRACK.background?.play(); } catch { }
    }
});

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
        intervalId: null,
        kills: {
            Puro: 0,
            Anomalo: 0,
            Mutaforma: 0
        }
    },
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
    turnEngine: TurnEngine
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
const elMissionCardWrap = document.getElementById('mission-panel');        // container card

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


// --- Unit Mods: modello ad effetti cumulativi -------------------------------
function statKeysForRole(role) { return (role === 'enemy') ? ['atk', 'cd', 'tot'] : ['atk', 'tec', 'agi', 'tot']; }

function ensureUnitModsObj(uid) {
    const bag = (GAME_STATE.unitMods ||= {});
    return (bag[uid] ||= { mission: [], timed: [] }); // timed = con durata (roundsLeft)
}

function addUnitMod(uid, role, { stat, value, scope = 'mission', rounds = 1 }) {
    const store = ensureUnitModsObj(uid);
    const entry = { id: 'mod_' + Math.random().toString(36).slice(2, 9), stat, value: Number(value) || 0 };
    if (scope === 'round') { entry.roundsLeft = Math.max(1, rounds | 0); store.timed.push(entry); }
    else { store.mission.push(entry); }
    scheduleSave?.();
    return entry.id;
}

function removeUnitMod(uid, scope, id) {
    const store = ensureUnitModsObj(uid);
    const arr = (scope === 'round') ? store.timed : store.mission;
    const i = arr.findIndex(x => x.id === id);
    if (i >= 0) { arr.splice(i, 1); scheduleSave?.(); return true; }
    return false;
}

// Somma tutti gli effetti attivi (mission + timed con roundsLeft>0)
function getUnitActiveMods(uid, role) {
    const keys = statKeysForRole(role);
    const out = Object.fromEntries(keys.map(k => [k, 0]));
    const store = ensureUnitModsObj(uid);

    for (const m of store.mission) { if (m && out[m.stat] != null) out[m.stat] += Number(m.value) || 0; }
    for (const m of store.timed) { if (m && (m.roundsLeft || 0) > 0 && out[m.stat] != null) out[m.stat] += Number(m.value) || 0; }

    return out;
}

// (opz.) comodo: i modificatori per i tiri (TOT si aggiunge alle prove d20)
function getUnitRollMods(uid, role) {
    const m = getUnitActiveMods(uid, role);
    if (role === 'enemy') return { atk: (m.atk || 0) + (m.tot || 0), cd: (m.cd || 0) };
    return {
        atk: (m.atk || 0) + (m.tot || 0),
        tec: (m.tec || 0) + (m.tot || 0),
        agi: (m.agi || 0) + (m.tot || 0),
        tot: (m.tot || 0)
    };
}

// Chiamala a inizio di ogni nuovo round per scalare durate
function tickUnitModsOnNewRound() {
    const bag = GAME_STATE.unitMods || {};
    for (const uid in bag) {
        const timed = bag[uid].timed || [];
        for (const ef of timed) if (ef.roundsLeft > 0) ef.roundsLeft--;
        bag[uid].timed = timed.filter(ef => (ef.roundsLeft || 0) > 0);
    }
    scheduleSave?.();
}


// Considera roster e/o unità sul campo
function isOnField(unitId) {
    return GAME_STATE.spawns?.some(s => Array.isArray(s.unitIds) ? s.unitIds.includes(unitId) : s.unitId === unitId) || false;
}
function activeUnitsForMods() {
    const allies = (GAME_STATE.alliesRoster || []).filter(u => isOnField(u.id) || true);  // in missione
    const giants = (GAME_STATE.giantsRoster || []).filter(u => isOnField(u.id) || true);  // in missione
    // solo reclute/commander e enemy (no walls)
    return [...allies, ...giants].filter(u => u.role !== 'wall');
}

// lettura mod attuali (safe)
function getUnitMods(unitId) { return GAME_STATE.unitMods[unitId] || { scope: 'turn' }; }

// set + save + refresh fields
function setUnitMods(unitId, patch) {
    const cur = getUnitMods(unitId);
    GAME_STATE.unitMods[unitId] = { ...cur, ...patch };
    scheduleSave?.();
}

// util per colorare il valore
function applySignAttr(el, v) {
    if (!el) return;
    const n = Number(v) || 0;
    el.setAttribute('data-sign', n > 0 ? 'pos' : (n < 0 ? 'neg' : ''));
}

// ——— dipendenze minime ———
// GAME_STATE.unitMods = { [unitId]: { scope:'turn'|'mission', atk?:n, agi?:n, tec?:n, cd?:n } }
// unitById: Map
// activeUnitsForMods(): array di unità attive (reclute/commander/enemy) — come già fai
// scheduleSave(): tua funzione
// getUnitMods/setUnitMods: se non le hai, inline sotto

function getUnitMods(unitId) {
    return (GAME_STATE.unitMods && GAME_STATE.unitMods[unitId]) || { scope: 'turn' };
}
function setUnitMods(unitId, patch) {
    const cur = getUnitMods(unitId);
    GAME_STATE.unitMods[unitId] = { ...cur, ...patch };
    scheduleSave?.();
}

// utilmini
const UM_STAT_LABELS = { atk: 'ATK', tec: 'TEC', agi: 'AGI', cd: 'CD' };
const signClass = n => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero');
const fmtSigned = n => (n > 0 ? `+${n}` : `${n}`);
const isEnemy = u => u?.role === 'enemy';

function unitListForPicker() {
    const ids = new Set();
    const out = [];

    // 1) Unità sulla griglia
    for (const s of (GAME_STATE?.spawns || [])) {
        const arr = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
        for (const id of arr) {
            const u = unitById?.get ? unitById.get(id) : null;
            if (u && u.role !== 'wall' && !ids.has(u.id)) { ids.add(u.id); out.push(u); }
        }
    }

    // 2) Roster in missione (alleati + giganti)
    for (const u of [...(GAME_STATE?.alliesRoster || []), ...(GAME_STATE?.giantsRoster || [])]) {
        if (!u || !u.id || u.role === 'wall' || ids.has(u.id)) continue;
        ids.add(u.id);
        out.push(unitById?.get ? (unitById.get(u.id) || u) : u);
    }

    // 3) Fallback: tutto ciò che c’è in unitById (no template)
    if (!out.length && unitById?.size) {
        for (const u of unitById.values()) {
            if (u && ['recruit', 'commander', 'enemy'].includes(u.role) && u.template !== true && !ids.has(u.id)) {
                ids.add(u.id); out.push(u);
            }
        }
    }

    return out;
}


// storage semplice: attacco la lista effetti all’oggetto unità
function ensureModsStore(u) {
    if (!u._effects) u._effects = []; // {id, stat, delta, rounds, type:'mission'|'round'}
    return u._effects;
}

function mountUnitModsUI() {
    const root = document.querySelector('#mods-unit-panel .accordion-inner');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';

    // se nel markup fosse rimasto un vecchio scope “statico”, rimuovilo
    root.querySelectorAll('.um > .um-scope').forEach(n => n.remove());

    // riferimenti header già presenti in HTML
    const btnPicker = root.querySelector('#um-picker');
    const menu = root.querySelector('#um-menu');
    const imgAva = root.querySelector('#um-ava');
    const nameEl = root.querySelector('#um-name');
    const roleEl = root.querySelector('#um-role');
    const btnReset = root.querySelector('#um-reset');

    const rowsBox = root.querySelector('#um-rows');

    // stato locale
    let units = unitListForPicker();
    let current = units[0] || null;

    // ============ render picker menu ============
    function renderMenu() {
        units = unitListForPicker(); // ✅ ricalcola qui
        if (!units.length) {
            menu.innerHTML = `<div class="um-opt" style="opacity:.8;cursor:default">Nessuna unità disponibile</div>`;
            return;
        }
        menu.innerHTML = units.map(u => `
    <div class="um-opt" data-id="${u.id}">
      <span class="ava"><img src="${u.img || u.avatar || 'assets/img/logo.jpg'}" alt=""></span>
      <span class="name">${u.name || '(sconosciuto)'}</span>
      <span class="sub">${u.role === 'enemy' ? 'Gigante' : (u.role === 'commander' ? 'Comandante' : 'Recluta')}</span>
    </div>
  `).join('');
    }

    function setPicker(u) {
        current = u || null;
        if (!current) {
            imgAva.src = 'assets/img/logo.jpg';
            nameEl.textContent = 'Seleziona unità';
            roleEl.textContent = '—';
            rowsBox.innerHTML = `<div style="opacity:.8">Nessuna unità selezionata.</div>`;
            return;
        }
        imgAva.src = current.img || current.avatar || 'assets/img/logo.jpg';
        nameEl.textContent = current.name || '(sconosciuto)';
        roleEl.textContent = (current.role === 'enemy' ? 'Gigante' : (current.role === 'commander' ? 'Comandante' : 'Recluta'));
        renderRows();
    }

    function renderRows() {
        if (!current) { rowsBox.innerHTML = ''; return; }
        const stats = isEnemy(current) ? ['atk', 'cd'] : ['atk', 'tec', 'agi'];

        rowsBox.innerHTML = `
  <div class="um-card">

    <!-- riga stat + valore -->
    <div class="um-line um-editor-row">

    <span id="um-label" class="rm-chip">Modificatore</span>

      <select id="um-stat" class="um-select">
        ${stats.map(s => `<option value="${s}">${UM_STAT_LABELS[s]}</option>`).join('')}
      </select>

      <div class="um-step">
        <button class="um-btn" data-act="vminus" title="- valore">−</button>
        <input id="um-value" type="number" value="1" hidden>
        <span id="um-value-chip" class="rm-chip">+1</span>
        <button class="um-btn" data-act="vplus" title="+ valore">+</button>
      </div>
    </div>

    <!-- riga durata (dentro la card) -->
    <div class="um-line um-dur">
         <span id="um-label" class="rm-chip">Durata</span>
      <select id="um-scope" class="um-select um-sel-sm">
  <option value="mission">Missione</option>
  <option value="round">N° Round</option>
</select>


      <div class="um-step">
        <button class="um-btn" data-act="rminus" title="- round">−</button>
        <input id="um-rounds" type="number" min="1" value="1" hidden>
        <span id="um-rounds-chip" class="rm-chip">1</span>
        <button class="um-btn" data-act="rplus" title="+ round">+</button>
      </div>
    </div>

    <!-- CTA in basso a dx -->
    <div class="um-actions um-dur">
      <button id="um-add" class="um-addfab" type="button">Aggiungi Moficatore</button>
    </div>
  </div>

  <div id="um-totals" class="um-totals" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;"></div>
<hr class="um-sep">
  <div id="um-list" class="um-list" style="display:flex;flex-direction:column;gap:8px;"></div>
`;

        // === refs
        const scopeRadios = rowsBox.querySelectorAll('input[name="um-scope"]');
        const scopeSel = rowsBox.querySelector('#um-scope');

        const roundsInput = rowsBox.querySelector('#um-rounds');
        const roundsChip = rowsBox.querySelector('#um-rounds-chip');
        const valInput = rowsBox.querySelector('#um-value');
        const valChip = rowsBox.querySelector('#um-value-chip');
        const editorRow = rowsBox.querySelector('.um-editor-row');
        const addBtn = rowsBox.querySelector('#um-add');

        // init chips
        valChip.textContent = fmtSigned(parseInt(valInput.value || 0, 10));
        if (editorRow) editorRow.dataset.sign = signClass(parseInt(valInput.value || 0, 10));
        roundsChip.textContent = String(parseInt(roundsInput.value || 1, 10));

        // abilita/disabilita durata in base a Missione/Round
        const setRoundsEnabled = () => {
            const scope = scopeSel.value;
            const disabled = (scope === 'mission');
            roundsInput.disabled = disabled;
            rowsBox.querySelector('[data-act="rminus"]').disabled = disabled;
            rowsBox.querySelector('[data-act="rplus"]').disabled = disabled;
            roundsChip.style.opacity = disabled ? .6 : 1;
        };
        scopeSel.addEventListener('change', setRoundsEnabled);
        setRoundsEnabled();

        // (ri)aggancia ogni volta, usando riferimenti freschi
        if (rowsBox._handler) rowsBox.removeEventListener('click', rowsBox._handler);

        rowsBox._handler = (e) => {
            const b = e.target.closest('[data-act]');
            if (!b) return;
            const act = b.dataset.act;

            // prendi i riferimenti dal DOM *attuale*
            const valInput = rowsBox.querySelector('#um-value');
            const valChip = rowsBox.querySelector('#um-value-chip');
            const roundsInput = rowsBox.querySelector('#um-rounds');
            const roundsChip = rowsBox.querySelector('#um-rounds-chip');
            const editorRow = rowsBox.querySelector('.um-editor-row');

            if (!valInput || !valChip || !roundsInput || !roundsChip) return;

            if (act === 'vminus' || act === 'vplus') {
                const step = (act === 'vminus') ? -1 : 1;
                const next = (parseInt(valInput.value || 0, 10) || 0) + step;
                valInput.value = next;
                valChip.textContent = fmtSigned(next);
                if (editorRow) editorRow.dataset.sign = signClass(next);
            }

            if ((act === 'rminus' || act === 'rplus') && !roundsInput.disabled) {
                const step = (act === 'rminus') ? -1 : 1;
                const next = Math.max(1, (parseInt(roundsInput.value || 1, 10) || 1) + step);
                roundsInput.value = next;
                roundsChip.textContent = String(next);
            }
        };

        rowsBox.addEventListener('click', rowsBox._handler);

        // aggiungi effetto
        addBtn.addEventListener('click', () => {
            const stat = rowsBox.querySelector('#um-stat').value;
            const delta = parseInt(valInput.value, 10) || 0;
            if (!delta) return;

            const scope = scopeSel.value;
            const rounds = (scope === 'mission') ? Infinity : Math.max(1, parseInt(roundsInput.value, 10) || 1);

            const effs = ensureModsStore(current);
            effs.push({ id: 'e' + Math.random().toString(36).slice(2), stat, delta, rounds, type: scope });
            renderList();
            renderTotals();
            scheduleSave?.();
        });

        renderList();
        renderTotals();
    }
    function renderTotals() {
        const box = rowsBox.querySelector('#um-totals');
        if (!box || !current) return;

        const stats = isEnemy(current) ? ['atk', 'cd'] : ['atk', 'tec', 'agi'];
        const effs = ensureModsStore(current);
        const sums = {};
        stats.forEach(s => sums[s] = 0);
        effs.forEach(e => { if (sums.hasOwnProperty(e.stat)) sums[e.stat] += (e.delta | 0); });

        box.innerHTML = stats.map(s => {
            const v = sums[s] || 0;
            const sig = v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero';
            const color =
                sig === 'pos' ? 'color:#b7ffcf;border-color:#245f3c;background:#0f1713;' :
                    sig === 'neg' ? 'color:#ffd0d0;border-color:#5a2a2a;background:#191214;' :
                        'color:#e5e5e5;border-color:#2a2a2a;background:#10121a;';
            return `<span class="tot-chip" data-sign="${sig}"
             style="padding:4px 8px;border:1px solid;border-radius:999px;${color}">
             ${UM_STAT_LABELS[s]} <strong style="margin-left:4px;">${fmtSigned(v)}</strong>
            </span>`;
        }).join('');
    }

    function renderList() {
        const list = rowsBox.querySelector('#um-list');
        const effs = ensureModsStore(current);

        // ordina per durata: prima quelle che scadono prima, poi ∞
        effs.sort((a, b) => {
            const da = a.rounds === Infinity ? Number.POSITIVE_INFINITY : a.rounds;
            const db = b.rounds === Infinity ? Number.POSITIVE_INFINITY : b.rounds;
            return da - db;
        });

        if (!effs.length) {
            list.innerHTML = `<div style="opacity:.7;font-size:12px;">Nessun modificatore.</div>`;
            return;
        }

        list.innerHTML = effs.map(e => {
            const sign = signClass(e.delta);
            const durTxt = (e.rounds === Infinity) ? 'Per tutta la Missione' : `Per ${e.rounds} round`;
            return `
        <div class="um-pill" data-id="${e.id}" data-sign="${sign}"
             style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--b,#2a2a2a);border-radius:10px;background:#0f1118;">
          <span class="um-label" style="opacity:.9, font-weight: 700;">${UM_STAT_LABELS[e.stat] || e.stat}</span>
          <span class="um-val" style="font-weight:700;">${fmtSigned(e.delta)}</span>
          <span style="margin-left:auto;opacity:.8;">${durTxt}</span>
          <button class="btn-icon um-del" title="Rimuovi">×</button>
        </div>
      `;
        }).join('');

        // colori
        list.querySelectorAll('.um-pill').forEach(p => {
            const s = p.dataset.sign;
            if (s === 'pos') { p.style.setProperty('--b', '#245f3c'); p.style.color = '#b7ffcf'; }
            else if (s === 'neg') { p.style.setProperty('--b', '#5a2a2a'); p.style.color = '#ffd0d0'; }
            else { p.style.setProperty('--b', '#2a2a2a'); p.style.color = '#e5e5e5'; }
        });

        // remove handler
        list.querySelectorAll('.um-del').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.closest('.um-pill')?.dataset.id;
                const effs = ensureModsStore(current);
                const i = effs.findIndex(x => x.id === id);
                if (i >= 0) effs.splice(i, 1);
                renderList();
                renderTotals();
                scheduleSave?.();
            });
        });
    }

    // ============ picker interactions ============
    const closeMenu = (ev) => {
        if (!menu.hidden && !menu.contains(ev.target) && !btnPicker.contains(ev.target)) {
            menu.hidden = true;
        }
    };
    document.addEventListener('click', closeMenu);

    btnPicker.addEventListener('click', () => {
        if (menu.hidden) { renderMenu(); menu.hidden = false; }
        else menu.hidden = true;
    });
    menu.addEventListener('click', (e) => {
        const item = e.target.closest('.um-opt');
        if (!item) return;
        const u = units.find(x => x.id === item.dataset.id);
        menu.hidden = true;
        setPicker(u);
    });

    btnReset.addEventListener('click', () => {
        if (!current) return;
        current._effects = [];
        renderRows();
        scheduleSave?.();
    });

    // prima selezione
    setPicker(current);
}

// chiama una volta a DOM pronto
// mountUnitModsUI();


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
        modRolls: structuredClone(GAME_STATE.modRolls),
        unitMods: structuredClone(GAME_STATE.unitMods),
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
    Object.assign(GAME_STATE.modRolls, save.modRolls || {});
    Object.assign(GAME_STATE.unitMods, save.unitMods || {});
    Object.assign(GAME_STATE.missionState, save.missionState || {});
    Object.assign(GAME_STATE.turnEngine, save.turnEngine || TurnEngine);
    GAME_STATE.missionState.intervalId = null; // sempre nullo a cold start

    // 4) ricostruisci unitById dai cataloghi + muri base
    unitById.clear();


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
    rebuildUnitIndex(); // mette alliesRoster + giantsRoster + walls (base)
    // 7) UI refresh
    initSidebars();
    refreshXPUI();
    refreshMoraleUI();
    renderBonusMalus();
    renderBenches();
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
    renderHeader();
    renderLogs();
    updateFabDeckCounters();
    refreshRollModsUI();
    mountUnitModsUI();
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
// Tutte le occorrenze
function findUnitCells(unitId) {
    const cells = [];
    for (const s of GAME_STATE.spawns) {
        const arr = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
        if (arr.includes(unitId)) {
            cells.push({ row: s.row, col: s.col });
        }
    }
    return cells; // [] se nessuna
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
        const x = Math.floor(d(6)); // 0..5
        const y = Math.floor(d(6)); // 0..5
        const r = x + 1; // 1..6
        const c = y; // 1..6
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
        c3: './assets/sounds/comandanti/urlo_erwin.mp3',
        r4: './assets/sounds/reclute/reiner_presentazione.mp3',
        r5: './assets/sounds/reclute/bertold_presentazione.mp3',
        r6: './assets/sounds/reclute/annie_presentazione.mp3',
        r7: './assets/sounds/reclute/ymir_presentazione.mp3',
        r8: './assets/sounds/reclute/historia_presentazione.mp3',
        r10: './assets/sounds/reclute/marlo_presentazione.mp3',
        r11: './assets/sounds/reclute/hitch_presentazione.mp3',
        r12: './assets/sounds/reclute/rico_presentazione.mp3',
        r13: './assets/sounds/reclute/mikasa_presentazione.mp3',
        r16: './assets/sounds/reclute/eren_presentazione.mp3',
        c1: './assets/sounds/comandanti/hange_presentazione.mp3',
        c2: './assets/sounds/comandanti/mike_presentazione.mp3',
        c4: './assets/sounds/comandanti/levi_presentazione.mp3',
        u1: './assets/sounds/female_titan.mp3',
        u2: './assets/sounds/ape_mutaform.mp3',
        u3: './assets/sounds/ape_mutaform.mp3',
        u6: './assets/sounds/mutaform_sound.mp3',
        u7: './assets/sounds/mutaform_sound.mp3',
        u11: './assets/sounds/gigante_anomalo_rod.mp3'
    }
    return map[unitId];
}

async function spawnGiant(type = null, flagNoSound = false) {

    const roll20 = d(20);
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
        const url = getMusicUrlById(unit.id);
        if (!flagNoSound) {
            await playSfx('./assets/sounds/flash_effect_sound.mp3', { volume: 0.3, loop: false });
            await playBg(url ? url : (tipo === 'Anomalo' ? './assets/sounds/ape_titan_sound.mp3' : './assets/sounds/start_app.mp3'));
        }

        log(`Gigante ${tipo} appare in ${cell.row}-${cell.col}`, 'warning');

        focusUnitOnField(unit.id);
        openAccordionForRole(unit.role);
    } else {
        log('Campo pieno nelle zone consentite. Il gigante è in panchina.', 'warning');
    }
    return unit.id;
}

function getStat(u, key) {
    const base = Number(u[key] ?? 0);
    const m = GAME_STATE.unitMods?.[u.id];
    const bonus = Number(m?.[key] ?? 0);
    return base + bonus;
}

function clearTurnUnitMods() {
    const mods = GAME_STATE.unitMods || {};
    for (const id of Object.keys(mods)) {
        const m = mods[id];
        if (m?.scope === 'turn') {
            // conserva solo scope
            GAME_STATE.unitMods[id] = { scope: 'turn' };
        }
    }
    scheduleSave();
}

// ESEMPIO: chiamalo quando finisci il turno
// TurnEngine.on('endTurn', clearTurnUnitMods);
// oppure nel tuo handler di “Avanza Turno”


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
function benchClickFocusAndTop(u) {
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


        hpMinus.classList.add('btn-mini', 'hp-btn');
        hpMinus.type = "button";
        hpMinus.title = "-1 HP (Shift -5)";
        hpMinus.textContent = "−";

        /* plus */
        const hpPlus = document.createElement("button");
        hpPlus.classList.add('btn-mini', 'hp-btn');

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
            hideTooltip();
        });
        hpPlus.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isWall && isDestroyed) return;
            adjustUnitHp(u.id, e.shiftKey ? +5 : +1);
            hpRight.textContent = `${u.currHp}/${u.hp}`;
            applyHpBar(hpFill, u);
            hideTooltip();
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
                    benchClickFocusAndTop(u);
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

        card.addEventListener("click", () => {
            if (isDraggingNow) return;
            benchClickFocusAndTop(u);
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
                onLongPress: () => {
                    hideTooltip();
                    openAccordionForRole(unit.role);
                    handleUnitLongPress({ unit, cell: { row, col }, anchorEl: member });
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
    await playSfx(getMusicUrlById(unitId));
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
function focusUnitOnField(unitId, attackFocus = false) {
    const cell = findUnitCell(unitId);
    if (!cell) return;

    bringToFront(cell, unitId);
    selectedUnitId = unitId;
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
    renderBenches();

    requestAnimationFrame(() => {
        const nodes = document.querySelectorAll(`.hex-content[data-unit-id="${CSS.escape(unitId)}"]`);
        if (!nodes || nodes.length === 0) return;
        nodes.forEach(content => {
            const member = content.parentElement;
            const circle = member.querySelector('.hex-circle');
            member.classList.add('is-selected');
            circle.classList.add('focus-ring');
            if (attackFocus) {
                member.classList.add('is-selected-target');
            } else {
                member.classList.add('is-selected');
            }

            content.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            if (attackFocus)
                circle.classList.remove('focus-ring')
            else
                setTimeout(() => circle.classList.remove('focus-ring'), 1600);
        })
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
    const cd = unit.cd ?? "—";
    const mov = unit.mov ?? "—";         // per giganti
    const rng = unit.rng ?? "—";

    const img = unit.img ?? "";
    const abi = (unit.abi ?? "").toString();

    // blocco statistiche condizionale
    const statsForRole = (role === "enemy")
        ? `<div class="tt-stats">
    <div class="tt-row">
      <div class="tt-label">ATK</div><div class="tt-value">${atk}</div>
      <div class="tt-label">CA</div><div class="tt-value">${cd}</div>
       <div class="tt-label">MOV</div><div class="tt-value">${mov}</div>
    </div>
       <div class="tt-row">
      <div class="tt-label">RNG</div><div class="tt-value">${rng}</div>
     
    </div>
    </div>
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
    // durante la scelta NON auto-chiudere (salvo click davvero fuori da tutto)
    if (ATTACK_PICK) {
        const insideTooltip = e.target.closest('#tooltip');
        const onHex = e.target.closest('.hex-member') || e.target.closest('.hexagon');
        if (!insideTooltip && !onHex) endAttackPick(); // click “fuori”: annulla
        return; // non eseguire il reset selezione di default
    }
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

    await completeMission();       // tua funzione esistente
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
        if (type === 'event') await playSfx('assets/sounds/carte/carta_evento.mp3', { volume: 0.3, loop: false });
        if (type === 'consumable') await playSfx('assets/sounds/carte/carta_consumabile.mp3');
        showDrawnCard(type, card);
        closeAllFabs();
    });
});


async function completeMission() {
    resetTimer();

    const m = DB.MISSIONS[GAME_STATE.missionState.curIndex];
    const missioneFallita = m.objectives.some(missione => GAME_STATE.missionState.kills[missione.type] < missione.num);
    if (missioneFallita) {
        log(`Missione #${GAME_STATE.missionState.curIndex + 1} Fallita!`, 'error');
    } else {
        log(`Missione #${GAME_STATE.missionState.curIndex + 1} completata!`, 'success');
        const reward = m?.reward ?? { morale: 0, xp: 0 };
        addMorale(reward.morale);
        addXP(reward?.xp)
        setMissionByIndex(GAME_STATE.missionState.curIndex + 1);
    }

    GAME_STATE.turnEngine.setPhase('idle');
    GAME_STATE.turnEngine.round = 0;
    GAME_STATE.missionState.kills = {
        Puro: 0,
        Anomalo: 0,
        Mutaforma: 0
    };
    await clearGrid();
    await playBg('./assets/sounds/risorsa_audio_avvio_app.mp3');
}

async function clearGrid() {
    deleteUnits(GAME_STATE.giantsRoster.map(giant => giant.id));
    deleteUnits(GAME_STATE.alliesRoster.map(ally => ally.id));
    GIANT_ENGAGEMENT.clear();
    GAME_STATE.turnEngine.teamCreated = false;
    renderMissionUI();
    scheduleSave();
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

    u.currHp = clamped;

    // Se è alleato e scende a 0 → morte
    if ((u.role === 'recruit' || u.role === 'commander') && clamped === 0) {
        await handleAllyDeath(u);
        return; // già refreshato tutto
    }
    // Morte giganti
    if (u.role === 'enemy' && clamped === 0) {
        await handleGiantDeath(u);
        return; // UI già aggiornata
    }

    // Morte MURA → rimuovi tutta la riga
    if (u.role === 'wall' && clamped === 0) {
        await handleWallDeath(u);
        return;
    }

    scheduleSave();
    renderBenches();
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
};

/* Elimina unità (da panchina e campo) */
async function deleteUnit(unitId, flagPopup = true) {

    const u = unitById.get(unitId);
    if (!u) return false;
    if (u.role === 'wall') {
        return false;
    }

    const name = u.name || 'Unità';

    if (flagPopup) {
        const ok = await confirmDialog({
            title: 'Elimina unità',
            message: `Eliminare definitivamente “${name}”?`,
            confirmText: 'Elimina',
            cancelText: 'Annulla',
            danger: true
        });
        if (!ok) return false;
    }


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

/* Elimina più unità in batch, senza popup di conferma.
   Ritorna il numero di unità effettivamente rimosse. */
function deleteUnits(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;

    const uniq = [...new Set(ids)];
    let removedCount = 0;
    const removedNames = [];

    for (const unitId of uniq) {
        const u = unitById.get(unitId);
        if (!u) continue;             // non esiste
        if (u.role === 'wall') continue; // non rimuovere le mura

        // 1) Togli dal campo
        removeUnitEverywhere(unitId);

        // 2) Cataloghi/pool
        if (u.role === 'recruit' || u.role === 'commander') {
            const i = GAME_STATE.alliesRoster.findIndex(x => x.id === unitId);
            if (i >= 0) {
                const removed = GAME_STATE.alliesRoster.splice(i, 1)[0];
                const back = { ...removed, template: true }; // torna template
                GAME_STATE.alliesPool.push(back);
            }
            // salva HP sul template base se era un clone
            if (isClone(u) && u.baseId) {
                baseHpOverride.set(u.baseId, u.currHp ?? u.hp);
            }
        } else if (u.role === 'enemy') {
            const i = GAME_STATE.giantsRoster.findIndex(x => x.id === unitId);
            if (i >= 0) {
                const removed = GAME_STATE.giantsRoster.splice(i, 1)[0];
                const back = { ...removed, template: true, currHp: removed.hp };
                GAME_STATE.giantsPool.push(back);
            }
        }

        // 3) Map globale e selezione
        unitById.delete(unitId);
        if (selectedUnitId === unitId) selectedUnitId = null;

        removedNames.push(u.name || 'Unità');
        removedCount++;
    }

    // 4) UI/Log/Save una sola volta
    if (removedCount > 0) {
        rebuildUnitIndex();
        renderBenches();
        renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
        log(removedCount === 1 ? `Rimossa unità: ${removedNames[0]}.`
            : `Rimosse ${removedCount} unità.`, 'info');
        scheduleSave();
    }

    return removedCount;
}


ensureModal().backdrop.addEventListener('click', () => {
    // noop: gestito in openDialog (per semplicità potresti non abilitarlo
    // per evitare chiusure accidentali). Se lo vuoi, serve wiring interno.
});

async function handleWallDeath(wallUnit) {
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

    addMorale(DB.SETTINGS.xpMoralDefault.unitsDeathMoral[wallUnit.role]);
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
    renderBenches();
    log(`${wallUnit.name} è stato distrutto!`, 'error');
    scheduleSave();
    await playSfx('./assets/sounds/muro_distrutto.mp3');
}

async function handleGiantDeath(unit) {
    // 1) rimuovi dal campo
    removeUnitEverywhere(unit.id);

    // 2) rimuovi dalla panchina attiva (roster giganti)
    const i = GAME_STATE.giantsRoster.findIndex(g => g.id === unit.id);
    if (i >= 0) GAME_STATE.giantsRoster.splice(i, 1);

    GAME_STATE.missionState.kills[unit.type] = GAME_STATE.missionState.kills[unit.type] + 1;
    // 3) NON rimettere nel pool: il gigante è “consumato”
    // (quindi niente push in giantsPool)
    addMorale(DB.SETTINGS.xpMoralDefault.unitsDeathMoral[unit.type]);
    addXP(DB.SETTINGS.xpMoralDefault.giantsDeathXP[unit.type]);
    // 4) UI + log
    renderMissionUI();
    rebuildUnitIndex();
    renderBenches();
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
    log(`${unit.name} è morto.`, 'success');
    scheduleSave();
    await playSfx('./assets/sounds/morte_gigante.mp3');
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

    addMorale(DB.SETTINGS.xpMoralDefault.unitsDeathMoral[unit.role]);
    rebuildUnitIndex();
    renderBenches();
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
    log(`${unit.name} è morto/a.`, 'error');
    await playSfx('./assets/sounds/morte_umano.mp3');
    await playSfx('./assets/sounds/reclute/morte_recluta_comandante.mp3');

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
function initSidebars() {
    document.getElementById('toggle-left')?.addEventListener('click', () => toggleSide('left'));
    document.getElementById('toggle-right')?.addEventListener('click', () => toggleSide('right'));
}


// Click sull’area collassata riapre (UX comodo)
leftEl.addEventListener('click', (e) => {
    if (leftEl.classList.contains('collapsed')) toggleSide('left');
});
rightEl.addEventListener('click', (e) => {
    if (rightEl.classList.contains('collapsed')) toggleSide('right');
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

function pickRandomTeam({ commanders = 1, recruits = 3 } = {}) {
    // prendi solo template (cioè nel pool), vivi
    const poolCmd = availableTemplates('commander').filter(u => !u.dead);
    const poolRec = availableTemplates('recruit').filter(u => !u.dead);

    if (poolCmd.length < commanders || poolRec.length < recruits) {
        log('Non ci sono abbastanza unità vive nel pool per creare la squadra.', 'warning');
        return false;
    }

    // shuffle “in-place” sfruttando la tua shuffle()
    shuffle(poolCmd);
    shuffle(poolRec);

    const chosen = [
        ...poolCmd.slice(0, commanders),
        ...poolRec.slice(0, recruits),
    ];

    const movedNames = [];
    for (const base of chosen) {
        // sposta dal POOL al ROSTER attivo
        const ix = GAME_STATE.alliesPool.findIndex(a => a.id === base.id);
        if (ix >= 0) {
            const unit = GAME_STATE.alliesPool.splice(ix, 1)[0];
            unit.template = false;
            GAME_STATE.alliesRoster.push(unit);
            movedNames.push(unit.name);
        }
    }

    rebuildUnitIndex();
    renderBenches();
    log(`Squadra casuale arruolata: ${movedNames.join(', ')}.`, 'success');
    openAccordionForRole('commander');
    scheduleSave();
    return true;
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
        const role = btn.dataset.role; // 'recruit' | 'commander' | 'random-team'

        if (role === 'random-team') {
            pickRandomTeam({ commanders: 1, recruits: 3 });
            closeAllFabs();
            return;
        }

        // flusso standard: picker manuale
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
        bonus: row.bonus || { agi: 0, tec: 0, atk: 0, all: 0 }
    }];
}
// === Utility merge/somma di tutti i bonus/malus ===
function mergeBonuses(pills) {
    const totals = { agi: 0, tec: 0, atk: 0, all: 0 };
    for (const p of pills) {
        if (!p || !p.bonus) continue;
        totals.agi += p.bonus.agi || 0;
        totals.tec += p.bonus.tec || 0;
        totals.atk += p.bonus.atk || 0;
        totals.all += p.bonus.all || 0;
    }
    return totals;
}

function bonusesFromLevel(level) {
    return DB.SETTINGS.bonusTable
        .filter(b => level >= b.lvl)
        .map(b => ({ type: 'bonus', text: b.text, bonus: b.bonus }));
}

// Render unico
function renderBonusMalus() {

    const level = levelFromXP(GAME_STATE.xpMoraleState.xp);
    const morale = Number(GAME_STATE.xpMoraleState.moralePct) || 0;
    // 1) raccogli pillole: bonus (cumulativi per soglia) + malus (unico per range)
    const pills = [
        { type: 'modsRoll', text: '', bonus: GAME_STATE.modRolls },
        ...bonusesFromLevel(level),
        ...malusFromMorale(morale),
    ];
    console.log('pills', pills);
    // 2) calcola la somma effettiva
    const totals = mergeBonuses(pills);
    // opzionale: salviamo nello state se vuoi riusarlo altrove
    GAME_STATE.xpMoraleState.effectiveBonus = totals;

    refreshRollModsUI();
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
    const event = m?.event;
    if (elMissionNumTop) elMissionNumTop.textContent = String(num);
    if (elMissionNumCard) elMissionNumCard.textContent = String(num);

    // Rigenera il contenuto della card (mantieni il div#mission-card)
    const card = elMissionCardWrap.querySelector('#mission-card');
    console.log('card', card);
    if (card) {
        card.innerHTML = `
      <p style="margin:0 0 8px; opacity:.9;"><strong>#<span>${num}</span> — ${title}</strong></p>
      <ul style="margin:0 0 10px 18px; padding:0; opacity:.9">
        ${objectives.map(li => `<li> Uccidi ${li.num} Giganti di tipo ${li.type} ➔ ${GAME_STATE.missionState.kills[li.type]} / ${li.num} 💀</li>`).join('')}
      </ul>
      <p style="margin:0; font-size:12px; opacity:.8">Ricompensa: ${reward.morale ? `+${reward.morale} Morale` : ''}${(reward.morale && reward.xp) ? ', ' : ''}${reward.xp ? `+${reward.xp} XP` : ''}</p>
      <p style="margin:0; font-size:12px; opacity:.8">Evento: ${event}</p>
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
elDec?.addEventListener('click', async () => {

    const ok = await confirmDialog({
        title: 'Missione Precedente',
        message: `Confermando perderai i dati della missione corrente, vuoi procedere lo stesso”?`,
        confirmText: 'Conferma',
        cancelText: 'Annulla',
        danger: true
    });
    if (!ok) return false;

    setMissionByIndex(GAME_STATE.missionState.curIndex - 1);
    GAME_STATE.turnEngine.setPhase('idle');
    GAME_STATE.turnEngine.round = 0;
    GAME_STATE.missionState.kills = {
        Puro: 0,
        Anomalo: 0,
        Mutaforma: 0
    };
    await clearGrid();
});
elInc?.addEventListener('click', async () => {
    const ok = await confirmDialog({
        title: 'Missione Successiva',
        message: `Confermando perderai i dati della missione corrente, vuoi procedere lo stesso”?`,
        confirmText: 'Conferma',
        cancelText: 'Annulla',
        danger: true
    });
    if (!ok) return false;
    setMissionByIndex(GAME_STATE.missionState.curIndex + 1);
    GAME_STATE.turnEngine.setPhase('idle');
    GAME_STATE.turnEngine.round = 0;
    GAME_STATE.missionState.kills = {
        Puro: 0,
        Anomalo: 0,
        Mutaforma: 0
    };
    await clearGrid();
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

    await openDialog({
        title: isFirstRun ? 'Benvenuto/a! Soldato!' : 'Bentornato/a! Soldato!',
        message: html,
        confirmText: isFirstRun ? 'Inizia' : 'Riprendi',
        cancelText: 'Chiudi',
        danger: true,
        cancellable: true
    });

    initAudio();
    GAME_STATE.turnEngine.phase === 'idle' ? await playBg('./assets/sounds/risorsa_audio_avvio_app.mp3') : await GAME_STATE.turnEngine.setPhaseMusic();
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
(function setupLeftAccordions() {
    const aside = document.querySelector('nav');
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


    window.openLeftAccordionById = function (id) {
        const sec = sections.find(s => s.id === id);
        if (sec) openOne(sec);
    };
})();

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

    if (typeof window.openLeftAccordionById === 'function') {
        window.openLeftAccordionById(id);
    }
}
// opzionale: wiring semplice per tutti gli accordion
(function setupAccordions() {
    document.querySelectorAll('.accordion-section .accordion-trigger').forEach(btn => {
        btn.addEventListener('click', () => {
            const expanded = btn.getAttribute('aria-expanded') === 'true';
            const panelId = btn.getAttribute('aria-controls');
            const panel = document.getElementById(panelId);
            btn.setAttribute('aria-expanded', String(!expanded));
            if (panel) panel.setAttribute('aria-hidden', String(expanded));
        });
    });
})();
// === COLLASSA/ESPANDI NAV SINISTRO mantenendo i titoli visibili ===
(function setupLeftCollapse() {
    const btn = document.getElementById('toggle-left');
    if (!btn) return;

    btn.addEventListener('click', () => {
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        // inverti stato
        btn.setAttribute('aria-expanded', String(!expanded));
        document.body.classList.toggle('is-left-collapsed', expanded);
    });
})();



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

function ensureRollMods() {
    if (!GAME_STATE.modRolls) {
        GAME_STATE.modRolls = { atk: 0, tec: 0, agi: 0, all: 0 };
    }
    return GAME_STATE.modRolls;
}

function initModsDiceUI() {
    const dieSel = document.getElementById('rm-die');
    const btn = document.getElementById('rm-roll');
    const out = document.getElementById('rm-roll-out');

    console.log('btn', btn);
    if (!dieSel || !btn || !out) return;

    const signed = (n) => (n >= 0 ? `+ ${n}` : `${n}`);
    const getTot = () => {
        const el = document.getElementById('rm-all');
        if (!el) return 0;
        const n = parseInt((el.textContent || '').replace(/[^\-0-9]/g, ''), 10);
        return Number.isFinite(n) ? n : 0;
    };
    const rollDie = (sides) => Math.floor(Math.random() * sides) + 1;

    btn.addEventListener('click', () => {
        const sides = parseInt(dieSel.value, 10) || 20;
        const r = rollDie(sides);
        const totMod = getTot();
        const total = r + totMod;

        console.log('test');

        out.textContent = `d${sides}: ${r} ${totMod ? `(${signed(totMod)}) = ${total}` : ''}`;
        out.classList.remove('roll'); // retrigger anim
        void out.offsetWidth;
        out.classList.add('roll');

        // opzionale: log e sfx se li usi già
        try { log(`Tiro d${sides}: ${r}${totMod ? ` ${signed(totMod)} => ${total}` : ''}`, 'info'); } catch { }
    });
}

const boxMods = document.getElementById('mods-section');

const renderRollMods = () => {
    const m = GAME_STATE.xpMoraleState.effectiveBonus;
    const fmt = (v) => (v >= 0 ? '+' + v : '' + v);
    ['atk', 'tec', 'agi', 'all'].forEach(k => {
        const v = m[k] || 0;
        const el = document.getElementById('rm-' + k);
        if (el) el.textContent = fmt(v);

        // 👉 imposta il segno sulla riga per attivare il CSS
        const row = boxMods.querySelector(`.rm-row[data-kind="${k}"]`);
        if (row) row.dataset.sign = (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero');
    });
};

boxMods.addEventListener('click', (e) => {
    const btn = e.target.closest('.rm-btn');
    console.log('btn', btn)
    if (!btn) return;
    const row = btn.closest('.rm-row');
    const kind = row?.dataset?.kind;
    const d = Number(btn.dataset.delta || 0);
    if (!kind || !d) return;
    const m = ensureRollMods();

    m[kind] = (m[kind] || 0) + d;

    renderBonusMalus();
    refreshRollModsUI();
    scheduleSave();
});


function refreshRollModsUI() {
    renderRollMods();
}


/* =============================
   Long-press / Right-click → Attacca (robusto)
   SOSTITUISCI il vecchio blocco con questo
   ============================= */
// --- RILEVAZIONI AUTOMATICHE ----------------------------------------------
const HEX_CFG = {
    // base indici (0 o 1) dedotta dal DOM delle celle
    base: 1,
    // layout righe offset: 'even-r' | 'odd-r' | 'auto' (sceglie da solo)
    layout: 'odd-r',
    autoSwapRC: false
};

// --- UTILS -----------------------------------------------------------------
function gridSize() {
    const R = DB?.SETTINGS?.gridSettings?.rows ?? 0;
    const C = DB?.SETTINGS?.gridSettings?.cols ?? 0;
    return { R, C };
}

function inBoundsRC(r, c) {
    const { R, C } = gridSize();
    if (HEX_CFG.base === 0) {
        return r >= 0 && r < R && c >= 0 && c < C;
    } else {
        return r >= 1 && r <= R && c >= 1 && c <= C;
    }
}

// se qualcuno passa (col,row) invertiti, NON auto-swap di default
// (attivalo solo se sai che ti serve davvero)
HEX_CFG.autoSwapRC = false;

function normalizeRC(r, c) {
    if (!HEX_CFG.autoSwapRC) return { r, c };

    const rcOK = inBoundsRC(r, c);
    if (rcOK) return { r, c };

    const crOK = inBoundsRC(c, r);
    return crOK ? { r: c, c: r } : { r, c };
}


// --- VICINI ESAGONALI (row-offset) -----------------------------------------
function hexNeighbors(row, col, includeSelf = true) {
    // normalizza input (swap se abilitato)
    ({ r: row, c: col } = normalizeRC(row, col));

    // parità riga corretta anche con base 1
    const evenRow = ((row - HEX_CFG.base) % 2 === 0);

    const DELTAS_EVENR = evenRow
        ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
        : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];

    const DELTAS_ODDR = evenRow
        ? [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]]
        : [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];

    const build = (deltas) =>
        deltas.map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
            .filter(p => inBoundsRC(p.row, p.col));

    let neigh;
    if (HEX_CFG.layout === 'odd-r') {
        neigh = build(DELTAS_ODDR);
    } else if (HEX_CFG.layout === 'even-r') {
        neigh = build(DELTAS_EVENR);
    } else {
        // 'auto' => UNIONE di ODDR ed EVENR (deduplicata)
        const a = build(DELTAS_ODDR);
        const b = build(DELTAS_EVENR);
        const seen = new Set();
        neigh = [...a, ...b].filter(p => {
            const k = p.row + ':' + p.col;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    }

    if (includeSelf) neigh.unshift({ row, col, self: true });
    return neigh;
}

// ===== RAGGIO & DISTANZA ====================================================

// celle entro 'radius' passi (BFS sul grafo dei vicini)
function hexWithinRadius(row, col, radius = 1, includeSelf = false) {
    ({ r: row, c: col } = normalizeRC(row, col));
    radius = Math.max(0, radius | 0);

    const key = (r, c) => `${r}:${c}`;
    const seen = new Set([key(row, col)]);
    const out = [];
    let frontier = [{ row, col }];

    if (includeSelf) out.push({ row, col, self: true });

    for (let dist = 1; dist <= radius; dist++) {
        const next = [];
        for (const p of frontier) {
            const ns = hexNeighbors(p.row, p.col, false);
            for (const n of ns) {
                const k = key(n.row, n.col);
                if (seen.has(k)) continue;
                seen.add(k);
                out.push(n);
                next.push(n);
            }
        }
        frontier = next;
        if (frontier.length === 0) break;
    }
    return out;
}

// offset(r,c) -> cube, rispettando base (0/1) e layout ('even-r'|'odd-r')
function offsetToCube(row, col) {
    const base = HEX_CFG.base || 0;
    let r0 = row - base, c0 = col - base;

    let q;
    if (HEX_CFG.layout === 'odd-r') {
        q = c0 - Math.floor((r0 - (r0 & 1)) / 2);
    } else { // default 'even-r'
        q = c0 - Math.floor((r0 + (r0 & 1)) / 2);
    }
    const x = q;
    const z = r0;
    const y = -x - z;
    return { x, y, z };
}

function hexDistance(r1, c1, r2, c2) {
    ({ r: r1, c: c1 } = normalizeRC(r1, c1));
    ({ r: r2, c: c2 } = normalizeRC(r2, c2));
    const a = offsetToCube(r1, c1), b = offsetToCube(r2, c2);
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

// ===== STACK HELPERS ========================================================

// tutte le unità in una cella leggendo dagli stack
function unitsAtCell(row, col) {
    const ids = getStack(row, col) || [];
    const res = [];
    for (const id of ids) {
        const u = unitById.get(id);
        if (u) res.push(u);
    }
    return res;
}



// muri più vicini (scansione griglia usando hasWallInCell)
function nearestWallCell(fromR, fromC) {
    const { R, C } = gridSize();
    const rMin = HEX_CFG.base ? 1 : 0;
    const rMax = HEX_CFG.base ? R : R - 1;
    const cMin = rMin;
    const cMax = HEX_CFG.base ? C : C - 1;

    let best = null, bestD = Infinity;
    for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
            if (!hasWallInCell(r, c)) continue;
            const d = hexDistance(fromR, fromC, r, c);
            if (d < bestD) { bestD = d; best = { row: r, col: c }; }
        }
    }
    return best;
}

// ===== SCELTA PASSO (1 esagono) ============================================

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// camminabilità: niente muri e rispetto cap stack
function defaultWalkableFn(r, c) {
    if (hasWallInCell(r, c)) return false;
    const stack = getStack(r, c) || [];
    const maxCap = DB?.SETTINGS?.gridSettings?.maxUnitHexagon ?? Infinity;
    return stack.length < maxCap;
}

// vicino che riduce di più la distanza verso una destinazione
function nextStepTowards(fromR, fromC, toR, toC, { walkableFn = defaultWalkableFn } = {}) {
    const currD = hexDistance(fromR, fromC, toR, toC);
    const neigh = hexNeighbors(fromR, fromC, false).filter(p => walkableFn(p.row, p.col));

    const better = neigh
        .map(p => ({ ...p, d: hexDistance(p.row, p.col, toR, toC) }))
        .filter(p => p.d < currD);

    if (better.length) {
        const bestD = Math.min(...better.map(p => p.d));
        const best = better.filter(p => p.d === bestD);
        return pickRandom(best);
    }
    return null; // bloccato
}

// ===== "VISTA" GIGANTE & Mossa =============================================

const GIANT_VIEW_RADIUS = 2;

function humanTargetsWithin2(fromR, fromC) {
    const area = hexWithinRadius(fromR, fromC, GIANT_VIEW_RADIUS, true);
    const hits = [];
    for (const c of area) {
        const units = unitsAtCell(c.row, c.col).filter(isHuman);
        for (const u of units) {
            hits.push({ unit: u, row: c.row, col: c.col });
        }
    }
    return hits;
}
function hasHumanInCell(row, col) {
    const stack = getStack(row, col) || [];
    return stack.some(id => {
        const u = unitById.get(id);
        // considera umani = non enemy, non wall
        return u && u.role !== 'enemy' && u.role !== 'wall';
    });
}
// usa la TUA moveOneUnitBetweenStacks
function stepGiant(giantId) {
    const g = unitById.get(giantId);
    if (!g || g.role !== 'enemy') return false;

    // da dove parte il gigante
    let here = findUnitCell?.(giantId) || null;



    if (!here) {
        // fallback: cerca negli stack
        const { R, C } = gridSize();
        const rMin = HEX_CFG.base ? 1 : 0, rMax = HEX_CFG.base ? R : R - 1;
        const cMin = rMin, cMax = HEX_CFG.base ? C : C - 1;
        outer:
        for (let r = rMin; r <= rMax; r++) {
            for (let c = cMin; c <= cMax; c++) {
                if ((getStack(r, c) || []).includes(giantId)) { here = { row: r, col: c }; break outer; }
            }
        }
    }
    if (!here) return false;

    const { row: r, col: c } = here;

    if (hasHumanInCell(r, c)) return false;

    // 1) se vede umani entro 2, avvicinati al più vicino (se non già adiacente)
    const humans = humanTargetsWithin2(r, c);
    if (humans.length) {
        // scegli il bersaglio più vicino (random tra pari distanza)
        let best = [], bestD = Infinity;
        for (const h of humans) {
            const d = hexDistance(r, c, h.row, h.col);
            if (d < bestD) { bestD = d; best = [h]; }
            else if (d === bestD) best.push(h);
        }
        const target = pickRandom(best);

        if (bestD > 1) {
            // ancora lontano: fai UN passo verso di lui
            const step = nextStepTowards(r, c, target.row, target.col, {});
            if (step) {
                moveOneUnitBetweenStacks({ row: r, col: c }, { row: step.row, col: step.col }, giantId);
                return true;
            }
            return false; // bloccato
        }

        if (bestD === 1) {
            // ADIACENTE: prova ad entrare direttamente nella cella del bersaglio
            moveOneUnitBetweenStacks({ row: r, col: c }, { row: target.row, col: target.col }, giantId);
            return true; // se la cella è piena, la tua funzione non sposta (ok)
        }

        // bestD === 0: già nella stessa cella -> nessuna mossa
        return false;
    }

    // 2) altrimenti verso le MURA
    const wall = nearestWallCell(r, c);
    if (!wall) return false;

    const step = nextStepTowards(r, c, wall.row, wall.col, {});
    if (step) {
        moveOneUnitBetweenStacks({ row: r, col: c }, { row: step.row, col: step.col }, giantId);
        return true;
    }
    return false; // bloccato
}

function giantsPhaseMove() {
    const giants = [...unitById.values()].filter(u => u.role === 'enemy');
    for (const g of giants) {
        stepGiant(g.id);
    }
}



let ATTACK_PICK = null; // { attackerId, targets:[{unit, cell}], _unbind? }
let TARGET_CELLS = new Set();

function endAttackPick() {
    ATTACK_PICK = null;
    TARGET_CELLS.clear();
    hideTooltip();
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
}

function startAttackPick(attacker, cell, anchorEl /* es: member/el della pedina */) {
    let cand = targetsAround(attacker, cell);

    const engaged = getEngagedHuman(attacker.id);
    if (engaged) {
        cand = cand.filter(target => target.unit.id === engaged);
    }

    if (cand.length === 0) {
        showTooltip(`<div class="tt-card"><div class="tt-title">${attacker.name}</div><div class="tt-ability-text">Nessuno in portata.</div></div>`,
            anchorEl?.getBoundingClientRect().left ?? 12,
            anchorEl?.getBoundingClientRect().top ?? 12);
        setTimeout(hideTooltip, 1100);
        return;
    }
    cand.map(target => target.unit).forEach(unit => focusUnitOnField(unit.id, true))
    ATTACK_PICK = { attackerId: attacker.id, targets: cand };
    TARGET_CELLS = new Set(cand.map(t => keyRC(t.cell.row, t.cell.col)));

    // Tooltip "appiccicoso": lista bersagli + annulla
    const html = renderPickTooltip(attacker, cand);
    const rect = anchorEl?.getBoundingClientRect?.();
    const x = rect ? (rect.right + 8) : 20;
    const y = rect ? (rect.top + rect.height / 2) : 20;
    showTooltip(html, x, y);

    // Listener sul tooltip per click target/annulla
    tooltipEl.onclick = (e) => {
        const tBtn = e.target.closest('[data-target-id]');
        if (tBtn) {
            resolveAttack(attacker.id, tBtn.dataset.targetId);
            endAttackPick();
            return;
        }
        if (e.target.closest('[data-cancel]')) {
            endAttackPick();
        }
    };

    // evidenzia griglia
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
}
function renderPickTooltip(attacker, targets) {
    const items = targets.map(t => {
        const u = t.unit;
        const pct = Math.max(0, Math.min(100, Math.round(((u.currHp ?? 0) / (u.hp || 1)) * 100)));
        return `
    <button class="tcard tcard--mini" data-target-id="${u.id}" type="button" title="${u.name || 'Unità'}">
      <div class="tcard__avatar"><img src="${u.img || ''}" alt=""></div>
      <div class="tcard__body">
        <div class="tcard__name">${u.name || 'Unità'}</div>
        <div class="tcard__sub">(${t.cell.row}-${t.cell.col})</div>
        <div class="hpbar"><div class="hpbar-fill" style="width:${pct}%"></div></div>
        <div class="tcard__meta">❤️ ${u.currHp}/${u.hp}</div>
      </div>
    </button>
  `;
    }).join('');

    return `
  <div class="tt-card" data-role="${attacker.role}">
    <div class="tt-title">${attacker.name}</div>
    <div class="tt-ability-text" style="margin:6px 0 8px">Attacca un bersaglio ⚔️</div>
    <div class="picklist picklist--grid">${items}</div>
  </div>
`;

}


function targetsAround(attacker, cell) {
    const out = [];
    for (const p of hexNeighbors(cell.row, cell.col)) {
        const ids = getStack(p.row, p.col);
        for (const id of ids) {
            const u = unitById.get(id);
            if (!u) continue;
            // alleati attaccano solo nemici
            if ((attacker.role === 'recruit' || attacker.role === 'commander') && u.role === 'enemy') {
                out.push({ unit: u, cell: p });
            }
            // giganti attaccano solo alleati
            if (attacker.role === 'enemy' && (u.role === 'recruit' || u.role === 'commander' || u.role === 'wall')) {
                out.push({ unit: u, cell: p });
            }
        }
    }
    return out;
}

function unitsAt(r, c) {
    return getStack(r, c).map(id => unitById.get(id)).filter(Boolean);
}

function findTargetsFor(attacker, cell) {
    const neigh = hexNeighbors(cell.row, cell.col);
    const all = neigh.flatMap(p => unitsAt(p.row, p.col));
    if (attacker.role === 'enemy') {
        // i giganti colpiscono solo alleati (no mura)
        return all.filter(u => (u.role === 'recruit' || u.role === 'commander' || u.role === 'wall'));
    } else if (attacker.role === 'recruit' || attacker.role === 'commander') {
        // alleati colpiscono i giganti
        return all.filter(u => u.role === 'enemy');
    }
    return [];
}

// --- Abilità Gigante: helper ------------------------------------------------

// Prende abilità pronta (attiva + coolDownLeft == 0), altrimenti null
function getReadyGiantAbility(giant) {
    const ab = giant?.ability;
    if (!ab) return null;
    const active = (ab.active ?? true);
    const coolDownLeft = Number(ab.coolDownLeft || 0);
    if (!active || coolDownLeft > 0) return null;
    return ab;
}

// Mette in cooldown l'abilità appena usata
function consumeGiantAbilityCooldown(giant) {
    const ab = giant?.ability;
    if (!ab) return;
    const coolDown = Math.max(1, Number(ab.coolDown || 1));
    ab.coolDownLeft = coolDown;
}

// Da chiamare a fine turno per scalare i cooldown
function tickUnitCooldowns(unit) {
    const ab = unit?.ability;
    if (ab && ab.coolDownLeft > 0) ab.coolDownLeft = Math.max(0, ab.coolDownLeft - 1);
}

// Utility dadi: 1dN e XdY (es. '2d6')
function d(n) { return Math.floor(Math.random() * n) + 1; }
function rollDiceSpec(spec) {
    const m = /^(\d+)d(\d+)$/i.exec(spec || '1d6');
    if (!m) return d(6);
    const cnt = Number(m[1]), sides = Number(m[2]);
    let sum = 0; for (let i = 0; i < cnt; i++) sum += d(sides);
    return sum;
}

// Legge numeri robustamente (come già usi sopra)
function getNum(obj, keys, fallback = 0) {
    for (const k of keys) {
        if (obj && obj[k] != null && obj[k] !== '') {
            const n = Number(obj[k]);
            if (!Number.isNaN(n)) return n;
        }
    }
    return fallback;
}

// Calcolo danno abilità: (XdY) + bonus + (eventuale atk del gigante)
function computeAbilityDamage(giant, ab) {
    const base = rollDiceSpec(ab?.dice || '1d6');
    const bonus = Number(ab?.bonus || 0);
    const addAtk = !!ab?.addAtk;
    const atk = Math.max(0, getStat(giant, 'atk'));
    return Math.max(1, base + bonus + (addAtk ? atk : 0));
}

// Umano = non 'enemy' e non 'wall'
function isHuman(u) { return u && u.role !== 'enemy' && u.role !== 'wall'; }

// giantId -> humanId attualmente ingaggiato
const GIANT_ENGAGEMENT = new Map();

function unitAlive(u) { return !!u && (u.currHp ?? u.hp) > 0; }

function sameOrAdjCells(idA, idB) {
    const a = findUnitCell(idA), b = findUnitCell(idB);
    if (!a || !b) return false;
    if (a.row === b.row && a.col === b.col) return true;
    const neigh = hexNeighbors(a.row, a.col, true); // include self
    return neigh.some(p => p.row === b.row && p.col === b.col);
}

// valida e ritorna l’umano ingaggiato col gigante, se ancora valido
function getEngagedHuman(gid) {
    const hid = GIANT_ENGAGEMENT.get(gid);
    if (!hid) return null;
    const h = unitById.get(hid);
    if (!unitAlive(h) || !sameOrAdjCells(gid, hid)) {
        GIANT_ENGAGEMENT.delete(gid);
        return null;
    }
    return hid;
}

function setEngagementIfMelee(gid, hid) {
    if (!gid || !hid) return;
    if (!sameOrAdjCells(gid, hid)) return;
    GIANT_ENGAGEMENT.set(gid, hid);
}

function resolveAttack(attackerId, targetId) {
    const a = unitById.get(attackerId);
    const t = unitById.get(targetId);
    if (!a || !t) return;

    // Se non è scontro UMANO vs GIGANTE → vecchio comportamento
    const AisHuman = isHuman(a);
    const TisHuman = isHuman(t);
    const AisGiant = a?.role === 'enemy';
    const TisGiant = t?.role === 'enemy';
    const isHumanVsGiant = (AisHuman && TisGiant) || (TisHuman && AisGiant);

    if (!isHumanVsGiant) {
        const dmg = Math.max(1, Number(getStat(a, 'atk') || 1));
        window.setUnitHp(targetId, (t.currHp ?? t.hp) - dmg);
        log(`${a.name} attacca ${t.name} per ${dmg} danni.`, 'info');
        openAccordionForRole(t.role);
        focusUnitOnField(targetId);
        focusBenchCard(targetId);
        try {
            if (a.role === "enemy")
                playSfx('./assets/sounds/attacco_gigante.mp3', { volume: 0.8 });
            else
                playSfx(a.sex === 'm' ? './assets/sounds/attacco_uomo.mp3' : './assets/sounds/attacco_donna.mp3', { volume: 0.8 });
        } catch { }
        return;
    }

    // Normalizza chi è umano e chi è gigante (indipendente da chi inizia)
    const human = AisHuman ? a : t;
    const giant = AisGiant ? a : t;
    const humanId = human.id;
    const giantId = giant.id;

    // Letture robuste
    const cdGiant = getStat(giant, 'cd');
    const tecMod = getStat(human, 'tec');
    const agiMod = getStat(human, 'agi');
    const forMod = getStat(human, 'atk');
    const giantAtk = Math.max(1, getStat(giant, 'atk'));

    const effectiveBonus = GAME_STATE.xpMoraleState.effectiveBonus;

    // Tiro unico
    const d20 = d(20) + effectiveBonus.all;


    // Umano → TEC vs CD gigante (per colpire)
    const humanHits = (d20 + tecMod + effectiveBonus.tec) >= cdGiant;

    // Umano → AGI vs CD gigante (per schivare attacco/abilità del gigante)
    const humanDodges = (d20 + agiMod + effectiveBonus.agi) >= cdGiant;

    // Abilità gigante pronta?
    const ability = getReadyGiantAbility(giant);

    const totalTec = tecMod + effectiveBonus.tec;
    // Log
    const lines = [];
    lines.push(
        `d20=${d20} | TEC ${totalTec >= 0 ? '+' : ''}${totalTec} vs CD ${cdGiant} → ${humanHits ? 'COLPITO' : 'MANCATO'}`
    );

    let humanDamageDealt = 0;
    let humanDamageTaken = 0;

    // Danno umano (se colpisce): d4 + FOR (min 1)
    if (humanHits) {
        const humanDmgRoll = Math.max(1, d(4) + forMod + effectiveBonus.atk);
        humanDamageDealt = humanDmgRoll;
        const gCurr = (giant.currHp ?? giant.hp);
        window.setUnitHp(giantId, gCurr - humanDmgRoll);
        lines.push(`${human.name} infligge ${humanDmgRoll} danni a ${giant.name}.`);
    }

    const engaged = getEngagedHuman(giant.id);

    //il gigante attacca solo un umano alla volta
    if (!engaged || engaged === human.id) {
        // Azione del gigante: abilità se pronta, altrimenti attacco base
        if (ability) {
            const cdGiantAbi = ability.cd;
            // Se abilità è schivabile → l'esito usa la stessa logica della schivata
            const humanDodgesAbility = (d20 + agiMod + effectiveBonus.agi) >= cdGiantAbi;
            const dodgeable = (ability.dodgeable !== false); // default = true
            const giantHits = dodgeable ? !humanDodgesAbility : true;

            const totalAgi = agiMod + effectiveBonus.agi;
            lines.push(
                `Schivata abilità: d20=${d20} + AGI ${totalAgi >= 0 ? '+' : ''}${totalAgi} vs CD ABI ${cdGiantAbi} → ` +
                (giantHits ? 'COLPITO' : 'SCHIVATA')
            );

            if (giantHits) {
                const dmg = computeAbilityDamage(giant, ability);
                humanDamageTaken = dmg;
                const hCurr = (human.currHp ?? human.hp);
                window.setUnitHp(humanId, hCurr - dmg);
                lines.push(`${giant.name} usa **${ability.name || 'Abilità'}** e infligge ${dmg} danni a ${human.name}.`);
            } else {
                lines.push(`${human.name} schiva **${ability.name || 'l\'abilità'}** di ${giant.name}.`);
            }

            // metti in cooldown
            consumeGiantAbilityCooldown(giant);

            // SFX abilità (se fornito), altrimenti fallback
            try {
                if (giantHits && ability.sfx) {
                    playSfx(ability.sfx, { volume: 0.9 });
                } else if (giantHits) {
                    playSfx('./assets/sounds/abilita_gigante.mp3', { volume: 0.9 });
                }
            } catch { }

        } else {
            // Attacco base del gigante (come prima) — solo se niente abilità pronta
            const giantHits = !humanDodges;
            const totalAgi = agiMod + effectiveBonus.agi
            lines.push(
                `Schivata: d20=${d20} + AGI ${totalAgi >= 0 ? '+' : ''}${totalAgi} vs CD ${cdGiant} → ` +
                (giantHits ? 'COLPITO dal gigante' : 'SCHIVATA')
            );

            if (giantHits) {
                humanDamageTaken = giantAtk;
                const hCurr = (human.currHp ?? human.hp);
                window.setUnitHp(humanId, hCurr - giantAtk);
                lines.push(`${giant.name} infligge ${giantAtk} danni a ${human.name}.`);
                try { playSfx('./assets/sounds/attacco_gigante.mp3', { volume: 0.8 }); } catch { }
            }
        }
    } else {
        const engagedUnit = unitById.get(engaged);
        if (engagedUnit) lines.push(`${giant.name} è distratto, perchè in combattimento con ${engagedUnit.name}`)
    }

    // Log compatto
    log(`${human.name} vs ${giant.name}\n` + lines.join('\n'), 'info');

    // SFX umano (se ha colpito)
    try {
        if (humanDamageDealt > 0) {
            const path = human.sex === 'm'
                ? './assets/sounds/attacco_uomo.mp3'
                : './assets/sounds/attacco_donna.mp3';
            // leggero offset se anche il gigante ha colpito, per non accavallare troppo
            const offset = humanDamageTaken > 0 ? 140 : 0;
            setTimeout(() => playSfx(path, { volume: 0.8 }), offset);
        }
    } catch { }

    // set/refresh ingaggio se sono a contatto (stessa cella o adiacenti) e entrambi vivi
    if (!engaged && unitAlive(human) && unitAlive(giant) && sameOrAdjCells(human.id, giant.id)) {
        setEngagementIfMelee(giant.id, human.id);
        log(`${human.name} è entrato in combattimento con ${giant.name}`, 'warning');
    }

    scheduleSave();
}

// === COOLDOWN A FINE TURNO ================================================

// Scala il cooldown di UNA unità (già definito sopra, lo estendo con delta opz.)
function tickUnitCooldowns(unit, delta = 1) {
    const ab = unit?.ability;
    if (!ab) return;
    if (ab.coolDownLeft > 0) {
        ab.coolDownLeft = Math.max(0, ab.coolDownLeft - Math.max(1, delta));
    }
}

// Scala il cooldown di TUTTE le unità nella tua unitById (Map)
// Opzioni:
//  - delta: di quanti turni scalare (default 1)
//  - giantsOnly / humansOnly: filtri rapidi (mutuamente esclusivi)
//  - silent: se true non logga quando un’abilità torna pronta
function advanceAllCooldowns(
    delta = 1,
    { giantsOnly = false, humansOnly = false, silent = false } = {}
) {
    if (!unitById || typeof unitById.values !== 'function') return;

    for (const u of unitById.values()) {
        if (giantsOnly && u.role !== 'enemy') continue;
        if (humansOnly && (u.role === 'enemy' || u.role === 'wall')) continue;

        const ab = u?.ability;
        if (!ab) continue;

        const before = Number(ab.coolDownLeft || 0);
        if (before <= 0) continue;

        tickUnitCooldowns(u, delta);

        if (!silent && before > 0 && ab.coolDownLeft === 0) {
            // appena tornata pronta
            try {
                log(`L'abilità di ${u.name} è di nuovo pronta: ${ab.name || 'Abilità'}.`, 'warning');
            } catch { }
        }
    }
}

// (Facoltative) utility comode
function resetAllCooldowns({ giantsOnly = false, humansOnly = false } = {}) {
    if (!unitById || typeof unitById.values !== 'function') return;
    for (const u of unitById.values()) {
        if (giantsOnly && u.role !== 'enemy') continue;
        if (humansOnly && (u.role === 'enemy' || u.role === 'wall')) continue;
        if (u.ability) u.ability.coolDownLeft = 0;
    }
}

function setAbilityReady(unit) {
    if (unit?.ability) unit.ability.coolDownLeft = 0;
}


function handleUnitLongPress({ unit, cell, anchorEl }) {
    // niente mura
    if (unit.role === 'wall') return;

    const targets = findTargetsFor(unit, cell);

    if (!targets.length) {
        window.snackbar('Nessun bersaglio a portata.', {}, 'info');
        return;
    }

    startAttackPick(unit, cell, anchorEl)
}

// === FASI SEMPLIFICATE ======================================================


//window.setPhase = (p) => TurnEngine.setPhase(p);
// === UI MANAGEMENT (mostra/nascondi in base alla fase) ======================
const PHASE_UI = {
    // cosa si vede in ciascuna fase (modifica liberamente i selettori!)
    idle: {
        show: [],
        hide: []
    },
    setup: {
        show: [],
        hide: ['.fab.spawn', '.fab.arruola', '.fab.event']
    },
    event_mission: {
        show: [],
        hide: ['.fab.spawn', '.fab.arruola', '.fab.event']
    },
    event_card: {
        show: [],
        hide: ['.fab.spawn', '.fab.arruola', '.fab.event']
    },
    round_start: {
        show: ['.fab.spawn', '.fab.event'],
        hide: ['.fab.arruola']
    },
    move_phase: {
        show: [],
        hide: ['.fab.spawn', '.fab.arruola', '.fab.event']
    },
    attack_phase: {
        show: [],
        hide: ['.fab.spawn', '.fab.arruola', '.fab.event']
    },
    end_round: {
        show: ['.fab.spawn', '.fab.event'],
        hide: ['.fab.arruola']
    }
};

// Applica visibilità dai mapping sopra
function applyPhaseUI(phase) {
    const allSelectors = new Set();
    for (const p of Object.values(PHASE_UI)) {
        (p.show || []).forEach(s => allSelectors.add(s));
        (p.hide || []).forEach(s => allSelectors.add(s));
    }

    // reset: tutto visibile
    allSelectors.forEach(sel =>
        document.querySelectorAll(sel).forEach(el => el.classList.remove('is-hidden'))
    );

    // applica per la fase corrente
    const conf = PHASE_UI[phase] || {};
    (conf.hide || []).forEach(sel =>
        document.querySelectorAll(sel).forEach(el => el.classList.add('is-hidden'))
    );
    (conf.show || []).forEach(sel =>
        document.querySelectorAll(sel).forEach(el => el.classList.remove('is-hidden'))
    );
}


const btnStart = document.getElementById('btn-start');

function renderStartBtn() {
    if (!btnStart) return;
    const p = TurnEngine.phase;
    if (p === 'idle') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'start';
        btnStart.textContent = 'INIZIA MISSIONE';
    } else if (p === 'setup') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'end';
        btnStart.textContent = 'TERMINA SETUP';
    } else if (p === 'event_mission') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'start';
        btnStart.textContent = 'EVENTO MISSIONE';
    } else if (p === 'event_card') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'end';
        btnStart.textContent = 'CARTA EVENTO';
    } else if (p === 'round_start') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'start';
        btnStart.textContent = `INIZIA ${TurnEngine.round + 1}° ROUND`;
    } else if (p === 'move_phase') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'end';
        btnStart.textContent = 'TERMINA FASE MOVIMENTO';
    } else if (p === 'attack_phase') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'end';
        btnStart.textContent = 'TERMINA FASE ATTACCO';
    } else if (p === 'end_round') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'end';
        btnStart.textContent = 'TERMINA ROUND';
    }
    else {
        btnStart.hidden = true; // nelle altre fasi non serve
    }
}

// click handler
btnStart?.addEventListener('click', async () => {
    const mode = btnStart.dataset.mode;
    if (mode === 'start') {
        await GAME_STATE.turnEngine.startPhase(TurnEngine.phase);
    } else if (mode === 'end') {
        await GAME_STATE.turnEngine.endPhase(TurnEngine.phase);
    }
});

// === Volume UI (BG + SFX) auto-mount ===
function volumeUI() {
    if (!window.MIXER || typeof MIXER.setMusicVolume !== 'function') {
        // mixer non ancora pronto: riprova tra poco
        setTimeout(volumeUI, 50);
        return;
    }
    const LS_BG = 'vol:bg';
    const LS_SFX = 'vol:sfx';

    function getMixer() {
        if (window.MIXER && typeof MIXER.setConfig === 'function') return MIXER;
        console.warn('[volUI] MIXER non pronto, retry…');
        setTimeout(volumeUI, 150);
        throw new Error('MIXER not ready');
    }

    function mountControls() {
        // Trova un punto comodo (vicino al timer). Se non esiste, appendi al body.
        const host = document.querySelector('.center-box') || document.body;

        // Evita duplicati
        if (host.querySelector('#bgVol')) return;

        const wrap = document.createElement('div');
        wrap.className = 'vol-wrap';
        wrap.innerHTML = `
      <style>
        .vol-wrap{ display:flex; gap:14px; align-items:center; margin-left:12px; }
        .vol-ctrl{ display:flex; align-items:center; gap:8px; }
        .vol-ctrl .mc-label{ font-size:12px; opacity:.85; }
        .vol-ctrl input[type="range"]{ width:120px; }
        .vol-ctrl .mc-num{ font-size:12px; min-width:28px; text-align:right; opacity:.9; }
      </style>
      <div class="vol-ctrl" title="Volume musica">
        <span class="mc-label">BG</span>
        <input id="bgVol" type="range" min="0" max="100" step="1" />
        <span id="bgVolVal" class="mc-num">–</span>
      </div>
      <div class="vol-ctrl" title="Volume effetti">
        <span class="mc-label">SFX</span>
        <input id="sfxVol" type="range" min="0" max="100" step="1" />
        <span id="sfxVolVal" class="mc-num">–</span>
      </div>
    `;
        host.appendChild(wrap);

        const MIX = getMixer();
        console.log('mix init')

        // Valori iniziali (da LS oppure dal mixer)
        const initBG = (() => {
            const v = parseFloat(localStorage.getItem(LS_BG));
            return Number.isFinite(v) ? v : (MIX?._state?.cfg?.music ?? 0.25);
        })();
        const initSFX = (() => {
            const v = parseFloat(localStorage.getItem(LS_SFX));
            return Number.isFinite(v) ? v : (MIX?._state?.cfg?.sfx ?? 1.0);
        })();

        const bgSlider = document.getElementById('bgVol');
        const bgLabel = document.getElementById('bgVolVal');
        const sfxSlider = document.getElementById('sfxVol');
        const sfxLabel = document.getElementById('sfxVolVal');

        function applyBG(v) {
            v = Math.max(0, Math.min(1, Number(v) || 0));
            MIX.setMusicVolume(v);
            console.log('applyBG')
            localStorage.setItem(LS_BG, String(v));
            if (bgLabel) bgLabel.textContent = Math.round(v * 100);
        }
        function applySFX(v) {
            v = Math.max(0, Math.min(1, Number(v) || 0));
            MIX.setSfxVolume(v);
            console.log('applySFX')
            localStorage.setItem(LS_SFX, String(v));
            if (sfxLabel) sfxLabel.textContent = Math.round(v * 100);
        }

        // Set iniziale UI
        bgSlider.value = Math.round(initBG * 100);
        sfxSlider.value = Math.round(initSFX * 100);
        applyBG(initBG);
        applySFX(initSFX);

        // Handlers
        const onBG = () => applyBG((Number(bgSlider.value) || 0) / 100);
        const onSFX = () => applySFX((Number(sfxSlider.value) || 0) / 100);
        bgSlider.addEventListener('input', onBG);
        bgSlider.addEventListener('change', onBG);
        sfxSlider.addEventListener('input', onSFX);
        sfxSlider.addEventListener('change', onSFX);

        console.log('[volUI] OK: sliders montati');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountControls);
    } else {
        mountControls();
    }
};

function mountVolumeCard() {
    // aspetta che il MIXER esponga i setter
    if (!window.MIXER || typeof MIXER.setMusicVolume !== 'function') {
        setTimeout(mountVolumeCard, 40);
        return;
    }
    const musicEl = document.getElementById('vol-music');
    const sfxEl = document.getElementById('vol-sfx');
    const outM = document.getElementById('vol-music-val');
    const outS = document.getElementById('vol-sfx-val');

    // leggi config corrente dal mixer
    const cfg = MIXER._state?.cfg || { music: 0.22, sfx: 0.8 };
    const mVal = Math.round((cfg.music ?? 0.22) * 100);
    const sVal = Math.round((cfg.sfx ?? 0.80) * 100);

    musicEl.value = mVal;
    sfxEl.value = sVal;
    outM.textContent = `${mVal}%`;
    outS.textContent = `${sVal}%`;

    // applica riempimento grafico
    updateSliderFill(musicEl);
    updateSliderFill(sfxEl);

    const onInput = (ev) => {
        const el = ev.currentTarget;
        const val = parseInt(el.value, 10) || 0;
        const pct = Math.max(0, Math.min(100, val));
        if (el === musicEl) {
            MIXER.setMusicVolume(pct / 100);
            outM.textContent = `${pct}%`;
            localStorage.setItem('vol.music', String(pct));
        } else {
            MIXER.setSfxVolume(pct / 100);
            outS.textContent = `${pct}%`;
            localStorage.setItem('vol.sfx', String(pct));
        }
        updateSliderFill(el);
    };

    musicEl.addEventListener('input', onInput);
    sfxEl.addEventListener('input', onInput);

    // se avevi salvato preferenze, ricaricale
    const savedM = parseInt(localStorage.getItem('vol.music') || '', 10);
    const savedS = parseInt(localStorage.getItem('vol.sfx') || '', 10);
    if (!Number.isNaN(savedM)) { musicEl.value = savedM; outM.textContent = `${savedM}%`; MIXER.setMusicVolume(savedM / 100); updateSliderFill(musicEl); }
    if (!Number.isNaN(savedS)) { sfxEl.value = savedS; outS.textContent = `${savedS}%`; MIXER.setSfxVolume(savedS / 100); updateSliderFill(sfxEl); }
}

// colora la track fino alla percentuale
function updateSliderFill(inputEl) {
    const pct = (parseInt(inputEl.value, 10) || 0);
    const styles = getComputedStyle(inputEl);
    const fill = styles.getPropertyValue('--fill').trim() || '#3b82f6';
    const track = styles.getPropertyValue('--track').trim() || '#1a2031';
    inputEl.style.background = `linear-gradient(to right, ${fill} 0% ${pct}%, ${track} ${pct}% 100%)`;
}

(function wireAudioPopup() {
    const btn = document.getElementById('btn-audio');
    const dlg = document.getElementById('audio-modal');
    const bd = document.getElementById('audio-backdrop');
    const closeBtn = dlg?.querySelector('[data-close]');
    let inited = false;

    function openAudio() {
        bd.classList.add('show');
        dlg.classList.add('show');
        if (!inited) {
            mountVolumeCard(); // inizializza gli slider SOLO ora
            inited = true;
        }
    }
    function closeAudio() {
        bd.classList.remove('show');
        dlg.classList.remove('show');
    }

    btn?.addEventListener('click', openAudio);
    closeBtn?.addEventListener('click', closeAudio);
    bd?.addEventListener('click', closeAudio);
    // Esc per chiudere
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dlg.classList.contains('show')) closeAudio();
    });
})();



document.addEventListener('DOMContentLoaded', async () => {
    unlockAudioOnFirstTap(() => MIXER?._ctx);
    // BOOT dati
    const booted = await loadDataAndStateFromLocal();

    if (!booted) {
        initSidebars();
        seedWallRows();        // crea segmenti mura 10/11/12
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
        rebuildUnitIndex();
        refreshRollModsUI();
        initModsDiceUI();
        mountUnitModsUI();
    }

    GAME_STATE.turnEngine.init()

    setMixerConfig({
        master: 0.8,
        music: 0.22,
        sfx: 0.8,
        ducking: {
            duckTo: 0.6,
            fadeMs: 180,   // entra dolcemente
            holdMs: 120,   // resta abbassata per poco
            releaseMs: 180, // risale morbida }
        }
    })

    // Mostra welcome/bentornato
    setTimeout(() => { showWelcomePopup(!booted, "assets/img/comandanti/erwin_popup_benvenuto.jpg"); }, 60);
});

