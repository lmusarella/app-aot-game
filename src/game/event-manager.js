import { APP_STATE } from '../core/app-state.js';
import { GAME_STATE } from '../core/data.js';
import { log } from '../core/log.js';
import { playSfx } from '../game-components/audio/audio.js';
import swordSlash from './effects/swordSlash.js';
import bloodHitClean from './effects/bloodHitClean.js';
import wallCollapse from './effects/wallCollapse.js';
import { giantFallQuake } from './effects/screenQuake.js';
import { giantDust } from './effects/giantDust.js';
import showDeathScreen from './effects/deathOverlay.js';
import showVictoryScreen from './effects/victoryOverlay.js';

const processedIds = new Set();
const MAX_EVENTS = 50;

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
