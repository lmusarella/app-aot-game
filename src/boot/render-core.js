import { refreshMoraleUI, refreshXPUI } from "../view-components/footer/footer.js";
import { initModsDiceUI, renderBonusMalus, refreshRollModsUI, mountUnitModsUI } from "../view-components/leftbar/mods.js";
import { renderGrid, renderBenches, grid } from "../view-components/grid/grid.js";
import { renderHeader } from "../view-components/header/header.js";
import { updateFabDeckCounters } from '../view-components/fabs/fab.js';
import { renderLogs } from '../view-components/leftbar/log.js';
import { DB, GAME_STATE } from "../core/data.js";

export function renderCoreUI() {
    refreshXPUI();
    refreshMoraleUI();
    renderBonusMalus();
    renderBenches();
    renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
    renderHeader();
    renderLogs();
    updateFabDeckCounters();
    refreshRollModsUI();
    initModsDiceUI();
    mountUnitModsUI();
}
