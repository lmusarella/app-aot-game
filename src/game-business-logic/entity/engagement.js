import { sameOrAdjCells } from '../../view-components/grid/grid.js';
import { unitAlive } from '../utils.js';
import { unitById, GIANT_ENGAGEMENT } from '../../core/data.js';
import { log } from '../../core/log.js';

// valida e ritorna l’umano ingaggiato col gigante, se ancora valido
export function getEngagedHuman(gid) {
  const hid = GIANT_ENGAGEMENT.get(gid);
  if (!hid) return null;
  const h = unitById.get(hid);
  const g = unitById.get(gid);

  if (!unitAlive(h) || !sameOrAdjCells(gid, hid)) {
    GIANT_ENGAGEMENT.delete(gid);
    log(`Il combattimento tra ${g.name} e ${h.name} è finito`, 'warning');
    return null;
  }
  return hid;
}

/**
 * Ritorna l'ID del gigante attualmente ingaggiato con l'umano `humanId`,
 * oppure null se non ce n'è. Pulisce eventuali legami non più validi.
 * @param {string} humanId
 * @returns {string|null}
 */
export function getEngagingGiant(humanId) {
  const hidStr = String(humanId);
  for (const [gid, hid] of GIANT_ENGAGEMENT) {
    if (String(hid) !== hidStr) continue;

    const g = unitById.get(gid);
    const h = unitById.get(hidStr);
    // se uno dei due non è valido / non vivo / non più adiacente → rimuovi binding
    if (!unitAlive(g) || !unitAlive(h) || !sameOrAdjCells(gid, hidStr) || g?.role !== 'enemy') {
      GIANT_ENGAGEMENT.delete(gid);
      log(`Il combattimento tra ${g.name} e ${h.name} è finito`, 'warning');
      continue;
    }

    // primo match valido: ritorna subito
    return gid;
  }
  return null;
}
