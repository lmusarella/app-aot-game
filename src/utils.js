import { GAME_STATE, DB } from "./data.js";


export const COLOR_VAR = {
    red: 'var(--rosso)', yellow: 'var(--oro)', silver: 'var(--argento)', verde: 'var(--verde)',
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
    const m = Math.max(0, Math.min(100, Number(moralePct) || 0));
    return DB.SETTINGS.malusTable.find(r => m >= r.range.min && m <= r.range.max) || null;
}

