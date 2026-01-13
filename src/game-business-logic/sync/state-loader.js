import { supabase } from '../../core/supabase/supabaseClient.js';
import { APP_STATE, gameAPI, snapshot } from '../../core/app-state.js';
import { GAME_STATE } from '../../core/data.js';
import { seedWallRows } from '../entity/entity.js';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function loadOrInitGameState(roomId, isDriver, players = []) {
  // 1) Primo tentativo di lettura
  let { data: existing, error } = await supabase
    .from('room_game_state')
    .select('state_json')
    .eq('room_id', roomId)
    .maybeSingle();

  if (error) {
    console.error('Errore caricando game_state:', error);
  }

  // Se esiste già → lo carico e basta
  if (existing && existing.state_json) {
    gameAPI.resetGameState();
    gameAPI.applyLoadedState(existing.state_json);
    if (isDriver) {
      await repairMultiplayerState(roomId, players);
    }
    return;
  } else if (isDriver) {
    // 2) Non esiste ancora, se sono il driver lo creo io
    gameAPI.resetGameState();
    seedWallRows();
    const defaultState = createDefaultGameState(players);

    const { error: errInsert } = await supabase
      .from('room_game_state')
      .upsert({
        room_id: roomId,
        state_json: defaultState,
        updated_by: APP_STATE.user.id
      });

    if (errInsert) {
      console.error('Errore creando game_state:', errInsert);
    } else {
      gameAPI.applyLoadedState(defaultState);
    }
    return;
  }

  // 3) Non esiste, e NON sono il driver:
  //    aspetto che il driver lo crei (retry veloce)
  const MAX_RETRY = 10;      // ~5s se interval=500ms
  const INTERVAL = 500;

  for (let i = 0; i < MAX_RETRY; i++) {
    await delay(INTERVAL);

    const { data: again, error: errAgain } = await supabase
      .from('room_game_state')
      .select('state_json')
      .eq('room_id', roomId)
      .maybeSingle();

    if (errAgain) {
      console.error('Errore nel retry game_state:', errAgain);
      break;
    }

    if (again && again.state_json) {
      gameAPI.resetGameState();
      gameAPI.applyLoadedState(again.state_json);
      return;
    }
  }

  console.warn('Timeout in attesa del game_state: uso stato locale di default');
  gameAPI.resetGameState();
}

function createDefaultGameState(players = []) {
  // clone profondo del template
  const base = snapshot();
  base.stateVersion = 1;
  base.stateUpdatedAt = Date.now();

  base.alliesRoster = buildAlliesRoster(base.alliesPool, players);
  base.turnState = buildTurnState(players);
  base.turnEngine = { ...(base.turnEngine || {}), autoStarted: false };

  return base;
}

function buildAlliesRoster(alliesPool = [], players = []) {
  if (!Array.isArray(alliesPool)) return [];
  const selectedUnitCodes = players
    .filter(p => p.unit_code && p.ready_unit)
    .map(p => p.unit_code);

  return alliesPool
    .filter(u => selectedUnitCodes.includes(u.id))
    .map(u => {
      const owner = players.find(p => p.unit_code === u.id);
      return {
        ...u,
        owner_id: owner?.user_id || null,
        owner_nickname: owner?.nickname || null
      };
    });
}

function buildTurnState(players = []) {
  const order = players
    .filter(p => p.unit_code && p.ready_unit)
    .sort((a, b) => {
      if (!!a.is_commander === !!b.is_commander) return 0;
      return a.is_commander ? -1 : 1;
    })
    .map(p => p.user_id);

  return {
    order,
    currentIndex: 0,
    currentPlayerId: order[0] || null
  };
}

async function repairMultiplayerState(roomId, players = []) {
  if (!roomId || players.length === 0) return;

  const turnState = GAME_STATE.turnState || {};
  const needsTurnInit = !Array.isArray(turnState.order) || turnState.order.length === 0 || !turnState.currentPlayerId;
  const needsRosterInit = Array.isArray(GAME_STATE.alliesRoster) ? GAME_STATE.alliesRoster.length === 0 : true;
  const shouldResetToCommander = GAME_STATE.turnEngine?.phase === 'idle';

  let changed = false;
  const rebuiltTurn = buildTurnState(players);
  if (needsTurnInit) {
    GAME_STATE.turnState = { ...turnState, ...rebuiltTurn };
    changed = true;
  }

  if (shouldResetToCommander && rebuiltTurn.order?.length) {
    const currentId = GAME_STATE.turnState?.currentPlayerId;
    const commanderId = rebuiltTurn.order[0];
    if (currentId !== commanderId) {
      GAME_STATE.turnState = {
        ...(GAME_STATE.turnState || {}),
        order: rebuiltTurn.order,
        currentIndex: 0,
        currentPlayerId: commanderId
      };
      changed = true;
    }
  }

  if (needsRosterInit) {
    const roster = buildAlliesRoster(GAME_STATE.alliesPool || [], players);
    if (roster.length > 0) {
      GAME_STATE.alliesRoster = roster;
      changed = true;
    }
  }

  if (!changed) return;

  GAME_STATE.stateVersion = (GAME_STATE.stateVersion ?? 0) + 1;
  GAME_STATE.stateUpdatedAt = Date.now();

  const newState = snapshot();
  const { error } = await supabase
    .from('room_game_state')
    .update({
      state_json: newState,
      updated_at: new Date().toISOString(),
      updated_by: APP_STATE.user.id
    })
    .eq('room_id', roomId);

  if (error) {
    console.error('Errore aggiornando game_state (repair):', error);
  }
}
