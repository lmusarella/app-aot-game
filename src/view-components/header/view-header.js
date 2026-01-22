import { initHeaderListeners } from './header.js';
import { initPhasesListeners } from '../../game-business-logic/phases.js';
import { showTutorialPopupViaDialog, showScreen } from '../../ui-components/ui-helpers.js';
import { supabase } from '../../core/supabase/supabaseClient.js';
import { APP_STATE } from '../../core/app-state.js';
import { stopRoomPresence } from '../pages/room/room-ui.js';

export function initView() {
  initHeaderListeners();
  initPhasesListeners();

  const btn = document.getElementById('btn-tutorial');
  btn?.addEventListener('click', async (e) => {
    e.preventDefault();
    await showTutorialPopupViaDialog({ startIndex: 0, force: true });
  });

  const menu = document.getElementById('hdr-user-menu');
  menu?.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    e.preventDefault();

    const audioBtn = document.getElementById('btn-audio');
    const tutorialBtn = document.getElementById('btn-tutorial');
    const leaveBtn = document.getElementById('btn-leave-room');
    const menuToggle = document.getElementById('hdr-user-menu-toggle');
    menu.hidden = true;
    menuToggle?.setAttribute('aria-expanded', 'false');

    if (action === 'audio') {
      audioBtn?.click();
    } else if (action === 'tutorial') {
      tutorialBtn?.click();
    } else if (action === 'leave') {
      leaveBtn?.click();
    } else if (action === 'logout') {
      stopRoomPresence();
      await supabase.auth.signOut();
      APP_STATE.roomId = null;
      APP_STATE.role = null;
      APP_STATE.roomPlayers = [];
      APP_STATE.isGameDriver = false;
      APP_STATE.gameMode = null;
      showScreen('login');
    }
  });
}
