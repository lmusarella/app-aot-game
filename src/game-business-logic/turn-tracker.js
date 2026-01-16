// header/turn-tracker.js
import { APP_STATE, GAME_STATE } from '../core/app-state.js';
import { DB } from '../core/data.js';
import { scheduleSave } from './game-sync.js';
import { refreshHeaderUI } from '../view-components/header/header.js';
import { renderStartButton } from './phases/phase-ui.js';
import { isCommander } from '../core/permissions.js';
import showWarningC from './effects/warningOverlayC.js';

const DEFAULT_TURN_DURATION_SEC = 60; // ⏱ durata turno (configurabile)

let turnTimerId = null;
let remainingSec = DEFAULT_TURN_DURATION_SEC;
let lastTurnPlayerId = null;
let turnChangeTimerId = null;

let elContainer = null;
let elPlayer = null;
let elOrder = null;
let elTimer = null;
let elHeaderTurnPlayer = null;
let elPlayerAvatar = null;
let elPhase = null;
let elPhasePercent = null;
let elPhaseBar = null;
let elPhaseFill = null;
let elFabDock = null;

const SETUP_MOVE_LIMIT = 3;
const TURN_SYNC_GRACE_MS = 250;

function getSetupPlayerKey() {
  return APP_STATE.user?.id || 'local';
}

function getSetupMovesRemaining() {
  const key = getSetupPlayerKey();
  const entry = GAME_STATE.setupMoves?.[key];
  const remaining = Number(entry?.remaining ?? SETUP_MOVE_LIMIT);
  return Math.max(0, remaining);
}

function getTurnRemainingSec(turnState) {
  const turnDurationSec = DB?.SETTINGS?.missionDefaults?.turnDurationSec ?? DEFAULT_TURN_DURATION_SEC;
  if (APP_STATE.gameMode !== 'multiplayer') {
    return Math.max(0, remainingSec);
  }
  const startedAt = turnState?.turnStartedAt;
  if (!startedAt) return turnDurationSec;
  const elapsedMs = Math.max(0, Date.now() - startedAt - TURN_SYNC_GRACE_MS);
  const elapsedSec = Math.floor(elapsedMs / 1000);
  return Math.max(0, turnDurationSec - elapsedSec);
}

function showTurnChangeEffect({ isMyTurn, displayName }) {
  if (!displayName || displayName === '—') return;
  if (isMyTurn) {
    showWarningC({
      text: 'È IL TUO TURNO',
      subtext: 'Puoi agire ora.',
      theme: 'green',
      ringAmp: 1.0,
      autoDismissMs: 2500
    });
    return;
  }
  showWarningC({
    text: `TURNO DI ${displayName.toUpperCase()}`,
    subtext: 'Attendi la tua fase.',
    theme: 'blue',
    ringAmp: 1.0,
    autoDismissMs: 2500
  });
}

function ensureTurnElements() {
  if (elContainer) return;
  elContainer = document.getElementById('turn-tracker');
  elPlayer = document.getElementById('turn-player');
  elOrder = document.getElementById('turn-order');
  elTimer = document.getElementById('turn-timer');
  elHeaderTurnPlayer = document.getElementById('header-turn-player');
  elPlayerAvatar = document.getElementById('turn-player-avatar');
  elPhase = document.getElementById('turn-phase');
  elPhasePercent = document.getElementById('turn-phase-percent');
  elPhaseBar = document.querySelector('.turn-progress-bar');
  elPhaseFill = document.getElementById('turn-phase-fill');
  elFabDock = document.querySelector('.fab-dock');
}

function buildTurnStatusText({ phase, phaseReady, commanderActive, isMyTurn, displayName, order, phaseDoneByCount }) {
  if (APP_STATE.gameMode !== 'multiplayer') return '';
  if (phase === 'idle') {
    if (commanderActive) {
      return 'Sei il comandante. Avvia la missione quando siete pronti.';
    }
    return 'Attendi che il comandante avvii la missione.';
  }
  if (phaseReady) {
    if (phase === 'move_phase') {
      return 'Fase movimento completata. In attesa della prossima fase.';
    }
    return isMyTurn
      ? 'Tutti hanno completato la fase. Puoi proseguire.'
      : 'Fase completata. In attesa del comandante.';
  }
  if (phase === 'setup' && order.length > 0) {
    const progressText = `Setup completato: ${Math.min(phaseDoneByCount, order.length)}/${order.length}.`;
    if (isMyTurn) {
      const remaining = getSetupMovesRemaining();
      return `${progressText} È il tuo turno. Trascina la tua unità nelle prime due file davanti alle mura, poi muoviti di un esagono adiacente alla volta. Movimenti rimasti: ${remaining}/${SETUP_MOVE_LIMIT}.`;
    }
    return `${progressText} In attesa del tuo turno.`;
  }
  if (!isMyTurn) {
    if (displayName && displayName !== '—') {
      return `È il turno di ${displayName}.`;
    }
    return 'È il turno di un altro giocatore.';
  }
  return 'È il tuo turno.';
}

