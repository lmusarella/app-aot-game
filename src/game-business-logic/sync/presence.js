import { supabase } from '../../core/supabase/supabaseClient.js';
import { APP_STATE } from '../../core/app-state.js';
import { renderMissionUI } from '../../view-components/leftbar/missions.js';
import { renderTurnTracker } from '../turn-tracker.js';

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

export function bindPresenceRealtime(roomId) {
  if (APP_STATE.gameMode === 'single') return;
  if (APP_STATE.presenceChannel) {
    APP_STATE.presenceChannel.unsubscribe();
    APP_STATE.presenceChannel = null;
  }

  const handlePresenceChange = async () => {
    const players = await fetchRoomPlayers(roomId);
    APP_STATE.roomPlayers = players;
    renderMissionUI();
    renderTurnTracker();
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
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        handlePresenceChange();
      }
    });

  APP_STATE.presenceChannel = channel;
}

export function stopPresenceHeartbeat() {
  if (APP_STATE.presenceTimerId) {
    clearInterval(APP_STATE.presenceTimerId);
    APP_STATE.presenceTimerId = null;
  }
}

export function startPresenceHeartbeat(roomId) {
  stopPresenceHeartbeat();
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
