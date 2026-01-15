import { advanceAllCooldowns, giantsPhaseMove, spawnGiant, tickUnitModsOnNewRound, pickRandomTeam } from './entity/entity.js';
import { wait } from './utils.js';
import { openAccordionForRole } from '../ui-components/ui-helpers.js';
import { playBg, playSfx } from '../view-components/audio/audio.js';
import { showDrawnCard, closeAllFabs, drawCard } from '../view-components/fabs/fab.js';
import { DB, GAME_STATE } from '../core/data.js';

import { missionStatsBumpAttempt, missionStatsSetRound } from '../view-components/leftbar/missions.js';
import { stopTimer, startTimer, renderPhaseLabel } from "../view-components/header/header.js";
import { log } from "../view-components/leftbar/log.js";
import showPhaseBanner from './effects/phaseBanner.js';
import showWarningC from './effects/warningOverlayC.js';
import lightningStrike from './effects/lightningStrike.js';
// in cima
import { guardCommanderAction, isCommander } from '../core/permissions.js';
import { APP_STATE } from '../core/app-state.js';
import { getTurnInfo, ensureMultiplayerTurnOrder } from './turn-tracker.js';
import { scheduleSave } from './game-sync.js';
import { applyPhaseUI, renderStartButton } from './phases/phase-ui.js';
import { handleMultiplayerPhaseEnd, isMultiplayer } from './phases/phase-multiplayer.js';
import { playPhaseMusic } from './phases/phase-audio.js';
import { pushGameEvent } from './event-manager.js';

let btnStart = null;

async function runRoundStart(engine) {
    engine.round++;
    showWarningC({
        text: 'INIZIO ROUND',
        subtext: `Sta per cominciare il ${engine.round} round!`,
        theme: 'violet',
        ringAmp: 1.0,
        autoDismissMs: 3000
    });
    if (APP_STATE.gameMode === 'multiplayer') {
        pushGameEvent('round_start', { round: engine.round });
    }
    await playBg('./assets/sounds/commander_march_sound.mp3');

    setTimeout(() => {
        engine.setPhase('move_phase');
        showPhaseBanner({
            text: 'FASE DI MOVIMENTO',
            subtext: `Round ${engine.round}. Effettua una azione di movimento per unità.`,
            theme: 'blue',
            autoDismissMs: 6000
        });
        startTimer();
        advanceAllCooldowns(1, { giantsOnly: true });
        tickUnitModsOnNewRound();
        missionStatsSetRound(engine.round);
    }, 3000);
}

async function handleMultiplayerStartPhase(phase, engine) {
    const ts = GAME_STATE.turnState || {};
    if (phase === 'idle') {
        ensureMultiplayerTurnOrder({ resetToCommander: true });
        engine.setPhase('setup');
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
        pushGameEvent('mission_start', {
            text: 'MISSIONE INIZIATA',
            subtext: '',
            theme: 'green'
        });

        setTimeout(() => {
            showPhaseBanner({
                text: 'FASE DI SETUP',
                subtext: 'Posiziona le truppe e termina il setup.',
                theme: 'blue',
                autoDismissMs: 3500
            });

            if (!engine.teamCreated) {
                try {
                    const rosterCount = GAME_STATE.alliesRoster?.length || 0;
                    const playersCount = APP_STATE.roomPlayers?.length || 0;
                    engine.squadNumber = Math.max(1, rosterCount || playersCount || 0);
                    engine.teamCreated = true;
                } catch { }
            }
        }, 2500);
        return;
    }

    if (phase === 'setup' && ts.phaseReady) {
        const playersCount = Array.isArray(APP_STATE.roomPlayers) ? APP_STATE.roomPlayers.length : 0;
        const turnOrderCount = Array.isArray(ts.order) ? ts.order.length : 0;
        engine.squadNumber = Math.max(1, turnOrderCount || playersCount || 0);
        engine.eventCards = 0;
        engine.setPhase('event_card');
        showPhaseBanner({
            text: 'PESCA CARTE EVENTO',
            subtext: 'Pesca una carta evento per ogni giocatore.',
            theme: 'green',
            autoDismissMs: 3500
        });
        startTimer();
        const m = DB.MISSIONS[GAME_STATE.missionState.curIndex];
        const spawnEvents = m?.event_spawn || [];
        if (spawnEvents.length > 0) {
            showWarningC({
                text: 'ATTENZIONE',
                subtext: 'Sono stati avvistati dei giganti...',
                theme: 'red',
                ringAmp: 1.0,
                autoDismissMs: 3000
            });
            pushGameEvent('warning', {
                text: 'ATTENZIONE',
                subtext: 'Sono stati avvistati dei giganti...',
                theme: 'red'
            });
            await wait(3000);
            for (const event of spawnEvents) {
                await spawnGiant(event);
            }
            openAccordionForRole("enemy");
        }
    }

    if (phase === 'event_card' && ts.phaseReady) {
        engine.setPhase('round_start');
        await runRoundStart(engine);
    }

    if (phase === 'round_start') {
        await runRoundStart(engine);
    }

    if (phase === 'move_phase' && ts.phaseReady) {
        giantsPhaseMove();
        ensureMultiplayerTurnOrder({ resetToCommander: true });
        await wait(2500);
        engine.setPhase('attack_phase');
        showPhaseBanner({
            text: 'FASE DI COMBATTIMENTO',
            subtext: `Round ${engine.round}. Scegli i bersagli che ingaggeranno battaglia`,
            theme: 'red',
            autoDismissMs: 6000
        });
        await playBg('./assets/sounds/start_mission.mp3');
    }
}

