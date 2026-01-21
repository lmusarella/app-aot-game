import { GAME_STATE, DB } from "../../core/data.js";
import { APP_STATE } from "../../core/app-state.js";
import { scheduleSave } from '../../game-business-logic/game-sync.js';
import { log } from "../leftbar/log.js";
import { levelFromXP, levelProgressPercent, getMalusRow } from '../../game-business-logic/utils.js';
import { renderBonusMalus } from '../leftbar/mods.js';
import showDeathScreen from '../../game-business-logic/effects/deathOverlay.js';
import { focusUnitOnField } from '../grid/grid.js';
import { showTooltipAt } from '../../ui-components/ui-helpers.js';
import { openHandOverlay } from '../fabs/fab/hand-overlay.js';
import { showSnackBar } from '../../ui-components/snackbar.js';
import { getTurnInfo } from '../../game-business-logic/turn-tracker.js';
import { pushGameEvent } from '../../game-business-logic/event-manager.js';

function getFooterElements() {
    return {
        xp: {
            fill: document.getElementById("xp-fill"),
            pct: document.getElementById("xp-val"),
            lvl: document.getElementById("lvl-val"),
        },
        morale: {
            fill: document.getElementById("morale-fill"),
            pct: document.getElementById("morale-val"),
        }
    };
}

export const stack_screen = [];
const pendingFooterMessages = [];

function getRoleLabel(role) {
    if (role === 'commander') return 'Comandante';
    if (role === 'recruit') return 'Recluta';
    if (role === 'enemy') return 'Gigante';
    if (role === 'wall') return 'Muro';
    return role ? role.toString() : 'Unità';
}

function isPlayerOnline(player, now = Date.now()) {
    const ONLINE_THRESHOLD_MS = 90000;
    const last = player?.last_seen ? new Date(player.last_seen).getTime() : 0;
    return !!(last && now - last < ONLINE_THRESHOLD_MS);
}

function getNonMissionUnitsForPlayer(player, rosterIds, unitIndex) {
    if (!player) return { units: [], playerName: 'Giocatore' };
    const allUnits = [
        player.commander_code,
        ...(Array.isArray(player.recruit_codes) ? player.recruit_codes : [])
    ].filter(Boolean);

    const extraUnits = allUnits
        .filter(code => !rosterIds.has(code))
        .map(code => unitIndex.get(code) || { id: code, name: code, img: 'assets/units/default.png' });

    const playerName = player.nickname || player.user_id?.slice(0, 8) || 'Giocatore';
    return { units: extraUnits, playerName };
}

function buildFooterAvatarTooltip(player, rosterIds, unitIndex, missionUnit, { online, statusLabel }) {
    const { units, playerName } = getNonMissionUnitsForPlayer(player, rosterIds, unitIndex);
    const missionName = missionUnit?.name || missionUnit?.id || '—';
    const missionRole = getRoleLabel(missionUnit?.role);
    const statusClass = online ? 'is-online' : 'is-offline';
    const statusText = statusLabel || (online ? 'Online' : 'Offline');
    if (!units.length) {
        return `
            <div class="tt-card footer-squad-tooltip">
                <div class="tt-title">${playerName} <span class="footer-squad-title-unit">· ${missionName}</span></div>
                <div class="footer-squad-current">In missione: ${missionName} · ${missionRole}</div>
                <div class="footer-squad-status ${statusClass}">${statusText}</div>
                <div class="tt-badge">Unità fuori missione</div>
                <p class="footer-squad-empty">Nessuna unità fuori missione.</p>
            </div>
        `;
    }
    const listItems = units.map(unit => {
        const unitName = unit?.name || unit?.id || 'Unità sconosciuta';
        const unitAvatar = unit?.img || unit?.avatar || 'assets/units/default.png';
        const unitRole = getRoleLabel(unit?.role);
        return `
            <li class="msn-squad-item">
                <span class="msn-squad-unit">
                    <span class="msn-squad-avatar"><img src="${unitAvatar}" alt=""></span>
                    <span class="msn-squad-unit-name">${unitName}</span>
                    <span class="msn-squad-unit-role">${unitRole}</span>
                </span>
            </li>
        `;
    }).join('');
    return `
        <div class="tt-card footer-squad-tooltip">
            <div class="tt-title">${playerName} <span class="footer-squad-title-unit">· ${missionName}</span></div>
            <div class="footer-squad-current">In missione: ${missionName} · ${missionRole}</div>
            <div class="footer-squad-status ${statusClass}">${statusText}</div>
            <div class="tt-badge">Unità fuori missione</div>
            <ul class="msn-squad">${listItems}</ul>
        </div>
    `;
}

