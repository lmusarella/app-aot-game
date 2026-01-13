import { spawnGiant } from '../entity/entity.js';
import { showCardUseEffect } from '../effects/cardFxOverlay.js';

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
  showCardUseEffect(fxKind);

  if (deckType === 'event' && type === 'spawn') {
    const spawned = await spawnGiant();
    return !!spawned;
  }

  return false;
}

export default applyCardEffect;