async function handleSingleStartPhase(phase, engine) {
    if (phase === 'idle') {
        engine.setPhase('setup');
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
        pushGameEvent('mission_start', {
            text: 'MISSIONE INIZIATA',
            subtext: '',
            theme: 'green'
        });

        setTimeout(() => {
            showPhaseBanner({
                text: 'FASE DI MOVIMENTO',
                subtext: 'Posiziona la tua squadra in griglia',
                theme: 'blue',
                autoDismissMs: 3500
            });
            log('Setup: Puoi trascinare la tua unità nelle prime due file davanti alle mura. Hai 3 movimenti disponibili e puoi muoverti di un esagono adiacente alla volta.', 'info', 4000, true);

            if (!engine.teamCreated) {
                try {
                    pickRandomTeam({ commanders: 1, recruits: 3 });
                    openAccordionForRole('commander');
                    engine.squadNumber = 4;
                    engine.teamCreated = true;
                } catch { }
            } else {
                log('Setup: Hai 3 movimenti disponibili per unità, poi premi "Termina Setup".', 'info', 3000, true);
            }
        }, 2500);
        return;
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
        engine.eventCards++;

        if (engine.eventCards === engine.squadNumber) {
            engine.setPhase('round_start');
        } else {
            log(`Carte evento da pescare rimaste: "${engine.squadNumber - engine.eventCards}".`, 'info', 6000, true);
        }
    }

    if (phase === 'round_start') {
        await runRoundStart(engine);
    }
}

async function handleSingleEndPhase(phase, engine) {
    if (phase === 'setup') {
        const flagAlleatoInGriglia = GAME_STATE.alliesRoster.some(ally => GAME_STATE.spawns.some(s => (s.unitIds ?? []).includes(ally.id)));

        if (flagAlleatoInGriglia) {
            engine.setPhase('event_card');

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
                    subtext: 'Pesca una carta evento per ogni membro della squadra',
                    theme: 'green',
                    autoDismissMs: 3500
                });

            }, 3000);


        } else {
            log(`Setup Missione: Trascina almeno un'unità della tua squadra in campo`, 'info', 6000, true);
        }
    }

    if (phase === 'move_phase') {
        giantsPhaseMove();
        await wait(2500);
        engine.setPhase('attack_phase');
        showPhaseBanner({
            text: 'FASE DI COMBATTIMENTO',
            subtext: `Round ${engine.round}. Scegli i bersagli che ingaggeranno battaglia`,
            theme: 'red',
            autoDismissMs: 6000
        });
        await playBg('./assets/sounds/start_mission.mp3');
    }

    if (phase === 'attack_phase') {
        engine.setPhase('round_start');
        showPhaseBanner({
            text: 'FASE FINALE',
            subtext: `${engine.round}° ROUND`,
            theme: 'neutral',
            autoDismissMs: 6000
        });

        const flagTempoNonScaduto = GAME_STATE.missionState.remainingSec;
        if (engine.round % 2 === 0 || flagTempoNonScaduto === 0) {
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
        engine.setPhase('round_start');
        showPhaseBanner({
            text: 'INIZIO ROUND',
            subtext: `Round "${engine.round}".`,
            theme: 'green',
            autoDismissMs: 2000
        });
        await playBg('./assets/sounds/start_mission.mp3');
    }
}

