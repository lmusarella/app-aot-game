import { hideTooltip, openAccordionForRole, getUnitTooltipHTML, showTooltip, addLongPress, confirmDialog } from '../../ui-components/ui.js';
import { playSfx } from '../audio/audio.js';
import { isClone, getStat, applyHpBar, getMusicUrlById, COLOR_VAR, keyRC } from '../../utils.js';
import { unitById, rebuildUnitIndex, DB, GAME_STATE, UNIT_SELECTED, GIANT_ENGAGEMENT } from '../../core/data.js';
import { scheduleSave } from '../../game-business-logic/game-sync.js';
import { log } from '../../core/log.js';
import { adjustUnitHp } from '../../game-business-logic/entity/entity.js';
import { enablePointerDrag } from './drag.js';
import { getStack, setStack, removeUnitEverywhere, moveOneUnitBetweenStacks, hasWallInCell, bringToFront, setStackVisuals } from './stacks.js';
import { findUnitCell } from './queries.js';
import { handleUnitLongPress } from './targeting.js';
import { clearConeGiantData, clearHighlights, isConeCell, setGiantConeCells, setGiantNemesiTarget, setCone, pickGiantFacing, hexCone } from './cone.js';

export { HEX_CFG, gridSize, inBoundsRC, hexNeighbors, hexWithinRadius, hexDistance } from './hex.js';
export { clearConeGiantData, clearHighlights } from './cone.js';
export { getStack, setStack, removeUnitEverywhere, moveOneUnitBetweenStacks } from './stacks.js';
export { findUnitCell, nearestWallCell } from './queries.js';
export { nextStepTowards } from './pathing.js';
export { humanTargetsWithin2, hasHumanInCell, sameOrAdjCells } from './targeting.js';

const baseHpOverride = new Map();


export const grid = document.getElementById("hex-grid");

const alliesEl = document.getElementById("bench-allies");
const enemiesEl = document.getElementById("bench-enemies");
const wallsEl = document.getElementById("bench-walls");
const countAlliesEl = document.getElementById("count-allies");
const countEnemiesEl = document.getElementById("count-enemies");
const countWallsEl = document.getElementById("count-walls");
export function renderBenches() {
    renderBenchSection(alliesEl, GAME_STATE.alliesRoster);
    renderBenchSection(enemiesEl, GAME_STATE.giantsRoster);
    renderBenchSection(wallsEl, GAME_STATE.walls, true);

    countAlliesEl.textContent = `${GAME_STATE.alliesRoster.length} unità`;
    countEnemiesEl.textContent = `${GAME_STATE.giantsRoster.length} unità`;
    countWallsEl.textContent = `${GAME_STATE.walls.length} mura`;
}
function benchClickFocusAndTop(u) {
    const unitId = u.id;
    const cell = findUnitCell(unitId);

    if (cell) {
        // È in campo: porta davanti e seleziona come già fai
        bringToFront(cell, unitId);
        UNIT_SELECTED.selectedUnitId = unitId;
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
        UNIT_SELECTED.selectedUnitId = unitId;
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
// Considera roster e/o unità sul campo
function isOnField(unitId) {
    return GAME_STATE.spawns?.some(s => Array.isArray(s.unitIds) ? s.unitIds.includes(unitId) : s.unitId === unitId) || false;
}
function renderBenchSection(container, units, readOnly = false) {
    container.textContent = "";
    units.forEach(u => {
        const card = document.createElement("div");
        card.className = "unit-card";

        card.dataset.role = u.role;
        if (isOnField(u.id)) card.classList.add("is-fielded");

        card.dataset.unitId = u.id;

        const avatar = document.createElement("div");
        avatar.className = "unit-avatar";

        // Colore per bordo card/avatar (riuso palette esistente)
        const colVar = COLOR_VAR[u.color] || '#444';
        card.style.setProperty('--ring', colVar);
        card.style.setProperty('--sel', colVar);
        // Stato selezione sulle card della panchina
        if (u.id === UNIT_SELECTED.selectedUnitId) {
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


        // 👇 NUOVO: riga con nickname giocatore (solo per alleati)
        if (u.owner_nickname && (u.role === "recruit" || u.role === "commander")) {
            const owner = document.createElement("div");
            owner.className = "unit-owner";
            owner.textContent = `Giocatore: ${u.owner_nickname}`;
            info.append(name, sub, owner);
        } else {
            info.append(name, sub);
        }

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
            clearHighlights();
        });
        hpPlus.addEventListener("click", (e) => {
           
            e.stopPropagation();
            if (isWall && isDestroyed) return;
            adjustUnitHp(u.id, e.shiftKey ? +5 : +1);
            hpRight.textContent = `${u.currHp}/${u.hp}`;
            applyHpBar(hpFill, u);
            hideTooltip();
            clearHighlights();
        });

        // se è muro distrutto, disattiva i controlli HP
        if (isDestroyed) {
            hpMinus.disabled = true;
            hpPlus.disabled = true;
            hpMinus.classList.add('is-disabled');
            hpPlus.classList.add('is-disabled');
        }

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

        addLongPress(card, {
            onClick: () => {
                benchClickFocusAndTop(u);
                const html = getUnitTooltipHTML(u);
                showTooltip(html);
                card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 450);
                if (u.role === 'enemy') showGiantCone(u.id);
            },
            onLongPress: () => {
                hideTooltip();
                clearHighlights();
                if (u.role === 'enemy') showGiantCone(u.id);
            }
        });


        if (!readOnly) {
            // disattiva drag H5 per evitare conflitti su touch
            card.draggable = false;
            enablePointerDrag(card, {
                makePayload: () => ({ type: 'from-bench', unitId: u.id }),
                onDrop: (hexEl, payload) => {
                    const row = +hexEl.dataset.row, col = +hexEl.dataset.col;
                    handleDrop(payload, { row, col });
                    clearHighlights();
                    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
                    renderBenches();
                    hideTooltip();
                }
            });
        }

        /* monta riga: - [bar] HP + */
        hpRow.append(hpMinus, hpWrap, hpPlus, hpRight);

        /* append nella card: avatar, info, actions (se ti servono), hpRow */
        card.append(avatar, info, actions, hpRow);

        container.appendChild(card);
    });
}

