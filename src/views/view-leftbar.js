import { initModsListeners } from '../mods.js';
import { setupAccordions, setupLeftAccordions } from '../ui.js';

export function initView() {
  setupLeftAccordions();
  setupAccordions();
  initModsListeners();
}
