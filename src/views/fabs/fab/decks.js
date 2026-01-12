import { GAME_STATE, DB } from '../../../core/data.js';
import { log } from '../../../core/log.js';
import { shuffle } from '../../../utils.js';
import { scheduleSave } from '../../../game/game-sync.js';

function reshuffleDiscardsOf(type /* 'event' | 'consumable' */) {
  const d = GAME_STATE.decks[type];
  if (!d) return 0;

  const moved = [];

  if (Array.isArray(d.discard) && d.discard.length > 0) {
    moved.push(...d.discard.splice(0));
  }

  if (Array.isArray(d.removed) && d.removed.length > 0) {
    moved.push(...d.removed.splice(0));
  }

  if (moved.length === 0) return 0;

  d.draw.push(...moved);
  shuffle(d.draw);
  scheduleSave('fab');
  return moved.length;
}

export function reshuffleAllDiscards() {
  const e = reshuffleDiscardsOf('event');
  const c = reshuffleDiscardsOf('consumable');

  if (e === 0 && c === 0) {
    log('Nessuna carta negli scarti.', 'info');
  } else {
    const parts = [];
    if (e) parts.push(`Eventi: ${e}`);
    if (c) parts.push(`Consumabili: ${c}`);
    log(`Rimescolati gli scarti → ${parts.join(' • ')}.`, 'info');
  }

  updateFabDeckCounters();
}

export function drawCard(type /* 'event' | 'consumable' */) {
  const d = GAME_STATE.decks[type];
  if (!d) return null;

  if (d.draw.length === 0) {
    if (d.discard.length === 0) return null;
    d.draw = shuffle(d.discard.splice(0));
  }
  const pop = d.draw.pop();
  scheduleSave('fab');
  updateFabDeckCounters();
  return pop;
}

export function updateFabDeckCounters() {
  const evDraw = GAME_STATE.decks.event?.draw?.length || 0;
  const consDraw = GAME_STATE.decks.consumable?.draw?.length || 0;
  const handDraw = GAME_STATE.hand?.length || 0;

  const evBadge = document.querySelector('[data-deck-badge="event"]');
  const consBadge = document.querySelector('[data-deck-badge="consumable"]');
  const handBadge = document.querySelector('[data-deck-badge="showhand"]');
  if (evBadge) evBadge.textContent = evDraw;
  if (consBadge) consBadge.textContent = consDraw;
  if (handBadge) handBadge.textContent = handDraw;
}

export function resetDeckFromPool(type) {
  const pool = (type === 'event') ? DB.EVENTS : DB.CONSUMABLE;
  const d = GAME_STATE.decks[type];
  d.draw = shuffle(pool.slice());
  d.discard = [];
  d.removed = [];

  updateFabDeckCounters();
}
