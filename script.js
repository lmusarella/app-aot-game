'use strict';

/*************************************************
 * AOT Companion — DOM-safe (no innerHTML)
 * GENERAZIONE PER CLASSI — PARTE 1
 * Contiene: Utilities + Helper `el()`, Repositories,
 * Store, Services (Audio/Timer/Deck/Log)
 *************************************************/

/* ===========================
 * Utilities & Domain Types
 * =========================== */

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const toInt = (v, d = 0) => { const n = parseInt(String(v), 10); return Number.isFinite(n) ? n : d; };
const safeStr = (v, fb = '') => (typeof v === 'string' && v.length ? v : fb);
const nowTime = () => new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

/** @typedef {{ level:number, xpRequired:number, bonus:string }} XpLevel */
/** @typedef {{ objective:string, reward:string, event:string }} Mission */
/** @typedef {{ titolo:string, descrizione:string, tipo:string }} EventCard */
/** @typedef {{ moraleMin:number, moraleMax:number, xpMin:number, xpMax:number, moraleDefault:number, xpDefault:number, missionTimerSeconds:number, wallDefaultHp:{maria:number, rose:number, sina:number} }} Settings */

/** @typedef {'recruit'|'commander'} UnitType */
/** @typedef {{ id:number, name:string, hp:number, initialHp:number, onMission:boolean, type:UnitType, imageUrl:string }} Unit */
/** @typedef {{ id:number, name:string, hp:number, initialHp:number, cooldown:number, type:'Puro'|'Anomalo'|'Mutaforma', isDefeated:boolean, createdAt:number }} Titan */

/** @typedef {ReturnType<typeof buildInitialState>} GameState */

const TITAN_TYPES = ['Puro', 'Anomalo', 'Mutaforma'];

/**
 * Helper per creare nodi DOM in modo conciso e sicuro.
 * @param {keyof HTMLElementTagNameMap} tag
 * @param {{ className?:string, text?:string, attrs?:Record<string,string>, dataset?:Record<string, any>, style?:Partial<CSSStyleDeclaration> }} [opts]
 * @param {...(Node|string)} children
 */
function el(tag, opts = {}, ...children) {
    const node = document.createElement(tag);
    const { className, text, attrs, dataset, style } = opts;
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    if (dataset) Object.assign(node.dataset, dataset);
    if (style) Object.assign(node.style, style);
    for (const c of children) { node.append(c instanceof Node ? c : document.createTextNode(String(c))); }
    return node;
}

/* ===========================
 * Initial State Builder (funzioni pure)
 * =========================== */

function defaultsFromSettings(s) {
    const moraleMin = toInt(s?.moraleMin ?? 0), moraleMax = toInt(s?.moraleMax ?? 15);
    const xpMin = toInt(s?.xpMin ?? 0), xpMax = toInt(s?.xpMax ?? 70);
    return {
        moraleMin, moraleMax, xpMin, xpMax,
        moraleDefault: clamp(toInt(s?.moraleDefault ?? 15), moraleMin, moraleMax),
        xpDefault: clamp(toInt(s?.xpDefault ?? 0), xpMin, xpMax),
        missionTimerSeconds: toInt(s?.missionTimerSeconds ?? 20 * 60),
        wallDefaultHp: s?.wallDefaultHp ?? { maria: 15, rose: 5, sina: 3 }
    };
}

function normalizeUnit(u, fixedType) {
    const initialHp = toInt(u.initialHp ?? (fixedType === 'commander' ? 18 : 10));
    return {
        id: toInt(u.id ?? 0),
        name: safeStr(u.name, fixedType === 'recruit' ? 'Recluta' : 'Comandante'),
        hp: clamp(toInt(u.hp ?? initialHp), 0, initialHp),
        initialHp,
        onMission: Boolean(u.onMission),
        type: /** @type {UnitType} */(fixedType),
        imageUrl: safeStr(u.imageUrl, 'https://placehold.co/60x60/cccccc/000000?text=IMG')
    };
}

function normalizeTitan(t) {
    const type = TITAN_TYPES.includes(t.type) ? t.type : 'Puro';
    const initialHp = toInt(t.initialHp ?? 12);
    return {
        id: toInt(t.id ?? 0),
        name: safeStr(t.name, 'Gigante'),
        hp: clamp(toInt(t.hp ?? initialHp), 0, initialHp),
        initialHp,
        cooldown: Math.max(0, toInt(t.cooldown ?? 0)),
        type: /** @type {any} */(type),
        isDefeated: Boolean(t.isDefeated),
        createdAt: Number.isFinite(t.createdAt) ? Number(t.createdAt) : Date.now()
    };
}

function buildInitialState(db, saved) {
    const def = defaultsFromSettings(db.settings || {});
    const recruitsDb = db.units?.recruits ?? [];
    const commandersDb = db.units?.commanders ?? [];
    const titansDb = db.units?.titans ?? [];

    /** @type {GameState} */
    const base = {
        currentMissionNumber: 1,
        recruitsData: recruitsDb.map(u => normalizeUnit(u, 'recruit')),
        commandersData: commandersDb.map(u => normalizeUnit(u, 'commander')),
        titansData: titansDb.map(normalizeTitan),
        titanIdCounter: db.units?.titanIdCounterStart ? toInt(db.units.titanIdCounterStart) : 0,
        logData: [],
        morale: def.moraleDefault,
        xp: def.xpDefault,
        wallHp: { ...def.wallDefaultHp },
        eventDeck: [...db.eventCards],
        eventDiscardPile: [],
        removedEventCards: [],

        __db: db,
        __defaults: def
    };

    if (!saved) return base;
    return {
        ...base,
        ...saved,
        wallHp: saved.wallHp ? { ...base.wallHp, ...saved.wallHp } : base.wallHp,
        eventDeck: Array.isArray(saved.eventDeck) ? saved.eventDeck : base.eventDeck,
        eventDiscardPile: Array.isArray(saved.eventDiscardPile) ? saved.eventDiscardPile : base.eventDiscardPile,
        removedEventCards: Array.isArray(saved.removedEventCards) ? saved.removedEventCards : base.removedEventCards,
    };
}

