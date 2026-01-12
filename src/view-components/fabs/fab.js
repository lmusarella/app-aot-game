import { log } from '../leftbar/log.js';
import { giantsPhaseMove, pickRandomTeam, spawnGiant } from '../../game-business-logic/entity/entity.js';
import { playSfx } from '../audio/audio.js';
import { hideTooltip } from '../../ui-components/ui.js';
import lightningStrike from '../../game-business-logic/effects/lightningStrike.js';
import { guardCommanderAction } from '../../core/permissions.js';
import { drawCard, resetDeckFromPool, reshuffleAllDiscards, updateFabDeckCounters } from './fab/decks.js';
import { openAlliesPicker } from './fab/allies-picker.js';
import { openHandOverlay, showDrawnCard } from './fab/hand-overlay.js';

const fabs = Array.from(document.querySelectorAll('.fab'));

function flash(el) {
    const old = el.style.boxShadow;
    el.style.boxShadow = '0 0 0 3px rgba(255,255,255,.25) inset, 0 0 18px rgba(255,0,0,.45)';
    setTimeout(() => el.style.boxShadow = old, 260);
}

export function closeAllFabs() { fabs.forEach(f => { f.classList.remove('open'); f.setAttribute('aria-expanded', 'false'); }); }
fabs.forEach(fab => {
    const mainBtn = fab.querySelector('.fab-main');
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
                flash(anchor);
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

export { drawCard, resetDeckFromPool, updateFabDeckCounters };
export { openAlliesPicker, showDrawnCard };
