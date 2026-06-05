const DEFAULT_CARD_EFFECT_KIND = 'generic_use';

const CARD_EFFECT_HANDLERS = {
  [DEFAULT_CARD_EFFECT_KIND]: resolveGenericUse,
  spawn_giant: resolveSpawnGiant
};

/**
 * Crea un piano dichiarativo per l'effetto di una carta.
 *
 * Gli handler devono restare puri: niente spawn, niente modifiche a mazzi/mano,
 * niente UI e niente salvataggi. Devono solo descrivere cosa va eseguito.
 * `card-effects.js` applica poi il piano in un ordine unico e prevedibile.
 *
 * Schema consigliato nei JSON delle carte:
 * {
 *   "id": "e4",
 *   "type": "spawn",
 *   "effect": { "kind": "spawn_giant" },
 *   "name": "Discesa del Gigante!"
 * }
 *
 * Per retrocompatibilità, `type: "spawn"` viene mappato a `spawn_giant`.
 */
export function resolveCardEffectPlan({ deckType, card } = {}) {
  if (!card) return emptyPlan();

  const kind = normalizeCardEffectKind(card);
  const handler = CARD_EFFECT_HANDLERS[kind] || CARD_EFFECT_HANDLERS[DEFAULT_CARD_EFFECT_KIND];
  const plan = handler({ deckType, card, kind });

  return {
    deckType,
    cardId: card.id || null,
    cardName: card.name || 'Carta',
    kind,
    handled: !!plan.handled,
    consume: plan.consume || defaultConsumeFor(deckType),
    visualEffects: Array.isArray(plan.visualEffects) ? plan.visualEffects : [],
    gameEvents: Array.isArray(plan.gameEvents) ? plan.gameEvents : [],
    actions: Array.isArray(plan.actions) ? plan.actions : [],
    logLines: Array.isArray(plan.logLines) ? plan.logLines : []
  };
}

export function getCardEffectHandlerNames() {
  return Object.keys(CARD_EFFECT_HANDLERS);
}

function resolveSpawnGiant({ deckType, card }) {
  return {
    handled: true,
    consume: 'already_discarded',
    visualEffects: ['spawn_lightning'],
    gameEvents: [
      { type: 'card_use', payload: { deckType, cardId: card.id || null, cardName: card.name || null, effect: 'spawn' } }
    ],
    actions: [
      { type: 'spawn_giant', giantType: card.effect?.giantType || card.giantType || null }
    ]
  };
}

function resolveGenericUse({ deckType, card }) {
  const fxKind = normalizePresentationKind(deckType, card);
  return {
    handled: false,
    consume: defaultConsumeFor(deckType),
    visualEffects: [{ type: 'card_use_fx', kind: fxKind }],
    gameEvents: [
      { type: 'card_use', payload: { deckType, cardId: card.id || null, cardName: card.name || null, effect: 'use', kind: fxKind } }
    ]
  };
}

function normalizeCardEffectKind(card) {
  const effect = card?.effect;
  if (typeof effect === 'string' && effect.trim()) return effect.trim();
  if (effect?.kind) return effect.kind;
  if (effect?.type) return effect.type;

  const rawType = (card?.type || '').toString().toLowerCase();
  if (rawType === 'spawn') return 'spawn_giant';
  return DEFAULT_CARD_EFFECT_KIND;
}

function normalizePresentationKind(deckType, card) {
  if (deckType === 'event') return 'event';
  const raw = (card?.type || '').toString().toLowerCase();
  if (raw.includes('equip')) return 'equip';
  return 'consumable';
}

function defaultConsumeFor(deckType) {
  return deckType === 'event' ? 'already_discarded' : 'discard';
}

function emptyPlan() {
  return {
    deckType: null,
    cardId: null,
    cardName: 'Carta',
    kind: DEFAULT_CARD_EFFECT_KIND,
    handled: false,
    consume: 'discard',
    visualEffects: [],
    gameEvents: [],
    actions: [],
    logLines: []
  };
}
