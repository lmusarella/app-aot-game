import {
    sameOrAdjCells, findUnitCell, getStack, focusUnitOnField,
    grid, hasHumanInCell, nextStepTowards, gridSize, hexDistance, renderBenches, clearConeGiantData,
    renderGrid, removeUnitEverywhere, humanTargetsWithin2, moveOneUnitBetweenStacks, nearestWallCell, setStack, focusBenchCard, clearHighlights
} from './grid.js';
import { unitAlive, isHuman, pickRandom, getStat, getMusicUrlById, keyRC, rollDiceSpec, d, shuffle, availableTemplates, capModSum, wait } from './utils.js';
import { playSfx, playBg } from './audio.js';
import { unitById, rebuildUnitIndex, GAME_STATE, GIANT_ENGAGEMENT, scheduleSave, DB } from './data.js';
import { openAccordionForRole, showTooltip, renderPickTooltip, hideTooltip, tooltipEl, showVersusOverlay, openDiceOverlay, hideVersusOverlay, showAttackOverlayUnderDice } from './ui.js'
import { log } from './log.js';
import { missionStatsOnUnitDeath, renderMissionUI } from './missions.js';
import { addMorale, addXP } from './footer.js';
import bloodHitClean from './effects/bloodHitClean.js';
import { giantFallQuake } from './effects/screenQuake.js';
import { giantDust } from './effects/giantDust.js';
import swordSlash from './effects/swordSlash.js';
import showDeathScreen from './effects/deathOverlay.js';
import showVictoryScreen from './effects/victoryOverlay.js';
import wallCollapse from './effects/wallCollapse.js';
import showWarningC from './effects/warningOverlayC.js';

export let ATTACK_PICK = null; // { attackerId, targets:[{unit, cell}], _unbind? }
let TARGET_CELLS = new Set();

// valida e ritorna l’umano ingaggiato col gigante, se ancora valido
export function getEngagedHuman(gid) {
    const hid = GIANT_ENGAGEMENT.get(gid);
    if (!hid) return null;
    const h = unitById.get(hid);
    const g = unitById.get(gid);


    if (!unitAlive(h) || !sameOrAdjCells(gid, hid)) {
        GIANT_ENGAGEMENT.delete(gid);
        log(`Il combattimento tra ${g.name} e ${h.name} è finito`, 'warning');
        return null;
    }
    return hid;
}

/**
 * Ritorna l'ID del gigante attualmente ingaggiato con l'umano `humanId`,
 * oppure null se non ce n'è. Pulisce eventuali legami non più validi.
 * @param {string} humanId
 * @returns {string|null}
 */
export function getEngagingGiant(humanId) {
    const hidStr = String(humanId);
    for (const [gid, hid] of GIANT_ENGAGEMENT) {
        if (String(hid) !== hidStr) continue;

        const g = unitById.get(gid);
        const h = unitById.get(hidStr);
        // se uno dei due non è valido / non vivo / non più adiacente → rimuovi binding
        if (!unitAlive(g) || !unitAlive(h) || !sameOrAdjCells(gid, hidStr) || g?.role !== 'enemy') {
            GIANT_ENGAGEMENT.delete(gid);
            log(`Il combattimento tra ${g.name} e ${h.name} è finito`, 'warning');
            continue;
        }

        // primo match valido: ritorna subito
        return gid;
    }
    return null;
}


function setEngagementIfMelee(gid, hid) {
    if (!gid || !hid) return;
    if (!sameOrAdjCells(gid, hid)) return;
    GIANT_ENGAGEMENT.set(gid, hid);
}


export function startAttackPick(attacker, targets, nemesi) {

    targets.forEach(unit => focusUnitOnField(unit.id, true))
    ATTACK_PICK = { attackerId: attacker.id, targets: targets };
    TARGET_CELLS = new Set(targets.map(t => keyRC(t.cell.row, t.cell.col)));

    // Tooltip "appiccicoso": lista bersagli + annulla
    const html = renderPickTooltip(attacker, targets, nemesi);
    showTooltip(html);

    // Listener sul tooltip per click target/annulla
    tooltipEl.onclick = async (e) => {
        const tBtn = e.target.closest('[data-target-id]');
        if (tBtn) {
            endAttackPick();
            await resolveAttack(attacker.id, tBtn.dataset.targetId);
            return;
        }
        if (e.target.closest('[data-cancel]')) {
            endAttackPick();
        }
    };

    // evidenzia griglia
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
}


