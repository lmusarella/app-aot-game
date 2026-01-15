import { GAME_STATE, DB } from "../../core/data.js";
import { APP_STATE } from "../../core/app-state.js";
import { scheduleSave } from '../../game-business-logic/game-sync.js';
import { log } from "../leftbar/log.js";
import { levelFromXP, levelProgressPercent, getMalusRow } from '../../game-business-logic/utils.js';
import { renderBonusMalus } from '../leftbar/mods.js';
import showDeathScreen from '../../game-business-logic/effects/deathOverlay.js';

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
    if (xp.fill) xp.fill.style.width = pct + "%";
    if (xp.pct) xp.pct.textContent = Math.round(pct) + "%";
    if (xp.lvl) xp.lvl.textContent = "Lv. " + L;
    renderBonusMalus();
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
}

export function initFooterListeners() {
    // === BIND pulsanti ===
    document.querySelectorAll(".bbtn").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.target;

            if (target === "xp") {
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

}