/* ===========================
 * Repositories
 * =========================== */

class DbRepository {
    /** @returns {Promise<{ xpTable:XpLevel[], missions:Record<number, Mission>, titanSpawnTable:Record<number, Record<string,string>>, eventCards:EventCard[], settings:Partial<Settings>, units?:{ recruits?:Partial<Unit>[], commanders?:Partial<Unit>[], titans?:Partial<Titan>[], titanIdCounterStart?:number } }>} */
    async load() {
        const res = await fetch('./aot_db.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error('Impossibile caricare aot_db.json');
        const json = await res.json();
        return {
            xpTable: Array.isArray(json.xpTable) ? json.xpTable : [],
            missions: json.missions || {},
            titanSpawnTable: json.titanSpawnTable || {},
            eventCards: json.eventCards || [],
            settings: json.settings || {},
            units: json.units || undefined,
        };
    }
}

class StorageRepository {
    constructor(key = 'aotGameState') { this.key = key; }
    /** @returns {Partial<GameState>|null} */
    load() {
        const raw = localStorage.getItem(this.key);
        return raw ? JSON.parse(raw) : null;
    }
    /** @param {GameState} state */
    save(state) { localStorage.setItem(this.key, JSON.stringify(state)); }
}

/* ===========================
 * Store (simple pub/sub)
 * =========================== */

class Store {
    /** @param {GameState} initial */
    constructor(initial) { this.state = initial; this.listeners = new Set(); }
  /** @returns {GameState} */ get() { return this.state; }
    /** @param {(prev:GameState)=>GameState} updater */
    set(updater) { const prev = this.state; const next = updater(prev); this.state = next; this.listeners.forEach(l => l(next, prev)); }
    /** @param {(next:GameState,prev:GameState)=>void} fn */
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

/* ===========================
 * Services
 * =========================== */

class AudioService {
    /** @param {string} url @param {{loop?:boolean, volume?:number}} [opts] */
    async play(url, opts = {}) {
        const { loop = false, volume = 1 } = opts;
        const audio = new Audio();
        audio.src = url; audio.preload = 'auto'; audio.loop = loop; audio.volume = clamp(volume, 0, 1); audio.crossOrigin = 'anonymous';
        try { await audio.play(); } catch (e) { console.warn('Autoplay blocked or error:', e); }
        return audio;
    }
}

class TimerService {
    constructor() { this._int = null; this._remaining = 0; }
    /** @param {number} seconds @param {(m:number,s:number)=>void} onTick @param {()=>void} onEnd */
    start(seconds, onTick, onEnd) {
        this.stop();
        this._remaining = Math.max(0, toInt(seconds));
        const tick = () => {
            const m = Math.floor(this._remaining / 60), s = this._remaining % 60;
            onTick(m, s);
            if (this._remaining-- <= 0) { this.stop(); onEnd(); }
        };
        tick();
        this._int = setInterval(tick, 1000);
    }
    stop() { if (this._int) clearInterval(this._int); this._int = null; }
}

class DeckService {
    /** @param {Store} store @param {() => EventCard[]} getAll */
    constructor(store, getAll) { this.store = store; this.getAll = getAll; }

  /** @returns {number} */ count() { return this.store.get().eventDeck.length; }

    _ensureDeck() {
        const state = this.store.get();
        if (state.eventDeck.length === 0) {
            if (state.eventDiscardPile.length > 0) {
                this.store.set(prev => ({ ...prev, eventDeck: [...prev.eventDiscardPile], eventDiscardPile: [] }));
            } else if (this.getAll().length > 0) {
                this.store.set(prev => ({ ...prev, eventDeck: [...this.getAll()] }));
            }
        }
    }

    /** @returns {EventCard | null} */
    draw() {
        this._ensureDeck();
        const state = this.store.get();
        if (state.eventDeck.length === 0) return null;
        const i = Math.floor(Math.random() * state.eventDeck.length);
        const card = state.eventDeck[i];
        const nextDeck = state.eventDeck.slice(0, i).concat(state.eventDeck.slice(i + 1));
        this.store.set(prev => ({ ...prev, eventDeck: nextDeck }));
        return card;
    }