export function adjustUnitHp(unitId, delta) {
    const u = unitById.get(unitId);
    if (!u) return;
    const max = u.hp ?? 1;
    const cur = (u.currHp ?? max) + delta;
    setUnitHp(unitId, Math.max(0, Math.min(max, cur)));
}

/**
 * Risolve uno scontro fra due unità, gestendo anche UI/SFX/overlay.
 * Conserva la semantica originale ma con struttura più modulare.
 */
async function resolveAttack(attackerId, targetId) {
    const a = unitById.get(attackerId);
    const t = unitById.get(targetId);
    if (!a || !t) return;

    await safePlayBg('./assets/sounds/duel_sound.mp3');
    showVersusOverlay(a, t);

    // Se il target è un muro non faccio aprire il roll dei dadi
    const d20roll = t.role === 'wall' ? d(20) : await rollD20OrAbort();
    if (d20roll == null) return;

    const ctx = buildContext(a, t, d20roll);

    // Caso semplice: NON umano vs gigante → danno flat “vecchio comportamento”
    if (!ctx.flags.isHumanVsGiant) {
        await resolveWallAttack(ctx);
        scheduleSave();
        return;
    }

    // === Umano vs Gigante ===
    const outcome = await resolveHumanVsGiant(ctx);

    // Engagement: set/refresh se adiacenti & vivi & non già impegnati
    if (!ctx.state.engagedHumanId &&
        !ctx.state.engagingGiantId &&
        unitAlive(ctx.units.human) &&
        unitAlive(ctx.units.giant) &&
        sameOrAdjCells(ctx.ids.humanId, ctx.ids.giantId)) {
        setEngagementIfMelee(ctx.ids.giantId, ctx.ids.humanId);
        log(`${ctx.units.human.name} è entrato in combattimento con ${ctx.units.giant.name}`, 'warning');
    }

    // Overlay riepilogo sotto i dadi
    showSummaryOverlay(ctx, outcome);

    // Log sintetico (primi 2 messaggi se presenti)
    for (let i = 0; i < Math.min(2, outcome.summaryLines.length); i++) {
        log(outcome.summaryLines[i], 'info', 3000, true);
    }

    hideVersusOverlay();
    showVersusOverlay(a, t); // come da codice originale

    scheduleSave();
}

/* --------------------------- Helper: IO/Wrapper --------------------------- */

async function safePlayBg(path) {
    try { await playBg(path); } catch { /* noop */ }
}

async function rollD20OrAbort() {
    const dice = openDiceOverlay({ sides: 20, keepOpen: true });
    try {
        return await dice.waitForRoll;
    } catch {
        log('Scontro annullato.', 'warning');
        return null;
    }
}

/* ------------------------------- Build ctx -------------------------------- */

function buildContext(a, t, d20roll) {
    const AisHuman = isHuman(a);
    const TisHuman = isHuman(t);
    const AisGiant = a?.role === 'enemy';
    const TisGiant = t?.role === 'enemy';
    const isHumanVsGiant = (AisHuman && TisGiant) || (TisHuman && AisGiant);

    const effectiveBonus = GAME_STATE.xpMoraleState.effectiveBonus || { all: 0, tec: 0, agi: 0, atk: 0 };
    const d20Total = d20roll + (effectiveBonus.all || 0);

    // Normalizzazione ruoli
    const human = isHuman(a) ? a : t;
    const giant = AisGiant ? a : t;

    // Stat pre-calc (evita ripetere getStat)
    const TEC = getStat(human, 'tec') || 0;
    const AGI = getStat(human, 'agi') || 0;
    const ATK = getStat(human, 'atk') || 0;
    const G_CD = getStat(giant, 'cd') || 0;
    const G_ATK = Math.max(1, getStat(giant, 'atk') || 1);

    const TEC_TOTAL = capModSum(TEC, effectiveBonus.tec);
    const AGI_TOTAL = capModSum(AGI, effectiveBonus.agi);
    const ATK_TOTAL = capModSum(ATK, effectiveBonus.atk);

    const engagingGiantId = getEngagingGiant(human.id); // gigante che distrae l’umano
    const engagedHumanId = getEngagedHuman(giant.id);  // umano impegnato dal gigante

    return {
        roll: { d20roll, d20Total },
        bonus: { effectiveBonus, TEC_TOTAL, AGI_TOTAL, ATK_TOTAL },
        units: { a, t, human, giant },
        ids: { attackerId: a.id, targetId: t.id, humanId: human.id, giantId: giant.id },
        stats: { giantCd: G_CD, giantAtk: G_ATK },
        flags: { AisHuman, TisHuman, AisGiant, TisGiant, isHumanVsGiant },
        state: { engagingGiantId, engagedHumanId }
    };
}

