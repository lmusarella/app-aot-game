import { hideTooltip, openAccordionForRole, getUnitTooltipHTML, showTooltip, showSnackBar, addLongPress, confirmDialog } from './ui.js';
import { playSfx } from './audio.js';
import { isClone, getStat, applyHpBar, getMusicUrlById, isHuman, pickRandom, COLOR_VAR, keyRC } from './utils.js';
import { unitById, rebuildUnitIndex, DB, GAME_STATE, UNIT_SELECTED, scheduleSave, GIANT_ENGAGEMENT } from './data.js';
import { log } from './log.js';
import { adjustUnitHp, startAttackPick, getEngagedHuman, getEngagingGiant } from './entity.js';

// === HIGHLIGHT CONO =========================================================
const HILITE = { cone: new Set() };

export function clearHighlights() { HILITE.cone.clear(); }
function setCone(cells) { HILITE.cone = new Set(cells.map(p => keyRC(p.row, p.col))); }
function isConeCell(r, c) { return HILITE.cone.has(keyRC(r, c)); }
// normalizza un indice di direzione su 0..5
const normDir = (d) => ((d % 6) + 6) % 6;

const baseHpOverride = new Map();
let isDraggingNow = false;

export const grid = document.getElementById("hex-grid");

const alliesEl = document.getElementById("bench-allies");
const enemiesEl = document.getElementById("bench-enemies");
const wallsEl = document.getElementById("bench-walls");
const countAlliesEl = document.getElementById("count-allies");
const countEnemiesEl = document.getElementById("count-enemies");
const countWallsEl = document.getElementById("count-walls");
const HEX_CFG = {
    // base indici (0 o 1) dedotta dal DOM delle celle
    base: 1,
    // layout righe offset: 'even-r' | 'odd-r' | 'auto' (sceglie da solo)
    layout: 'odd-r',
    autoSwapRC: false
};