export function renderGrid(container, rows, cols, occupancy = []) {
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

function createHexagon(row, col, unitIds = []) {
    const hex = document.createElement("div");
    hex.className = "hexagon";
    hex.dataset.row = row; hex.dataset.col = col;
    if (row === 1) hex.setAttribute("data-color", "blu");
    if (row === 8 || row === 9) hex.setAttribute("data-color", "gray");
    if (row === 10 || row === 11 || row === 12) hex.setAttribute("data-color", "silver");

    if (isConeCell(row, col)) {
        hex.setAttribute("data-color", "cone");
        if (row === 1) hex.setAttribute("data-color", "coneblu");
        if (row === 8 || row === 9) hex.setAttribute("data-color", "conegrigio");
        if (row === 10 || row === 11 || row === 12) hex.setAttribute("data-color", "conesilver");
    }


    const allUnits = unitIds.map(id => unitById.get(id)).filter(Boolean);
    const overflow = Math.max(0, allUnits.length - DB.SETTINGS.gridSettings.dispalyLimit);
    const visibleUnits = overflow > 0 ? allUnits.slice(-DB.SETTINGS.gridSettings.dispalyLimit) : allUnits;

    setStackVisuals(hex, allUnits.length);

    if (visibleUnits.length === 0) {
        hex.classList.add("is-empty");
        hex.addEventListener("click", () => {
            UNIT_SELECTED.selectedUnitId = null;
            document.querySelectorAll('.hex-member.is-selected').forEach(el => el.classList.remove('is-selected'));
            hideTooltip();
            clearHighlights();
        });
    } else {
        const stackEl = document.createElement("div");
        stackEl.className = "hex-stack";

        const members = visibleUnits.map((unit, i) => {
            const member = document.createElement("div");
            member.className = "hex-member";
            member.style.setProperty("--i", i);

            const content = document.createElement("div");
            content.className = "hex-content";
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
            if (unit.id === UNIT_SELECTED.selectedUnitId) { member.classList.add('is-selected'); }


            addLongPress(member, {
                onClick: () => {

                    UNIT_SELECTED.selectedUnitId = unit.id;
                    bringToFront({ row, col }, unit.id);
                    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
                    openAccordionForRole(unit.role);
                    focusBenchCard(unit.id, { scroll: true, pulse: true });
                    focusUnitOnField(unit.id);
                    const html = getUnitTooltipHTML(unit);
                    showTooltip(html);
                    if (unit.role === 'enemy') showGiantCone(unit.id);

                },
                onLongPress: () => {
                    hideTooltip();
                    openAccordionForRole(unit.role);
                    if (unit.role === 'enemy') showGiantCone(unit.id);
                    handleUnitLongPress({ unit, cell: { row, col } });
                }
            });


            content.draggable = false; // evita l'H5 su touch

            enablePointerDrag(content, {
                makePayload: () => ({
                    type: 'from-cell',
                    unitId: unit.id,
                    from: { row, col, stackIndex: i }
                }),
                onDrop: (hexEl, payload) => {
                    // drop su cella
                    if (hexEl.classList.contains('hexagon')) {
                        const to = { row: +hexEl.dataset.row, col: +hexEl.dataset.col };
                        handleDrop(payload, to);
                        clearHighlights();
                        renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
                        renderBenches();
                        hideTooltip();
                        return;
                    }
                    // drop su panchina (se serve): troviamo il container più vicino
                    const bench = hexEl.closest?.('#bench-allies, #bench-enemies, #bench-walls');
                    if (bench) {
                        // Simula il branch che oggi gestisci nel drop delle benches
                        if (payload.type === 'from-cell') {
                            const unit = unitById.get(payload.unitId);
                            if (!unit) return;
                            // Rimetti in panchina solo se il ruolo coincide
                            const accept = bench.id === 'bench-allies' ? (unit.role !== 'enemy' && unit.role !== 'wall')
                                : bench.id === 'bench-enemies' ? (unit.role === 'enemy')
                                    : (unit.role === 'wall');
                            if (!accept) return;

                            // togli da cella
                            const src = getStack(payload.from.row, payload.from.col);
                            const idx = src.indexOf(payload.unitId);
                            if (idx >= 0) { src.splice(idx, 1); setStack(payload.from.row, payload.from.col, src); }

                            UNIT_SELECTED.selectedUnitId = null;
                            renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
                            renderBenches();
                            clearHighlights();
                        }
                    }
                }
            });

            return member;
        });

        layoutMembers(hex, members, allUnits.length);
        hex.appendChild(stackEl);
    }
    return hex;
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
/** Ritorna true se l'unità è già nello stack della cella target ({row,col}). */
const sameId = (unitId, target) => {
    if (!target || target.row == null || target.col == null) return false;
    const wanted = String(unitId);
    const stack = getStack(+target.row, +target.col); // array di id in quella cella
    return stack.some(id => String(id) === wanted);
};

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
    UNIT_SELECTED.selectedUnitId = unitId;
    setStack(target.row, target.col, tgt);
    renderBenches();
    if (unit?.role !== 'enemy') await playSfx(getMusicUrlById(unitId));
}

export function focusUnitOnField(unitId, attackFocus = false) {
    const cell = findUnitCell(unitId);
    if (!cell) return;

    bringToFront(cell, unitId);
    UNIT_SELECTED.selectedUnitId = unitId;
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
export function focusBenchCard(unitId, { scroll = true, pulse = true } = {}) {
    // marca come selezionato e ridisegna panchine
    UNIT_SELECTED.selectedUnitId = unitId;
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
    if (UNIT_SELECTED.selectedUnitId === unitId) UNIT_SELECTED.selectedUnitId = null;
    rebuildUnitIndex();
    renderBenches();
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
    // 5) Log
    log(`Rimossa unità: ${name}.`);
    scheduleSave('grid');
    return true;
}

/* Elimina più unità in batch, senza popup di conferma.
   Ritorna il numero di unità effettivamente rimosse. */
export function deleteUnits(ids) {
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
        if (UNIT_SELECTED.selectedUnitId === unitId) UNIT_SELECTED.selectedUnitId = null;

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
        scheduleSave('grid');
    }

    return removedCount;
}

export async function clearGrid() {
    deleteUnits(GAME_STATE.giantsRoster.map(giant => giant.id));
    deleteUnits(GAME_STATE.alliesRoster.map(ally => ally.id));
    GIANT_ENGAGEMENT.clear();
    GAME_STATE.turnEngine.setPhase('idle');
    GAME_STATE.turnEngine.round = 0;
    GAME_STATE.turnEngine.teamCreated = false;
    GAME_STATE.turnEngine.eventCards = 0;
    GAME_STATE.turnEngine.squadNumber = 0;
    renderMissionUI();
    scheduleSave('grid');
}


export function showGiantCone(giantOrId) {
    const id = typeof giantOrId === 'string' ? giantOrId : giantOrId.id;
    const u = unitById.get(id);
    if (!u || u.role !== 'enemy') return;
    const cell = findUnitCell(id); if (!cell) return;

    const { dir, targetHint } = pickGiantFacing(u, cell);
    const rng = Math.max(1, getStat(u, 'rng') || 1);
    const cells = hexCone(cell.row, cell.col, dir, rng, { includeOrigin: true });
    setGiantConeCells(id, cells);
    setGiantNemesiTarget(id, targetHint?.unit);
    setCone(cells);
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
}
