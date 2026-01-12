// game/game-sync.js
import { supabase } from '../core/supabase/supabaseClient.js'
import { APP_STATE, GAME_STATE, gameAPI, snapshot } from '../core/app-state.js'
import { loadLocalGameState, saveLocalGameState } from '../core/data.js'
import { getTurnInfo, initTurnTracker, startTurnCountdown, renderTurnTracker } from './turn-tracker.js';
import { initEventManager, consumeGameEvents } from './event-manager.js';
import { renderMissionUI } from '../view-components/leftbar/missions.js';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function stopPresenceHeartbeat() {
  if (APP_STATE.presenceTimerId) {
    clearInterval(APP_STATE.presenceTimerId);
    APP_STATE.presenceTimerId = null;
  }
}

export async function initGameForRoom(roomId, mePlayerRow, allPlayers, room) {

  APP_STATE.roomId = roomId
  APP_STATE.roomPlayers = Array.isArray(allPlayers) ? allPlayers : [];
  APP_STATE.gameMode = 'multiplayer'

  const isLeader =
    room.leader_id === APP_STATE.user.id ||
    room.created_by === APP_STATE.user.id

  APP_STATE.isGameDriver = isLeader

  await loadOrInitGameState(roomId, isLeader, allPlayers)
  bindGameRealtime(roomId)
  bindPresenceRealtime(roomId)
  startPresenceHeartbeat(roomId)
  gameAPI.renderGameFromState()
  initEventManager();
  await tryAutoStartMission(room);

  // Turn tracker
  initTurnTracker();
  startTurnCountdown();
}

export function initGameForSinglePlayer() {
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

  const saved = loadLocalGameState()
  if (saved) {
    gameAPI.resetGameState()
    gameAPI.applyLoadedState(saved)
  } else {
    gameAPI.resetGameState()
    saveLocalGameState(snapshot())
  }

  gameAPI.renderGameFromState()
  initEventManager()
  initTurnTracker()
  startTurnCountdown()
}

async function fetchRoomPlayers(roomId) {
  if (!roomId) return [];
  const { data, error } = await supabase
    .from('room_players')
    .select('user_id, last_seen, ready_to_field, unit_code, ready_unit, is_commander, nickname, commander_code, recruit_codes')
    .eq('room_id', roomId)
    .order('user_id', { ascending: true });

  if (error) {
    console.error('Errore caricando room_players:', error);
    return [];
  }

  return data || [];
}