// muri più vicini (scansione griglia usando hasWallInCell)
export function nearestWallCell(fromR, fromC) {
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
export function inBoundsRC(r, c) {
    const { R, C } = gridSize();
    if (HEX_CFG.base === 0) {
        return r >= 0 && r < R && c >= 0 && c < C;
    } else {
        return r >= 1 && r <= R && c >= 1 && c <= C;
    }
}
function normalizeRC(r, c) {
    if (!HEX_CFG.autoSwapRC) return { r, c };

    const rcOK = inBoundsRC(r, c);
    if (rcOK) return { r, c };

    const crOK = inBoundsRC(c, r);
    return crOK ? { r: c, c: r } : { r, c };
}

// --- VICINI ESAGONALI (row-offset) -----------------------------------------
export function hexNeighbors(row, col, includeSelf = true) {
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
export function hexWithinRadius(row, col, radius = 1, includeSelf = false) {
    ({ r: row, c: col } = normalizeRC(row, col));
    radius = Math.max(0, radius | 0);

    const seen = new Set([keyRC(row, col)]);
    const out = [];
    let frontier = [{ row, col }];

    if (includeSelf) out.push({ row, col, self: true });

    for (let dist = 1; dist <= radius; dist++) {
        const next = [];
        for (const p of frontier) {
            const ns = hexNeighbors(p.row, p.col, false);
            for (const n of ns) {
                const k = keyRC(n.row, n.col);
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
// --- OFFSET <-> CUBE -------------------------------------------------------
function offsetToCube(row, col) {
    const base = HEX_CFG.base || 0;
    const r0 = row - base;
    const c0 = col - base;

    let x, z; // cube: (x,y,z) con x+y+z=0
    if (HEX_CFG.layout === 'odd-r') {
        const q = c0 - ((r0 - (r0 & 1)) >> 1);
        x = q;
        z = r0;
    } else { // 'even-r'
        const q = c0 - ((r0 + (r0 & 1)) >> 1);
        x = q;
        z = r0;
    }
    const y = -x - z;
    return { x, y, z };
}

function cubeToOffset(x, y, z) {
    const base = HEX_CFG.base || 0;
    const r0 = z;                    // in cube usiamo (x,y,z) con x+y+z=0
    let c0;
    if (HEX_CFG.layout === 'odd-r') {
        c0 = x + Math.floor((r0 - (r0 & 1)) / 2);
    } else { // 'even-r'
        c0 = x + Math.floor((r0 + (r0 & 1)) / 2);
    }
    return { row: r0 + base, col: c0 + base };
}

export function hexDistance(r1, c1, r2, c2) {
    ({ r: r1, c: c1 } = normalizeRC(r1, c1));
    ({ r: r2, c: c2 } = normalizeRC(r2, c2));
    const a = offsetToCube(r1, c1), b = offsetToCube(r2, c2);
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

// --- UTILS -----------------------------------------------------------------
export function gridSize() {
    const R = DB?.SETTINGS?.gridSettings?.rows ?? 0;
    const C = DB?.SETTINGS?.gridSettings?.cols ?? 0;
    return { R, C };
}

export function findUnitCell(unitId) {
    for (const s of GAME_STATE.spawns) {
        const arr = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
        if (arr.includes(unitId)) return { row: s.row, col: s.col };
    }
    return null;
}


export function renderBenches() {
    renderBenchSection(alliesEl, GAME_STATE.alliesRoster, ["recruit", "commander"]);
    renderBenchSection(enemiesEl, GAME_STATE.giantsRoster, ["enemy"]);
    renderBenchSection(wallsEl, GAME_STATE.walls, ["wall"], /*readOnly*/ true);

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
                    showTooltip(html);
                    // piccolo flash visivo
                    card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 450);
                    if (u.role === 'enemy') showGiantCone(u.id);
                }
            },
            onLongPress: () => {
                hideTooltip();
                clearHighlights();
                if (u.role === 'enemy') showGiantCone(u.id);
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
                clearHighlights();
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

                UNIT_SELECTED.selectedUnitId = null;
                renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
                renderBenches();
            }
        });
    }
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

export function getStack(r, c) {
    const idx = findCellIndex(r, c);
    if (idx < 0) return [];
    const s = GAME_STATE.spawns[idx];
    if (Array.isArray(s.unitIds)) return [...s.unitIds];
    if (s.unitId) return [s.unitId];
    return [];
}

export function setStack(r, c, arr) {
    const idx = findCellIndex(r, c);
    if (!arr || arr.length === 0) { if (idx >= 0) GAME_STATE.spawns.splice(idx, 1); return; }
    if (idx < 0) GAME_STATE.spawns.push({ row: r, col: c, unitIds: [...arr] });
    else GAME_STATE.spawns[idx] = { row: r, col: c, unitIds: [...arr] };
    scheduleSave();
}

function findCellIndex(r, c) { return GAME_STATE.spawns.findIndex(s => s.row === r && s.col === c); }
function setStackVisuals(hexEl, count) {
    let size;
    if (count <= 1) { size = 82; }
    else if (count === 2) { size = 62; }
    else if (count === 3) { size = 58; }
    else if (count <= 8) { size = 52; }
    else { size = 48; }
    hexEl.style.setProperty('--member-size', `${size}px`);
}
function bringToFront(cell, unitId) {
    const list = getStack(cell.row, cell.col);
    const i = list.indexOf(unitId);
    if (i < 0) return;
    list.splice(i, 1);
    list.push(unitId);
    setStack(cell.row, cell.col, list);
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
            if (unit.id === UNIT_SELECTED.selectedUnitId) { member.classList.add('is-selected'); }

            // Long-press sul membro in campo: mostra tooltip; click breve = focus + bringToFront
            addLongPress(member, {
                onClick: () => {
                    if (!isDraggingNow) {
                        UNIT_SELECTED.selectedUnitId = unit.id;
                        bringToFront({ row, col }, unit.id);
                        renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
                        openAccordionForRole(unit.role);
                        focusBenchCard(unit.id, { scroll: true, pulse: true });
                        const html = getUnitTooltipHTML(unit);
                        showTooltip(html);
                        if (unit.role === 'enemy') showGiantCone(unit.id);
                    }
                },
                onLongPress: () => {
                    hideTooltip();
                    openAccordionForRole(unit.role);
                    handleUnitLongPress({ unit, cell: { row, col } });
                    if (unit.role === 'enemy') showGiantCone(unit.id);
                }
            });

            content.addEventListener("dragstart", (e) => {
                isDraggingNow = true;
                hideTooltip();
                clearHighlights();
                UNIT_SELECTED.selectedUnitId = unit.id;
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
        UNIT_SELECTED.selectedUnitId = null;
        document.querySelectorAll('.hex-member.is-selected').forEach(el => el.classList.remove('is-selected'));
        hideTooltip();
        clearHighlights();
    });

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
export function removeUnitEverywhere(unitId) {
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
    await playSfx(getMusicUrlById(unitId));
}
function hasWallInCell(r, c) {
    const stack = getStack(r, c);
    return stack.some(id => (unitById.get(id)?.role === 'wall'));
}

export function moveOneUnitBetweenStacks(from, to, unitId) {
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
    UNIT_SELECTED.selectedUnitId = unitId;
    setStack(to.row, to.col, tgt);
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

// camminabilità: niente muri e rispetto cap stack
function defaultWalkableFn(r, c) {
    if (hasWallInCell(r, c)) return false;
    const stack = getStack(r, c) || [];
    const maxCap = DB?.SETTINGS?.gridSettings?.maxUnitHexagon ?? Infinity;
    return stack.length < maxCap;
}

// vicino che riduce di più la distanza verso una destinazione
export function nextStepTowards(fromR, fromC, toR, toC, { walkableFn = defaultWalkableFn } = {}) {
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


export function humanTargetsWithin2(fromR, fromC) {
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

export function hasHumanInCell(row, col) {
    const stack = getStack(row, col) || [];
    return stack.some(id => {
        const u = unitById.get(id);
        // considera umani = non enemy, non wall
        return u && u.role !== 'enemy' && u.role !== 'wall';
    });
}

function handleUnitLongPress({ unit, cell }) {
    // niente mura
    if (unit.role === 'wall') return;

    let targets = findTargetsFor(unit, cell);

    const engaged = getEngagedHuman(unit.id) || getEngagingGiant(unit.id);

    if (engaged) {
        targets = targets.filter(target => target.id === engaged);
    }

    if (!targets.length) {
        showSnackBar('Nessun bersaglio a portata.', {}, 'info');
        return;
    }

    startAttackPick(unit, targets)
}

export function findTargetsFor(attacker, cell) {
    const out = [];
    const rng = getStat(attacker, 'rng') || 1;

    if (attacker.role === 'enemy') {
        // Facing da VISTA (min 2) + ingaggio
        const { dir } = pickGiantFacing(attacker, cell);
        const cone = hexCone(cell.row, cell.col, dir, rng, { includeOrigin: true });

        // Se vede almeno un umano (entro vista, non per forza entro rng), colpisce SOLO umani nel cono.
        const seenHuman = lowestHpHumanWithin(attacker, cell.row, cell.col, Math.max(GIANT_VISION, rng)) != null;

        for (const p of cone) {
            for (const id of getStack(p.row, p.col)) {
                const u = unitById.get(id);
                if (!u) continue;
                if (seenHuman) {
                    if (u.role === 'recruit' || u.role === 'commander') out.push({ ...u, cell: p });
                } else {
                    if (u.role === 'wall') out.push({ ...u, cell: p });
                }
            }
        }
        return out;
    }

    // Alleati: cerchio entro rng, solo enemy
    for (const p of hexWithinRadius(cell.row, cell.col, rng, true)) {
        for (const id of getStack(p.row, p.col)) {
            const u = unitById.get(id);
            if (u && u.role === 'enemy') out.push({ ...u, cell: p });
        }
    }
    return out;
}



function unitsAt(r, c) {
    return getStack(r, c).map(id => unitById.get(id)).filter(Boolean);
}

export function sameOrAdjCells(idA, idB) {
    const a = findUnitCell(idA), b = findUnitCell(idB);
    if (!a || !b) return false;
    if (a.row === b.row && a.col === b.col) return true;
    const neigh = hexNeighbors(a.row, a.col, true); // include self
    return neigh.some(p => p.row === b.row && p.col === b.col);
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
    scheduleSave();
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
        scheduleSave();
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
    scheduleSave();
}

// Cono con profondità = range: 3 "raggi" (dir-1, dir, dir+1) dalla cella sorgente
// Cono largo 3 "raggi" (dir-1, dir, dir+1) profondo = range
// Cono regolare: profondità = range, 3 "raggi" (dir-1, dir, dir+1)
export function hexCone(fromR, fromC, dir, range = 1, { includeOrigin = false } = {}) {
    const main = ((dir % 6) + 6) % 6;
    const vF = dirVec(main);
    const vL = dirVec((main + 5) % 6);
    const vR = dirVec((main + 1) % 6);

    const o = offsetToCube(fromR, fromC);
    const cells = [];
    const seen = new Set();

    const push = (x, y, z) => {
        const { row, col } = cubeToOffset(x, y, z);
        if (!inBoundsRC(row, col)) return;
        const k = row + ':' + col;
        if (seen.has(k)) return;
        seen.add(k); cells.push({ row, col });
    };

    if (includeOrigin) push(o.x, o.y, o.z);          // <<— NOVITÀ

    for (let d = 1; d <= Math.max(1, range | 0); d++) {
        for (let s = -d; s <= d; s++) {
            const a = (s < 0) ? -s : 0;   // passi a sinistra
            const c = (s > 0) ? s : 0;   // passi a destra
            const b = d - a - c;          // passi frontali
            const x = o.x + vL.x * a + vF.x * b + vR.x * c;
            const y = o.y + vL.y * a + vF.y * b + vR.y * c;
            const z = o.z + vL.z * a + vF.z * b + vR.z * c;
            push(x, y, z);
        }
    }
    return cells;
}


// Sceglie la direzione "di facing" verso una destinazione arbitraria:
// se target è oltre 1, usa lo step migliore verso di essa.
export function facingDirTowards(fromR, fromC, toR, toC) {
    if (fromR === toR && fromC === toC) return 0;
    const step = nextStepTowards(fromR, fromC, toR, toC) || { row: toR, col: toC };
    let dir = dirIndexTo(fromR, fromC, step.row, step.col);
    if (dir < 0) dir = bestDirectionToward(fromR, fromC, toR, toC);
    return normDir(dir);
}

function lowestHpHumanWithin(attacker, fromR, fromC, radius) {
    const area = hexWithinRadius(fromR, fromC, radius, true);
    let best = null, bestHp = Infinity, bestD = Infinity;
    for (const p of area) {
        for (const u of unitsAtCell(p.row, p.col)) {
            if (!isHuman(u)) continue;
            const cur = u.currHp ?? u.hp ?? 0;
            const d = hexDistance(fromR, fromC, p.row, p.col);
            if (cur < bestHp || (cur === bestHp && d < bestD)) {
                best = { unit: u, row: p.row, col: p.col }; bestHp = cur; bestD = d;
            }
        }
    }
    return best;
}

// facing per il gigante: verso umano (entro visione=2), altrimenti verso muro
export function pickGiantFacing(attacker, cell) {
    const R = Math.max(2, getStat(attacker, 'rng') || 1); // vista minima 2 come richiesto

    // 1) Priorità: bersaglio ingaggiato
    const engagedId = GIANT_ENGAGEMENT.get(String(attacker.id));
    if (engagedId) {
        const engaged = unitById.get(engagedId);
        const engagedCell = engaged ? findUnitCell(engaged.id) : null;
        const alive = engaged && (engaged.currHp ?? engaged.hp) > 0;
        if (alive && engagedCell) {
            return {
                dir: facingDirTowards(cell.row, cell.col, engagedCell.row, engagedCell.col),
                targetHint: { unit: engaged, row: engagedCell.row, col: engagedCell.col },
                reason: 'engaged'
            };
        } else {
            // ingaggio non più valido → pulizia
            GIANT_ENGAGEMENT.delete(String(attacker.id));
        }
    }

    // 2) Nessun ingaggio → umano con meno HP entro raggio di VISTA (non di attacco)
    const human = lowestHpHumanWithin(attacker, cell.row, cell.col, R);
    if (human) {
        return {
            dir: facingDirTowards(cell.row, cell.col, human.row, human.col),
            targetHint: human,
            reason: 'lowest-hp'
        };
    }

    // 3) Altrimenti mura
    const wall = nearestWallCell(cell.row, cell.col);
    if (wall) {
        return {
            dir: facingDirTowards(cell.row, cell.col, wall.row, wall.col),
            targetHint: null,
            reason: 'wall'
        };
    }

    return { dir: 0, targetHint: null, reason: 'fallback' };
}

// 6 direzioni in offset row-based, ordinate (0..5) in senso orario
// 6 direzioni in offset row-based, ordinate (N, NE, SE, S, SW, NW)
// Funziona con base=1 o 0 e con HEX_CFG.layout 'odd-r' / 'even-r'
// 6 direzioni (odd-r/even-r) in ordine E, NE, NW, W, SW, SE
function sixDirs(row) {
    const even = ((row - HEX_CFG.base) % 2 === 0);

    if (HEX_CFG.layout === 'odd-r') {
        //       E        NE          NW          W         SW           SE
        return even
            ? [[0, +1], [-1, 0], [-1, -1], [0, -1], [+1, -1], [+1, 0]]
            : [[0, +1], [-1, +1], [-1, 0], [0, -1], [+1, 0], [+1, +1]];
    } else { // 'even-r'
        return even
            ? [[0, +1], [-1, +1], [-1, 0], [0, -1], [+1, 0], [+1, +1]]
            : [[0, +1], [-1, 0], [-1, -1], [0, -1], [+1, -1], [+1, 0]];
    }
}

// --- direzione cubica (0..5) -> vettore cube
const CUBE_DIRS = [
    { x: +1, y: -1, z: 0 }, { x: +1, y: 0, z: -1 }, { x: 0, y: +1, z: -1 },
    { x: -1, y: +1, z: 0 }, { x: -1, y: 0, z: +1 }, { x: 0, y: -1, z: +1 },
];

function dirVec(ix) { const i = ((ix % 6) + 6) % 6; return CUBE_DIRS[i]; }

// passo in direzione ix per N step (usa le conversioni offset<->cube che già hai)
function stepDir(row, col, dirIx, steps = 1) {
    const v = dirVec(dirIx);
    const c = offsetToCube(row, col);
    const nx = c.x + v.x * steps;
    const ny = c.y + v.y * steps;
    const nz = c.z + v.z * steps;
    return cubeToOffset(nx, ny, nz);
}


function dirIndexTo(fromR, fromC, toR, toC) {
    const deltas = sixDirs(fromR);
    for (let k = 0; k < 6; k++) {
        const [dr, dc] = deltas[k];
        if (fromR + dr === toR && fromC + dc === toC) return k;
    }
    return -1;
}
// direzione “principale” (0..5) che più avvicina a (toR,toC)
// sceglie la direzione che avvicina di più a (toR,toC). Se nessuna riduce, ritorna comunque la “migliore”.
// direzione (0..5) che più avvicina da (from) a (to)
const GIANT_VISION = 2; // come richiesto

function bestDirectionToward(fromR, fromC, toR, toC) {
    // scegli la direzione che riduce di più la distanza in un singolo passo
    const d0 = hexDistance(fromR, fromC, toR, toC);
    let bestIx = 0, best = Infinity;
    for (let i = 0; i < 6; i++) {
        const p = stepDir(fromR, fromC, i, 1);
        const d = hexDistance(p.row, p.col, toR, toC);
        if (d < best && d < d0) { best = d; bestIx = i; }
    }
    return bestIx;
}

export function showGiantCone(giantOrId) {
    const id = typeof giantOrId === 'string' ? giantOrId : giantOrId.id;
    const u = unitById.get(id);
    if (!u || u.role !== 'enemy') return;
    const cell = findUnitCell(id); if (!cell) return;

    const { dir } = pickGiantFacing(u, cell);     // usa VISIONE=2
    const rng = Math.max(1, getStat(u, 'rng') || 1); // profondità = range
    const cells = hexCone(cell.row, cell.col, dir, rng, { includeOrigin: true });
    setCone(cells);
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
}
