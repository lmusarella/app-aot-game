import { advanceAllCooldowns, giantsPhaseMove, spawnGiant, tickUnitModsOnNewRound, pickRandomTeam } from './entity.js';
import { getMusicUrlById } from './utils.js';
import { openAccordionForRole } from './ui.js';
import { playBg, playSfx } from './audio.js';
import { showDrawnCard, closeAllFabs, drawCard } from './fab.js';
import { DB, GAME_STATE, scheduleSave } from './data.js';
import { missionStatsBumpAttempt } from './missions.js';
import { stopTimer, startTimer } from "./header.js";
import { log } from "./log.js";

const PHASE_UI = {
    // cosa si vede in ciascuna fase (modifica liberamente i selettori!)
    idle: {
        show: [],
        hide: []
    },
    setup: {
        show: [],
        hide: ['.fab.spawn', '.fab.arruola', '.fab.event']
    },
    event_mission: {
        show: [],
        hide: ['.fab.spawn', '.fab.arruola', '.fab.event']
    },
    event_card: {
        show: [],
        hide: ['.fab.spawn', '.fab.arruola', '.fab.event']
    },
    round_start: {
        show: ['.fab.spawn', '.fab.event'],
        hide: ['.fab.arruola']
    },
    move_phase: {
        show: [],
        hide: ['.fab.spawn', '.fab.arruola', '.fab.event']
    },
    attack_phase: {
        show: [],
        hide: ['.fab.spawn', '.fab.arruola', '.fab.event']
    },
    end_round: {
        show: ['.fab.spawn', '.fab.event'],
        hide: ['.fab.arruola']
    }
};

const btnStart = document.getElementById('btn-start');

export function initPhasesListeners() {
    // click handler
    btnStart?.addEventListener('click', async () => {
        const mode = btnStart.dataset.mode;
        if (mode === 'start') {
            await GAME_STATE.turnEngine.startPhase(TurnEngine.phase);
        } else if (mode === 'end') {
            await GAME_STATE.turnEngine.endPhase(TurnEngine.phase);
        }
    });

}