function buildMessageMenu(menuEl, messages) {
    if (!menuEl) return;
    menuEl.innerHTML = messages
        .map(text => `<button type="button" data-message="${text}">${text}</button>`)
        .join('');
}

function showMessageBubble(wrapper, text) {
    if (!wrapper) return;
    const existing = wrapper.querySelector('.footer-message-bubble');
    if (existing) existing.remove();
    const bubble = document.createElement('div');
    bubble.className = 'footer-message-bubble';
    bubble.textContent = text;
    wrapper.appendChild(bubble);
    setTimeout(() => bubble.remove(), 4000);
}

function collectActiveFooterBubbles(container, selfBtn, messageWrap) {
    const bubbles = [];
    if (container) {
        container.querySelectorAll('.footer-message-bubble').forEach(bubble => {
            const playerBtn = bubble.closest('.footer-avatar-btn');
            const playerId = playerBtn?.dataset.playerId;
            if (playerId) {
                bubbles.push({ type: 'player', id: playerId, bubble });
            }
        });
    }
    if (selfBtn) {
        const bubble = selfBtn.querySelector('.footer-message-bubble');
        if (bubble) bubbles.push({ type: 'self', bubble });
    }
    if (messageWrap) {
        const bubble = messageWrap.querySelector('.footer-message-bubble');
        if (bubble) bubbles.push({ type: 'message', bubble });
    }
    bubbles.forEach(({ bubble }) => bubble.remove());
    return bubbles;
}

function restoreActiveFooterBubbles(bubbles, container, selfBtn, messageWrap) {
    if (!bubbles?.length) return;
    bubbles.forEach(({ type, id, bubble }) => {
        if (type === 'player') {
            const target = container?.querySelector(
                `.footer-avatar-btn[data-player-id="${CSS.escape(id)}"]`
            );
            if (target) target.appendChild(bubble);
            return;
        }
        if (type === 'self' && selfBtn) {
            selfBtn.appendChild(bubble);
            return;
        }
        if (type === 'message' && messageWrap) {
            messageWrap.appendChild(bubble);
        }
    });
}

function showMessageOnCompanion(senderId, text, fallbackEl) {
    if (!text) return;
    const selector = senderId
        ? `.footer-avatar-btn[data-player-id="${CSS.escape(senderId)}"]`
        : null;
    const target = selector ? document.querySelector(selector) : null;
    const bubbleTarget = target || fallbackEl;
    if (!bubbleTarget) return false;
    showMessageBubble(bubbleTarget, text);
    return true;
}

function queueFooterMessage(senderId, text) {
    if (!senderId || !text) return;
    pendingFooterMessages.push({ senderId, text, attempts: 0 });
    if (pendingFooterMessages.length > 20) {
        pendingFooterMessages.shift();
    }
}

function flushFooterMessages(fallbackEl) {
    if (!pendingFooterMessages.length) return;
    const remaining = [];
    pendingFooterMessages.forEach(({ senderId, text, attempts }) => {
        const shown = showMessageOnCompanion(senderId, text, fallbackEl);
        if (!shown && attempts < 4) {
            remaining.push({ senderId, text, attempts: attempts + 1 });
        }
    });
    pendingFooterMessages.length = 0;
    pendingFooterMessages.push(...remaining);
    if (pendingFooterMessages.length) {
        setTimeout(() => flushFooterMessages(fallbackEl), 250);
    }
}

