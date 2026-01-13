import { spawnGiant } from '../entity/entity.js';
import { showCardUseEffect } from '../effects/cardFxOverlay.js';
import lightningStrike from '../effects/lightningStrike.js';
import { pushGameEvent } from '../event-manager.js';

function fireSpawnLightning() {
  lightningStrike();
  setTimeout(() => lightningStrike({ angleDeg: 80 }), 140);
  setTimeout(() => lightningStrike({ angleDeg: 100 }), 280);
}

function normalizeKind(deckType, card) {
  if (deckType === 'event') return 'event';
  const raw = (card?.type || '').toString().toLowerCase();
  if (raw.includes('equip')) return 'equip';
  return 'consumable';
}

export async function applyCardEffect({ deckType, card } = {}) {
  if (!card) return false;
  const type = (card?.type || '').toString().toLowerCase();
  const fxKind = normalizeKind(deckType, card);

  if (deckType === 'event' && type === 'spawn') {
    fireSpawnLightning();
    pushGameEvent('card_use', { deckType, effect: 'spawn' });
    const spawned = await spawnGiant();
    return !!spawned;
  }

  showCardUseEffect(fxKind);
  pushGameEvent('card_use', { deckType, effect: 'use', kind: fxKind });

  return false;
}

export default applyCardEffect;
