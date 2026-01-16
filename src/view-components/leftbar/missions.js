import { GAME_STATE, DB } from "../../core/data.js";
import { APP_STATE } from "../../core/app-state.js";
import { scheduleSave } from '../../game-business-logic/game-sync.js';
import { capitalizeFirstLetter, clamp } from "../../game-business-logic/utils.js";
import { addLongPress, showCardDetail } from "../../ui-components/ui-helpers.js";
import { log } from "./log.js";
import { clearGrid } from "../grid/grid.js";
import { playBg } from "../audio/audio.js";
import { resetMissionEffectsAllUnits } from "../../game-business-logic/entity/entity.js";
import { addMorale, addXP, refreshFooterTracker } from "../footer/footer.js";
import { stopTimer, renderTimerUI, resetTimer } from "../header/header.js";
import showDeathScreen from '../../game-business-logic/effects/deathOverlay.js';
import showVictoryScreen from '../../game-business-logic/effects/victoryOverlay.js';

function getMissionElements() {
    return {
        elMissionNumTop: document.getElementById('m-num'),
        elMissionNumCard: document.querySelector('#missione-corrente #mc-num'),
        elMissionCardWrap: document.getElementById('mission-panel')
    };
}

function ensureMissionCardSkeleton(card) {
    if (!card) return;
    const hasHead = card.querySelector('.mission-head');
    if (hasHead) return;

    card.innerHTML = `


    <div id="mission-head" class="mission-head mission-card">
      <p class="mission-title">
        <strong>#<span id="mc-num"></span> — <span id="mc-title"></span></strong>
      </p>
      <ul id="mc-brief" class="mission-brief"></ul>
      <p id="mc-reward" class="mission-reward"></p>
    </div>

    <div class="mission-stats">
      <div class="msn-badge"><span class="lbl">Uccisioni</span><span id="msn-kills">0</span></div>
      <div class="msn-badge"><span class="lbl">Perdite</span><span id="msn-losses">0</span></div>
      <div class="msn-badge"><span class="lbl">Tentativi</span><span id="msn-attempts">0</span></div>
      <div class="msn-badge"><span class="lbl">Round</span><span id="msn-round">0</span></div>
    </div>

    <div class="mission-subtitle">Squadra</div>
    <ul id="msn-squad" class="msn-squad"></ul>

    <div class="mission-subtitle">Eventi attivati</div>
    <ul id="msn-evlist" class="msn-list"></ul>

    <div class="mission-subtitle">Effetti attivi</div>
    <div id="msn-evactive" class="msn-chips"></div>
  `;
}

// ===== MissionStats – stato per missione e renderer pannello =====
function getCurrentMissionId() {
    return GAME_STATE?.missionState?.curIndex + 1;
}
// chiamala all'avvio missione
export function missionStatsBumpAttempt() {
    const ms = ensureMissionStats();
    ms.attempts++;
    scheduleSave?.('mission');
    renderMissionPanel();
}
export function loadMissions() {
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
    scheduleSave('mission');
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
    scheduleSave?.('mission');
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
    refreshFooterTracker();

    renderSquadStatus();

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

function renderSquadStatus() {
    const list = document.getElementById('msn-squad');
    if (!list) return;

    const ONLINE_THRESHOLD_MS = 90000;
    const players = Array.isArray(APP_STATE.roomPlayers) ? APP_STATE.roomPlayers : [];
    const roster = Array.isArray(GAME_STATE.alliesRoster) ? GAME_STATE.alliesRoster : [];
    const hasRoster = roster.length > 0;
    if (players.length === 0 && !hasRoster) {
        list.innerHTML = '<li class="msn-squad-item is-empty">— squadra non disponibile —</li>';
        return;
    }

    const now = Date.now();
    const rows = hasRoster ? roster : players.map(p => ({ owner_id: p.user_id, role: p.is_commander ? 'commander' : 'recruit' }));
    const rosterIds = new Set(roster.map(u => u.id));
    const unitIndex = Array.isArray(DB.ALLIES)
        ? new Map(DB.ALLIES.map(u => [u.id, u]))
        : new Map();
    list.innerHTML = rows.map(entry => {
        const player = players.find(p => p.user_id === entry.owner_id) || {};
        const entryUnit = entry?.id ? (unitIndex.get(entry.id) || entry) : null;
        const playerUnit = player.unit_code ? unitIndex.get(player.unit_code) : null;
        const unit = entryUnit || playerUnit;
        const unitLabel = unit?.name || entryUnit?.name || playerUnit?.name || 'Unità sconosciuta';
        const unitAvatar = unit?.img || unit?.avatar || entryUnit?.img || playerUnit?.img || 'assets/units/default.png';
        const last = player.last_seen ? new Date(player.last_seen).getTime() : 0;
        const online = last && now - last < ONLINE_THRESHOLD_MS;
        const baseName = player.nickname || entry.owner_nickname || player.user_id?.slice(0, 8) || 'Giocatore';
        const isMe = entry.owner_id && APP_STATE.user?.id && entry.owner_id === APP_STATE.user.id;
        const name = isMe ? `${baseName} (Tu)` : baseName;
        const roleLabel = player.is_commander || entry.role === 'commander' ? 'Comandante' : 'Recluta';
        const statusClass = online ? 'msn-squad-dot--online' : 'msn-squad-dot--offline';
        const statusLabel = online ? 'Online' : 'Offline';
        const allUnits = [
            player.commander_code,
            ...(Array.isArray(player.recruit_codes) ? player.recruit_codes : [])
        ].filter(Boolean);
        const extraUnits = allUnits.filter(code => !rosterIds.has(code));
        const extraList = extraUnits
            .map(code => {
                const extraUnit = unitIndex.get(code);
                const extraLabel = extraUnit?.name || code;
                const extraAvatar = extraUnit?.img || extraUnit?.avatar || 'assets/units/default.png';
                return `
          <li class="msn-squad-extra-item">
            <span class="msn-squad-avatar"><img src="${extraAvatar}" alt=""></span>
            <span class="msn-squad-extra-name">${extraLabel}</span>
          </li>`;
            })
            .join('');
        const extraBlock = extraUnits.length
            ? `
        <details class="msn-squad-extra">
          <summary>Altre unità (${extraUnits.length})</summary>
          <ul>${extraList}</ul>
        </details>
      `
            : '';
        return `
      <li class="msn-squad-item">
        <span class="msn-squad-dot ${statusClass}" title="${statusLabel}"></span>
        <span class="msn-squad-status">${statusLabel}</span>
        <span class="msn-squad-player">
          <span class="msn-squad-name">${name}</span>
          <span class="msn-squad-unit">
            <span class="msn-squad-avatar"><img src="${unitAvatar}" alt=""></span>
            <span class="msn-squad-unit-name">${unitLabel}</span>
          </span>
        </span>
        <span class="msn-squad-role">${roleLabel}</span>
        ${extraBlock}
      </li>`;
    }).join('');
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

    const { elMissionNumTop, elMissionNumCard, elMissionCardWrap } = getMissionElements();
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
    GAME_STATE.missionState.timerAnchorAt = null;
    GAME_STATE.missionState.timerAnchorSec = total;
    GAME_STATE.missionState.ticking = false;
    stopTimer({ skipSave: true });
    renderMissionUI();
    renderTimerUI();
    scheduleSave('mission');
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