function canSendFooterMessage() {
    if (APP_STATE.gameMode !== 'multiplayer') return true;
    return getTurnInfo().isMyTurn;
}

function updateMessageButtonState(messageBtn, messageMenu) {
    if (!messageBtn) return;
    const allowed = canSendFooterMessage();
    messageBtn.disabled = !allowed;
    if (!allowed && messageMenu) {
        messageMenu.hidden = true;
        delete messageMenu.dataset.open;
    }
    messageBtn.title = allowed ? 'Messaggi' : 'Messaggi (solo nel tuo turno)';
}

function recordFooterMessage(senderId, text) {
    if (!senderId || !text) return false;
    pushGameEvent('footer_message', { senderId, text });
    scheduleSave('footer-message', { force: true });
    return true;
}

export function showFooterMessageFromEvent({ senderId, text } = {}) {
    if (!senderId || !text) return;
    queueFooterMessage(senderId, text);
    const container = document.querySelector('.footer-avatars');
    if (!container || container.childElementCount === 0) {
        renderFooterAvatars();
        return;
    }
    const fallbackEl = document.querySelector('.footer-self-btn') || document.querySelector('.footer-message-wrap');
    flushFooterMessages(fallbackEl);
}

function setupMessageControls({ messageBtn, messageMenu, messageWrap, getSenderId, fallbackEl }) {
    if (!messageBtn) return;
    if (messageMenu) {
        const messages = [
            'Pronti a muovere?',
            'Attacco in corso!',
            'Attendi il tuo turno.',
            'Serve supporto qui.',
            'Bella mossa!'
        ];
        buildMessageMenu(messageMenu, messages);
        messageMenu.hidden = true;
    }

    if (!messageBtn.dataset.bound) {
        messageBtn.dataset.bound = '1';
        messageBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!messageMenu) return;
            if (!canSendFooterMessage()) {
                showSnackBar('Puoi inviare messaggi solo durante il tuo turno.', {}, 'warning');
                messageMenu.hidden = true;
                delete messageMenu.dataset.open;
                return;
            }
            const nextHidden = !messageMenu.hidden;
            messageMenu.hidden = nextHidden;
            if (nextHidden) {
                delete messageMenu.dataset.open;
            } else {
                messageMenu.dataset.open = '1';
            }
        });
    }

    if (messageMenu && !messageMenu.dataset.bound) {
        messageMenu.dataset.bound = '1';
        messageMenu.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-message]');
            if (!btn) return;
            const text = btn.dataset.message;
            messageMenu.hidden = true;
            delete messageMenu.dataset.open;
            if (!canSendFooterMessage()) {
                showSnackBar('Puoi inviare messaggi solo durante il tuo turno.', {}, 'warning');
                return;
            }
            const senderId = typeof getSenderId === 'function' ? getSenderId() : null;
            if (!senderId) {
                showSnackBar('Impossibile inviare il messaggio: utente non disponibile.', {}, 'warning');
                return;
            }
            recordFooterMessage(senderId, text);
            showMessageOnCompanion(senderId, text, fallbackEl || messageWrap);
        });
        document.addEventListener('click', (e) => {
            if (!messageMenu.hidden && !e.target.closest('.footer-message-wrap')) {
                messageMenu.hidden = true;
                delete messageMenu.dataset.open;
            }
        });
    }
}

