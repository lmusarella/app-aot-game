let lastRenderSignature = null;
let lastTurnSignature = null;
let pendingRenderId = null;

function buildRenderSignature(state) {
  const footerMessages = state?.footerMessages;
  const footerMessageUpdatedAt = footerMessages && typeof footerMessages === 'object'
    ? Object.values(footerMessages).reduce((max, entry) => {
      const ts = Number(entry?.at ?? 0);
      return ts > max ? ts : max;
    }, 0)
    : 0;
  return JSON.stringify({
    version: state?.stateVersion ?? 0,
    spawns: state?.spawns?.length ?? 0,
    allies: state?.alliesRoster?.length ?? 0,
    giants: state?.giantsRoster?.length ?? 0,
    walls: state?.walls?.length ?? 0,
    hand: state?.hand?.length ?? 0,
    logs: state?.logs?.length ?? 0,
    footerMessages: footerMessageUpdatedAt,
    mission: state?.missionState?.curIndex ?? 0,
    eventDeck: state?.decks?.event?.draw?.length ?? 0,
    consumableDeck: state?.decks?.consumable?.draw?.length ?? 0
  });
}

function buildTurnSignature(turnState) {
  if (!turnState) return 'none';
  return JSON.stringify({
    order: Array.isArray(turnState.order) ? turnState.order : [],
    currentIndex: turnState.currentIndex ?? 0,
    currentPlayerId: turnState.currentPlayerId ?? null,
    phaseReady: !!turnState.phaseReady,
    phase: turnState.phase ?? null,
    phaseDoneByCount: Array.isArray(turnState.phaseDoneBy) ? turnState.phaseDoneBy.length : 0
  });
}

export function scheduleRenderGameState(renderFn) {
  if (pendingRenderId) return;
  pendingRenderId = requestAnimationFrame(() => {
    pendingRenderId = null;
    renderFn();
  });
}

export function shouldRenderGameState(state) {
  const renderSignature = buildRenderSignature(state);
  if (renderSignature === lastRenderSignature) return false;
  lastRenderSignature = renderSignature;
  return true;
}

export function shouldRenderTurn(turnState) {
  const turnSignature = buildTurnSignature(turnState);
  if (turnSignature === lastTurnSignature) return false;
  lastTurnSignature = turnSignature;
  return true;
}