export function initPhasesListeners() {
  btnStart = document.getElementById('btn-start');
  btnStart?.addEventListener('click', async () => {
    const mode = btnStart.dataset.mode;

    if (mode === 'start') {
      if (!guardCommanderAction('cambiare fase')) {
        return;
      }
      const { isMyTurn } = getTurnInfo();
      const commanderCanAdvance = isMultiplayer()
        && GAME_STATE.turnState?.phaseReady
        && isCommander();
      if (!isMyTurn && !commanderCanAdvance) {
        log('Non è il tuo turno.', 'warning', 3000, true);
        return;
      }
      await GAME_STATE.turnEngine.startPhase(TurnEngine.phase);
      scheduleSave('phase-change');
      return;
    }
    if (mode === 'end') {
      if (!isMultiplayer() && !guardCommanderAction('cambiare fase')) {
        return;
      }
      const { isMyTurn } = getTurnInfo();
      if (!isMyTurn) {
        log('Non è il tuo turno.', 'warning', 3000, true);
        return;
      }
      if (isMultiplayer()) {
        await handleMultiplayerPhaseEnd(TurnEngine.phase);
        return;
      }
      await GAME_STATE.turnEngine.endPhase(TurnEngine.phase);
      scheduleSave('phase-change');
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
        const { isMyTurn } = getTurnInfo();
        renderStartButton(btnStart, {
            phase: this.phase,
            round: this.round,
            isMultiplayer: isMultiplayer(),
            isMyTurn,
            phaseReady: !!GAME_STATE.turnState?.phaseReady,
            isCommander: isCommander()
        });
        renderPhaseLabel();

        if (this.phase !== 'idle') {
            stopTimer();
            startTimer()
        }
    },

    async setPhaseMusic() {
        const mission = DB.MISSIONS[GAME_STATE.missionState.curIndex];
        await playPhaseMusic(this.phase, { giantsRoster: GAME_STATE.giantsRoster, mission });
    },

    setPhase(p) {
        this.phase = p;
        document.body.dataset.phase = p; // utile anche per CSS mirato
        applyPhaseUI(p);
        if (p === 'setup') {
            GAME_STATE.setupMoves = {};
        }
        const { isMyTurn } = getTurnInfo();
        renderStartButton(btnStart, {
            phase: p,
            round: this.round,
            isMultiplayer: isMultiplayer(),
            isMyTurn,
            phaseReady: !!GAME_STATE.turnState?.phaseReady,
            isCommander: isCommander()
        });
        renderPhaseLabel();
        if (isMultiplayer()) {
            const ts = GAME_STATE.turnState || {};
            if (Array.isArray(ts.order) && ts.order.length > 0) {
                ts.currentIndex = 0;
                ts.currentPlayerId = ts.order[0] || null;
            }
            ts.phaseDoneBy = [];
            ts.phaseReady = false;
            ts.phase = p;
            GAME_STATE.turnState = ts;
        }
        //scheduleSave();
    },

    async startPhase(phase) {
        if (isMultiplayer()) {
            await handleMultiplayerStartPhase(phase, this);
            return;
        }
        await handleSingleStartPhase(phase, this);
    },

    async endPhase(phase) {
        if (isMultiplayer()) {
            return;
        }
        await handleSingleEndPhase(phase, this);
    }
};
