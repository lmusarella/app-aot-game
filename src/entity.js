import {
    sameOrAdjCells, findUnitCell, getStack, focusUnitOnField,
    grid, hasHumanInCell, nextStepTowards, gridSize, hexDistance, renderBenches,
    renderGrid, removeUnitEverywhere, humanTargetsWithin2, moveOneUnitBetweenStacks, nearestWallCell, setStack, focusBenchCard
} from './grid.js';
import { unitAlive, isHuman, pickRandom, getStat, getMusicUrlById, keyRC, rollDiceSpec, d, shuffle, availableTemplates, capModSum } from './utils.js';
import { playSfx, playBg } from './audio.js';
import { unitById, rebuildUnitIndex, GAME_STATE, GIANT_ENGAGEMENT, scheduleSave, DB } from './data.js';
import { openAccordionForRole, showTooltip, renderPickTooltip, hideTooltip, tooltipEl, showVersusOverlay } from './ui.js'
import { log } from './log.js';
import { missionStatsOnUnitDeath } from './missions.js';
import { addMorale, addXP } from './footer.js';

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
        console.log('le unità sono ancora vicine', sameOrAdjCells(gid, hidStr))
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

    const already = GIANT_ENGAGEMENT.get(gid);
    GIANT_ENGAGEMENT.set(gid, hid);

    // Mostra overlay ENGAGE solo la prima volta o se cambia bersaglio
    if (already !== hid) {
        const g = unitById.get(gid);
        const h = unitById.get(hid);
        if (g && h) showVersusOverlay(g, h, { mode: 'engage', title: 'Ingaggio', duration: 1400, throttleMs: 800 });
    }

}


