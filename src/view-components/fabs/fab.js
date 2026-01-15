import { log } from '../leftbar/log.js';
import { giantsPhaseMove, pickRandomTeam, spawnGiant } from '../../game-business-logic/entity/entity.js';
import { playSfx } from '../audio/audio.js';
import { hideTooltip, openAccordionForRole, ensureModal } from '../../ui-components/ui-helpers.js';
import lightningStrike from '../../game-business-logic/effects/lightningStrike.js';
import { guardCommanderAction } from '../../core/permissions.js';
import { drawCard, resetDeckFromPool, reshuffleAllDiscards, updateFabDeckCounters } from './fab/decks.js';
import { openAlliesPicker } from './fab/allies-picker.js';
import { openHandOverlay, showDrawnCard } from './fab/hand-overlay.js';
import { APP_STATE } from '../../core/app-state.js';
import { DB, GAME_STATE } from '../../core/data.js';

let fabsInitialized = false;

const getFabs = () => Array.from(document.querySelectorAll('.fab'));

function flash(el) {
    const old = el.style.boxShadow;
    el.style.boxShadow = '0 0 0 3px rgba(255,255,255,.25) inset, 0 0 18px rgba(255,0,0,.45)';
    setTimeout(() => el.style.boxShadow = old, 260);
}

function buildNonMissionUnitsList() {
    const players = Array.isArray(APP_STATE.roomPlayers) ? APP_STATE.roomPlayers : [];
    const roster = Array.isArray(GAME_STATE.alliesRoster) ? GAME_STATE.alliesRoster : [];
    const rosterIds = new Set(roster.map(u => u.id));
    const unitIndex = Array.isArray(DB.ALLIES)
        ? new Map(DB.ALLIES.map(u => [u.id, u]))
        : new Map();
    const myId = APP_STATE.user?.id || null;
    const player = players.find(p => p.user_id === myId);

    if (!player || !myId) {
        return { playerName: null, units: [] };
    }

    const allUnits = [
        player.commander_code,
        ...(Array.isArray(player.recruit_codes) ? player.recruit_codes : [])
    ].filter(Boolean);

    const extraUnits = allUnits
        .filter(code => !rosterIds.has(code))
        .map(code => unitIndex.get(code) || { id: code, name: code, img: 'assets/units/default.png' });

    const playerName = player.nickname || player.user_id?.slice(0, 8) || 'Giocatore';
    return { playerName, units: extraUnits };
}

function openSquadListModal() {
    const { backdrop, modal, title, msg, btnCancel, btnConfirm, btnClose } = ensureModal();
    const { playerName, units } = buildNonMissionUnitsList();

    title.textContent = 'Unità fuori missione';
    btnConfirm.textContent = 'Chiudi';
    btnConfirm.classList.remove('danger');
    btnCancel.style.display = 'none';
    btnClose.style.display = '';

    if (!playerName) {
        msg.innerHTML = '<p>Giocatore non disponibile.</p>';
    } else if (!units.length) {
        msg.innerHTML = `<p>Nessuna unità fuori missione per ${playerName}.</p>`;
    } else {
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
        msg.innerHTML = `
            <p>Unità non in missione di ${playerName}:</p>
            <ul class="msn-squad">${listItems}</ul>
        `;
    }

    const close = () => {
        backdrop.classList.remove('show');
        modal.classList.remove('show');
        document.removeEventListener('keydown', onKey);
        backdrop.removeEventListener('click', onBackdrop);
        btnConfirm.onclick = null;
        btnClose.onclick = null;
    };

    const onKey = (e) => {
        if (e.key === 'Escape') close();
    };

    const onBackdrop = (e) => {
        if (e.target === backdrop) close();
    };

    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', onBackdrop);
    btnConfirm.onclick = close;
    btnClose.onclick = close;

    requestAnimationFrame(() => {
        backdrop.classList.add('show');
        modal.classList.add('show');
    });
}

