// header/turn-tracker.js
import { APP_STATE, GAME_STATE } from '../core/app-state.js';
import { scheduleSave } from './game-sync.js';

const TURN_DURATION_SEC = 60; // ⏱ durata turno (configurabile)

let turnTimerId = null;
let remainingSec = TURN_DURATION_SEC;

const elContainer = document.getElementById('turn-tracker');
const elPlayer = document.getElementById('turn-player');
const elOrder = document.getElementById('turn-order');
const elTimer = document.getElementById('turn-timer');

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
  if (!elContainer) return;

  const { order, currentIndex, currentPlayerId, isMyTurn } = getTurnInfo();

  // giocatori dalla stanza (salvati in APP_STATE quando entri nel game)
  const players = APP_STATE.roomPlayers || [];
  const currentPlayer = players.find(p => p.user_id === currentPlayerId);

  const displayName =
    currentPlayer?.nickname ||
    currentPlayer?.user_id?.slice(0, 6) ||
    '—';

  elPlayer.textContent = displayName;
  elOrder.textContent = order.length
    ? `${currentIndex + 1}/${order.length}`
    : '';

  elTimer.textContent = `${remainingSec}s`;

  elContainer.classList.toggle('my-turn', isMyTurn);
}

/** Avvia il countdown per il turno corrente */
export function startTurnCountdown() {
  stopTurnCountdown(); // reset

  remainingSec = TURN_DURATION_SEC;
  renderTurnTracker();

  turnTimerId = setInterval(() => {
    remainingSec--;
    if (remainingSec < 0) remainingSec = 0;
    renderTurnTracker();

    if (remainingSec <= 0) {
      stopTurnCountdown();

      // solo il giocatore di turno fa avanzare il turno + salva
      const { isMyTurn } = getTurnInfo();
      if (!isMyTurn) return;

      advanceTurn();
      scheduleSave('turn-timeout'); // salva nuovo turnState
    }
  }, 1000);
}

export function stopTurnCountdown() {
  if (turnTimerId) {
    clearInterval(turnTimerId);
    turnTimerId = null;
  }
}
