import { initHeaderListeners } from './header.js';
import { initPhasesListeners } from '../../core/phases.js';
import { showTutorialPopupViaDialog } from '../../ui-components/ui.js';

export function initView() {
  initHeaderListeners();
  initPhasesListeners();

  const btn = document.getElementById('btn-tutorial');
  btn?.addEventListener('click', async (e) => {
    e.preventDefault();
    await showTutorialPopupViaDialog({ startIndex: 0, force: true });
  });
}
