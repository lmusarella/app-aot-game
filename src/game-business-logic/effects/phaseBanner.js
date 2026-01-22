/**
 * phaseBanner.js
 * Aggiorna la nuvoletta di Erwin con un messaggio di cambio fase.
 */
import { APP_STATE } from '../../core/app-state.js';

function formatMessage(text, subtext) {
  if (subtext) return `${text} — ${subtext}`;
  return text;
}

export default function showPhaseBanner(opts = {}) {
  if (APP_STATE.gameMode === 'multiplayer') return null;
  const phaseLabel = document.getElementById('phase-label');
  if (!phaseLabel) return null;
  const bubble = phaseLabel.closest('.header-briefing-bubble');

  const {
    text = 'NUOVA FASE',
    subtext = '',
    theme = 'neutral',
    autoDismissMs = 1500
  } = opts;

  phaseLabel.textContent = formatMessage(text, subtext);

  if (bubble) {
    bubble.classList.remove('phase-bubble--red', 'phase-bubble--blue', 'phase-bubble--green', 'phase-bubble--neutral');
    bubble.classList.add(`phase-bubble--${theme}`);
    bubble.classList.add('phase-bubble--flash');
  }

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (bubble) {
      bubble.classList.remove('phase-bubble--flash');
      bubble.classList.remove(`phase-bubble--${theme}`);
    }
  };

  if (autoDismissMs && Number.isFinite(autoDismissMs)) {
    setTimeout(close, Math.max(0, autoDismissMs | 0));
  }

  return { close, el: phaseLabel };
}
