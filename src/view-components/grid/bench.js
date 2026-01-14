import { hideTooltip, getUnitTooltipHTML, showTooltip, addLongPress, showSnackBar } from '../../ui-components/ui-helpers.js';
import { applyHpBar, COLOR_VAR } from '../../game-business-logic/utils.js';
import { DB, GAME_STATE, UNIT_SELECTED } from '../../core/data.js';
import { APP_STATE } from '../../core/app-state.js';
import { adjustUnitHp } from '../../game-business-logic/entity/entity.js';
import { getTurnInfo } from '../../game-business-logic/turn-tracker.js';
import { enablePointerDrag } from './drag.js';
import { bringToFront } from './stacks.js';
import { findUnitCell } from './queries.js';
import { clearHighlights } from './cone.js';

let benchRetryId = null;

function canActNow() {
    if (APP_STATE.gameMode !== 'multiplayer') return true;
    const { isMyTurn, currentPlayerId } = getTurnInfo();
    return !!currentPlayerId && isMyTurn;
}

function canControlUnit(unit) {
    if (APP_STATE.gameMode !== 'multiplayer') return true;
    if (!unit) return false;
    if (unit.role === 'enemy' || unit.role === 'wall') return false;
    const myId = APP_STATE.user?.id;
    return !!myId && unit.owner_id === myId;
}

function warnAction(message) {
    showSnackBar(message, {}, 'warning');
}

const benchContext = {
    renderGrid: null,
    grid: null,
    handleDrop: null,
    showGiantCone: null,
    deleteUnit: null
};

export function setBenchContext(context) {
    Object.assign(benchContext, context);
}

function getBenchElements() {
    return {
        alliesEl: document.getElementById("bench-allies"),
        enemiesEl: document.getElementById("bench-enemies"),
        wallsEl: document.getElementById("bench-walls"),
        countAlliesEl: document.getElementById("count-allies"),
        countEnemiesEl: document.getElementById("count-enemies"),
        countWallsEl: document.getElementById("count-walls")
    };
}

export function renderBenches() {
    const { alliesEl, enemiesEl, wallsEl, countAlliesEl, countEnemiesEl, countWallsEl } = getBenchElements();
    if (!alliesEl || !enemiesEl || !wallsEl) {
        if (!benchRetryId) {
            benchRetryId = requestAnimationFrame(() => {
                benchRetryId = null;
                renderBenches();
            });
        }
        return;
    }
    renderBenchSection(alliesEl, GAME_STATE.alliesRoster);
    renderBenchSection(enemiesEl, GAME_STATE.giantsRoster);
    renderBenchSection(wallsEl, GAME_STATE.walls, true);

    if (countAlliesEl) countAlliesEl.textContent = `${GAME_STATE.alliesRoster.length} unità`;
    if (countEnemiesEl) countEnemiesEl.textContent = `${GAME_STATE.giantsRoster.length} unità`;
    if (countWallsEl) countWallsEl.textContent = `${GAME_STATE.walls.length} mura`;
}

function benchClickFocusAndTop(u) {
    const unitId = u.id;
    const cell = findUnitCell(unitId);

    if (cell) {
        // È in campo: porta davanti e seleziona come già fai
        bringToFront(cell, unitId);
        UNIT_SELECTED.selectedUnitId = unitId;
        benchContext.renderGrid?.(benchContext.grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
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
    if (!container) return;
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
            const players = Array.isArray(APP_STATE.roomPlayers) ? APP_STATE.roomPlayers : [];
            const player = players.find(p => p.user_id === u.owner_id) || {};
            const baseName = player.nickname || u.owner_nickname;
            const isMe = u.owner_id && APP_STATE.user?.id && u.owner_id === APP_STATE.user.id;
            const nameLabel = isMe ? `${baseName} (Tu)` : baseName;
            const last = player.last_seen ? new Date(player.last_seen).getTime() : 0;
            const online = !!last && (Date.now() - last < 90000);
            const statusClass = online ? 'msn-squad-dot--online' : 'msn-squad-dot--offline';
            const statusLabel = online ? 'Online' : 'Offline';
            owner.innerHTML = `
                <span class="msn-squad-dot ${statusClass}" title="${statusLabel}"></span>
                <span>Giocatore: ${nameLabel}</span>
            `;
            owner.setAttribute('title', statusLabel);
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
            if (!canActNow()) {
                warnAction('Non è il tuo turno.');
                return;
            }
            if (!canControlUnit(u)) {
                warnAction('Puoi modificare solo la tua unità.');
                return;
            }
            adjustUnitHp(u.id, e.shiftKey ? -5 : -1);
            hpRight.textContent = `${u.currHp}/${u.hp}`;
            applyHpBar(hpFill, u);
            hideTooltip();
            clearHighlights();
        });
        hpPlus.addEventListener("click", (e) => {
           
            e.stopPropagation();
            if (isWall && isDestroyed) return;
            if (!canActNow()) {
                warnAction('Non è il tuo turno.');
                return;
            }
            if (!canControlUnit(u)) {
                warnAction('Puoi modificare solo la tua unità.');
                return;
            }
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
                if (!canActNow()) {
                    warnAction('Non è il tuo turno.');
                    return;
                }
                if (!canControlUnit(u)) {
                    warnAction('Puoi rimuovere solo la tua unità.');
                    return;
                }
                card.classList.add('removing');
                const ok = await benchContext.deleteUnit?.(u.id);
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
                if (u.role === 'enemy') benchContext.showGiantCone?.(u.id);
            },
            onLongPress: () => {
                hideTooltip();
                clearHighlights();
                if (u.role === 'enemy') benchContext.showGiantCone?.(u.id);
            }
        });


        if (!readOnly) {
            // disattiva drag H5 per evitare conflitti su touch
            card.draggable = false;
            enablePointerDrag(card, {
                makePayload: () => {
                    if (!canActNow()) {
                        warnAction('Non è il tuo turno.');
                        return null;
                    }
                    if (!canControlUnit(u)) {
                        warnAction('Puoi muovere solo la tua unità.');
                        return null;
                    }
                    return { type: 'from-bench', unitId: u.id };
                },
                onDrop: (hexEl, payload) => {
                    if (!payload) return;
                    const row = +hexEl.dataset.row, col = +hexEl.dataset.col;
                    benchContext.handleDrop?.(payload, { row, col });
                    clearHighlights();
                    benchContext.renderGrid?.(benchContext.grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
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
