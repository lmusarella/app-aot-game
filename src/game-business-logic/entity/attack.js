import {
  sameOrAdjCells, focusUnitOnField,
  grid, renderBenches, renderGrid, focusBenchCard
} from '../../view-components/grid/grid.js';
import { unitAlive, isHuman, getStat, keyRC, d, capModSum, wait } from '../utils.js';
import { playSfx, playBg } from '../../view-components/audio/audio.js';
import { unitById, GAME_STATE, GIANT_ENGAGEMENT, DB } from '../../core/data.js';
import { scheduleSave } from '../game-sync.js';
import { pushGameEvent } from '../event-manager.js';
import { openAccordionForRole, showTooltip, renderPickTooltip, hideTooltip, getTooltipEl, showVersusOverlay, openDiceOverlay, hideVersusOverlay, showAttackOverlayUnderDice } from '../../ui-components/ui-helpers.js';
import { log } from '../../view-components/leftbar/log.js';
import bloodHitClean from '../effects/bloodHitClean.js';
import { giantFallQuake } from '../effects/screenQuake.js';
import swordSlash from '../effects/swordSlash.js';
import wallCollapse from '../effects/wallCollapse.js';
import showWarningC from '../effects/warningOverlayC.js';
import { getEngagedHuman, getEngagingGiant } from './engagement.js';
import { handleAllyDeath, handleGiantDeath, handleWallDeath } from './deaths.js';
import { resolveGiantAbilityPlan } from './giant-abilities.js';

export let ATTACK_PICK = null; // { attackerId, targets:[{unit, cell}], _unbind? }
let TARGET_CELLS = new Set();

function setEngagementIfMelee(gid, hid) {
  if (!gid || !hid) return;
  if (!sameOrAdjCells(gid, hid)) return;
  GIANT_ENGAGEMENT.set(gid, hid);
}

export function startAttackPick(attacker, targets, nemesi) {
  targets.forEach(unit => focusUnitOnField(unit.id, true));
  ATTACK_PICK = { attackerId: attacker.id, targets: targets };
  TARGET_CELLS = new Set(targets.map(t => keyRC(t.cell.row, t.cell.col)));

  const html = renderPickTooltip(attacker, targets, nemesi);
  showTooltip(html);

  const tooltip = getTooltipEl();
  if (tooltip) {
    tooltip.onclick = async (e) => {
      const tBtn = e.target.closest('[data-target-id]');
      if (tBtn) {
        endAttackPick();
        await resolveAttack(attacker.id, tBtn.dataset.targetId);
        return;
      }
      if (e.target.closest('[data-cancel]')) {
        endAttackPick();
      }
    };
  }

  renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
}

export function endAttackPick() {
  ATTACK_PICK = null;
  TARGET_CELLS.clear();
  hideTooltip();
  renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
}

export function adjustUnitHp(unitId, delta) {
  const u = unitById.get(unitId);
  if (!u) return;
  const max = u.hp ?? 1;
  const cur = (u.currHp ?? max) + delta;
  setUnitHp(unitId, Math.max(0, Math.min(max, cur)));
}

export async function setUnitHp(unitId, newHp) {
  const u = unitById.get(unitId);
  if (!u) return;

  if (u.role === 'wall' && u.destroyed) {
    return;
  }
  const clamped = Math.max(0, Math.min(u.hp ?? newHp, newHp));

  u.currHp = clamped;

  if ((u.role === 'recruit' || u.role === 'commander') && clamped === 0) {
    await handleAllyDeath(u);
    return;
  }
  if (u.role === 'enemy' && clamped === 0) {
    await handleGiantDeath(u);
    return;
  }

  if (u.role === 'wall' && clamped === 0) {
    await handleWallDeath(u);
    return;
  }

  scheduleSave('entity');
  renderBenches();
  renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
};

