// core/turn-helpers.js
import { APP_STATE, GAME_STATE } from './app-state.js';

export function getTurnInfo() {
  const ts = GAME_STATE.turnState || {};
  const order = ts.order || [];
  const idx = ts.currentIndex ?? 0;
  const currentPlayerId = ts.currentPlayerId || order[idx] || null;
  const myId = APP_STATE.user?.id || null;

  return {
    order,
    currentIndex: idx,
    currentPlayerId,
    isMyTurn: myId && currentPlayerId === myId
  };
}

export function advanceTurn() {
  const ts = GAME_STATE.turnState;
  if (!ts || !Array.isArray(ts.order) || ts.order.length === 0) return;

  ts.currentIndex = (ts.currentIndex + 1) % ts.order.length;
  ts.currentPlayerId = ts.order[ts.currentIndex];
}