/* -------------------------- Caso semplice (non HvG) ----------------------- */

async function resolveWallAttack(ctx) {
    const { a, t } = ctx.units;

    showWarningC({
        text: `ATTENZIONE`,
        subtext: `${a.name} sta per attaccare le mura`,
        theme: 'red',
        ringAmp: 1.0,
        autoDismissMs: 3000
    });

    await awaitWait(3000);


    const dmg = Math.max(1, Number(getStat(a, 'atk') || 1));
    const tHp = (t.currHp ?? t.hp) - dmg;
    setUnitHp(t.id, tHp);

    openAccordionForRole(t.role);
    focusUnitOnField(t.id);
    focusBenchCard(t.id);

    wallCollapse({
        intensity: 28,
        debrisCount: 180,
        durationMs: 2000,
        emitBand: 'top',
        bandHeight: 0.22
    });

    try {
        playSfx('./assets/sounds/colpo_mura.mp3', { volume: 0.8 });
    } catch { /* noop */ }

    awaitWait(2000);
    hideVersusOverlay();
}

/* ----------------------------- Core HvG logic ----------------------------- */

async function resolveHumanVsGiant(ctx) {
    const { human, giant } = ctx.units;
    const { humanId, giantId } = ctx.ids;
    const { d20roll, d20Total } = ctx.roll;
    const { TEC_TOTAL, AGI_TOTAL, ATK_TOTAL } = ctx.bonus;
    const { giantCd, giantAtk } = ctx.stats;
    const { engagingGiantId, engagedHumanId } = ctx.state;

    const humanHits = (d20Total + TEC_TOTAL) >= giantCd;
    const humanDodges = (d20Total + AGI_TOTAL) >= giantCd;

    const ability = getReadyGiantAbility(giant);

    let humanDamageDealt = 0;
    let humanDamageTaken = 0;

    // HUM → danno solo se non distratto e a contatto
    const humanDistracted = !!(engagingGiantId && engagingGiantId !== giantId);
    const inMelee = sameOrAdjCells(humanId, giantId);

    if (humanHits && !humanDistracted && inMelee) {
        const dmg = Math.max(1, d(4) + ATK_TOTAL);
        humanDamageDealt = dmg;
        setUnitHp(giantId, (giant.currHp ?? giant.hp) - dmg);
        // SFX lama
        try {
            const path = human.sex === 'm'
                ? './assets/sounds/attacco_uomo.mp3'
                : './assets/sounds/attacco_donna.mp3';
            const offset = /* se anche il gigante colpisce lo metto dopo */ 0;
            setTimeout(() => playSfx(path, { volume: 0.8 }), offset);
            swordSlash({
                angle: 'right-down', thickness: 24, glow: 22, length: 1.2,
                splatter: 0.8, centerSafe: true, safeInset: 0.24
            });
        } catch { /* noop */ }
    }

    // GIA → attacca un solo umano; se distratto non attacca
    let giantDistracted = false;
    let cdGiantAbi = null;
    let humanDodgesAbility = null;
    let giantHitsThisTurn = false;

    if (!engagedHumanId || engagedHumanId === humanId) {
        if (ability) {
            cdGiantAbi = ability.cd;
            const dodgeable = (ability.dodgeable !== false);
            humanDodgesAbility = (d20Total + AGI_TOTAL) >= cdGiantAbi;
            const giantHits = dodgeable ? !humanDodgesAbility : true;

            if (giantHits) {
                giantHitsThisTurn = true;
                showWarningC({
                    text: "ABILITA' ATTIVATA",
                    subtext: `${giant.name} usa ${ability.name || 'Abilità'}`,
                    theme: 'orange', ringAmp: 1.0, autoDismissMs: 3500
                });
                try { playSfx(ability.sfx || './assets/sounds/abilita_gigante.mp3', { volume: 0.9 }); } catch { }
                await awaitWait(3500);

                const dmg = computeAbilityDamage(giant, ability);
                humanDamageTaken = dmg;
                setUnitHp(humanId, (human.currHp ?? human.hp) - dmg);

                bloodImpact();
                giantFallQuake({ delayMs: 0, intensity: 28 });
            }

            consumeGiantAbilityCooldown(giant);
        } else {
            // Attacco base
            const giantHits = !humanDodges;
            if (giantHits) {
                giantHitsThisTurn = true;
                humanDamageTaken = giantAtk;
                setUnitHp(humanId, (human.currHp ?? human.hp) - giantAtk);
                bloodImpact();
                try { playSfx('./assets/sounds/attacco_gigante.mp3', { volume: 0.8 }); } catch { }
            }
        }
    } else {
        giantDistracted = true;
    }

    // Costruzione riepilogo
    const summary = buildSummary({
        ctx, ability, humanHits, humanDodges, humanDodgesAbility, cdGiantAbi,
        humanDistracted, giantDistracted, humanDamageDealt, humanDamageTaken
    });

    return {
        ...summary,
        uiTotals: {
            toHit: { d20: d20roll, modLabel: 'TEC', modValue: TEC_TOTAL, total: d20Total + TEC_TOTAL, target: giantCd, success: humanHits },
            toDodge: { d20: d20roll, modLabel: 'AGI', modValue: AGI_TOTAL, total: d20Total + AGI_TOTAL, target: cdGiantAbi || giantCd, success: (humanDodgesAbility ?? humanDodges) }
        }
    };
}

