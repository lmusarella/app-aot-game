import { refreshMoraleUI, refreshXPUI, refreshFooterTracker } from "../view-components/footer/footer.js";
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
    const gridSettings = DB?.SETTINGS?.gridSettings;
    const rows = Number(gridSettings?.rows);
    const cols = Number(gridSettings?.cols);
    if (Number.isFinite(rows) && Number.isFinite(cols) && rows > 0 && cols > 0) {
        renderGrid(grid, rows, cols, GAME_STATE.spawns);
    } else {
        console.warn('[renderCoreUI] Grid settings non disponibili, skip renderGrid.', {
            rows,
            cols
        });
    }
    renderHeader();
    renderLogs();
    updateFabDeckCounters();
    refreshRollModsUI();
    initModsDiceUI();
    mountUnitModsUI();
    refreshFooterTracker();
}