async function resolveAttack(attackerId, targetId) {
  const a = unitById.get(attackerId);
  const t = unitById.get(targetId);
  if (!a || !t) return;

  await safePlayBg('./assets/sounds/duel_sound.mp3');
  showVersusOverlay(a, t);
  pushGameEvent('combat_start', { attackerId: a.id, targetId: t.id });
  scheduleSave('entity');

  const d20roll = t.role === 'wall' ? d(20) : await rollD20OrAbort();
  if (d20roll == null) {
    hideVersusOverlay();
    pushGameEvent('combat_cancel', { attackerId: a.id, targetId: t.id });
    return;
  }

  const ctx = buildContext(a, t, d20roll);

  if (!ctx.flags.isHumanVsGiant) {
    await resolveWallAttack(ctx);
    scheduleSave('entity');
    return;
  }

  const outcome = await resolveHumanVsGiant(ctx);

  if (!ctx.state.engagedHumanId &&
    !ctx.state.engagingGiantId &&
    unitAlive(ctx.units.human) &&
    unitAlive(ctx.units.giant) &&
    sameOrAdjCells(ctx.ids.humanId, ctx.ids.giantId)) {
    setEngagementIfMelee(ctx.ids.giantId, ctx.ids.humanId);
    log(`${ctx.units.human.name} è entrato in combattimento con ${ctx.units.giant.name}`, 'warning');
  }

  showSummaryOverlay(ctx, outcome);
  pushGameEvent('combat_summary', {
    attackerId: a.id,
    targetId: t.id,
    badgeText: outcome.badgeText,
    badgeClass: outcome.badgeClass,
    summaryLines: outcome.summaryLines,
    roll: { d20: d20roll, total: ctx.roll.d20Total }
  });

  for (let i = 0; i < Math.min(2, outcome.summaryLines.length); i++) {
    log(outcome.summaryLines[i], 'info', 3000, true);
  }

  hideVersusOverlay();
  showVersusOverlay(a, t);

  scheduleSave('entity');
}

async function safePlayBg(path) {
  try { await playBg(path); } catch { }
}

async function rollD20OrAbort() {
  const dice = openDiceOverlay({ sides: 20, keepOpen: true });
  try {
    return await dice.waitForRoll;
  } catch {
    log('Scontro annullato.', 'warning');
    return null;
  }
}

function buildContext(a, t, d20roll) {
  const AisHuman = isHuman(a);
  const TisHuman = isHuman(t);
  const AisGiant = a?.role === 'enemy';
  const TisGiant = t?.role === 'enemy';
  const isHumanVsGiant = (AisHuman && TisGiant) || (TisHuman && AisGiant);

  const effectiveBonus = GAME_STATE.xpMoraleState.effectiveBonus || { all: 0, tec: 0, agi: 0, atk: 0 };
  const d20Total = d20roll + (effectiveBonus.all || 0);

  const human = isHuman(a) ? a : t;
  const giant = AisGiant ? a : t;

  const TEC = getStat(human, 'tec') || 0;
  const AGI = getStat(human, 'agi') || 0;
  const ATK = getStat(human, 'atk') || 0;
  const G_CD = getStat(giant, 'cd') || 0;
  const G_ATK = Math.max(1, getStat(giant, 'atk') || 1);

  const TEC_TOTAL = capModSum(TEC, effectiveBonus.tec);
  const AGI_TOTAL = capModSum(AGI, effectiveBonus.agi);
  const ATK_TOTAL = capModSum(ATK, effectiveBonus.atk);

  const engagingGiantId = getEngagingGiant(human.id);
  const engagedHumanId = getEngagedHuman(giant.id);

  return {
    roll: { d20roll, d20Total },
    bonus: { effectiveBonus, TEC_TOTAL, AGI_TOTAL, ATK_TOTAL },
    units: { a, t, human, giant },
    ids: { attackerId: a.id, targetId: t.id, humanId: human.id, giantId: giant.id },
    stats: { giantCd: G_CD, giantAtk: G_ATK },
    flags: { AisHuman, TisHuman, AisGiant, TisGiant, isHumanVsGiant },
    state: { engagingGiantId, engagedHumanId }
  };
}

async function resolveWallAttack(ctx) {
  const { a, t } = ctx.units;

  showWarningC({
    text: 'ATTENZIONE',
    subtext: `${a.name} sta per attaccare le mura`,
    theme: 'red',
    ringAmp: 1.0,
    autoDismissMs: 3000
  });

  await awaitWait(3000);

  const dmg = Math.max(1, Number(getStat(a, 'atk') || 1));
  const tHp = (t.currHp ?? t.hp) - dmg;
  setUnitHp(t.id, tHp);
  pushGameEvent('attack', { attackerId: a.id, targetId: t.id, effect: 'wall' });
  pushGameEvent('combat_summary', {
    attackerId: a.id,
    targetId: t.id,
    badgeText: 'Colpito',
    badgeClass: 'atk-win',
    summaryLines: [`${a.name} infligge ${dmg} danni alle mura.`],
    roll: { d20: null, total: null }
  });

  openAccordionForRole(t.role);
  focusUnitOnField(t.id);
  focusBenchCard(t.id);

  wallCollapse({
    intensity: 28,
    debrisCount: 180,
    durationMs: 2000,
    emitBand: 'top',
    bandHeight: 0.22
  });

  try {
    playSfx('./assets/sounds/colpo_mura.mp3', { volume: 0.8 });
  } catch { }

  await awaitWait(2000);
  hideVersusOverlay();
}

