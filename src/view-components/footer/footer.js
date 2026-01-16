import { GAME_STATE, DB } from "../../core/data.js";
import { APP_STATE } from "../../core/app-state.js";
import { scheduleSave } from '../../game-business-logic/game-sync.js';
import { log } from "../leftbar/log.js";
import { levelFromXP, levelProgressPercent, getMalusRow } from '../../game-business-logic/utils.js';
import { renderBonusMalus } from '../leftbar/mods.js';
import showDeathScreen from '../../game-business-logic/effects/deathOverlay.js';
import { focusUnitOnField } from '../grid/grid.js';
import { hideTooltip, showTooltipAt } from '../../ui-components/ui-helpers.js';

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

function buildFooterAvatarTooltip(player, rosterIds, unitIndex) {
    const { units, playerName } = getNonMissionUnitsForPlayer(player, rosterIds, unitIndex);
    if (!units.length) {
        return `
            <div class="tt-card footer-squad-tooltip">
                <div class="tt-title">${playerName}</div>
                <div class="tt-badge">Unità fuori missione</div>
                <p class="footer-squad-empty">Nessuna unità fuori missione.</p>
            </div>
        `;
    }
    const listItems = units.map(unit => {
        const unitName = unit?.name || unit?.id || 'Unità sconosciuta';
        const unitAvatar = unit?.img || unit?.avatar || 'assets/units/default.png';
        return `
            <li class="msn-squad-item">
                <span class="msn-squad-unit">
                    <span class="msn-squad-avatar"><img src="${unitAvatar}" alt=""></span>
                    <span class="msn-squad-unit-name">${unitName}</span>
                </span>
            </li>
        `;
    }).join('');
    return `
        <div class="tt-card footer-squad-tooltip">
            <div class="tt-title">${playerName}</div>
            <div class="tt-badge">Unità fuori missione</div>
            <ul class="msn-squad">${listItems}</ul>
        </div>
    `;
}

export function renderFooterAvatars() {
    const container = document.querySelector('.footer-avatars');
    if (!container) return;
    const players = Array.isArray(APP_STATE.roomPlayers) ? APP_STATE.roomPlayers : [];
    const myId = APP_STATE.user?.id || null;
    if (!players.length || !myId) {
        container.classList.add('is-hidden');
        container.innerHTML = '';
        return;
    }

    const roster = Array.isArray(GAME_STATE.alliesRoster) ? GAME_STATE.alliesRoster : [];
    const rosterIds = new Set(roster.map(u => u.id));
    const unitIndex = Array.isArray(DB.ALLIES)
        ? new Map(DB.ALLIES.map(u => [u.id, u]))
        : new Map();

    const playersById = new Map(players.map(player => [player.user_id, player]));
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
            return `
                <button class="footer-avatar-btn" type="button" data-player-id="${player.user_id}"
                    data-unit-id="${unit?.id || ''}"
                    aria-label="Apri squadra fuori missione di ${displayName}" title="${displayName}">
                    <img src="${avatarSrc}" alt="Avatar ${displayName}">
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
            const tooltipHtml = buildFooterAvatarTooltip(player, rosterIds, unitIndex);
            showTooltipAt(tooltipHtml, { x: e.clientX, y: e.clientY });
            const unitId = btn.dataset.unitId;
            if (unitId) {
                focusUnitOnField(unitId);
            }
        });
    });
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
