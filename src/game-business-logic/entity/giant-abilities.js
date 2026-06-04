import { findUnitCell, unitsAtCell } from '../../view-components/grid/queries.js';
import { hexNeighbors } from '../../view-components/grid/hex.js';
import { isHuman, getStat, rollDiceSpec } from '../utils.js';

const DEFAULT_ABILITY_KIND = 'single_target_damage';

const GIANT_ABILITY_HANDLERS = {
  [DEFAULT_ABILITY_KIND]: resolveSingleTargetDamage,
  adjacent_damage: resolveAdjacentDamage
};

/**
 * Risolve una abilità gigante in modo sincrono e deterministico per lo stato:
 * - nessun handler modifica HP, griglia o salvataggi;
 * - ogni handler restituisce solo una lista ordinata di effetti da applicare;
 * - il chiamante applica gli effetti in sequenza, così in multiplayer un solo client
 *   produce lo stato salvato e gli altri riproducono solo eventi/animazioni.
 *
 * Schema consigliato per una ability in assets/data/giganti.json:
 * {
 *   "name": "Carica devastante",
 *   "kind": "adjacent_damage",
 *   "dice": "1d6",
 *   "bonus": 0,
 *   "addAtk": true,
 *   "dodgeable": true,
 *   "cd": 12,
 *   "coolDown": 3,
 *   "coolDownLeft": 0,
 *   "active": true,
 *   "sfx": "./assets/sounds/attacco_gigante.mp3"
 * }
 */
export function resolveGiantAbilityPlan({ ctx, ability, primaryTargetId, d20Total, agiTotalByUnitId = defaultAgiTotalByUnitId }) {
  if (!ctx?.units?.giant || !ability) return emptyPlan();

  const kind = normalizeAbilityKind(ability);
  const handler = GIANT_ABILITY_HANDLERS[kind] || GIANT_ABILITY_HANDLERS[DEFAULT_ABILITY_KIND];
  const plan = handler({ ctx, ability, primaryTargetId, d20Total, agiTotalByUnitId });

  return {
    kind,
    name: ability.name || 'Abilità',
    cd: Number.isFinite(Number(ability.cd)) ? Number(ability.cd) : ctx.stats.giantCd,
    dodgeable: ability.dodgeable !== false,
    sfx: ability.sfx || './assets/sounds/abilita_gigante.mp3',
    targets: Array.isArray(plan.targets) ? plan.targets : [],
    damageEvents: Array.isArray(plan.damageEvents) ? plan.damageEvents : [],
    dodgedTargets: Array.isArray(plan.dodgedTargets) ? plan.dodgedTargets : []
  };
}

export function getGiantAbilityHandlerNames() {
  return Object.keys(GIANT_ABILITY_HANDLERS);
}

function resolveSingleTargetDamage({ ctx, ability, primaryTargetId, d20Total, agiTotalByUnitId }) {
  const human = ctx.units.human;
  if (!human) return emptyPlan();

  const target = unitTargetDescriptor(human, findUnitCell(human.id));
  return buildDamagePlanForTargets({ ctx, ability, targets: [target], primaryTargetId, d20Total, agiTotalByUnitId });
}

function resolveAdjacentDamage({ ctx, ability, primaryTargetId, d20Total, agiTotalByUnitId }) {
  const giantCell = findUnitCell(ctx.ids.giantId);
  if (!giantCell) return emptyPlan();

  const targets = [];
  for (const cell of hexNeighbors(giantCell.row, giantCell.col, false)) {
    for (const unit of unitsAtCell(cell.row, cell.col)) {
      if (isHuman(unit)) targets.push(unitTargetDescriptor(unit, cell));
    }
  }

  return buildDamagePlanForTargets({ ctx, ability, targets, primaryTargetId, d20Total, agiTotalByUnitId });
}

function buildDamagePlanForTargets({ ctx, ability, targets, primaryTargetId, d20Total, agiTotalByUnitId }) {
  const cd = Number.isFinite(Number(ability.cd)) ? Number(ability.cd) : ctx.stats.giantCd;
  const dodgeable = ability.dodgeable !== false;
  const uniqTargets = uniqueTargets(targets).sort((a, b) => `${a.cell?.row ?? 0}:${a.cell?.col ?? 0}:${a.unit.id}`.localeCompare(`${b.cell?.row ?? 0}:${b.cell?.col ?? 0}:${b.unit.id}`));
  const damageEvents = [];
  const dodgedTargets = [];

  for (const target of uniqTargets) {
    const agiTotal = agiTotalByUnitId(target.unit.id);
    const dodged = dodgeable && (d20Total + agiTotal) >= cd;
    if (dodged) {
      dodgedTargets.push(target);
      continue;
    }

    damageEvents.push({
      target,
      damage: computeAbilityDamage(ctx.units.giant, ability),
      primary: String(target.unit.id) === String(primaryTargetId)
    });
  }

  return { targets: uniqTargets, damageEvents, dodgedTargets };
}

function normalizeAbilityKind(ability) {
  if (ability?.kind) return ability.kind;
  if (ability?.effect) return ability.effect;
  if (ability?.adjacentDamage || ability?.area === 'adjacent') return 'adjacent_damage';
  return DEFAULT_ABILITY_KIND;
}

function computeAbilityDamage(giant, ab) {
  const base = rollDiceSpec(ab?.dice || '1d6');
  const bonus = Number(ab?.bonus || 0);
  const addAtk = !!ab?.addAtk;
  const atk = Math.max(0, getStat(giant, 'atk'));
  return Math.max(1, base + bonus + (addAtk ? atk : 0));
}

function defaultAgiTotalByUnitId() {
  return 0;
}

function unitTargetDescriptor(unit, cell) {
  return { unit, cell: cell ? { row: cell.row, col: cell.col } : null };
}

function uniqueTargets(targets) {
  const seen = new Set();
  const out = [];
  for (const target of targets) {
    const id = target?.unit?.id;
    if (!id || seen.has(String(id))) continue;
    seen.add(String(id));
    out.push(target);
  }
  return out;
}

function emptyPlan() {
  return { targets: [], damageEvents: [], dodgedTargets: [] };
}