async function resolveHumanVsGiant(ctx) {
  const { human, giant } = ctx.units;
  const { humanId, giantId } = ctx.ids;
  const { d20roll, d20Total } = ctx.roll;
  const { TEC_TOTAL, AGI_TOTAL, ATK_TOTAL } = ctx.bonus;
  const { giantCd, giantAtk } = ctx.stats;
  const { engagingGiantId, engagedHumanId } = ctx.state;

  const humanHits = (d20Total + TEC_TOTAL) >= giantCd;
  const humanDodges = (d20Total + AGI_TOTAL) >= giantCd;

  const ability = getReadyGiantAbility(giant);

  let humanDamageDealt = 0;
  let humanDamageTaken = 0;
  let abilityExtraLines = [];

  const humanDistracted = !!(engagingGiantId && engagingGiantId !== giantId);
  const inMelee = sameOrAdjCells(humanId, giantId);

  if (humanHits && !humanDistracted && inMelee) {
    const dmg = Math.max(1, d(4) + ATK_TOTAL);
    humanDamageDealt = dmg;
    await setUnitHp(giantId, (giant.currHp ?? giant.hp) - dmg);
    pushGameEvent('attack', { attackerId: humanId, targetId: giantId, effect: 'slash' });
    try {
      const path = human.sex === 'm'
        ? './assets/sounds/attacco_uomo.mp3'
        : './assets/sounds/attacco_donna.mp3';
      const offset = 0;
      setTimeout(() => playSfx(path, { volume: 0.8 }), offset);
      swordSlash({
        angle: 'right-down', thickness: 24, glow: 22, length: 1.2,
        splatter: 0.8, centerSafe: true, safeInset: 0.24
      });
    } catch { }
  }

  let giantDistracted = false;
  let cdGiantAbi = null;
  let humanDodgesAbility = null;

  if (!engagedHumanId || engagedHumanId === humanId) {
    if (ability) {
      cdGiantAbi = Number.isFinite(Number(ability.cd)) ? Number(ability.cd) : giantCd;
      humanDodgesAbility = ability.dodgeable === false ? false : (d20Total + AGI_TOTAL) >= cdGiantAbi;

      showWarningC({
        text: "ABILITA' ATTIVATA",
        subtext: `${giant.name} usa ${ability.name || 'Abilità'}`,
        theme: 'orange', ringAmp: 1.0, autoDismissMs: 3500
      });
      pushGameEvent('giant_ability', {
        giantId,
        name: `${giant.name} usa ${ability.name || 'Abilità'}`,
        sfx: ability.sfx || './assets/sounds/abilita_gigante.mp3'
      });
      try { playSfx(ability.sfx || './assets/sounds/abilita_gigante.mp3', { volume: 0.9 }); } catch { }
      await awaitWait(3500);

      const plan = resolveGiantAbilityPlan({
        ctx, ability, primaryTargetId: humanId, d20Total,
        agiTotalByUnitId: (unitId) => {
          const unit = unitById.get(unitId);
          return capModSum(getStat(unit, 'agi') || 0, ctx.bonus.effectiveBonus.agi);
        }
      });

      for (const event of plan.damageEvents) {
        const target = event.target.unit;
        await setUnitHp(target.id, (target.currHp ?? target.hp) - event.damage);
        pushGameEvent('attack', { attackerId: giantId, targetId: target.id, effect: 'giant', abilityKind: plan.kind });
        if (String(target.id) === String(humanId)) humanDamageTaken += event.damage;
      }

      abilityExtraLines = buildAbilityExtraLines(plan, humanId);

      if (plan.damageEvents.length) {
        bloodImpact();
        giantFallQuake({ delayMs: 0, intensity: plan.kind === 'adjacent_damage' ? 32 : 28 });
      }

      consumeGiantAbilityCooldown(giant);
    } else {
      const giantHits = !humanDodges;
      if (giantHits) {
        humanDamageTaken = giantAtk;
        await setUnitHp(humanId, (human.currHp ?? human.hp) - giantAtk);
        pushGameEvent('attack', { attackerId: giantId, targetId: humanId, effect: 'giant' });
        bloodImpact();
        try { playSfx('./assets/sounds/attacco_gigante.mp3', { volume: 0.8 }); } catch { }
      }
    }
  } else {
    giantDistracted = true;
  }

  const summary = buildSummary({
    ctx, ability, humanHits, humanDodges, humanDodgesAbility, cdGiantAbi,
    humanDistracted, giantDistracted, humanDamageDealt, humanDamageTaken, abilityExtraLines
  });

  return {
    ...summary,
    uiTotals: {
      toHit: { d20: d20roll, modLabel: 'TEC', modValue: TEC_TOTAL, total: d20Total + TEC_TOTAL, target: giantCd, success: humanHits },
      toDodge: { d20: d20roll, modLabel: 'AGI', modValue: AGI_TOTAL, total: d20Total + AGI_TOTAL, target: cdGiantAbi || giantCd, success: (humanDodgesAbility ?? humanDodges) }
    }
  };
}

