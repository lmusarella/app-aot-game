export function ensureMissionCardSkeleton(card) {
  if (!card) return;
  const hasHead = card.querySelector('.mission-head');
  if (hasHead) return;

  card.innerHTML = `


    <div id="mission-head" class="mission-head mission-card">
      <p class="mission-title">
        <strong>#<span id="mc-num"></span> — <span id="mc-title"></span></strong>
      </p>
      <ul id="mc-brief" class="mission-brief"></ul>
      <p id="mc-reward" class="mission-reward"></p>
    </div>

    <div class="mission-stats">
      <div class="msn-badge"><span class="lbl">Uccisioni</span><span id="msn-kills">0</span></div>
      <div class="msn-badge"><span class="lbl">Perdite</span><span id="msn-losses">0</span></div>
      <div class="msn-badge"><span class="lbl">Tentativi</span><span id="msn-attempts">0</span></div>
      <div class="msn-badge"><span class="lbl">Round</span><span id="msn-round">0</span></div>
    </div>

    <div class="mission-subtitle">Squadra</div>
    <ul id="msn-squad" class="msn-squad"></ul>

    <div class="mission-subtitle">Eventi attivati</div>
    <ul id="msn-evlist" class="msn-list"></ul>

    <div class="mission-subtitle">Effetti attivi</div>
    <div id="msn-evactive" class="msn-chips"></div>
  `;
}