  /** @param {EventCard} card */ discard(card) { this.store.set(prev => ({ ...prev, eventDiscardPile: [...prev.eventDiscardPile, card] })); }
  /** @param {EventCard} card */ remove(card) { this.store.set(prev => ({ ...prev, removedEventCards: [...prev.removedEventCards, card] })); }
}

class LogService {
    /** @param {Store} store */
    constructor(store) { this.store = store; }
    /** @param {string} message @param {'info'|'mission'|'damage'|'death'|'dice'} [type] */
    add(message, type = 'info') {
        const entry = { time: nowTime(), message, type };
        this.store.set(prev => ({ ...prev, logData: [entry, ...(prev.logData || [])].slice(0, 100) }));
    }
}

'use strict';

/*************************************************
 * AOT Companion — DOM-safe (no innerHTML)
 * GENERAZIONE PER CLASSI — PARTE 2
 * Contiene: UI helpers, Views, App orchestrator, Boot
 * Dipende dalle definizioni della Parte 1 (el, clamp,
 * toInt, TITAN_TYPES, buildInitialState, Store, ecc.)
 *************************************************/

/* ===========================
 * UI Helpers (no innerHTML)
 * =========================== */

const UI = {
    /** Restituisce una classe CSS in base alla % HP */
    hpClass(hp, initial) {
        if (hp <= 0) return 'hp-dead';
        const p = (hp / initial) * 100;
        return p > 60 ? 'hp-high' : p > 30 ? 'hp-medium' : 'hp-low';
    },
    /** Aggiorna decorazioni dei range slider */
    sliderDecor(slider) {
        const container = slider.closest('.slider-value-container');
        const valueSpan = container?.querySelector('span');
        if (valueSpan) {
            // per XP lasciamo gestione esterna eventuale; per morale aggiorniamo live
            if (slider.id !== 'xp') valueSpan.textContent = slider.value;
        }
        const pct = (toInt(slider.value) / toInt(slider.max)) * 100;
        let colorVar = 'var(--status-low)';
        if (pct > 60) colorVar = 'var(--status-high)';
        else if (pct > 30) colorVar = 'var(--status-medium)';
        slider.style.setProperty('--slider-color', colorVar);
        slider.style.setProperty('--range-progress', `${pct}%`);
    },
    /** Calcola livello/bonus dall'XP table */
    levelFromXp(xp, xpTable) {
        const arr = xpTable.filter(l => xp >= l.xpRequired);
        return arr.length ? arr[arr.length - 1] : { level: 1, xpRequired: 0, bonus: '-' };
    },
};

/* ===========================
 * Views (render con DOM API, no innerHTML)
 * =========================== */

class StartOverlayView {
    /** @param {{title?:string,message?:string,confirmText?:string,cancelText?:string,imageUrl?:string,imageAlt?:string}} [opts] */
    static show(opts = {}) {
        const {
            title = 'Benvenuto su AOT Campaign',
            message = 'Sei pronto a difendere le mura dalla minaccia dei Giganti?',
            confirmText = 'Li sterminerò tutti!',
            cancelText = 'Mi rifugerò nei territori interni!',
            imageUrl = 'corpo_di_ricerca.jpg',
            imageAlt = 'Artwork AOT'
        } = opts;

        return new Promise(resolve => {
            const overlay = el('div');
            overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.85); backdrop-filter: blur(2px) saturate(.9); display:grid; place-items:center; z-index:999999; transition:opacity .2s; opacity:0;';

            const modal = el('div', { attrs: { role: 'dialog', 'aria-modal': 'true' } });
            modal.style.cssText = 'width:min(560px,92vw); background:linear-gradient(180deg,#121421,#171a2b); color:#e7e9ef; border:1px solid #2a2e45; border-radius:16px; padding:20px 20px 84px; box-shadow:0 16px 48px rgba(0,0,0,.45); transform:translateY(8px); transition:transform .2s, opacity .2s; opacity:0; position:relative;';
            const accent = '#c53030';

            const headerRow = el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' } },
                el('div', { style: { width: '6px', height: '28px', borderRadius: '4px', background: accent, boxShadow: '0 0 0 1px rgba(0,0,0,.25) inset' } }),
                el('h2', { text: title, style: { margin: '0', fontSize: '22px', letterSpacing: '.3px' } })
            );

            const img = imageUrl ? el('img', { attrs: { src: imageUrl, alt: imageAlt }, style: { width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '12px', boxShadow: '0 6px 20px rgba(0,0,0,.35)', outline: '1px solid rgba(255,255,255,.06)', marginBottom: '14px' } }) : null;
            if (img) img.addEventListener('error', () => { img.style.display = 'none'; });

            const p = el('p', { text: message, style: { margin: '0', opacity: '.95' } });

            const cancel = el('button', { text: cancelText, attrs: { id: 'start-cancel' }, style: { position: 'absolute', left: '20px', bottom: '20px', padding: '10px 14px', borderRadius: '10px', border: '1px solid #2a2e45', background: '#1d2240', color: '#e7e9ef', cursor: 'pointer' } });
            const confirm = el('button', { text: confirmText, attrs: { id: 'start-confirm' }, style: { position: 'absolute', right: '20px', bottom: '20px', padding: '10px 14px', borderRadius: '10px', border: 'none', background: accent, color: '#fff', cursor: 'pointer' } });

            modal.append(headerRow);
            if (img) modal.append(img);
            modal.append(p, cancel, confirm);
            overlay.append(modal);
            document.body.appendChild(overlay);

            const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
            requestAnimationFrame(() => { overlay.style.opacity = '1'; modal.style.opacity = '1'; modal.style.transform = 'translateY(0)'; });

            const cleanup = (res) => { document.body.style.overflow = prevOverflow; overlay.remove(); resolve(res); };
            const onKey = (e) => { if (e.key === 'Escape') cleanup(false); if (e.key === 'Enter') confirm.click(); };
            cancel.addEventListener('click', () => cleanup(false));
            confirm.addEventListener('click', () => cleanup(true));
            document.addEventListener('keydown', onKey, { once: true });
            setTimeout(() => confirm.focus(), 0);
        });
    }
}

class HeaderView {
    /** @param {Store} store */
    constructor(store) {
        this.store = store;
        this.missionCount = document.getElementById('mission-count');
        this.timerLabel = document.getElementById('mission-timer');
        this.btnReset = document.getElementById('reset-game-btn');
        this.btnRestartTimer = document.getElementById('restart-mission-btn');
    }
    bind({ onReset, onRestartTimer }) {
        this.btnReset?.addEventListener('click', onReset);
        this.btnRestartTimer?.addEventListener('click', onRestartTimer);
    }
    setMission(n) { if (this.missionCount) this.missionCount.textContent = `Missione #${n}`; }
    setTimer(m, s) { if (this.timerLabel) this.timerLabel.textContent = `${m}:${s < 10 ? '0' : ''}${s}`; }
    setExpired() { if (this.timerLabel) this.timerLabel.textContent = 'SCADUTO'; }
}

