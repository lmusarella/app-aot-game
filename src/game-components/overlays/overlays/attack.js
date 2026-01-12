export function showAttackOverlayUnderDice({
  badge = 'Successo',
  badgeClass = '',
  hit = { d20: null, modLabel: 'TEC', modValue: 0, total: null, target: null, success: false },
  dodge = { d20: null, modLabel: 'AGI', modValue: 0, total: null, target: null, success: false },
  lines = [],
  gap = 12,
  autoHideMs = 0
} = {}) {
  const root = document.getElementById('dice-overlay');
  if (!root) return;
  const stage = root.querySelector('.diceov-stage');
  if (!stage) return;

  let under = root.querySelector('#atk-under');
  if (!under) {
    under = document.createElement('div');
    under.id = 'atk-under';
    root.appendChild(under);
  }

  const fmtMod = (v) => (v === 0 ? '' : `${v > 0 ? '+' : '-'}${Math.abs(v)}`);
  const hitStr = (hit && hit.d20 != null)
    ? `(${hit.d20}${fmtMod(hit.modValue ?? 0)}) = <b>${hit.total}</b> • CD <b>${hit.target}</b>`
    : '—';
  const dodgeStr = (dodge && dodge.d20 != null)
    ? `(${dodge.d20}${fmtMod(dodge.modValue ?? 0)}) = <b>${dodge.total}</b> • CD <b>${dodge.target}</b>`
    : '—';

  under.innerHTML = `
  <div class="atk-card">
    <div class="atk-header">
      <div class="badge-circle ${badgeClass}">${badge}</div>
    </div>

    <div class="atk-tworows">
      <div class="atk-row">
        <span class="r-emoji">🎯</span>
        <span class="r-label">Attacco</span>
        <span class="r-formula">${hitStr}</span>
        <span class="r-outcome ${hit?.success ? 'ok' : 'no'}">${hit?.success ? '🟢' : '🔴'}</span>
      </div>

      <div class="atk-row">
        <span class="r-emoji">🛡️</span>
        <span class="r-label">Schivata</span>
        <span class="r-formula">${dodgeStr}</span>
        <span class="r-outcome ${dodge?.success ? 'ok' : 'no'}">${dodge?.success ? '🟢' : '🔴'}</span>
      </div>
    </div>

    <div class="atk-tworows">
      <div class="atk-row-2">
        <span class="r-formula-2">${lines[0]}</span>
      </div>

      <div class="atk-row-2">
         <span class="r-formula-2">${lines[1]}</span>
      </div>
    </div>

  </div>
`;

  const rect = stage.getBoundingClientRect();
  under.style.top = `${rect.bottom + gap}px`;

  requestAnimationFrame(() => under.classList.add('show'));

  const onResize = () => {
    const r = stage.getBoundingClientRect();
    under.style.top = `${r.bottom + gap}px`;
  };
  window.addEventListener('resize', onResize);
  under._onResize = onResize;

  if (autoHideMs > 0) {
    clearTimeout(under._timer);
    under._timer = setTimeout(() => hideAttackOverlayUnderDice(), autoHideMs);
  }
}

export function hideAttackOverlayUnderDice() {
  const under = document.getElementById('atk-under');
  if (!under) return;
  if (under._onResize) window.removeEventListener('resize', under._onResize);
  under.classList.remove('show');
  setTimeout(() => under.remove(), 240);
}