/* ----------------------------- Summary & UI ------------------------------- */

function buildSummary({
    ctx, ability, humanHits, humanDodges, humanDodgesAbility, cdGiantAbi,
    humanDistracted, giantDistracted, humanDamageDealt, humanDamageTaken
}) {
    const { human, giant } = ctx.units;
    const lines = [];

    const humanDidHit = humanDamageDealt > 0;
    const giantDidHit = humanDamageTaken > 0;
    const bothHit = humanDidHit && giantDidHit;
    const neitherHit = !humanDidHit && !giantDidHit;

    if (ability && giantDidHit)
        log(`${giant.name} usa ${ability.name || 'Abilità'}`, 'warning', 3000, true);

    let badgeText = 'Pareggio';
    let badgeClass = 'atk-tie';

    if (bothHit) {
        badgeText = 'Pareggio'; badgeClass = 'atk-tie';
    } else if (neitherHit) {
        try { playSfx('./assets/sounds/schivata.mp3', { volume: 0.8 }); } catch { }
        badgeText = 'Pareggio'; badgeClass = 'atk-tie';
    } else if (humanDidHit) {
        badgeText = 'Successo'; badgeClass = 'atk-win';
    } else {
        badgeText = 'Fallito'; badgeClass = 'atk-lose';
    }

    if (humanDidHit) {
        lines.push(`${human.name} infligge ${humanDamageDealt} danni.`);
    } else {
        if (humanDistracted) {
            const x = unitById.get(ctx.state.engagingGiantId);
            lines.push(`${human.name} è attualmente distratto da ${x?.name || 'un gigante'}.`);
        } else {
            if (sameOrAdjCells(ctx.ids.humanId, ctx.ids.giantId)) lines.push(`${human.name} manca il bersaglio.`);
            else lines.push(`${ctx.units.giant.name} è troppo lontanto.`);
        }
    }

    if (giantDidHit) {
        lines.push(`${giant.name} infligge ${humanDamageTaken} danni.`);
    } else {
        if (giantDistracted) {
            const engagedUnit = unitById.get(ctx.state.engagedHumanId);
            lines.push(`${giant.name} è attualmente distratto da ${engagedUnit?.name || 'un umano'}.`);
        } else {
            if (ability) lines.push(`${human.name} schiva l'abilità di ${giant.name}.`);
            else lines.push(`${human.name} schiva l'attacco di ${giant.name}.`);
        }
    }

    return { badgeText, badgeClass, summaryLines: lines, ability };
}

function showSummaryOverlay(ctx, outcome) {
    const { badgeText, badgeClass, summaryLines } = outcome;
    const { uiTotals } = outcome;
    const { a, t } = ctx.units;

    showAttackOverlayUnderDice({
        badge: badgeText,
        badgeClass,
        hit: uiTotals.toHit,
        dodge: uiTotals.toDodge,
        lines: summaryLines,
        gap: 12,
        autoHideMs: 0
    });

    // Manteniamo anche questi focus come nel codice originale “semplice”
    openAccordionForRole(t.role);
    focusUnitOnField(t.id);
    focusBenchCard(t.id);
}

