import { supabase } from '../../core/supabase/supabaseClient.js';
import { APP_STATE, gameAPI, snapshot } from '../../core/app-state.js';
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

  // prendo tutti i codici unità scelti dai player pronti
  const selectedUnitCodes = players
    .filter(p => p.unit_code && p.ready_unit)
    .map(p => p.unit_code);

  if (Array.isArray(base.alliesPool)) {
    const chosenAllies = base.alliesPool
      .filter(u => selectedUnitCodes.includes(u.id))
      .map(u => {
        // Trovo il giocatore che usa questa unità
        const owner = players.find(p => p.unit_code === u.id);

        return {
          ...u,
          owner_id: owner?.user_id || null,
          owner_nickname: owner?.nickname || null
        };
      });

    base.alliesRoster = chosenAllies;
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

  return base;
}
