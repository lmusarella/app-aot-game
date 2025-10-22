import { GAME_STATE, scheduleSave, DB } from "./data.js";
import { capitalizeFirstLetter, clamp } from "./utils.js";
import { addLongPress, showCardDetail, ensureMissionCardSkeleton } from "./ui.js";
import { log } from "./log.js";
import { clearGrid } from "./grid.js";
import { playBg } from "./audio.js";
import { resetMissionEffectsAllUnits } from "./entity.js";
import { addMorale, addXP } from "./footer.js";
import { stopTimer, renderTimerUI, resetTimer } from "./header.js";
import showDeathScreen from './effects/deathOverlay.js';
import showVictoryScreen from './effects/victoryOverlay.js';

const elMissionNumTop = document.getElementById('m-num');       // header (numero)
const elMissionNumCard = document.querySelector('#missione-corrente #mc-num'); // card (numero)
const elMissionCardWrap = document.getElementById('mission-panel');        // container card

// ===== MissionStats – stato per missione e renderer pannello =====
function getCurrentMissionId() {
    return GAME_STATE?.missionState?.curIndex + 1;
}
// chiamala all'avvio missione
export function missionStatsBumpAttempt() {
    const ms = ensureMissionStats();
    ms.attempts++;
    scheduleSave?.();
    renderMissionPanel();
}
export function loadMissions() {
    setMissionByIndex(GAME_STATE.missionState.curIndex);
    renderMissionPanel();
}

export function missionStatsSetRound(n) {
    const ms = ensureMissionStats();
    ms.round = Math.max(1, Number(n || 0));
    renderMissionPanel();
}
function ensureMissionStats() {
    const id = getCurrentMissionId();
    if (!GAME_STATE.missionStats) GAME_STATE.missionStats = {};
    if (!GAME_STATE.missionStats[id]) {
        GAME_STATE.missionStats[id] = {
            attempts: 0,
            kills: 0,
            losses: 0,
            round: 0,
            events: [] // {id,name,summary,sign(+1/-1/0),startRound,durationRounds}
        };
    }
    return GAME_STATE.missionStats[id];
}


export function missionStatsOnUnitDeath(unit) {
    const ms = ensureMissionStats();
    if (!unit) return;
    if (unit.role === 'enemy') ms.kills++;
    else if (unit.role === 'recruit' || unit.role === 'commander') ms.losses++;
    scheduleSave();
    renderMissionPanel();
}

// quando attivi un EVENTO
export function missionStatsRecordEvent(card, { durationRounds = Infinity, sign = 1 } = {}) {
    const ms = ensureMissionStats();
    const r = ms.round ?? 1;
    const now = new Date();
    const hhmm = now.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
    });
    ms.events.push({
        id: card?.id || ('evt_' + Math.random().toString(36).slice(2)),
        name: card?.type === 'event' ? 'Carta Evento' : 'Carta '.concat(capitalizeFirstLetter(card?.type)),
        summary: card.name || '',
        sign: Math.sign(sign | 0),
        startRound: r,
        durationRounds: (durationRounds === Infinity ? Infinity : Math.max(1, durationRounds | 0)),
        hhmm: hhmm,
        detail: card
    });
    scheduleSave?.();
    renderMissionPanel();
}


// ====== RENDER ======
function renderMissionPanel() {
    const root = document.getElementById('mission-card');
    if (!root) return;

    const ms = ensureMissionStats();

    // numeri
    const kEl = document.getElementById('msn-kills');
    const lEl = document.getElementById('msn-losses');
    const aEl = document.getElementById('msn-attempts');
    const rEl = document.getElementById('msn-round');
    if (kEl) kEl.textContent = String(ms.kills || 0);
    if (lEl) lEl.textContent = String(ms.losses || 0);
    if (aEl) aEl.textContent = String(ms.attempts || 0);
    if (rEl) rEl.textContent = String(ms.round || 0);

    // timeline eventi (cronologica)
    const list = document.getElementById('msn-evlist');
    if (list) {
        const evs = (ms.events || []).slice().sort((a, b) => {
            if (a.startRound !== b.startRound) return a.startRound - b.startRound;
            return (a._ts || 0) - (b._ts || 0);
        });
        list.innerHTML = evs.map(e => {
            return `
       <li class="msn-item" data-card-id="${e.cardId || e.id}" tabindex="0" role="button">
  <span class="when">${e.hhmm} - R${e.startRound}</span>
  <span class="name">${e.name}</span>
  <span class="desc">${e.summary}</span>
</li>`;
        }).join('') || `<li class="msn-item" style="opacity:.7">— nessuna carta attivata —</li>`;
    }

    bindMissionListHandlers();
}