class StatsView {
    /** @param {Store} store */
    constructor(store) {
        this.store = store;
        this.morale = /** @type {HTMLInputElement} */(document.getElementById('morale'));
        this.xp = /** @type {HTMLInputElement} */(document.getElementById('xp'));
        this.moraleDesc = document.getElementById('morale-description');
        this.xpBonuses = document.getElementById('xp-bonuses');
        this.bonusRecap = document.getElementById('bonus-recap-text');
        this.wallHpSection = document.getElementById('wall-hp-section');
    }
    bind() {
        this.morale?.addEventListener('input', () => {
            const v = toInt(this.morale.value); UI.sliderDecor(this.morale);
            this.store.set(prev => ({ ...prev, morale: Math.max(prev.__defaults.moraleMin, Math.min(prev.__defaults.moraleMax, v)) }));
        });
        this.xp?.addEventListener('input', () => {
            const v = toInt(this.xp.value); UI.sliderDecor(this.xp);
            this.store.set(prev => ({ ...prev, xp: Math.max(prev.__defaults.xpMin, Math.min(prev.__defaults.xpMax, v)) }));
        });
        this.renderWalls();
    }
    render() {
        const s = this.store.get();
        if (this.morale) { this.morale.value = String(s.morale); UI.sliderDecor(this.morale); }
        if (this.xp) { this.xp.value = String(s.xp); UI.sliderDecor(this.xp); }

        const m = s.morale;
        let desc = 'Nessun malus';
        if (m == 0) desc = 'AVETE PERSO'; else if (m <= 5) desc = 'Malus: -2 AGI, -1 STR, -1 TEC'; else if (m <= 9) desc = 'Malus: -1 AGI, -1 STR'; else if (m <= 12) desc = 'Malus: -1 AGI';
        if (this.moraleDesc) this.moraleDesc.textContent = desc;

        const lvl = UI.levelFromXp(s.xp, s.__db.xpTable);
        if (this.xpBonuses) this.xpBonuses.textContent = `Bonus: ${lvl.bonus}`;

        this._renderBonusRecap(m, s.xp, s.__db.xpTable);
        this._refreshWallSliders();
    }
    _renderBonusRecap(morale, xp, xpTable) {
        /** @type {{AGI:number, STR:number, TEC:number}} */
        const total = { AGI: 0, STR: 0, TEC: 0 };
        if (morale <= 5) { total.AGI -= 2; total.STR -= 1; total.TEC -= 1; }
        else if (morale <= 9) { total.AGI -= 1; total.STR -= 1; }
        else if (morale <= 12) { total.AGI -= 1; }

        const lvl = UI.levelFromXp(xp, xpTable);
        if (lvl && lvl.bonus && lvl.bonus !== '-') {
            lvl.bonus.split(',').map(s => s.trim()).forEach(part => {
                const m = part.match(/([+-]\d+)\s(AGI|STR|TEC)/);
                if (m) { total[/** @type {'AGI'|'STR'|'TEC'} */(m[2])] += toInt(m[1]); }
            });
        }
        const txt = Object.entries(total).filter(([, v]) => v !== 0).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k}`).join(', ') || 'Nessun bonus/malus';
        if (this.bonusRecap) this.bonusRecap.textContent = txt;
    }
    renderWalls() {
        const container = this.wallHpSection; if (!container) return;
        const s = this.store.get();
        const cfg = { maria: 15, rose: 5, sina: 3, ...s.__defaults.wallDefaultHp };

        const frag = new DocumentFragment();
        frag.append(el('h3', { className: 'stats-title', text: 'Mura' }));

        /** @type {(key:'maria'|'rose'|'sina')=>void} */
        const addWall = (name) => {
            const id = `wall-${name}-hp`;
            const labelMap = { maria: 'Wall Maria', rose: 'Wall Rose', sina: 'Wall Sina' };
            const wrap = el('div', { className: 'stat' });
            const label = el('label', { attrs: { for: id }, text: labelMap[name] + ':' });

            const slider = /** @type {HTMLInputElement} */(el('input', { attrs: { type: 'range', id, min: '0', max: String(cfg[name]), value: String(s.wallHp[name]) }, dataset: { wallName: name } }));
            const spanVal = el('span', { text: String(s.wallHp[name]) });
            const sliderWrap = el('div', { className: 'slider-value-container' }, slider, spanVal);

            wrap.append(label, sliderWrap);
            frag.append(wrap);

            UI.sliderDecor(slider);
            slider.addEventListener('input', () => {
                UI.sliderDecor(slider);
                const newHp = toInt(slider.value);
                this.store.set(prev => ({ ...prev, wallHp: { ...prev.wallHp, [name]: newHp } }));
                spanVal.textContent = String(newHp);
            });
        };

        addWall('maria'); addWall('rose'); addWall('sina');
        container.replaceChildren(frag);
    }
    _refreshWallSliders() {
        if (!this.wallHpSection) return; const s = this.store.get();
        this.wallHpSection.querySelectorAll('input[type="range"]').forEach(sl => {
            const elx = /** @type {HTMLInputElement} */(sl);
            const wall = /** @type {'maria'|'rose'|'sina'} */(elx.dataset.wallName);
            const val = s.wallHp[wall];
            if (toInt(elx.value) !== val) { elx.value = String(val); }
            const container = elx.closest('.slider-value-container');
            const span = container?.querySelector('span'); if (span) span.textContent = String(val);
            UI.sliderDecor(elx);
        });
    }
}

class LogView {
    /** @param {Store} store */
    constructor(store) { this.store = store; this.wrap = document.getElementById('log-entries'); }
    render() {
        const s = this.store.get(); if (!this.wrap) return;
        const frag = new DocumentFragment();
        (s.logData || []).forEach(e => {
            const p = el('p', { className: `log-${e.type}` });
            const strong = el('strong', { text: `[${e.time}]` });
            p.append(strong, ' ', document.createTextNode(e.message));
            frag.append(p);
        });
        this.wrap.replaceChildren(frag);
    }
}

class DiceView {
    /** @param {LogService} logger */
    constructor(logger) { this.logger = logger; this.panel = document.getElementById('dice-roller-panel'); this.result = document.getElementById('dice-result-area'); }
    bind() {
        document.body.addEventListener('click', (e) => {
            const btn = /** @type {HTMLElement|null} */(e.target instanceof HTMLElement ? e.target.closest('.roll-dice-btn') : null);
            if (!btn) return; const sides = toInt(btn.dataset.sides), count = toInt(btn.dataset.count);
            const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
            const sum = rolls.reduce((a, b) => a + b, 0);
            if (this.result) {
                const frag = new DocumentFragment();
                frag.append(el('p', {}, el('strong', { text: 'Tiri:' }), ' ', rolls.join(', ')));
                frag.append(el('p', {}, el('strong', { text: 'Totale:' }), ' ', String(sum)));
                this.result.replaceChildren(frag);
            }
            this.logger.add(`Lanciati ${count}D${sides}. Risultati: ${rolls.join(', ')}. Totale: ${sum}.`, 'dice');
        });
    }
}

class MissionView {
    /** @param {Store} store @param {LogService} logger */
    constructor(store, logger) {
        this.store = store; this.logger = logger;
        this.obj = document.getElementById('mission-objective-text');
        this.reward = document.getElementById('mission-reward-text');
        this.event = document.getElementById('mission-event-text');
        this.btnDec = document.getElementById('decrease-mission');
        this.btnInc = document.getElementById('increase-mission');
        this.unitsGrid = document.getElementById('mission-units-grid');
        this.recruitsCount = document.getElementById('living-recruits');
        this.commandersCount = document.getElementById('living-commanders');
    }
    bind() {
        this.btnDec?.addEventListener('click', () => this._changeMission(-1));
        this.btnInc?.addEventListener('click', () => this._changeMission(1));

        this.unitsGrid?.addEventListener('click', (e) => {
            const rmBtn = e.target instanceof HTMLElement ? e.target.closest('.remove-from-mission-btn') : null;
            const hpBtn = e.target instanceof HTMLElement ? e.target.closest('.hp-change') : null;
            if (!rmBtn && !hpBtn) return;

            const id = toInt((rmBtn || hpBtn).dataset.id);
            const type = /** @type {UnitType} */((rmBtn || hpBtn).dataset.type);
            if (rmBtn) this._toggleMission(type, id);
            if (hpBtn) this._queueHpChange(type, id, toInt(hpBtn.dataset.amount));
        });
    }
    render() {
        const s = this.store.get();
        const m = s.__db.missions[s.currentMissionNumber] || { objective: 'N/D', reward: 'N/D', event: 'N/D' };
        if (this.obj) this.obj.textContent = m.objective;
        if (this.reward) this.reward.textContent = m.reward;
        if (this.event) this.event.textContent = m.event;

        const livingRecruits = s.recruitsData.filter(r => r.hp > 0).length;
        const livingCommanders = s.commandersData.filter(c => c.hp > 0).length;
        this.recruitsCount && (this.recruitsCount.textContent = `${livingRecruits}/${s.recruitsData.length}`);
        this.commandersCount && (this.commandersCount.textContent = `${livingCommanders}/${s.commandersData.length}`);

        const onMission = [...s.recruitsData, ...s.commandersData].filter(u => u.onMission && u.hp > 0);
        if (!this.unitsGrid) return;

        const frag = new DocumentFragment();
        if (onMission.length === 0) {
            frag.append(el('p', { style: { color: 'var(--text-secondary)', textAlign: 'center', gridColumn: '1/-1', margin: 'auto' }, text: 'Nessuna unità in missione.' }));
        } else {
            for (const u of onMission) {
                const hpC = UI.hpClass(u.hp, u.initialHp);

                const closeBtn = el('button', { className: 'remove-from-mission-btn', dataset: { id: u.id, type: u.type } }, '×');
                const img = el('img', { className: 'unit-image', attrs: { src: u.imageUrl, alt: u.name } });
                img.addEventListener('error', () => { img.src = 'https://placehold.co/60x60/cccccc/000000?text=IMG'; });
                const nameDiv = el('div', { className: 'name', text: u.name });

                const minus = el('button', { className: 'hp-change btn', dataset: { id: u.id, type: u.type, amount: -1 } }, '-');
                const hp = el('span', { className: `label hp ${hpC}`, text: String(u.hp) });
                const plus = el('button', { className: 'hp-change btn', dataset: { id: u.id, type: u.type, amount: 1 } }, '+');
                const controls = el('div', { className: 'controls' }, minus, hp, plus);
                const statRow = el('div', { className: 'stat-row' }, controls);

                const card = el('div', { className: `unit-card ${u.type === 'commander' ? 'commander' : ''}` }, closeBtn, img, nameDiv, statRow);
                frag.append(card);
            }
        }
        this.unitsGrid.replaceChildren(frag);
    }
    _changeMission(delta) {
        this.store.set(prev => {
            const keys = Object.keys(prev.__db.missions);
            const max = keys.length ? Math.max(...keys.map(k => toInt(k))) : 1;
            const next = Math.max(1, Math.min(max, prev.currentMissionNumber + delta));
            if (next !== prev.currentMissionNumber) this.logger.add(`Passato alla Missione #${next}.`, 'mission');
            return { ...prev, currentMissionNumber: next };
        });
    }
    _toggleMission(type, id) {
        this.store.set(prev => {
            const listKey = type === 'recruit' ? 'recruitsData' : 'commandersData';
            const nextList = prev[listKey].map(u => u.id === id ? { ...u, onMission: !u.onMission } : u);
            return { ...prev, [listKey]: nextList };
        });
    }
    _queueHpChange(type, id, amount) {
        document.dispatchEvent(new CustomEvent('hp:queue', { detail: { kind: type, id, amount } }));
    }
}

