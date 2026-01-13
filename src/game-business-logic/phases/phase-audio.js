import { getMusicUrlById } from '../utils.js';
import { playBg } from '../../view-components/audio/audio.js';

export async function playPhaseMusic(phase, { giantsRoster = [], mission } = {}) {
    if (phase === 'setup') {
        await playBg('./assets/sounds/giganti_puri.mp3');
    }
    if (phase === 'move_phase') {
        await playBg('./assets/sounds/commander_march_sound.mp3');
    }
    if (phase === 'attack_phase') {
        await playBg('./assets/sounds/start_mission.mp3');
    }
    if (phase === 'event_card') {
        const ids = giantsRoster.map(giant => giant.id);
        const spawnEvents = mission?.event_spawn || [];

        if (spawnEvents.every(event => event === "Puro")) {
            await playBg('./assets/sounds/start_app.mp3');
        }
        if (spawnEvents.some(event => event === "Anomalo")) {
            await playBg(getMusicUrlById(ids.find(id => getMusicUrlById(id))) || './assets/sounds/ape_titan_sound.mp3');
        }
        if (spawnEvents.some(event => event === "Mutaforma")) {
            await playBg(getMusicUrlById(ids.find(id => getMusicUrlById(id))) || './assets/sounds/start_app.mp3');
        }
    }
}
