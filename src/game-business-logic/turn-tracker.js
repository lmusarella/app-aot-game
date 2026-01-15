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
let elStatus = null;
let elHeaderTurnPlayer = null;
let elSetupProgress = null;
let elSetupProgressLabel = null;
let elSetupProgressBar = null;
let elSetupProgressFill = null;
let elFabDock = null;

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
  elStatus = document.getElementById('turn-status');
  elHeaderTurnPlayer = document.getElementById('header-turn-player');
  elSetupProgress = document.getElementById('setup-progress');
  elSetupProgressLabel = document.getElementById('setup-progress-label');
  elSetupProgressBar = document.querySelector('#setup-progress .setup-progress-bar');
  elSetupProgressFill = document.getElementById('setup-progress-fill');
  elFabDock = document.querySelector('.fab-dock');
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
  if (!elContainer) return;
  refreshHeaderUI();

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

  elPlayer.textContent = displayName;
  if (elHeaderTurnPlayer) {
    elHeaderTurnPlayer.textContent = `Turno: ${displayName}`;
  }
  elOrder.textContent = order.length
    ? `${currentIndex + 1}/${order.length}`
    : '';

  elTimer.textContent = `${remainingSec}s`;

  elContainer.classList.toggle('my-turn', isMyTurn);
  if (elFabDock) {
    const shouldHideFabs = APP_STATE.gameMode === 'multiplayer' && !isMyTurn;
    elFabDock.classList.toggle('is-hidden', shouldHideFabs);
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

  if (elStatus) {
    if (APP_STATE.gameMode !== 'multiplayer') {
      elStatus.textContent = '';
      elStatus.hidden = true;
    } else if (phaseReady) {
      elStatus.hidden = false;
      if (phase === 'move_phase') {
        elStatus.textContent = 'Fase movimento completata. In attesa della prossima fase.';
      } else {
        elStatus.textContent = isMyTurn
          ? 'Tutti hanno completato la fase. Puoi proseguire.'
          : 'Fase completata. In attesa del comandante.';
      }
    } else if (phase === 'setup' && order.length > 0) {
      const progressText = `Setup completato: ${Math.min(phaseDoneByCount, order.length)}/${order.length}.`;
      elStatus.hidden = false;
      elStatus.textContent = isMyTurn
        ? `${progressText} È il tuo turno.`
        : `${progressText} In attesa del tuo turno.`;
    } else if (!isMyTurn) {
      elStatus.hidden = false;
      if (displayName && displayName !== '—') {
        elStatus.textContent = `È il turno di ${displayName}.`;
      } else {
        elStatus.textContent = 'È il turno di un altro giocatore.';
      }
    } else {
      elStatus.hidden = false;
      elStatus.textContent = 'È il tuo turno.';
    }
  }

  if (elSetupProgress) {
    const shouldShowSetup = APP_STATE.gameMode === 'multiplayer';
    if (!shouldShowSetup) {
      elSetupProgress.hidden = true;
    } else {
      const totalPlayers = players.length;
      const donePlayers = Math.min(phaseDoneByCount, totalPlayers);
      const pct = totalPlayers > 0 ? Math.round((donePlayers / totalPlayers) * 100) : 0;
      if (elSetupProgressLabel) {
        const turnLabel = isMyTurn
          ? 'È il tuo turno.'
          : (displayName && displayName !== '—' ? `È il turno di ${displayName}.` : 'È il turno di un altro giocatore.');
        elSetupProgressLabel.textContent = `Giocatori: ${totalPlayers} · ${turnLabel}`;
      }
      if (elSetupProgressFill) {
        elSetupProgressFill.style.width = `${pct}%`;
      }
      if (elSetupProgressBar) {
        elSetupProgressBar.setAttribute('aria-valuenow', String(pct));
      }
      elSetupProgress.hidden = false;
    }
  }

  const turnChanged = currentPlayerId && currentPlayerId !== lastTurnPlayerId;
  if (turnChanged) {
    elContainer.classList.add('turn-changed');
    if (turnChangeTimerId) {
      clearTimeout(turnChangeTimerId);
    }
    turnChangeTimerId = setTimeout(() => {
      elContainer.classList.remove('turn-changed');
      turnChangeTimerId = null;
    }, 600);
    if (APP_STATE.gameMode === 'multiplayer') {
      showTurnChangeEffect({ isMyTurn, displayName });
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
  remainingSec = turnDurationSec;
  renderTurnTracker();

  turnTimerId = setInterval(() => {
    remainingSec--;
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
