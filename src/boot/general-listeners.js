import { ATTACK_PICK, endAttackPick } from '../game-business-logic/entity/entity.js';
import { DB, GAME_STATE, UNIT_SELECTED } from '../core/data.js';
import { renderGrid, renderBenches, grid, clearHighlights } from '../view-components/grid/grid.js';
import { closeAllFabs } from '../view-components/fabs/fab.js';
import { hideTooltip, initTooltipListeners } from '../ui-components/ui-helpers.js';

export function initGeneralListeners() {
  initTooltipListeners();

  document.addEventListener('click', (e) => {
    // durante la scelta NON auto-chiudere (salvo click davvero fuori da tutto)
    if (ATTACK_PICK) {
      const insideTooltip = e.target.closest('#tooltip');
      const onHex = e.target.closest('.hex-member') || e.target.closest('.hexagon');
      if (!insideTooltip && !onHex) endAttackPick(); // click “fuori”: annulla
      return; // non eseguire il reset selezione di default
    }
    if (
      !e.target.closest('.hex-member') &&
      !e.target.closest('.btn-icon') &&
      !e.target.closest('.unit-card') // <— aggiungi panchina
    ) {
      UNIT_SELECTED.selectedUnitId = null;
      hideTooltip();
      renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
      renderBenches();
      clearHighlights(); // rimuove highlight in panchina
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideTooltip();
      UNIT_SELECTED.selectedUnitId = null;
      renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
      closeAllFabs();
      clearHighlights();
    }
  });
}
