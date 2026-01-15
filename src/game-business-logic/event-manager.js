import { APP_STATE } from '../core/app-state.js';
import { GAME_STATE, unitById } from '../core/data.js';
import { log } from '../view-components/leftbar/log.js';
import { playSfx, playBg } from '../view-components/audio/audio.js';
import swordSlash from './effects/swordSlash.js';
import bloodHitClean from './effects/bloodHitClean.js';
import wallCollapse from './effects/wallCollapse.js';
import { giantFallQuake } from './effects/screenQuake.js';
import { giantDust } from './effects/giantDust.js';
import showDeathScreen from './effects/deathOverlay.js';
import showVictoryScreen from './effects/victoryOverlay.js';
import { showCardDrawEffect, showCardUseEffect } from './effects/cardFxOverlay.js';
import lightningStrike from './effects/lightningStrike.js';
import showCombatWaitOverlay from './effects/combatWaitOverlay.js';
import { showAttackSummaryOverlay, hideAttackSummaryOverlay } from '../view-components/overlays/overlays/attack-summary.js';
import { showVersusOverlay, hideVersusOverlay } from '../ui-components/ui-helpers.js';
import showWarningC from './effects/warningOverlayC.js';

const processedIds = new Set();
const MAX_EVENTS = 50;
let combatWaitHandle = null;

function getUnitById(unitId) {
  if (!unitId) return null;
  const fromMap = unitById.get(unitId);
  if (fromMap) return fromMap;
  return (
    GAME_STATE.alliesRoster?.find(u => u.id === unitId) ||
    GAME_STATE.giantsRoster?.find(u => u.id === unitId) ||
    GAME_STATE.walls?.find(u => u.id === unitId) ||
    GAME_STATE.alliesPool?.find(u => u.id === unitId) ||
    GAME_STATE.giantsPool?.find(u => u.id === unitId) ||
    null
  );
}

function generateEventId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeEvents() {
  if (!Array.isArray(GAME_STATE.events)) GAME_STATE.events = [];
}

export function initEventManager() {
  normalizeEvents();
  processedIds.clear();
  for (const ev of GAME_STATE.events) {
    if (ev?.id) processedIds.add(ev.id);
  }
}

export function pushGameEvent(type, payload = {}) {
  normalizeEvents();
  const event = {
    id: generateEventId(),
    type,
    payload,
    ts: Date.now(),
    by: APP_STATE.user?.id || null
  };
  GAME_STATE.events.push(event);
  if (GAME_STATE.events.length > MAX_EVENTS) {
    GAME_STATE.events.splice(0, GAME_STATE.events.length - MAX_EVENTS);
  }
  return event;
}

export function consumeGameEvents() {
  normalizeEvents();
  if (GAME_STATE.events.length === 0) return;
  const seen = new Set(GAME_STATE.events.map(ev => ev?.id).filter(Boolean));
  for (const id of processedIds) {
    if (!seen.has(id)) processedIds.delete(id);
  }
  for (const ev of GAME_STATE.events) {
    if (!ev?.id || processedIds.has(ev.id)) continue;
    processedIds.add(ev.id);
    if (ev.by && APP_STATE.user?.id && ev.by === APP_STATE.user.id) continue;
    handleEvent(ev);
  }
}

function handleEvent(ev) {
  switch (ev.type) {
    case 'attack':
      handleAttackEvent(ev);
      break;
    case 'death':
      handleDeathEvent(ev);
      break;
    case 'card_draw':
      handleCardDrawEvent(ev);
      break;
    case 'card_use':
      handleCardUseEvent(ev);
      break;
    case 'combat_start':
      handleCombatStartEvent(ev);
      break;
    case 'combat_summary':
      handleCombatSummaryEvent(ev);
      break;
    case 'combat_cancel':
      handleCombatCancelEvent(ev);
      break;
    case 'giant_ability':
      handleGiantAbilityEvent(ev);
      break;
    case 'mission_start':
      handleMissionStartEvent(ev);
      break;
    case 'spawn_giant':
      handleSpawnGiantEvent(ev);
      break;
    case 'round_start':
      handleRoundStartEvent(ev);
      break;
    case 'giants_move':
      handleGiantsMoveEvent(ev);
      break;
    case 'log':
      handleLogEvent(ev);
      break;
    default:
      break;
  }
}

function handleAttackEvent(ev) {
  const effect = ev.payload?.effect;
  if (effect === 'slash') {
    swordSlash({
      angle: 'right-down', thickness: 24, glow: 22, length: 1.2,
      splatter: 0.8, centerSafe: true, safeInset: 0.24
    });
    try { playSfx('./assets/sounds/attacco_uomo.mp3', { volume: 0.6 }); } catch { }
    return;
  }
  if (effect === 'giant') {
    bloodHitClean({
      side: 'right', intensity: 1.0, density: 1.2,
      safeInset: 0.26, duration: 120, fadeAfter: 1400, fadeMs: 650
    });
    giantFallQuake({ delayMs: 0, intensity: 22 });
    try { playSfx('./assets/sounds/attacco_gigante.mp3', { volume: 0.6 }); } catch { }
    return;
  }
  if (effect === 'wall') {
    wallCollapse({
      intensity: 24,
      debrisCount: 140,
      durationMs: 1800,
      emitBand: 'top',
      bandHeight: 0.22
    });
    try { playSfx('./assets/sounds/colpo_mura.mp3', { volume: 0.6 }); } catch { }
  }
}