/* ------------------------------- Utilities -------------------------------- */

function bloodImpact() {
    bloodHitClean({
        side: 'right', intensity: 1.0, density: 1.2,
        safeInset: 0.26, duration: 120, fadeAfter: 1400, fadeMs: 650
    });
}

// wrapper awaitabile per compat con “wait(2000)” già nel tuo codice
function awaitWait(ms) { try { return wait(ms); } catch { return Promise.resolve(); } }

/* =======================
   API: set HP a runtime
   ======================= */
export async function setUnitHp(unitId, newHp) {
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

export async function handleWallDeath(wallUnit) {
    // crollo dall’alto, molti detriti
    wallCollapse({
        intensity: 28,
        debrisCount: 180,
        durationMs: 2000,
        emitBand: 'top',
        bandHeight: 0.22
    });
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

    const death = showDeathScreen({
        text: `${wallUnit.name} è stato distrutto`,
        //subtext: 'Premi un tasto per continuare',
        effect: 'chroma',       // 'none' | 'glitch' | 'chroma'
        skullOpacity: 0.13,
        skullScale: 1.0,
        blur: 2,
        allowDismiss: false,   // click/tasto per chiudere
        autoDismissMs: 3000,  // chiudi dopo 3s (opzionale)
    });

    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
    renderBenches();
    log(`${wallUnit.name} è stato distrutto!`, 'error');
    scheduleSave();
    await playSfx('./assets/sounds/muro_distrutto.mp3');

    setTimeout(() => {
        addMorale(DB.SETTINGS.xpMoralDefault.unitsDeathMoral[wallUnit.role]);
    }, 3000)


}

export async function handleGiantDeath(unit) {
    // 1) rimuovi dal campo
    removeUnitEverywhere(unit.id);

    // 2) rimuovi dalla panchina attiva (roster giganti)
    const i = GAME_STATE.giantsRoster.findIndex(g => g.id === unit.id);
    if (i >= 0) GAME_STATE.giantsRoster.splice(i, 1);

    clearConeGiantData();

    rebuildUnitIndex();
    renderBenches();
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);

    log(`${unit.name} è morto.`, 'success', 3000, true);

    scheduleSave();
    
    await playSfx('./assets/sounds/morte_gigante.mp3');

    showVictoryScreen({
        text: 'VITTORIA',
        subtext: `${unit.name} è stato abbattuto!`,
        confetti: false,
        autoDismissMs: 3000  // opzionale
    });

    setTimeout(() => {
        giantFallQuake({ delayMs: 0, intensity: 28 }); // target: document.documentElement
        giantDust({
            delayMs: 300,   // parte al picco dell'impatto
            plumeCount: 140,                   // più particelle
            durationMs: 2200,                  // durata totale
            ringLife: 1000,                    // ring al suolo un filo più lungo
            wind: 0.08,                        // un po' di vento laterale
            tone: '#a78b6d'                    // sabbia/beige
        });
    }, 2200)

    setTimeout(() => {
        // 3) NON rimettere nel pool: il gigante è “consumato”
        // (quindi niente push in giantsPool)
        addMorale(DB.SETTINGS.xpMoralDefault.unitsDeathMoral[unit.type]);
        addXP(DB.SETTINGS.xpMoralDefault.giantsDeathXP[unit.type]);
    }, 3000)

    GAME_STATE.missionState.kills[unit.type] = GAME_STATE.missionState.kills[unit.type] + 1;
    // 4) UI + log
    renderMissionUI();
    missionStatsOnUnitDeath(unit);
    getEngagedHuman(unit.id);
    try {
        const ev = new CustomEvent('unitDeath', { unit });
        document.dispatchEvent(ev);
    } catch { }
}