export function startAttackPick(attacker, targets) {

    targets.forEach(unit => focusUnitOnField(unit.id, true))
    ATTACK_PICK = { attackerId: attacker.id, targets: targets };
    TARGET_CELLS = new Set(targets.map(t => keyRC(t.cell.row, t.cell.col)));

    // Tooltip "appiccicoso": lista bersagli + annulla
    const html = renderPickTooltip(attacker, targets);
    showTooltip(html);

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


export function adjustUnitHp(unitId, delta) {
    const u = unitById.get(unitId);
    if (!u) return;
    const max = u.hp ?? 1;
    const cur = (u.currHp ?? max) + delta;
    setUnitHp(unitId, Math.max(0, Math.min(max, cur)));
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
        setUnitHp(targetId, (t.currHp ?? t.hp) - dmg);
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

    // Subito dopo aver determinato 'human' e 'giant':
    try { showVersusOverlay(a, t, { mode: 'attack', duration: 1600 }); } catch { };
    // Letture robuste
 
    const tecMod = getStat(human, 'tec');
    const agiMod = getStat(human, 'agi');
    const forMod = getStat(human, 'atk');

    const cdGiant = getStat(giant, 'cd');
    const giantAtk = Math.max(1, getStat(giant, 'atk'));

    const effectiveBonus = GAME_STATE.xpMoraleState.effectiveBonus;

    const TEC_TOTAL = capModSum(tecMod, effectiveBonus.tec);
    const AGI_TOTAL = capModSum(agiMod, effectiveBonus.agi);
    const ATK_TOTAL = capModSum(forMod, effectiveBonus.atk);

    // Tiro unico
    const d20 = d(20) + effectiveBonus.all;


    // Umano → TEC vs CD gigante (per colpire)
    const humanHits = (d20 + TEC_TOTAL) >= cdGiant;

    // Umano → AGI vs CD gigante (per schivare attacco/abilità del gigante)
    const humanDodges = (d20 + AGI_TOTAL) >= cdGiant;

    // Abilità gigante pronta?
    const ability = getReadyGiantAbility(giant);

    const totalTec = tecMod + effectiveBonus.tec;
    // Log
    const lines = [];
    lines.push(
        `d20=${d20} | TEC ${totalTec >= 0 ? '+' : ''}${totalTec} vs CD ${cdGiant} → ${humanHits && sameOrAdjCells(human.id, giant.id) ? 'COLPITO' : !sameOrAdjCells(human.id, giant.id) ? 'TROPPO LONTANO' : 'MANCATO'}`
    );

    let humanDamageDealt = 0;
    let humanDamageTaken = 0;

    const endagedGiant = getEngagingGiant(human.id);

    // Danno umano (se colpisce): d4 + FOR (min 1)
    if (humanHits && (!endagedGiant || endagedGiant === giant.id) && sameOrAdjCells(human.id, giant.id)) {
        const humanDmgRoll = Math.max(1, d(4) + ATK_TOTAL);
        humanDamageDealt = humanDmgRoll;
        const gCurr = (giant.currHp ?? giant.hp);
        setUnitHp(giantId, gCurr - humanDmgRoll);
        lines.push(`${human.name} infligge ${humanDmgRoll} danni a ${giant.name}.`);
    }

    if (endagedGiant && endagedGiant !== giant.id) {
        const x = unitById.get(endagedGiant);
        lines.push(`Attualmente ${human.name} è distratto/a da ${x.name}`);
    }

    const engaged = getEngagedHuman(giant.id);

    //il gigante attacca solo un umano alla volta
    if (!engaged || engaged === human.id) {
        // Azione del gigante: abilità se pronta, altrimenti attacco base
        if (ability) {
            const cdGiantAbi = ability.cd;
            // Se abilità è schivabile → l'esito usa la stessa logica della schivata
            const humanDodgesAbility = (d20 + AGI_TOTAL) >= cdGiantAbi;
            const dodgeable = (ability.dodgeable !== false); // default = true
            const giantHits = dodgeable ? !humanDodgesAbility : true;

            lines.push(
                `Schivata abilità: d20=${d20} + AGI ${AGI_TOTAL >= 0 ? '+' : ''}${AGI_TOTAL} vs CD ABI ${cdGiantAbi} → ` +
                (giantHits ? 'COLPITO' : 'SCHIVATA')
            );

            if (giantHits) {
                const dmg = computeAbilityDamage(giant, ability);
                humanDamageTaken = dmg;
                const hCurr = (human.currHp ?? human.hp);
                setUnitHp(humanId, hCurr - dmg);
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
            lines.push(
                `Schivata: d20=${d20} + AGI ${AGI_TOTAL >= 0 ? '+' : ''}${AGI_TOTAL} vs CD ${cdGiant} → ` +
                (giantHits ? 'COLPITO dal gigante' : 'SCHIVATA')
            );

            if (giantHits) {
                humanDamageTaken = giantAtk;
                const hCurr = (human.currHp ?? human.hp);
                setUnitHp(humanId, hCurr - giantAtk);
                lines.push(`${giant.name} infligge ${giantAtk} danni a ${human.name}.`);
                try { playSfx('./assets/sounds/attacco_gigante.mp3', { volume: 0.8 }); } catch { }
            }
        }
    } else {
        const engagedUnit = unitById.get(engaged);
        if (engagedUnit) lines.push(`${giant.name} è distratto, perchè in combattimento con ${engagedUnit.name}`)
    }

    // Log compatto
    log(`${human.name} vs ${giant.name}\n` + lines.join('\n'), 'info', 6000);

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
    if (!engaged && !endagedGiant && unitAlive(human) && unitAlive(giant) && sameOrAdjCells(human.id, giant.id)) {
        setEngagementIfMelee(giant.id, human.id);
        log(`${human.name} è entrato in combattimento con ${giant.name}`, 'warning');
    }

    scheduleSave();
}

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
        missionStatsOnUnitDeath(u);
        return; // già refreshato tutto
    }
    // Morte giganti
    if (u.role === 'enemy' && clamped === 0) {
        await handleGiantDeath(u);
        missionStatsOnUnitDeath(u);
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

export async function handleGiantDeath(unit) {
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

    addMorale(DB.SETTINGS.xpMoralDefault.unitsDeathMoral[unit.role]);
    rebuildUnitIndex();
    renderBenches();
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
    log(`${unit.name} è morto/a.`, 'error');
    await playSfx('./assets/sounds/morte_umano.mp3');
    await playSfx('./assets/sounds/reclute/morte_recluta_comandante.mp3');

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

    if (giants.length) log('I giganti iniziano a muoversi...', 'warning');
    if (!giants.length) log('Nessun gigante sulla griglia', 'warning');

    for (const g of giants) {
        // per ogni esagono di movimento il gigante fa tot step.
        const movimento = getStat(g, 'mov');
        if (movimento > 0) {
            for (let i = 0; i < movimento; i++) {
                // se stepGiant ritorna false, interrompi i passi residui per quel gigante
                const ok = stepGiant(g.id);
                console.log('step ok', ok);
                if (ok === false) break;
            }
        }
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

