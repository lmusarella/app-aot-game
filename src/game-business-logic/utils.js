import { GAME_STATE, DB } from "../core/data.js";


export const COLOR_VAR = {
    red: 'var(--rosso)', yellow: 'var(--oro)', silver: 'var(--argento)', verde: 'var(--verde)', cone: 'var(--cone)',
    gray: 'var(--grigio)', blu: 'var(--blu)', argento: 'var(--argento)', viola: 'var(--viola)'
};
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const fmtClock = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export function getUnitBonus(u, key) {
    const effs = Array.isArray(u?._effects) ? u._effects : [];
    return effs.reduce((sum, e) => sum + (e?.stat === key ? Number(e.delta || 0) : 0), 0);
}
export function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function getCommanderPool() {
    return GAME_STATE.alliesPool
        .filter(unit => unit.role === 'commander')
        .map(unit => unit.id);
}
export function getRecruitPool() {
    return GAME_STATE.alliesPool
        .filter(unit => unit.role === 'recruit')
        .map(unit => unit.id);
}
export function getUnitData() {
    return GAME_STATE.alliesPool.map(unit => ({
        id: unit.id,
        name: unit.name,
        avatar: unit.img,
        type: unit.role
    }));
}
export function pickOne(arr) {
    const a = arr || [];
    if (!a.length) return null;
    const idx = Math.floor(Math.random() * a.length);
    return a[idx];
}
export function pickManyUnique(arr, count) {
    const shuffled = shuffle([...(arr || [])]);
    return shuffled.slice(0, count);
}
export const countAlive = (role) => GAME_STATE.alliesPool.filter(u => u.role === role && !u.dead).length;
export const totalByRole = (role) => GAME_STATE.alliesPool.filter(u => u.role === role).length;
export const signClass = n => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero');
export const fmtSigned = n => (n > 0 ? `+${n}` : `${n}`);
export const isClone = (u) => !u.template && !!u.baseId;
export function getStat(u, key) {
    if (!u) return 0;
    const base = Number(u[key] ?? 0);
    const effs = Array.isArray(u._effects) ? u._effects : [];
    const bonus = effs.reduce((sum, e) => {
        if (e?.stat === key) return sum + Number(e.delta || 0);
        return sum;
    }, 0);
    return base + bonus;
}
export const keyRC = (r, c) => `${r},${c}`;
export function unitAlive(u) { return !!u && (u.currHp ?? u.hp) > 0; }
export function isHuman(u) { return u && u.role !== 'enemy' && u.role !== 'wall'; }
export function getMusicUrlById(unitId) {
    return DB?.SETTINGS?.audio?.unitVoices?.[unitId];
}

function hpColor(pct) {
    const p = Math.max(0, Math.min(1, pct));
    const hue = Math.round(p * 120);
    const sat = Math.round(40 + 45 * p);
    const lig = Math.round(35 + 15 * p);
    return `hsl(${hue} ${sat}% ${lig}%)`;
}

export function applyHpBar(fillEl, unit) {
    const max = unit.hp ?? 1;
    const cur = Math.max(0, Math.min(max, unit.currHp ?? max));
    const pct = cur / max;
    fillEl.style.width = (pct * 100) + "%";
    fillEl.style.backgroundColor = hpColor(pct);
    fillEl.style.filter = `saturate(${0.5 + 0.5 * pct})`;
    fillEl.parentElement.title = `${cur}/${max} HP`;
}

export function d(n) { return Math.floor(Math.random() * n) + 1; }

export function rollDiceSpec(spec) {
    const m = /^(\d+)d(\d+)$/i.exec(spec || '1d6');
    if (!m) return d(6);
    const cnt = Number(m[1]), sides = Number(m[2]);
    let sum = 0; for (let i = 0; i < cnt; i++) sum += d(sides);
    return sum;
}

export function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
export function capitalizeFirstLetter(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function availableTemplates(role) {
    return GAME_STATE.alliesPool.filter(u => u.role === role); // nel pool = non in panchina
}
export function displayHpForTemplate(base) {
    return base.currHp ?? base.hp;
}
const DEFAULT_XP_TABLE = [0];
const getXpTable = () => {
    const xpTable = DB?.SETTINGS?.xpTable;
    return Array.isArray(xpTable) && xpTable.length ? xpTable : DEFAULT_XP_TABLE;
};
// Se superi la tabella, continua con una formula (incremento crescente)
function xpThreshold(level) {
    const xpTable = getXpTable();
    // XP cumulativo richiesto per INIZIARE quel livello
    if (level <= xpTable.length) return xpTable[level - 1] ?? 0;
    // oltre la tabella: aumento progressivo
    let lastLevel = xpTable.length;
    let xp = xpTable[lastLevel - 1] ?? 0;
    for (let L = lastLevel + 1; L <= level; L++) {
        // incremento che cresce con il livello (regolabile)
        const inc = 300 + (L - 1) * 50;
        xp += inc;
    }
    return xp;
}

export function levelFromXP(xp) {
    let L = 1;
    while (xp >= xpThreshold(L + 1)) L++;
    return Math.max(1, L);
}

export function levelProgressPercent(xp, level) {
    const base = xpThreshold(level);
    const next = xpThreshold(level + 1);
    const range = Math.max(1, next - base);
    const pct = ((xp - base) / range) * 100;
    // clamp 0..99.999 per non arrivare mai "visivamente" a 100
    return Math.max(0, Math.min(99.999, pct));
}
export function getMalusRow(moralePct) {
    const m = Math.max(0, Math.min(10, Number(moralePct) || 0));
    return DB.SETTINGS.malusTable.find(r => m >= r.range.min && m <= r.range.max) || null;
}

// --- CAP MODIFICATORI GLOBALI ----------------------------------------------
const getModCap = () => DB?.SETTINGS?.balance?.modCap ?? 5;

/** Somma i modificatori (non le stat base) e li limita a [-MOD_CAP, +MOD_CAP]. */
export function capModSum(...mods) {
  const sum = mods.reduce((a, b) => a + (Number(b) || 0), 0);
  const modCap = getModCap();
  return Math.max(-modCap, Math.min(modCap, sum));
}
// Cap per le STAT (non per i tiri): default 5 ma leggibile da config
const getStatCapMax = () => DB?.SETTINGS?.balance?.modCap ?? 5;
const getStatCapMin = () => DB?.SETTINGS?.balance?.modCap ?? -5; 
// Se vuoi anche un pavimento tipo -5, metti -5 al posto di -Infinity.

/**
 * Ritorna il delta MOSTRABILE, clampato in modo che:
 *   base + deltaVis <= STAT_CAP_MAX
 *   base + deltaVis >= STAT_CAP_MIN
 * Quindi visualizzi solo la parte di modificatore che non sfora il cap.
 */
export function cappedDelta(base, rawDelta) {
  const baseNum = Number(base ?? 0);
  const d = Number(rawDelta ?? 0);
  const statCapMax = getStatCapMax();
  const statCapMin = getStatCapMin();
  // totale “reale” con cap
  const totCapped = Math.max(statCapMin, Math.min(statCapMax, baseNum + d));
  // delta effettivo che vale davvero (quello da mostrare)
  return totCapped - baseNum;
}
// utils/time.js
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
