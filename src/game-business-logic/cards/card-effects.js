import { spawnGiant } from '../entity/entity.js';
import { showCardUseEffect } from '../effects/cardFxOverlay.js';
import lightningStrike from '../effects/lightningStrike.js';
import { pushGameEvent } from '../event-manager.js';
import { resolveCardEffectPlan, getCardEffectHandlerNames } from './card-effect-handlers.js';

function fireSpawnLightning() {
  lightningStrike();
  setTimeout(() => lightningStrike({ angleDeg: 80 }), 140);
  setTimeout(() => lightningStrike({ angleDeg: 100 }), 280);
}

export async function applyCardEffect({ deckType, card } = {}) {
  const plan = resolveCardEffectPlan({ deckType, card });
  await runCardEffectPlan(plan);

  return {
    handled: plan.handled,
    consume: plan.consume,
    kind: plan.kind
  };
}

export async function runCardEffectPlan(plan) {
  if (!plan) return false;

  runVisualEffects(plan.visualEffects);
  for (const event of plan.gameEvents) {
    if (event?.type) pushGameEvent(event.type, event.payload || {});
  }

  let completed = false;
  for (const action of plan.actions) {
    completed = await runCardAction(action) || completed;
  }

  return completed || plan.handled;
}

function runVisualEffects(effects = []) {
  for (const effect of effects) {
    if (effect === 'spawn_lightning' || effect?.type === 'spawn_lightning') {
      fireSpawnLightning();
      continue;
    }

    if (effect?.type === 'card_use_fx') {
      showCardUseEffect(effect.kind || 'event');
    }
  }
}

async function runCardAction(action) {
  if (!action) return false;

  if (action.type === 'spawn_giant') {
    const spawned = await spawnGiant(action.giantType || null);
    return !!spawned;
  }

  return false;
}

export { resolveCardEffectPlan, getCardEffectHandlerNames };
export default applyCardEffect;