class UnitPopupsView {
    /** @param {Store} store */
    constructor(store) {
        this.store = store;
        this.gridPopup = document.getElementById('grid-popup');
        this.recruitsPopup = document.getElementById('recruits-popup');
        this.commandersPopup = document.getElementById('commanders-popup');
        this.recruitsList = document.getElementById('recruits-list');
        this.commandersList = document.getElementById('commanders-list');
        this.openRecruits = document.getElementById('open-recruits-popup');
        this.closeRecruits = document.getElementById('close-recruits-popup');
        this.openCommanders = document.getElementById('open-commanders-popup');
        this.closeCommanders = document.getElementById('close-commanders-popup');
        this.openGrid = document.getElementById('open-grid-popup');
        this.closeGrid = document.getElementById('close-grid-popup');
    }
    bind() {
        this.openRecruits?.addEventListener('click', () => this.recruitsPopup?.classList.add('show'));
        this.closeRecruits?.addEventListener('click', () => this.recruitsPopup?.classList.remove('show'));
        this.openCommanders?.addEventListener('click', () => this.commandersPopup?.classList.add('show'));
        this.closeCommanders?.addEventListener('click', () => this.commandersPopup?.classList.remove('show'));
        this.openGrid?.addEventListener('click', () => this.gridPopup?.classList.add('show'));
        this.closeGrid?.addEventListener('click', () => this.gridPopup?.classList.remove('show'));

        const handle = (e) => {
            const btn = e.target instanceof HTMLElement ? e.target.closest('.hp-change, .mission-button') : null; if (!btn) return;
            const id = toInt(btn.dataset.id); const type = /** @type {UnitType} */(btn.dataset.type);
            if (btn.classList.contains('hp-change')) document.dispatchEvent(new CustomEvent('hp:queue', { detail: { kind: type, id, amount: toInt(btn.dataset.amount) } }));
            if (btn.classList.contains('mission-button')) this._toggle(type, id);
        };
        this.recruitsList?.addEventListener('click', handle);
        this.commandersList?.addEventListener('click', handle);

    }
    render() {
        this._renderList('recruit', this.recruitsList);
        this._renderList('commander', this.commandersList);
    }
    _renderList(type, ul) {
        if (!ul) return; const s = this.store.get(); const data = type === 'recruit' ? s.recruitsData : s.commandersData; ul.replaceChildren();
        const living = data.filter(u => u.hp > 0).sort((a, b) => a.name.localeCompare(b.name));
        const dead = data.filter(u => u.hp <= 0).sort((a, b) => a.name.localeCompare(b.name));
        const frag = new DocumentFragment();

        const createLi = (u) => {
            const li = el('li');
            const info = el('div', { className: 'unit-info-popup' });
            const img = el('img', { className: 'unit-image-popup', attrs: { src: u.imageUrl, alt: u.name } });
            img.addEventListener('error', () => { img.src = 'https://placehold.co/60x60/cccccc/000000?text=IMG'; });
            const nameSpan = el('span', { className: UI.hpClass(u.hp, u.initialHp), text: `${u.name} (HP: ${u.hp > 0 ? u.hp : 'Morto'})` });
            info.append(img, nameSpan);

            const controls = el('div', { className: 'hp-controls' });
            const minus = el('button', { className: 'hp-change btn', dataset: { id: u.id, type, amount: -1 }, attrs: u.hp <= 0 ? { disabled: 'true' } : {} }, '-');
            const plus = el('button', { className: 'hp-change btn', dataset: { id: u.id, type, amount: 1 } }, '+');
            const mission = el('button', { className: `mission-button btn ${u.onMission ? 'on-mission' : ''}`, dataset: { id: u.id, type }, attrs: u.hp <= 0 ? { disabled: 'true' } : {} }, u.onMission ? 'Rimuovi' : 'Invia');
            controls.append(minus, plus, mission);

            li.append(info, controls);
            return li;
        };

        living.forEach(u => frag.append(createLi(u)));
        if (dead.length && living.length) { const sepLi = el('li'); sepLi.append(el('hr', { attrs: { style: 'width:100%; border-color: var(--background-lighter); margin:.5rem 0;' } })); frag.append(sepLi); }
        dead.forEach(u => frag.append(createLi(u)));

        ul.append(frag);
    }
    _toggle(type, id) {
        this.store.set(prev => {
            const key = type === 'recruit' ? 'recruitsData' : 'commandersData';
            return { ...prev, [key]: prev[key].map(u => u.id === id ? { ...u, onMission: !u.onMission } : u) };
        });
    }
}

