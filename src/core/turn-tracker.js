// header/turn-tracker.js
import { APP_STATE } from './app-state.js';
import { getTurnInfo, advanceTurn } from './turn-helpers.js';
import { scheduleSave } from '../game/game-sync.js';

const TURN_DURATION_SEC = 60; // ⏱ durata turno (configurabile)

let turnTimerId = null;
let remainingSec = TURN_DURATION_SEC;

const elContainer = document.getElementById('turn-tracker');
const elPlayer = document.getElementById('turn-player');
const elOrder = document.getElementById('turn-order');
const elTimer = document.getElementById('turn-timer');

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
