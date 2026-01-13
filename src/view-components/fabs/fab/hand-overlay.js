import { GAME_STATE } from '../../../core/data.js';
import { log } from '../../leftbar/log.js';
import { missionStatsRecordEvent } from '../../leftbar/missions.js';
import { cardSheetHTML } from '../../../ui-components/ui-helpers.js';
import { updateFabDeckCounters } from './decks.js';
import { showCardDrawEffect } from '../../../game-business-logic/effects/cardFxOverlay.js';
import { applyCardEffect } from '../../../game-business-logic/cards/card-effects.js';
import { pushGameEvent } from '../../../game-business-logic/event-manager.js';
import { scheduleSave } from '../../../game-business-logic/game-sync.js';

export function showDrawnCard(deckType, card) {
  const root = document.getElementById('hand-overlay');
  const strip = document.getElementById('hand-strip');
  const stage = root?.querySelector('.hand-stage');
  if (!root || !strip || !stage) return;
  showCardDrawEffect();
  pushGameEvent('card_draw', { deckType });
  scheduleSave('fab');
  stage.classList.add('hand-stage--single');
  strip.classList.remove('hand-strip');
  strip.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'hand-card';

  const actionCard = [
    { key: 'discard', label: 'Scarta', kind: 'primary' },
    { key: 'shuffle', label: 'Rimescola', kind: 'danger' }
  ];

  wrap.innerHTML = cardSheetHTML(deckType, card, actionCard);

  wrap.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.card-btn'); if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'discard') {
      GAME_STATE.decks[deckType]?.discard.push(card);
      log(`Scartata "${card.name}".`, 'info');
    }
    if (act === 'shuffle') {
      GAME_STATE.decks[deckType]?.draw.push(card);
      log(`Rimescolata ${card.name} nel mazzo "${deckType}".`, 'info');
    }
    updateFabDeckCounters();
    closeOverlay();
  }, { passive: true });

  strip.appendChild(wrap);

  function closeOverlay() {
    root.setAttribute('hidden', '');
    root.querySelector('.hand-backdrop').onclick = null;
    root.querySelector('.hand-close').onclick = null;
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') closeOverlay(); }

  root.querySelector('.hand-backdrop').onclick = () => {
    closeOverlay();
    if (deckType === 'consumable') {
      GAME_STATE.hand.push({ deck: deckType, card: structuredClone(card) });
      log(`Aggiunta in mano: "${card.name}".`, 'success');
      updateFabDeckCounters();
    }
    if (deckType === 'event') {
      GAME_STATE.decks[deckType]?.discard.push(card);
      log(`Carta Evento "${card.name}" è stata attivata!.`, 'warning');
      updateFabDeckCounters();
      applyCardEffect({ deckType, card });

      missionStatsRecordEvent(card, {
        durationRounds: card.duration || Infinity,
        sign: card.sign || 0
      });
    }
  };
  root.querySelector('.hand-close').onclick = () => {
    closeOverlay();
    if (deckType === 'consumable') {
      GAME_STATE.hand.push({ deck: deckType, card: structuredClone(card) });
      log(`Aggiunta in mano: "${card.name}".`, 'success');
      updateFabDeckCounters();
    }
    if (deckType === 'event') {
      GAME_STATE.decks[deckType]?.discard.push(card);
      log(`Carta Evento "${card.name}" è stata attivata!.`, 'warning');
      updateFabDeckCounters();
      applyCardEffect({ deckType, card });
      missionStatsRecordEvent(card, {
        durationRounds: card.duration || Infinity,
        sign: card.sign || 0
      });
    }
  };
  document.addEventListener('keydown', onKey);

  root.removeAttribute('hidden');
}

export function openHandOverlay() {
  const root = document.getElementById('hand-overlay');
  const strip = document.getElementById('hand-strip');
  const stage = root?.querySelector('.hand-stage');
  if (!root || !strip || !stage) return;
  stage.classList.remove('hand-stage--single');
  strip.classList.add('hand-strip');
  if (!GAME_STATE.hand.length) { log('La mano è vuota.', 'info'); return; }

  strip.innerHTML = '';
  GAME_STATE.hand.forEach((entry, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'hand-card';
    wrap.innerHTML = cardSheetHTML(entry.deck, entry.card, [
      { key: 'discard-one', label: 'Scarta', kind: 'primary' },
      { key: 'use-one', label: 'Usa', kind: 'danger' }
    ]);
    wrap.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('.card-btn'); if (!btn) return;
      const act = btn.dataset.act;

      if (act === 'discard-one') {
        const it = GAME_STATE.hand.splice(i, 1)[0];
        if (it) {
          GAME_STATE.decks[it.deck]?.discard.push(it.card);
          log(`Scartata "${it.card.name}".`, 'info');
          updateFabDeckCounters();
        }
      }
      if (act === 'use-one') {
        const it = GAME_STATE.hand.splice(i, 1)[0];
        if (it) {
          let handled = false;
          try { handled = !!await applyCardEffect({ deckType: it.deck, card: it.card }); } catch { }
          if (!handled) {
            try { handled = !!window.onUseCard?.(it.deck, it.card); } catch { }
          }
          if (!handled) {
            GAME_STATE.decks[it.deck]?.discard.push(it.card);
          }
          log(`Usata "${it.card.name}".`, 'success');
          updateFabDeckCounters();

          missionStatsRecordEvent(it.card, {
            durationRounds: it.card.duration || Infinity,
            sign: it.card.sign || 0
          });
        }
      }

      if (!GAME_STATE.hand.length) { closeOverlay(); return; }
      openHandOverlay();
    }, { passive: true });

    strip.appendChild(wrap);
  });

  function closeOverlay() {
    root.setAttribute('hidden', '');
    root.querySelector('.hand-backdrop').onclick = null;
    root.querySelector('.hand-close').onclick = null;
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') closeOverlay(); }

  root.querySelector('.hand-backdrop').onclick = closeOverlay;
  root.querySelector('.hand-close').onclick = closeOverlay;

  document.addEventListener('keydown', onKey);

  root.removeAttribute('hidden');
}