class TitansView {
    /** @param {Store} store @param {LogService} logger */
    constructor(store, logger) {
        this.store = store; this.logger = logger;
        this.btnAdd = document.getElementById('add-titan-btn');
        this.grid = document.getElementById('titan-grid');
        this.header = document.querySelector('.titans-header');
    }
    bind() {
        this.btnAdd?.addEventListener('click', () => this._addTitan());
        this.grid?.addEventListener('click', (e) => {
            const elx = e.target instanceof HTMLElement ? e.target : null; if (!elx) return;
            const rm = elx.closest('.remove-titan-btn'); const cd = elx.closest('.cooldown-change'); const sw = elx.closest('.titan-type-switcher'); const hp = elx.closest('.hp-change');
            if (!rm && !cd && !sw && !hp) return;
            const id = toInt((rm || cd || sw || hp).dataset.id);
            if (rm) this._remove(id);
            if (cd) this._cooldown(id, toInt(cd.dataset.amount));
            if (sw) this._switchType(id);
            if (hp) document.dispatchEvent(new CustomEvent('hp:queue', { detail: { kind: 'titan', id, amount: toInt(hp.dataset.amount) } }));
        });
    }
    render() {
        const s = this.store.get();
        this._renderSpawnLegend();

        if (!this.grid) return;

        const frag = new DocumentFragment();
        if (!s.titansData.length) {
            frag.append(el('p', { style: { color: 'var(--text-secondary)', textAlign: 'center', gridColumn: '1/-1', margin: 'auto' }, text: 'Nessun gigante in campo.' }));
        } else {
            s.titansData.forEach(t => {
                const isDead = t.hp <= 0; const hpC = UI.hpClass(t.hp, t.initialHp);

                const card = el('div', { className: `unit-card ${isDead ? 'titan-dead' : `titan-${t.type.toLowerCase()}`}` });
                const removeBtn = el('button', { className: 'remove-titan-btn', dataset: { id: t.id } }, '×');
                const nameDiv = el('div', { className: 'name', text: isDead ? 'Sconfitto' : t.name });
                const typeBtn = el('button', { className: 'titan-type-switcher', dataset: { id: t.id }, attrs: isDead ? { disabled: 'true' } : {} }, t.type);

                const minus = el('button', { className: 'hp-change btn', dataset: { id: t.id, amount: -1 }, attrs: isDead ? { disabled: 'true' } : {} }, '-');
                const hpSpan = el('span', { className: `label hp ${hpC}`, text: String(t.hp) });
                const plus = el('button', { className: 'hp-change btn', dataset: { id: t.id, amount: 1 }, attrs: isDead ? { disabled: 'true' } : {} }, '+');
                const hpControls = el('div', { className: 'controls' }, minus, hpSpan, plus);
                const hpRow = el('div', { className: 'stat-row' }, hpControls);

                const cdMinus = el('button', { className: 'cooldown-change btn', dataset: { id: t.id, amount: -1 } }, '-');
                const cdLabel = el('span', { className: 'label', text: `R:${t.cooldown}` });
                const cdPlus = el('button', { className: 'cooldown-change btn', dataset: { id: t.id, amount: 1 } }, '+');
                const cdControls = el('div', { className: 'controls' }, cdMinus, cdLabel, cdPlus);
                const cdRow = el('div', { className: 'stat-row' }, cdControls);

                card.append(removeBtn, nameDiv, typeBtn, hpRow, cdRow);
                frag.append(card);
            });
        }

        this.grid.replaceChildren(frag);
    }
    _renderSpawnLegend() {
        if (!this.header) return;
        let legend = this.header.querySelector('.titan-spawn-legend');
        if (!legend) { legend = el('div', { className: 'titan-spawn-legend' }); this.header.append(legend); }
        Object.assign(legend.style, { display: 'flex', gap: '.75rem', fontSize: '1.5rem', alignItems: 'center' });

        const s = this.store.get();
        const spawn = s.__db.titanSpawnTable[s.currentMissionNumber] || s.__db.titanSpawnTable[1] || { Puro: '-', Anomalo: '-', Mutaforma: '-' };

        const makeItem = (color, text) => el('div', { style: { display: 'flex', alignItems: 'center', gap: '.25rem' } },
            el('div', { style: { width: '1rem', height: '1rem', borderRadius: '50%', backgroundColor: color } }),
            el('span', { text })
        );

        const frag = new DocumentFragment();
        frag.append(
            makeItem('#a0aec0', spawn['Puro']),
            makeItem('#ecc94b', spawn['Anomalo']),
            makeItem('#f56565', spawn['Mutaforma'])
        );

        legend.replaceChildren(frag);
    }
    _addTitan() {
        this.store.set(prev => {
            const id = (prev.titanIdCounter || 0) + 1;
            const newT = { id, name: `Gigante #${id}`, hp: 12, initialHp: 12, cooldown: 0, type: 'Puro', isDefeated: false, createdAt: Date.now() };
            this.logger.add(`${newT.name} è apparso.`, 'info');
            return { ...prev, titanIdCounter: id, titansData: [...prev.titansData, newT] };
        });
    }
    _remove(id) { this.store.set(prev => ({ ...prev, titansData: prev.titansData.filter(t => t.id !== id) })); }
    _cooldown(id, d) { this.store.set(prev => ({ ...prev, titansData: prev.titansData.map(t => t.id === id ? { ...t, cooldown: Math.max(0, t.cooldown + d) } : t) })); }
    _switchType(id) {
        this.store.set(prev => ({
            ...prev, titansData: prev.titansData.map(t => {
                if (t.id !== id) return t; const i = TITAN_TYPES.indexOf(t.type); return { ...t, type: /** @type {any} */(TITAN_TYPES[(i + 1) % TITAN_TYPES.length]) };
            })
        }));
    }
}