export function renderFooterAvatars() {
    const container = document.querySelector('.footer-avatars');
    const selfBtn = document.querySelector('.footer-self-btn');
    const handBtn = document.querySelector('.footer-hand-btn');
    const messageBtn = document.querySelector('.footer-message-btn');
    const messageWrap = document.querySelector('.footer-message-wrap');
    const messageMenu = document.querySelector('.footer-message-menu');
    if (!container) return;
    const activeBubbles = collectActiveFooterBubbles(container, selfBtn, messageWrap);
    const players = Array.isArray(APP_STATE.roomPlayers) ? APP_STATE.roomPlayers : [];
    const myId = APP_STATE.user?.id || null;
    if (messageMenu && !messageMenu.dataset.open) {
        messageMenu.hidden = true;
    }
    setupMessageControls({
        messageBtn,
        messageMenu,
        messageWrap,
        getSenderId: () => APP_STATE.user?.id || null,
        fallbackEl: selfBtn
    });
    updateMessageButtonState(messageBtn, messageMenu);
    if (!players.length || !myId) {
        container.classList.add('is-hidden');
        container.innerHTML = '';
        if (selfBtn) {
            selfBtn.classList.add('is-hidden');
        }
        if (handBtn && !handBtn.dataset.bound) {
            handBtn.dataset.bound = '1';
            handBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openHandOverlay();
            });
        }
        return;
    }

    const roster = Array.isArray(GAME_STATE.alliesRoster) ? GAME_STATE.alliesRoster : [];
    const rosterIds = new Set(roster.map(u => u.id));
    const unitIndex = Array.isArray(DB.ALLIES)
        ? new Map(DB.ALLIES.map(u => [u.id, u]))
        : new Map();

    const playersById = new Map(players.map(player => [player.user_id, player]));
    const now = Date.now();
    const avatars = players
        .filter(p => p.user_id && p.user_id !== myId)
        .map(player => {
            const rosterUnit = roster.find(u => u.owner_id === player.user_id);
            const unitFromDb = !rosterUnit && player.unit_code
                ? unitIndex.get(player.unit_code)
                : null;
            const unit = rosterUnit || unitFromDb;
            const avatarSrc = unit?.img || unit?.avatar || 'assets/units/default.png';
            const displayName = player.nickname || player.user_id?.slice(0, 8) || 'Giocatore';
            const online = isPlayerOnline(player, now);
            const statusClass = online ? 'is-online' : 'is-offline';
            return `
                <button class="footer-avatar-btn" type="button" data-player-id="${player.user_id}"
                    data-unit-id="${unit?.id || ''}"
                    aria-label="Apri squadra fuori missione di ${displayName}" title="${displayName}">
                    <span class="footer-avatar-circle ${statusClass}">
                        <img src="${avatarSrc}" alt="Avatar ${displayName}">
                    </span>
                    <span class="footer-avatar-name">${displayName}</span>
                </button>
            `;
        })
        .join('');

    if (!avatars) {
        container.classList.add('is-hidden');
        container.innerHTML = '';
        return;
    }

    container.classList.remove('is-hidden');
    container.innerHTML = avatars;
    container.querySelectorAll('.footer-avatar-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const playerId = btn.dataset.playerId;
            const player = playersById.get(playerId);
            const rosterUnit = roster.find(u => u.owner_id === playerId);
            const unitFromDb = !rosterUnit && player?.unit_code
                ? unitIndex.get(player.unit_code)
                : null;
            const missionUnit = rosterUnit || unitFromDb;
            const online = isPlayerOnline(player, now);
            const tooltipHtml = buildFooterAvatarTooltip(player, rosterIds, unitIndex, missionUnit, {
                online,
                statusLabel: online ? 'Online' : 'Offline'
            });
            showTooltipAt(tooltipHtml, { x: e.clientX, y: e.clientY });
            const unitId = btn.dataset.unitId;
            if (unitId) {
                focusUnitOnField(unitId);
            }
        });
    });

    if (selfBtn) {
        const mePlayer = playersById.get(myId);
        const rosterUnit = roster.find(u => u.owner_id === myId);
        const unitFromDb = !rosterUnit && mePlayer?.unit_code
            ? unitIndex.get(mePlayer.unit_code)
            : null;
        const missionUnit = rosterUnit || unitFromDb;
        const avatarSrc = missionUnit?.img || missionUnit?.avatar || 'assets/units/default.png';
        const displayName = mePlayer?.nickname || mePlayer?.user_id?.slice(0, 8) || 'Giocatore';
        selfBtn.classList.remove('is-hidden');
        selfBtn.dataset.playerId = myId;
        selfBtn.innerHTML = `
            <span class="footer-avatar-circle">
                <img src="${avatarSrc}" alt="Avatar ${displayName}">
            </span>
            <span class="footer-avatar-name footer-self-name">${displayName}</span>
        `;
        if (!selfBtn.dataset.bound) {
            selfBtn.dataset.bound = '1';
            selfBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const online = isPlayerOnline(mePlayer, now);
                const tooltipHtml = buildFooterAvatarTooltip(mePlayer, rosterIds, unitIndex, missionUnit, {
                    online,
                    statusLabel: online ? 'Online' : 'Offline'
                });
                showTooltipAt(tooltipHtml, { x: e.clientX, y: e.clientY });
            });
        }
    }

    if (handBtn && !handBtn.dataset.bound) {
        handBtn.dataset.bound = '1';
        handBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openHandOverlay();
        });
    }
    restoreActiveFooterBubbles(activeBubbles, container, selfBtn, messageWrap);
    flushFooterMessages(selfBtn || messageWrap);
}