export const TurnEngine = {
    phase: 'idle',   // 'idle' | 'setup' | 'round_start' | ...
    round: 0,
    teamCreated: false,
    eventCards: 0,
    squadNumber: 0,

    init() {
        document.body.dataset.phase = this.phase; // utile anche per CSS mirato
        applyPhaseUI(this.phase);
        renderStartBtn();

        if (this.phase !== 'idle') {
            stopTimer();
            startTimer()
        }
    },

    async setPhaseMusic() {
        if (this.phase === 'setup') {
            await playBg('./assets/sounds/giganti_puri.mp3');
        }
        if (this.phase === 'move_phase') {
            await playBg('./assets/sounds/commander_march_sound.mp3');
        }
        if (this.phase === 'attack_phase') {
            await playBg('./assets/sounds/start_mission.mp3');
        }
        if (this.phase === 'event_card') {
            const ids = giantsRoster.map(giant => giant.id);
            const m = DB.MISSIONS[GAME_STATE.missionState.curIndex];
            const spawnEvents = m.event_spawn;

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
    },

    setPhase(p) {
        this.phase = p;
        document.body.dataset.phase = p; // utile anche per CSS mirato
        applyPhaseUI(p);
        renderStartBtn();
        scheduleSave();
    },

    async startPhase(phase) {
        // entra in setup (senza limiti di movimento)

        if (phase === 'idle') {
            this.setPhase('setup');
            await playBg('./assets/sounds/giganti_puri.mp3');
            startTimer();
            missionStatsBumpAttempt();
            if (!this.teamCreated) {
                try {
                    pickRandomTeam({ commanders: 1, recruits: 3 });
                    openAccordionForRole('commander');
                    this.squadNumber = 4;
                } catch { }
                this.teamCreated = true;
                log('Setup: posiziona e sistema la squadra come vuoi con 3 movimenti disponibili per unità, poi premi "Termina Setup".', 'info', 6000);
            } else {
                log('Setup: Hai 3 movimenti disponibili per unità, poi premi "Termina Setup".', 'info');
            }
        }

        if (phase === 'event_mission') {
            this.setPhase('event_card');
            const m = DB.MISSIONS[GAME_STATE.missionState.curIndex];
            const spawnEvents = m.event_spawn;
            const ids = [];
            if (spawnEvents && spawnEvents.length > 0) {

                for (const event of spawnEvents) {
                    const id = await spawnGiant(event, true);
                    ids.push(id);
                }

                await playSfx('./assets/sounds/flash_effect_sound.mp3', { volume: 0.3, loop: false });

                if (spawnEvents.every(event => event === "Puro")) {
                    await playBg('./assets/sounds/start_app.mp3');
                }

                if (spawnEvents.some(event => event === "Anomalo")) {
                    await playBg(getMusicUrlById(ids.find(id => getMusicUrlById(id))) || './assets/sounds/ape_titan_sound.mp3');
                }

                if (spawnEvents.some(event => event === "Mutaforma")) {
                    await playBg(getMusicUrlById(ids.find(id => getMusicUrlById(id))) || './assets/sounds/start_app.mp3');
                }

                openAccordionForRole("enemy");
            }


        }

        if (phase === 'round_start') {
            this.setPhase('move_phase');
            startTimer();
            this.round++;
            log(`Round ${this.round} iniziato.`, 'success');
            advanceAllCooldowns(1, { giantsOnly: true });
            tickUnitModsOnNewRound();
            missionStatsSetRound(this.round);
            log(`Fase Movimento ${this.round}° ROUND: Effettua una azione di movimento per unità, poi clicca su Termina Fase Movimento`, 'info', 6000);
            await playBg('./assets/sounds/commander_march_sound.mp3');
        }
    },

    async endPhase(phase) {
        if (phase === 'setup') {
            const flagAlleatoInGriglia = GAME_STATE.alliesRoster.some(ally => GAME_STATE.spawns.some(s => (s.unitIds ?? []).includes(ally.id)));
            if (flagAlleatoInGriglia) {
                this.setPhase('event_mission');
                log(`Setup Missione: Clicca su Evento per generare lo spawn dei giganti associati alla missione`, 'info', 6000);
            } else {
                log(`Setup Missione: Trascina almeno un'unità della tua squadra in campo`, 'info', 6000);
            }
        }

        if (phase === 'event_card') {
            const card = drawCard('event');

            if (!card) {
                log('Il mazzo è vuoto. Rimescola gli scarti o ricarica le carte.', 'warning');
                closeAllFabs();
                return;
            }
            log(`Pescata carta evento: "${card.name}".`);
            await playSfx('assets/sounds/carte/carta_evento.mp3', { volume: 0.3, loop: false });

            showDrawnCard('event', card);
            this.eventCards++;

            if (this.eventCards === this.squadNumber) {
                this.setPhase('round_start');
            } else {
                log(`Carte evento da pescare rimaste: "${this.squadNumber - this.eventCards}".`, 'info', 6000);
            }
        }

        if (phase === 'move_phase') {
            log('I giganti iniziano a muoversi...', 'warning');
            giantsPhaseMove();
            this.setPhase('attack_phase');
            log(`Fase Attacco ${TurnEngine.round}° ROUND: Scegli i bersagli che ingaggeranno battaglia`, 'info', 6000);
            await playBg('./assets/sounds/start_mission.mp3');
        }

        if (phase === 'attack_phase') {
            this.setPhase('round_start');
            log(`Fase Finale ${TurnEngine.round}° ROUND`, 'info');

            const flagTempoNonScaduto = GAME_STATE.missionState.remainingSec;
            if (this.round % 2 === 0 || flagTempoNonScaduto === 0) {
                const card = drawCard('event');

                if (!card) {
                    log('Il mazzo è vuoto. Rimescola gli scarti o ricarica le carte.', 'warning');
                    closeAllFabs();
                    return;
                }
                log(`Pescata carta evento: "${card.name}".`);
                await playSfx('assets/sounds/carte/carta_evento.mp3', { volume: 0.3, loop: false });

                showDrawnCard('event', card);
            }

        }

        if (phase === 'end_round') {
            this.setPhase('round_start');
            await playBg('./assets/sounds/start_mission.mp3');
        }
    }
};
// Applica visibilità dai mapping sopra
function applyPhaseUI(phase) {
    const allSelectors = new Set();
    for (const p of Object.values(PHASE_UI)) {
        (p.show || []).forEach(s => allSelectors.add(s));
        (p.hide || []).forEach(s => allSelectors.add(s));
    }

    // reset: tutto visibile
    allSelectors.forEach(sel =>
        document.querySelectorAll(sel).forEach(el => el.classList.remove('is-hidden'))
    );

    // applica per la fase corrente
    const conf = PHASE_UI[phase] || {};
    (conf.hide || []).forEach(sel =>
        document.querySelectorAll(sel).forEach(el => el.classList.add('is-hidden'))
    );
    (conf.show || []).forEach(sel =>
        document.querySelectorAll(sel).forEach(el => el.classList.remove('is-hidden'))
    );
}


function renderStartBtn() {
    if (!btnStart) return;
    const p = TurnEngine.phase;
    if (p === 'idle') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'start';
        btnStart.textContent = 'INIZIA MISSIONE';
    } else if (p === 'setup') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'end';
        btnStart.textContent = 'TERMINA SETUP';
    } else if (p === 'event_mission') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'start';
        btnStart.textContent = 'EVENTO MISSIONE';
    } else if (p === 'event_card') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'end';
        btnStart.textContent = 'CARTA EVENTO';
    } else if (p === 'round_start') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'start';
        btnStart.textContent = `INIZIA ${TurnEngine.round + 1}° ROUND`;
    } else if (p === 'move_phase') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'end';
        btnStart.textContent = 'TERMINA FASE MOVIMENTO';
    } else if (p === 'attack_phase') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'end';
        btnStart.textContent = 'TERMINA FASE ATTACCO';
    } else if (p === 'end_round') {
        btnStart.hidden = false;
        btnStart.dataset.mode = 'end';
        btnStart.textContent = 'TERMINA ROUND';
    }
    else {
        btnStart.hidden = true; // nelle altre fasi non serve
    }
}