export function getTurnInfo() {
  const ts = GAME_STATE.turnState || {};
  const order = ts.order || [];
  const idx = ts.currentIndex ?? 0;
  const currentPlayerId = ts.currentPlayerId || order[idx] || null;
  const myId = APP_STATE.user?.id || null;
  const hasTurnInfo = order.length > 0 && currentPlayerId;

  return {
    order,
    currentIndex: idx,
    currentPlayerId,
    isMyTurn: hasTurnInfo ? (myId && currentPlayerId === myId) : true
  };
}

function buildTurnOrder(players = []) {
  return players
    .filter(p => p.unit_code && p.ready_unit)
    .sort((a, b) => {
      if (!!a.is_commander === !!b.is_commander) return 0;
      return a.is_commander ? -1 : 1;
    })
    .map(p => p.user_id);
}

function getCommanderOwnerId(players = []) {
  const commanderUnit = GAME_STATE.alliesRoster?.find(u => u.role === 'commander');
  if (commanderUnit?.owner_id) return commanderUnit.owner_id;
  const commanderPlayer = players.find(p => p.is_commander);
  return commanderPlayer?.user_id || null;
}

function normalizeTurnOrder(order = [], commanderId, resetToCommander) {
  let next = order.slice();
  if (commanderId) {
    const idx = next.indexOf(commanderId);
    if (idx === -1) {
      next = [commanderId, ...next];
    } else if (resetToCommander && idx > 0) {
      next = next.slice(idx).concat(next.slice(0, idx));
    }
  }
  return next;
}

export function ensureMultiplayerTurnOrder({ resetToCommander = false } = {}) {
  if (APP_STATE.gameMode !== 'multiplayer') return false;

  const ts = GAME_STATE.turnState || {};
  const players = Array.isArray(APP_STATE.roomPlayers) ? APP_STATE.roomPlayers : [];
  let order = Array.isArray(ts.order) ? ts.order.slice() : [];
  if (order.length === 0) {
    order = buildTurnOrder(players);
  }
  const commanderId = getCommanderOwnerId(players);
  order = normalizeTurnOrder(order, commanderId, resetToCommander);

  if (order.length === 0) return false;

  const sameOrder = Array.isArray(ts.order) && ts.order.length === order.length && ts.order.every((id, idx) => id === order[idx]);
  const changed = !sameOrder || (resetToCommander && ts.currentPlayerId !== order[0]);

  if (!sameOrder) {
    ts.order = order;
  }
  if (resetToCommander) {
    ts.currentIndex = 0;
    ts.currentPlayerId = order[0] || null;
  }

  GAME_STATE.turnState = ts;
  return changed;
}

export function advanceTurn() {
  const ts = GAME_STATE.turnState;
  if (!ts || !Array.isArray(ts.order) || ts.order.length === 0) return;

  ts.currentIndex = (ts.currentIndex + 1) % ts.order.length;
  ts.currentPlayerId = ts.order[ts.currentIndex];
}

export function initTurnTracker() {
  renderTurnTracker();
}

/**
 * Da chiamare ogni volta che cambia GAME_STATE.turnState
 * oppure quando ricevi un nuovo game_state da realtime.
 */