// Mutatore con logging dettagliato
export function addMorale(deltaPct) {
    const prev = Math.max(0, Math.min(10, Number(GAME_STATE.xpMoraleState.moralePct) || 0));
    const delta = Number(deltaPct) || 0;
    const next = Math.max(0, Math.min(10, prev + delta));

    // Aggiorna stato
    GAME_STATE.xpMoraleState.moralePct = next;

    // UI + pillole
    refreshMoraleUI();     // richiama già renderBonusMalus()
    scheduleSave('footer');
    // Cambio fascia malus?
    const prevBand = getMalusRow(prev);
    const nextBand = getMalusRow(next);
    if (prevBand?.text !== nextBand?.text) {
        if (nextBand) {
            // Entrata in nuova fascia
            const txt = nextBand.text ? `${nextBand.text}` : '';
            // Se morale scende, warning; se sale e alleggerisce il malus, info/success

            log(`${txt}`, nextBand.type);

            if (nextBand.range.min === 0) {
                const death = showDeathScreen({
                    text: txt,
                    subtext: 'Premi un tasto per ricominciare',
                    effect: 'chroma',       // 'none' | 'glitch' | 'chroma'
                    skullOpacity: 0.13,
                    skullScale: 1.0,
                    blur: 2,
                    allowDismiss: true,   // click/tasto per chiudere                 
                });
                
            } else if(nextBand.type === 'error') {
                const death = showDeathScreen({
                    text: txt,
                    //subtext: 'Premi un tasto per continuare',
                    effect: 'chroma',       // 'none' | 'glitch' | 'chroma'
                    skullOpacity: 0.13,
                    skullScale: 1.0,
                    blur: 2,
                    allowDismiss: false,   // click/tasto per chiudere
                    autoDismissMs: 3000,  // chiudi dopo 3s (opzionale)
                }); 
            }
        } else {
            // Uscito da ogni fascia (nessun malus attivo)
            log(`Nessun malus attivo.`, 'info');
        }
    }
}

export function addXP(delta) {

    const prevXP = GAME_STATE.xpMoraleState.xp;
    const prevLevel = levelFromXP(prevXP);
    const nextXP = Math.max(0, prevXP + (Number(delta) || 0));
    GAME_STATE.xpMoraleState.xp = nextXP;
    const nextLevel = levelFromXP(nextXP);

    // UI immediata
    refreshXPUI();   // aggiorna barra, % e pillole
    scheduleSave('footer');

    // Annunci di livello
    if (nextLevel > prevLevel) {
        for (let L = prevLevel + 1; L <= nextLevel; L++) {
            log(`Salito al livello ${L}!`, 'success');
            // evidenzia i bonus appena sbloccati (se presenti)
            const bonusTable = DB?.SETTINGS?.bonusTable ?? [];
            const unlocked = bonusTable.filter(b => b.lvl === L);
            unlocked.forEach(b => log(`Sbloccato: ${b.text}`, 'info'));
        }
    } else if (nextLevel < prevLevel) {
        // opzionale: logga il level-down
        for (let L = prevLevel - 1; L >= nextLevel; L--) {
            log(`Sei sceso al livello ${L}.`, 'warning');
        }
    }
}