function bindMissionListHandlers() {
    const list = document.getElementById('msn-evlist');
    if (!list || list._bound) return;
    list._bound = true;


    addLongPress(list, {
        onLongPress: (ev) => {
            const trigger = ev.target.closest('.msn-detail, .msn-item, .name, .desc');
            if (!trigger) return;
            const li = ev.target.closest('.msn-item');
            const id = li?.dataset.cardId;
            if (id) {
                const ms = ensureMissionStats();
                const event = ms?.events.find(ev => ev?.detail.id === id);
                showCardDetail(event?.detail.type, event?.detail);
            }
        }
    });
}
// Ordine d'importanza (alto -> basso)
const HIERARCHY = ["Mutaforma", "Anomalo", "Puro"];

/**
 * Calcola il progresso per ciascun item della lista `objectives`,
 * allocando le kill per priorità (prima il proprio tier, poi i tier inferiori).
 * 
 * @param {Array<{type:string, num:number}>} objectives
 * @param {{[type:string]: number}} kills  // es: { Puro: 3, Anomalo: 1, Mutaforma: 0 }
 * @returns {{ perItem:number[], perType:{[type:string]:number} }}
 */
function computeObjectiveProgress(objectives, kills) {
    // 1) Richieste per tipo aggregate
    const req = { Puro: 0, Anomalo: 0, Mutaforma: 0 };
    for (const o of objectives) req[o.type] = (req[o.type] || 0) + o.num;

    // 2) Fulfillment tracker per tipo (quanti obiettivi soddisfatti per ciascun tipo, a prescindere dalla fonte)
    const fulfilled = { Puro: 0, Anomalo: 0, Mutaforma: 0 };
    // 3) Rimanenze richieste per tipo
    const left = { ...req };

    // Helper: consuma un certo numero di kill seguendo un percorso di “downgrade”
    // path esempio per Mutaforma: ["Mutaforma","Anomalo","Puro"]
    const consume = (count, path) => {
        let rem = count;
        for (const t of path) {
            if (!rem) break;
            const take = Math.min(rem, left[t]);
            if (take > 0) {
                left[t] -= take;
                fulfilled[t] += take;
                rem -= take;
            }
        }
    };

    // 4) Applica le kill per priorità corretta:
    //    - Mutaforma: copre Mutaforma -> Anomalo -> Puro
    //    - Anomalo:   copre Anomalo   -> Puro
    //    - Puro:      copre Puro
    consume(kills?.Mutaforma || 0, ["Mutaforma", "Anomalo", "Puro"]);
    consume(kills?.Anomalo || 0, ["Anomalo", "Puro"]);
    consume(kills?.Puro || 0, ["Puro"]);

    // 5) Ripartisci il fulfilled di ciascun tipo sulle righe degli obiettivi, nell’ordine dato,
    //    così ogni riga mostra il suo “cur / num” coerente.
    const remainingForType = { ...fulfilled };
    const perItem = objectives.map(o => {
        const cur = Math.min(o.num, remainingForType[o.type] || 0);
        remainingForType[o.type] = Math.max(0, (remainingForType[o.type] || 0) - cur);
        return cur;
    });

    return { perItem, perType: fulfilled };
}


