import { GAME_STATE, scheduleSave, DB } from "./data.js";
import { log } from "./log.js";
import { levelFromXP, levelProgressPercent, getMalusRow } from './utils.js';
import { renderBonusMalus } from './mods.js'
import showDeathScreen from './effects/deathOverlay.js';

const xpDOM = {
    fill: document.getElementById("xp-fill"),
    pct: document.getElementById("xp-val"),
    lvl: document.getElementById("lvl-val"),
};

const moraleDOM = {
    fill: document.getElementById("morale-fill"),
    pct: document.getElementById("morale-val"),
};

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
    scheduleSave();
    // Cambio fascia malus?
    const prevBand = getMalusRow(prev);
    const nextBand = getMalusRow(next);
    if (prevBand?.text !== nextBand?.text) {
        if (nextBand) {
            // Entrata in nuova fascia
            const txt = nextBand.text ? `${nextBand.text}` : '';
            // Se morale scende, warning; se sale e alleggerisce il malus, info/success

            log(`${txt}`, nextBand.type);

            console.log('nextBand', next)
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
    scheduleSave();

    // Annunci di livello
    if (nextLevel > prevLevel) {
        for (let L = prevLevel + 1; L <= nextLevel; L++) {
            log(`Salito al livello ${L}!`, 'success');
            // evidenzia i bonus appena sbloccati (se presenti)
            const unlocked = DB.SETTINGS.bonusTable.filter(b => b.lvl === L);
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
    if (xpDOM.fill) xpDOM.fill.style.width = pct + "%";
    if (xpDOM.pct) xpDOM.pct.textContent = Math.round(pct) + "%";
    if (xpDOM.lvl) xpDOM.lvl.textContent = "Lv. " + L;
    renderBonusMalus();
}

export function refreshMoraleUI() {
    const pct = Math.max(0, Math.min(100, Number(GAME_STATE.xpMoraleState.moralePct * 10) || 0));
    
    if (moraleDOM.fill) moraleDOM.fill.style.width = pct + "%";
    if (moraleDOM.pct) moraleDOM.pct.textContent = Math.round(pct) + "%";
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
                const deltaPct = parseInt(btn.dataset.delta || "0", 10);
                addMorale(deltaPct);
            }
        });
    });

}