export function refreshXPUI() {
    const L = levelFromXP(GAME_STATE.xpMoraleState.xp);
    const pct = levelProgressPercent(GAME_STATE.xpMoraleState.xp, L);
    const { xp } = getFooterElements();
    const xpRow = document.getElementById("xp-row");
    if (xpRow) {
        xpRow.classList.toggle("xp-readonly", APP_STATE.gameMode === "multiplayer");
    }
    if (xp.fill) xp.fill.style.width = pct + "%";
    if (xp.pct) xp.pct.textContent = Math.round(pct) + "%";
    if (xp.lvl) xp.lvl.textContent = "Lv. " + L;
    renderBonusMalus();
    refreshFooterTracker();
}

export function refreshMoraleUI() {
    const pct = Math.max(0, Math.min(100, Number(GAME_STATE.xpMoraleState.moralePct * 10) || 0));
    const { morale } = getFooterElements();
    const moraleRow = document.getElementById("morale-row");
    if (moraleRow) {
        moraleRow.classList.toggle("morale-readonly", APP_STATE.gameMode === "multiplayer");
    }
    if (morale.fill) morale.fill.style.width = pct + "%";
    if (morale.pct) morale.pct.textContent = Math.round(pct) + "%";
    renderBonusMalus();
    refreshFooterTracker();
}

export function refreshFooterTracker() {
    const moraleEl = document.getElementById("footer-morale");
    const levelEl = document.getElementById("footer-level");
    const killsPuroEl = document.getElementById("footer-kills-puro");
    const killsAnomaloEl = document.getElementById("footer-kills-anomalo");
    const killsMutaformaEl = document.getElementById("footer-kills-mutaforma");
    const lossesEl = document.getElementById("footer-losses");

    const moralePct = Math.max(0, Math.min(100, Number(GAME_STATE.xpMoraleState.moralePct * 10) || 0));
    const level = levelFromXP(GAME_STATE.xpMoraleState.xp);
    const kills = GAME_STATE.missionState?.kills || {};
    const missionId = (GAME_STATE.missionState?.curIndex ?? 0) + 1;
    const missionStats = GAME_STATE.missionStats?.[missionId] || {};

    if (moraleEl) moraleEl.textContent = `${Math.round(moralePct)}%`;
    if (levelEl) levelEl.textContent = `Lv. ${level}`;
    if (killsPuroEl) killsPuroEl.textContent = String(kills.Puro ?? 0);
    if (killsAnomaloEl) killsAnomaloEl.textContent = String(kills.Anomalo ?? 0);
    if (killsMutaformaEl) killsMutaformaEl.textContent = String(kills.Mutaforma ?? 0);
    if (lossesEl) lossesEl.textContent = String(missionStats.losses ?? 0);
    renderFooterAvatars();
}

export function initFooterListeners() {
    // === BIND pulsanti ===
    document.querySelectorAll(".bbtn").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.target;

            if (target === "xp") {
                if (APP_STATE.gameMode === "multiplayer") return;
                // Usa data-xp (valori reali); se assente, fallback a 10 XP
                const deltaXP = parseInt(btn.dataset.xp || "10", 10);
                addXP(deltaXP);
            } else if (target === "morale") {
                if (APP_STATE.gameMode === "multiplayer") return;
                const deltaPct = parseInt(btn.dataset.delta || "0", 10);
                addMorale(deltaPct);
            }
        });
    });
    renderFooterAvatars();

}