export function renderMissionUI() {
    const m = DB.MISSIONS[GAME_STATE.missionState.curIndex];
    const num = m?.id ?? (GAME_STATE.missionState.curIndex + 1);
    const title = m?.title ?? 'Missione';
    const objectives = Array.isArray(m?.objectives) ? m.objectives : [];
    const reward = m?.reward ?? { morale: 0, xp: 0 };
    const event = m?.event;

    if (elMissionNumTop) elMissionNumTop.textContent = String(num);
    if (elMissionNumCard) elMissionNumCard.textContent = String(num);

    const card = elMissionCardWrap?.querySelector('#mission-card');
    if (!card) return;

    // 1) prepara lo scheletro SOLO se manca (no reset)
    ensureMissionCardSkeleton(card);

    // 2) aggiorna SOLO i campi testuali
    const numEl = card.querySelector('#mc-num');
    const titleEl = card.querySelector('#mc-title');
    const briefEl = card.querySelector('#mc-brief');
    const rewardEl = card.querySelector('#mc-reward');

    if (numEl) numEl.textContent = String(num);
    if (titleEl) titleEl.textContent = title;

    if (briefEl) {
        const kills = GAME_STATE.missionState?.kills || {}; // es: { Puro: 2, Anomalo: 1, Mutaforma: 1 }
        const prog = computeObjectiveProgress(objectives, kills); // { perItem: [...], perType: {...} }

        briefEl.innerHTML = objectives.map((li, idx) =>
            `<li>
       Uccidi ${li.num} Giganti di tipo ${li.type}
       ➔ ${prog.perItem[idx]} / ${li.num} 💀
     </li>`
        ).join('');
    }
    if (rewardEl) {
        const parts = [];
        if (reward.morale) parts.push(`+${reward.morale} Morale`);
        if (reward.xp) parts.push(`+${reward.xp} XP`);
        rewardEl.textContent = parts.length ? `Ricompensa: ${parts.join(', ')}` : 'Ricompensa: —';
    }

    // (opzionale) se vuoi mostrare l’evento corrente in testa, aggiungi un <p id="mc-event"> nel skeleton e aggiorna qui:
    const evEl = card.querySelector('#mc-event');
    if (evEl) evEl.textContent = event ? `Evento: ${event}` : '';

    // 3) riallinea contatori/timeline/chip senza toccare lo stato
    renderMissionPanel();

}
// Imposta missione corrente (per indice nell’array)
export function setMissionByIndex(idx) {
    idx = clamp(idx, 0, DB.MISSIONS.length - 1);
    GAME_STATE.missionState.curIndex = idx;

    const m = DB.MISSIONS[idx];
    // Timer: totale = timerSec (o 1200)
    const total = Number(m?.timerSec) > 0 ? Math.floor(m.timerSec) : 1200;
    GAME_STATE.missionState.timerTotalSec = total;
    GAME_STATE.missionState.remainingSec = total;
    stopTimer();
    renderMissionUI();
    renderTimerUI();
    scheduleSave();
}

export async function completeMission(reason) {
    resetTimer();

    const m = DB.MISSIONS[GAME_STATE.missionState.curIndex];
    const missioneFallita = m.objectives.some(missione => GAME_STATE.missionState.kills[missione.type] < missione.num);
    if (missioneFallita && reason === 'cancel-button') {
        log(`Missione #${GAME_STATE.missionState.curIndex + 1} Fallita!`, 'error');
        const death = showDeathScreen({
            text: `MISSIONE FALLITA`,
            //subtext: 'Premi un tasto per continuare',
            effect: 'chroma',       // 'none' | 'glitch' | 'chroma'
            skullOpacity: 0.13,
            skullScale: 1.0,
            blur: 2,
            allowDismiss: false,   // click/tasto per chiudere
            autoDismissMs: 3000,  // chiudi dopo 3s (opzionale)
        });
    } else {
        log(`Missione #${GAME_STATE.missionState.curIndex + 1} completata!`, 'success');
        const victory = showVictoryScreen({
            text: 'MISSIONE COMPLETATA',
            subtext: ``,
            confetti: true,
            autoDismissMs: 3000  // opzionale
        });

        const reward = m?.reward ?? { morale: 0, xp: 0 };
        addMorale(reward.morale);
        addXP(reward?.xp)
        setMissionByIndex(GAME_STATE.missionState.curIndex + 1);
        resetMissionEffectsAllUnits();
    }

    GAME_STATE.missionState.kills = {
        Puro: 0,
        Anomalo: 0,
        Mutaforma: 0
    };
    GAME_STATE.missionStats[GAME_STATE.missionState.curIndex] = {
        attempts: 0,
        kills: 0,
        losses: 0,
        round: 0,
        events: [] // {id,name,summary,sign(+1/-1/0),startRound,durationRounds}
    };

    renderMissionUI();
    renderMissionPanel();

    await clearGrid();
    await playBg('./assets/sounds/risorsa_audio_avvio_app.mp3');
}