import { advanceAllCooldowns, giantsPhaseMove, spawnGiant, tickUnitModsOnNewRound, pickRandomTeam } from './entity.js';
import { getMusicUrlById, wait } from './utils.js';
import { openAccordionForRole } from './ui.js';
import { playBg, playSfx } from './audio.js';
import { showDrawnCard, closeAllFabs, drawCard } from './fab.js';
import { DB, GAME_STATE, scheduleSave } from './data.js';
import { missionStatsBumpAttempt, missionStatsSetRound } from './missions.js';
import { stopTimer, startTimer } from "./header.js";
import { log } from "./log.js";
import showPhaseBanner from './effects/phaseBanner.js';
import showWarningC from './effects/warningOverlayC.js';
import lightningStrike from './effects/lightningStrike.js';

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

            showWarningC({
                text: 'MISSIONE INIZIATA',
                subtext: '',
                theme: 'green',
                ringAmp: 1.0,
                autoDismissMs: 2500
            });

            setTimeout(() => {
                // Esempio: fase combattimento
                showPhaseBanner({
                    text: 'FASE DI MOVIMENTO',
                    subtext: `Posiziona la tua squadra in griglia`,
                    theme: 'blue',
                    autoDismissMs: 3500
                });

                if (!this.teamCreated) {
                    try {
                        pickRandomTeam({ commanders: 1, recruits: 3 });
                        openAccordionForRole('commander');
                        this.squadNumber = 4;
                    } catch { }
                    this.teamCreated = true;
                } else {
                    log('Setup: Hai 3 movimenti disponibili per unità, poi premi "Termina Setup".', 'info', 3000, true);
                }
            }, 2500)
        }

        if (phase === 'event_card') {
            const card = drawCard('event');

            if (!card) {
                log('Il mazzo è vuoto. Rimescola gli scarti o ricarica le carte.', 'warning', 3000, true);
                closeAllFabs();
                return;
            }
            log(`Pescata carta evento: "${card.name}".`, 'info', 3000, true);
            await playSfx('assets/sounds/carte/carta_evento.mp3', { volume: 0.3, loop: false });

            showDrawnCard('event', card);
            this.eventCards++;

            if (this.eventCards === this.squadNumber) {
                this.setPhase('round_start');
            } else {
                log(`Carte evento da pescare rimaste: "${this.squadNumber - this.eventCards}".`, 'info', 6000, true);
            }
        }

        if (phase === 'round_start') {
            this.round++;
            showWarningC({
                text: 'INIZIO ROUND',
                subtext: `Sta per cominciare il ${this.round} round!`,
                theme: 'violet',
                ringAmp: 1.0,
                autoDismissMs: 3000
            });
            await playBg('./assets/sounds/commander_march_sound.mp3');

            setTimeout(async () => {
                this.setPhase('move_phase');
                showPhaseBanner({
                    text: 'FASE DI MOVIMENTO',
                    subtext: `Round ${this.round}. Effettua una azione di movimento per unità.`,
                    theme: 'blue',
                    autoDismissMs: 6000
                });
                startTimer();
                advanceAllCooldowns(1, { giantsOnly: true });
                tickUnitModsOnNewRound();
                missionStatsSetRound(this.round);
            }, 3000)
        }
    },

    async endPhase(phase) {
        if (phase === 'setup') {
            const flagAlleatoInGriglia = GAME_STATE.alliesRoster.some(ally => GAME_STATE.spawns.some(s => (s.unitIds ?? []).includes(ally.id)));

            if (flagAlleatoInGriglia) {
                this.setPhase('event_card');

                showWarningC({
                    text: 'ATTENZIONE',
                    subtext: 'Sono stati avvistati dei giganti...',
                    theme: 'red',
                    ringAmp: 1.0,
                    autoDismissMs: 3000
                });

                setTimeout(async () => {
                    const m = DB.MISSIONS[GAME_STATE.missionState.curIndex];
                    const spawnEvents = m.event_spawn;
                    const ids = [];
                    if (spawnEvents && spawnEvents.length > 0) {

                        for (const event of spawnEvents) {
                            const id = await spawnGiant(event, true);
                            ids.push(id);
                        }

                        await playSfx('./assets/sounds/flash_effect_sound.mp3', { volume: 0.3, loop: false });
                        lightningStrike();
                        setTimeout(() => lightningStrike({ angleDeg: 80 }), 140);
                        setTimeout(() => lightningStrike({ angleDeg: 100 }), 280);

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

                    showPhaseBanner({
                        text: 'PESCA CARTE EVENTO',
                        subtext: `Pesca una carta evento per ogni membro della squadra`,
                        theme: 'green',
                        autoDismissMs: 3500
                    });

                }, 3000)


            } else {
                log(`Setup Missione: Trascina almeno un'unità della tua squadra in campo`, 'info', 6000, true);
            }
        }

        if (phase === 'move_phase') {
            giantsPhaseMove();
            await wait(2500);
            this.setPhase('attack_phase');
            showPhaseBanner({
                text: 'FASE DI COMBATTIMENTO',
                subtext: `Round ${this.round}. Scegli i bersagli che ingaggeranno battaglia`,
                theme: 'red',
                autoDismissMs: 6000
            });
            await playBg('./assets/sounds/start_mission.mp3');
        }

        if (phase === 'attack_phase') {
            this.setPhase('round_start');
            showPhaseBanner({
                text: 'FASE FINALE',
                subtext: `${this.round}° ROUND`,
                theme: 'neutral',
                autoDismissMs: 6000
            });

            const flagTempoNonScaduto = GAME_STATE.missionState.remainingSec;
            if (this.round % 2 === 0 || flagTempoNonScaduto === 0) {
                const card = drawCard('event');

                if (!card) {
                    log('Il mazzo è vuoto. Rimescola gli scarti o ricarica le carte.', 'warning', 3000, true);
                    closeAllFabs();
                    return;
                }
                log(`Pescata carta evento: "${card.name}".`, 'info', 3000, true);
                await playSfx('assets/sounds/carte/carta_evento.mp3', { volume: 0.3, loop: false });

                showDrawnCard('event', card);
            }

        }

        if (phase === 'end_round') {
            this.setPhase('round_start');
            showPhaseBanner({
                text: 'INIZIO ROUND',
                subtext: `Round "${this.round}".`,
                theme: 'green',
                autoDismissMs: 2000
            });
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
        btnStart.dataset.mode = 'start';
        btnStart.textContent = 'PESCA EVENTO';
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