export function renderTurnTracker() {
  ensureTurnElements();
  refreshHeaderUI();
  if (APP_STATE.gameMode === 'multiplayer' && elContainer) {
    elContainer.classList.remove('is-hidden');
  }

  const { order, currentIndex, currentPlayerId, isMyTurn } = getTurnInfo();
  const phase = GAME_STATE.turnEngine?.phase ?? GAME_STATE.turnState?.phase ?? 'idle';
  const round = GAME_STATE.turnEngine?.round ?? 0;
  const phaseReady = !!GAME_STATE.turnState?.phaseReady;
  const phaseDoneByCount = Array.isArray(GAME_STATE.turnState?.phaseDoneBy)
    ? GAME_STATE.turnState.phaseDoneBy.length
    : 0;
  const commanderActive = isCommander();

  // giocatori dalla stanza (salvati in APP_STATE quando entri nel game)
  const players = APP_STATE.roomPlayers || [];
  const currentPlayer = players.find(p => p.user_id === currentPlayerId);

  const displayName =
    currentPlayer?.nickname ||
    currentPlayer?.user_id?.slice(0, 6) ||
    (currentPlayerId ? currentPlayerId.slice(0, 6) : '—');

  if (elPlayer) {
    elPlayer.textContent = displayName;
  }
  if (elPlayerAvatar) {
    const rosterUnit = GAME_STATE.alliesRoster?.find(u => u.owner_id === currentPlayerId);
    const unitFromDb = !rosterUnit && currentPlayer?.unit_code
      ? DB?.ALLIES?.find(u => u.id === currentPlayer.unit_code)
      : null;
    const unit = rosterUnit || unitFromDb;
    elPlayerAvatar.src = unit?.img || unit?.avatar || 'assets/img/logo.jpg';
    elPlayerAvatar.alt = displayName ? `Avatar ${displayName}` : 'Avatar giocatore';
  }
  if (elHeaderTurnPlayer) {
    elHeaderTurnPlayer.textContent = `Turno: ${displayName}`;
  }
  if (elOrder) {
    elOrder.textContent = order.length
      ? `${currentIndex + 1}/${order.length}`
      : '';
  }

  remainingSec = getTurnRemainingSec(GAME_STATE.turnState);
  if (elTimer) {
    elTimer.textContent = `${remainingSec}s`;
  }
  if (elPhase) {
    const phaseLabels = {
      idle: 'Attesa',
      setup: 'Setup',
      event_mission: 'Evento missione',
      event_card: 'Pesca evento',
      round_start: 'Inizio round',
      move_phase: 'Movimento',
      attack_phase: 'Combattimento',
      end_round: 'Fine round'
    };
    elPhase.textContent = phaseLabels[phase] ?? phase;
  }
  if (elPhasePercent && elPhaseBar && elPhaseFill) {
    const safeTotal = Math.max(0, order.length);
    const progressPct = safeTotal
      ? Math.min(100, Math.round((phaseDoneByCount / safeTotal) * 100))
      : 0;
    elPhasePercent.textContent = `${progressPct}%`;
    elPhaseBar.setAttribute('aria-valuenow', String(progressPct));
    elPhaseFill.style.width = `${progressPct}%`;
  }

  if (elContainer) {
    elContainer.classList.toggle('my-turn', isMyTurn);
  }
  if (elFabDock) {
    const isMultiplayer = APP_STATE.gameMode === 'multiplayer';
    const shouldHideByTurn = isMultiplayer && !isMyTurn;
    elFabDock.querySelectorAll('.fab').forEach((fab) => {
      const isSingleplayerOnly = fab.classList.contains('fab-singleplayer');
      const hideForMode = isMultiplayer && isSingleplayerOnly;
      const hideForTurn = shouldHideByTurn && !fab.classList.contains('fab-static');
      const shouldHide = hideForMode || hideForTurn;
      fab.classList.toggle('is-hidden', shouldHide);
      fab.classList.toggle('is-hidden-mp', hideForMode);
    });
  }

  const btnStart = document.getElementById('btn-start');
  if (btnStart) {
    renderStartButton(btnStart, {
      phase,
      round,
      isMultiplayer: APP_STATE.gameMode === 'multiplayer',
      isMyTurn,
      phaseReady,
      isCommander: commanderActive,
      currentPlayerName: displayName
    });
  }

  const phaseLabel = document.getElementById('phase-label');
  if (phaseLabel && APP_STATE.gameMode === 'multiplayer') {
    phaseLabel.textContent = buildTurnStatusText({
      phase,
      phaseReady,
      commanderActive,
      isMyTurn,
      displayName,
      order,
      phaseDoneByCount
    });
  }

  // setup progress UI removed; phase progress is shown in the turn tracker bar

  const turnChanged = currentPlayerId && currentPlayerId !== lastTurnPlayerId;
  if (turnChanged) {
    if (elContainer) {
      elContainer.classList.add('turn-changed');
    }
    if (turnChangeTimerId) {
      clearTimeout(turnChangeTimerId);
    }
    turnChangeTimerId = setTimeout(() => {
      if (elContainer) {
        elContainer.classList.remove('turn-changed');
      }
      turnChangeTimerId = null;
    }, 600);
    if (APP_STATE.gameMode === 'multiplayer' && phase !== 'idle') {
      showTurnChangeEffect({ isMyTurn, displayName });
    }
    if (APP_STATE.gameMode === 'multiplayer' && isMyTurn) {
      const ts = GAME_STATE.turnState || {};
      ts.turnStartedAt = Date.now();
      GAME_STATE.turnState = ts;
      scheduleSave('turn-timer', { force: true });
    }
  }

  if (currentPlayerId) {
    lastTurnPlayerId = currentPlayerId;
  }
}

/** Avvia il countdown per il turno corrente */
export function startTurnCountdown() {
  stopTurnCountdown(); // reset

  const turnDurationSec = DB?.SETTINGS?.missionDefaults?.turnDurationSec ?? DEFAULT_TURN_DURATION_SEC;
  remainingSec = APP_STATE.gameMode === 'multiplayer'
    ? getTurnRemainingSec(GAME_STATE.turnState)
    : turnDurationSec;
  renderTurnTracker();

  turnTimerId = setInterval(() => {
    remainingSec = APP_STATE.gameMode === 'multiplayer'
      ? getTurnRemainingSec(GAME_STATE.turnState)
      : remainingSec - 1;
    if (remainingSec < 0) remainingSec = 0;
    renderTurnTracker();

    if (remainingSec <= 0) {
      stopTurnCountdown();
    }
  }, 1000);
}

export function stopTurnCountdown() {
  if (turnTimerId) {
    clearInterval(turnTimerId);
    turnTimerId = null;
  }
}
