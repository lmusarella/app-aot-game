import { getMusicUrlById } from '../utils.js';
import { playBg } from '../../view-components/audio/audio.js';

const PHASE_TRACKS = {
  setup: './assets/sounds/giganti_puri.mp3',
  move_phase: './assets/sounds/commander_march_sound.mp3',
  attack_phase: './assets/sounds/start_mission.mp3'
};

function pickGiantTrack(ids, fallback) {
  for (const id of ids) {
    const track = getMusicUrlById(id);
    if (track) return track;
  }
  return fallback;
}

function getEventCardTrack(ids, spawnEvents) {
  if (spawnEvents.some(event => event === 'Anomalo')) {
    return pickGiantTrack(ids, './assets/sounds/ape_titan_sound.mp3');
  }
  if (spawnEvents.some(event => event === 'Mutaforma')) {
    return pickGiantTrack(ids, './assets/sounds/start_app.mp3');
  }
  if (spawnEvents.every(event => event === 'Puro')) {
    return './assets/sounds/start_app.mp3';
  }
  return null;
}

export async function playPhaseMusic(phase, { giantsRoster = [], mission } = {}) {
  if (phase === 'event_card') {
    const ids = giantsRoster.map(giant => giant.id);
    const spawnEvents = mission?.event_spawn || [];
    const track = getEventCardTrack(ids, spawnEvents);
    if (track) await playBg(track);
    return;
  }

  const track = PHASE_TRACKS[phase];
  if (track) {
    await playBg(track);
  }
}