export function closeAllFabs() {
    getFabs().forEach(f => {
        f.classList.remove('open');
        f.setAttribute('aria-expanded', 'false');
    });
}

export function initFabs() {
    if (fabsInitialized) return;
    fabsInitialized = true;

    getFabs().forEach(fab => {
        const mainBtn = fab.querySelector('.fab-main');
        if (!mainBtn) return;
        if (fab.classList.contains('fab-static')) return;
        mainBtn.addEventListener('click', (e) => {
            hideTooltip();
            e.stopPropagation();
            const willOpen = !fab.classList.contains('open');
            closeAllFabs();
            fab.classList.toggle('open', willOpen);
            fab.setAttribute('aria-expanded', String(willOpen));
        });
    });

    document.addEventListener('click', (e) => { if (!e.target.closest('.fab')) closeAllFabs(); });
    document.querySelector('#fab-hand .fab-main')?.addEventListener('click', (e) => {
        e.stopPropagation();
        hideTooltip();
        openHandOverlay();
    });
    document.querySelector('#fab-squad .fab-main')?.addEventListener('click', (e) => {
        e.stopPropagation();
        hideTooltip();
        if (APP_STATE.gameMode === 'multiplayer') {
            openSquadListModal();
            return;
        }
        openAccordionForRole('commander');
    });
    document.querySelectorAll('#fab-arruola .fab-option').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!guardCommanderAction('gestire la squadra')) return;
            const role = btn.dataset.role; // 'recruit' | 'commander' | 'random-team'

            if (role === 'random-team') {
                pickRandomTeam({ commanders: 1, recruits: 3 });
                closeAllFabs();
                return;
            }

            // flusso standard: picker manuale
            await openAlliesPicker(role);
            closeAllFabs();
        });
    });


    document.querySelectorAll('#fab-spawn .fab-option').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!guardCommanderAction('gestire la fase giganti')) return;
            const type = btn.dataset.type; // "Casuale" | "Puro" | "Anomalo" | "Mutaforma"
            if (type !== 'Movimento') {
                let ok = false;
                if (type === 'Casuale') ok = await spawnGiant();
                else ok = await spawnGiant(type);
                if (!ok) {
                    const anchor = document.querySelector('#fab-spawn .fab-main');
                    if (anchor) flash(anchor);
                } else {
                    lightningStrike();
                    setTimeout(() => lightningStrike({ angleDeg: 80 }), 140);
                    setTimeout(() => lightningStrike({ angleDeg: 100 }), 280);
                }
            } else {
                giantsPhaseMove();
            }

            closeAllFabs();
        });
    });
    document.querySelectorAll('#fab-event .fab-option').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!guardCommanderAction('gestire le carte')) return;
            const t = btn.dataset.ev; // "evento" | "consumabile"

            if (t === 'reshuffle') {
                // RIMESCOLA SCARTI (tutti i mazzi) dal FAB “Carte”          
                reshuffleAllDiscards();
                closeAllFabs();
                return;
            }

            if (t === 'showhand') {
                openHandOverlay();
                closeAllFabs();
                return;
            }

            const type = (t === 'evento') ? 'event' : 'consumable';
            const card = drawCard(type);

            if (!card) {
                log('Il mazzo è vuoto. Rimescola gli scarti o ricarica le carte.', 'warning');
                closeAllFabs();
                return;
            }
            log(`Pescata carta ${t}: "${card.name}".`);
            if (type === 'event') await playSfx('assets/sounds/carte/carta_evento.mp3', { volume: 0.3, loop: false });
            if (type === 'consumable') await playSfx('assets/sounds/carte/carta_consumabile.mp3');
            showDrawnCard(type, card);
            closeAllFabs();
        });
    });
}

export { drawCard, resetDeckFromPool, updateFabDeckCounters };
export { openAlliesPicker, showDrawnCard };
