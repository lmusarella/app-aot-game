import { initHeaderListeners } from './header.js';
import { initPhasesListeners } from '../../game-business-logic/phases.js';
import { showTutorialPopupViaDialog } from '../../ui-components/ui-helpers.js';

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
    }
  });
}
