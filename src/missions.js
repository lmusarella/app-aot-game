import { GAME_STATE, scheduleSave, DB } from "./data.js";
import { capitalizeFirstLetter, clamp } from "./utils.js";
import { addLongPress, showCardDetail, ensureMissionCardSkeleton } from "./ui.js";
import { log } from "./log.js";
import { clearGrid } from "./grid.js";
import { playBg } from "./audio.js";
import { resetMissionEffectsAllUnits } from "./entity.js";
import { addMorale, addXP } from "./footer.js";
import { stopTimer, renderTimerUI, resetTimer } from "./header.js";


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
        const kills = GAME_STATE.missionState?.kills || {};
        briefEl.innerHTML = objectives.map(li =>
            `<li>Uccidi ${li.num} Giganti di tipo ${li.type} ➔ ${kills[li.type] || 0} / ${li.num} 💀</li>`
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
    } else {
        log(`Missione #${GAME_STATE.missionState.curIndex + 1} completata!`, 'success');
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

    await clearGrid();
    await playBg('./assets/sounds/risorsa_audio_avvio_app.mp3');
}