function bindPresenceRealtime(roomId) {
  if (APP_STATE.gameMode === 'single') return;
  if (APP_STATE.presenceChannel) {
    APP_STATE.presenceChannel.unsubscribe();
    APP_STATE.presenceChannel = null;
  }

  const handlePresenceChange = async () => {
    const players = await fetchRoomPlayers(roomId);
    APP_STATE.roomPlayers = players;
    renderMissionUI();
  };

  const channel = supabase
    .channel(`room_players:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'room_players',
        filter: `room_id=eq.${roomId}`
      },
      handlePresenceChange
    )
    .subscribe();

  APP_STATE.presenceChannel = channel;
}

export function startPresenceHeartbeat(roomId) {
  stopPresenceHeartbeat()
  APP_STATE.presenceTimerId = setInterval(async () => {
    if (!APP_STATE.user?.id || !roomId) return;
    try {
      await supabase
        .from('room_players')
        .update({ last_seen: new Date().toISOString() })
        .eq('room_id', roomId)
        .eq('user_id', APP_STATE.user.id);
    } catch (err) {
      console.warn('Aggiornamento presenza fallito:', err);
    }
  }, 3000);
}

async function loadOrInitGameState(roomId, isDriver, players = []) {
  // 1) Primo tentativo di lettura
  let { data: existing, error } = await supabase
    .from('room_game_state')
    .select('state_json')
    .eq('room_id', roomId)
    .maybeSingle()

  if (error) {
    console.error('Errore caricando game_state:', error)
  }

  console.log('existing state', existing);

  // Se esiste già → lo carico e basta
  if (existing && existing.state_json) {
    gameAPI.resetGameState()
    gameAPI.applyLoadedState(existing.state_json)
    return
  } else if (isDriver) {

    // 2) Non esiste ancora, se sono il driver lo creo io

    gameAPI.resetGameState()
    const defaultState = createDefaultGameState(players)

    console.log('sto per salvare il default', defaultState);

    const { error: errInsert } = await supabase
      .from('room_game_state')
      .upsert({
        room_id: roomId,
        state_json: defaultState,
        updated_by: APP_STATE.user.id
      })

    if (errInsert) {
      console.error('Errore creando game_state:', errInsert)
    } else {
      gameAPI.applyLoadedState(defaultState)
    }
    return
  }

  // 3) Non esiste, e NON sono il driver:
  //    aspetto che il driver lo crei (retry veloce)
  const MAX_RETRY = 10      // ~5s se interval=500ms
  const INTERVAL = 500


  for (let i = 0; i < MAX_RETRY; i++) {
    await delay(INTERVAL)

    const { data: again, error: errAgain } = await supabase
      .from('room_game_state')
      .select('state_json')
      .eq('room_id', roomId)
      .maybeSingle()

    if (errAgain) {
      console.error('Errore nel retry game_state:', errAgain)
      break
    }

    if (again && again.state_json) {

      gameAPI.resetGameState()
      gameAPI.applyLoadedState(again.state_json)
      return
    }
  }

  console.warn('Timeout in attesa del game_state: uso stato locale di default')
  gameAPI.resetGameState()
}



function createDefaultGameState(players = []) {
  // clone profondo del template
  const base = snapshot();
  base.stateVersion = 1;
  base.stateUpdatedAt = Date.now();

  // prendo tutti i codici unità scelti dai player pronti
  const selectedUnitCodes = players
    .filter(p => p.unit_code && p.ready_unit)
    .map(p => p.unit_code)

  if (Array.isArray(base.alliesPool)) {
    const chosenAllies = base.alliesPool
      .filter(u => selectedUnitCodes.includes(u.id))
      .map(u => {
        // Trovo il giocatore che usa questa unità
        const owner = players.find(p => p.unit_code === u.id)

        return {
          ...u,
          owner_id: owner?.user_id || null,
          owner_nickname: owner?.nickname || null
        }
      })

    base.alliesRoster = chosenAllies
  }

  // ====== TURNO GIOCATORI ======
  // Ordine turni: commander prima, poi reclute (puoi cambiare logica)
  const order = players
    .filter(p => p.unit_code && p.ready_unit)
    .sort((a, b) => {
      // se hai flag is_commander sul row:
      if (!!a.is_commander === !!b.is_commander) return 0;
      return a.is_commander ? -1 : 1;
    })
    .map(p => p.user_id);

  base.turnState = {
    order,
    currentIndex: 0,
    currentPlayerId: order[0] || null
  };
  base.turnEngine = { ...(base.turnEngine || {}), autoStarted: false };

  return base
}

async function tryAutoStartMission(room) {
  if (!room || room.status !== 'in_game') return;
  if (GAME_STATE.turnEngine?.phase !== 'idle') return;
  if (GAME_STATE.turnEngine?.autoStarted) return;
  const { isMyTurn } = getTurnInfo();
  if (!isMyTurn) return;

  GAME_STATE.turnEngine.autoStarted = true;
  try {
    await GAME_STATE.turnEngine.startPhase('idle');
  } finally {
    scheduleSave('auto-start');
  }
}


function bindGameRealtime(roomId) {
  if (APP_STATE.gameMode === 'single') return;
  if (APP_STATE.gameChannel) {
    APP_STATE.gameChannel.unsubscribe()
    APP_STATE.gameChannel = null
  }

  const handleChange = (payload) => {
    const newState = payload.new?.state_json
    if (!newState) return
    const incomingVersion = newState.stateVersion ?? 0
    const localVersion = GAME_STATE.stateVersion ?? 0
    const incomingUpdatedAt = newState.stateUpdatedAt ?? 0
    const localUpdatedAt = GAME_STATE.stateUpdatedAt ?? 0
    if (incomingVersion < localVersion) return
    if (incomingVersion === localVersion && incomingVersion !== 0 && incomingUpdatedAt <= localUpdatedAt) {
      return
    }

    gameAPI.resetGameState()
    console.log('handleChange new state', newState);
    gameAPI.applyLoadedState(newState)
    // se la tua render accetta (state, me, players) puoi passare solo state
    gameAPI.renderGameFromState(GAME_STATE)
    consumeGameEvents();

    // ogni update dal DB → aggiorno il tracker & riavvio countdown
    renderTurnTracker();
    startTurnCountdown();
  }

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
        console.log('Realtime game_state subscribed for room', roomId)
        resyncGameState(roomId)
      }
    })

  APP_STATE.gameChannel = channel
}

async function resyncGameState(roomId) {
  if (!roomId) return
  const { data, error } = await supabase
    .from('room_game_state')
    .select('state_json')
    .eq('room_id', roomId)
    .maybeSingle()

  if (error) {
    console.error('Errore resync game_state:', error)
    return
  }

  const newState = data?.state_json
  if (!newState) return
  const incomingVersion = newState.stateVersion ?? 0
  const localVersion = GAME_STATE.stateVersion ?? 0
  const incomingUpdatedAt = newState.stateUpdatedAt ?? 0
  const localUpdatedAt = GAME_STATE.stateUpdatedAt ?? 0
  if (incomingVersion < localVersion) return
  if (incomingVersion === localVersion && incomingVersion !== 0 && incomingUpdatedAt <= localUpdatedAt) return

  gameAPI.resetGameState()
  gameAPI.applyLoadedState(newState)
  gameAPI.renderGameFromState(GAME_STATE)
  consumeGameEvents()
  renderTurnTracker()
  startTurnCountdown()
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

export const scheduleSave = (arg) => {
  console.log('from scheduleSave', arg);
  if (APP_STATE.gameMode === 'single') {
    debouncedSaveLocalState();
    return;
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

  // === NUOVA PROTEZIONE ===
  const { isMyTurn } = getTurnInfo();
  if (!isMyTurn) {
    console.warn("Tentativo di salvataggio fuori turno bloccato.");
    return;
  }

  const nextVersion = (GAME_STATE.stateVersion ?? 0) + 1;
  GAME_STATE.stateVersion = nextVersion;
  GAME_STATE.stateUpdatedAt = Date.now();
  const newState = snapshot();

  console.log('sto per salvare al pushGameState', newState);
  const { error } = await supabase
    .from('room_game_state')
    .update({
      state_json: newState,
      updated_at: new Date().toISOString(),
      updated_by: APP_STATE.user.id
    })
    .eq('room_id', APP_STATE.roomId)

  if (error) {
    console.error('Errore aggiornando game_state:', error)
  }
}