class EventsDeckView {
    /** @param {Store} store @param {DeckService} deck @param {LogService} logger */
    constructor(store, deck, logger) {
        this.store = store; this.deck = deck; this.logger = logger;
        this.drawBtn = document.getElementById('draw-event-btn');
        this.deckCount = document.getElementById('event-deck-count');
        this.popup = document.getElementById('event-card-popup');
        this.title = document.getElementById('event-card-title');
        this.desc = document.getElementById('event-card-description');
        this.type = document.getElementById('event-card-type');
        this.btnReshuffle = document.getElementById('event-reshuffle-btn');
        this.btnDiscard = document.getElementById('event-discard-btn');
        this.btnRemove = document.getElementById('event-remove-btn');

    /** @type {EventCard|null} */ this.current = null;
    }
    bind() {
        this.drawBtn?.addEventListener('click', () => {
            const card = this.deck.draw();
            if (!card) { this.logger.add('Carte evento non caricate.', 'info'); this._updateCount(); return; }
            this.current = card; this._open(card);
            this.logger.add(`Carta evento pescata: ${card.titolo}`, 'mission');
            this._updateCount();
        });
        this.btnReshuffle?.addEventListener('click', () => this._action('reshuffle'));
        this.btnDiscard?.addEventListener('click', () => this._action('discard'));
        this.btnRemove?.addEventListener('click', () => this._action('remove'));
    }
    render() { this._updateCount(); }
    _updateCount() { if (this.deckCount) this.deckCount.textContent = String(this.deck.count()); }
    _open(card) { if (!this.popup) return; if (this.title) this.title.textContent = card.titolo; if (this.desc) this.desc.textContent = card.descrizione; if (this.type) this.type.textContent = card.tipo; this.popup.classList.add('show'); }
    _close() { this.popup?.classList.remove('show'); this.current = null; }
    _action(kind) { if (!this.current) return; const c = this.current; if (kind === 'reshuffle') this.store.set(prev => ({ ...prev, eventDeck: [...prev.eventDeck, c] })); if (kind === 'discard') this.deck.discard(c); if (kind === 'remove') this.deck.remove(c); this.logger.add(`"${c.titolo}" ${kind === 'reshuffle' ? 'rimescolata' : kind === 'discard' ? 'scartata' : 'rimossa'}.`, 'info'); this._close(); this._updateCount(); }
}

/* ===========================
 * Application Orchestrator
 * =========================== */

class App {
    constructor() {
        this.dbRepo = new DbRepository();
        this.storage = new StorageRepository();
        this.audio = new AudioService();
        this.timer = new TimerService();

    /** @type {Store} */ this.store = null;
    /** @type {LogService} */ this.logger = null;
    /** @type {DeckService} */ this.deck = null;

        /** HP batching */
        this.pending = new Map(); // key -> {amount:number}
        this.pendingTimers = new Map();

        // Views
        this.header = null; this.stats = null; this.logView = null; this.mission = null; this.popups = null; this.titans = null; this.events = null; this.dice = null;
    }