function buildSummary({
  ctx, ability, humanHits, humanDodges, humanDodgesAbility, cdGiantAbi,
  humanDistracted, giantDistracted, humanDamageDealt, humanDamageTaken, abilityExtraLines = []
}) {
  const { human, giant } = ctx.units;
  const lines = [];

  const humanDidHit = humanDamageDealt > 0;
  const giantDidHit = humanDamageTaken > 0;
  const bothHit = humanDidHit && giantDidHit;
  const neitherHit = !humanDidHit && !giantDidHit;

  if (ability && giantDidHit)
    log(`${giant.name} usa ${ability.name || 'Abilità'}`, 'warning', 3000, true);

  let badgeText = 'Pareggio';
  let badgeClass = 'atk-tie';

  if (bothHit) {
    badgeText = 'Pareggio'; badgeClass = 'atk-tie';
  } else if (neitherHit) {
    try { playSfx('./assets/sounds/schivata.mp3', { volume: 0.8 }); } catch { }
    badgeText = 'Pareggio'; badgeClass = 'atk-tie';
  } else if (humanDidHit) {
    badgeText = 'Successo'; badgeClass = 'atk-win';
  } else {
    badgeText = 'Fallito'; badgeClass = 'atk-lose';
  }

  if (humanDidHit) {
    lines.push(`${human.name} infligge ${humanDamageDealt} danni.`);
  } else {
    if (humanDistracted) {
      const x = unitById.get(ctx.state.engagingGiantId);
      lines.push(`${human.name} è attualmente distratto da ${x?.name || 'un gigante'}.`);
    } else {
      if (sameOrAdjCells(ctx.ids.humanId, ctx.ids.giantId)) lines.push(`${human.name} manca il bersaglio.`);
      else lines.push(`${ctx.units.giant.name} è troppo lontanto.`);
    }
  }

  if (giantDidHit) {
    lines.push(`${giant.name} infligge ${humanDamageTaken} danni.`);
  } else {
    if (giantDistracted) {
      const engagedUnit = unitById.get(ctx.state.engagedHumanId);
      lines.push(`${giant.name} è attualmente distratto da ${engagedUnit?.name || 'un umano'}.`);
    } else {
      if (ability) lines.push(`${human.name} schiva l'abilità di ${giant.name}.`);
      else lines.push(`${human.name} schiva l'attacco di ${giant.name}.`);
    }
  }

  lines.push(...abilityExtraLines);

  return { badgeText, badgeClass, summaryLines: lines, ability };
}


function buildAbilityExtraLines(plan, primaryTargetId) {
  if (!plan || plan.kind === 'single_target_damage') return [];
  const lines = [];
  for (const event of plan.damageEvents) {
    const target = event.target?.unit;
    if (!target || String(target.id) === String(primaryTargetId)) continue;
    lines.push(`${target.name} subisce ${event.damage} danni da ${plan.name}.`);
  }
  for (const target of plan.dodgedTargets || []) {
    const unit = target?.unit;
    if (!unit || String(unit.id) === String(primaryTargetId)) continue;
    lines.push(`${unit.name} schiva ${plan.name}.`);
  }
  return lines;
}

function showSummaryOverlay(ctx, outcome) {
  const { badgeText, badgeClass, summaryLines } = outcome;
  const { uiTotals } = outcome;
  const { t } = ctx.units;

  showAttackOverlayUnderDice({
    badge: badgeText,
    badgeClass,
    hit: uiTotals.toHit,
    dodge: uiTotals.toDodge,
    lines: summaryLines,
    gap: 12,
    autoHideMs: 0
  });

  openAccordionForRole(t.role);
  focusUnitOnField(t.id);
  focusBenchCard(t.id);
}

function bloodImpact() {
  bloodHitClean({
    side: 'right', intensity: 1.0, density: 1.2,
    safeInset: 0.26, duration: 120, fadeAfter: 1400, fadeMs: 650
  });
}

function awaitWait(ms) { try { return wait(ms); } catch { return Promise.resolve(); } }

function getReadyGiantAbility(giant) {
  const ab = giant?.ability;
  if (!ab) return null;
  const active = (ab.active ?? true);
  const coolDownLeft = Number(ab.coolDownLeft || 0);
  if (!active || coolDownLeft > 0) return null;
  return ab;
}

function consumeGiantAbilityCooldown(giant) {
  const ab = giant?.ability;
  if (!ab) return;
  const coolDown = Math.max(1, Number(ab.coolDown || 1));
  ab.coolDownLeft = coolDown;
}