function handleDeathEvent(ev) {
  const role = ev.payload?.role;
  const name = ev.payload?.name || 'Unità';
  if (role === 'enemy') {
    showVictoryScreen({
      text: 'VITTORIA',
      subtext: `${name} è stato abbattuto!`,
      confetti: false,
      autoDismissMs: 3000
    });
    setTimeout(() => {
      giantFallQuake({ delayMs: 0, intensity: 24 });
      giantDust({
        delayMs: 300,
        plumeCount: 120,
        durationMs: 2000,
        ringLife: 900,
        wind: 0.08,
        tone: '#a78b6d'
      });
    }, 800);
    log(`${name} è morto.`, 'success', 2500, true);
    return;
  }
  if (role === 'wall') {
    wallCollapse({
      intensity: 24,
      debrisCount: 140,
      durationMs: 1800,
      emitBand: 'top',
      bandHeight: 0.22
    });
  }
  showDeathScreen({
    text: `${name} è stato distrutto`,
    effect: 'chroma',
    skullOpacity: 0.13,
    skullScale: 1.0,
    blur: 2,
    allowDismiss: false,
    autoDismissMs: 3000,
  });
  log(`${name} è morto/a.`, 'error', 2500, true);
}

function handleCardDrawEvent(ev) {
  const deckType = ev.payload?.deckType || 'event';
  showCardDrawEffect();
  log(`Un compagno ha pescato una carta ${deckType}.`, 'info', 2500, true);
}

function handleCardUseEvent(ev) {
  const effect = ev.payload?.effect || 'use';
  if (effect === 'spawn') {
    lightningStrike();
    setTimeout(() => lightningStrike({ angleDeg: 80 }), 140);
    setTimeout(() => lightningStrike({ angleDeg: 100 }), 280);
    log('Un compagno ha attivato una carta spawn.', 'warning', 2500, true);
    return;
  }
  const kind = ev.payload?.kind || 'event';
  showCardUseEffect(kind);
  log('Un compagno ha attivato una carta.', 'info', 2500, true);
}

function handleSpawnGiantEvent(ev) {
  const sfx = ev.payload?.sfx;
  const bg = ev.payload?.bg;
  if (sfx) {
    try { playSfx(sfx, { volume: 0.3, loop: false }); } catch { }
  }
  if (bg) {
    try { playBg(bg); } catch { }
  }
}

function handleRoundStartEvent(ev) {
  const round = ev.payload?.round;
  showWarningC({
    text: 'INIZIO ROUND',
    subtext: round ? `Sta per cominciare il ${round} round!` : 'Sta per cominciare un nuovo round!',
    theme: 'violet',
    ringAmp: 1.0,
    autoDismissMs: 3000
  });
}

function handleGiantsMoveEvent(ev) {
  showWarningC({
    text: 'ATTENZIONE',
    subtext: 'I giganti iniziano a muoversi...',
    theme: 'red',
    ringAmp: 1.0,
    autoDismissMs: 2500
  });
  const sfx = ev.payload?.sfx;
  if (sfx) {
    try { playSfx(sfx, { volume: 1, loop: false }); } catch { }
  }
}

function handleMissionStartEvent(ev) {
  showWarningC({
    text: ev.payload?.text || 'MISSIONE INIZIATA',
    subtext: ev.payload?.subtext || '',
    theme: ev.payload?.theme || 'green',
    ringAmp: 1.0,
    autoDismissMs: 2500
  });
}

function handleCombatStartEvent(ev) {
  const attackerId = ev.payload?.attackerId;
  const targetId = ev.payload?.targetId;
  const attacker = getUnitById(attackerId);
  const defender = getUnitById(targetId);
  if (!attacker || !defender) return;

  hideAttackSummaryOverlay();
  showVersusOverlay(attacker, defender, { duration: 0 });
  combatWaitHandle?.close?.();
  combatWaitHandle = showCombatWaitOverlay({
    title: 'Scontro in corso',
    subtitle: 'Attendi il risultato...'
  });
}

function handleCombatSummaryEvent(ev) {
  const attackerId = ev.payload?.attackerId;
  const targetId = ev.payload?.targetId;
  const attacker = getUnitById(attackerId);
  const defender = getUnitById(targetId);
  if (!attacker || !defender) return;

  combatWaitHandle?.close?.();
  combatWaitHandle = null;
  hideVersusOverlay();

  const badgeText = ev.payload?.badgeText || 'Esito';
  const lines = Array.isArray(ev.payload?.summaryLines) ? ev.payload.summaryLines : [];
  const roll = ev.payload?.roll;
  const rollText = roll?.d20 != null ? `🎲 d20: ${roll.d20} (totale ${roll.total})` : '';

  showAttackSummaryOverlay(attacker, defender, {
    badgeText,
    lines,
    rollText,
    autoHideMs: 4500
  });

  if (roll?.d20 != null) {
    log(`Risultato d20: ${roll.d20} (totale ${roll.total}).`, 'info', 3500, true);
  }
}

function handleCombatCancelEvent() {
  combatWaitHandle?.close?.();
  combatWaitHandle = null;
  hideVersusOverlay();
  hideAttackSummaryOverlay();
  log('Scontro annullato.', 'warning', 2500, true);
}

function handleGiantAbilityEvent(ev) {
  const name = ev.payload?.name || 'Abilità';
  showWarningC({
    text: "ABILITA' ATTIVATA",
    subtext: `${name}`,
    theme: 'orange',
    ringAmp: 1.0,
    autoDismissMs: 3000
  });
  const sfx = ev.payload?.sfx;
  if (sfx) {
    try { playSfx(sfx, { volume: 0.9 }); } catch { }
  }
}

function handleLogEvent(ev) {
  const msg = ev.payload?.msg;
  if (!msg) return;
  const type = ev.payload?.type || 'info';
  const time = ev.payload?.time ?? 3000;
  log(msg, type, time, false, false);
}
