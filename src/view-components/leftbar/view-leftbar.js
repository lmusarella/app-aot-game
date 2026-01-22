import { initModsListeners } from './mods.js';
import { setupAccordions, setupLeftAccordions } from '../../ui-components/ui-helpers.js';

export function initView() {
  setupLeftAccordions();
  setupAccordions();
  initModsListeners();
}
