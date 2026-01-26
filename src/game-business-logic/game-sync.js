// game/game-sync.js
import { supabase } from '../core/supabase/supabaseClient.js'
import { APP_STATE, GAME_STATE, gameAPI, snapshot } from '../core/app-state.js'
import { loadLocalGameState, saveLocalGameState, markGameStateDirty } from '../core/data.js'
import { getTurnInfo, initTurnTracker, startTurnCountdown, renderTurnTracker } from './turn-tracker.js';
import { initEventManager } from './event-manager.js';
import { seedWallRows } from './entity/entity.js';
import { bindPresenceRealtime, startPresenceHeartbeat, stopPresenceHeartbeat } from './sync/presence.js';
import { loadOrInitGameState } from './sync/state-loader.js';
import { bindGameRealtime } from './sync/realtime.js';
import { scheduleRenderGameState, shouldRenderGameState, shouldRenderTurn } from './sync/render-scheduler.js';

export { bindPresenceRealtime, startPresenceHeartbeat, stopPresenceHeartbeat };

export async function initGameForRoom(roomId, mePlayerRow, allPlayers, room) {

  APP_STATE.roomId = roomId
  APP_STATE.roomPlayers = Array.isArray(allPlayers) ? allPlayers : [];
  APP_STATE.gameMode = 'multiplayer'

  const userId = APP_STATE.user?.id ?? null;
  const isLeader =
    !!userId &&
    (room.leader_id === userId ||
      room.created_by === userId)

  APP_STATE.isGameDriver = isLeader

  gameAPI.resetGameState();
  gameAPI.renderGameFromState();

  await loadOrInitGameState(roomId, isLeader, allPlayers)
  bindGameRealtime(roomId)
  bindPresenceRealtime(roomId)
  startPresenceHeartbeat(roomId)
  gameAPI.renderGameFromState()
  initEventManager();

  // Turn tracker
  initTurnTracker();
  startTurnCountdown();
}

export function initGameForSinglePlayer({ forceReset = false, render = true } = {}) {
  APP_STATE.roomId = null
  APP_STATE.roomPlayers = []
  APP_STATE.isGameDriver = true
  APP_STATE.gameMode = 'single'

  if (APP_STATE.gameChannel) {
    APP_STATE.gameChannel.unsubscribe()
    APP_STATE.gameChannel = null
  }
  if (APP_STATE.presenceChannel) {
    APP_STATE.presenceChannel.unsubscribe()
    APP_STATE.presenceChannel = null
  }
  stopPresenceHeartbeat()

  const saved = forceReset ? null : loadLocalGameState()
  if (saved) {
    console.info('[game-sync] applyLoadedState from local save', {
      stateVersion: saved?.stateVersion ?? 0
    });
    gameAPI.resetGameState()
    gameAPI.applyLoadedState(saved)
  } else {
    gameAPI.resetGameState()
    seedWallRows()
    saveLocalGameState(snapshot())
  }

  if (render) {
    gameAPI.renderGameFromState()
    initEventManager()
    initTurnTracker()
    startTurnCountdown()
  }
}


function debounce(fn, ms = 400) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

// crea UNA SOLA volta la versione debounced
const debouncedPushGameState = debounce(pushGameState, 500);
const debouncedSaveLocalState = debounce(saveLocalState, 500);

const pendingSaveOptions = {
  force: false
};

const SAVE_SECTION_MAP = {
  'mission-timer': ['missionState'],
  'mod': ['modRolls'],
  'mission': ['missionState', 'missionStats'],
  'log': ['logs', 'events'],
  'fab': ['hand', 'decks', 'alliesPool', 'alliesRoster', 'giantsPool', 'giantsRoster'],
  'grid': ['spawns', 'alliesRoster', 'giantsRoster', 'walls'],
  'setup-moves': ['setupMoves', 'turnState'],
  'move-phase': ['spawns', 'turnState'],
  'phase-change': ['turnEngineState', 'turnState', 'missionState'],
  'footer-message': ['logs', 'events', 'xpMoraleState'],
  'footer': ['logs', 'events', 'xpMoraleState'],
  'turn-timer': ['turnState'],
  'phase-turn': ['turnState'],
  'entity': ['spawns', 'alliesRoster', 'giantsRoster', 'giantsPool', 'alliesPool', 'walls', 'logs']
};

export const scheduleSave = (arg, opts = {}) => {
  const sections = SAVE_SECTION_MAP[arg] ?? 'all';
  markGameStateDirty(sections);
  if (APP_STATE.gameMode === 'single') {
    debouncedSaveLocalState();
    return;
  }
  console.info('[game-sync] scheduleSave', {
    source: arg,
    force: !!opts.force,
    phase: GAME_STATE.turnEngine?.phase ?? null,
    isMyTurn: getTurnInfo().isMyTurn
  });
  if (opts.force) {
    pendingSaveOptions.force = true;
  }
  // chiama il debounced
  debouncedPushGameState();
};

function saveLocalState() {
  const newState = snapshot();
  saveLocalGameState(newState);
}

async function pushGameState() {
  if (APP_STATE.gameMode === 'single') return;
  if (!APP_STATE.roomId) return;
  const userId = APP_STATE.user?.id ?? null;
  if (!userId) {
    console.warn('[game-sync] pushGameState skipped: user missing');
    return;
  }
  const { force } = pendingSaveOptions;
  pendingSaveOptions.force = false;
  console.info('[game-sync] pushGameState start', {
    roomId: APP_STATE.roomId,
    force,
    phase: GAME_STATE.turnEngine?.phase ?? null
  });

  // === NUOVA PROTEZIONE ===
  const turnState = GAME_STATE.turnState;
  if (!turnState || !Array.isArray(turnState.order) || turnState.order.length === 0 || !turnState.currentPlayerId) {
    if (!force) {
      console.warn("Turno non inizializzato: salvataggio multiplayer bloccato.");
      console.info('[game-sync] pushGameState skipped', { reason: 'turn-not-initialized' });
      return;
    }
  }
  const { isMyTurn } = getTurnInfo();
  const phase = GAME_STATE.turnEngine?.phase;
  const isSetupPhase = phase === 'setup' || phase === 'move_phase';
  const isMarkedDone = Array.isArray(turnState?.phaseDoneBy)
    ? turnState.phaseDoneBy.includes(APP_STATE.user?.id)
    : false;
  const allowOutOfTurnSave = isSetupPhase && isMarkedDone;
  if (!isMyTurn && !force && !allowOutOfTurnSave) {
    console.warn("Tentativo di salvataggio fuori turno bloccato.");
    console.info('[game-sync] pushGameState skipped', { reason: 'out-of-turn' });
    return;
  }

  const nextVersion = (GAME_STATE.stateVersion ?? 0) + 1;
  GAME_STATE.stateVersion = nextVersion;
  GAME_STATE.stateUpdatedAt = Date.now();
  const newState = snapshot();
  const { error } = await supabase
    .from('room_game_state')
    .update({
      state_json: newState,
      updated_at: new Date().toISOString(),
      updated_by: userId
    })
    .eq('room_id', APP_STATE.roomId)

  if (error) {
    console.error('Errore aggiornando game_state:', error)
  }
}

export function resyncLocalRender() {
  if (shouldRenderGameState(GAME_STATE)) {
    scheduleRenderGameState(() => gameAPI.renderGameFromState(GAME_STATE));
  }
  if (shouldRenderTurn(GAME_STATE.turnState)) {
    renderTurnTracker();
    startTurnCountdown();
  }
}