export async function handleAllyDeath(unit) {
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
    await playSfx('./assets/sounds/morte_umano.mp3');
    await playSfx('./assets/sounds/reclute/morte_recluta_comandante.mp3');
    const death = showDeathScreen({
        text: `${unit.name} è ${unit.sex === 'm' ? 'morto' : 'morta'}`,
        //subtext: 'Premi un tasto per continuare',
        effect: 'chroma',       // 'none' | 'glitch' | 'chroma'
        skullOpacity: 0.13,
        skullScale: 1.0,
        blur: 2,
        allowDismiss: false,   // click/tasto per chiudere
        autoDismissMs: 3000,  // chiudi dopo 3s (opzionale)
    });
    setTimeout(() => {
        addMorale(DB.SETTINGS.xpMoralDefault.unitsDeathMoral[unit.role]);
    }, 3000)

    missionStatsOnUnitDeath(unit);
    getEngagingGiant(unit.id);
    try {
        const ev = new CustomEvent('unitDeath', { unit });
        document.dispatchEvent(ev);
    } catch { }

    scheduleSave();
}

export function endAttackPick() {
    ATTACK_PICK = null;
    TARGET_CELLS.clear();
    hideTooltip();
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
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

// Calcolo danno abilità: (XdY) + bonus + (eventuale atk del gigante)
function computeAbilityDamage(giant, ab) {
    const base = rollDiceSpec(ab?.dice || '1d6');
    const bonus = Number(ab?.bonus || 0);
    const addAtk = !!ab?.addAtk;
    const atk = Math.max(0, getStat(giant, 'atk'));
    return Math.max(1, base + bonus + (addAtk ? atk : 0));
}

// === COOLDOWN A FINE TURNO ================================================
// Reset di tutti i modificatori "mission" su ogni unità (reclute, comandanti, giganti)
export function resetMissionEffectsAllUnits({ includeRoles = ['recruit', 'commander', 'enemy'], skipWalls = true } = {}) {
    const touched = [];
    const iter = (unitById && typeof unitById.values === 'function')
        ? unitById.values()
        : (Array.isArray(GAME_STATE?.alliesRoster) ? [...GAME_STATE.alliesRoster, ...GAME_STATE.giantsRoster] : []);

    for (const u of iter) {
        if (!u) continue;
        if (skipWalls && u.role === 'wall') continue;
        if (!includeRoles.includes(u.role)) continue;

        const effs = Array.isArray(u._effects) ? u._effects : [];
        if (!effs.length) continue;

        const before = effs.length;

        // Considera "mission" sia per type che per legacy rounds === Infinity
        u._effects = effs.filter(e => {
            const isMission = (e?.type === 'mission') || (e?.rounds === Infinity);
            return !isMission;
        });

        if (u._effects.length !== before) touched.push(u.id);
    }

    try { scheduleSave?.(); } catch { }
    try { log?.(`Reset modificatori di missione per ${touched.length} unità.`, 'info'); } catch { }

    // Notifica opzionale (se vuoi rinfrescare UI che ascolta questo evento)
    try {
        const ev = new CustomEvent('unitEffectsChanged', { detail: { unitIds: touched } });
        document.dispatchEvent(ev);
    } catch { }

    return touched;
}

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
export function advanceAllCooldowns(
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
// helper: tra i candidati ritorna quello con meno HP; a parità usa distanza, poi random
function pickLowestHpTarget(cands, fromR, fromC) {
    if (!cands.length) return null;
    // arr: { unit, row, col }
    const ranked = cands.map(t => ({
        ...t,
        hp: (t.unit.currHp ?? t.unit.hp ?? 0),
        d: hexDistance(fromR, fromC, t.row, t.col)
    }));
    ranked.sort((a, b) => a.hp - b.hp || a.d - b.d);
    // tra i “pari” (stesso hp e stessa distanza) spezza con random
    const top = ranked.filter(x => x.hp === ranked[0].hp && x.d === ranked[0].d);
    return pickRandom(top);
}

export function stepGiant(giantId) {
    const g = unitById.get(giantId);
    if (!g || g.role !== 'enemy') return false;

    // cella attuale del gigante
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

    // se nella stessa cella ci sono già umani non spostarti
    if (hasHumanInCell(r, c)) return false;

    // ➊ PRIORITÀ: bersaglio ingaggiato (anche fuori vista)
    const engagedHumanId = getEngagedHuman(String(giantId)); // tua funzione esistente
    if (engagedHumanId) {
        const tgtCell = findUnitCell(engagedHumanId);
        if (tgtCell) {
            const d = hexDistance(r, c, tgtCell.row, tgtCell.col);
            if (d > 1) {
                const step = nextStepTowards(r, c, tgtCell.row, tgtCell.col, {});
                if (step) {
                    moveOneUnitBetweenStacks({ row: r, col: c }, { row: step.row, col: step.col }, giantId);
                    return true;
                }
                return false; // bloccato
            } else if (d === 1) {
                // prova ad entrare nella cella del bersaglio
                moveOneUnitBetweenStacks({ row: r, col: c }, { row: tgtCell.row, col: tgtCell.col }, giantId);
                return true;
            }
            // d === 0 → già nella stessa cella: niente movimento
            return false;
        }
        // se l’ingaggio è sporco (niente cella), lo lascerà la getEngagedHuman
    }

    // ➋ Nessun ingaggio → scegli umano con meno HP tra quelli “visti” entro 2
    const humansInSight = humanTargetsWithin2(r, c); // [{unit,row,col}, ...]
    if (humansInSight.length) {
        const target = pickLowestHpTarget(humansInSight, r, c);
        const d = hexDistance(r, c, target.row, target.col);
        if (d > 1) {
            const step = nextStepTowards(r, c, target.row, target.col, {});
            if (step) {
                moveOneUnitBetweenStacks({ row: r, col: c }, { row: step.row, col: step.col }, giantId);
                return true;
            }
            return false; // bloccato
        } else if (d === 1) {
            moveOneUnitBetweenStacks({ row: r, col: c }, { row: target.row, col: target.col }, giantId);
            return true;
        }
        return false; // già insieme
    }

    // ➌ Nessun umano in vista → muoviti verso le mura
    const wall = nearestWallCell(r, c);
    if (!wall) return false;

    const step = nextStepTowards(r, c, wall.row, wall.col, {});
    if (step) {
        moveOneUnitBetweenStacks({ row: r, col: c }, { row: step.row, col: step.col }, giantId);
        return true;
    }
    return false; // bloccato
}

export function giantsPhaseMove() {
    const giants = [...unitById.values()].filter(u => u.role === 'enemy');

    if (giants.length) {
        log('I giganti iniziano a muoversi...', 'warning', 3000, true);
        showWarningC({
            text: 'ATTENZIONE',
            subtext: 'I giganti iniziano a muoversi...',
            theme: 'red',
            ringAmp: 1.0,
            autoDismissMs: 2500
        });
        playSfx('./assets/sounds/movimento-gigianti-2.mp3', { volume: 1, loop: false });
        setTimeout(() => {
            for (const g of giants) {
                // per ogni esagono di movimento il gigante fa tot step.
                const movimento = getStat(g, 'mov');
                if (movimento > 0) {
                    for (let i = 0; i < movimento; i++) {
                        // se stepGiant ritorna false, interrompi i passi residui per quel gigante
                        const ok = stepGiant(g.id);
                        if (ok === false) break;
                    }
                }
            }

            clearHighlights();
            renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
        }, 2500)
    } else {
        log('Nessun gigante sulla griglia', 'warning');
    }

}

// Iteratore robusto: passa su tutte le unità utili (mappa globale o roster)
function* iterUnitsForEffects() {
    if (unitById && typeof unitById.values === 'function') {
        for (const u of unitById.values()) yield u;
    } else {
        const allies = (GAME_STATE?.alliesRoster || []);
        const giants = (GAME_STATE?.giantsRoster || []);
        for (const u of [...allies, ...giants]) yield u;
    }
}

/** Avanza di 1 round i modificatori "a durata" su ogni unità.
 *  Usa `e.rounds`: numerico => decrementa; Infinity => persiste.
 */
export function tickUnitModsOnNewRound() {
    for (const u of iterUnitsForEffects()) {
        const arr = Array.isArray(u._effects) ? u._effects : [];
        if (!arr.length) continue;

        // decrementa solo quelli con durata finita
        for (const ef of arr) {
            if (Number.isFinite(ef.rounds) && ef.rounds > 0) ef.rounds--;
        }

        // rimuovi scaduti (<= 0). Lascia Infinity intatto
        u._effects = arr.filter(ef => !Number.isFinite(ef.rounds) || ef.rounds > 0);
    }
    scheduleSave();
}
function getSpawnType(roll, spawnRate) {
    for (const [tipo, range] of Object.entries(spawnRate)) {
        if (roll >= range.min && roll <= range.max) {
            return tipo;
        }
    }
    return null; // nessuna corrispondenza
}

export async function spawnGiant(type = null, flagNoSound = false) {

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

export function pickRandomTeam({ commanders = 1, recruits = 3 } = {}) {
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

export function seedWallRows() {
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

