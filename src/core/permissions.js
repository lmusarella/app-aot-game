import { APP_STATE } from './app-state.js';
import { log } from '../view-components/leftbar/log.js';

const COMMANDER_SELECTOR = '[data-commander-only]';

export function isCommander() {
  if (APP_STATE.gameMode === 'multiplayer') {
    const myId = APP_STATE.user?.id;
    const me = APP_STATE.roomPlayers?.find(player => player.user_id === myId);
    return !!me?.is_commander;
  }
  return APP_STATE.role === 'commander' || APP_STATE.isGameDriver;
}

export function guardCommanderAction(actionLabel) {
  if (isCommander()) return true;
  const label = actionLabel ? ` ${actionLabel}` : ' questa azione';
  log(`Solo il comandante può${label}.`, 'warning', 3000, true);
  return false;
}

export function applyCommanderAccess() {
  const allowed = isCommander();
  document.querySelectorAll(COMMANDER_SELECTOR).forEach(el => {
    el.classList.toggle('is-commander-locked', !allowed);
    el.setAttribute('aria-disabled', String(!allowed));
  });
}