    async start() {
        const url = './assets/risorsa_audio_avvio_app.mp3';
        const proceeded = await StartOverlayView.show();
        if (!proceeded) return;
        await this.audio.play(url, { loop: true, volume: 1 });

        const db = await this.dbRepo.load();
        const saved = this.storage.load();
        this.store = new Store(buildInitialState(db, saved));
        this.logger = new LogService(this.store);
        this.deck = new DeckService(this.store, () => this.store.get().__db.eventCards);

        this.header = new HeaderView(this.store);
        this.stats = new StatsView(this.store);
        this.logView = new LogView(this.store);
        this.mission = new MissionView(this.store, this.logger);
        this.popups = new UnitPopupsView(this.store);
        this.titans = new TitansView(this.store, this.logger);
        this.events = new EventsDeckView(this.store, this.deck, this.logger);
        this.dice = new DiceView(this.logger);

        this.header.bind({ onReset: () => this._confirmReset(), onRestartTimer: () => this._restartTimer() });
        this.stats.bind();
        this.mission.bind();
        this.popups.bind();
        this.titans.bind();
        this.events.bind();
        this.dice.bind();

        document.addEventListener('hp:queue', (/** @type {CustomEvent} */ev) => this._queueHp(ev.detail));

        this.store.subscribe((next) => { this._renderAll(); this.storage.save(this._stripTransient(next)); });
        this._renderAll();

        this._restartTimer();
    }

    _stripTransient(s) { const { __db, __defaults, ...rest } = s; return rest; }

    _renderAll() {
        const s = this.store.get();
        this.header?.setMission(s.currentMissionNumber);
        this.stats?.render();
        this.popups?.render();
        this.mission?.render();
        this.titans?.render();
        this.events?.render();
        this.logView?.render();
    }

    _restartTimer() {
        const seconds = this.store.get().__defaults.missionTimerSeconds || 20 * 60;
        this.timer.start(seconds, (m, s) => this.header.setTimer(m, s), () => this.header.setExpired());
        this.logger.add('Timer della missione riavviato.', 'mission');
    }

    _confirmReset() {
        const modal = document.getElementById('reset-confirm-modal');
        const cancel = document.getElementById('cancel-reset-btn');
        const confirm = document.getElementById('confirm-reset-btn');
        modal?.classList.add('show');
        const close = () => modal?.classList.remove('show');
        cancel?.addEventListener('click', close, { once: true });
        confirm?.addEventListener('click', () => { close(); this._resetGame(); }, { once: true });
    }

    _resetGame() {
        this.timer.stop();
        const db = this.store.get().__db;
        const init = buildInitialState(db, null);
        this.store.set(() => init);
        this.logger.add('Partita resettata.', 'info');
        this._restartTimer();
    }

    /** @param {{kind:'recruit'|'commander'|'titan', id:number, amount:number}} detail */
    _queueHp(detail) {
        const key = `${detail.kind}-${detail.id}`;
        clearTimeout(this.pendingTimers.get(key));
        const cur = this.pending.get(key) || { amount: 0 };
        cur.amount += detail.amount; this.pending.set(key, cur);
        const t = setTimeout(() => { this._applyHp(detail.kind, detail.id, cur.amount); this.pending.delete(key); }, 400);
        this.pendingTimers.set(key, t);
    }

    _applyHp(kind, id, delta) {
        if (!delta) return;
        const s = this.store.get();
        if (kind === 'titan') {
            const t = s.titansData.find(x => x.id === id); if (!t) return;
            const wasAlive = t.hp > 0; const nextHp = Math.max(0, Math.min(t.initialHp, t.hp + delta));
            const isNowDead = nextHp <= 0;
            const rewards = { 'Puro': { m: 1, xp: 1 }, 'Anomalo': { m: 2, xp: 2 }, 'Mutaforma': { m: 5, xp: 3 } };
            const reward = rewards[t.type];

            this.store.set(prev => ({ ...prev, titansData: prev.titansData.map(x => x.id === id ? { ...x, hp: nextHp, isDefeated: isNowDead ? true : x.isDefeated } : x) }));

            if (wasAlive && !isNowDead) { this.logger.add(`${t.name} ha ${delta < 0 ? `subito ${-delta} danni` : `recuperato ${delta} HP`}.`, delta < 0 ? 'damage' : 'info'); }
            if (wasAlive && isNowDead && reward) { this._applyStats(reward.m, reward.xp); this.logger.add(`${t.name} è stato sconfitto! (Morale +${reward.m}, XP +${reward.xp})`, 'mission'); }
            if (!wasAlive && nextHp > 0 && t.isDefeated && reward) { this._applyStats(-reward.m, -reward.xp); this.logger.add(`${t.name} è tornato in vita!`, 'info'); }
            return;
        }

        const key = kind === 'recruit' ? 'recruitsData' : 'commandersData';
        const list = s[key]; const u = list.find(x => x.id === id); if (!u) return;
        const wasAlive = u.hp > 0; const nextHp = Math.max(0, Math.min(u.initialHp, u.hp + delta));
        this.store.set(prev => ({ ...prev, [key]: prev[key].map(x => x.id === id ? { ...x, hp: nextHp } : x) }));

        if (wasAlive && nextHp <= 0) {
            this.logger.add(`${u.name} è stato sconfitto!`, 'death');
            this._applyStats(u.type === 'recruit' ? -3 : -5, 0);
        } else if (!wasAlive && nextHp > 0) {
            this.logger.add(`${u.name} è tornato in vita!`, 'info');
            this._applyStats(u.type === 'recruit' ? 3 : 5, 0);
        } else {
            this.logger.add(`${u.name} ${delta < 0 ? `ha subito ${-delta} danni` : `è stato curato di ${delta} HP`}.`, delta < 0 ? 'damage' : 'info');
        }
    }

    _applyStats(dmMorale, dmXp) {
        if (!dmMorale && !dmXp) return;
        this.store.set(prev => {
            const m = Math.max(prev.__defaults.moraleMin, Math.min(prev.__defaults.moraleMax, prev.morale + (dmMorale || 0)));
            const x = Math.max(prev.__defaults.xpMin, Math.min(prev.__defaults.xpMax, prev.xp + (dmXp || 0)));
            return { ...prev, morale: m, xp: x };
        });
    }
}

/* ===========================
 * Boot
 * =========================== */

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const app = new App();
        await app.start();
    } catch (err) {
        console.error(err);
        alert('Errore in avvio applicazione. Controlla la console.');
    }
});
