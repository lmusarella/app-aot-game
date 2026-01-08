import { hideAttackOverlayUnderDice } from './attack.js';
import { hideVersusOverlay } from './versus.js';

let overlayEl = null;

function buildMarkup() {
  return `
  <div class="diceov-backdrop" data-close></div>
  <div class="diceov-stage" role="dialog" aria-modal="true" aria-label="Lancio dadi">
    <button class="diceov-close" data-close aria-label="Chiudi" hidden>×</button>

    <div id="diceRoller"></div>
    <main id="diceRollerUI">
      <div class="top_field" hidden>
        <input type="text" id="textInput" spellcheck="false" inputmode="none" virtualkeyboardpolicy="manual"
               value="1d20"/>
      </div>
      <div id="diceLimit" style="display:none">Wow that's a lot of dice! <br>[Limit: 20]</div>
      <div id="center_div" class="center_field">
        <div id="instructions" style="display: none"><p>Swipe to roll dice</p></div>
      </div>
      <div id="numPad" class="center_field" style="display:none">
        <table class="numPad">
          <tr><td onclick="main.input('del')" colspan="2">del</td><td onclick="main.input('bksp')" colspan="2">bksp</td></tr>
          <tr><td onclick="main.input('7')">7</td><td onclick="main.input('8')">8</td><td onclick="main.input('9')">9</td><td onclick="main.input('+')" rowspan="2">+</td></tr>
          <tr><td onclick="main.input('4')">4</td><td onclick="main.input('5')">5</td><td onclick="main.input('6')">6</td></tr>
          <tr><td onclick="main.input('1')">1</td><td onclick="main.input('2')">2</td><td onclick="main.input('3')">3</td><td onclick="main.input('-')" rowspan="2">-</td></tr>
          <tr><td onclick="main.input('0')" colspan="2">0</td><td onclick="main.input('d')">d</td></tr>
        </table>
        <button onclick="main.clearInput()">CLEAR</button>
        <button onclick="main.setInput()">OK</button>
      </div>
      <div class="bottom_field" hidden><span id="result"></span></div>
    </main>

  </div>`;
}

function parseLastInt(text) {
  const m = String(text).match(/\d+/g);
  return m ? parseInt(m[m.length - 1], 10) : null;
}

export function openDiceOverlay({ sides = 20, keepOpen = false } = {}) {
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.id = 'dice-overlay';
    overlayEl.innerHTML = buildMarkup();
    document.body.appendChild(overlayEl);

    if (window.main && typeof window.main.init === 'function') {
      window.main.init();
    }
    if (window.main && typeof window.main.setInput === 'function') {
      window.main.setInput();
    }

    overlayEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) closeDiceOverlay();
    });
    document.addEventListener('keydown', escClose, true);
  }

  try {
    const res = overlayEl.querySelector('#result');
    if (res) res.textContent = '—';
    const lim = overlayEl.querySelector('#diceLimit');
    if (lim) lim.style.display = 'none';
  } catch { }

  try { hideAttackOverlayUnderDice(); } catch { }

  overlayEl.removeAttribute('hidden');

  const input = overlayEl.querySelector('#textInput');
  if (input) input.value = `1d${sides}`;

  const resultEl = overlayEl.querySelector('#result');
  let last = null;

  let resolveFn, rejectFn;
  const waitForRoll = new Promise((resolve, reject) => {
    resolveFn = resolve; rejectFn = reject;
  });

  const onMut = () => {
    const n = parseLastInt(resultEl?.textContent || '');
    if (n != null) {
      last = n;
      if (!keepOpen) closeDiceOverlay();
      cleanup();
      resolveFn(n);
    }
  };

  const mo = resultEl ? new MutationObserver(onMut) : null;
  mo?.observe(resultEl, { childList: true, characterData: true, subtree: true });

  function cleanup() {
    try { mo?.disconnect(); } catch { }
  }

  const closeRef = closeDiceOverlay;
  closeDiceOverlay = function () {
    cleanup();
    if (overlayEl) overlayEl.setAttribute('hidden', '');

    if (last == null) rejectFn?.(new Error('Dice overlay closed'));

    try { hideAttackOverlayUnderDice(); } catch { }
    try { hideVersusOverlay(); } catch { }

    closeDiceOverlay = closeRef;
  };

  return {
    waitForRoll,
    close: () => { cleanup(); closeRef(); }
  };
}

function escClose(e) {
  if (e.key === 'Escape') closeDiceOverlay();
}

export function closeDiceOverlay() {
  if (!overlayEl) return;
  document.removeEventListener('keydown', escClose, true);
  overlayEl.setAttribute('hidden', '');
}
