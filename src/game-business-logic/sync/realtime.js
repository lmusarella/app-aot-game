import { supabase } from '../../core/supabase/supabaseClient.js';
import { APP_STATE, GAME_STATE, gameAPI } from '../../core/app-state.js';
import { consumeGameEvents } from '../event-manager.js';
import { renderTurnTracker, startTurnCountdown } from '../turn-tracker.js';
import { scheduleRenderGameState, shouldRenderGameState, shouldRenderTurn } from './render-scheduler.js';

const MAX_EVENTS = 50;

function mergeEvents(incoming = [], local = []) {
  const byId = new Map();
  const addEvent = (ev) => {
    if (!ev) return;
    const key = ev.id ?? `${ev.type ?? 'event'}-${ev.ts ?? 0}-${Math.random()}`;
    if (!byId.has(key)) {
      byId.set(key, ev);
    }
  };
  incoming.forEach(addEvent);
  local.forEach(addEvent);
  return Array.from(byId.values())
    .sort((a, b) => (a?.ts ?? 0) - (b?.ts ?? 0))
    .slice(-MAX_EVENTS);
}

export function bindGameRealtime(roomId) {
  if (APP_STATE.gameMode === 'single') return;
  if (APP_STATE.gameChannel) {
    APP_STATE.gameChannel.unsubscribe();
    APP_STATE.gameChannel = null;
  }

  const handleChange = (payload) => {
    const newState = payload.new?.state_json;
    if (!newState) return;
    const updatedBy = payload.new?.updated_by;
    if (updatedBy && APP_STATE.user?.id && updatedBy === APP_STATE.user.id) {
      return;
    }
    const incomingVersion = newState.stateVersion ?? 0;
    const localVersion = GAME_STATE.stateVersion ?? 0;
    const incomingUpdatedAt = newState.stateUpdatedAt ?? 0;
    const localUpdatedAt = GAME_STATE.stateUpdatedAt ?? 0;
    if (incomingVersion < localVersion) return;
    if (incomingVersion === localVersion && incomingVersion !== 0 && incomingUpdatedAt <= localUpdatedAt) {
      return;
    }

    const shouldRenderState = shouldRenderGameState(newState);
    const shouldRenderTurnState = shouldRenderTurn(newState.turnState);
    if (!shouldRenderState && !shouldRenderTurnState) {
      return;
    }

    const localEvents = Array.isArray(GAME_STATE.events) ? GAME_STATE.events.slice() : [];
    console.info('[realtime] applyLoadedState from change', {
      roomId,
      updatedBy,
      stateVersion: newState?.stateVersion ?? 0
    });
    gameAPI.resetGameState();
    gameAPI.applyLoadedState(newState);
    if (APP_STATE.gameMode === 'multiplayer' && localEvents.length) {
      GAME_STATE.events = mergeEvents(GAME_STATE.events, localEvents);
    }
    consumeGameEvents();

    if (shouldRenderState) {
      scheduleRenderGameState(() => gameAPI.renderGameFromState(GAME_STATE));
    }

    if (shouldRenderTurnState) {
      renderTurnTracker();
      startTurnCountdown();
    }
  };

  const channel = supabase
    .channel(`room_game_state:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'room_game_state',
        filter: `room_id=eq.${roomId}`
      },
      handleChange
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'room_game_state',
        filter: `room_id=eq.${roomId}`
      },
      handleChange
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {   
        resyncGameState(roomId);
      }
    });

  APP_STATE.gameChannel = channel;
}

export async function resyncGameState(roomId) {
  if (!roomId) return;
  const { data, error } = await supabase
    .from('room_game_state')
    .select('state_json')
    .eq('room_id', roomId)
    .maybeSingle();

  if (error) {
    console.error('Errore resync game_state:', error);
    return;
  }

  const newState = data?.state_json;
  if (!newState) return;
  const incomingVersion = newState.stateVersion ?? 0;
  const localVersion = GAME_STATE.stateVersion ?? 0;
  const incomingUpdatedAt = newState.stateUpdatedAt ?? 0;
  const localUpdatedAt = GAME_STATE.stateUpdatedAt ?? 0;
  if (incomingVersion < localVersion) return;
  if (incomingVersion === localVersion && incomingVersion !== 0 && incomingUpdatedAt <= localUpdatedAt) return;

  const shouldRenderState = shouldRenderGameState(newState);
  const shouldRenderTurnState = shouldRenderTurn(newState.turnState);
  if (!shouldRenderState && !shouldRenderTurnState) {
    return;
  }

  const localEvents = Array.isArray(GAME_STATE.events) ? GAME_STATE.events.slice() : [];
  console.info('[realtime] applyLoadedState from resync', {
    roomId,
    stateVersion: newState?.stateVersion ?? 0
  });
  gameAPI.resetGameState();
  gameAPI.applyLoadedState(newState);
  if (APP_STATE.gameMode === 'multiplayer' && localEvents.length) {
    GAME_STATE.events = mergeEvents(GAME_STATE.events, localEvents);
  }
  consumeGameEvents();

  if (shouldRenderState) {
    scheduleRenderGameState(() => gameAPI.renderGameFromState(GAME_STATE));
  }

  if (shouldRenderTurnState) {
    renderTurnTracker();
    startTurnCountdown();
  }
}
